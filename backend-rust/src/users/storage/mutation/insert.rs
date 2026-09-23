use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::types::{NormalizedCreateUserInput, UserAdminResponse};
use super::super::{
    errors::is_unique_violation, row_mapping::row_to_user_admin_response, types::UserStorage,
};

pub(crate) async fn insert_user_by_storage(
    pool: &PgPool,
    storage: UserStorage,
    input: &NormalizedCreateUserInput,
    password_hash: &str,
    actor_user_id: Option<i64>,
) -> AppResult<UserAdminResponse> {
    let auth_display_name = input
        .full_name
        .as_deref()
        .unwrap_or(input.username.as_str());

    let row_result = match storage {
        UserStorage::Auth => sqlx::query(
            r#"
            INSERT INTO auth_users (username, email, password_hash, display_name, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                CAST(id AS TEXT) AS id,
                username,
                COALESCE(email, '') AS email,
                display_name AS full_name,
                is_active,
                created_at
            "#,
        )
        .bind(input.username.as_str())
        .bind(input.email.as_str())
        .bind(password_hash)
        .bind(auth_display_name)
        .bind(input.is_active)
        .fetch_one(pool)
        .await,
        UserStorage::Legacy => sqlx::query(
            r#"
            INSERT INTO users (username, email, password_hash, full_name, is_active, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                CAST(id AS TEXT) AS id,
                username,
                COALESCE(email, '') AS email,
                full_name,
                is_active,
                created_at
            "#,
        )
        .bind(input.username.as_str())
        .bind(input.email.as_str())
        .bind(password_hash)
        .bind(input.full_name.as_deref())
        .bind(input.is_active)
        .bind(actor_user_id)
        .fetch_one(pool)
        .await,
        UserStorage::Ods => sqlx::query(
            r#"
            INSERT INTO ods_aios_users (username, email, password_hash, full_name, is_active, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                CAST(id AS TEXT) AS id,
                username,
                COALESCE(email, '') AS email,
                full_name,
                is_active,
                created_at
            "#,
        )
        .bind(input.username.as_str())
        .bind(input.email.as_str())
        .bind(password_hash)
        .bind(input.full_name.as_deref())
        .bind(input.is_active)
        .bind(actor_user_id)
        .fetch_one(pool)
        .await,
    };

    let row = match row_result {
        Ok(row) => row,
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::bad_request("用户名或邮箱已存在"));
        }
        Err(error) => {
            error!(?error, ?storage, "insert user failed");
            return Err(AppError::Internal);
        }
    };

    Ok(row_to_user_admin_response(row))
}
