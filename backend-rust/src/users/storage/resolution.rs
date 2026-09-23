use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::types::UserStorage;

pub(crate) async fn resolve_user_storage(pool: &PgPool) -> AppResult<Option<UserStorage>> {
    let row = sqlx::query(
        r#"
        SELECT CASE
            WHEN to_regclass('public.auth_users') IS NOT NULL THEN 'auth'
            WHEN to_regclass('public.users') IS NOT NULL THEN 'legacy'
            WHEN to_regclass('public.ods_aios_users') IS NOT NULL THEN 'ods'
            ELSE NULL
        END AS storage
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "resolve user storage failed");
        AppError::Internal
    })?;

    let storage = row.try_get::<Option<String>, _>("storage").ok().flatten();
    Ok(match storage.as_deref() {
        Some("auth") => Some(UserStorage::Auth),
        Some("legacy") => Some(UserStorage::Legacy),
        Some("ods") => Some(UserStorage::Ods),
        _ => None,
    })
}

pub(crate) async fn user_exists_by_storage(
    pool: &PgPool,
    storage: UserStorage,
    user_id: &str,
) -> AppResult<bool> {
    let row = match storage {
        UserStorage::Auth => {
            sqlx::query(
                r#"
            SELECT 1
            FROM auth_users
            WHERE CAST(id AS TEXT) = $1
            LIMIT 1
            "#,
            )
            .bind(user_id)
            .fetch_optional(pool)
            .await
        }
        UserStorage::Legacy => {
            sqlx::query(
                r#"
            SELECT 1
            FROM users
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
            LIMIT 1
            "#,
            )
            .bind(user_id)
            .fetch_optional(pool)
            .await
        }
        UserStorage::Ods => {
            sqlx::query(
                r#"
            SELECT 1
            FROM ods_aios_users
            WHERE CAST(id AS TEXT) = $1
              AND COALESCE(is_deleted, FALSE) = FALSE
            LIMIT 1
            "#,
            )
            .bind(user_id)
            .fetch_optional(pool)
            .await
        }
    }
    .map_err(|error| {
        error!(
            ?error,
            ?storage,
            user_id = user_id,
            "query user exists failed"
        );
        AppError::Internal
    })?;

    Ok(row.is_some())
}
