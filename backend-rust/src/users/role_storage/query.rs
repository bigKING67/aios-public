use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::{storage::UserStorage, types::UserRoleItem};
use super::row_mapping::row_to_user_role_item;

pub(crate) async fn query_user_roles_by_storage(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
) -> AppResult<Vec<UserRoleItem>> {
    let rows = match storage {
        UserStorage::Auth => {
            sqlx::query(
                r#"
            SELECT
                CAST(r.id AS TEXT) AS id,
                r.name AS code,
                r.name AS name,
                TRUE AS is_active
            FROM auth_user_roles ur
            JOIN auth_roles r ON r.id = ur.role_id
            WHERE CAST(ur.user_id AS TEXT) = $1
            ORDER BY r.name
            "#,
            )
            .bind(user_id)
            .fetch_all(pool)
            .await
        }
        UserStorage::Legacy => {
            sqlx::query(
                r#"
            SELECT
                CAST(r.id AS TEXT) AS id,
                r.name AS code,
                COALESCE(r.display_name, r.name) AS name,
                COALESCE(r.is_active, TRUE) AS is_active
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE CAST(ur.user_id AS TEXT) = $1
              AND COALESCE(r.is_deleted, FALSE) = FALSE
              AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
            ORDER BY r.name
            "#,
            )
            .bind(user_id)
            .fetch_all(pool)
            .await
        }
        UserStorage::Ods => {
            sqlx::query(
                r#"
            SELECT
                CAST(r.id AS TEXT) AS id,
                r.name AS code,
                COALESCE(r.display_name, r.name) AS name,
                COALESCE(r.is_active, TRUE) AS is_active
            FROM ods_aios_user_roles ur
            JOIN ods_aios_roles r ON r.id = ur.role_id
            WHERE CAST(ur.user_id AS TEXT) = $1
              AND COALESCE(r.is_deleted, FALSE) = FALSE
              AND COALESCE(r.is_active, TRUE) = TRUE
              AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
            ORDER BY r.name
            "#,
            )
            .bind(user_id)
            .fetch_all(pool)
            .await
        }
    }
    .map_err(|error| {
        error!(
            ?error,
            ?storage,
            user_id = user_id,
            "query user roles failed"
        );
        AppError::Internal
    })?;

    Ok(rows.into_iter().map(row_to_user_role_item).collect())
}
