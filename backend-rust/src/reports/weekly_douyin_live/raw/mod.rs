mod baseline;
mod items;
mod queries;
mod types;

use chrono::Duration;
use serde_json::json;
use sqlx::PgPool;

use crate::error::AppResult;

use self::{
    baseline::build_prev_baseline_map,
    items::build_live_items,
    queries::{
        query_current_rows, query_max_source_date, query_previous_baseline_rows, query_raw_totals,
    },
};
use super::super::{
    periods::{normalize_week_period_for_api, parse_week_period},
    weekly_douyin_scope::{query_douyin_platform_scope, resolve_effective_as_of_date},
};

pub(crate) async fn build_weekly_douyin_live_attribution_from_raw(
    pool: &PgPool,
    normalized_week_period: &str,
    week_period: &str,
) -> AppResult<Vec<serde_json::Value>> {
    let (week_start, week_end) = parse_week_period(week_period)?;
    let platform_scope = query_douyin_platform_scope(pool, normalized_week_period).await?;

    let max_source_date = query_max_source_date(pool).await?;
    let Some(as_of_date) = resolve_effective_as_of_date(
        week_start,
        week_end,
        platform_scope.as_ref(),
        max_source_date,
    ) else {
        return Ok(Vec::new());
    };

    let observed_days = platform_scope
        .as_ref()
        .map(|scope| scope.observed_days)
        .unwrap_or_else(|| ((as_of_date - week_start).num_days() as i32 + 1).clamp(1, 7));
    let curr_start = week_start;
    let curr_end = as_of_date;
    let prev_start = week_start - Duration::days(7);
    let prev_end = as_of_date - Duration::days(7);

    let Some(totals) = query_raw_totals(pool, curr_start, curr_end, prev_start, prev_end).await?
    else {
        return Ok(Vec::new());
    };

    let prev_baseline_rows = query_previous_baseline_rows(pool, prev_start, prev_end).await?;
    let prev_baseline_map = build_prev_baseline_map(prev_baseline_rows);

    let Some(current_rows) = query_current_rows(pool, curr_start, curr_end).await? else {
        return Ok(Vec::new());
    };
    let items = build_live_items(current_rows, &prev_baseline_map);

    Ok(vec![json!({
        "platform": "douyin",
        "week_period": normalize_week_period_for_api(week_period),
        "as_of_date": as_of_date.to_string(),
        "observed_days": observed_days,
        "total_curr_gmv": totals.total_curr_gmv,
        "total_prev_gmv": totals.total_prev_gmv,
        "items": items
    })])
}
