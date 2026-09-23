
WITH params AS (
  SELECT
    __START_DATE_LITERAL__::DATE AS current_start_date,
    __END_DATE_LITERAL__::DATE AS current_end_date,
    __PREV_START_DATE_LITERAL__::DATE AS previous_start_date,
    __PREV_END_DATE_LITERAL__::DATE AS previous_end_date,
    __PLATFORM_LITERAL__::TEXT AS target_platform
),
current_calendar AS (
  SELECT generate_series(p.current_start_date, p.current_end_date, INTERVAL '1 day')::DATE AS "date"
  FROM params p
),
previous_calendar AS (
  SELECT generate_series(p.previous_start_date, p.previous_end_date, INTERVAL '1 day')::DATE AS "date"
  FROM params p
),
current_agg AS (
  SELECT
    t."date",
    SUM(COALESCE(t.gmv, 0))::NUMERIC(18, 2) AS gmv,
    SUM(COALESCE(t.user_pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
    SUM(COALESCE(t.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time_current,
    SUM(COALESCE(t.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time,
    SUM(COALESCE(t.order_count, 0))::BIGINT AS order_count,
    SUM(COALESCE(t.buyer_count, 0))::BIGINT AS buyer_count
  FROM ads.all_trade_overview t
  CROSS JOIN params p
  WHERE t."date" BETWEEN p.current_start_date AND p.current_end_date
    AND (p.target_platform = 'overview' OR t.platform = p.target_platform)
  GROUP BY t."date"
),
previous_agg AS (
  SELECT
    t."date",
    SUM(COALESCE(t.gmv, 0))::NUMERIC(18, 2) AS gmv,
    SUM(COALESCE(t.user_pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
    SUM(COALESCE(t.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time_current,
    SUM(COALESCE(t.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time,
    SUM(COALESCE(t.order_count, 0))::BIGINT AS order_count,
    SUM(COALESCE(t.buyer_count, 0))::BIGINT AS buyer_count
  FROM ads.all_trade_overview t
  CROSS JOIN params p
  WHERE t."date" BETWEEN p.previous_start_date AND p.previous_end_date
    AND (p.target_platform = 'overview' OR t.platform = p.target_platform)
  GROUP BY t."date"
),
current_series AS (
  SELECT
    c."date",
    COALESCE(a.gmv, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(a.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
    COALESCE(a.gmv - a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS gsv_pay_time_current,
    COALESCE(a.gmv - a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS gsv_pay_time_predicted,
    COALESCE(a.gmv - a.refund_amount_refund_time, 0)::NUMERIC(18, 2) AS gsv_refund_time,
    COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS refund_amount_pay_time_current,
    COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS refund_amount_pay_time_predicted,
    COALESCE(a.refund_amount_refund_time, 0)::NUMERIC(18, 2) AS refund_amount_refund_time,
    CASE
      WHEN COALESCE(a.gmv, 0) > 0 THEN ROUND(
        COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC / NULLIF(COALESCE(a.gmv, 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_current,
    CASE
      WHEN COALESCE(a.gmv, 0) > 0 THEN ROUND(
        COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC / NULLIF(COALESCE(a.gmv, 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_predicted,
    CASE
      WHEN COALESCE(a.gmv, 0) > 0 THEN ROUND(
        COALESCE(a.refund_amount_refund_time, 0)::NUMERIC / NULLIF(COALESCE(a.gmv, 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_refund_time,
    COALESCE(a.gmv - a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS gsv,
    CASE
      WHEN COALESCE(a.gmv, 0) > 0 THEN ROUND(
        COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC / NULLIF(COALESCE(a.gmv, 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate,
    COALESCE(a.order_count, 0)::BIGINT AS order_count,
    COALESCE(a.buyer_count, 0)::BIGINT AS buyer_count
  FROM current_calendar c
  LEFT JOIN current_agg a ON a."date" = c."date"
  ORDER BY c."date"
),
previous_series AS (
  SELECT
    c."date",
    COALESCE(a.gmv, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(a.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
    COALESCE(a.gmv - a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS gsv_pay_time_current,
    COALESCE(a.gmv - a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS gsv_pay_time_predicted,
    COALESCE(a.gmv - a.refund_amount_refund_time, 0)::NUMERIC(18, 2) AS gsv_refund_time,
    COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS refund_amount_pay_time_current,
    COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS refund_amount_pay_time_predicted,
    COALESCE(a.refund_amount_refund_time, 0)::NUMERIC(18, 2) AS refund_amount_refund_time,
    CASE
      WHEN COALESCE(a.gmv, 0) > 0 THEN ROUND(
        COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC / NULLIF(COALESCE(a.gmv, 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_current,
    CASE
      WHEN COALESCE(a.gmv, 0) > 0 THEN ROUND(
        COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC / NULLIF(COALESCE(a.gmv, 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_predicted,
    CASE
      WHEN COALESCE(a.gmv, 0) > 0 THEN ROUND(
        COALESCE(a.refund_amount_refund_time, 0)::NUMERIC / NULLIF(COALESCE(a.gmv, 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_refund_time,
    COALESCE(a.gmv - a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS gsv,
    CASE
      WHEN COALESCE(a.gmv, 0) > 0 THEN ROUND(
        COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC / NULLIF(COALESCE(a.gmv, 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate,
    COALESCE(a.order_count, 0)::BIGINT AS order_count,
    COALESCE(a.buyer_count, 0)::BIGINT AS buyer_count
  FROM previous_calendar c
  LEFT JOIN previous_agg a ON a."date" = c."date"
  ORDER BY c."date"
),
current_totals AS (
  SELECT
    COALESCE(SUM(s.gmv), 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(SUM(s.user_pay_amount), 0)::NUMERIC(18, 2) AS user_pay_amount,
    COALESCE(SUM(s.gsv_pay_time_current), 0)::NUMERIC(18, 2) AS gsv_pay_time_current,
    COALESCE(SUM(s.gsv_pay_time_predicted), 0)::NUMERIC(18, 2) AS gsv_pay_time_predicted,
    COALESCE(SUM(s.gsv_refund_time), 0)::NUMERIC(18, 2) AS gsv_refund_time,
    COALESCE(SUM(s.refund_amount_pay_time_current), 0)::NUMERIC(18, 2) AS refund_amount_pay_time_current,
    COALESCE(SUM(s.refund_amount_pay_time_predicted), 0)::NUMERIC(18, 2) AS refund_amount_pay_time_predicted,
    COALESCE(SUM(s.refund_amount_refund_time), 0)::NUMERIC(18, 2) AS refund_amount_refund_time,
    COALESCE(SUM(s.gsv_pay_time_current), 0)::NUMERIC(18, 2) AS gsv,
    COALESCE(SUM(s.order_count), 0)::BIGINT AS order_count,
    COALESCE(SUM(s.buyer_count), 0)::BIGINT AS buyer_count,
    CASE
      WHEN COALESCE(SUM(s.buyer_count), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.gmv), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.buyer_count), 0)::NUMERIC, 0),
        4
      )
      ELSE NULL::NUMERIC(18, 4)
    END AS arpu,
    CASE
      WHEN COALESCE(SUM(s.gmv), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.refund_amount_pay_time_current), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.gmv), 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_current,
    CASE
      WHEN COALESCE(SUM(s.gmv), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.refund_amount_pay_time_current), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.gmv), 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_predicted,
    CASE
      WHEN COALESCE(SUM(s.gmv), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.refund_amount_refund_time), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.gmv), 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_refund_time,
    CASE
      WHEN COALESCE(SUM(s.gmv), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.refund_amount_pay_time_current), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.gmv), 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate
  FROM current_series s
),
previous_totals AS (
  SELECT
    COALESCE(SUM(s.gmv), 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(SUM(s.user_pay_amount), 0)::NUMERIC(18, 2) AS user_pay_amount,
    COALESCE(SUM(s.gsv_pay_time_current), 0)::NUMERIC(18, 2) AS gsv_pay_time_current,
    COALESCE(SUM(s.gsv_pay_time_predicted), 0)::NUMERIC(18, 2) AS gsv_pay_time_predicted,
    COALESCE(SUM(s.gsv_refund_time), 0)::NUMERIC(18, 2) AS gsv_refund_time,
    COALESCE(SUM(s.refund_amount_pay_time_current), 0)::NUMERIC(18, 2) AS refund_amount_pay_time_current,
    COALESCE(SUM(s.refund_amount_pay_time_predicted), 0)::NUMERIC(18, 2) AS refund_amount_pay_time_predicted,
    COALESCE(SUM(s.refund_amount_refund_time), 0)::NUMERIC(18, 2) AS refund_amount_refund_time,
    COALESCE(SUM(s.gsv_pay_time_current), 0)::NUMERIC(18, 2) AS gsv,
    COALESCE(SUM(s.order_count), 0)::BIGINT AS order_count,
    COALESCE(SUM(s.buyer_count), 0)::BIGINT AS buyer_count,
    CASE
      WHEN COALESCE(SUM(s.buyer_count), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.gmv), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.buyer_count), 0)::NUMERIC, 0),
        4
      )
      ELSE NULL::NUMERIC(18, 4)
    END AS arpu,
    CASE
      WHEN COALESCE(SUM(s.gmv), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.refund_amount_pay_time_current), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.gmv), 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_current,
    CASE
      WHEN COALESCE(SUM(s.gmv), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.refund_amount_pay_time_current), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.gmv), 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_pay_time_predicted,
    CASE
      WHEN COALESCE(SUM(s.gmv), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.refund_amount_refund_time), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.gmv), 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate_refund_time,
    CASE
      WHEN COALESCE(SUM(s.gmv), 0) > 0 THEN ROUND(
        COALESCE(SUM(s.refund_amount_pay_time_current), 0)::NUMERIC / NULLIF(COALESCE(SUM(s.gmv), 0)::NUMERIC, 0),
        6
      )
      ELSE NULL::NUMERIC(10, 6)
    END AS refund_rate
  FROM previous_series s
),
carrier_dimension AS (
  SELECT *
  FROM (
    VALUES
      ('live', '直播', '直播成交金额', 1),
      ('short_video', '短视频', '短视频成交金额', 2),
      ('product_card', '商品卡', '商品卡成交金额', 3),
      ('image_text', '图文', '图文成交金额', 4),
      ('other', '其他', '其他成交金额', 5)
  ) AS t(key, carrier_type, label, sort_order)
),
current_carrier AS (
  SELECT
    d.key,
    d.carrier_type,
    d.label,
    d.sort_order,
    COALESCE(SUM(t.trade_amount), 0)::NUMERIC(18, 2) AS trade_amount
  FROM carrier_dimension d
  CROSS JOIN params p
  LEFT JOIN ads.douyin_trade_sale_carrier_daily t
    ON t.carrier_type = d.carrier_type
   AND t."date" BETWEEN p.current_start_date AND p.current_end_date
   AND p.target_platform = 'douyin'
  GROUP BY d.key, d.carrier_type, d.label, d.sort_order
),
previous_carrier AS (
  SELECT
    d.key,
    d.carrier_type,
    COALESCE(SUM(t.trade_amount), 0)::NUMERIC(18, 2) AS previous_trade_amount
  FROM carrier_dimension d
  CROSS JOIN params p
  LEFT JOIN ads.douyin_trade_sale_carrier_daily t
    ON t.carrier_type = d.carrier_type
   AND t."date" BETWEEN p.previous_start_date AND p.previous_end_date
   AND p.target_platform = 'douyin'
  GROUP BY d.key, d.carrier_type
),
carrier_cards AS (
  SELECT
    c.key,
    c.carrier_type,
    c.label,
    c.sort_order,
    c.trade_amount,
    COALESCE(p.previous_trade_amount, 0)::NUMERIC(18, 2) AS previous_trade_amount,
    CASE
      WHEN COALESCE(p.previous_trade_amount, 0) = 0 THEN
        CASE
          WHEN COALESCE(c.trade_amount, 0) = 0 THEN 0::NUMERIC(18, 4)
          ELSE NULL::NUMERIC(18, 4)
        END
      ELSE ROUND(
        ((c.trade_amount - p.previous_trade_amount) / NULLIF(ABS(p.previous_trade_amount), 0)) * 100,
        4
      )
    END AS change_rate
  FROM current_carrier c
  LEFT JOIN previous_carrier p
    ON p.key = c.key
)__PLATFORM_SHARE_CTE_SQL__
SELECT json_build_object(
  'startDate', (SELECT p.current_start_date::TEXT FROM params p),
  'endDate', (SELECT p.current_end_date::TEXT FROM params p),
  'prevStartDate', (SELECT p.previous_start_date::TEXT FROM params p),
  'prevEndDate', (SELECT p.previous_end_date::TEXT FROM params p),
  'platform', (SELECT p.target_platform FROM params p),
  'nowcastAsOfDate', NULL,
  'nowcastQuality', NULL,
  'currentSeries', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'date', s."date"::TEXT,
          'gmv', s.gmv,
          'user_pay_amount', s.user_pay_amount,
          'gsv_pay_time_current', s.gsv_pay_time_current,
          'gsv_pay_time_predicted', s.gsv_pay_time_predicted,
          'gsv_refund_time', s.gsv_refund_time,
          'refund_amount_pay_time_current', s.refund_amount_pay_time_current,
          'refund_amount_pay_time_predicted', s.refund_amount_pay_time_predicted,
          'refund_amount_refund_time', s.refund_amount_refund_time,
          'refund_rate_pay_time_current', s.refund_rate_pay_time_current,
          'refund_rate_pay_time_predicted', s.refund_rate_pay_time_predicted,
          'refund_rate_refund_time', s.refund_rate_refund_time,
          'gsv', s.gsv,
          'refund_rate', s.refund_rate,
          'order_count', s.order_count,
          'buyer_count', s.buyer_count
        )
        ORDER BY s."date"
      )
      FROM current_series s
    ),
    '[]'::JSON
  ),
  'previousSeries', COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'date', s."date"::TEXT,
          'gmv', s.gmv,
          'user_pay_amount', s.user_pay_amount,
          'gsv_pay_time_current', s.gsv_pay_time_current,
          'gsv_pay_time_predicted', s.gsv_pay_time_predicted,
          'gsv_refund_time', s.gsv_refund_time,
          'refund_amount_pay_time_current', s.refund_amount_pay_time_current,
          'refund_amount_pay_time_predicted', s.refund_amount_pay_time_predicted,
          'refund_amount_refund_time', s.refund_amount_refund_time,
          'refund_rate_pay_time_current', s.refund_rate_pay_time_current,
          'refund_rate_pay_time_predicted', s.refund_rate_pay_time_predicted,
          'refund_rate_refund_time', s.refund_rate_refund_time,
          'gsv', s.gsv,
          'refund_rate', s.refund_rate,
          'order_count', s.order_count,
          'buyer_count', s.buyer_count
        )
        ORDER BY s."date"
      )
      FROM previous_series s
    ),
    '[]'::JSON
  ),
  'currentTotals', (SELECT row_to_json(t) FROM current_totals t),
  'previousTotals', (SELECT row_to_json(t) FROM previous_totals t),
  'carrierCards', CASE
    WHEN (SELECT p.target_platform FROM params p) = 'douyin' THEN COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'key', c.key,
            'carrier_type', c.carrier_type,
            'label', c.label,
            'trade_amount', c.trade_amount,
            'previous_trade_amount', c.previous_trade_amount,
            'change_rate', c.change_rate
          )
          ORDER BY c.sort_order
        )
        FROM carrier_cards c
      ),
      '[]'::JSON
    )
    ELSE '[]'::JSON
  END,
  'platformCurrent', __PLATFORM_CURRENT_SELECT_SQL__
)::TEXT;
