use sqlx::{postgres::PgRow, PgPool};

use crate::error::AppResult;

use super::fallback::query_rows_with_fallback;

const PAID_FUNNEL_ROWS_QUERY: &str = r#"
    SELECT
        c.as_of_date,
        c.product_id,
        COALESCE(NULLIF(BTRIM(c.product_name), ''), '(未命名商品)') AS product_name,
        c.traffic_channel,
        'taobao_one'::TEXT AS metric_source,
        TRUE AS has_click_stage,
        NULL::BIGINT AS curr_visitor_count,
        NULL::BIGINT AS prev_visitor_count,
        c.curr_impression_count::BIGINT AS curr_impression_count,
        c.prev_impression_count::BIGINT AS prev_impression_count,
        c.curr_click_count::BIGINT AS curr_click_count,
        c.prev_click_count::BIGINT AS prev_click_count,
        c.curr_cart_count::BIGINT AS curr_cart_count,
        c.prev_cart_count::BIGINT AS prev_cart_count,
        c.curr_pay_buyer_count::BIGINT AS curr_pay_buyer_count,
        c.prev_pay_buyer_count::BIGINT AS prev_pay_buyer_count,
        c.curr_pay_amount::DOUBLE PRECISION AS curr_pay_amount,
        c.prev_pay_amount::DOUBLE PRECISION AS prev_pay_amount,
        c.curr_cost::DOUBLE PRECISION AS curr_cost,
        c.prev_cost::DOUBLE PRECISION AS prev_cost,
        c.curr_wangwang_consult_count::BIGINT AS curr_wangwang_consult_count,
        c.prev_wangwang_consult_count::BIGINT AS prev_wangwang_consult_count,
        c.curr_member_join_count::BIGINT AS curr_member_join_count,
        c.prev_member_join_count::BIGINT AS prev_member_join_count,
        c.curr_new_buyer_count::BIGINT AS curr_new_buyer_count,
        c.prev_new_buyer_count::BIGINT AS prev_new_buyer_count,
        c.curr_coupon_claim_count::BIGINT AS curr_coupon_claim_count,
        c.prev_coupon_claim_count::BIGINT AS prev_coupon_claim_count,
        c.curr_total_favorite_cart_count::BIGINT AS curr_total_favorite_cart_count,
        c.prev_total_favorite_cart_count::BIGINT AS prev_total_favorite_cart_count,
        c.curr_ctr::DOUBLE PRECISION AS curr_ctr,
        c.prev_ctr::DOUBLE PRECISION AS prev_ctr,
        c.curr_click_to_cart_rate::DOUBLE PRECISION AS curr_click_to_cart_rate,
        c.prev_click_to_cart_rate::DOUBLE PRECISION AS prev_click_to_cart_rate,
        c.curr_cart_to_pay_rate::DOUBLE PRECISION AS curr_cart_to_pay_rate,
        c.prev_cart_to_pay_rate::DOUBLE PRECISION AS prev_cart_to_pay_rate,
        c.curr_avg_order_value::DOUBLE PRECISION AS curr_avg_order_value,
        c.prev_avg_order_value::DOUBLE PRECISION AS prev_avg_order_value,
        c.curr_roi::DOUBLE PRECISION AS curr_roi,
        c.prev_roi::DOUBLE PRECISION AS prev_roi,
        c.curr_avg_click_cost::DOUBLE PRECISION AS curr_avg_click_cost,
        c.prev_avg_click_cost::DOUBLE PRECISION AS prev_avg_click_cost,
        c.curr_cpm::DOUBLE PRECISION AS curr_cpm,
        c.prev_cpm::DOUBLE PRECISION AS prev_cpm,
        c.curr_click_conversion_rate::DOUBLE PRECISION AS curr_click_conversion_rate,
        c.prev_click_conversion_rate::DOUBLE PRECISION AS prev_click_conversion_rate
    FROM ads.report_taobao_one_goods_traffic_channel_metric_week c
    WHERE c.week_period = $1
      AND c.platform = 'taobao'
      AND c.product_id = $2
      AND c.traffic_channel IN ('关键词推广', '人群推广', '场景推广')
      AND (
        c.curr_pay_amount <> 0
        OR c.prev_pay_amount <> 0
        OR c.curr_cost <> 0
        OR c.prev_cost <> 0
      )
    ORDER BY c.curr_pay_amount DESC, c.gmv_delta DESC, c.traffic_channel
"#;

pub(super) async fn load_paid_funnel_rows(
    pool: &PgPool,
    week_period: &str,
    product_id: &str,
) -> AppResult<Vec<PgRow>> {
    query_rows_with_fallback(
        pool,
        PAID_FUNNEL_ROWS_QUERY,
        week_period,
        product_id,
        "weekly goods channel funnel diagnosis taobao_one source missing, fallback to taobao_goods only",
        "query weekly goods channel funnel rows from taobao_one failed",
    )
    .await
}
