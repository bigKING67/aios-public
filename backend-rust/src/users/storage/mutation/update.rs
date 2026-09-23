use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::types::{NormalizedUpdateUserInput, UserAdminResponse};
use super::super::{
    errors::is_unique_violation, row_mapping::row_to_user_admin_response, types::UserStorage,
};

pub(crate) async fn update_user_by_storage(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
    input: &NormalizedUpdateUserInput,
) -> AppResult<Option<UserAdminResponse>> {
    let row_result = match storage {
        UserStorage::Auth => {
            sqlx::query(
                r#"
            UPDATE auth_users
            SET
                email = COALESCE($2, email),
                display_name = COALESCE($3, display_name),
                is_active = COALESCE($4, is_active)
            WHERE CAST(id AS TEXT) = $1
            RETURNING
                CAST(id AS TEXT) AS id,
                username,
                COALESCE(email, '') AS email,
                display_name AS full_name,
                is_active,
                created_at
            "#,
            )
            .bind(user_id)
            .bind(input.email.as_deref())
            .bind(input.full_name.as_deref())
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
        }
        UserStorage::Legacy => {
            sqlx::query(
                r#"
            UPDATE users
            SET
                email = COALESCE($2, email),
                full_name = COALESCE($3, full_name),
                is_active = COALESCE($4, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
            RETURNING
                CAST(id AS TEXT) AS id,
                username,
                COALESCE(email, '') AS email,
                full_name,
                is_active,
                created_at
            "#,
            )
            .bind(user_id)
            .bind(input.email.as_deref())
            .bind(input.full_name.as_deref())
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
        }
        UserStorage::Ods => {
            sqlx::query(
                r#"
            UPDATE ods_aios_users
            SET
                email = COALESCE($2, email),
                full_name = COALESCE($3, full_name),
                is_active = COALESCE($4, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
            RETURNING
                CAST(id AS TEXT) AS id,
                username,
                COALESCE(email, '') AS email,
                full_name,
                is_active,
                created_at
            "#,
            )
            .bind(user_id)
            .bind(input.email.as_deref())
            .bind(input.full_name.as_deref())
            .bind(input.is_active)
            .fetch_optional(pool)
            .await
        }
    };

    let row = match row_result {
        Ok(row) => row,
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::bad_request("邮箱已被其他用户占用"));
        }
        Err(error) => {
            error!(?error, ?storage, user_id = user_id, "update user failed");
            return Err(AppError::Internal);
        }
    };

    Ok(row.map(row_to_user_admin_response))
}
