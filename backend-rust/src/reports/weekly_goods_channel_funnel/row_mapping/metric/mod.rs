mod amounts;
mod counts;
mod rates;

use sqlx::postgres::PgRow;

use super::readers::{read_bool, read_i64, read_opt_i64, read_string};
use crate::reports::GoodsChannelFunnelMetricItem;

pub(in crate::reports::weekly_goods_channel_funnel) fn map_metric_rows(
    rows: Vec<PgRow>,
    product_name: &str,
) -> Vec<GoodsChannelFunnelMetricItem> {
    rows.into_iter()
        .map(|row| map_metric_row(row, product_name))
        .collect()
}

fn map_metric_row(row: PgRow, product_name: &str) -> GoodsChannelFunnelMetricItem {
    let counts = counts::read_metric_counts(&row);
    let amounts = amounts::read_metric_amounts(&row);
    let rates = rates::resolve_metric_rates(&row, &counts, &amounts);

    GoodsChannelFunnelMetricItem {
        product_id: read_string(&row, "product_id", ""),
        product_name: product_name.to_string(),
        traffic_channel: read_string(&row, "traffic_channel", "未知渠道"),
        metric_source: read_string(&row, "metric_source", "taobao_one"),
        has_click_stage: read_bool(&row, "has_click_stage", true),
        curr_visitor_count: read_opt_i64(&row, "curr_visitor_count"),
        prev_visitor_count: read_opt_i64(&row, "prev_visitor_count"),
        curr_impression_count: counts.curr_impression_count,
        prev_impression_count: counts.prev_impression_count,
        curr_click_count: counts.curr_click_count,
        prev_click_count: counts.prev_click_count,
        curr_cart_count: counts.curr_cart_count,
        prev_cart_count: counts.prev_cart_count,
        curr_pay_buyer_count: counts.curr_pay_buyer_count,
        prev_pay_buyer_count: counts.prev_pay_buyer_count,
        curr_pay_amount: amounts.curr_pay_amount,
        prev_pay_amount: amounts.prev_pay_amount,
        curr_ctr: rates.curr_ctr,
        prev_ctr: rates.prev_ctr,
        curr_click_to_cart_rate: rates.curr_click_to_cart_rate,
        prev_click_to_cart_rate: rates.prev_click_to_cart_rate,
        curr_cart_to_pay_rate: rates.curr_cart_to_pay_rate,
        prev_cart_to_pay_rate: rates.prev_cart_to_pay_rate,
        curr_avg_order_value: rates.curr_avg_order_value,
        prev_avg_order_value: rates.prev_avg_order_value,
        curr_cost: amounts.curr_cost,
        prev_cost: amounts.prev_cost,
        curr_roi: rates.curr_roi,
        prev_roi: rates.prev_roi,
        curr_avg_click_cost: rates.curr_avg_click_cost,
        prev_avg_click_cost: rates.prev_avg_click_cost,
        curr_cpm: rates.curr_cpm,
        prev_cpm: rates.prev_cpm,
        curr_click_conversion_rate: rates.curr_click_conversion_rate,
        prev_click_conversion_rate: rates.prev_click_conversion_rate,
        curr_wangwang_consult_count: read_i64(&row, "curr_wangwang_consult_count"),
        prev_wangwang_consult_count: read_i64(&row, "prev_wangwang_consult_count"),
        curr_member_join_count: read_i64(&row, "curr_member_join_count"),
        prev_member_join_count: read_i64(&row, "prev_member_join_count"),
        curr_new_buyer_count: read_i64(&row, "curr_new_buyer_count"),
        prev_new_buyer_count: read_i64(&row, "prev_new_buyer_count"),
        curr_coupon_claim_count: read_i64(&row, "curr_coupon_claim_count"),
        prev_coupon_claim_count: read_i64(&row, "prev_coupon_claim_count"),
        curr_total_favorite_cart_count: read_i64(&row, "curr_total_favorite_cart_count"),
        prev_total_favorite_cart_count: read_i64(&row, "prev_total_favorite_cart_count"),
    }
}
