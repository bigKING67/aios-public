BEGIN;

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_refund_nowcast_daily(
  IN p_as_of_date DATE DEFAULT NULL,
  IN p_maturity_days INTEGER DEFAULT 21,
  IN p_history_days INTEGER DEFAULT 120
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_as_of_date DATE := COALESCE(p_as_of_date, CURRENT_DATE);
  v_model_version TEXT := format('v1.3_curve_event_cap_%sd', p_maturity_days);
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
  IF to_regclass('pg_temp.tmp_overview_nowcast_rows') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_rows';
  END IF;

  CREATE TEMP TABLE tmp_overview_nowcast_base ON COMMIT DROP AS
  SELECT
    t."date",
    t.platform,
    COALESCE(t.gmv, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(t.refund_amount_pay_time, 0)::NUMERIC(18, 2) AS current_value
  FROM ads.all_trade_overview t
  WHERE t."date" BETWEEN (v_as_of_date - p_history_days) AND v_as_of_date;

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

  CREATE TEMP TABLE tmp_overview_nowcast_rows ON COMMIT DROP AS
  WITH prepared AS (
    SELECT
      b."date",
      b.platform,
      v_as_of_date AS as_of_date,
      b.gmv,
      b.current_value AS refund_amount_pay_time_current,
      (v_as_of_date - b."date") AS age_days,
      COALESCE(c.sample_count, 0) AS sample_count,
      COALESCE(rule.prediction_multiplier, 1.0::NUMERIC(10, 6)) AS prediction_multiplier,
      CASE
        WHEN (v_as_of_date - b."date") >= p_maturity_days THEN 1.0::NUMERIC
        WHEN c.ratio_avg IS NOT NULL
          THEN LEAST(0.995::NUMERIC, GREATEST(0.05::NUMERIC, c.ratio_avg))
        ELSE LEAST(
          0.98::NUMERIC,
          GREATEST(
            0.08::NUMERIC,
            ((v_as_of_date - b."date" + 1)::NUMERIC / (p_maturity_days + 1)::NUMERIC)
          )
        )
      END AS completeness_ratio,
      CASE
        WHEN b.platform = 'xhs' AND COALESCE(c.sample_count, 0) < 20 THEN 1.05::NUMERIC
        WHEN b.platform = 'xhs' THEN 1.20::NUMERIC
        WHEN COALESCE(c.sample_count, 0) < 20 THEN 1.50::NUMERIC
        ELSE 2.00::NUMERIC
      END AS prediction_cap_ratio
    FROM tmp_overview_nowcast_base b
    LEFT JOIN tmp_overview_nowcast_curve c
      ON c.platform = b.platform
     AND c.age_days = (v_as_of_date - b."date")
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
  raw_prediction AS (
    SELECT
      p."date",
      p.platform,
      p.as_of_date,
      p.gmv,
      p.refund_amount_pay_time_current,
      p.age_days,
      p.sample_count,
      p.completeness_ratio,
      p.prediction_multiplier,
      p.prediction_cap_ratio,
      CASE
        WHEN p.refund_amount_pay_time_current <= 0 THEN 0::NUMERIC(18, 2)
        WHEN p.age_days >= p_maturity_days THEN p.refund_amount_pay_time_current
        ELSE ROUND(
          LEAST(
            (p.refund_amount_pay_time_current * 10)::NUMERIC,
            GREATEST(
              p.refund_amount_pay_time_current,
              (
                p.refund_amount_pay_time_current
                / NULLIF(p.completeness_ratio, 0)
                * p.prediction_multiplier
              )
            )
          ),
          2
        )::NUMERIC(18, 2)
      END AS raw_predicted,
      GREATEST(
        p.refund_amount_pay_time_current,
        (COALESCE(p.gmv, 0) * p.prediction_cap_ratio)::NUMERIC(18, 2)
      ) AS predicted_cap_upper
    FROM prepared p
  )
  SELECT
    r."date",
    r.platform,
    r.as_of_date,
    r.refund_amount_pay_time_current,
    CASE
      WHEN r.refund_amount_pay_time_current <= 0 THEN 0::NUMERIC(18, 2)
      WHEN r.age_days >= p_maturity_days THEN r.refund_amount_pay_time_current
      ELSE ROUND(
        LEAST(
          r.predicted_cap_upper,
          GREATEST(r.refund_amount_pay_time_current, COALESCE(r.raw_predicted, 0))
        ),
        2
      )::NUMERIC(18, 2)
    END AS refund_amount_pay_time_predicted,
    r.completeness_ratio,
    CASE
      WHEN r.age_days >= p_maturity_days THEN 'high'
      WHEN r.sample_count >= 60 THEN 'high'
      WHEN r.sample_count >= 20 THEN 'medium'
      ELSE 'low'
    END::VARCHAR(20) AS prediction_confidence,
    v_model_version::VARCHAR(64) AS model_version
  FROM raw_prediction r;

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
    'refresh_all_trade_overview_refund_nowcast_daily completed, as_of_date %, inserted_rows %, maturity_days %, history_days %',
    v_as_of_date,
    v_inserted_rows,
    p_maturity_days,
    p_history_days;
END;
$$;

COMMIT;
