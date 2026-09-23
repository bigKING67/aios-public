use sqlx::PgPool;

use super::{periods::normalize_week_period_for_db, PlatformData};
use crate::error::AppResult;

mod queries;
mod rows;

use queries::query_weekly_platform_rows;
use rows::map_weekly_platform_rows;

pub(super) async fn build_weekly_platforms(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<PlatformData>> {
    let normalized = normalize_week_period_for_db(week_period);
    let rows = query_weekly_platform_rows(pool, normalized.as_str()).await?;

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    Ok(map_weekly_platform_rows(rows))
}
