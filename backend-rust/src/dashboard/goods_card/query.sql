WITH params AS (
  SELECT
    __START_DATE_LITERAL__::DATE AS current_start_date,
    __END_DATE_LITERAL__::DATE AS current_end_date,
    __PREV_START_DATE_LITERAL__::DATE AS previous_start_date,
    __PREV_END_DATE_LITERAL__::DATE AS previous_end_date
),
current_calendar AS (
  SELECT generate_series(p.current_start_date, p.current_end_date, INTERVAL '1 day')::DATE AS stat_date
  FROM params p
),
current_rows AS (
  SELECT src.*
  FROM ads.douyin_trade_sale_card src
  CROSS JOIN params p
  WHERE src."date" BETWEEN p.current_start_date AND p.current_end_date
),
previous_rows AS (
  SELECT src.*
  FROM ads.douyin_trade_sale_card src
  CROSS JOIN params p
  WHERE src."date" BETWEEN p.previous_start_date AND p.previous_end_date
),
current_carrier_totals AS (
  SELECT
    COALESCE(SUM(t.trade_amount), 0)::DOUBLE PRECISION AS card_trade_amount,
    COALESCE(SUM(t.refund_amount_pay_time), 0)::DOUBLE PRECISION AS card_refund_amount_pay_time,
    (
      COALESCE(SUM(t.trade_amount), 0)
      - COALESCE(SUM(t.refund_amount_pay_time), 0)
    )::DOUBLE PRECISION AS card_gsv_pay_time,
    CASE
      WHEN COALESCE(SUM(t.trade_amount), 0) > 0
        THEN ROUND(
          COALESCE(SUM(t.refund_amount_pay_time), 0)::NUMERIC
          / NULLIF(COALESCE(SUM(t.trade_amount), 0)::NUMERIC, 0),
          6
        )::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_refund_rate_pay_time
  FROM ads.douyin_trade_sale_carrier_daily t
  CROSS JOIN params p
  WHERE t.carrier_type = '商品卡'
    AND t."date" BETWEEN p.current_start_date AND p.current_end_date
),
previous_carrier_totals AS (
  SELECT
    COALESCE(SUM(t.trade_amount), 0)::DOUBLE PRECISION AS card_trade_amount,
    COALESCE(SUM(t.refund_amount_pay_time), 0)::DOUBLE PRECISION AS card_refund_amount_pay_time,
    (
      COALESCE(SUM(t.trade_amount), 0)
      - COALESCE(SUM(t.refund_amount_pay_time), 0)
    )::DOUBLE PRECISION AS card_gsv_pay_time,
    CASE
      WHEN COALESCE(SUM(t.trade_amount), 0) > 0
        THEN ROUND(
          COALESCE(SUM(t.refund_amount_pay_time), 0)::NUMERIC
          / NULLIF(COALESCE(SUM(t.trade_amount), 0)::NUMERIC, 0),
          6
        )::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_refund_rate_pay_time
  FROM ads.douyin_trade_sale_carrier_daily t
  CROSS JOIN params p
  WHERE t.carrier_type = '商品卡'
    AND t."date" BETWEEN p.previous_start_date AND p.previous_end_date
),
current_totals AS (
  SELECT
    (SELECT card_trade_amount FROM current_carrier_totals)::DOUBLE PRECISION AS card_trade_amount,
    COALESCE(SUM(card_user_pay_amount), 0)::DOUBLE PRECISION AS card_user_pay_amount,
    (SELECT card_gsv_pay_time FROM current_carrier_totals)::DOUBLE PRECISION AS card_gsv_pay_time,
    (SELECT card_refund_amount_pay_time FROM current_carrier_totals)::DOUBLE PRECISION AS card_refund_amount_pay_time,
    (SELECT card_refund_rate_pay_time FROM current_carrier_totals)::DOUBLE PRECISION AS card_refund_rate_pay_time,
    COALESCE(SUM(card_exposure_user_count), 0)::DOUBLE PRECISION AS card_exposure_user_count,
    COALESCE(SUM(card_click_user_count), 0)::DOUBLE PRECISION AS card_click_user_count,
    COALESCE(SUM(card_buyer_count), 0)::DOUBLE PRECISION AS card_buyer_count,
    COALESCE(SUM(card_order_count), 0)::DOUBLE PRECISION AS card_order_count,
    COALESCE(SUM(card_cart_user_count), 0)::DOUBLE PRECISION AS card_cart_user_count,
    COALESCE(SUM(card_favorite_user_count), 0)::DOUBLE PRECISION AS card_favorite_user_count,
    COALESCE(SUM(first_buy_user_count), 0)::DOUBLE PRECISION AS first_buy_user_count,
    COALESCE(SUM(rebuy_user_count), 0)::DOUBLE PRECISION AS rebuy_user_count,
    COALESCE(SUM(card_click_count), 0)::DOUBLE PRECISION AS card_click_count,
    COALESCE(SUM(card_exposure_count), 0)::DOUBLE PRECISION AS card_exposure_count,
    COALESCE(SUM(platform_support_exposure_count), 0)::DOUBLE PRECISION AS platform_support_exposure_count,
    CASE
      WHEN COALESCE(SUM(card_exposure_user_count), 0) > 0
        THEN ROUND((SUM(card_click_user_count)::NUMERIC / SUM(card_exposure_user_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_click_rate_user,
    CASE
      WHEN COALESCE(SUM(card_click_user_count), 0) > 0
        THEN ROUND((SUM(card_buyer_count)::NUMERIC / SUM(card_click_user_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_click_to_pay_rate_user,
    CASE
      WHEN COALESCE(SUM(card_buyer_count), 0) > 0
        THEN ROUND((SUM(first_buy_user_count)::NUMERIC / SUM(card_buyer_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS first_buy_new_rate,
    CASE
      WHEN COALESCE(SUM(card_buyer_count), 0) > 0
        THEN ROUND((SUM(rebuy_user_count)::NUMERIC / SUM(card_buyer_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS rebuy_old_rate,
    CASE
      WHEN COALESCE(SUM(card_buyer_count), 0) > 0
        THEN ROUND((SUM(card_user_pay_amount)::NUMERIC / SUM(card_buyer_count)::NUMERIC), 2)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_avg_order_value,
    CASE
      WHEN COALESCE(SUM(card_exposure_user_count), 0) > 0
        THEN ROUND((SUM(card_buyer_count)::NUMERIC / SUM(card_exposure_user_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_exposure_to_pay_rate_user
  FROM current_rows
),
previous_totals AS (
  SELECT
    (SELECT card_trade_amount FROM previous_carrier_totals)::DOUBLE PRECISION AS card_trade_amount,
    COALESCE(SUM(card_user_pay_amount), 0)::DOUBLE PRECISION AS card_user_pay_amount,
    (SELECT card_gsv_pay_time FROM previous_carrier_totals)::DOUBLE PRECISION AS card_gsv_pay_time,
    (SELECT card_refund_amount_pay_time FROM previous_carrier_totals)::DOUBLE PRECISION AS card_refund_amount_pay_time,
    (SELECT card_refund_rate_pay_time FROM previous_carrier_totals)::DOUBLE PRECISION AS card_refund_rate_pay_time,
    COALESCE(SUM(card_exposure_user_count), 0)::DOUBLE PRECISION AS card_exposure_user_count,
    COALESCE(SUM(card_click_user_count), 0)::DOUBLE PRECISION AS card_click_user_count,
    COALESCE(SUM(card_buyer_count), 0)::DOUBLE PRECISION AS card_buyer_count,
    COALESCE(SUM(card_order_count), 0)::DOUBLE PRECISION AS card_order_count,
    COALESCE(SUM(card_cart_user_count), 0)::DOUBLE PRECISION AS card_cart_user_count,
    COALESCE(SUM(card_favorite_user_count), 0)::DOUBLE PRECISION AS card_favorite_user_count,
    COALESCE(SUM(first_buy_user_count), 0)::DOUBLE PRECISION AS first_buy_user_count,
    COALESCE(SUM(rebuy_user_count), 0)::DOUBLE PRECISION AS rebuy_user_count,
    COALESCE(SUM(card_click_count), 0)::DOUBLE PRECISION AS card_click_count,
    COALESCE(SUM(card_exposure_count), 0)::DOUBLE PRECISION AS card_exposure_count,
    COALESCE(SUM(platform_support_exposure_count), 0)::DOUBLE PRECISION AS platform_support_exposure_count,
    CASE
      WHEN COALESCE(SUM(card_exposure_user_count), 0) > 0
        THEN ROUND((SUM(card_click_user_count)::NUMERIC / SUM(card_exposure_user_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_click_rate_user,
    CASE
      WHEN COALESCE(SUM(card_click_user_count), 0) > 0
        THEN ROUND((SUM(card_buyer_count)::NUMERIC / SUM(card_click_user_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_click_to_pay_rate_user,
    CASE
      WHEN COALESCE(SUM(card_buyer_count), 0) > 0
        THEN ROUND((SUM(first_buy_user_count)::NUMERIC / SUM(card_buyer_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS first_buy_new_rate,
    CASE
      WHEN COALESCE(SUM(card_buyer_count), 0) > 0
        THEN ROUND((SUM(rebuy_user_count)::NUMERIC / SUM(card_buyer_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS rebuy_old_rate,
    CASE
      WHEN COALESCE(SUM(card_buyer_count), 0) > 0
        THEN ROUND((SUM(card_user_pay_amount)::NUMERIC / SUM(card_buyer_count)::NUMERIC), 2)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_avg_order_value,
    CASE
      WHEN COALESCE(SUM(card_exposure_user_count), 0) > 0
        THEN ROUND((SUM(card_buyer_count)::NUMERIC / SUM(card_exposure_user_count)::NUMERIC), 6)::DOUBLE PRECISION
      ELSE NULL::DOUBLE PRECISION
    END AS card_exposure_to_pay_rate_user
  FROM previous_rows
),
trend AS (
  SELECT
    cal.stat_date AS "date",
    COALESCE(SUM(src.card_user_pay_amount), 0)::DOUBLE PRECISION AS card_user_pay_amount,
    COALESCE(SUM(src.card_exposure_user_count), 0)::DOUBLE PRECISION AS card_exposure_user_count
  FROM current_calendar cal
  LEFT JOIN current_rows src
    ON src."date" = cal.stat_date
  GROUP BY cal.stat_date
  ORDER BY cal.stat_date
),
as_of AS (
  SELECT
    LEAST(p.current_end_date, COALESCE(MAX(src."date"), p.current_end_date))::DATE AS as_of_date,
    MIN(src."date")::DATE AS min_date,
    MAX(src."date")::DATE AS max_date
  FROM params p
  LEFT JOIN ads.douyin_trade_sale_card src
    ON src."date" BETWEEN p.current_start_date AND p.current_end_date
  GROUP BY p.current_end_date
)
SELECT json_build_object(
  'startDate', (SELECT current_start_date::TEXT FROM params),
  'endDate', (SELECT current_end_date::TEXT FROM params),
  'prevStartDate', (SELECT previous_start_date::TEXT FROM params),
  'prevEndDate', (SELECT previous_end_date::TEXT FROM params),
  'platform', 'douyin',
  'asOfDate', (SELECT as_of_date::TEXT FROM as_of),
  'dataDateBounds', json_build_object(
    'minDate', (SELECT min_date::TEXT FROM as_of),
    'maxDate', (SELECT max_date::TEXT FROM as_of)
  ),
  'currentTotals', (SELECT row_to_json(current_totals) FROM current_totals),
  'previousTotals', (SELECT row_to_json(previous_totals) FROM previous_totals),
  'trend', COALESCE((SELECT json_agg(row_to_json(trend)) FROM trend), '[]'::JSON),
  'rows', COALESCE(
    (
      SELECT json_agg(row_to_json(row_payload))
      FROM (
        SELECT
          id,
          shop_name,
          shop_id,
          "date",
          product_title,
          product_id,
          product_url,
          card_exposure_user_count,
          card_click_user_count,
          CASE
            WHEN COALESCE(card_exposure_user_count, 0) > 0
              THEN ROUND((COALESCE(card_click_user_count, 0)::NUMERIC / card_exposure_user_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS card_click_rate_user,
          card_click_count,
          CASE
            WHEN COALESCE(card_click_user_count, 0) > 0
              THEN ROUND((COALESCE(card_click_count, 0)::NUMERIC / card_click_user_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS card_avg_click_per_user,
          new_customer_click_count,
          old_customer_click_count,
          CASE
            WHEN COALESCE(card_click_count, 0) > 0
              THEN ROUND((COALESCE(new_customer_click_count, 0)::NUMERIC / card_click_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS new_customer_click_rate,
          CASE
            WHEN COALESCE(card_click_count, 0) > 0
              THEN ROUND((COALESCE(old_customer_click_count, 0)::NUMERIC / card_click_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS old_customer_click_rate,
          card_user_pay_amount,
          card_buyer_count,
          CASE
            WHEN COALESCE(card_buyer_count, 0) > 0
              THEN ROUND((COALESCE(card_user_pay_amount, 0)::NUMERIC / card_buyer_count::NUMERIC), 2)
            ELSE NULL::NUMERIC
          END AS card_avg_order_value,
          CASE
            WHEN COALESCE(card_click_user_count, 0) > 0
              THEN ROUND((COALESCE(card_buyer_count, 0)::NUMERIC / card_click_user_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS card_click_to_pay_rate_user,
          first_buy_user_count,
          rebuy_user_count,
          CASE
            WHEN COALESCE(card_buyer_count, 0) > 0
              THEN ROUND((COALESCE(first_buy_user_count, 0)::NUMERIC / card_buyer_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS first_buy_new_rate,
          CASE
            WHEN COALESCE(card_buyer_count, 0) > 0
              THEN ROUND((COALESCE(rebuy_user_count, 0)::NUMERIC / card_buyer_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS rebuy_old_rate,
          card_exposure_count,
          CASE
            WHEN COALESCE(card_exposure_user_count, 0) > 0
              THEN ROUND((COALESCE(card_buyer_count, 0)::NUMERIC / card_exposure_user_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS card_exposure_to_pay_rate_user,
          CASE
            WHEN COALESCE(card_exposure_count, 0) > 0
              THEN ROUND((COALESCE(card_order_count, 0)::NUMERIC / card_exposure_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS card_exposure_to_pay_rate_count,
          CASE
            WHEN COALESCE(card_exposure_count, 0) > 0
              THEN ROUND((COALESCE(card_user_pay_amount, 0)::NUMERIC / card_exposure_count::NUMERIC * 1000), 6)
            ELSE NULL::NUMERIC
          END AS card_gpm,
          CASE
            WHEN COALESCE(card_exposure_count, 0) > 0
              THEN ROUND((COALESCE(card_click_count, 0)::NUMERIC / card_exposure_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS card_click_rate_count,
          CASE
            WHEN COALESCE(card_click_count, 0) > 0
              THEN ROUND((COALESCE(card_order_count, 0)::NUMERIC / card_click_count::NUMERIC), 6)
            ELSE NULL::NUMERIC
          END AS card_click_to_pay_rate_count,
          card_cart_user_count,
          card_favorite_user_count,
          card_order_count,
          platform_support_exposure_count,
          created_at,
          updated_at
        FROM current_rows
        ORDER BY "date" DESC, COALESCE(card_user_pay_amount, 0) DESC, product_id ASC, shop_id ASC
      ) row_payload
    ),
    '[]'::JSON
  )
)::TEXT
