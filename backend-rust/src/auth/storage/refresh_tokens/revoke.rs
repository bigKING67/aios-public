use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::{
    hashing::hash_token,
    table::{refresh_token_storage_unavailable, resolve_refresh_token_table},
};

pub(crate) async fn revoke_refresh_token(pool: &PgPool, refresh_token: &str) -> AppResult<()> {
    let table_name = resolve_refresh_token_table(pool)
        .await?
        .ok_or_else(|| refresh_token_storage_unavailable("revoke_refresh_token"))?;

    let token_hash = hash_token(refresh_token);
    let sql = format!(
        "
        UPDATE {table_name}
        SET
            is_revoked = TRUE,
            revoked_at = CURRENT_TIMESTAMP,
            last_used_at = CURRENT_TIMESTAMP
        WHERE token_hash = $1
        "
    );

    sqlx::query(sql.as_str())
        .bind(token_hash)
        .execute(pool)
        .await
        .map_err(|error| {
            error!(?error, "revoke refresh token failed");
            AppError::Internal
        })?;

    Ok(())
}
