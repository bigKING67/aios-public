mod aggregate;
mod empty;
mod trend;

use chrono::Utc;
use sqlx::PgPool;

use self::{
    aggregate::query_monthly_aggregate, empty::build_empty_monthly_report,
    trend::build_monthly_trend_chart,
};
use super::{
    build_monthly_conclusions, build_monthly_kpis, build_monthly_platform_data, month_start_end,
    parse_month_period, MonthlyCharts, MonthlyMetadata, MonthlyReportResponse,
};
use crate::error::AppResult;

pub(super) async fn build_monthly_report(
    pool: &PgPool,
    month_period: &str,
) -> AppResult<MonthlyReportResponse> {
    let (year, month) = parse_month_period(month_period)?;

    let aggregate = query_monthly_aggregate(pool, year, month).await?;
    let Some(data) = aggregate else {
        return Ok(build_empty_monthly_report(month_period));
    };

    let (period_start, period_end) = month_start_end(year, month)?;

    let kpis = build_monthly_kpis(&data);
    let trends = build_monthly_trend_chart(pool, year, month).await?;
    let platforms = build_monthly_platform_data(pool, year, month).await?;
    let conclusions = build_monthly_conclusions(&data);

    Ok(MonthlyReportResponse {
        metadata: MonthlyMetadata {
            report_type: "monthly".to_string(),
            report_id: format!("{year}-{month:02}"),
            period_month: format!("{year}-{month:02}"),
            period_start,
            period_end,
            generated_at: Utc::now().to_rfc3339(),
        },
        kpis,
        charts: MonthlyCharts {
            trend_30d: trends,
            platforms,
        },
        conclusions,
    })
}
