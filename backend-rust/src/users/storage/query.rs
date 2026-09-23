use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::types::UserAdminResponse;
use super::{
    errors::is_undefined_column, row_mapping::row_to_user_admin_response, types::UserStorage,
};

pub(crate) async fn query_users_by_storage(
    pool: &PgPool,
    storage: UserStorage,
) -> AppResult<Vec<UserAdminResponse>> {
    let rows = match storage {
        UserStorage::Auth => {
            let primary_result = sqlx::query(
                r#"
                SELECT
                    CAST(id AS TEXT) AS id,
                    username,
                    COALESCE(email, '') AS email,
                    display_name AS full_name,
                    is_active,
                    created_at
                FROM auth_users
                WHERE COALESCE(is_deleted, FALSE) = FALSE
                ORDER BY created_at DESC, id DESC
                "#,
            )
            .fetch_all(pool)
            .await;

            match primary_result {
                Ok(rows) => rows,
                Err(error) if is_undefined_column(&error) => sqlx::query(
                    r#"
                    SELECT
                        CAST(id AS TEXT) AS id,
                        username,
                        COALESCE(email, '') AS email,
                        display_name AS full_name,
                        is_active,
                        created_at
                    FROM auth_users
                    ORDER BY created_at DESC, id DESC
                    "#,
                )
                .fetch_all(pool)
                .await
                .map_err(|fallback_error| {
                    error!(
                        ?fallback_error,
                        ?storage,
                        "query users fallback failed when auth_users.is_deleted is unavailable"
                    );
                    AppError::Internal
                })?,
                Err(error) => {
                    error!(?error, ?storage, "query users failed");
                    return Err(AppError::Internal);
                }
            }
        }
        UserStorage::Legacy => sqlx::query(
            r#"
            SELECT
                CAST(id AS TEXT) AS id,
                username,
                COALESCE(email, '') AS email,
                full_name,
                is_active,
                created_at
            FROM users
            WHERE COALESCE(is_deleted, FALSE) = FALSE
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(pool)
        .await
        .map_err(|error| {
            error!(?error, ?storage, "query users failed");
            AppError::Internal
        })?,
        UserStorage::Ods => sqlx::query(
            r#"
            SELECT
                CAST(id AS TEXT) AS id,
                username,
                COALESCE(email, '') AS email,
                full_name,
                is_active,
                created_at
            FROM ods_aios_users
            WHERE COALESCE(is_deleted, FALSE) = FALSE
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(pool)
        .await
        .map_err(|error| {
            error!(?error, ?storage, "query users failed");
            AppError::Internal
        })?,
    };

    Ok(rows.into_iter().map(row_to_user_admin_response).collect())
}
