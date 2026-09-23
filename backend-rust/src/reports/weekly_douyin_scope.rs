use chrono::NaiveDate;
use sqlx::{PgPool, Row};
use tracing::error;

use super::summary_storage::is_undefined_table;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub(super) struct DouyinPlatformScope {
    pub(super) as_of_date: NaiveDate,
    pub(super) observed_days: i32,
}

pub(super) async fn query_douyin_platform_scope(
    pool: &PgPool,
    normalized_week_period: &str,
) -> AppResult<Option<DouyinPlatformScope>> {
    let row = match sqlx::query(
        r#"
        SELECT
            as_of_date,
            observed_days
        FROM ads.report_all_trade_week_platform
        WHERE week_period = $1
          AND platform = 'douyin'
        LIMIT 1
        "#,
    )
    .bind(normalized_week_period)
    .fetch_optional(pool)
    .await
    {
        Ok(row) => row,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query douyin weekly platform scope failed");
            return Err(AppError::Internal);
        }
    };

    let Some(row) = row else {
        return Ok(None);
    };

    let as_of_date = row
        .try_get::<Option<NaiveDate>, _>("as_of_date")
        .unwrap_or(None);
    let observed_days = row
        .try_get::<Option<i32>, _>("observed_days")
        .unwrap_or(None)
        .unwrap_or(0);

    let Some(as_of_date) = as_of_date else {
        return Ok(None);
    };

    let normalized_observed_days = observed_days.clamp(1, 7);
    Ok(Some(DouyinPlatformScope {
        as_of_date,
        observed_days: normalized_observed_days,
    }))
}

pub(super) fn resolve_effective_as_of_date(
    week_start: NaiveDate,
    week_end: NaiveDate,
    platform_scope: Option<&DouyinPlatformScope>,
    max_source_date: Option<NaiveDate>,
) -> Option<NaiveDate> {
    let mut as_of_date = platform_scope
        .map(|scope| scope.as_of_date)
        .unwrap_or(week_end);
    as_of_date = as_of_date.min(week_end);

    if let Some(max_date) = max_source_date {
        as_of_date = as_of_date.min(max_date);
    }

    if as_of_date < week_start {
        return None;
    }

    Some(as_of_date)
}
