use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::storage::UserStorage;

pub(crate) async fn query_role_codes_by_ids_by_storage(
    pool: &PgPool,
    storage: UserStorage,
    role_ids: &[String],
) -> AppResult<Vec<String>> {
    if role_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = match storage {
        UserStorage::Auth => {
            sqlx::query(
                r#"
            SELECT r.name AS code
            FROM auth_roles r
            WHERE CAST(r.id AS TEXT) = ANY($1)
            ORDER BY r.name
            "#,
            )
            .bind(role_ids)
            .fetch_all(pool)
            .await
        }
        UserStorage::Legacy => {
            sqlx::query(
                r#"
            SELECT r.name AS code
            FROM roles r
            WHERE CAST(r.id AS TEXT) = ANY($1)
              AND COALESCE(r.is_deleted, FALSE) = FALSE
              AND COALESCE(r.is_active, TRUE) = TRUE
            ORDER BY r.name
            "#,
            )
            .bind(role_ids)
            .fetch_all(pool)
            .await
        }
        UserStorage::Ods => {
            sqlx::query(
                r#"
            SELECT r.name AS code
            FROM ods_aios_roles r
            WHERE CAST(r.id AS TEXT) = ANY($1)
              AND COALESCE(r.is_deleted, FALSE) = FALSE
              AND COALESCE(r.is_active, TRUE) = TRUE
            ORDER BY r.name
            "#,
            )
            .bind(role_ids)
            .fetch_all(pool)
            .await
        }
    }
    .map_err(|error| {
        error!(?error, ?storage, "query role codes by ids failed");
        AppError::Internal
    })?;

    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<Option<String>, _>("code").ok().flatten())
        .collect())
}
