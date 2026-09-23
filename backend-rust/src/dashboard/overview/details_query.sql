
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
      ('taobao', '天猫', 1),
      ('douyin', '抖音', 2),
      ('xhs', '小红书', 3),
      ('jd', '京东', 4),
      ('wx', '微信小程序', 5)
  ) AS t(platform, platform_label, sort_order)
),
base_rows AS (
  SELECT
    t."date",
    t.platform,
    COALESCE(d.platform_label, t.platform) AS platform_label,
    COALESCE(t.gmv, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(t.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
    t.cost::NUMERIC(18, 2) AS cost,
    t.gmv_from_cost::NUMERIC(18, 2) AS gmv_from_cost,
    t.roi::NUMERIC(18, 4) AS roi,
    t.roi_from_cost::NUMERIC(18, 4) AS roi_from_cost,
    COALESCE(t.order_count, 0)::BIGINT AS order_count,
    COALESCE(t.buyer_count, 0)::BIGINT AS buyer_count,
    t.arpu::NUMERIC(18, 4) AS arpu,
    COALESCE(t.refund_amount_pay_time, 0)::NUMERIC(18, 2) AS refund_amount_pay_time_current,
    COALESCE(t.refund_amount_pay_time, 0)::NUMERIC(18, 2) AS refund_amount_pay_time_predicted,
    NULL::NUMERIC(10, 6) AS completeness_ratio,
    NULL::VARCHAR(20) AS prediction_confidence,
    NULL::VARCHAR(20) AS quality_status,
    COALESCE(t.refund_amount_refund_time, 0)::NUMERIC(18, 2) AS refund_amount_refund_time,
    COALESCE(d.sort_order, 999) AS sort_order
  FROM ads.all_trade_overview t
  CROSS JOIN params p
  LEFT JOIN platform_dimension d ON d.platform = t.platform
  WHERE t."date" BETWEEN p.start_date AND p.end_date
    AND (p.target_platform = 'overview' OR t.platform = p.target_platform)
),
filtered_rows AS (
  SELECT
    b."date",
    b.platform,
    b.platform_label,
    b.gmv,
    b.user_pay_amount,
    b.cost,
    b.gmv_from_cost,
    b.roi,
    b.roi_from_cost,
    b.order_count,
    b.buyer_count,
    b.arpu,
    b.refund_amount_pay_time_current,
    b.refund_amount_pay_time_predicted,
    b.completeness_ratio,
    b.prediction_confidence,
    b.quality_status,
    b.refund_amount_refund_time,
    (b.gmv - b.refund_amount_pay_time_current)::NUMERIC(18, 2) AS gsv_pay_time_current,
    (b.gmv - b.refund_amount_pay_time_predicted)::NUMERIC(18, 2) AS gsv_pay_time_predicted,
    (b.gmv - b.refund_amount_refund_time)::NUMERIC(18, 2) AS gsv_refund_time,
    CASE
      WHEN b.gmv > 0 THEN ROUND(b.refund_amount_pay_time_current / NULLIF(b.gmv, 0), 6)
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_current,
    CASE
      WHEN b.gmv > 0 THEN ROUND(b.refund_amount_pay_time_predicted / NULLIF(b.gmv, 0), 6)
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_predicted,
    CASE
      WHEN b.gmv > 0 THEN ROUND(b.refund_amount_refund_time / NULLIF(b.gmv, 0), 6)
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_refund_time,
    (b.gmv - b.refund_amount_pay_time_current)::NUMERIC(18, 2) AS gsv,
    CASE
      WHEN b.gmv > 0 THEN ROUND(b.refund_amount_pay_time_current / NULLIF(b.gmv, 0), 6)
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate,
    b.sort_order
  FROM base_rows b
)
SELECT json_build_object(
  'startDate', (SELECT p.start_date::TEXT FROM params p),
  'endDate', (SELECT p.end_date::TEXT FROM params p),
  'platform', (SELECT p.target_platform FROM params p),
  'nowcastAsOfDate', NULL,
  'rows', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'date', r."date"::TEXT,
          'platform', r.platform_label,
          'gmv', r.gmv,
          'user_pay_amount', r.user_pay_amount,
          'cost', r.cost,
          'gmv_from_cost', r.gmv_from_cost,
          'roi', r.roi,
          'roi_from_cost', r.roi_from_cost,
          'order_count', r.order_count,
          'buyer_count', r.buyer_count,
          'arpu', r.arpu,
          'refund_amount_pay_time_current', r.refund_amount_pay_time_current,
          'refund_amount_pay_time_predicted', r.refund_amount_pay_time_predicted,
          'completeness_ratio', r.completeness_ratio,
          'prediction_confidence', r.prediction_confidence,
          'quality_status', r.quality_status,
          'refund_amount_refund_time', r.refund_amount_refund_time,
          'gsv_pay_time_current', r.gsv_pay_time_current,
          'gsv_pay_time_predicted', r.gsv_pay_time_predicted,
          'gsv_refund_time', r.gsv_refund_time,
          'refund_rate_pay_time_current', r.refund_rate_pay_time_current,
          'refund_rate_pay_time_predicted', r.refund_rate_pay_time_predicted,
          'refund_rate_refund_time', r.refund_rate_refund_time,
          'gsv', r.gsv,
          'refund_rate', r.refund_rate
        )
        ORDER BY r."date", r.sort_order, r.platform
      )
      FROM filtered_rows r
    ),
    '[]'::JSON
  )
)::TEXT;
