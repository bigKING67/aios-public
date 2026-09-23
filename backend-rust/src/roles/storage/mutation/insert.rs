use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::types::{NormalizedRoleInput, RoleListItem};
use super::super::{
    errors::is_unique_violation, row_mapping::row_to_role_list_item, types::RoleStorage,
};

pub(crate) async fn insert_role_by_storage(
    pool: &PgPool,
    storage: RoleStorage,
    input: &NormalizedRoleInput,
    actor_user_id: Option<i64>,
) -> AppResult<RoleListItem> {
    let row_result = match storage {
        RoleStorage::Auth => {
            sqlx::query(
                r#"
            INSERT INTO auth_roles (name)
            VALUES ($1)
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
            .bind(input.code.as_str())
            .fetch_one(pool)
            .await
        }
        RoleStorage::Legacy => {
            sqlx::query(
                r#"
            INSERT INTO roles (
                name,
                display_name,
                description,
                is_active,
                is_system,
                category,
                created_by,
                updated_by
            )
            VALUES ($1, $2, $3, $4, FALSE, 'custom', $5, $5)
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
            .bind(input.code.as_str())
            .bind(input.name.as_str())
            .bind(input.description.as_deref())
            .bind(input.is_active)
            .bind(actor_user_id)
            .fetch_one(pool)
            .await
        }
        RoleStorage::Ods => {
            sqlx::query(
                r#"
            INSERT INTO ods_aios_roles (
                name,
                display_name,
                description,
                is_active,
                is_system,
                category,
                created_by,
                updated_by
            )
            VALUES ($1, $2, $3, $4, FALSE, 'custom', $5, $5)
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
            .bind(input.code.as_str())
            .bind(input.name.as_str())
            .bind(input.description.as_deref())
            .bind(input.is_active)
            .bind(actor_user_id)
            .fetch_one(pool)
            .await
        }
    };

    let row = match row_result {
        Ok(row) => row,
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::bad_request("角色编码已存在"));
        }
        Err(error) => {
            error!(?error, ?storage, "insert role failed");
            return Err(AppError::Internal);
        }
    };

    Ok(row_to_role_list_item(row))
}
