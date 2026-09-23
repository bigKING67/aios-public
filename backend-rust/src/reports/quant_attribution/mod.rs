use super::traffic_channel::{channel_profile_to_nature, resolve_traffic_channel_profile};
use super::{GoodsChannelDriverContribution, GoodsChannelFunnelMetricItem};

mod contributions;
mod factors;
mod smoothing;
mod totals;

pub(super) fn format_channel_list(channels: &[String]) -> String {
    if channels.is_empty() {
        return "目标渠道".to_string();
    }

    channels.join("、")
}

pub(super) fn build_goods_channel_quant_attribution(
    channel_items: &[GoodsChannelFunnelMetricItem],
    channel_context: &str,
) -> Vec<GoodsChannelDriverContribution> {
    if channel_items.is_empty() {
        return Vec::new();
    }

    let totals = totals::ChannelMetricTotals::from_items(channel_items);
    let channel_profile = resolve_traffic_channel_profile(channel_items, channel_context);
    let channel_nature = channel_profile_to_nature(channel_profile);
    let factor_rows = factors::build_factor_rows(&totals);

    contributions::build_driver_contributions(
        factor_rows,
        channel_context,
        channel_profile,
        channel_nature,
    )
}
