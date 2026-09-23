use sqlx::{postgres::PgRow, PgPool, Row};
use tracing::error;

use super::super::summary_storage::is_undefined_table;
use super::{period_scope::ShortvideoAttributionWindow, sql};
use crate::error::{AppError, AppResult};

pub(super) struct ShortvideoTotals {
    pub(super) total_curr_gmv: f64,
    pub(super) total_prev_gmv: f64,
}

pub(super) async fn query_shortvideo_totals(
    pool: &PgPool,
    window: &ShortvideoAttributionWindow,
) -> AppResult<Option<ShortvideoTotals>> {
    let total_row = match sqlx::query(sql::TOTALS)
        .bind(window.curr_start)
        .bind(window.curr_end)
        .bind(window.prev_start)
        .bind(window.prev_end)
        .fetch_one(pool)
        .await
    {
        Ok(row) => row,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query douyin shortvideo attribution totals failed");
            return Err(AppError::Internal);
        }
    };

    Ok(Some(ShortvideoTotals {
        total_curr_gmv: total_row
            .try_get::<Option<f64>, _>("curr_gmv")
            .unwrap_or(None)
            .unwrap_or(0.0),
        total_prev_gmv: total_row
            .try_get::<Option<f64>, _>("prev_gmv")
            .unwrap_or(None)
            .unwrap_or(0.0),
    }))
}

pub(super) async fn query_previous_rows(
    pool: &PgPool,
    window: &ShortvideoAttributionWindow,
) -> AppResult<Vec<PgRow>> {
    match sqlx::query(sql::PREVIOUS_ROWS)
        .bind(window.prev_start)
        .bind(window.prev_end)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(rows),
        Err(error) if is_undefined_table(&error) => Ok(Vec::new()),
        Err(error) => {
            error!(
                ?error,
                "query douyin shortvideo attribution baseline failed"
            );
            Err(AppError::Internal)
        }
    }
}

pub(super) async fn query_current_rows(
    pool: &PgPool,
    window: &ShortvideoAttributionWindow,
) -> AppResult<Option<Vec<PgRow>>> {
    match sqlx::query(sql::CURRENT_ROWS)
        .bind(window.curr_start)
        .bind(window.curr_end)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(Some(rows)),
        Err(error) if is_undefined_table(&error) => Ok(None),
        Err(error) => {
            error!(?error, "query douyin shortvideo attribution rows failed");
            Err(AppError::Internal)
        }
    }
}
