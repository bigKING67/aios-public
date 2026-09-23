use std::cmp;

use serde_json::json;

use super::super::super::{GoodsChannelDriverContribution, WeeklyReportResponse};
use super::super::platform::is_tmall_platform_name;

pub(super) fn build_channel_diagnosis(report: &WeeklyReportResponse) -> Vec<serde_json::Value> {
    report
        .charts
        .goods_channel_funnel_diagnosis
        .iter()
        .filter(|item| is_tmall_platform_name(item.platform.as_str()))
        .take(3)
        .map(|item| {
            let funnel_metrics = item
                .funnel_items
                .iter()
                .take(6)
                .map(|row| {
                    json!({
                        "product_id": row.product_id,
                        "product_name": row.product_name,
                        "traffic_channel": row.traffic_channel,
                        "metric_source": row.metric_source,
                        "has_click_stage": row.has_click_stage,
                        "curr_visitor_count": row.curr_visitor_count,
                        "prev_visitor_count": row.prev_visitor_count,
                        "curr_impression_count": row.curr_impression_count,
                        "prev_impression_count": row.prev_impression_count,
                        "curr_click_count": row.curr_click_count,
                        "prev_click_count": row.prev_click_count,
                        "curr_cart_count": row.curr_cart_count,
                        "prev_cart_count": row.prev_cart_count,
                        "curr_pay_buyer_count": row.curr_pay_buyer_count,
                        "prev_pay_buyer_count": row.prev_pay_buyer_count,
                        "curr_pay_amount": row.curr_pay_amount,
                        "prev_pay_amount": row.prev_pay_amount,
                        "curr_ctr": row.curr_ctr,
                        "prev_ctr": row.prev_ctr,
                        "curr_click_to_cart_rate": row.curr_click_to_cart_rate,
                        "prev_click_to_cart_rate": row.prev_click_to_cart_rate,
                        "curr_cart_to_pay_rate": row.curr_cart_to_pay_rate,
                        "prev_cart_to_pay_rate": row.prev_cart_to_pay_rate,
                        "curr_avg_order_value": row.curr_avg_order_value,
                        "prev_avg_order_value": row.prev_avg_order_value,
                        "curr_click_conversion_rate": row.curr_click_conversion_rate,
                        "prev_click_conversion_rate": row.prev_click_conversion_rate,
                    })
                })
                .collect::<Vec<_>>();

            json!({
                "product_id": item.product_id,
                "product_name": item.product_name,
                "product_curr_gmv": item.product_curr_gmv,
                "product_prev_gmv": item.product_prev_gmv,
                "product_gmv_wow": item.product_gmv_wow,
                "selected_channels": item.selected_channels,
                "selected_channel_details": item.selected_channel_details,
                "funnel_metrics": funnel_metrics,
                "quant_attribution": build_sorted_quant_attribution(&item.quant_attribution, 8),
                "quant_attribution_by_channel": item
                    .quant_attribution_by_channel
                    .iter()
                    .map(|channel_item| {
                        json!({
                            "traffic_channel": channel_item.traffic_channel,
                            "has_click_stage": channel_item.has_click_stage,
                            "quant_attribution": build_sorted_quant_attribution(
                                &channel_item.quant_attribution,
                                6
                            ),
                        })
                    })
                    .collect::<Vec<_>>(),
            })
        })
        .collect()
}

fn build_sorted_quant_attribution(
    items: &[GoodsChannelDriverContribution],
    limit: usize,
) -> Vec<serde_json::Value> {
    let mut rows = items.to_vec();
    rows.sort_by(|left, right| {
        right
            .ln_contribution
            .abs()
            .partial_cmp(&left.ln_contribution.abs())
            .unwrap_or(cmp::Ordering::Equal)
    });

    rows.into_iter()
        .take(limit)
        .map(|row| {
            json!({
                "factor_key": row.factor_key,
                "factor_label": row.factor_label,
                "curr_value": row.curr_value,
                "prev_value": row.prev_value,
                "change_rate": row.change_rate,
                "contribution_value": row.ln_contribution,
                "contribution_rate": row.contribution_rate,
                "effect": row.effect,
                "reason": row.reason,
                "action": row.action,
                "priority": row.priority,
            })
        })
        .collect()
}
