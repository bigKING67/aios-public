use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct Kpi {
    pub(crate) key: String,
    pub(crate) label: String,
    pub(crate) value: f64,
    pub(crate) display_value: String,
    pub(crate) wow: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct TrendPoint {
    pub(crate) date: String,
    pub(crate) value: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct TrendData {
    pub(crate) metric: String,
    pub(crate) points: Vec<TrendPoint>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct PlatformData {
    pub(crate) platform: String,
    pub(crate) gmv: f64,
    pub(crate) prev_gmv: f64,
    pub(crate) gsv: f64,
    pub(crate) orders: i64,
    pub(crate) prev_orders: Option<i64>,
    pub(crate) uv: i64,
    pub(crate) buyer_count: Option<i64>,
    pub(crate) prev_buyer_count: Option<i64>,
    pub(crate) cvr: f64,
    pub(crate) pay_cvr: Option<f64>,
    pub(crate) prev_pay_cvr: Option<f64>,
    pub(crate) arpu: f64,
    pub(crate) prev_arpu: Option<f64>,
    pub(crate) uv_value: Option<f64>,
    pub(crate) prev_uv_value: Option<f64>,
    pub(crate) refund_amount_refund_time: f64,
    pub(crate) prev_refund_amount_refund_time: Option<f64>,
    pub(crate) refund_amount_pay_time: f64,
    pub(crate) prev_refund_amount_pay_time: Option<f64>,
    pub(crate) visitor_count: Option<i64>,
    pub(crate) prev_visitor_count: Option<i64>,
    pub(crate) cost: Option<f64>,
    pub(crate) prev_cost: Option<f64>,
    pub(crate) roi: Option<f64>,
    pub(crate) prev_roi: Option<f64>,
    pub(crate) live_gmv: Option<f64>,
    pub(crate) prev_live_gmv: Option<f64>,
    pub(crate) shortvideo_gmv: Option<f64>,
    pub(crate) prev_shortvideo_gmv: Option<f64>,
    pub(crate) card_gmv: Option<f64>,
    pub(crate) prev_card_gmv: Option<f64>,
    pub(crate) contribution: f64,
    pub(crate) wow: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct PeriodOption {
    pub(crate) value: String,
    pub(crate) label: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct ReportListItem {
    pub(crate) report_type: String,
    pub(crate) report_id: String,
    pub(crate) label: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct ReportsListResponse {
    pub(crate) items: Vec<ReportListItem>,
    pub(crate) limit: i64,
    pub(crate) offset: i64,
    pub(crate) count: usize,
}
