use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::{
    hashing::hash_token,
    table::{refresh_token_storage_unavailable, resolve_refresh_token_table},
};

pub(crate) async fn validate_refresh_token_storage(
    pool: &PgPool,
    refresh_token: &str,
    expected_user_id: &str,
) -> AppResult<()> {
    let table_name = resolve_refresh_token_table(pool)
        .await?
        .ok_or_else(|| refresh_token_storage_unavailable("validate_refresh_token_storage"))?;

    let token_hash = hash_token(refresh_token);
    let sql = format!(
        "
        SELECT CAST(user_id AS TEXT) AS user_id, is_revoked, expires_at
        FROM {table_name}
        WHERE token_hash = $1
        LIMIT 1
        "
    );

    let row = sqlx::query(sql.as_str())
        .bind(token_hash)
        .fetch_optional(pool)
        .await
        .map_err(|error| {
            error!(?error, "validate refresh token storage failed");
            AppError::Internal
        })?
        .ok_or(AppError::Unauthorized)?;

    let user_id = row
        .try_get::<String, _>("user_id")
        .unwrap_or_else(|_| String::new());
    let is_revoked = row.try_get::<bool, _>("is_revoked").unwrap_or(true);
    let expires_at = row
        .try_get::<Option<DateTime<Utc>>, _>("expires_at")
        .ok()
        .flatten();

    if is_revoked || user_id != expected_user_id {
        return Err(AppError::Unauthorized);
    }

    if let Some(expires_at) = expires_at {
        if expires_at < Utc::now() {
            return Err(AppError::Unauthorized);
        }
    }

    Ok(())
}
