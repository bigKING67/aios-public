use serde::{Deserialize, Serialize};

use super::{Conclusions, Kpi, PlatformData, TrendData};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct MonthlyMetadata {
    pub(crate) report_type: String,
    pub(crate) report_id: String,
    pub(crate) period_month: String,
    pub(crate) period_start: String,
    pub(crate) period_end: String,
    pub(crate) generated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct MonthlyCharts {
    pub(crate) trend_30d: Vec<TrendData>,
    pub(crate) platforms: Vec<PlatformData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct MonthlyReportResponse {
    pub(crate) metadata: MonthlyMetadata,
    pub(crate) kpis: Vec<Kpi>,
    pub(crate) charts: MonthlyCharts,
    pub(crate) conclusions: Conclusions,
}

#[derive(Debug, Serialize)]
pub(crate) struct MonthlyPeriodsResponse {
    pub(crate) periods: Vec<super::PeriodOption>,
}

#[derive(Debug, Serialize)]
pub(crate) struct MonthlyLatestPeriodResponse {
    pub(crate) month_period: String,
}

#[derive(Debug)]
pub(crate) struct MonthlyAggregate {
    pub(crate) curr_gmv: f64,
    pub(crate) curr_orders: i64,
    pub(crate) curr_buyers: i64,
    pub(crate) curr_refund_refund_time: f64,
    pub(crate) curr_refund_pay_time: f64,
    pub(crate) prev_gmv: f64,
    pub(crate) prev_orders: i64,
    pub(crate) prev_buyers: i64,
    pub(crate) prev_refund_refund_time: f64,
    pub(crate) prev_refund_pay_time: f64,
}
