use super::super::super::GoodsChannelFunnelMetricItem;

#[derive(Debug, Clone)]
pub(in crate::reports::weekly_goods_channel_funnel) struct ChannelContribution {
    pub traffic_channel: String,
    pub gmv_delta: f64,
    pub contribution_rate: f64,
}

pub(in crate::reports::weekly_goods_channel_funnel) fn derive_contributions_from_items(
    items: &[GoodsChannelFunnelMetricItem],
) -> Vec<ChannelContribution> {
    if items.is_empty() {
        return Vec::new();
    }

    let total_delta: f64 = items
        .iter()
        .map(|item| item.curr_pay_amount - item.prev_pay_amount)
        .sum();

    items
        .iter()
        .map(|item| {
            let gmv_delta = item.curr_pay_amount - item.prev_pay_amount;
            let contribution_rate = if total_delta.abs() > f64::EPSILON {
                (gmv_delta / total_delta) * 100.0
            } else {
                0.0
            };

            ChannelContribution {
                traffic_channel: item.traffic_channel.clone(),
                gmv_delta,
                contribution_rate,
            }
        })
        .collect()
}
