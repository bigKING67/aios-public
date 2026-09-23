use sqlx::{PgPool, Row};

use super::constants::DEFAULT_PASSWORD_EMAIL_DOMAIN;

#[derive(Debug)]
pub(super) struct UserSeedResult {
    pub(super) id: String,
    pub(super) created: bool,
}

pub(super) async fn upsert_auth_user(
    pool: &PgPool,
    username: &str,
    display_name: &str,
    password_hash: &str,
) -> anyhow::Result<UserSeedResult> {
    if let Some(user) = fetch_auth_user_by_username(pool, username).await? {
        return Ok(UserSeedResult {
            id: user.id,
            created: false,
        });
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
    .await?;

    Ok(UserSeedResult {
        id: row.try_get("id").unwrap_or_default(),
        created: true,
    })
}

pub(super) async fn ensure_user_role(
    pool: &PgPool,
    user_id: &str,
    role_name: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO auth_user_roles (user_id, role_id)
        SELECT user_item.id, role.id
        FROM auth_users user_item
        JOIN auth_roles role ON role.name = $2
        WHERE CAST(user_item.id AS TEXT) = $1
          AND NOT EXISTS (
            SELECT 1
            FROM auth_user_roles existing
            WHERE existing.user_id = user_item.id
              AND existing.role_id = role.id
          )
        "#,
    )
    .bind(user_id)
    .bind(role_name)
    .execute(pool)
    .await?;
    Ok(())
}

async fn fetch_auth_user_by_username(
    pool: &PgPool,
    username: &str,
) -> anyhow::Result<Option<UserSeedResult>> {
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
    .await?;

    Ok(row.map(|row| UserSeedResult {
        id: row.try_get("id").unwrap_or_default(),
        created: false,
    }))
}
