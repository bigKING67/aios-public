use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::{storage::RoleStorage, types::RolePermissionItem};
use super::row_mapping::row_to_role_permission_item;

pub(in crate::roles) async fn query_role_permissions_by_storage(
    pool: &PgPool,
    storage: RoleStorage,
    role_id: &str,
) -> AppResult<Vec<RolePermissionItem>> {
    let rows = match storage {
        RoleStorage::Auth => {
            sqlx::query(
                r#"
            SELECT
                ROW_NUMBER() OVER (ORDER BY p.key)::BIGINT AS id,
                p.key AS code,
                p.key AS display_name,
                split_part(p.key, ':', 1) AS module,
                split_part(p.key, ':', 2) AS action,
                NULLIF(split_part(p.key, ':', 3), '') AS resource_type
            FROM auth_role_permissions rp
            JOIN auth_permissions p ON p.id = rp.permission_id
            WHERE CAST(rp.role_id AS TEXT) = $1
            ORDER BY p.key
            "#,
            )
            .bind(role_id)
            .fetch_all(pool)
            .await
        }
        RoleStorage::Legacy => {
            sqlx::query(
                r#"
            SELECT
                p.id::BIGINT AS id,
                p.code,
                p.display_name,
                p.module,
                p.action,
                p.resource_type
            FROM role_permissions rp
            JOIN permissions p ON p.id = rp.permission_id
            WHERE CAST(rp.role_id AS TEXT) = $1
              AND COALESCE(p.is_deleted, FALSE) = FALSE
              AND COALESCE(p.is_active, TRUE) = TRUE
              AND (rp.valid_until IS NULL OR rp.valid_until > CURRENT_TIMESTAMP)
            ORDER BY p.code
            "#,
            )
            .bind(role_id)
            .fetch_all(pool)
            .await
        }
        RoleStorage::Ods => {
            sqlx::query(
                r#"
            SELECT
                p.id::BIGINT AS id,
                p.code,
                p.display_name,
                p.module,
                p.action,
                p.resource_type
            FROM ods_aios_role_permissions rp
            JOIN ods_aios_permissions p ON p.id = rp.permission_id
            WHERE CAST(rp.role_id AS TEXT) = $1
              AND COALESCE(p.is_deleted, FALSE) = FALSE
              AND COALESCE(p.is_active, TRUE) = TRUE
              AND (rp.valid_until IS NULL OR rp.valid_until > CURRENT_TIMESTAMP)
            ORDER BY p.code
            "#,
            )
            .bind(role_id)
            .fetch_all(pool)
            .await
        }
    }
    .map_err(|error| {
        error!(
            ?error,
            ?storage,
            role_id = role_id,
            "query role permissions failed"
        );
        AppError::Internal
    })?;

    Ok(rows.into_iter().map(row_to_role_permission_item).collect())
}
