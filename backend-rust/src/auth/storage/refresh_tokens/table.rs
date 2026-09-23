use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

pub(super) fn refresh_token_storage_unavailable(operation: &str) -> AppError {
    error!(
        operation = operation,
        "refresh token storage is unavailable"
    );
    AppError::Internal
}

pub(super) async fn resolve_refresh_token_table(pool: &PgPool) -> AppResult<Option<String>> {
    let row = sqlx::query(
        r#"
        SELECT CASE
            WHEN to_regclass('public.refresh_tokens') IS NOT NULL THEN 'refresh_tokens'
            WHEN to_regclass('public.ods_aios_refresh_tokens') IS NOT NULL THEN 'ods_aios_refresh_tokens'
            ELSE NULL
        END AS table_name
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "resolve refresh token table failed");
        AppError::Internal
    })?;

    let table_name = row
        .try_get::<Option<String>, _>("table_name")
        .ok()
        .flatten();
    Ok(table_name)
}
