use serde_json::json;

use super::super::super::WeeklyReportResponse;
use super::super::platform::is_tmall_platform_name;

pub(super) fn build_product_attribution_top(
    report: &WeeklyReportResponse,
) -> Vec<serde_json::Value> {
    report
        .charts
        .goods_attribution
        .iter()
        .find(|item| is_tmall_platform_name(item.platform.as_str()))
        .map(|item| {
            item.items
                .iter()
                .take(8)
                .map(|row| {
                    json!({
                        "product_id": row.product_id,
                        "product_name": row.product_name,
                        "gmv": row.gmv,
                        "prev_gmv": row.prev_gmv,
                        "gmv_delta": row.gmv_delta,
                        "gmv_delta_contribution": row.gmv_delta_contribution,
                        "buyer_count": row.buyer_count,
                        "visitor_count": row.visitor_count,
                        "pay_conversion_rate": row.pay_conversion_rate,
                        "avg_order_value": row.avg_order_value,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

pub(super) fn build_channel_attribution_top(
    report: &WeeklyReportResponse,
) -> Vec<serde_json::Value> {
    report
        .charts
        .goods_channel_attribution
        .iter()
        .find(|item| is_tmall_platform_name(item.platform.as_str()))
        .map(|item| {
            item.items
                .iter()
                .take(10)
                .map(|row| {
                    json!({
                        "product_id": row.product_id,
                        "product_name": row.product_name,
                        "traffic_channel": row.traffic_channel,
                        "pay_amount": row.pay_amount,
                        "prev_pay_amount": row.prev_pay_amount,
                        "pay_amount_delta": row.pay_amount_delta,
                        "pay_amount_delta_contribution": row.pay_amount_delta_contribution,
                        "pay_buyer_count": row.pay_buyer_count,
                        "visitor_count": row.visitor_count,
                        "cart_buyer_count": row.cart_buyer_count,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}
