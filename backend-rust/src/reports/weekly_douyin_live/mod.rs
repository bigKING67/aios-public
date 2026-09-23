mod ads;
mod raw;

use sqlx::PgPool;

use crate::error::AppResult;

use super::periods::normalize_week_period_for_db;

pub(super) async fn build_weekly_douyin_live_attribution(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<serde_json::Value>> {
    let normalized = normalize_week_period_for_db(week_period);

    if let Some(result) = ads::try_build_weekly_douyin_live_attribution_from_ads(
        pool,
        normalized.as_str(),
        week_period,
    )
    .await?
    {
        return Ok(result);
    }

    raw::build_weekly_douyin_live_attribution_from_raw(pool, normalized.as_str(), week_period).await
}
