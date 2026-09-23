use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::UserAccount;
use super::mapping::row_to_user_account;

pub(crate) async fn fetch_user_by_id(
    pool: &PgPool,
    user_id: &str,
) -> AppResult<Option<UserAccount>> {
    match query_user_by_id_auth(pool, user_id).await {
        Ok(result) => return Ok(result),
        Err(error) if super::super::is_undefined_table(&error) => {}
        Err(error) => {
            error!(?error, "query auth_users by id failed");
            return Err(AppError::Internal);
        }
    }

    match query_user_by_id_users(pool, user_id).await {
        Ok(result) => return Ok(result),
        Err(error) if super::super::is_undefined_table(&error) => {}
        Err(error) => {
            error!(?error, "query users by id failed");
            return Err(AppError::Internal);
        }
    }

    query_user_by_id_ods(pool, user_id).await.map_err(|error| {
        error!(?error, "query ods users by id failed");
        AppError::Internal
    })
}

async fn query_user_by_id_auth(
    pool: &PgPool,
    user_id: &str,
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
        WHERE CAST(id AS TEXT) = $1
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(row_to_user_account))
}

async fn query_user_by_id_users(
    pool: &PgPool,
    user_id: &str,
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
        WHERE CAST(id AS TEXT) = $1
          AND COALESCE(is_deleted, FALSE) = FALSE
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(row_to_user_account))
}

async fn query_user_by_id_ods(
    pool: &PgPool,
    user_id: &str,
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
        WHERE CAST(id AS TEXT) = $1
          AND COALESCE(is_deleted, FALSE) = FALSE
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(row_to_user_account))
}
