use sqlx::Row;

use super::env::{resolve_database_name, resolve_env_or, resolve_i64_env};
use super::runtime_store_types::{STORE_MODE_MEMORY, STORE_MODE_POSTGRES};
use super::types::{
    DataOpsRuntimeFileStore, DataOpsRuntimeRetention, DataOpsRuntimeStorePostgresStatus,
    DataOpsRuntimeStoreStatus,
};
use crate::state::AppState;

mod common;
mod events;
mod locks;
mod notifications;
mod status;
mod types;

pub(crate) use common::DEFAULT_RUNTIME_SCHEMA;
pub(crate) use events::{
    append_postgres_payload_event, delete_postgres_payload_event, list_postgres_payload_events,
};
pub(crate) use locks::try_acquire_postgres_lock;
pub(crate) use notifications::list_postgres_notification_events_by_retry_group;
use status::fetch_runtime_cleanup_state;
pub(crate) use types::RuntimeStoreLimits;

pub(crate) const DEFAULT_RUNTIME_RETENTION_DAYS: i64 = 90;
pub(crate) const DEFAULT_RUNTIME_STORE_DIR: &str = "/app/.dataops/runtime-store";

pub(crate) async fn fetch_postgres_runtime_store_status(
    state: &AppState,
    limits: RuntimeStoreLimits,
) -> Result<DataOpsRuntimeStoreStatus, String> {
    let schema = common::runtime_schema_name()?;
    let status_query = r#"
        SELECT
          EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS schema_exists,
          EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = 'runtime_audit_events' AND c.relkind = 'r'
          ) AS audit_table_exists,
          EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = 'runtime_notification_events' AND c.relkind = 'r'
          ) AS notification_table_exists,
          EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = 'runtime_trigger_locks' AND c.relkind = 'r'
          ) AS trigger_locks_table_exists,
          EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = 'runtime_batch_execution_events' AND c.relkind = 'r'
          ) AS batch_execution_table_exists,
          EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = 'runtime_cleanup_state' AND c.relkind = 'r'
          ) AS cleanup_state_exists
    "#;

    let row = sqlx::query(status_query)
        .bind(schema.as_str())
        .fetch_one(&state.pool)
        .await
        .map_err(|error| format!("runtime store status query failed: {error}"))?;

    let schema_exists = row.try_get::<bool, _>("schema_exists").unwrap_or(false);
    let audit_table_exists = row
        .try_get::<bool, _>("audit_table_exists")
        .unwrap_or(false);
    let notification_table_exists = row
        .try_get::<bool, _>("notification_table_exists")
        .unwrap_or(false);
    let trigger_locks_table_exists = row
        .try_get::<bool, _>("trigger_locks_table_exists")
        .unwrap_or(false);
    let batch_execution_table_exists = row
        .try_get::<bool, _>("batch_execution_table_exists")
        .unwrap_or(false);
    let cleanup_state_exists = row
        .try_get::<bool, _>("cleanup_state_exists")
        .unwrap_or(false);

    let mut retention = DataOpsRuntimeRetention {
        retain_days: resolve_i64_env(
            "DATAOPS_RUNTIME_RETENTION_DAYS",
            DEFAULT_RUNTIME_RETENTION_DAYS,
            1,
            3650,
        ),
        cleanup_state_available: false,
        last_cleanup_at: None,
        last_audit_deleted: None,
        last_notification_deleted: None,
        last_batch_execution_deleted: None,
        updated_at: None,
        max_audit_events: limits.max_audit_events as i64,
        max_notification_events: limits.max_notification_events as i64,
        max_batch_execution_events: limits.max_batch_execution_events as i64,
    };

    if cleanup_state_exists {
        if let Some(cleanup) = fetch_runtime_cleanup_state(state, schema.as_str()).await? {
            retention.cleanup_state_available = true;
            retention.retain_days = cleanup.retain_days;
            retention.last_cleanup_at = cleanup.last_cleanup_at;
            retention.last_audit_deleted = cleanup.last_audit_deleted;
            retention.last_notification_deleted = cleanup.last_notification_deleted;
            retention.last_batch_execution_deleted = cleanup.last_batch_execution_deleted;
            retention.updated_at = cleanup.updated_at;
        }
    }

    let postgres_ready = schema_exists
        && audit_table_exists
        && notification_table_exists
        && trigger_locks_table_exists
        && batch_execution_table_exists;
    let mode = if postgres_ready {
        STORE_MODE_POSTGRES
    } else {
        STORE_MODE_MEMORY
    };

    Ok(DataOpsRuntimeStoreStatus {
        storage_mode: mode.to_string(),
        lock_mode: mode.to_string(),
        postgres: DataOpsRuntimeStorePostgresStatus {
            enabled: true,
            connected: true,
            host: resolve_env_or("PGHOST", "127.0.0.1"),
            port: resolve_env_or("PGPORT", "5432"),
            user: resolve_env_or("PGUSER", "postgres"),
            database: resolve_database_name(),
            schema,
            schema_exists,
            audit_table_exists,
            notification_table_exists,
            trigger_locks_table_exists,
            batch_execution_table_exists,
        },
        file_store: DataOpsRuntimeFileStore {
            directory: resolve_env_or("DATAOPS_RUNTIME_STORE_DIR", DEFAULT_RUNTIME_STORE_DIR),
            available: false,
        },
        retention,
    })
}
