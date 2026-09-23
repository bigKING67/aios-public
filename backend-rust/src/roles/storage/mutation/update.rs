use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::{
    permission_storage::query_role_permissions_by_storage,
    types::{NormalizedRolePatch, RoleListItem},
};
use super::super::{
    errors::is_unique_violation, row_mapping::row_to_role_list_item, types::RoleStorage,
};

pub(crate) async fn update_role_by_storage(
    pool: &PgPool,
    storage: RoleStorage,
    role_id: &str,
    patch: &NormalizedRolePatch,
    actor_user_id: Option<i64>,
) -> AppResult<Option<RoleListItem>> {
    let row_result = match storage {
        RoleStorage::Auth => {
            sqlx::query(
                r#"
            UPDATE auth_roles
            SET name = COALESCE($2, name)
            WHERE CAST(id AS TEXT) = $1
            RETURNING
                CAST(id AS TEXT) AS id,
                name,
                name AS code,
                NULL::TEXT AS description,
                TRUE AS is_active,
                created_at,
                0::BIGINT AS permissions_count,
                0::BIGINT AS user_count
            "#,
            )
            .bind(role_id)
            .bind(patch.code.as_deref())
            .fetch_optional(pool)
            .await
        }
        RoleStorage::Legacy => {
            sqlx::query(
                r#"
            UPDATE roles
            SET
                display_name = COALESCE($2, display_name),
                name = COALESCE($3, name),
                description = CASE WHEN $4 IS NULL THEN description ELSE $4 END,
                is_active = COALESCE($5, is_active),
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $6
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
            RETURNING
                CAST(id AS TEXT) AS id,
                COALESCE(display_name, name) AS name,
                name AS code,
                description,
                COALESCE(is_active, TRUE) AS is_active,
                created_at,
                0::BIGINT AS permissions_count,
                0::BIGINT AS user_count
            "#,
            )
            .bind(role_id)
            .bind(patch.name.as_deref())
            .bind(patch.code.as_deref())
            .bind(patch.description.as_deref())
            .bind(patch.is_active)
            .bind(actor_user_id)
            .fetch_optional(pool)
            .await
        }
        RoleStorage::Ods => {
            sqlx::query(
                r#"
            UPDATE ods_aios_roles
            SET
                display_name = COALESCE($2, display_name),
                name = COALESCE($3, name),
                description = CASE WHEN $4 IS NULL THEN description ELSE $4 END,
                is_active = COALESCE($5, is_active),
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $6
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
            RETURNING
                CAST(id AS TEXT) AS id,
                COALESCE(display_name, name) AS name,
                name AS code,
                description,
                COALESCE(is_active, TRUE) AS is_active,
                created_at,
                0::BIGINT AS permissions_count,
                0::BIGINT AS user_count
            "#,
            )
            .bind(role_id)
            .bind(patch.name.as_deref())
            .bind(patch.code.as_deref())
            .bind(patch.description.as_deref())
            .bind(patch.is_active)
            .bind(actor_user_id)
            .fetch_optional(pool)
            .await
        }
    };

    let row = match row_result {
        Ok(row) => row,
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::bad_request("角色编码已存在"));
        }
        Err(error) => {
            error!(?error, ?storage, role_id = role_id, "update role failed");
            return Err(AppError::Internal);
        }
    };

    match row {
        Some(row) => {
            let role = row_to_role_list_item(row);
            let permissions = query_role_permissions_by_storage(pool, storage, role_id).await?;
            Ok(Some(RoleListItem {
                permissions_count: permissions.len() as i64,
                ..role
            }))
        }
        None => Ok(None),
    }
}
