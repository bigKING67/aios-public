pub(crate) fn get_traffic_goods_metrics_sql() -> &'static str {
    r#"
    WITH scope AS (
      SELECT
        $1::DATE AS current_start_date,
        $2::DATE AS current_end_date,
        $3::DATE AS previous_start_date,
        $4::DATE AS previous_end_date
    ),
    normalized_source AS (
      SELECT
        COALESCE(NULLIF(BTRIM(src.product_id), ''), 'UNKNOWN_PRODUCT') AS product_id,
        COALESCE(NULLIF(BTRIM(src.product_name), ''), '(未命名商品)') AS product_name,
        CASE
          WHEN COALESCE(NULLIF(BTRIM(src.source_level::TEXT), ''), '') ~ '^[0-9]+$'
            THEN GREATEST(1, LEAST(3, BTRIM(src.source_level::TEXT)::INT))
          ELSE 3
        END AS source_level,
        COALESCE(NULLIF(BTRIM(src.source_name), ''), '未知来源') AS source_name,
        COALESCE(NULLIF(BTRIM(src.parent_source_name), ''), '') AS parent_source_name_raw,
        src.stat_date,
        COALESCE(src.visitor_count, 0)::DOUBLE PRECISION AS visitor_count,
        COALESCE(src.page_view, 0)::DOUBLE PRECISION AS page_view,
        COALESCE(src.product_favorite_user_count, 0)::DOUBLE PRECISION AS product_favorite_user_count,
        COALESCE(src.cart_user_count, 0)::DOUBLE PRECISION AS cart_user_count,
        COALESCE(src.order_buyer_count, 0)::DOUBLE PRECISION AS order_buyer_count,
        COALESCE(src.pay_buyer_count, 0)::DOUBLE PRECISION AS pay_buyer_count,
        COALESCE(src.pay_quantity, 0)::DOUBLE PRECISION AS pay_quantity,
        COALESCE(src.pay_amount, 0)::DOUBLE PRECISION AS pay_amount
      FROM ads.taobao_traffic_goods_daily src
      CROSS JOIN scope s
      WHERE src.stat_date BETWEEN LEAST(s.current_start_date, s.previous_start_date)
        AND GREATEST(s.current_end_date, s.previous_end_date)
    ),
    base AS (
      SELECT
        ns.product_id,
        MAX(ns.product_name) AS product_name,
        ns.source_level,
        ns.source_name,
        CASE
          WHEN ns.source_level = 1 THEN 'All'
          ELSE COALESCE(NULLIF(ns.parent_source_name_raw, ''), '未知父级')
        END AS parent_source_name,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN ns.visitor_count
            ELSE 0
        END) AS curr_visitor_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN ns.visitor_count
            ELSE 0
        END) AS prev_visitor_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN ns.page_view
            ELSE 0
        END) AS curr_page_view,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN ns.page_view
            ELSE 0
        END) AS prev_page_view,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN ns.product_favorite_user_count
            ELSE 0
        END) AS curr_product_favorite_user_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN ns.product_favorite_user_count
            ELSE 0
        END) AS prev_product_favorite_user_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN ns.cart_user_count
            ELSE 0
        END) AS curr_cart_user_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN ns.cart_user_count
            ELSE 0
        END) AS prev_cart_user_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN ns.order_buyer_count
            ELSE 0
        END) AS curr_order_buyer_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN ns.order_buyer_count
            ELSE 0
        END) AS prev_order_buyer_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN ns.pay_buyer_count
            ELSE 0
        END) AS curr_pay_buyer_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN ns.pay_buyer_count
            ELSE 0
        END) AS prev_pay_buyer_count,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN ns.pay_quantity
            ELSE 0
        END) AS curr_pay_quantity,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN ns.pay_quantity
            ELSE 0
        END) AS prev_pay_quantity,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN ns.pay_amount
            ELSE 0
        END) AS curr_pay_amount,
        SUM(CASE
          WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN ns.pay_amount
            ELSE 0
        END) AS prev_pay_amount,
        CASE
          WHEN SUM(CASE
            WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
              THEN ns.visitor_count
              ELSE 0
          END) > 0
            THEN SUM(CASE
              WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
                THEN ns.pay_buyer_count
                ELSE 0
            END) / NULLIF(SUM(CASE
              WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
                THEN ns.visitor_count
                ELSE 0
            END), 0)
          ELSE 0.0
        END AS curr_pay_conversion_rate,
        CASE
          WHEN SUM(CASE
            WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
              THEN ns.visitor_count
              ELSE 0
          END) > 0
            THEN SUM(CASE
              WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
                THEN ns.pay_buyer_count
                ELSE 0
            END) / NULLIF(SUM(CASE
              WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
                THEN ns.visitor_count
                ELSE 0
            END), 0)
          ELSE 0.0
        END AS prev_pay_conversion_rate,
        CASE
          WHEN SUM(CASE
            WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
              THEN ns.pay_buyer_count
              ELSE 0
          END) > 0
            THEN SUM(CASE
              WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
                THEN ns.pay_amount
                ELSE 0
            END) / NULLIF(SUM(CASE
              WHEN ns.stat_date BETWEEN s.current_start_date AND s.current_end_date
                THEN ns.pay_buyer_count
                ELSE 0
            END), 0)
          ELSE 0.0
        END AS curr_avg_order_value,
        CASE
          WHEN SUM(CASE
            WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
              THEN ns.pay_buyer_count
              ELSE 0
          END) > 0
            THEN SUM(CASE
              WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
                THEN ns.pay_amount
                ELSE 0
            END) / NULLIF(SUM(CASE
              WHEN ns.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
                THEN ns.pay_buyer_count
                ELSE 0
            END), 0)
          ELSE 0.0
        END AS prev_avg_order_value
      FROM normalized_source ns
      CROSS JOIN scope s
      GROUP BY
        ns.product_id,
        ns.source_level,
        ns.source_name,
        CASE
          WHEN ns.source_level = 1 THEN 'All'
          ELSE COALESCE(NULLIF(ns.parent_source_name_raw, ''), '未知父级')
        END
    ),
    filtered AS (
      SELECT *
      FROM base
      WHERE curr_visitor_count <> 0
         OR prev_visitor_count <> 0
         OR curr_page_view <> 0
         OR prev_page_view <> 0
         OR curr_product_favorite_user_count <> 0
         OR prev_product_favorite_user_count <> 0
         OR curr_cart_user_count <> 0
         OR prev_cart_user_count <> 0
         OR curr_order_buyer_count <> 0
         OR prev_order_buyer_count <> 0
         OR curr_pay_buyer_count <> 0
         OR prev_pay_buyer_count <> 0
         OR curr_pay_quantity <> 0
         OR prev_pay_quantity <> 0
         OR curr_pay_amount <> 0
         OR prev_pay_amount <> 0
         OR COALESCE(curr_pay_conversion_rate, 0) <> 0
         OR COALESCE(prev_pay_conversion_rate, 0) <> 0
         OR COALESCE(curr_avg_order_value, 0) <> 0
         OR COALESCE(prev_avg_order_value, 0) <> 0
    ),
    as_of AS (
      SELECT
        LEAST($2::DATE, COALESCE(MAX(src.stat_date), $2::DATE))::DATE AS as_of_date
      FROM ads.taobao_traffic_goods_daily src
      WHERE src.stat_date BETWEEN $1::DATE AND $2::DATE
    )
    SELECT
      a.as_of_date::TEXT AS as_of_date,
      f.product_id,
      f.product_name,
      f.source_level,
      f.source_name,
      f.parent_source_name,
      f.curr_visitor_count,
      f.prev_visitor_count,
      f.curr_page_view,
      f.prev_page_view,
      f.curr_product_favorite_user_count,
      f.prev_product_favorite_user_count,
      f.curr_cart_user_count,
      f.prev_cart_user_count,
      f.curr_order_buyer_count,
      f.prev_order_buyer_count,
      f.curr_pay_buyer_count,
      f.prev_pay_buyer_count,
      f.curr_pay_quantity,
      f.prev_pay_quantity,
      f.curr_pay_amount,
      f.prev_pay_amount,
      f.curr_pay_conversion_rate,
      f.prev_pay_conversion_rate,
      f.curr_avg_order_value,
      f.prev_avg_order_value
    FROM filtered f
    CROSS JOIN as_of a
    ORDER BY f.product_id, f.source_level, f.parent_source_name, f.source_name
    "#
}
