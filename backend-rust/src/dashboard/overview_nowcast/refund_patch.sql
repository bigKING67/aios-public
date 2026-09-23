
WITH params AS (
  SELECT
    __START_DATE_LITERAL__::DATE AS current_start_date,
    __END_DATE_LITERAL__::DATE AS current_end_date,
    __PREV_START_DATE_LITERAL__::DATE AS previous_start_date,
    __PREV_END_DATE_LITERAL__::DATE AS previous_end_date,
    __PLATFORM_LITERAL__::TEXT AS target_platform
),
nowcast_target AS (
  SELECT COALESCE(
    (
      SELECT CURRENT_DATE
      WHERE EXISTS (
        SELECT 1
        FROM ads.all_trade_overview_refund_nowcast_daily n0
        WHERE n0.as_of_date = CURRENT_DATE
      )
    ),
    (
      SELECT MAX(n1.as_of_date)
      FROM ads.all_trade_overview_refund_nowcast_daily n1
    )
  )::DATE AS as_of_date
),
current_by_date AS (
  SELECT
    n."date",
    SUM(COALESCE(n.refund_amount_pay_time_predicted, 0))::NUMERIC(18, 2) AS refund_amount_pay_time_predicted
  FROM ads.all_trade_overview_refund_nowcast_daily n
  CROSS JOIN params p
  CROSS JOIN nowcast_target nt
  WHERE nt.as_of_date IS NOT NULL
    AND n.as_of_date = nt.as_of_date
    AND n."date" BETWEEN p.current_start_date AND p.current_end_date
    AND (p.target_platform = 'overview' OR n.platform = p.target_platform)
  GROUP BY n."date"
),
quality_rows AS (
  SELECT
    q.platform,
    q.eval_age_days,
    q.eval_window_days,
    q.threshold_wape,
    q.sample_count,
    q.actual_total,
    q.predicted_total,
    q.absolute_error_total,
    q.wape,
    q.bias_rate,
    q.quality_status,
    to_jsonb(q) ->> 'model_version' AS model_version,
    COALESCE((to_jsonb(q) ->> 'zero_miss_count')::INTEGER, 0) AS zero_miss_count,
    ROW_NUMBER() OVER (
      PARTITION BY q.platform
      ORDER BY
        CASE
          WHEN q.eval_age_days = 1 AND q.eval_window_days = 14 THEN 0
          WHEN q.eval_age_days = 3 AND q.eval_window_days = 14 THEN 1
          WHEN q.eval_age_days = 7 AND q.eval_window_days = 14 THEN 2
          WHEN q.eval_age_days = 14 AND q.eval_window_days = 14 THEN 3
          ELSE 4
        END,
        q.eval_age_days,
        q.eval_window_days
    ) AS quality_rank
  FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  CROSS JOIN params p
  CROSS JOIN nowcast_target nt
  WHERE nt.as_of_date IS NOT NULL
    AND q.as_of_date = nt.as_of_date
    AND (p.target_platform = 'overview' OR q.platform = p.target_platform)
),
quality_platform AS (
  SELECT *
  FROM quality_rows q
  WHERE q.quality_rank = 1
),
quality_summary AS (
  SELECT
    MAX(nt.as_of_date)::TEXT AS as_of_date,
    1::INTEGER AS eval_age_days,
    14::INTEGER AS eval_window_days,
    MAX(q.threshold_wape)::NUMERIC(10, 6) AS threshold_wape,
    COALESCE(SUM(q.sample_count), 0)::INTEGER AS sample_count,
    COALESCE(SUM(q.actual_total), 0)::NUMERIC(18, 2) AS actual_total,
    COALESCE(SUM(q.predicted_total), 0)::NUMERIC(18, 2) AS predicted_total,
    COALESCE(SUM(q.absolute_error_total), 0)::NUMERIC(18, 2) AS absolute_error_total,
    COALESCE(SUM(q.zero_miss_count), 0)::INTEGER AS zero_miss_count,
    CASE
      WHEN COALESCE(SUM(ABS(q.actual_total)), 0) > 0 THEN ROUND(
        COALESCE(SUM(q.absolute_error_total), 0)
        / NULLIF(COALESCE(SUM(ABS(q.actual_total)), 0), 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS wape,
    CASE
      WHEN COALESCE(SUM(ABS(q.actual_total)), 0) > 0 THEN ROUND(
        COALESCE(SUM(q.predicted_total - q.actual_total), 0)
        / NULLIF(COALESCE(SUM(ABS(q.actual_total)), 0), 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS bias_rate,
    CASE
      WHEN nt.as_of_date IS NULL THEN NULL::TEXT
      WHEN nt.as_of_date < CURRENT_DATE THEN 'alert'
      WHEN COUNT(q.platform) = 0 THEN 'insufficient'
      WHEN SUM(CASE WHEN q.quality_status = 'alert' THEN 1 ELSE 0 END) > 0 THEN 'alert'
      WHEN SUM(CASE WHEN q.quality_status = 'insufficient' THEN 1 ELSE 0 END) > 0 THEN 'insufficient'
      ELSE 'pass'
    END AS quality_status,
    MAX(q.model_version) AS model_version,
    COALESCE(
      ARRAY_AGG(q.platform ORDER BY q.platform) FILTER (WHERE q.quality_status = 'alert'),
      ARRAY[]::TEXT[]
    ) AS alert_platforms,
    COALESCE(
      ARRAY_AGG(q.platform ORDER BY q.platform) FILTER (WHERE q.quality_status = 'pass'),
      ARRAY[]::TEXT[]
    ) AS pass_platforms,
    COALESCE(
      ARRAY_AGG(q.platform ORDER BY q.platform) FILTER (WHERE q.quality_status = 'insufficient'),
      ARRAY[]::TEXT[]
    ) AS insufficient_platforms
  FROM nowcast_target nt
  LEFT JOIN quality_platform q ON TRUE
  GROUP BY nt.as_of_date
),
previous_by_date AS (
  SELECT
    n."date",
    SUM(COALESCE(n.refund_amount_pay_time_predicted, 0))::NUMERIC(18, 2) AS refund_amount_pay_time_predicted
  FROM ads.all_trade_overview_refund_nowcast_daily n
  CROSS JOIN params p
  CROSS JOIN nowcast_target nt
  WHERE nt.as_of_date IS NOT NULL
    AND n.as_of_date = nt.as_of_date
    AND n."date" BETWEEN p.previous_start_date AND p.previous_end_date
    AND (p.target_platform = 'overview' OR n.platform = p.target_platform)
  GROUP BY n."date"
)
SELECT json_build_object(
  'asOfDate', (SELECT nt.as_of_date::TEXT FROM nowcast_target nt),
  'nowcastQuality', (
    SELECT CASE
      WHEN qs.as_of_date IS NULL THEN NULL::JSON
      ELSE json_build_object(
        'asOfDate', qs.as_of_date,
        'evalAgeDays', qs.eval_age_days,
        'evalWindowDays', qs.eval_window_days,
        'thresholdWape', qs.threshold_wape,
        'sampleCount', qs.sample_count,
        'actualTotal', qs.actual_total,
        'predictedTotal', qs.predicted_total,
        'absoluteErrorTotal', qs.absolute_error_total,
        'zeroMissCount', qs.zero_miss_count,
        'wape', qs.wape,
        'biasRate', qs.bias_rate,
        'qualityStatus', qs.quality_status,
        'modelVersion', qs.model_version,
        'alertPlatforms', qs.alert_platforms,
        'passPlatforms', qs.pass_platforms,
        'insufficientPlatforms', qs.insufficient_platforms
      )
    END
    FROM quality_summary qs
  ),
  'currentByDate', COALESCE(
    (
      SELECT json_object_agg(c."date"::TEXT, c.refund_amount_pay_time_predicted)
      FROM current_by_date c
    ),
    '{}'::JSON
  ),
  'previousByDate', COALESCE(
    (
      SELECT json_object_agg(p."date"::TEXT, p.refund_amount_pay_time_predicted)
      FROM previous_by_date p
    ),
    '{}'::JSON
  ),
  'currentTotal', COALESCE(
    (
      SELECT SUM(c.refund_amount_pay_time_predicted)
      FROM current_by_date c
    ),
    0
  )::NUMERIC(18, 2),
  'previousTotal', COALESCE(
    (
      SELECT SUM(p.refund_amount_pay_time_predicted)
      FROM previous_by_date p
    ),
    0
  )::NUMERIC(18, 2)
)::TEXT;
