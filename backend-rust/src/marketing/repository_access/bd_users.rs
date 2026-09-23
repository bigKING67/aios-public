use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::types::CreatorLibraryBdUser;

pub(super) async fn fetch_bd_identity_by_user_id(
    pool: &PgPool,
    user_id: &str,
) -> AppResult<Option<CreatorLibraryBdUser>> {
    let rows = sqlx::query(
        r#"
        SELECT user_id, username, display_name, owner_alias, is_primary
        FROM ads.creator_library_bd_identity
        WHERE user_id = $1
          AND is_active = TRUE
        ORDER BY is_primary DESC, owner_alias
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(
            ?error,
            user_id, "fetch creator library BD identity by user id failed"
        );
        AppError::Internal
    })?;

    Ok(build_bd_user_from_rows(rows.as_slice()))
}

pub(super) async fn fetch_bd_identity_by_alias(
    pool: &PgPool,
    alias: &str,
) -> AppResult<Option<CreatorLibraryBdUser>> {
    let normalized = alias.trim().to_lowercase();
    let rows = sqlx::query(
        r#"
        SELECT user_id, username, display_name, owner_alias, is_primary
        FROM ads.creator_library_bd_identity
        WHERE owner_alias_norm = $1
          AND is_active = TRUE
        ORDER BY is_primary DESC, owner_alias
        "#,
    )
    .bind(normalized)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(
            ?error,
            alias, "fetch creator library BD identity by alias failed"
        );
        AppError::Internal
    })?;

    Ok(build_bd_user_from_rows(rows.as_slice()))
}

pub(in crate::marketing) async fn list_bd_users(
    pool: &PgPool,
) -> AppResult<Vec<CreatorLibraryBdUser>> {
    let rows = sqlx::query(
        r#"
        SELECT user_id, username, display_name, owner_alias, is_primary
        FROM ads.creator_library_bd_identity
        WHERE is_active = TRUE
        ORDER BY LOWER(display_name), LOWER(username), is_primary DESC, owner_alias
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, "list creator library BD identities failed");
        AppError::Internal
    })?;

    let mut users = Vec::<CreatorLibraryBdUser>::new();
    for row in rows {
        let user_id = row.try_get::<String, _>("user_id").unwrap_or_default();
        if user_id.is_empty() {
            continue;
        }
        let alias = row.try_get::<String, _>("owner_alias").unwrap_or_default();
        if let Some(existing) = users.iter_mut().find(|item| item.user_id == user_id) {
            if !alias.is_empty() && !existing.aliases.contains(&alias) {
                existing.aliases.push(alias);
            }
            continue;
        }
        users.push(CreatorLibraryBdUser {
            user_id,
            username: row.try_get("username").unwrap_or_default(),
            display_name: row.try_get("display_name").unwrap_or_default(),
            aliases: if alias.is_empty() {
                Vec::new()
            } else {
                vec![alias]
            },
        });
    }
    Ok(users)
}

fn build_bd_user_from_rows(rows: &[sqlx::postgres::PgRow]) -> Option<CreatorLibraryBdUser> {
    let first = rows.first()?;
    let mut aliases = Vec::new();
    for row in rows {
        let alias = row.try_get::<String, _>("owner_alias").unwrap_or_default();
        if !alias.is_empty() && !aliases.contains(&alias) {
            aliases.push(alias);
        }
    }
    Some(CreatorLibraryBdUser {
        user_id: first.try_get("user_id").unwrap_or_default(),
        username: first.try_get("username").unwrap_or_default(),
        display_name: first.try_get("display_name").unwrap_or_default(),
        aliases,
    })
}
