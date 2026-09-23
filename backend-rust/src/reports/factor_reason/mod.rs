use super::traffic_channel::{TrafficChannelNature, TrafficChannelProfile};

mod click;
mod conversion;
mod fallback;
mod impression;
mod visitor;

type FactorGuidance = (String, String);

pub(super) fn build_factor_reason_and_action(
    factor_key: &str,
    ln_contribution: f64,
    channel_context: &str,
    channel_profile: TrafficChannelProfile,
    channel_nature: TrafficChannelNature,
) -> FactorGuidance {
    let is_negative = ln_contribution < 0.0;

    match factor_key {
        "impression" => {
            impression::build_impression_reason(is_negative, channel_context, channel_profile)
        }
        "visitor" => visitor::build_visitor_reason(is_negative, channel_context, channel_profile),
        "ctr" | "click_rate" => click::build_click_rate_reason(is_negative, channel_profile),
        "click_to_cart_rate" => conversion::build_click_to_cart_rate_reason(is_negative),
        "cart_to_pay_rate" => conversion::build_cart_to_pay_rate_reason(is_negative),
        "avg_order_value" => conversion::build_avg_order_value_reason(is_negative),
        _ => fallback::build_fallback_reason(channel_nature),
    }
}
