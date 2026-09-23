use sqlx::{postgres::PgRow, PgPool};
use tracing::{error, warn};

use crate::error::{AppError, AppResult};

use super::super::super::summary_storage::is_undefined_table;

pub(super) async fn query_rows_with_fallback(
    pool: &PgPool,
    query_sql: &str,
    week_period: &str,
    product_id: &str,
    missing_table_log: &str,
    failed_log: &str,
) -> AppResult<Vec<PgRow>> {
    match sqlx::query(query_sql)
        .bind(week_period)
        .bind(product_id)
        .fetch_all(pool)
        .await
    {
        Ok(rows) if rows.is_empty() => Ok(Vec::new()),
        Ok(rows) => Ok(rows),
        Err(error) if is_undefined_table(&error) => {
            warn!(?error, "{missing_table_log}");
            Ok(Vec::new())
        }
        Err(error) => {
            error!(?error, "{failed_log}");
            Err(AppError::Internal)
        }
    }
}
