use serde_json::json;
use sqlx::PgPool;

use crate::error::AppResult;

use super::super::periods::normalize_week_period_for_api;

mod rows;
mod summary;

pub(crate) async fn try_build_weekly_douyin_live_attribution_from_ads(
    pool: &PgPool,
    normalized_week_period: &str,
    week_period: &str,
) -> AppResult<Option<Vec<serde_json::Value>>> {
    let Some(summary) = summary::fetch_ads_live_summary(pool, normalized_week_period).await? else {
        return Ok(None);
    };
    let Some(items) = rows::fetch_ads_live_items(pool, normalized_week_period).await? else {
        return Ok(None);
    };

    Ok(Some(vec![json!({
        "platform": "douyin",
        "week_period": normalize_week_period_for_api(week_period),
        "as_of_date": summary.as_of_date.map(|value| value.to_string()),
        "observed_days": summary.observed_days,
        "total_curr_gmv": summary.total_curr_gmv,
        "total_prev_gmv": summary.total_prev_gmv,
        "items": items
    })]))
}
