use std::{cmp, collections::HashSet};

use super::super::super::{GoodsChannelFunnelMetricItem, GoodsChannelSelectionDetail};
use super::contributions::ChannelContribution;

pub(in crate::reports::weekly_goods_channel_funnel) fn select_channels(
    contributions: &[ChannelContribution],
    product_gmv_wow: Option<f64>,
) -> Vec<String> {
    if contributions.is_empty() {
        return Vec::new();
    }

    let mut sorted = contributions.to_vec();
    sorted.sort_by(|left, right| {
        right
            .contribution_rate
            .partial_cmp(&left.contribution_rate)
            .unwrap_or(cmp::Ordering::Equal)
    });

    let product_baseline_wow = product_gmv_wow.unwrap_or(0.0);
    let mut selected_channel_names: Vec<String> = sorted
        .iter()
        .filter(|item| item.gmv_delta > 0.0 && item.contribution_rate > product_baseline_wow)
        .map(|item| item.traffic_channel.clone())
        .collect();

    if selected_channel_names.is_empty() {
        selected_channel_names = sorted
            .iter()
            .filter(|item| item.gmv_delta > 0.0)
            .take(2)
            .map(|item| item.traffic_channel.clone())
            .collect();
    }

    if selected_channel_names.is_empty() {
        selected_channel_names = sorted
            .iter()
            .take(2)
            .map(|item| item.traffic_channel.clone())
            .collect();
    }

    selected_channel_names
}

pub(in crate::reports::weekly_goods_channel_funnel) fn build_channel_selection_details(
    selected_channels: &[String],
    contributions: &[ChannelContribution],
) -> Vec<GoodsChannelSelectionDetail> {
    selected_channels
        .iter()
        .filter_map(|traffic_channel| {
            contributions
                .iter()
                .find(|item| item.traffic_channel == traffic_channel.as_str())
                .map(|item| GoodsChannelSelectionDetail {
                    traffic_channel: traffic_channel.clone(),
                    gmv_delta: item.gmv_delta,
                    contribution_rate: item.contribution_rate,
                })
        })
        .collect()
}

pub(in crate::reports::weekly_goods_channel_funnel) fn select_items_for_channels(
    items: &[GoodsChannelFunnelMetricItem],
    selected_channels: &[String],
) -> Vec<GoodsChannelFunnelMetricItem> {
    let selected_channel_set: HashSet<&str> =
        selected_channels.iter().map(String::as_str).collect();

    items
        .iter()
        .filter(|item| selected_channel_set.contains(item.traffic_channel.as_str()))
        .cloned()
        .collect()
}
