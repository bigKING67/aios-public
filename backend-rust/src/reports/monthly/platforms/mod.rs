use sqlx::PgPool;

use super::super::PlatformData;
use crate::error::AppResult;

mod ads;
mod overview;
mod rows;

pub(crate) async fn build_monthly_platform_data(
    pool: &PgPool,
    year: i32,
    month: u32,
) -> AppResult<Vec<PlatformData>> {
    if let Some(platforms) = ads::query_monthly_platform_from_ads(pool, year, month).await? {
        return Ok(platforms);
    }

    overview::query_monthly_platform_from_overview(pool, year, month).await
}
