use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::types::{PermissionItem, PermissionStorage};

pub(super) async fn resolve_permission_storage(
    pool: &PgPool,
) -> AppResult<Option<PermissionStorage>> {
    let row = sqlx::query(
        r#"
        SELECT CASE
            WHEN to_regclass('public.auth_permissions') IS NOT NULL THEN 'auth'
            WHEN to_regclass('public.permissions') IS NOT NULL THEN 'legacy'
            WHEN to_regclass('public.ods_aios_permissions') IS NOT NULL THEN 'ods'
            ELSE NULL
        END AS storage
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "resolve permission storage failed");
        AppError::Internal
    })?;

    let storage = row.try_get::<Option<String>, _>("storage").ok().flatten();
    Ok(match storage.as_deref() {
        Some("auth") => Some(PermissionStorage::Auth),
        Some("legacy") => Some(PermissionStorage::Legacy),
        Some("ods") => Some(PermissionStorage::Ods),
        _ => None,
    })
}

pub(super) async fn query_permissions_by_storage(
    pool: &PgPool,
    storage: PermissionStorage,
) -> AppResult<Vec<PermissionItem>> {
    let rows = match storage {
        PermissionStorage::Auth => {
            sqlx::query(
                r#"
            SELECT
                ROW_NUMBER() OVER (ORDER BY p.key)::BIGINT AS id,
                p.key AS code,
                p.key AS name,
                p.key AS display_name,
                split_part(p.key, ':', 1) AS module,
                split_part(p.key, ':', 2) AS action,
                NULLIF(split_part(p.key, ':', 3), '') AS resource_type,
                NULL::TEXT AS description,
                TRUE AS is_active
            FROM auth_permissions p
            ORDER BY p.key
            "#,
            )
            .fetch_all(pool)
            .await
        }
        PermissionStorage::Legacy => {
            sqlx::query(
                r#"
            SELECT
                p.id::BIGINT AS id,
                p.code,
                p.display_name AS name,
                p.display_name,
                p.module,
                p.action,
                p.resource_type,
                p.description,
                COALESCE(p.is_active, TRUE) AS is_active
            FROM permissions p
            WHERE COALESCE(p.is_deleted, FALSE) = FALSE
            ORDER BY p.module, p.code
            "#,
            )
            .fetch_all(pool)
            .await
        }
        PermissionStorage::Ods => {
            sqlx::query(
                r#"
            SELECT
                p.id::BIGINT AS id,
                p.code,
                p.display_name AS name,
                p.display_name,
                p.module,
                p.action,
                p.resource_type,
                p.description,
                COALESCE(p.is_active, TRUE) AS is_active
            FROM ods_aios_permissions p
            WHERE COALESCE(p.is_deleted, FALSE) = FALSE
            ORDER BY p.module, p.code
            "#,
            )
            .fetch_all(pool)
            .await
        }
    }
    .map_err(|error| {
        error!(?error, ?storage, "query permissions failed");
        AppError::Internal
    })?;

    Ok(rows.into_iter().map(row_to_permission_item).collect())
}

fn row_to_permission_item(row: sqlx::postgres::PgRow) -> PermissionItem {
    PermissionItem {
        id: row.try_get::<i64, _>("id").unwrap_or(0),
        code: row.try_get::<String, _>("code").unwrap_or_default(),
        name: row.try_get::<Option<String>, _>("name").ok().flatten(),
        display_name: row
            .try_get::<Option<String>, _>("display_name")
            .ok()
            .flatten(),
        module: row.try_get::<Option<String>, _>("module").ok().flatten(),
        action: row.try_get::<Option<String>, _>("action").ok().flatten(),
        resource_type: row
            .try_get::<Option<String>, _>("resource_type")
            .ok()
            .flatten(),
        description: row
            .try_get::<Option<String>, _>("description")
            .ok()
            .flatten(),
        is_active: row.try_get::<bool, _>("is_active").unwrap_or(true),
    }
}
