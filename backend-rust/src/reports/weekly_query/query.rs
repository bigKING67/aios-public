use sqlx::PgPool;
use tracing::{error, info};

use super::super::{periods::normalize_week_period_for_db, WeeklyRow};
use super::{rows::map_weekly_row, sql};
use crate::error::{AppError, AppResult};

pub(crate) async fn query_all_trade_week(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Option<WeeklyRow>> {
    let normalized = normalize_week_period_for_db(week_period);
    let (base_row, platform_aggregate_row) = tokio::try_join!(
        query_all_trade_week_base(pool, normalized.as_str()),
        query_all_trade_week_platform_aggregate(pool, normalized.as_str())
    )?;

    let selected = match (base_row, platform_aggregate_row) {
        (Some(base), Some(platform_aggregate)) => {
            let should_use_platform_snapshot =
                match (base.as_of_date, platform_aggregate.as_of_date) {
                    (Some(base_date), Some(platform_date)) => platform_date > base_date,
                    (None, Some(_)) => true,
                    _ => false,
                };

            if should_use_platform_snapshot {
                info!(
                    week_period = %normalized,
                    base_as_of_date = ?base.as_of_date,
                    platform_as_of_date = ?platform_aggregate.as_of_date,
                    "weekly kpi snapshot aligned to fresher platform aggregate"
                );
                platform_aggregate
            } else {
                base
            }
        }
        (Some(base), None) => base,
        (None, Some(platform_aggregate)) => platform_aggregate,
        (None, None) => return Ok(None),
    };

    Ok(Some(selected))
}

async fn query_all_trade_week_base(
    pool: &PgPool,
    normalized_week_period: &str,
) -> AppResult<Option<WeeklyRow>> {
    let row = sqlx::query(sql::ALL_TRADE_WEEK_BASE)
        .bind(normalized_week_period)
        .fetch_optional(pool)
        .await
        .map_err(|error| {
            error!(?error, "query all_trade_week failed");
            AppError::Internal
        })?;

    Ok(row.map(map_weekly_row))
}

async fn query_all_trade_week_platform_aggregate(
    pool: &PgPool,
    normalized_week_period: &str,
) -> AppResult<Option<WeeklyRow>> {
    let row = sqlx::query(sql::ALL_TRADE_WEEK_PLATFORM_AGGREGATE)
        .bind(normalized_week_period)
        .fetch_optional(pool)
        .await
        .map_err(|error| {
            error!(?error, "query all_trade_week_platform aggregate failed");
            AppError::Internal
        })?;

    Ok(row.map(map_weekly_row))
}
