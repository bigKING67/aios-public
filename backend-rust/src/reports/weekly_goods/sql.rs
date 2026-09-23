pub(super) const ADS_QUERY: &str = r#"
        WITH ranked AS (
            SELECT
                m.week_period,
                m.platform,
                m.as_of_date,
                m.product_id,
                m.curr_gmv::DOUBLE PRECISION AS curr_gmv,
                m.prev_gmv::DOUBLE PRECISION AS prev_gmv,
                m.gmv_delta::DOUBLE PRECISION AS gmv_delta,
                m.gmv_delta_contribution_rate::DOUBLE PRECISION AS gmv_delta_contribution,
                m.curr_pay_buyer_count::BIGINT AS curr_pay_buyer_count,
                m.curr_visitor_count::BIGINT AS curr_visitor_count,
                CASE
                    WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
                        THEN p.curr_gmv_sync
                    ELSE p.curr_gmv
                END::DOUBLE PRECISION AS total_curr_gmv,
                CASE
                    WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
                        THEN p.prev_gmv_sync
                    ELSE p.prev_gmv
                END::DOUBLE PRECISION AS total_prev_gmv
            FROM ads.report_taobao_trade_product_metrics_week m
            JOIN ads.report_all_trade_week_platform p
              ON p.week_period = m.week_period
             AND p.platform = m.platform
            WHERE m.week_period = $1
              AND m.platform = 'taobao'
            ORDER BY m.curr_gmv DESC, m.gmv_delta DESC, m.product_id
            LIMIT 200
        ),
        latest_product_name AS (
            SELECT
                r.product_id,
                COALESCE(latest_non_empty.product_name, '(未命名商品)') AS product_name
            FROM ranked r
            LEFT JOIN LATERAL (
                SELECT src_latest.product_name
                FROM ods.taobao_trade_sale_goods_raw src_latest
                WHERE src_latest.product_id = r.product_id
                  AND NULLIF(BTRIM(src_latest.product_name), '') IS NOT NULL
                ORDER BY
                  src_latest.stat_date DESC,
                  COALESCE(src_latest.updated_at, TIMESTAMP '1970-01-01 00:00:00') DESC
                LIMIT 1
            ) AS latest_non_empty ON TRUE
        )
        SELECT
            r.week_period,
            r.platform,
            r.as_of_date,
            r.product_id,
            lpn.product_name,
            r.curr_gmv,
            r.prev_gmv,
            r.gmv_delta,
            r.gmv_delta_contribution,
            r.curr_pay_buyer_count,
            r.curr_visitor_count,
            r.total_curr_gmv,
            r.total_prev_gmv
        FROM ranked r
        LEFT JOIN latest_product_name lpn
          ON lpn.product_id = r.product_id
        ORDER BY r.curr_gmv DESC, r.gmv_delta DESC, r.product_id
    "#;

pub(super) const FALLBACK_SCOPE_QUERY: &str = r#"
        SELECT
            COALESCE(
                p.as_of_date,
                LEAST($2::DATE, max_stat.max_stat_date)
            )::DATE AS as_of_date,
            CASE
                WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
                    THEN p.curr_gmv_sync
                ELSE p.curr_gmv
            END::DOUBLE PRECISION AS total_curr_gmv,
            CASE
                WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
                    THEN p.prev_gmv_sync
                ELSE p.prev_gmv
            END::DOUBLE PRECISION AS total_prev_gmv
        FROM ads.report_all_trade_week_platform p
        CROSS JOIN (
            SELECT COALESCE(MAX(stat_date), $2::DATE) AS max_stat_date
            FROM ods.taobao_trade_sale_goods_raw
        ) AS max_stat
        WHERE p.week_period = $1
          AND p.platform = 'taobao'
        LIMIT 1
    "#;

pub(super) const FALLBACK_GOODS_QUERY: &str = r#"
        WITH base AS (
            SELECT
                src.product_id,
                SUM(CASE WHEN src.stat_date BETWEEN $1 AND $2 THEN COALESCE(src.pay_amount, 0) ELSE 0 END)::DOUBLE PRECISION AS curr_gmv,
                SUM(CASE WHEN src.stat_date BETWEEN $3 AND $4 THEN COALESCE(src.pay_amount, 0) ELSE 0 END)::DOUBLE PRECISION AS prev_gmv,
                SUM(CASE WHEN src.stat_date BETWEEN $1 AND $2 THEN COALESCE(src.pay_buyer_count, 0) ELSE 0 END)::BIGINT AS curr_pay_buyer_count,
                SUM(CASE WHEN src.stat_date BETWEEN $1 AND $2 THEN COALESCE(src.product_visitor_count, 0) ELSE 0 END)::BIGINT AS curr_visitor_count
            FROM ods.taobao_trade_sale_goods_raw src
            WHERE src.stat_date BETWEEN $3 AND $2
            GROUP BY src.product_id
        ),
        latest_product_name AS (
            SELECT
                b.product_id,
                COALESCE(latest_non_empty.product_name, '(未命名商品)')::VARCHAR(500) AS product_name
            FROM base b
            LEFT JOIN LATERAL (
                SELECT src_latest.product_name
                FROM ods.taobao_trade_sale_goods_raw src_latest
                WHERE src_latest.product_id = b.product_id
                  AND NULLIF(BTRIM(src_latest.product_name), '') IS NOT NULL
                ORDER BY
                  src_latest.stat_date DESC,
                  COALESCE(src_latest.updated_at, TIMESTAMP '1970-01-01 00:00:00') DESC
                LIMIT 1
            ) AS latest_non_empty ON TRUE
        ),
        enriched AS (
            SELECT
                b.product_id,
                lpn.product_name,
                b.curr_gmv,
                b.prev_gmv,
                (b.curr_gmv - b.prev_gmv)::DOUBLE PRECISION AS gmv_delta,
                CASE
                    WHEN SUM(b.curr_gmv - b.prev_gmv) OVER () <> 0
                        THEN ((b.curr_gmv - b.prev_gmv) / SUM(b.curr_gmv - b.prev_gmv) OVER ())
                    ELSE NULL
                END::DOUBLE PRECISION AS gmv_delta_contribution,
                b.curr_pay_buyer_count,
                b.curr_visitor_count
            FROM base b
            LEFT JOIN latest_product_name lpn
              ON lpn.product_id = b.product_id
            WHERE
                b.curr_gmv <> 0
                OR b.prev_gmv <> 0
                OR b.curr_pay_buyer_count <> 0
                OR b.curr_visitor_count <> 0
        )
        SELECT
            product_id,
            product_name,
            curr_gmv,
            prev_gmv,
            gmv_delta,
            gmv_delta_contribution,
            curr_pay_buyer_count,
            curr_visitor_count
        FROM enriched
        ORDER BY curr_gmv DESC, gmv_delta DESC, product_id
        LIMIT 200
    "#;
