use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::{super::row_mapping::row_to_audit_log_item, tables::audit_storage_tables};
use crate::audit_logs::types::{AuditLogItem, AuditStorage};

pub(in crate::audit_logs) async fn count_audit_logs_by_storage(
    pool: &PgPool,
    storage: AuditStorage,
    module_filter: Option<&str>,
    action_filter: Option<&str>,
    keyword_filter: Option<&str>,
) -> AppResult<i64> {
    let tables = audit_storage_tables(storage);
    let row = sqlx::query(count_audit_logs_sql(tables.logs, tables.users).as_str())
        .bind(module_filter)
        .bind(action_filter)
        .bind(keyword_filter)
        .fetch_one(pool)
        .await
        .map_err(|error| {
            error!(?error, ?storage, "count audit logs failed");
            AppError::Internal
        })?;

    Ok(row.try_get::<i64, _>("total").unwrap_or(0))
}

pub(in crate::audit_logs) async fn query_audit_logs_by_storage(
    pool: &PgPool,
    storage: AuditStorage,
    module_filter: Option<&str>,
    action_filter: Option<&str>,
    keyword_filter: Option<&str>,
    limit: i64,
    offset: i64,
) -> AppResult<Vec<AuditLogItem>> {
    let tables = audit_storage_tables(storage);
    let rows = sqlx::query(query_audit_logs_sql(tables.logs, tables.users).as_str())
        .bind(module_filter)
        .bind(action_filter)
        .bind(keyword_filter)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|error| {
            error!(?error, ?storage, "query audit logs failed");
            AppError::Internal
        })?;

    Ok(rows.into_iter().map(row_to_audit_log_item).collect())
}

fn count_audit_logs_sql(logs_table: &str, users_table: &str) -> String {
    format!(
        r#"
            SELECT COUNT(*)::BIGINT AS total
            FROM {logs_table} l
            LEFT JOIN {users_table} u ON u.id = l.actor_user_id
            WHERE ($1::TEXT IS NULL OR l.action_category ILIKE '%' || $1 || '%')
              AND ($2::TEXT IS NULL OR l.action_type ILIKE '%' || $2 || '%')
              AND (
                    $3::TEXT IS NULL
                 OR COALESCE(u.username, '') ILIKE '%' || $3 || '%'
                 OR COALESCE(l.error_message, '') ILIKE '%' || $3 || '%'
                 OR COALESCE(l.resource_type, '') ILIKE '%' || $3 || '%'
                 OR COALESCE(CAST(l.resource_id AS TEXT), '') ILIKE '%' || $3 || '%'
              )
            "#
    )
}

fn query_audit_logs_sql(logs_table: &str, users_table: &str) -> String {
    format!(
        r#"
            SELECT
                CAST(l.id AS TEXT) AS id,
                l.action_category AS module,
                l.action_type AS action,
                l.resource_type,
                CAST(l.resource_id AS TEXT) AS resource_id,
                u.username,
                l.status,
                l.ip_address,
                NULL::TEXT AS user_agent,
                l.error_message AS detail,
                l.created_at
            FROM {logs_table} l
            LEFT JOIN {users_table} u ON u.id = l.actor_user_id
            WHERE ($1::TEXT IS NULL OR l.action_category ILIKE '%' || $1 || '%')
              AND ($2::TEXT IS NULL OR l.action_type ILIKE '%' || $2 || '%')
              AND (
                    $3::TEXT IS NULL
                 OR COALESCE(u.username, '') ILIKE '%' || $3 || '%'
                 OR COALESCE(l.error_message, '') ILIKE '%' || $3 || '%'
                 OR COALESCE(l.resource_type, '') ILIKE '%' || $3 || '%'
                 OR COALESCE(CAST(l.resource_id AS TEXT), '') ILIKE '%' || $3 || '%'
              )
            ORDER BY l.created_at DESC
            LIMIT $4 OFFSET $5
            "#
    )
}
