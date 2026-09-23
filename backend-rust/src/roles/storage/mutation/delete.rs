use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::types::RoleStorage;

pub(crate) async fn soft_delete_role_by_storage(
    pool: &PgPool,
    storage: RoleStorage,
    role_id: &str,
) -> AppResult<bool> {
    let result = match storage {
        RoleStorage::Auth => {
            sqlx::query(
                r#"
            DELETE FROM auth_roles
            WHERE CAST(id AS TEXT) = $1
            "#,
            )
            .bind(role_id)
            .execute(pool)
            .await
        }
        RoleStorage::Legacy => {
            sqlx::query(
                r#"
            UPDATE roles
            SET
                is_active = FALSE,
                is_deleted = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
              AND COALESCE(is_system, FALSE) = FALSE
            "#,
            )
            .bind(role_id)
            .execute(pool)
            .await
        }
        RoleStorage::Ods => {
            sqlx::query(
                r#"
            UPDATE ods_aios_roles
            SET
                is_active = FALSE,
                is_deleted = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
              AND COALESCE(is_system, FALSE) = FALSE
            "#,
            )
            .bind(role_id)
            .execute(pool)
            .await
        }
    }
    .map_err(|error| {
        error!(?error, ?storage, role_id = role_id, "delete role failed");
        AppError::Internal
    })?;

    Ok(result.rows_affected() > 0)
}
