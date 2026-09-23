use super::super::GoodsChannelFunnelMetricItem;

pub(super) struct ChannelMetricTotals {
    pub(super) has_click_stage: bool,
    pub(super) curr_impression_sum: i64,
    pub(super) prev_impression_sum: i64,
    pub(super) curr_visitor_sum: i64,
    pub(super) prev_visitor_sum: i64,
    pub(super) curr_click_sum: i64,
    pub(super) prev_click_sum: i64,
    pub(super) curr_cart_sum: i64,
    pub(super) prev_cart_sum: i64,
    pub(super) curr_pay_buyer_sum: i64,
    pub(super) prev_pay_buyer_sum: i64,
    pub(super) curr_pay_amount_sum: f64,
    pub(super) prev_pay_amount_sum: f64,
}

impl ChannelMetricTotals {
    pub(super) fn from_items(channel_items: &[GoodsChannelFunnelMetricItem]) -> Self {
        Self {
            has_click_stage: channel_items.iter().any(|item| item.has_click_stage),
            curr_impression_sum: channel_items
                .iter()
                .map(|item| item.curr_impression_count.max(0))
                .sum(),
            prev_impression_sum: channel_items
                .iter()
                .map(|item| item.prev_impression_count.max(0))
                .sum(),
            curr_visitor_sum: channel_items
                .iter()
                .map(|item| {
                    item.curr_visitor_count
                        .unwrap_or(item.curr_impression_count)
                        .max(0)
                })
                .sum(),
            prev_visitor_sum: channel_items
                .iter()
                .map(|item| {
                    item.prev_visitor_count
                        .unwrap_or(item.prev_impression_count)
                        .max(0)
                })
                .sum(),
            curr_click_sum: channel_items
                .iter()
                .map(|item| item.curr_click_count.max(0))
                .sum(),
            prev_click_sum: channel_items
                .iter()
                .map(|item| item.prev_click_count.max(0))
                .sum(),
            curr_cart_sum: channel_items
                .iter()
                .map(|item| item.curr_cart_count.max(0))
                .sum(),
            prev_cart_sum: channel_items
                .iter()
                .map(|item| item.prev_cart_count.max(0))
                .sum(),
            curr_pay_buyer_sum: channel_items
                .iter()
                .map(|item| item.curr_pay_buyer_count.max(0))
                .sum(),
            prev_pay_buyer_sum: channel_items
                .iter()
                .map(|item| item.prev_pay_buyer_count.max(0))
                .sum(),
            curr_pay_amount_sum: channel_items.iter().map(|item| item.curr_pay_amount).sum(),
            prev_pay_amount_sum: channel_items.iter().map(|item| item.prev_pay_amount).sum(),
        }
    }
}
