use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use super::{
    Conclusions, GoodsAttributionData, GoodsChannelAttributionData,
    GoodsChannelFunnelDiagnosisData, Kpi, PlatformData, TrendData,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WeeklyMetadata {
    pub(crate) report_type: String,
    pub(crate) report_id: String,
    pub(crate) period_start: String,
    pub(crate) period_end: String,
    pub(crate) generated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WeeklyCharts {
    pub(crate) trend_7d: Vec<TrendData>,
    pub(crate) platforms: Vec<PlatformData>,
    #[serde(default)]
    pub(crate) goods_attribution: Vec<GoodsAttributionData>,
    #[serde(default)]
    pub(crate) goods_channel_attribution: Vec<GoodsChannelAttributionData>,
    #[serde(default)]
    pub(crate) goods_channel_funnel_diagnosis: Vec<GoodsChannelFunnelDiagnosisData>,
    #[serde(default)]
    pub(crate) douyin_live_attribution: Vec<serde_json::Value>,
    #[serde(default)]
    pub(crate) douyin_shortvideo_attribution: Vec<serde_json::Value>,
    #[serde(default)]
    pub(crate) douyin_card_attribution: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WeeklyReportResponse {
    pub(crate) metadata: WeeklyMetadata,
    pub(crate) kpis: Vec<Kpi>,
    pub(crate) charts: WeeklyCharts,
    pub(crate) conclusions: Conclusions,
}

#[derive(Debug, Serialize)]
pub(crate) struct WeeklyPeriodsResponse {
    pub(crate) periods: Vec<super::PeriodOption>,
}

#[derive(Debug, Serialize)]
pub(crate) struct WeeklyLatestPeriodResponse {
    pub(crate) week_period: String,
}

#[derive(Debug)]
pub(crate) struct WeeklyRow {
    pub(crate) week_period: String,
    pub(crate) as_of_date: Option<NaiveDate>,
    pub(crate) curr_gmv: f64,
    pub(crate) curr_order_count: i64,
    pub(crate) curr_buyer_count: i64,
    pub(crate) curr_refund_amount_refund_time: f64,
    pub(crate) curr_refund_amount_pay_time: f64,
    pub(crate) prev_gmv: f64,
    pub(crate) prev_order_count: i64,
    pub(crate) prev_buyer_count: i64,
    pub(crate) prev_refund_amount_refund_time: f64,
    pub(crate) prev_refund_amount_pay_time: f64,
}
