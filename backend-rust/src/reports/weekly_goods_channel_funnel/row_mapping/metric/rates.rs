use sqlx::postgres::PgRow;

use super::{amounts::MetricAmounts, counts::MetricCounts};
use crate::reports::metrics::safe_ratio;

#[derive(Debug, Clone, Copy)]
pub(super) struct MetricRates {
    pub(super) curr_ctr: Option<f64>,
    pub(super) prev_ctr: Option<f64>,
    pub(super) curr_click_to_cart_rate: Option<f64>,
    pub(super) prev_click_to_cart_rate: Option<f64>,
    pub(super) curr_cart_to_pay_rate: Option<f64>,
    pub(super) prev_cart_to_pay_rate: Option<f64>,
    pub(super) curr_avg_order_value: Option<f64>,
    pub(super) prev_avg_order_value: Option<f64>,
    pub(super) curr_roi: Option<f64>,
    pub(super) prev_roi: Option<f64>,
    pub(super) curr_avg_click_cost: Option<f64>,
    pub(super) prev_avg_click_cost: Option<f64>,
    pub(super) curr_cpm: Option<f64>,
    pub(super) prev_cpm: Option<f64>,
    pub(super) curr_click_conversion_rate: Option<f64>,
    pub(super) prev_click_conversion_rate: Option<f64>,
}

pub(super) fn resolve_metric_rates(
    _row: &PgRow,
    counts: &MetricCounts,
    amounts: &MetricAmounts,
) -> MetricRates {
    MetricRates {
        curr_ctr: safe_ratio(
            counts.curr_click_count as f64,
            counts.curr_impression_count as f64,
        ),
        prev_ctr: safe_ratio(
            counts.prev_click_count as f64,
            counts.prev_impression_count as f64,
        ),
        curr_click_to_cart_rate: safe_ratio(
            counts.curr_cart_count as f64,
            counts.curr_click_count as f64,
        ),
        prev_click_to_cart_rate: safe_ratio(
            counts.prev_cart_count as f64,
            counts.prev_click_count as f64,
        ),
        curr_cart_to_pay_rate: safe_ratio(
            counts.curr_pay_buyer_count as f64,
            counts.curr_cart_count as f64,
        ),
        prev_cart_to_pay_rate: safe_ratio(
            counts.prev_pay_buyer_count as f64,
            counts.prev_cart_count as f64,
        ),
        curr_avg_order_value: safe_ratio(
            amounts.curr_pay_amount,
            counts.curr_pay_buyer_count as f64,
        ),
        prev_avg_order_value: safe_ratio(
            amounts.prev_pay_amount,
            counts.prev_pay_buyer_count as f64,
        ),
        curr_roi: safe_ratio(amounts.curr_pay_amount, amounts.curr_cost),
        prev_roi: safe_ratio(amounts.prev_pay_amount, amounts.prev_cost),
        curr_avg_click_cost: safe_ratio(amounts.curr_cost, counts.curr_click_count as f64),
        prev_avg_click_cost: safe_ratio(amounts.prev_cost, counts.prev_click_count as f64),
        curr_cpm: safe_ratio(
            amounts.curr_cost * 1000.0,
            counts.curr_impression_count as f64,
        ),
        prev_cpm: safe_ratio(
            amounts.prev_cost * 1000.0,
            counts.prev_impression_count as f64,
        ),
        curr_click_conversion_rate: safe_ratio(
            counts.curr_pay_buyer_count as f64,
            counts.curr_click_count as f64,
        ),
        prev_click_conversion_rate: safe_ratio(
            counts.prev_pay_buyer_count as f64,
            counts.prev_click_count as f64,
        ),
    }
}
