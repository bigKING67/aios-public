pub(crate) fn get_goods_card_traffic_metrics_sql() -> &'static str {
    r#"
    WITH scope AS (
      SELECT
        $1::DATE AS current_start_date,
        $2::DATE AS current_end_date,
        $3::DATE AS previous_start_date,
        $4::DATE AS previous_end_date,
        $5::TEXT AS target_product_id,
        NULLIF(BTRIM($6::TEXT), '') AS target_shop_id
    ),
    raw_source AS (
      SELECT src.*
      FROM ads.douyin_trade_sale_card_detail src
      CROSS JOIN scope s
      WHERE src.stat_date BETWEEN LEAST(s.current_start_date, s.previous_start_date)
        AND GREATEST(s.current_end_date, s.previous_end_date)
        AND COALESCE(NULLIF(BTRIM(src.product_id), ''), '') = s.target_product_id
        AND (s.target_shop_id IS NULL OR COALESCE(NULLIF(BTRIM(src.shop_id), ''), '') = s.target_shop_id)
    ),
    clean_source AS (
      SELECT
        src.stat_date,
        CASE
          WHEN NULLIF(BTRIM(src."售卖类型"), '') IS NULL OR BTRIM(src."售卖类型") IN ('-', '--') THEN NULL
          ELSE BTRIM(src."售卖类型")
        END AS sell_type,
        CASE
          WHEN NULLIF(BTRIM(src."投广时段"), '') IS NULL OR BTRIM(src."投广时段") IN ('-', '--') THEN NULL
          ELSE BTRIM(src."投广时段")
        END AS ad_time,
        CASE
          WHEN NULLIF(BTRIM(src."一级渠道"), '') IS NULL OR BTRIM(src."一级渠道") IN ('-', '--') THEN NULL
          ELSE BTRIM(src."一级渠道")
        END AS channel_level1,
        CASE
          WHEN NULLIF(BTRIM(src."二级渠道"), '') IS NULL OR BTRIM(src."二级渠道") IN ('-', '--') THEN NULL
          ELSE BTRIM(src."二级渠道")
        END AS channel_level2,
        COALESCE(src.card_exposure_user_count, 0)::DOUBLE PRECISION AS card_exposure_user_count,
        COALESCE(src.card_click_user_count, 0)::DOUBLE PRECISION AS card_click_user_count,
        COALESCE(src.card_buyer_count, 0)::DOUBLE PRECISION AS card_buyer_count,
        COALESCE(src.card_cart_user_count, 0)::DOUBLE PRECISION AS card_cart_user_count,
        COALESCE(src.card_favorite_user_count, 0)::DOUBLE PRECISION AS card_favorite_user_count,
        COALESCE(src.card_bounce_user_count, 0)::DOUBLE PRECISION AS card_bounce_user_count,
        COALESCE(src.card_user_pay_amount, 0)::DOUBLE PRECISION AS card_user_pay_amount,
        COALESCE(src.card_order_count, 0)::DOUBLE PRECISION AS card_order_count
      FROM raw_source src
    ),
    normalized_nodes AS (
      SELECT
        cs.*,
        CASE
          WHEN cs.channel_level2 IS NOT NULL THEN 4
          WHEN cs.channel_level1 IS NOT NULL THEN 3
          WHEN cs.ad_time IS NOT NULL THEN 2
          WHEN cs.sell_type IS NOT NULL THEN 1
          ELSE NULL
        END AS node_level,
        COALESCE(cs.sell_type, '未分类') AS path_l1,
        COALESCE(cs.ad_time, '未分类') AS path_l2,
        COALESCE(cs.channel_level1, '未分类') AS path_l3,
        COALESCE(cs.channel_level2, '未分类') AS path_l4
      FROM clean_source cs
      WHERE cs.sell_type IS NOT NULL
         OR cs.ad_time IS NOT NULL
         OR cs.channel_level1 IS NOT NULL
         OR cs.channel_level2 IS NOT NULL
    ),
    expanded AS (
      SELECT
        n.node_level AS source_level,
        CASE n.node_level
          WHEN 1 THEN n.path_l1
          WHEN 2 THEN CONCAT_WS('|', n.path_l1, n.path_l2)
          WHEN 3 THEN CONCAT_WS('|', n.path_l1, n.path_l2, n.path_l3)
          ELSE CONCAT_WS('|', n.path_l1, n.path_l2, n.path_l3, n.path_l4)
        END AS source_key,
        CASE n.node_level
          WHEN 1 THEN 'ROOT'
          WHEN 2 THEN n.path_l1
          WHEN 3 THEN CONCAT_WS('|', n.path_l1, n.path_l2)
          ELSE CONCAT_WS('|', n.path_l1, n.path_l2, n.path_l3)
        END AS parent_source_key,
        CASE n.node_level
          WHEN 1 THEN n.path_l1
          WHEN 2 THEN n.path_l2
          WHEN 3 THEN n.path_l3
          ELSE n.path_l4
        END AS source_name,
        CASE n.node_level
          WHEN 1 THEN ''
          WHEN 2 THEN n.path_l1
          WHEN 3 THEN n.path_l2
          ELSE n.path_l3
        END AS parent_source_name,
        n.stat_date,
        n.card_exposure_user_count,
        n.card_click_user_count,
        n.card_buyer_count,
        n.card_cart_user_count,
        n.card_favorite_user_count,
        n.card_bounce_user_count,
        n.card_user_pay_amount,
        n.card_order_count
      FROM normalized_nodes n
    ),
    aggregated AS (
      SELECT
        e.source_level,
        e.source_key,
        e.parent_source_key,
        e.source_name,
        e.parent_source_name,
        SUM(CASE WHEN e.stat_date BETWEEN s.current_start_date AND s.current_end_date THEN e.card_exposure_user_count ELSE 0 END) AS curr_card_exposure_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.previous_start_date AND s.previous_end_date THEN e.card_exposure_user_count ELSE 0 END) AS prev_card_exposure_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.current_start_date AND s.current_end_date THEN e.card_click_user_count ELSE 0 END) AS curr_card_click_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.previous_start_date AND s.previous_end_date THEN e.card_click_user_count ELSE 0 END) AS prev_card_click_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.current_start_date AND s.current_end_date THEN e.card_buyer_count ELSE 0 END) AS curr_card_buyer_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.previous_start_date AND s.previous_end_date THEN e.card_buyer_count ELSE 0 END) AS prev_card_buyer_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.current_start_date AND s.current_end_date THEN e.card_cart_user_count ELSE 0 END) AS curr_card_cart_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.previous_start_date AND s.previous_end_date THEN e.card_cart_user_count ELSE 0 END) AS prev_card_cart_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.current_start_date AND s.current_end_date THEN e.card_favorite_user_count ELSE 0 END) AS curr_card_favorite_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.previous_start_date AND s.previous_end_date THEN e.card_favorite_user_count ELSE 0 END) AS prev_card_favorite_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.current_start_date AND s.current_end_date THEN e.card_bounce_user_count ELSE 0 END) AS curr_card_bounce_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.previous_start_date AND s.previous_end_date THEN e.card_bounce_user_count ELSE 0 END) AS prev_card_bounce_user_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.current_start_date AND s.current_end_date THEN e.card_user_pay_amount ELSE 0 END) AS curr_card_user_pay_amount,
        SUM(CASE WHEN e.stat_date BETWEEN s.previous_start_date AND s.previous_end_date THEN e.card_user_pay_amount ELSE 0 END) AS prev_card_user_pay_amount,
        SUM(CASE WHEN e.stat_date BETWEEN s.current_start_date AND s.current_end_date THEN e.card_order_count ELSE 0 END) AS curr_card_order_count,
        SUM(CASE WHEN e.stat_date BETWEEN s.previous_start_date AND s.previous_end_date THEN e.card_order_count ELSE 0 END) AS prev_card_order_count
      FROM expanded e
      CROSS JOIN scope s
      GROUP BY
        e.source_level,
        e.source_key,
        e.parent_source_key,
        e.source_name,
        e.parent_source_name
    ),
    enriched AS (
      SELECT
        a.*,
        CASE
          WHEN a.curr_card_exposure_user_count > 0 THEN a.curr_card_click_user_count / a.curr_card_exposure_user_count
          ELSE 0::DOUBLE PRECISION
        END AS curr_card_click_rate_user,
        CASE
          WHEN a.prev_card_exposure_user_count > 0 THEN a.prev_card_click_user_count / a.prev_card_exposure_user_count
          ELSE 0::DOUBLE PRECISION
        END AS prev_card_click_rate_user,
        CASE
          WHEN a.curr_card_click_user_count > 0 THEN a.curr_card_buyer_count / a.curr_card_click_user_count
          ELSE 0::DOUBLE PRECISION
        END AS curr_card_click_to_pay_rate_user,
        CASE
          WHEN a.prev_card_click_user_count > 0 THEN a.prev_card_buyer_count / a.prev_card_click_user_count
          ELSE 0::DOUBLE PRECISION
        END AS prev_card_click_to_pay_rate_user,
        CASE
          WHEN a.curr_card_exposure_user_count > 0 THEN a.curr_card_buyer_count / a.curr_card_exposure_user_count
          ELSE 0::DOUBLE PRECISION
        END AS curr_card_exposure_to_pay_rate_user,
        CASE
          WHEN a.prev_card_exposure_user_count > 0 THEN a.prev_card_buyer_count / a.prev_card_exposure_user_count
          ELSE 0::DOUBLE PRECISION
        END AS prev_card_exposure_to_pay_rate_user
      FROM aggregated a
      WHERE a.curr_card_exposure_user_count <> 0
         OR a.prev_card_exposure_user_count <> 0
         OR a.curr_card_click_user_count <> 0
         OR a.prev_card_click_user_count <> 0
         OR a.curr_card_buyer_count <> 0
         OR a.prev_card_buyer_count <> 0
         OR a.curr_card_cart_user_count <> 0
         OR a.prev_card_cart_user_count <> 0
         OR a.curr_card_favorite_user_count <> 0
         OR a.prev_card_favorite_user_count <> 0
         OR a.curr_card_bounce_user_count <> 0
         OR a.prev_card_bounce_user_count <> 0
         OR a.curr_card_user_pay_amount <> 0
         OR a.prev_card_user_pay_amount <> 0
         OR a.curr_card_order_count <> 0
         OR a.prev_card_order_count <> 0
    )
    SELECT
      source_key,
      parent_source_key,
      source_level,
      source_name,
      parent_source_name,
      curr_card_exposure_user_count::DOUBLE PRECISION AS curr_card_exposure_user_count,
      prev_card_exposure_user_count::DOUBLE PRECISION AS prev_card_exposure_user_count,
      curr_card_click_user_count::DOUBLE PRECISION AS curr_card_click_user_count,
      prev_card_click_user_count::DOUBLE PRECISION AS prev_card_click_user_count,
      curr_card_buyer_count::DOUBLE PRECISION AS curr_card_buyer_count,
      prev_card_buyer_count::DOUBLE PRECISION AS prev_card_buyer_count,
      curr_card_cart_user_count::DOUBLE PRECISION AS curr_card_cart_user_count,
      prev_card_cart_user_count::DOUBLE PRECISION AS prev_card_cart_user_count,
      curr_card_favorite_user_count::DOUBLE PRECISION AS curr_card_favorite_user_count,
      prev_card_favorite_user_count::DOUBLE PRECISION AS prev_card_favorite_user_count,
      curr_card_bounce_user_count::DOUBLE PRECISION AS curr_card_bounce_user_count,
      prev_card_bounce_user_count::DOUBLE PRECISION AS prev_card_bounce_user_count,
      curr_card_user_pay_amount::DOUBLE PRECISION AS curr_card_user_pay_amount,
      prev_card_user_pay_amount::DOUBLE PRECISION AS prev_card_user_pay_amount,
      curr_card_order_count::DOUBLE PRECISION AS curr_card_order_count,
      prev_card_order_count::DOUBLE PRECISION AS prev_card_order_count,
      curr_card_click_rate_user::DOUBLE PRECISION AS curr_card_click_rate_user,
      prev_card_click_rate_user::DOUBLE PRECISION AS prev_card_click_rate_user,
      curr_card_click_to_pay_rate_user::DOUBLE PRECISION AS curr_card_click_to_pay_rate_user,
      prev_card_click_to_pay_rate_user::DOUBLE PRECISION AS prev_card_click_to_pay_rate_user,
      curr_card_exposure_to_pay_rate_user::DOUBLE PRECISION AS curr_card_exposure_to_pay_rate_user,
      prev_card_exposure_to_pay_rate_user::DOUBLE PRECISION AS prev_card_exposure_to_pay_rate_user
    FROM enriched
    ORDER BY source_level ASC, parent_source_name ASC, curr_card_user_pay_amount DESC, source_name ASC
    "#
}
