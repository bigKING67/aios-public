use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::types::UserStorage;

pub(super) async fn soft_delete_legacy_user(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
) -> AppResult<bool> {
    sqlx::query(
        r#"
        UPDATE users
        SET
            is_active = FALSE,
            is_deleted = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE CAST(id AS TEXT) = $1
          AND COALESCE(is_deleted, FALSE) = FALSE
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await
    .map(|result| result.rows_affected() > 0)
    .map_err(|error| {
        error!(?error, ?storage, user_id = user_id, "delete user failed");
        AppError::Internal
    })
}

pub(super) async fn soft_delete_ods_user(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
) -> AppResult<bool> {
    sqlx::query(
        r#"
        UPDATE ods_aios_users
        SET
            is_active = FALSE,
            is_deleted = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE CAST(id AS TEXT) = $1
          AND COALESCE(is_deleted, FALSE) = FALSE
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await
    .map(|result| result.rows_affected() > 0)
    .map_err(|error| {
        error!(?error, ?storage, user_id = user_id, "delete user failed");
        AppError::Internal
    })
}
