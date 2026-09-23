pub(super) const ADS_QUERY: &str = r#"
        WITH top_products AS (
            SELECT
                m.product_id
            FROM ads.report_taobao_trade_product_metrics_week m
            WHERE m.week_period = $1
              AND m.platform = 'taobao'
            ORDER BY
                CASE WHEN COALESCE(m.gmv_delta, 0) = 0 THEN 1 ELSE 0 END,
                ABS(COALESCE(m.gmv_delta, 0)) DESC,
                COALESCE(m.curr_gmv, 0) DESC,
                m.product_id
            LIMIT 8
        ),
        top_product_name AS (
            SELECT
                t.product_id,
                COALESCE(latest_non_empty.product_name, '(未命名商品)') AS product_name
            FROM top_products t
            LEFT JOIN LATERAL (
                SELECT src_latest.product_name
                FROM ods.taobao_trade_sale_goods_raw src_latest
                WHERE src_latest.product_id = t.product_id
                  AND NULLIF(BTRIM(src_latest.product_name), '') IS NOT NULL
                ORDER BY
                  src_latest.stat_date DESC,
                  COALESCE(src_latest.updated_at, TIMESTAMP '1970-01-01 00:00:00') DESC
                LIMIT 1
            ) AS latest_non_empty ON TRUE
        ),
        base AS (
            SELECT
                c.week_period,
                c.platform,
                c.as_of_date,
                c.product_id,
                tpn.product_name,
                c.traffic_channel,
                c.curr_pay_amount::DOUBLE PRECISION AS curr_pay_amount,
                c.prev_pay_amount::DOUBLE PRECISION AS prev_pay_amount,
                c.pay_amount_delta::DOUBLE PRECISION AS pay_amount_delta,
                c.pay_amount_delta_contribution_rate::DOUBLE PRECISION AS pay_amount_delta_contribution,
                c.curr_pay_buyer_count::BIGINT AS curr_pay_buyer_count,
                c.curr_visitor_count::BIGINT AS curr_visitor_count,
                c.curr_cart_buyer_count::BIGINT AS curr_cart_buyer_count
            FROM ads.report_taobao_goods_traffic_channel_metrics_week c
            JOIN top_products t
              ON t.product_id = c.product_id
            LEFT JOIN top_product_name tpn
              ON tpn.product_id = c.product_id
            WHERE c.week_period = $1
              AND c.platform = 'taobao'
              AND (c.curr_pay_amount <> 0 OR c.prev_pay_amount <> 0)
        )
        SELECT
            b.week_period,
            b.platform,
            b.as_of_date,
            b.product_id,
            b.product_name,
            b.traffic_channel,
            b.curr_pay_amount,
            b.prev_pay_amount,
            b.pay_amount_delta,
            b.pay_amount_delta_contribution,
            b.curr_pay_buyer_count,
            b.curr_visitor_count,
            b.curr_cart_buyer_count,
            SUM(b.curr_pay_amount) OVER () AS total_curr_pay_amount,
            SUM(b.prev_pay_amount) OVER () AS total_prev_pay_amount
        FROM base b
        ORDER BY b.curr_pay_amount DESC, b.pay_amount_delta DESC, b.product_id, b.traffic_channel
        LIMIT 240
    "#;

pub(super) const FALLBACK_SCOPE_QUERY: &str = r#"
        SELECT
            COALESCE(
                p.as_of_date,
                LEAST($2::DATE, max_stat.max_stat_date)
            )::DATE AS as_of_date
        FROM ads.report_all_trade_week_platform p
        CROSS JOIN (
            SELECT COALESCE(MAX(stat_date), $2::DATE) AS max_stat_date
            FROM dwd.taobao_goods_sale_traffic
        ) AS max_stat
        WHERE p.week_period = $1
          AND p.platform = 'taobao'
        LIMIT 1
    "#;

