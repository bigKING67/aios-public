use std::cmp;

use sqlx::{PgPool, Row};
use tracing::{error, warn};

use super::super::{
    periods::{convert_iso_week_to_period, is_week_period_like, normalize_week_period_for_api},
    PeriodOption,
};
use super::sql;
use crate::error::{AppError, AppResult};

pub(crate) async fn resolve_week_period(
    pool: &PgPool,
    report_id: &str,
    explicit: Option<&str>,
) -> AppResult<String> {
    let candidate = if let Some(explicit_week_period) = explicit {
        explicit_week_period.trim().to_string()
    } else {
        let report_id_trimmed = report_id.trim();

        if is_week_period_like(report_id_trimmed) {
            report_id_trimmed.to_string()
        } else {
            let lower = report_id_trimmed.to_lowercase();
            if lower == "latest" || lower == "current" {
                get_latest_week_period(pool)
                    .await?
                    .ok_or(AppError::NotFound)?
            } else {
                convert_iso_week_to_period(report_id_trimmed)?
            }
        }
    };

    let normalized = normalize_week_period_for_api(candidate.as_str());
    if !is_week_period_like(normalized.as_str()) {
        return Err(AppError::bad_request("Invalid week_period format"));
    }

    Ok(normalized)
}

pub(crate) async fn get_latest_week_period(pool: &PgPool) -> AppResult<Option<String>> {
    let primary_query = sqlx::query(sql::LATEST_WEEK_PERIOD_PRIMARY)
        .fetch_optional(pool)
        .await;

    let row = match primary_query {
        Ok(row) => row,
        Err(primary_error) => {
            warn!(
                ?primary_error,
                "query latest week period by as_of_date failed, fallback to week_period sort"
            );

            sqlx::query(sql::LATEST_WEEK_PERIOD_FALLBACK)
                .fetch_optional(pool)
                .await
                .map_err(|error| {
                    error!(?error, "query latest week period failed");
                    AppError::Internal
                })?
        }
    };

    Ok(row.map(|row| {
        let value = row.try_get::<String, _>("week_period").unwrap_or_default();
        normalize_week_period_for_api(value.as_str())
    }))
}

pub(crate) async fn get_all_week_periods(
    pool: &PgPool,
    limit: i64,
) -> AppResult<Vec<PeriodOption>> {
    let safe_limit = cmp::min(limit.max(1), 200);

    let primary_query = sqlx::query(sql::ALL_WEEK_PERIODS_PRIMARY)
        .bind(safe_limit)
        .fetch_all(pool)
        .await;

    let rows = match primary_query {
        Ok(rows) => rows,
        Err(primary_error) => {
            warn!(
                ?primary_error,
                "query all week periods by as_of_date failed, fallback to week_period sort"
            );

            sqlx::query(sql::ALL_WEEK_PERIODS_FALLBACK)
                .bind(safe_limit)
                .fetch_all(pool)
                .await
                .map_err(|error| {
                    error!(?error, "query all week periods failed");
                    AppError::Internal
                })?
        }
    };

    let result = rows
        .into_iter()
        .filter_map(|row| {
            row.try_get::<Option<String>, _>("week_period")
                .ok()
                .flatten()
        })
        .map(|period| {
            let value = normalize_week_period_for_api(period.as_str());
            PeriodOption {
                label: value.replace('~', " ~ "),
                value,
            }
        })
        .collect();

    Ok(result)
}
