use chrono::{Datelike, Utc};

use super::super::{
    month_start_end, parse_month_period, Conclusions, MonthlyCharts, MonthlyMetadata,
    MonthlyReportResponse,
};

pub(super) fn build_empty_monthly_report(month_period: &str) -> MonthlyReportResponse {
    let (year, month) =
        parse_month_period(month_period).unwrap_or((Utc::now().year(), Utc::now().month()));
    let (period_start, period_end) =
        month_start_end(year, month).unwrap_or(("".to_string(), "".to_string()));

    MonthlyReportResponse {
        metadata: MonthlyMetadata {
            report_type: "monthly".to_string(),
            report_id: format!("{year}-{month:02}"),
            period_month: format!("{year}-{month:02}"),
            period_start,
            period_end,
            generated_at: Utc::now().to_rfc3339(),
        },
        kpis: vec![],
        charts: MonthlyCharts {
            trend_30d: vec![],
            platforms: vec![],
        },
        conclusions: Conclusions {
            overall: "当前环境缺少可用月报数据，已降级返回空数据。".to_string(),
            highlights: vec!["已尝试 ADS 月表与 DWS 日表聚合，当前月份数据不足。".to_string()],
            risks: vec!["请检查 DWS/ADS 月报链路是否已产出对应月份数据。".to_string()],
        },
    }
}
