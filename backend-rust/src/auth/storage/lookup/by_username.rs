use sqlx::PgPool;
use tracing::{error, warn};

use crate::error::{AppError, AppResult};

use super::super::super::UserAccount;
use super::mapping::row_to_user_account;

pub(crate) async fn fetch_user_by_username(
    pool: &PgPool,
    username: &str,
) -> AppResult<Option<UserAccount>> {
    match query_user_from_auth_users(pool, username).await {
        Ok(result) => return Ok(result),
        Err(error) if super::super::is_undefined_table(&error) => {
            warn!(?error, "auth_users not found, fallback to users");
        }
        Err(error) => {
            error!(?error, "query auth_users failed");
            return Err(AppError::Internal);
        }
    }

    match query_user_from_users(pool, username).await {
        Ok(result) => return Ok(result),
        Err(error) if super::super::is_undefined_table(&error) => {
            warn!(?error, "users not found, fallback to ods_aios_users");
        }
        Err(error) => {
            error!(?error, "query users failed");
            return Err(AppError::Internal);
        }
    }

    query_user_from_ods_users(pool, username)
        .await
        .map_err(|error| {
            error!(?error, "query ods_aios_users failed");
            AppError::Internal
        })
}

async fn query_user_from_auth_users(
    pool: &PgPool,
    username: &str,
) -> Result<Option<UserAccount>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            CAST(id AS TEXT) AS id,
            username,
            COALESCE(email, '') AS email,
            display_name AS full_name,
            password_hash,
            is_active,
            last_login_at
        FROM auth_users
        WHERE username = $1
        LIMIT 1
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(row_to_user_account))
}

async fn query_user_from_users(
    pool: &PgPool,
    username: &str,
) -> Result<Option<UserAccount>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            CAST(id AS TEXT) AS id,
            username,
            COALESCE(email, '') AS email,
            full_name,
            password_hash,
            is_active,
            last_login_at
        FROM users
        WHERE username = $1
          AND COALESCE(is_deleted, FALSE) = FALSE
        LIMIT 1
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(row_to_user_account))
}

async fn query_user_from_ods_users(
    pool: &PgPool,
    username: &str,
) -> Result<Option<UserAccount>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            CAST(id AS TEXT) AS id,
            username,
            COALESCE(email, '') AS email,
            full_name,
            password_hash,
            is_active,
            last_login_at
        FROM ods_aios_users
        WHERE username = $1
          AND COALESCE(is_deleted, FALSE) = FALSE
        LIMIT 1
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(row_to_user_account))
}
