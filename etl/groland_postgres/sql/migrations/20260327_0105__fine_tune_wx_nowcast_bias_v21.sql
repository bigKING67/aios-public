BEGIN;

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_refund_nowcast_daily(
  IN p_as_of_date DATE DEFAULT NULL,
  IN p_maturity_days INTEGER DEFAULT 21,
  IN p_history_days INTEGER DEFAULT 180
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_as_of_date DATE := COALESCE(p_as_of_date, CURRENT_DATE);
  v_model_version TEXT := format('v2.1_wx_bias_finetuned_%sd', p_maturity_days);
  v_inserted_rows INTEGER := 0;
BEGIN
  IF p_maturity_days < 2 THEN
    RAISE EXCEPTION 'p_maturity_days must be >= 2';
  END IF;

  IF p_history_days < p_maturity_days THEN
    RAISE EXCEPTION 'p_history_days (%) must be >= p_maturity_days (%)', p_history_days, p_maturity_days;
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
  IF to_regclass('pg_temp.tmp_overview_nowcast_rows') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_rows';
  END IF;

  CREATE TEMP TABLE tmp_overview_nowcast_base ON COMMIT DROP AS
  SELECT
    t."date",
    t.platform,
    COALESCE(t.gmv, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(t.refund_amount_pay_time, 0)::NUMERIC(18, 2) AS current_value,
    COALESCE(t.refund_amount_refund_time, t.refund_amount, 0)::NUMERIC(18, 2) AS refund_amount_refund_time
  FROM ads.all_trade_overview t
  WHERE t."date" BETWEEN (v_as_of_date - p_history_days) AND v_as_of_date
    AND t.platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs');

  CREATE TEMP TABLE tmp_overview_nowcast_curve ON COMMIT DROP AS
  WITH matured_snapshot AS (
    SELECT
      n."date",
      n.platform,
      MAX(n.as_of_date) AS final_as_of_date
    FROM ads.all_trade_overview_refund_nowcast_daily n
    WHERE (n.as_of_date - n."date") >= p_maturity_days
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
    AVG(r.ratio)::NUMERIC(10, 6) AS ratio_avg,
    COUNT(*)::INTEGER AS sample_count
  FROM history_ratios r
  GROUP BY r.platform, r.age_days;

  CREATE TEMP TABLE tmp_overview_nowcast_platform_stats ON COMMIT DROP AS
  WITH platform_defaults AS (
    SELECT *
    FROM (
      VALUES
        ('douyin', 0.38::NUMERIC, 0.72::NUMERIC, 0.60::NUMERIC, 1.10::NUMERIC, 0.70::NUMERIC),
        ('jd', 0.30::NUMERIC, 0.82::NUMERIC, 0.72::NUMERIC, 1.30::NUMERIC, 0.55::NUMERIC),
        ('taobao', 0.48::NUMERIC, 0.74::NUMERIC, 0.62::NUMERIC, 1.00::NUMERIC, 0.75::NUMERIC),
        ('wx', 0.33::NUMERIC, 0.84::NUMERIC, 0.74::NUMERIC, 1.30::NUMERIC, 0.55::NUMERIC),
        ('xhs', 0.44::NUMERIC, 0.84::NUMERIC, 0.76::NUMERIC, 1.10::NUMERIC, 0.70::NUMERIC)
    ) AS t(platform, cap_fallback_rate, prior_start_ratio, prior_floor_ratio, prior_power, calibration_floor_ratio)
  ),
  finalized_hist AS (
    SELECT
      t.platform,
      LEAST(
        1.2::NUMERIC,
        GREATEST(
          0.0::NUMERIC,
          COALESCE(t.refund_amount_pay_time, 0)::NUMERIC / NULLIF(COALESCE(t.gmv, 0)::NUMERIC, 0)
        )
      ) AS refund_rate_pay
    FROM ads.all_trade_overview t
    WHERE t."date" BETWEEN (v_as_of_date - p_history_days) AND (v_as_of_date - p_maturity_days)
      AND t.platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs')
      AND COALESCE(t.gmv, 0) > 0
  ),
  agg AS (
    SELECT
      f.platform,
      COUNT(*)::INTEGER AS sample_count,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY f.refund_rate_pay)::NUMERIC(10, 6) AS p50_rate,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY f.refund_rate_pay)::NUMERIC(10, 6) AS p95_rate
    FROM finalized_hist f
    GROUP BY f.platform
  ),
  recent_quality AS (
    SELECT
      q.platform,
      COUNT(*)::INTEGER AS quality_sample_count,
      percentile_cont(0.50) WITHIN GROUP (
        ORDER BY GREATEST(
          0.30::NUMERIC,
          LEAST(
            1.10::NUMERIC,
            q.actual_total / NULLIF(q.predicted_total, 0)
          )
        )
      )::NUMERIC(10, 6) AS p50_actual_over_pred
    FROM ads.all_trade_overview_refund_nowcast_quality_daily q
    WHERE q.eval_age_days = 1
      AND q.as_of_date BETWEEN (v_as_of_date - 60) AND (v_as_of_date - 1)
      AND q.predicted_total > 0
    GROUP BY q.platform
  )
  SELECT
    d.platform,
    d.cap_fallback_rate,
    d.prior_start_ratio,
    d.prior_floor_ratio,
    d.prior_power,
    COALESCE(a.sample_count, 0) AS stat_sample_count,
    COALESCE(q.quality_sample_count, 0) AS quality_sample_count,
    GREATEST(
      d.calibration_floor_ratio,
      LEAST(
        1.00::NUMERIC,
        COALESCE(q.p50_actual_over_pred, 1.00::NUMERIC)
        * CASE
            WHEN d.platform = 'wx' THEN 0.925::NUMERIC
            ELSE 1.00::NUMERIC
          END
      )
    )::NUMERIC(10, 6) AS calibration_ratio,
    LEAST(
      0.85::NUMERIC,
      GREATEST(
        0.05::NUMERIC,
        COALESCE(a.p95_rate * 1.20::NUMERIC, d.cap_fallback_rate)
      )
    )::NUMERIC(10, 6) AS cap_rate
  FROM platform_defaults d
  LEFT JOIN agg a
    ON a.platform = d.platform
  LEFT JOIN recent_quality q
    ON q.platform = d.platform;

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
      c.ratio_avg AS curve_ratio,
      s.cap_rate,
      s.prior_start_ratio,
      s.prior_floor_ratio,
      s.prior_power,
      s.calibration_ratio,
      LEAST(
        1.20::NUMERIC,
        GREATEST(
          0.90::NUMERIC,
          COALESCE(rule.prediction_multiplier, 1.0::NUMERIC)
        )
      )::NUMERIC(10, 6) AS prediction_multiplier
    FROM tmp_overview_nowcast_base b
    LEFT JOIN tmp_overview_nowcast_curve c
      ON c.platform = b.platform
     AND c.age_days = (v_as_of_date - b."date")
    LEFT JOIN tmp_overview_nowcast_platform_stats s
      ON s.platform = b.platform
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
                ) * (1.0::NUMERIC - LEAST(0.85::NUMERIC, COALESCE(p.curve_sample_count, 0)::NUMERIC / 80.0::NUMERIC))
                + COALESCE(
                    LEAST(0.995::NUMERIC, GREATEST(0.20::NUMERIC, p.curve_ratio)),
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
                  ) * LEAST(0.85::NUMERIC, COALESCE(p.curve_sample_count, 0)::NUMERIC / 80.0::NUMERIC)
              )
            )
          )
      END::NUMERIC(10, 6) AS blended_completeness_ratio
    FROM prepared p
  ),
  pred AS (
    SELECT
      r.*,
      CASE
        WHEN r.refund_amount_pay_time_current <= 0 THEN 0::NUMERIC(18, 2)
        WHEN r.age_days >= p_maturity_days THEN r.refund_amount_pay_time_current::NUMERIC(18, 2)
        ELSE ROUND(
          GREATEST(
            r.refund_amount_pay_time_current,
            (
              r.refund_amount_pay_time_current
              / NULLIF(r.blended_completeness_ratio, 0)
              * r.prediction_multiplier
              * COALESCE(r.calibration_ratio, 1.0::NUMERIC)
            )
          ),
          2
        )::NUMERIC(18, 2)
      END AS predicted_lower,
      GREATEST(
        r.refund_amount_pay_time_current,
        ROUND(COALESCE(r.gmv, 0)::NUMERIC * COALESCE(r.cap_rate, 0.30::NUMERIC), 2)
      )::NUMERIC(18, 2) AS predicted_upper
    FROM ratio_blended r
  ),
  bounded AS (
    SELECT
      p."date",
      p.platform,
      p.as_of_date,
      p.refund_amount_pay_time_current,
      CASE
        WHEN p.refund_amount_pay_time_current <= 0 THEN 0::NUMERIC(18, 2)
        ELSE ROUND(
          LEAST(p.predicted_upper, p.predicted_lower),
          2
        )::NUMERIC(18, 2)
      END AS refund_amount_pay_time_predicted,
      p.curve_sample_count,
      p.age_days
    FROM pred p
  )
  SELECT
    b."date",
    b.platform,
    b.as_of_date,
    b.refund_amount_pay_time_current,
    b.refund_amount_pay_time_predicted,
    CASE
      WHEN b.refund_amount_pay_time_predicted > 0 THEN ROUND(
        GREATEST(
          0.000001::NUMERIC,
          b.refund_amount_pay_time_current / NULLIF(b.refund_amount_pay_time_predicted, 0)
        ),
        6
      )
      ELSE 1.0::NUMERIC(10, 6)
    END AS completeness_ratio,
    CASE
      WHEN b.age_days >= p_maturity_days THEN 'high'
      WHEN b.curve_sample_count >= 80 THEN 'high'
      WHEN b.curve_sample_count >= 25 THEN 'medium'
      ELSE 'low'
    END::VARCHAR(20) AS prediction_confidence,
    v_model_version::VARCHAR(64) AS model_version
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
    r.completeness_ratio,
    r.prediction_confidence,
    r.model_version
  FROM tmp_overview_nowcast_rows r;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_all_trade_overview_refund_nowcast_daily completed, as_of_date %, inserted_rows %, maturity_days %, history_days %, model_version %',
    v_as_of_date,
    v_inserted_rows,
    p_maturity_days,
    p_history_days,
    v_model_version;
END;
$$;

COMMIT;
