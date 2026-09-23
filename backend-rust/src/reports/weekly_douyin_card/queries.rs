use sqlx::{postgres::PgRow, PgPool, Row};
use tracing::error;

use super::super::summary_storage::is_undefined_table;
use super::{period_scope::AttributionWindow, sql};
use crate::error::{AppError, AppResult};

pub(super) struct CardGmvTotals {
    pub(super) total_curr_gmv: f64,
    pub(super) total_prev_gmv: f64,
}

pub(super) async fn query_card_gmv_totals(
    pool: &PgPool,
    window: &AttributionWindow,
) -> AppResult<Option<CardGmvTotals>> {
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
            error!(?error, "query douyin card attribution totals failed");
            return Err(AppError::Internal);
        }
    };

    Ok(Some(CardGmvTotals {
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

pub(super) async fn query_previous_product_rows(
    pool: &PgPool,
    window: &AttributionWindow,
) -> AppResult<Vec<PgRow>> {
    match sqlx::query(sql::PREVIOUS_PRODUCTS)
        .bind(window.prev_start)
        .bind(window.prev_end)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(rows),
        Err(error) if is_undefined_table(&error) => Ok(Vec::new()),
        Err(error) => {
            error!(?error, "query douyin card attribution baseline failed");
            Err(AppError::Internal)
        }
    }
}

pub(super) async fn query_current_product_rows(
    pool: &PgPool,
    window: &AttributionWindow,
) -> AppResult<Option<Vec<PgRow>>> {
    match sqlx::query(sql::CURRENT_PRODUCTS)
        .bind(window.curr_start)
        .bind(window.curr_end)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(Some(rows)),
        Err(error) if is_undefined_table(&error) => Ok(None),
        Err(error) => {
            error!(?error, "query douyin card attribution rows failed");
            Err(AppError::Internal)
        }
    }
}

pub(super) async fn query_current_source_rows(
    pool: &PgPool,
    window: &AttributionWindow,
    product_id: &str,
) -> AppResult<Vec<PgRow>> {
    match sqlx::query(sql::CURRENT_SOURCES)
        .bind(window.curr_start)
        .bind(window.curr_end)
        .bind(product_id)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(rows),
        Err(error) if is_undefined_table(&error) => Ok(Vec::new()),
        Err(error) => {
            error!(?error, "query douyin card attribution source rows failed");
            Err(AppError::Internal)
        }
    }
}

pub(super) async fn query_previous_source_rows(
    pool: &PgPool,
    window: &AttributionWindow,
    product_id: &str,
) -> AppResult<Vec<PgRow>> {
    match sqlx::query(sql::PREVIOUS_SOURCES)
        .bind(window.prev_start)
        .bind(window.prev_end)
        .bind(product_id)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => Ok(rows),
        Err(error) if is_undefined_table(&error) => Ok(Vec::new()),
        Err(error) => {
            error!(
                ?error,
                "query douyin card attribution prev source rows failed"
            );
            Err(AppError::Internal)
        }
    }
}
