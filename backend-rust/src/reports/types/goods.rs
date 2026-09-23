use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct ProductAttributionItem {
    pub(crate) product_id: String,
    pub(crate) product_name: String,
    pub(crate) gmv: f64,
    pub(crate) prev_gmv: f64,
    pub(crate) gmv_delta: f64,
    pub(crate) gmv_delta_contribution: Option<f64>,
    pub(crate) buyer_count: i64,
    pub(crate) visitor_count: i64,
    pub(crate) pay_conversion_rate: Option<f64>,
    pub(crate) avg_order_value: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GoodsAttributionData {
    pub(crate) platform: String,
    pub(crate) week_period: String,
    pub(crate) as_of_date: Option<String>,
    pub(crate) total_gmv: f64,
    pub(crate) total_prev_gmv: f64,
    pub(crate) items: Vec<ProductAttributionItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GoodsChannelAttributionItem {
    pub(crate) product_id: String,
    pub(crate) product_name: String,
    pub(crate) traffic_channel: String,
    pub(crate) pay_amount: f64,
    pub(crate) prev_pay_amount: f64,
    pub(crate) pay_amount_delta: f64,
    pub(crate) pay_amount_delta_contribution: Option<f64>,
    pub(crate) pay_buyer_count: i64,
    pub(crate) visitor_count: i64,
    pub(crate) cart_buyer_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GoodsChannelAttributionData {
    pub(crate) platform: String,
    pub(crate) week_period: String,
    pub(crate) as_of_date: Option<String>,
    pub(crate) total_pay_amount: f64,
    pub(crate) total_prev_pay_amount: f64,
    pub(crate) items: Vec<GoodsChannelAttributionItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GoodsChannelFunnelMetricItem {
    pub(crate) product_id: String,
    pub(crate) product_name: String,
    pub(crate) traffic_channel: String,
    pub(crate) metric_source: String,
    pub(crate) has_click_stage: bool,
    pub(crate) curr_visitor_count: Option<i64>,
    pub(crate) prev_visitor_count: Option<i64>,
    pub(crate) curr_impression_count: i64,
    pub(crate) prev_impression_count: i64,
    pub(crate) curr_click_count: i64,
    pub(crate) prev_click_count: i64,
    pub(crate) curr_cart_count: i64,
    pub(crate) prev_cart_count: i64,
    pub(crate) curr_pay_buyer_count: i64,
    pub(crate) prev_pay_buyer_count: i64,
    pub(crate) curr_pay_amount: f64,
    pub(crate) prev_pay_amount: f64,
    pub(crate) curr_ctr: Option<f64>,
    pub(crate) prev_ctr: Option<f64>,
    pub(crate) curr_click_to_cart_rate: Option<f64>,
    pub(crate) prev_click_to_cart_rate: Option<f64>,
    pub(crate) curr_cart_to_pay_rate: Option<f64>,
    pub(crate) prev_cart_to_pay_rate: Option<f64>,
    pub(crate) curr_avg_order_value: Option<f64>,
    pub(crate) prev_avg_order_value: Option<f64>,
    pub(crate) curr_cost: f64,
    pub(crate) prev_cost: f64,
    pub(crate) curr_roi: Option<f64>,
    pub(crate) prev_roi: Option<f64>,
    pub(crate) curr_avg_click_cost: Option<f64>,
    pub(crate) prev_avg_click_cost: Option<f64>,
    pub(crate) curr_cpm: Option<f64>,
    pub(crate) prev_cpm: Option<f64>,
    pub(crate) curr_click_conversion_rate: Option<f64>,
    pub(crate) prev_click_conversion_rate: Option<f64>,
    pub(crate) curr_wangwang_consult_count: i64,
    pub(crate) prev_wangwang_consult_count: i64,
    pub(crate) curr_member_join_count: i64,
    pub(crate) prev_member_join_count: i64,
    pub(crate) curr_new_buyer_count: i64,
    pub(crate) prev_new_buyer_count: i64,
    pub(crate) curr_coupon_claim_count: i64,
    pub(crate) prev_coupon_claim_count: i64,
    pub(crate) curr_total_favorite_cart_count: i64,
    pub(crate) prev_total_favorite_cart_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GoodsChannelDriverContribution {
    pub(crate) factor_key: String,
    pub(crate) factor_label: String,
    pub(crate) curr_value: f64,
    pub(crate) prev_value: f64,
    pub(crate) change_rate: Option<f64>,
    pub(crate) ln_contribution: f64,
    pub(crate) contribution_rate: Option<f64>,
    pub(crate) effect: String,
    pub(crate) reason: String,
    pub(crate) action: String,
    pub(crate) priority: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GoodsChannelQuantAttributionByChannel {
    pub(crate) traffic_channel: String,
    pub(crate) has_click_stage: bool,
    pub(crate) quant_attribution: Vec<GoodsChannelDriverContribution>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GoodsChannelSelectionDetail {
    pub(crate) traffic_channel: String,
    pub(crate) gmv_delta: f64,
    pub(crate) contribution_rate: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GoodsChannelFunnelDiagnosisData {
    pub(crate) platform: String,
    pub(crate) week_period: String,
    pub(crate) as_of_date: Option<String>,
    pub(crate) product_id: String,
    pub(crate) product_name: String,
    pub(crate) product_curr_gmv: f64,
    pub(crate) product_prev_gmv: f64,
    pub(crate) product_gmv_wow: Option<f64>,
    pub(crate) selected_channels: Vec<String>,
    #[serde(default)]
    pub(crate) selected_channel_details: Vec<GoodsChannelSelectionDetail>,
    pub(crate) funnel_items: Vec<GoodsChannelFunnelMetricItem>,
    pub(crate) quant_attribution: Vec<GoodsChannelDriverContribution>,
    #[serde(default)]
    pub(crate) quant_attribution_by_channel: Vec<GoodsChannelQuantAttributionByChannel>,
}
