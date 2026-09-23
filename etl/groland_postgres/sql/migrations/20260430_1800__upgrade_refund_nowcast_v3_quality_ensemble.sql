BEGIN;

ALTER TABLE ads.all_trade_overview_refund_nowcast_quality_daily
  ADD COLUMN IF NOT EXISTS model_version VARCHAR(64),
  ADD COLUMN IF NOT EXISTS zero_miss_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_quality_daily.model_version IS '质量评估对应的预测模型版本。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_quality_daily.zero_miss_count IS '预测为 0 但成熟观测退款大于 0 的样本数。';

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_refund_nowcast_daily(
  IN p_as_of_date DATE DEFAULT NULL,
  IN p_maturity_days INTEGER DEFAULT 21,
  IN p_history_days INTEGER DEFAULT 180
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_as_of_date DATE := COALESCE(p_as_of_date, CURRENT_DATE);
  v_history_days INTEGER := GREATEST(p_history_days, 180);
  v_model_version TEXT := format('v3_quality_ensemble_%sd', p_maturity_days);
  v_inserted_rows INTEGER := 0;
BEGIN
  IF p_maturity_days < 2 THEN
    RAISE EXCEPTION 'p_maturity_days must be >= 2';
  END IF;

  IF v_history_days < p_maturity_days THEN
    RAISE EXCEPTION 'effective history_days (%) must be >= p_maturity_days (%)', v_history_days, p_maturity_days;
  END IF;

  IF to_regclass('ads.all_trade_overview') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_overview does not exist';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_daily') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_overview_refund_nowcast_daily does not exist';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_event_calendar') IS NULL THEN
    RAISE EXCEPTION 'event calendar table ads.all_trade_overview_refund_nowcast_event_calendar does not exist';
  END IF;

  IF to_regclass('pg_temp.tmp_overview_nowcast_base') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_base';
  END IF;
  IF to_regclass('pg_temp.tmp_overview_nowcast_curve') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_curve';
  END IF;
  IF to_regclass('pg_temp.tmp_overview_nowcast_platform_stats') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_platform_stats';
  END IF;
  IF to_regclass('pg_temp.tmp_overview_nowcast_weekday_stats') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_weekday_stats';
  END IF;
  IF to_regclass('pg_temp.tmp_overview_nowcast_rows') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_rows';
  END IF;

  CREATE TEMP TABLE tmp_overview_nowcast_base ON COMMIT DROP AS
  SELECT
    t."date",
    t.platform,
    COALESCE(t.gmv, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(t.order_count, 0)::BIGINT AS order_count,
    COALESCE(t.buyer_count, 0)::BIGINT AS buyer_count,
    COALESCE(t.refund_amount_pay_time, 0)::NUMERIC(18, 2) AS current_value,
    COALESCE(t.refund_amount_refund_time, 0)::NUMERIC(18, 2) AS refund_amount_refund_time
  FROM ads.all_trade_overview t
  WHERE t."date" BETWEEN (v_as_of_date - v_history_days) AND v_as_of_date
    AND t.platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs');

  CREATE TEMP TABLE tmp_overview_nowcast_curve ON COMMIT DROP AS
  WITH matured_snapshot AS (
    SELECT
      n."date",
      n.platform,
      MAX(n.as_of_date) AS final_as_of_date
    FROM ads.all_trade_overview_refund_nowcast_daily n
    WHERE n.as_of_date <= v_as_of_date
      AND (n.as_of_date - n."date") >= p_maturity_days
    GROUP BY n."date", n.platform
  ),
  matured_final AS (
    SELECT
      m."date",
      m.platform,
      m.final_as_of_date,
      h.refund_amount_pay_time_current AS final_value
    FROM matured_snapshot m
    JOIN ads.all_trade_overview_refund_nowcast_daily h
      ON h."date" = m."date"
     AND h.platform = m.platform
     AND h.as_of_date = m.final_as_of_date
    WHERE h.refund_amount_pay_time_current > 0
  ),
  history_ratios AS (
    SELECT
      h.platform,
      (h.as_of_date - h."date") AS age_days,
      LEAST(
        1.0::NUMERIC,
        GREATEST(
          0.0::NUMERIC,
          h.refund_amount_pay_time_current / NULLIF(f.final_value, 0)
        )
      ) AS ratio
    FROM ads.all_trade_overview_refund_nowcast_daily h
    JOIN matured_final f
      ON f."date" = h."date"
     AND f.platform = h.platform
    WHERE h.as_of_date <= f.final_as_of_date
      AND (h.as_of_date - h."date") BETWEEN 0 AND (p_maturity_days - 1)
  )
  SELECT
    r.platform,
    r.age_days,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY r.ratio)::NUMERIC(10, 6) AS ratio_p50,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY r.ratio)::NUMERIC(10, 6) AS ratio_p75,
    COUNT(*)::INTEGER AS sample_count
  FROM history_ratios r
  GROUP BY r.platform, r.age_days;

  CREATE TEMP TABLE tmp_overview_nowcast_platform_stats ON COMMIT DROP AS
  WITH platform_defaults AS (
    SELECT *
    FROM (
      VALUES
        ('douyin', 0.60::NUMERIC, 0.52::NUMERIC, 1.10::NUMERIC, 0.0800::NUMERIC, 0.0060::NUMERIC, 0.45::NUMERIC),
        ('jd', 0.72::NUMERIC, 0.60::NUMERIC, 1.20::NUMERIC, 0.0500::NUMERIC, 0.0030::NUMERIC, 0.35::NUMERIC),
        ('taobao', 0.62::NUMERIC, 0.58::NUMERIC, 1.00::NUMERIC, 0.1800::NUMERIC, 0.0100::NUMERIC, 0.55::NUMERIC),
        ('wx', 0.74::NUMERIC, 0.62::NUMERIC, 1.25::NUMERIC, 0.0600::NUMERIC, 0.0030::NUMERIC, 0.35::NUMERIC),
        ('xhs', 0.76::NUMERIC, 0.64::NUMERIC, 1.20::NUMERIC, 0.1000::NUMERIC, 0.0040::NUMERIC, 0.85::NUMERIC)
    ) AS t(
      platform,
      prior_start_ratio,
      prior_floor_ratio,
      prior_power,
      fallback_positive_refund_rate,
      min_expected_refund_rate,
      cap_fallback_rate
    )
  ),
  mature_hist AS (
    SELECT
      t."date",
      t.platform,
      EXTRACT(DOW FROM t."date")::INTEGER AS dow,
      COALESCE(t.gmv, 0)::NUMERIC(18, 2) AS gmv,
      COALESCE(t.refund_amount_pay_time, 0)::NUMERIC(18, 2) AS refund_amount_pay_time,
      LEAST(
        1.2::NUMERIC,
        GREATEST(
          0.0::NUMERIC,
          COALESCE(t.refund_amount_pay_time, 0)::NUMERIC / NULLIF(COALESCE(t.gmv, 0)::NUMERIC, 0)
        )
      ) AS refund_rate_pay
    FROM ads.all_trade_overview t
    WHERE t."date" BETWEEN (v_as_of_date - v_history_days) AND (v_as_of_date - p_maturity_days)
      AND t.platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs')
      AND COALESCE(t.gmv, 0) > 0
  ),
  platform_activity AS (
    SELECT
      h.platform,
      COUNT(*)::INTEGER AS mature_gmv_days,
      COUNT(*) FILTER (WHERE h.refund_amount_pay_time > 0)::INTEGER AS mature_refund_days,
      (
        COUNT(*) FILTER (WHERE h.refund_amount_pay_time > 0)::NUMERIC
        / NULLIF(COUNT(*)::NUMERIC, 0)
      )::NUMERIC(10, 6) AS refund_probability
    FROM mature_hist h
    GROUP BY h.platform
  ),
  positive_rate_stats AS (
    SELECT
      h.platform,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY h.refund_rate_pay)::NUMERIC(10, 6) AS p50_positive_rate,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY h.refund_rate_pay)::NUMERIC(10, 6) AS p75_positive_rate,
      percentile_cont(0.90) WITHIN GROUP (ORDER BY h.refund_rate_pay)::NUMERIC(10, 6) AS p90_positive_rate,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY h.refund_rate_pay)::NUMERIC(10, 6) AS p95_positive_rate
    FROM mature_hist h
    WHERE h.refund_amount_pay_time > 0
    GROUP BY h.platform
  ),
  recent_positive_rate_stats AS (
    SELECT
      h.platform,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY h.refund_rate_pay)::NUMERIC(10, 6) AS recent_p50_positive_rate
    FROM mature_hist h
    WHERE h.refund_amount_pay_time > 0
      AND h."date" >= (v_as_of_date - GREATEST(p_maturity_days * 3, 45))
    GROUP BY h.platform
  ),
  recent_quality AS (
    SELECT
      q.platform,
      COUNT(*)::INTEGER AS quality_sample_count,
      percentile_cont(0.50) WITHIN GROUP (
        ORDER BY GREATEST(
          0.55::NUMERIC,
          LEAST(
            1.25::NUMERIC,
            q.actual_total / NULLIF(q.predicted_total, 0)
          )
        )
      )::NUMERIC(10, 6) AS p50_actual_over_pred
    FROM ads.all_trade_overview_refund_nowcast_quality_daily q
    WHERE q.eval_age_days IN (1, 3, 7, 14)
      AND q.as_of_date BETWEEN (v_as_of_date - 60) AND (v_as_of_date - 1)
      AND q.predicted_total > 0
      AND q.actual_total > 0
    GROUP BY q.platform
  )
  SELECT
    d.platform,
    d.prior_start_ratio,
    d.prior_floor_ratio,
    d.prior_power,
    COALESCE(a.mature_gmv_days, 0) AS mature_gmv_days,
    COALESCE(a.mature_refund_days, 0) AS mature_refund_days,
    COALESCE(q.quality_sample_count, 0) AS quality_sample_count,
    GREATEST(
      0.05::NUMERIC,
      LEAST(1.0::NUMERIC, COALESCE(a.refund_probability, 0.0::NUMERIC))
    )::NUMERIC(10, 6) AS refund_probability,
    GREATEST(
      d.min_expected_refund_rate,
      LEAST(
        0.85::NUMERIC,
        COALESCE(r.recent_p50_positive_rate, p.p50_positive_rate, d.fallback_positive_refund_rate)
        * GREATEST(0.05::NUMERIC, COALESCE(a.refund_probability, 0.0::NUMERIC))
      )
    )::NUMERIC(10, 6) AS expected_refund_rate,
    GREATEST(
      d.cap_fallback_rate,
      LEAST(
        0.90::NUMERIC,
        GREATEST(
          COALESCE(p.p95_positive_rate * 1.25::NUMERIC, d.cap_fallback_rate),
          COALESCE(p.p90_positive_rate * 1.50::NUMERIC, d.cap_fallback_rate),
          d.min_expected_refund_rate * 3.00::NUMERIC
        )
      )
    )::NUMERIC(10, 6) AS cap_rate,
    GREATEST(
      0.65::NUMERIC,
      LEAST(1.25::NUMERIC, COALESCE(q.p50_actual_over_pred, 1.00::NUMERIC))
    )::NUMERIC(10, 6) AS calibration_ratio
  FROM platform_defaults d
  LEFT JOIN platform_activity a
    ON a.platform = d.platform
  LEFT JOIN positive_rate_stats p
    ON p.platform = d.platform
  LEFT JOIN recent_positive_rate_stats r
    ON r.platform = d.platform
  LEFT JOIN recent_quality q
    ON q.platform = d.platform;

  CREATE TEMP TABLE tmp_overview_nowcast_weekday_stats ON COMMIT DROP AS
  WITH mature_hist AS (
    SELECT
      t."date",
      t.platform,
      EXTRACT(DOW FROM t."date")::INTEGER AS dow,
      COALESCE(t.gmv, 0)::NUMERIC(18, 2) AS gmv,
      COALESCE(t.refund_amount_pay_time, 0)::NUMERIC(18, 2) AS refund_amount_pay_time,
      LEAST(
        1.2::NUMERIC,
        GREATEST(
          0.0::NUMERIC,
          COALESCE(t.refund_amount_pay_time, 0)::NUMERIC / NULLIF(COALESCE(t.gmv, 0)::NUMERIC, 0)
        )
      ) AS refund_rate_pay
    FROM ads.all_trade_overview t
    WHERE t."date" BETWEEN (v_as_of_date - v_history_days) AND (v_as_of_date - p_maturity_days)
      AND t.platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs')
      AND COALESCE(t.gmv, 0) > 0
  ),
  activity AS (
    SELECT
      h.platform,
      h.dow,
      COUNT(*)::INTEGER AS mature_gmv_days,
      COUNT(*) FILTER (WHERE h.refund_amount_pay_time > 0)::INTEGER AS mature_refund_days,
      (
        COUNT(*) FILTER (WHERE h.refund_amount_pay_time > 0)::NUMERIC
        / NULLIF(COUNT(*)::NUMERIC, 0)
      )::NUMERIC(10, 6) AS refund_probability
    FROM mature_hist h
    GROUP BY h.platform, h.dow
  ),
  positive_rate_stats AS (
    SELECT
      h.platform,
      h.dow,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY h.refund_rate_pay)::NUMERIC(10, 6) AS p50_positive_rate
    FROM mature_hist h
    WHERE h.refund_amount_pay_time > 0
    GROUP BY h.platform, h.dow
  )
  SELECT
    a.platform,
    a.dow,
    a.mature_gmv_days,
    a.mature_refund_days,
    GREATEST(
      0.0::NUMERIC,
      LEAST(
        0.85::NUMERIC,
        COALESCE(p.p50_positive_rate, 0.0::NUMERIC)
        * GREATEST(0.0::NUMERIC, COALESCE(a.refund_probability, 0.0::NUMERIC))
      )
    )::NUMERIC(10, 6) AS expected_refund_rate
  FROM activity a
  LEFT JOIN positive_rate_stats p
    ON p.platform = a.platform
   AND p.dow = a.dow;

  CREATE TEMP TABLE tmp_overview_nowcast_rows ON COMMIT DROP AS
  WITH prepared AS (
    SELECT
      b."date",
      b.platform,
      v_as_of_date AS as_of_date,
      b.gmv,
      b.current_value AS refund_amount_pay_time_current,
      b.refund_amount_refund_time,
      (v_as_of_date - b."date") AS age_days,
      COALESCE(c.sample_count, 0) AS curve_sample_count,
      c.ratio_p50 AS curve_ratio_p50,
      c.ratio_p75 AS curve_ratio_p75,
      s.mature_gmv_days,
      s.mature_refund_days,
      s.refund_probability,
      s.expected_refund_rate AS platform_expected_refund_rate,
      CASE
        WHEN COALESCE(w.mature_gmv_days, 0) >= 4 AND COALESCE(w.expected_refund_rate, 0) > 0
          THEN w.expected_refund_rate
        ELSE NULL::NUMERIC(10, 6)
      END AS weekday_expected_refund_rate,
      s.cap_rate,
      s.prior_start_ratio,
      s.prior_floor_ratio,
      s.prior_power,
      s.calibration_ratio,
      LEAST(
        1.25::NUMERIC,
        GREATEST(
          0.85::NUMERIC,
          COALESCE(rule.prediction_multiplier, 1.0::NUMERIC)
        )
      )::NUMERIC(10, 6) AS prediction_multiplier
    FROM tmp_overview_nowcast_base b
    LEFT JOIN tmp_overview_nowcast_curve c
      ON c.platform = b.platform
     AND c.age_days = (v_as_of_date - b."date")
    LEFT JOIN tmp_overview_nowcast_platform_stats s
      ON s.platform = b.platform
    LEFT JOIN tmp_overview_nowcast_weekday_stats w
      ON w.platform = b.platform
     AND w.dow = EXTRACT(DOW FROM b."date")::INTEGER
    LEFT JOIN LATERAL (
      SELECT
        e.prediction_multiplier
      FROM ads.all_trade_overview_refund_nowcast_event_calendar e
      WHERE e.is_active = TRUE
        AND b."date" BETWEEN e.start_date AND e.end_date
        AND e.platform IN ('all', b.platform)
      ORDER BY
        CASE WHEN e.platform = b.platform THEN 0 ELSE 1 END,
        e.priority ASC,
        e.id DESC
      LIMIT 1
    ) rule ON TRUE
    WHERE b."date" <= v_as_of_date
  ),
  ratio_blended AS (
    SELECT
      p.*,
      CASE
        WHEN p.age_days >= p_maturity_days THEN 1.0::NUMERIC
        ELSE
          LEAST(
            0.995::NUMERIC,
            GREATEST(
              p.prior_floor_ratio,
              (
                (
                  p.prior_start_ratio
                  + (0.995::NUMERIC - p.prior_start_ratio)
                    * POWER(
                        LEAST(
                          1.0::NUMERIC,
                          GREATEST(
                            0.0::NUMERIC,
                            ((p.age_days + 1)::NUMERIC / GREATEST(p_maturity_days::NUMERIC, 1.0::NUMERIC))
                          )
                        ),
                        p.prior_power
                      )
                ) * (1.0::NUMERIC - LEAST(0.80::NUMERIC, COALESCE(p.curve_sample_count, 0)::NUMERIC / 90.0::NUMERIC))
                + COALESCE(
                    LEAST(
                      0.995::NUMERIC,
                      GREATEST(
                        0.20::NUMERIC,
                        (COALESCE(p.curve_ratio_p50, p.curve_ratio_p75) * 0.70::NUMERIC)
                        + (COALESCE(p.curve_ratio_p75, p.curve_ratio_p50) * 0.30::NUMERIC)
                      )
                    ),
                    (
                      p.prior_start_ratio
                      + (0.995::NUMERIC - p.prior_start_ratio)
                        * POWER(
                            LEAST(
                              1.0::NUMERIC,
                              GREATEST(
                                0.0::NUMERIC,
                                ((p.age_days + 1)::NUMERIC / GREATEST(p_maturity_days::NUMERIC, 1.0::NUMERIC))
                              )
                            ),
                            p.prior_power
                          )
                    )
                  ) * LEAST(0.80::NUMERIC, COALESCE(p.curve_sample_count, 0)::NUMERIC / 90.0::NUMERIC)
              )
            )
          )
      END::NUMERIC(10, 6) AS blended_completeness_ratio
    FROM prepared p
  ),
  pred AS (
    SELECT
      r.*,
      LEAST(
        0.85::NUMERIC,
        GREATEST(
          0.0::NUMERIC,
          COALESCE(r.weekday_expected_refund_rate, r.platform_expected_refund_rate, 0.0::NUMERIC)
        )
      ) AS expected_refund_rate,
      GREATEST(
        0.20::NUMERIC,
        0.85::NUMERIC
        - LEAST(
            0.85::NUMERIC,
            (GREATEST(r.age_days, 0)::NUMERIC / GREATEST(p_maturity_days::NUMERIC, 1.0::NUMERIC)) * 0.65::NUMERIC
          )
      )::NUMERIC(10, 6) AS zero_survival_weight
    FROM ratio_blended r
  ),
  scored AS (
    SELECT
      p.*,
      ROUND(
        COALESCE(p.gmv, 0)::NUMERIC
        * COALESCE(p.expected_refund_rate, 0.0::NUMERIC)
        * COALESCE(p.calibration_ratio, 1.0::NUMERIC)
        * COALESCE(p.prediction_multiplier, 1.0::NUMERIC),
        2
      )::NUMERIC(18, 2) AS expected_refund_amount,
      CASE
        WHEN p.refund_amount_pay_time_current > 0 THEN ROUND(
          p.refund_amount_pay_time_current
          / NULLIF(p.blended_completeness_ratio, 0)
          * COALESCE(p.calibration_ratio, 1.0::NUMERIC)
          * COALESCE(p.prediction_multiplier, 1.0::NUMERIC),
          2
        )::NUMERIC(18, 2)
        ELSE NULL::NUMERIC(18, 2)
      END AS current_curve_prediction
    FROM pred p
  ),
  bounded AS (
    SELECT
      s."date",
      s.platform,
      s.as_of_date,
      s.gmv,
      s.refund_amount_pay_time_current,
      s.age_days,
      s.curve_sample_count,
      s.mature_gmv_days,
      s.mature_refund_days,
      s.refund_probability,
      CASE
        WHEN s.refund_amount_pay_time_current <= 0
          AND COALESCE(s.gmv, 0) > 0
          AND s.age_days < p_maturity_days
          AND COALESCE(s.mature_refund_days, 0) >= 3
        THEN ROUND(
          GREATEST(
            0.01::NUMERIC,
            s.expected_refund_amount * COALESCE(s.zero_survival_weight, 0.35::NUMERIC)
          ),
          2
        )::NUMERIC(18, 2)
        WHEN s.refund_amount_pay_time_current <= 0 THEN 0::NUMERIC(18, 2)
        WHEN s.age_days >= p_maturity_days THEN s.refund_amount_pay_time_current::NUMERIC(18, 2)
        ELSE ROUND(
          GREATEST(
            s.refund_amount_pay_time_current,
            (COALESCE(s.current_curve_prediction, s.refund_amount_pay_time_current) * 0.85::NUMERIC)
              + (COALESCE(s.expected_refund_amount, 0) * 0.15::NUMERIC)
          ),
          2
        )::NUMERIC(18, 2)
      END AS predicted_unbounded,
      GREATEST(
        s.refund_amount_pay_time_current,
        ROUND(COALESCE(s.gmv, 0)::NUMERIC * COALESCE(s.cap_rate, 0.35::NUMERIC), 2)
      )::NUMERIC(18, 2) AS predicted_upper
    FROM scored s
  )
  SELECT
    b."date",
    b.platform,
    b.as_of_date,
    b.refund_amount_pay_time_current,
    CASE
      WHEN b.refund_amount_pay_time_current <= 0 AND b.predicted_unbounded <= 0 THEN 0::NUMERIC(18, 2)
      ELSE ROUND(
        GREATEST(
          b.refund_amount_pay_time_current,
          LEAST(b.predicted_upper, b.predicted_unbounded)
        ),
        2
      )::NUMERIC(18, 2)
    END AS refund_amount_pay_time_predicted,
    b.curve_sample_count,
    b.mature_gmv_days,
    b.mature_refund_days,
    b.age_days
  FROM bounded b;

  DELETE FROM ads.all_trade_overview_refund_nowcast_daily
  WHERE as_of_date = v_as_of_date;

  INSERT INTO ads.all_trade_overview_refund_nowcast_daily (
    "date",
    platform,
    as_of_date,
    refund_amount_pay_time_current,
    refund_amount_pay_time_predicted,
    completeness_ratio,
    prediction_confidence,
    model_version
  )
  SELECT
    r."date",
    r.platform,
    r.as_of_date,
    r.refund_amount_pay_time_current,
    r.refund_amount_pay_time_predicted,
    CASE
      WHEN r.refund_amount_pay_time_predicted > 0 THEN ROUND(
        GREATEST(
          0.000001::NUMERIC,
          r.refund_amount_pay_time_current / NULLIF(r.refund_amount_pay_time_predicted, 0)
        ),
        6
      )
      ELSE 1.0::NUMERIC(10, 6)
    END AS completeness_ratio,
    CASE
      WHEN r.age_days >= p_maturity_days THEN 'high'
      WHEN r.curve_sample_count >= 80 AND r.mature_gmv_days >= 80 THEN 'high'
      WHEN r.curve_sample_count >= 25 OR r.mature_gmv_days >= 45 THEN 'medium'
      ELSE 'low'
    END::VARCHAR(20) AS prediction_confidence,
    v_model_version::VARCHAR(64) AS model_version
  FROM tmp_overview_nowcast_rows r;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_all_trade_overview_refund_nowcast_daily completed, as_of_date %, inserted_rows %, maturity_days %, history_days %, model_version %',
    v_as_of_date,
    v_inserted_rows,
    p_maturity_days,
    v_history_days,
    v_model_version;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_refund_nowcast_quality_daily(
  IN p_as_of_date DATE DEFAULT NULL,
  IN p_eval_age_days INTEGER DEFAULT 1,
  IN p_eval_window_days INTEGER DEFAULT 14,
  IN p_threshold_wape NUMERIC DEFAULT 0.15,
  IN p_min_sample_count INTEGER DEFAULT 10
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_as_of_date DATE := COALESCE(p_as_of_date, CURRENT_DATE);
  v_inserted_rows INTEGER := 0;
  v_alert_platforms INTEGER := 0;
  v_model_version TEXT := NULL;
BEGIN
  IF p_eval_age_days < 1 THEN
    RAISE EXCEPTION 'p_eval_age_days must be >= 1';
  END IF;

  IF p_eval_window_days < 1 THEN
    RAISE EXCEPTION 'p_eval_window_days must be >= 1';
  END IF;

  IF p_threshold_wape <= 0 OR p_threshold_wape > 1 THEN
    RAISE EXCEPTION 'p_threshold_wape must be in (0, 1]';
  END IF;

  IF p_min_sample_count < 1 THEN
    RAISE EXCEPTION 'p_min_sample_count must be >= 1';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_daily') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_overview_refund_nowcast_daily does not exist';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_quality_daily') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_overview_refund_nowcast_quality_daily does not exist';
  END IF;

  DELETE FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  WHERE q.as_of_date = v_as_of_date
    AND EXISTS (
      SELECT 1
      FROM (
        SELECT p_eval_age_days AS eval_age_days, p_eval_window_days AS eval_window_days
        UNION ALL SELECT 3, p_eval_window_days WHERE p_eval_age_days = 1 AND p_eval_window_days = 14
        UNION ALL SELECT 7, p_eval_window_days WHERE p_eval_age_days = 1 AND p_eval_window_days = 14
        UNION ALL SELECT 14, p_eval_window_days WHERE p_eval_age_days = 1 AND p_eval_window_days = 14
      ) e
      WHERE e.eval_age_days = q.eval_age_days
        AND e.eval_window_days = q.eval_window_days
    );

  INSERT INTO ads.all_trade_overview_refund_nowcast_quality_daily (
    as_of_date,
    platform,
    eval_age_days,
    eval_window_days,
    threshold_wape,
    sample_count,
    actual_total,
    predicted_total,
    absolute_error_total,
    wape,
    bias_rate,
    quality_status,
    model_version,
    zero_miss_count
  )
  WITH eval_params AS (
    SELECT p_eval_age_days AS eval_age_days, p_eval_window_days AS eval_window_days
    UNION ALL SELECT 3, p_eval_window_days WHERE p_eval_age_days = 1 AND p_eval_window_days = 14
    UNION ALL SELECT 7, p_eval_window_days WHERE p_eval_age_days = 1 AND p_eval_window_days = 14
    UNION ALL SELECT 14, p_eval_window_days WHERE p_eval_age_days = 1 AND p_eval_window_days = 14
  ),
  platform_dimension AS (
    SELECT *
    FROM (
      VALUES
        ('douyin'),
        ('jd'),
        ('taobao'),
        ('wx'),
        ('xhs')
    ) AS t(platform)
  ),
  prediction_base AS (
    SELECT
      e.eval_age_days,
      e.eval_window_days,
      p."date",
      p.platform,
      COALESCE(p.refund_amount_pay_time_predicted, 0)::NUMERIC(18, 2) AS predicted_value,
      COALESCE(p.model_version, 'unknown')::VARCHAR(64) AS model_version
    FROM eval_params e
    JOIN ads.all_trade_overview_refund_nowcast_daily p
      ON p.as_of_date = (p."date" + e.eval_age_days)
     AND p."date" BETWEEN
        (v_as_of_date - e.eval_age_days - (e.eval_window_days - 1))
        AND (v_as_of_date - e.eval_age_days)
  ),
  actual_base AS (
    SELECT
      e.eval_age_days,
      e.eval_window_days,
      a."date",
      a.platform,
      COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS actual_value
    FROM eval_params e
    JOIN ads.all_trade_overview_refund_nowcast_daily a
      ON a.as_of_date = v_as_of_date
     AND a."date" BETWEEN
        (v_as_of_date - e.eval_age_days - (e.eval_window_days - 1))
        AND (v_as_of_date - e.eval_age_days)
  ),
  paired AS (
    SELECT
      p.eval_age_days,
      p.eval_window_days,
      p.platform,
      p."date",
      p.predicted_value,
      COALESCE(a.actual_value, 0)::NUMERIC(18, 2) AS actual_value,
      p.model_version
    FROM prediction_base p
    LEFT JOIN actual_base a
      ON a.platform = p.platform
     AND a."date" = p."date"
     AND a.eval_age_days = p.eval_age_days
     AND a.eval_window_days = p.eval_window_days
  ),
  aggregated AS (
    SELECT
      e.eval_age_days,
      e.eval_window_days,
      d.platform,
      COALESCE(COUNT(p."date"), 0)::INTEGER AS sample_count,
      COALESCE(SUM(p.actual_value), 0)::NUMERIC(18, 2) AS actual_total,
      COALESCE(SUM(p.predicted_value), 0)::NUMERIC(18, 2) AS predicted_total,
      COALESCE(SUM(ABS(p.predicted_value - p.actual_value)), 0)::NUMERIC(18, 2) AS absolute_error_total,
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(p.predicted_value, 0) <= 0 AND COALESCE(p.actual_value, 0) > 0 THEN 1
            ELSE 0
          END
        ),
        0
      )::INTEGER AS zero_miss_count,
      CASE
        WHEN COALESCE(SUM(ABS(p.actual_value)), 0) > 0 THEN ROUND(
          COALESCE(SUM(ABS(p.predicted_value - p.actual_value)), 0)
          / NULLIF(COALESCE(SUM(ABS(p.actual_value)), 0), 0),
          6
        )
        ELSE NULL::NUMERIC(10, 6)
      END AS wape,
      CASE
        WHEN COALESCE(SUM(ABS(p.actual_value)), 0) > 0 THEN ROUND(
          COALESCE(SUM(p.predicted_value - p.actual_value), 0)
          / NULLIF(COALESCE(SUM(ABS(p.actual_value)), 0), 0),
          6
        )
        ELSE NULL::NUMERIC(10, 6)
      END AS bias_rate,
      MAX(p.model_version)::VARCHAR(64) AS model_version
    FROM eval_params e
    CROSS JOIN platform_dimension d
    LEFT JOIN paired p
      ON p.platform = d.platform
     AND p.eval_age_days = e.eval_age_days
     AND p.eval_window_days = e.eval_window_days
    GROUP BY e.eval_age_days, e.eval_window_days, d.platform
  )
  SELECT
    v_as_of_date AS as_of_date,
    a.platform,
    a.eval_age_days,
    a.eval_window_days,
    p_threshold_wape::NUMERIC(10, 6) AS threshold_wape,
    a.sample_count,
    a.actual_total,
    a.predicted_total,
    a.absolute_error_total,
    a.wape,
    a.bias_rate,
    CASE
      WHEN a.sample_count < p_min_sample_count OR ABS(COALESCE(a.actual_total, 0)) <= 0 THEN 'insufficient'
      WHEN COALESCE(a.zero_miss_count, 0) > 0 THEN 'alert'
      WHEN COALESCE(a.wape, 0) > p_threshold_wape THEN 'alert'
      ELSE 'pass'
    END::VARCHAR(20) AS quality_status,
    a.model_version,
    a.zero_miss_count
  FROM aggregated a;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  SELECT COUNT(DISTINCT q.platform)
  INTO v_alert_platforms
  FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  WHERE q.as_of_date = v_as_of_date
    AND q.quality_status = 'alert';

  SELECT MAX(q.model_version)
  INTO v_model_version
  FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  WHERE q.as_of_date = v_as_of_date;

  RAISE NOTICE
    'refresh_all_trade_overview_refund_nowcast_quality_daily completed, as_of_date %, eval_age_days %, eval_window_days %, inserted_rows %, alert_platforms %, model_version %',
    v_as_of_date,
    p_eval_age_days,
    p_eval_window_days,
    v_inserted_rows,
    v_alert_platforms,
    COALESCE(v_model_version, 'unknown');
END;
$$;

COMMIT;
