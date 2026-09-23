use super::super::{smoothing::ln_ratio_with_smoothing, totals::ChannelMetricTotals};
use super::FactorRow;
use crate::reports::metrics::safe_ratio;

pub(super) fn build_click_stage_factor_rows(totals: &ChannelMetricTotals) -> Vec<FactorRow> {
    let curr_click_rate = safe_ratio(
        totals.curr_click_sum as f64,
        totals.curr_impression_sum as f64,
    )
    .unwrap_or(0.0);
    let prev_click_rate = safe_ratio(
        totals.prev_click_sum as f64,
        totals.prev_impression_sum as f64,
    )
    .unwrap_or(0.0);
    let curr_click_to_cart_rate =
        safe_ratio(totals.curr_cart_sum as f64, totals.curr_click_sum as f64).unwrap_or(0.0);
    let prev_click_to_cart_rate =
        safe_ratio(totals.prev_cart_sum as f64, totals.prev_click_sum as f64).unwrap_or(0.0);
    let curr_cart_to_pay_rate = safe_ratio(
        totals.curr_pay_buyer_sum as f64,
        totals.curr_cart_sum as f64,
    )
    .unwrap_or(0.0);
    let prev_cart_to_pay_rate = safe_ratio(
        totals.prev_pay_buyer_sum as f64,
        totals.prev_cart_sum as f64,
    )
    .unwrap_or(0.0);
    let curr_avg_order_value =
        safe_ratio(totals.curr_pay_amount_sum, totals.curr_pay_buyer_sum as f64).unwrap_or(0.0);
    let prev_avg_order_value =
        safe_ratio(totals.prev_pay_amount_sum, totals.prev_pay_buyer_sum as f64).unwrap_or(0.0);

    vec![
        FactorRow {
            factor_key: "impression",
            factor_label: "曝光",
            curr_value: totals.curr_impression_sum as f64,
            prev_value: totals.prev_impression_sum as f64,
            ln_contribution: ln_ratio_with_smoothing(
                totals.curr_impression_sum as f64,
                totals.prev_impression_sum as f64,
                1.0,
            ),
        },
        FactorRow {
            factor_key: "click_rate",
            factor_label: "点击率",
            curr_value: curr_click_rate,
            prev_value: prev_click_rate,
            ln_contribution: ln_ratio_with_smoothing(curr_click_rate, prev_click_rate, 1e-6),
        },
        FactorRow {
            factor_key: "click_to_cart_rate",
            factor_label: "点击加购率",
            curr_value: curr_click_to_cart_rate,
            prev_value: prev_click_to_cart_rate,
            ln_contribution: ln_ratio_with_smoothing(
                curr_click_to_cart_rate,
                prev_click_to_cart_rate,
                1e-6,
            ),
        },
        FactorRow {
            factor_key: "cart_to_pay_rate",
            factor_label: "加购转化率",
            curr_value: curr_cart_to_pay_rate,
            prev_value: prev_cart_to_pay_rate,
            ln_contribution: ln_ratio_with_smoothing(
                curr_cart_to_pay_rate,
                prev_cart_to_pay_rate,
                1e-6,
            ),
        },
        FactorRow {
            factor_key: "avg_order_value",
            factor_label: "客单价",
            curr_value: curr_avg_order_value,
            prev_value: prev_avg_order_value,
            ln_contribution: ln_ratio_with_smoothing(
                curr_avg_order_value,
                prev_avg_order_value,
                0.01,
            ),
        },
    ]
}
