use chrono::{DateTime, Utc};
use sqlx::Row;

use super::types::AuditLogItem;

pub(super) fn row_to_audit_log_item(row: sqlx::postgres::PgRow) -> AuditLogItem {
    let status = row
        .try_get::<Option<String>, _>("status")
        .ok()
        .flatten()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let success = status
        .as_deref()
        .map(|value| value.eq_ignore_ascii_case("success") || value.eq_ignore_ascii_case("ok"))
        .unwrap_or(false);
    let created_at = row
        .try_get::<Option<DateTime<Utc>>, _>("created_at")
        .ok()
        .flatten()
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let username = row.try_get::<Option<String>, _>("username").ok().flatten();

    AuditLogItem {
        id: row.try_get::<String, _>("id").unwrap_or_default(),
        module: row.try_get::<Option<String>, _>("module").ok().flatten(),
        action: row.try_get::<Option<String>, _>("action").ok().flatten(),
        resource_type: row
            .try_get::<Option<String>, _>("resource_type")
            .ok()
            .flatten(),
        resource_id: row
            .try_get::<Option<String>, _>("resource_id")
            .ok()
            .flatten(),
        operator: username.clone(),
        username,
        success,
        status,
        ip_address: row
            .try_get::<Option<String>, _>("ip_address")
            .ok()
            .flatten(),
        user_agent: row
            .try_get::<Option<String>, _>("user_agent")
            .ok()
            .flatten(),
        detail: row.try_get::<Option<String>, _>("detail").ok().flatten(),
        created_at,
    }
}
