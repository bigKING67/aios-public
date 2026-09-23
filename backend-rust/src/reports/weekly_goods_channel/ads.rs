use sqlx::{postgres::PgRow, PgPool};
use tracing::{error, warn};

use super::super::summary_storage::is_undefined_table;
use super::sql;
use crate::error::{AppError, AppResult};

pub(super) async fn query_ads_rows(
    pool: &PgPool,
    normalized_week_period: &str,
) -> AppResult<Option<Vec<PgRow>>> {
    match sqlx::query(sql::ADS_QUERY)
        .bind(normalized_week_period)
        .fetch_all(pool)
        .await
    {
        Ok(rows) if rows.is_empty() => Ok(None),
        Ok(rows) => Ok(Some(rows)),
        Err(error) if is_undefined_table(&error) => {
            warn!(
                ?error,
                "weekly goods channel attribution ads table missing, fallback to dwd query"
            );
            Ok(None)
        }
        Err(error) => {
            error!(
                ?error,
                "query weekly goods channel attribution from ads failed"
            );
            Err(AppError::Internal)
        }
    }
}
