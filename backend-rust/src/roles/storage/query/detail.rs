use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::types::RoleListItem;
use super::super::{row_mapping::row_to_role_list_item, types::RoleStorage};

pub(crate) async fn query_role_detail_by_storage(
    pool: &PgPool,
    storage: RoleStorage,
    role_id: &str,
) -> AppResult<Option<RoleListItem>> {
    let row = match storage {
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
            WHERE CAST(r.id AS TEXT) = $1
            GROUP BY r.id, r.name, r.created_at
            "#,
            )
            .bind(role_id)
            .fetch_optional(pool)
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
            WHERE CAST(r.id AS TEXT) = $1
              AND COALESCE(r.is_deleted, FALSE) = FALSE
            GROUP BY r.id, r.display_name, r.name, r.description, r.is_active, r.created_at
            "#,
            )
            .bind(role_id)
            .fetch_optional(pool)
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
            WHERE CAST(r.id AS TEXT) = $1
              AND COALESCE(r.is_deleted, FALSE) = FALSE
            GROUP BY r.id, r.display_name, r.name, r.description, r.is_active, r.created_at
            "#,
            )
            .bind(role_id)
            .fetch_optional(pool)
            .await
        }
    }
    .map_err(|error| {
        error!(
            ?error,
            ?storage,
            role_id = role_id,
            "query role detail failed"
        );
        AppError::Internal
    })?;

    Ok(row.map(row_to_role_list_item))
}
