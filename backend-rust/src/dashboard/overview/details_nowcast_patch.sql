
WITH params AS (
  SELECT
    __START_DATE_LITERAL__::DATE AS start_date,
    __END_DATE_LITERAL__::DATE AS end_date,
    __PLATFORM_LITERAL__::TEXT AS target_platform
),
platform_dimension AS (
  SELECT *
  FROM (
    VALUES
      ('taobao', '天猫'),
      ('douyin', '抖音'),
      ('xhs', '小红书'),
      ('jd', '京东'),
      ('wx', '微信小程序')
  ) AS t(platform, platform_label)
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
rows AS (
  SELECT
    n."date"::TEXT AS date_key,
    COALESCE(d.platform_label, n.platform) AS platform_label,
    SUM(COALESCE(n.refund_amount_pay_time_predicted, 0))::NUMERIC(18, 2) AS refund_amount_pay_time_predicted,
    CASE
      WHEN SUM(COALESCE(n.refund_amount_pay_time_predicted, 0)) > 0 THEN ROUND(
        SUM(COALESCE(n.refund_amount_pay_time_current, 0))
        / NULLIF(SUM(COALESCE(n.refund_amount_pay_time_predicted, 0)), 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS completeness_ratio,
    CASE
      WHEN MAX(
        CASE
          WHEN COALESCE(n.prediction_confidence, '') = 'high' THEN 3
          WHEN COALESCE(n.prediction_confidence, '') = 'medium' THEN 2
          WHEN COALESCE(n.prediction_confidence, '') = 'low' THEN 1
          ELSE 0
        END
      ) = 3 THEN 'high'
      WHEN MAX(
        CASE
          WHEN COALESCE(n.prediction_confidence, '') = 'high' THEN 3
          WHEN COALESCE(n.prediction_confidence, '') = 'medium' THEN 2
          WHEN COALESCE(n.prediction_confidence, '') = 'low' THEN 1
          ELSE 0
        END
      ) = 2 THEN 'medium'
      WHEN MAX(
        CASE
          WHEN COALESCE(n.prediction_confidence, '') = 'high' THEN 3
          WHEN COALESCE(n.prediction_confidence, '') = 'medium' THEN 2
          WHEN COALESCE(n.prediction_confidence, '') = 'low' THEN 1
          ELSE 0
        END
      ) = 1 THEN 'low'
      ELSE NULL::TEXT
    END AS prediction_confidence
  FROM ads.all_trade_overview_refund_nowcast_daily n
  CROSS JOIN params p
  CROSS JOIN nowcast_target nt
  LEFT JOIN platform_dimension d
    ON d.platform = n.platform
  WHERE nt.as_of_date IS NOT NULL
    AND n.as_of_date = nt.as_of_date
    AND n."date" BETWEEN p.start_date AND p.end_date
    AND (p.target_platform = 'overview' OR n.platform = p.target_platform)
  GROUP BY n."date", COALESCE(d.platform_label, n.platform)
),
quality_rows AS (
  SELECT
    COALESCE(d.platform_label, q.platform) AS platform_label,
    q.quality_status,
    ROW_NUMBER() OVER (
      PARTITION BY q.platform
      ORDER BY
        CASE
          WHEN q.eval_age_days = 1 AND q.eval_window_days = 14 THEN 0
          ELSE 1
        END,
        q.eval_age_days,
        q.eval_window_days
    ) AS quality_rank
  FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  CROSS JOIN params p
  CROSS JOIN nowcast_target nt
  LEFT JOIN platform_dimension d
    ON d.platform = q.platform
  WHERE nt.as_of_date IS NOT NULL
    AND q.as_of_date = nt.as_of_date
    AND (p.target_platform = 'overview' OR q.platform = p.target_platform)
),
quality_by_platform AS (
  SELECT
    qr.platform_label,
    qr.quality_status
  FROM quality_rows qr
  WHERE qr.quality_rank = 1
)
SELECT json_build_object(
  'asOfDate', (SELECT nt.as_of_date::TEXT FROM nowcast_target nt),
  'byRow', COALESCE(
    (
      SELECT json_object_agg(
        (r.date_key || '|' || r.platform_label),
        json_build_object(
          'refund_amount_pay_time_predicted', r.refund_amount_pay_time_predicted,
          'completeness_ratio', r.completeness_ratio,
          'prediction_confidence', r.prediction_confidence,
          'quality_status', q.quality_status
        )
      )
      FROM rows r
      LEFT JOIN quality_by_platform q
        ON q.platform_label = r.platform_label
    ),
    '{}'::JSON
  )
)::TEXT;
