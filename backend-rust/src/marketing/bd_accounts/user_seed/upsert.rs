use sqlx::{PgPool, Row};

use crate::error::AppResult;

use super::super::errors::map_sql_error;
use super::AuthUserSeed;

const DEFAULT_PASSWORD_EMAIL_DOMAIN: &str = "users.local.aios";

pub(in crate::marketing::bd_accounts) async fn upsert_auth_user(
    pool: &PgPool,
    username: &str,
    display_name: &str,
    password_hash: &str,
) -> AppResult<AuthUserSeed> {
    if let Some(user) = fetch_auth_user_by_username(pool, username).await? {
        return Ok(user);
    }

    let email = format!("{username}@{DEFAULT_PASSWORD_EMAIL_DOMAIN}");
    let row = sqlx::query(
        r#"
        INSERT INTO auth_users (username, email, password_hash, display_name, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        RETURNING CAST(id AS TEXT) AS id
        "#,
    )
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .bind(display_name)
    .fetch_one(pool)
    .await
    .map_err(map_sql_error("auto create creator library BD user failed"))?;

    Ok(AuthUserSeed {
        user_id: row.try_get("id").unwrap_or_default(),
    })
}

async fn fetch_auth_user_by_username(
    pool: &PgPool,
    username: &str,
) -> AppResult<Option<AuthUserSeed>> {
    let row = sqlx::query(
        r#"
        SELECT CAST(id AS TEXT) AS id
        FROM auth_users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await
    .map_err(map_sql_error(
        "fetch auto-created creator library BD user failed",
    ))?;

    Ok(row.map(|row| AuthUserSeed {
        user_id: row.try_get("id").unwrap_or_default(),
    }))
}
