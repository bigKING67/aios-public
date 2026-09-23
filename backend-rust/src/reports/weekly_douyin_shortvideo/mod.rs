use serde_json::json;
use sqlx::PgPool;

use super::periods::{
    normalize_week_period_for_api, normalize_week_period_for_db, parse_week_period,
};
use crate::error::AppResult;

mod ads;
mod period_scope;
mod queries;
mod rows;
mod sql;

pub(super) async fn build_weekly_douyin_shortvideo_attribution(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<serde_json::Value>> {
    let normalized = normalize_week_period_for_db(week_period);
    if let Some(result) = ads::try_build_weekly_douyin_shortvideo_attribution_from_ads(
        pool,
        normalized.as_str(),
        week_period,
    )
    .await?
    {
        return Ok(result);
    }

    let (week_start, week_end) = parse_week_period(week_period)?;
    let Some(window) =
        period_scope::resolve_attribution_window(pool, normalized.as_str(), week_start, week_end)
            .await?
    else {
        return Ok(Vec::new());
    };

    let Some(totals) = queries::query_shortvideo_totals(pool, &window).await? else {
        return Ok(Vec::new());
    };
    let prev_rows = queries::query_previous_rows(pool, &window).await?;
    let Some(current_rows) = queries::query_current_rows(pool, &window).await? else {
        return Ok(Vec::new());
    };
    let items = rows::build_legacy_items(prev_rows, current_rows);

    Ok(vec![json!({
        "platform": "douyin",
        "week_period": normalize_week_period_for_api(week_period),
        "as_of_date": window.as_of_date.to_string(),
        "observed_days": window.observed_days,
        "total_curr_gmv": totals.total_curr_gmv,
        "total_prev_gmv": totals.total_prev_gmv,
        "items": items
    })])
}