pub(super) const FALLBACK_CHANNELS_QUERY: &str = r#"
        WITH product_scope AS (
            SELECT
                src.product_id,
                SUM(CASE WHEN src.stat_date BETWEEN $1 AND $2 THEN COALESCE(src.pay_amount, 0) ELSE 0 END)::DOUBLE PRECISION AS curr_gmv,
                SUM(CASE WHEN src.stat_date BETWEEN $3 AND $4 THEN COALESCE(src.pay_amount, 0) ELSE 0 END)::DOUBLE PRECISION AS prev_gmv
            FROM dwd.taobao_goods_sale_traffic src
            WHERE src.stat_date BETWEEN $3 AND $2
            GROUP BY src.product_id
        ),
        top_products AS (
            SELECT
                p.product_id
            FROM product_scope p
            WHERE p.curr_gmv <> 0 OR p.prev_gmv <> 0
            ORDER BY p.curr_gmv DESC, (p.curr_gmv - p.prev_gmv) DESC, p.product_id
            LIMIT 20
        ),
        channel_daily AS (
            SELECT
                src.product_id,
                src.stat_date,
                channel.traffic_channel,
                channel.pay_amount,
                channel.pay_buyer_count,
                channel.visitor_count,
                channel.cart_buyer_count
            FROM dwd.taobao_goods_sale_traffic src
            JOIN top_products p
              ON p.product_id = src.product_id
            CROSS JOIN LATERAL (
                VALUES
                    ('搜索', COALESCE(src.search_pay_amount, 0)::DOUBLE PRECISION, COALESCE(src.search_pay_buyer_count, 0)::BIGINT, COALESCE(src.search_visitor_count, 0)::BIGINT, COALESCE(src.search_cart_buyer_count, 0)::BIGINT),
                    ('推荐', COALESCE(src.recommend_pay_amount, 0)::DOUBLE PRECISION, COALESCE(src.recommend_pay_buyer_count, 0)::BIGINT, COALESCE(src.recommend_visitor_count, 0)::BIGINT, COALESCE(src.recommend_cart_buyer_count, 0)::BIGINT),
                    ('关键词推广', COALESCE(src.keyword_ad_pay_amount, 0)::DOUBLE PRECISION, COALESCE(src.keyword_ad_pay_buyer_count, 0)::BIGINT, COALESCE(src.keyword_ad_visitor_count, 0)::BIGINT, COALESCE(src.keyword_ad_cart_buyer_count, 0)::BIGINT),
                    ('人群推广', COALESCE(src.crowd_ad_pay_amount, 0)::DOUBLE PRECISION, COALESCE(src.crowd_ad_pay_buyer_count, 0)::BIGINT, COALESCE(src.crowd_ad_visitor_count, 0)::BIGINT, COALESCE(src.crowd_ad_cart_buyer_count, 0)::BIGINT),
                    ('场景推广', COALESCE(src.scene_ad_pay_amount, 0)::DOUBLE PRECISION, COALESCE(src.scene_ad_pay_buyer_count, 0)::BIGINT, COALESCE(src.scene_ad_visitor_count, 0)::BIGINT, COALESCE(src.scene_ad_cart_buyer_count, 0)::BIGINT)
            ) AS channel(traffic_channel, pay_amount, pay_buyer_count, visitor_count, cart_buyer_count)
            WHERE src.stat_date BETWEEN $3 AND $2
        ),
        latest_product_name AS (
            SELECT
                p.product_id,
                COALESCE(latest_non_empty.product_name, '(未命名商品)')::VARCHAR(500) AS product_name
            FROM top_products p
            LEFT JOIN LATERAL (
                SELECT src_latest.product_name
                FROM dwd.taobao_goods_sale_traffic src_latest
                WHERE src_latest.product_id = p.product_id
                  AND NULLIF(BTRIM(src_latest.product_name), '') IS NOT NULL
                ORDER BY
                  src_latest.stat_date DESC,
                  COALESCE(src_latest.updated_at, TIMESTAMP '1970-01-01 00:00:00') DESC
                LIMIT 1
            ) AS latest_non_empty ON TRUE
        ),
        channel_agg AS (
            SELECT
                cd.product_id,
                cd.traffic_channel,
                SUM(CASE WHEN cd.stat_date BETWEEN $1 AND $2 THEN cd.pay_amount ELSE 0 END)::DOUBLE PRECISION AS curr_pay_amount,
                SUM(CASE WHEN cd.stat_date BETWEEN $3 AND $4 THEN cd.pay_amount ELSE 0 END)::DOUBLE PRECISION AS prev_pay_amount,
                SUM(CASE WHEN cd.stat_date BETWEEN $1 AND $2 THEN cd.pay_buyer_count ELSE 0 END)::BIGINT AS curr_pay_buyer_count,
                SUM(CASE WHEN cd.stat_date BETWEEN $1 AND $2 THEN cd.visitor_count ELSE 0 END)::BIGINT AS curr_visitor_count,
                SUM(CASE WHEN cd.stat_date BETWEEN $1 AND $2 THEN cd.cart_buyer_count ELSE 0 END)::BIGINT AS curr_cart_buyer_count
            FROM channel_daily cd
            GROUP BY cd.product_id, cd.traffic_channel
        ),
        enriched AS (
            SELECT
                a.product_id,
                lpn.product_name,
                a.traffic_channel,
                a.curr_pay_amount,
                a.prev_pay_amount,
                (a.curr_pay_amount - a.prev_pay_amount)::DOUBLE PRECISION AS pay_amount_delta,
                CASE
                    WHEN SUM(a.curr_pay_amount - a.prev_pay_amount) OVER () <> 0
                        THEN ((a.curr_pay_amount - a.prev_pay_amount) / SUM(a.curr_pay_amount - a.prev_pay_amount) OVER ())
                    ELSE NULL
                END::DOUBLE PRECISION AS pay_amount_delta_contribution,
                a.curr_pay_buyer_count,
                a.curr_visitor_count,
                a.curr_cart_buyer_count
            FROM channel_agg a
            LEFT JOIN latest_product_name lpn
              ON lpn.product_id = a.product_id
            WHERE
                a.curr_pay_amount <> 0
                OR a.prev_pay_amount <> 0
                OR a.curr_pay_buyer_count <> 0
                OR a.curr_visitor_count <> 0
                OR a.curr_cart_buyer_count <> 0
        )
        SELECT
            e.product_id,
            e.product_name,
            e.traffic_channel,
            e.curr_pay_amount,
            e.prev_pay_amount,
            e.pay_amount_delta,
            e.pay_amount_delta_contribution,
            e.curr_pay_buyer_count,
            e.curr_visitor_count,
            e.curr_cart_buyer_count,
            SUM(e.curr_pay_amount) OVER () AS total_curr_pay_amount,
            SUM(e.prev_pay_amount) OVER () AS total_prev_pay_amount
        FROM enriched e
        ORDER BY e.curr_pay_amount DESC, e.pay_amount_delta DESC, e.product_id, e.traffic_channel
        LIMIT 240
    "#;
