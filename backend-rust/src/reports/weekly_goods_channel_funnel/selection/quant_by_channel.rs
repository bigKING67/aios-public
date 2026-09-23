use std::collections::HashMap;

use super::super::super::{
    quant_attribution::build_goods_channel_quant_attribution, GoodsChannelFunnelMetricItem,
    GoodsChannelQuantAttributionByChannel,
};

pub(in crate::reports::weekly_goods_channel_funnel) fn build_quant_attribution_by_channel(
    selected_channels: &[String],
    selected_items: &[GoodsChannelFunnelMetricItem],
) -> Vec<GoodsChannelQuantAttributionByChannel> {
    let selected_items_by_channel = group_items_by_channel(selected_items);
    let mut quant_attribution_by_channel: Vec<GoodsChannelQuantAttributionByChannel> =
        Vec::with_capacity(selected_channels.len());

    for traffic_channel in selected_channels {
        if let Some(channel_items) = selected_items_by_channel.get(traffic_channel) {
            if channel_items.is_empty() {
                continue;
            }

            quant_attribution_by_channel.push(build_channel_quant_attribution(
                traffic_channel,
                channel_items,
            ));
        }
    }

    if quant_attribution_by_channel.is_empty() {
        let mut fallback_channels: Vec<String> =
            selected_items_by_channel.keys().cloned().collect();
        fallback_channels.sort();

        for traffic_channel in fallback_channels {
            if let Some(channel_items) = selected_items_by_channel.get(traffic_channel.as_str()) {
                if channel_items.is_empty() {
                    continue;
                }

                quant_attribution_by_channel.push(build_channel_quant_attribution(
                    traffic_channel.as_str(),
                    channel_items,
                ));
            }
        }
    }

    quant_attribution_by_channel
}

fn group_items_by_channel(
    items: &[GoodsChannelFunnelMetricItem],
) -> HashMap<String, Vec<GoodsChannelFunnelMetricItem>> {
    let mut grouped: HashMap<String, Vec<GoodsChannelFunnelMetricItem>> = HashMap::new();
    for item in items {
        grouped
            .entry(item.traffic_channel.clone())
            .or_default()
            .push(item.clone());
    }
    grouped
}

fn build_channel_quant_attribution(
    traffic_channel: &str,
    channel_items: &[GoodsChannelFunnelMetricItem],
) -> GoodsChannelQuantAttributionByChannel {
    GoodsChannelQuantAttributionByChannel {
        traffic_channel: traffic_channel.to_string(),
        has_click_stage: channel_items.iter().any(|item| item.has_click_stage),
        quant_attribution: build_goods_channel_quant_attribution(channel_items, traffic_channel),
    }
}
