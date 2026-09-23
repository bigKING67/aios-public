use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::types::RoleListItem;
use super::super::{row_mapping::row_to_role_list_item, types::RoleStorage};

pub(crate) async fn query_roles_by_storage(
    pool: &PgPool,
    storage: RoleStorage,
) -> AppResult<Vec<RoleListItem>> {
    let rows = match storage {
        RoleStorage::Auth => {
            sqlx::query(
                r#"
            SELECT
                CAST(r.id AS TEXT) AS id,
                r.name AS name,
                r.name AS code,
                NULL::TEXT AS description,
                TRUE AS is_active,
                r.created_at,
                COUNT(DISTINCT rp.permission_id)::BIGINT AS permissions_count,
                COUNT(DISTINCT ur.user_id)::BIGINT AS user_count
            FROM auth_roles r
            LEFT JOIN auth_role_permissions rp ON rp.role_id = r.id
            LEFT JOIN auth_user_roles ur ON ur.role_id = r.id
            GROUP BY r.id, r.name, r.created_at
            ORDER BY r.created_at DESC, r.id DESC
            "#,
            )
            .fetch_all(pool)
            .await
        }
        RoleStorage::Legacy => {
            sqlx::query(
                r#"
            SELECT
                CAST(r.id AS TEXT) AS id,
                COALESCE(r.display_name, r.name) AS name,
                r.name AS code,
                r.description,
                COALESCE(r.is_active, TRUE) AS is_active,
                r.created_at,
                COUNT(DISTINCT rp.permission_id)::BIGINT AS permissions_count,
                COUNT(DISTINCT ur.user_id)::BIGINT AS user_count
            FROM roles r
            LEFT JOIN role_permissions rp
              ON rp.role_id = r.id
             AND (rp.valid_until IS NULL OR rp.valid_until > CURRENT_TIMESTAMP)
            LEFT JOIN user_roles ur
              ON ur.role_id = r.id
             AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
            WHERE COALESCE(r.is_deleted, FALSE) = FALSE
            GROUP BY r.id, r.display_name, r.name, r.description, r.is_active, r.created_at
            ORDER BY r.created_at DESC, r.id DESC
            "#,
            )
            .fetch_all(pool)
            .await
        }
        RoleStorage::Ods => {
            sqlx::query(
                r#"
            SELECT
                CAST(r.id AS TEXT) AS id,
                COALESCE(r.display_name, r.name) AS name,
                r.name AS code,
                r.description,
                COALESCE(r.is_active, TRUE) AS is_active,
                r.created_at,
                COUNT(DISTINCT rp.permission_id)::BIGINT AS permissions_count,
                COUNT(DISTINCT ur.user_id)::BIGINT AS user_count
            FROM ods_aios_roles r
            LEFT JOIN ods_aios_role_permissions rp
              ON rp.role_id = r.id
             AND (rp.valid_until IS NULL OR rp.valid_until > CURRENT_TIMESTAMP)
            LEFT JOIN ods_aios_user_roles ur
              ON ur.role_id = r.id
             AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
            WHERE COALESCE(r.is_deleted, FALSE) = FALSE
            GROUP BY r.id, r.display_name, r.name, r.description, r.is_active, r.created_at
            ORDER BY r.created_at DESC, r.id DESC
            "#,
            )
            .fetch_all(pool)
            .await
        }
    }
    .map_err(|error| {
        error!(?error, ?storage, "query roles failed");
        AppError::Internal
    })?;

    Ok(rows.into_iter().map(row_to_role_list_item).collect())
}
