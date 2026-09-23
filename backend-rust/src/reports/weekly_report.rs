use chrono::Utc;
use sqlx::PgPool;

use crate::error::{AppError, AppResult};

use super::{
    build_weekly_conclusions, build_weekly_douyin_card_attribution,
    build_weekly_douyin_live_attribution, build_weekly_douyin_shortvideo_attribution,
    build_weekly_goods_attribution, build_weekly_goods_channel_attribution,
    build_weekly_goods_channel_funnel_diagnosis, build_weekly_kpis, build_weekly_platforms,
    build_weekly_trends, extract_period_dates, normalize_week_period_for_api, query_all_trade_week,
    WeeklyCharts, WeeklyMetadata, WeeklyReportResponse,
};

pub(crate) async fn build_weekly_report(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<WeeklyReportResponse> {
    let row = query_all_trade_week(pool, week_period)
        .await?
        .ok_or(AppError::NotFound)?;

    let (period_start, period_end) = extract_period_dates(row.week_period.as_str())?;
    let kpis = build_weekly_kpis(&row);
    let (
        trends,
        platforms,
        goods_attribution,
        goods_channel_attribution,
        goods_channel_funnel_diagnosis,
        douyin_live_attribution,
        douyin_shortvideo_attribution,
        douyin_card_attribution,
    ) = tokio::try_join!(
        build_weekly_trends(pool, row.week_period.as_str()),
        build_weekly_platforms(pool, row.week_period.as_str()),
        build_weekly_goods_attribution(pool, row.week_period.as_str()),
        build_weekly_goods_channel_attribution(pool, row.week_period.as_str()),
        build_weekly_goods_channel_funnel_diagnosis(pool, row.week_period.as_str()),
        build_weekly_douyin_live_attribution(pool, row.week_period.as_str()),
        build_weekly_douyin_shortvideo_attribution(pool, row.week_period.as_str()),
        build_weekly_douyin_card_attribution(pool, row.week_period.as_str())
    )?;
    let conclusions = build_weekly_conclusions(&row);

    Ok(WeeklyReportResponse {
        metadata: WeeklyMetadata {
            report_type: "weekly".to_string(),
            report_id: normalize_week_period_for_api(row.week_period.as_str()),
            period_start,
            period_end,
            generated_at: Utc::now().to_rfc3339(),
        },
        kpis,
        charts: WeeklyCharts {
            trend_7d: trends,
            platforms,
            goods_attribution,
            goods_channel_attribution,
            goods_channel_funnel_diagnosis,
            douyin_live_attribution,
            douyin_shortvideo_attribution,
            douyin_card_attribution,
        },
        conclusions,
    })
}
