use chrono::{DateTime, Utc};
use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::{
    hashing::hash_token,
    table::{refresh_token_storage_unavailable, resolve_refresh_token_table},
};

pub(crate) async fn persist_refresh_token(
    pool: &PgPool,
    user_id: &str,
    refresh_token: &str,
    expires_at: DateTime<Utc>,
) -> AppResult<()> {
    let table_name = resolve_refresh_token_table(pool)
        .await?
        .ok_or_else(|| refresh_token_storage_unavailable("persist_refresh_token"))?;

    let token_hash = hash_token(refresh_token);
    let sql = format!(
        "
        INSERT INTO {table_name} (
            user_id,
            token_hash,
            is_revoked,
            expires_at,
            ip_address,
            user_agent,
            created_at,
            last_used_at
        )
        VALUES ($1, $2, FALSE, $3, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (token_hash) DO UPDATE
        SET
            user_id = EXCLUDED.user_id,
            is_revoked = FALSE,
            expires_at = EXCLUDED.expires_at,
            revoked_at = NULL,
            last_used_at = CURRENT_TIMESTAMP
        "
    );

    sqlx::query(sql.as_str())
        .bind(user_id)
        .bind(token_hash)
        .bind(expires_at)
        .execute(pool)
        .await
        .map_err(|error| {
            error!(?error, "persist refresh token failed");
            AppError::Internal
        })?;

    Ok(())
}
