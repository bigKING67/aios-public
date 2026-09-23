use chrono::NaiveDate;
use sqlx::{postgres::PgRow, PgPool, Row};
use tracing::{error, warn};

use crate::error::{AppError, AppResult};

use super::super::super::summary_storage::is_undefined_table;
use super::types::RawTotals;

const RAW_MAX_SOURCE_DATE_SQL: &str = include_str!("../raw_max_source_date.sql");
const RAW_TOTALS_SQL: &str = include_str!("../raw_totals.sql");
const RAW_PREVIOUS_BASELINE_SQL: &str = include_str!("../raw_previous_baseline.sql");
const RAW_CURRENT_ROWS_SQL: &str = include_str!("../raw_current_rows.sql");

pub(super) async fn query_max_source_date(pool: &PgPool) -> AppResult<Option<NaiveDate>> {
    match sqlx::query(RAW_MAX_SOURCE_DATE_SQL).fetch_one(pool).await {
        Ok(row) => Ok(row
            .try_get::<Option<NaiveDate>, _>("max_stat_date")
            .unwrap_or(None)),
        Err(error) if is_undefined_table(&error) => {
            warn!(
                ?error,
                "weekly douyin live attribution skipped, source table missing"
            );
            Ok(None)
        }
        Err(error) => {
            error!(?error, "query douyin live max stat date failed");
            Err(AppError::Internal)
        }
    }
}

pub(super) async fn query_raw_totals(
    pool: &PgPool,
    curr_start: NaiveDate,
    curr_end: NaiveDate,
    prev_start: NaiveDate,
    prev_end: NaiveDate,
) -> AppResult<Option<RawTotals>> {
    let total_row = match sqlx::query(RAW_TOTALS_SQL)
        .bind(curr_start)
        .bind(curr_end)
        .bind(prev_start)
        .bind(prev_end)
        .fetch_one(pool)
        .await
    {
        Ok(row) => row,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query douyin live attribution totals failed");
            return Err(AppError::Internal);
        }
    };

    Ok(Some(RawTotals {
        total_curr_gmv: total_row
            .try_get::<Option<f64>, _>("curr_live_gmv")
            .unwrap_or(None)
            .unwrap_or(0.0),
        total_prev_gmv: total_row
            .try_get::<Option<f64>, _>("prev_live_gmv")
            .unwrap_or(None)
            .unwrap_or(0.0),
    }))
}

pub(super) async fn query_previous_baseline_rows(
    pool: &PgPool,
    prev_start: NaiveDate,
    prev_end: NaiveDate,
) -> AppResult<Vec<PgRow>> {
    match sqlx::query(RAW_PREVIOUS_BASELINE_SQL)
        .bind(prev_start)
        .bind(prev_end)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(rows),
        Err(error) if is_undefined_table(&error) => Ok(Vec::new()),
        Err(error) => {
            error!(?error, "query douyin live attribution baseline failed");
            Err(AppError::Internal)
        }
    }
}

pub(super) async fn query_current_rows(
    pool: &PgPool,
    curr_start: NaiveDate,
    curr_end: NaiveDate,
) -> AppResult<Option<Vec<PgRow>>> {
    match sqlx::query(RAW_CURRENT_ROWS_SQL)
        .bind(curr_start)
        .bind(curr_end)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(Some(rows)),
        Err(error) if is_undefined_table(&error) => Ok(None),
        Err(error) => {
            error!(?error, "query douyin live attribution rows failed");
            Err(AppError::Internal)
        }
    }
}
