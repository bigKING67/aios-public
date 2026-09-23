mod base_platform;
mod full_metrics;
mod platform_metrics;

use sqlx::PgPool;
use tracing::{error, warn};

use super::super::summary_storage::is_undefined_table;
use crate::error::{AppError, AppResult};

use self::base_platform::QUERY_WITHOUT_METRICS;
use self::full_metrics::QUERY_WITH_METRICS;
use self::platform_metrics::QUERY_WITH_PLATFORM_METRICS_ONLY;

pub(super) async fn query_weekly_platform_rows(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<sqlx::postgres::PgRow>> {
    match sqlx::query(QUERY_WITH_METRICS)
        .bind(week_period)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(rows),
        Err(error) if is_undefined_table(&error) => {
            warn!(
                ?error,
                "weekly douyin metric/channel table missing, fallback to platform metrics query"
            );
            query_weekly_platform_rows_with_metrics_fallback(pool, week_period).await
        }
        Err(error) => {
            error!(?error, "query weekly platforms failed");
            Err(AppError::Internal)
        }
    }
}

async fn query_weekly_platform_rows_with_metrics_fallback(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<sqlx::postgres::PgRow>> {
    match sqlx::query(QUERY_WITH_PLATFORM_METRICS_ONLY)
        .bind(week_period)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(rows),
        Err(metrics_error) if is_undefined_table(&metrics_error) => {
            warn!(
                ?metrics_error,
                "weekly platform metrics table missing, fallback to base platform query"
            );
            sqlx::query(QUERY_WITHOUT_METRICS)
                .bind(week_period)
                .fetch_all(pool)
                .await
                .map_err(|fallback_error| {
                    error!(?fallback_error, "query weekly platforms fallback failed");
                    AppError::Internal
                })
        }
        Err(metrics_error) => {
            error!(
                ?metrics_error,
                "query weekly platforms with metrics fallback failed"
            );
            Err(AppError::Internal)
        }
    }
}
