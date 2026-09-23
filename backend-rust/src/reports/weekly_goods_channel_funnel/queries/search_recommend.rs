use sqlx::{postgres::PgRow, PgPool};

use crate::error::AppResult;

use super::fallback::query_rows_with_fallback;

const SEARCH_RECOMMEND_ROWS_QUERY: &str = r#"
    SELECT
        c.as_of_date,
        c.product_id,
        COALESCE(NULLIF(BTRIM(c.product_name), ''), '(未命名商品)') AS product_name,
        c.traffic_channel,
        'taobao_goods'::TEXT AS metric_source,
        FALSE AS has_click_stage,
        c.curr_visitor_count::BIGINT AS curr_visitor_count,
        c.prev_visitor_count::BIGINT AS prev_visitor_count,
        c.curr_visitor_count::BIGINT AS curr_impression_count,
        c.prev_visitor_count::BIGINT AS prev_impression_count,
        c.curr_visitor_count::BIGINT AS curr_click_count,
        c.prev_visitor_count::BIGINT AS prev_click_count,
        c.curr_cart_buyer_count::BIGINT AS curr_cart_count,
        c.prev_cart_buyer_count::BIGINT AS prev_cart_count,
        c.curr_pay_buyer_count::BIGINT AS curr_pay_buyer_count,
        c.prev_pay_buyer_count::BIGINT AS prev_pay_buyer_count,
        c.curr_pay_amount::DOUBLE PRECISION AS curr_pay_amount,
        c.prev_pay_amount::DOUBLE PRECISION AS prev_pay_amount,
        0::DOUBLE PRECISION AS curr_cost,
        0::DOUBLE PRECISION AS prev_cost,
        0::BIGINT AS curr_wangwang_consult_count,
        0::BIGINT AS prev_wangwang_consult_count,
        0::BIGINT AS curr_member_join_count,
        0::BIGINT AS prev_member_join_count,
        0::BIGINT AS curr_new_buyer_count,
        0::BIGINT AS prev_new_buyer_count,
        0::BIGINT AS curr_coupon_claim_count,
        0::BIGINT AS prev_coupon_claim_count,
        0::BIGINT AS curr_total_favorite_cart_count,
        0::BIGINT AS prev_total_favorite_cart_count,
        CASE
            WHEN c.curr_visitor_count > 0
                THEN 1::DOUBLE PRECISION
            ELSE NULL
        END AS curr_ctr,
        CASE
            WHEN c.prev_visitor_count > 0
                THEN 1::DOUBLE PRECISION
            ELSE NULL
        END AS prev_ctr,
        CASE
            WHEN c.curr_visitor_count > 0
                THEN (c.curr_cart_buyer_count::DOUBLE PRECISION / c.curr_visitor_count::DOUBLE PRECISION)
            ELSE NULL
        END AS curr_click_to_cart_rate,
        CASE
            WHEN c.prev_visitor_count > 0
                THEN (c.prev_cart_buyer_count::DOUBLE PRECISION / c.prev_visitor_count::DOUBLE PRECISION)
            ELSE NULL
        END AS prev_click_to_cart_rate,
        CASE
            WHEN c.curr_cart_buyer_count > 0
                THEN (c.curr_pay_buyer_count::DOUBLE PRECISION / c.curr_cart_buyer_count::DOUBLE PRECISION)
            ELSE NULL
        END AS curr_cart_to_pay_rate,
        CASE
            WHEN c.prev_cart_buyer_count > 0
                THEN (c.prev_pay_buyer_count::DOUBLE PRECISION / c.prev_cart_buyer_count::DOUBLE PRECISION)
            ELSE NULL
        END AS prev_cart_to_pay_rate,
        CASE
            WHEN c.curr_pay_buyer_count > 0
                THEN (c.curr_pay_amount::DOUBLE PRECISION / c.curr_pay_buyer_count::DOUBLE PRECISION)
            ELSE NULL
        END AS curr_avg_order_value,
        CASE
            WHEN c.prev_pay_buyer_count > 0
                THEN (c.prev_pay_amount::DOUBLE PRECISION / c.prev_pay_buyer_count::DOUBLE PRECISION)
            ELSE NULL
        END AS prev_avg_order_value,
        NULL::DOUBLE PRECISION AS curr_roi,
        NULL::DOUBLE PRECISION AS prev_roi,
        NULL::DOUBLE PRECISION AS curr_avg_click_cost,
        NULL::DOUBLE PRECISION AS prev_avg_click_cost,
        NULL::DOUBLE PRECISION AS curr_cpm,
        NULL::DOUBLE PRECISION AS prev_cpm,
        CASE
            WHEN c.curr_visitor_count > 0
                THEN (c.curr_pay_buyer_count::DOUBLE PRECISION / c.curr_visitor_count::DOUBLE PRECISION)
            ELSE NULL
        END AS curr_click_conversion_rate,
        CASE
            WHEN c.prev_visitor_count > 0
                THEN (c.prev_pay_buyer_count::DOUBLE PRECISION / c.prev_visitor_count::DOUBLE PRECISION)
            ELSE NULL
        END AS prev_click_conversion_rate
    FROM ads.report_taobao_goods_traffic_channel_metrics_week c
    WHERE c.week_period = $1
      AND c.platform = 'taobao'
      AND c.product_id = $2
      AND c.traffic_channel IN ('搜索', '推荐')
      AND (
        c.curr_pay_amount <> 0
        OR c.prev_pay_amount <> 0
        OR c.curr_visitor_count <> 0
        OR c.prev_visitor_count <> 0
        OR c.curr_cart_buyer_count <> 0
        OR c.prev_cart_buyer_count <> 0
      )
    ORDER BY c.curr_pay_amount DESC, c.pay_amount_delta DESC, c.traffic_channel
"#;

pub(super) async fn load_search_recommend_rows(
    pool: &PgPool,
    week_period: &str,
    product_id: &str,
) -> AppResult<Vec<PgRow>> {
    query_rows_with_fallback(
        pool,
        SEARCH_RECOMMEND_ROWS_QUERY,
        week_period,
        product_id,
        "weekly goods channel funnel diagnosis taobao_goods source missing, fallback to taobao_one only",
        "query weekly goods channel funnel rows from taobao_goods failed",
    )
    .await
}
