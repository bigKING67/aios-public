use sqlx::Row;

use super::{
    common::{format_optional_datetime, runtime_table},
    types::RuntimeCleanupState,
    DEFAULT_RUNTIME_RETENTION_DAYS,
};
use crate::state::AppState;

pub(crate) async fn fetch_runtime_cleanup_state(
    state: &AppState,
    schema: &str,
) -> Result<Option<RuntimeCleanupState>, String> {
    let table = runtime_table(schema, "runtime_cleanup_state")?;
    let query = format!(
        r#"
        SELECT retain_days, last_cleanup_at, last_audit_deleted, last_notification_deleted,
               last_batch_execution_deleted, updated_at
        FROM {table}
        ORDER BY id
        LIMIT 1
        "#
    );

    let Some(row) = sqlx::query(query.as_str())
        .fetch_optional(&state.pool)
        .await
        .map_err(|error| format!("runtime cleanup state query failed: {error}"))?
    else {
        return Ok(None);
    };

    Ok(Some(RuntimeCleanupState {
        retain_days: row
            .try_get::<i32, _>("retain_days")
            .map(i64::from)
            .unwrap_or(DEFAULT_RUNTIME_RETENTION_DAYS),
        last_cleanup_at: format_optional_datetime(row.try_get("last_cleanup_at").ok().flatten()),
        last_audit_deleted: row
            .try_get::<i32, _>("last_audit_deleted")
            .ok()
            .map(i64::from),
        last_notification_deleted: row
            .try_get::<i32, _>("last_notification_deleted")
            .ok()
            .map(i64::from),
        last_batch_execution_deleted: row
            .try_get::<i32, _>("last_batch_execution_deleted")
            .ok()
            .map(i64::from),
        updated_at: format_optional_datetime(row.try_get("updated_at").ok().flatten()),
    }))
}
