use chrono::{Duration, NaiveDate};
use sqlx::{PgPool, Row};
use tracing::{error, warn};

use super::super::{
    summary_storage::is_undefined_table,
    weekly_douyin_scope::{query_douyin_platform_scope, resolve_effective_as_of_date},
};
use super::sql;
use crate::error::{AppError, AppResult};

#[derive(Clone, Copy)]
pub(super) struct ShortvideoAttributionWindow {
    pub(super) as_of_date: NaiveDate,
    pub(super) observed_days: i32,
    pub(super) curr_start: NaiveDate,
    pub(super) curr_end: NaiveDate,
    pub(super) prev_start: NaiveDate,
    pub(super) prev_end: NaiveDate,
}

pub(super) async fn resolve_attribution_window(
    pool: &PgPool,
    normalized_week_period: &str,
    week_start: NaiveDate,
    week_end: NaiveDate,
) -> AppResult<Option<ShortvideoAttributionWindow>> {
    let platform_scope = query_douyin_platform_scope(pool, normalized_week_period).await?;
    let max_source_date = match sqlx::query(sql::MAX_SOURCE_DATE).fetch_one(pool).await {
        Ok(row) => row
            .try_get::<Option<NaiveDate>, _>("max_stat_date")
            .unwrap_or(None),
        Err(error) if is_undefined_table(&error) => {
            warn!(
                ?error,
                "weekly douyin shortvideo attribution skipped, source table missing"
            );
            return Ok(None);
        }
        Err(error) => {
            error!(?error, "query douyin shortvideo max stat date failed");
            return Err(AppError::Internal);
        }
    };

    let Some(as_of_date) = resolve_effective_as_of_date(
        week_start,
        week_end,
        platform_scope.as_ref(),
        max_source_date,
    ) else {
        return Ok(None);
    };

    let observed_days = platform_scope
        .as_ref()
        .map(|scope| scope.observed_days)
        .unwrap_or_else(|| ((as_of_date - week_start).num_days() as i32 + 1).clamp(1, 7));

    Ok(Some(ShortvideoAttributionWindow {
        as_of_date,
        observed_days,
        curr_start: week_start,
        curr_end: as_of_date,
        prev_start: week_start - Duration::days(7),
        prev_end: as_of_date - Duration::days(7),
    }))
}
