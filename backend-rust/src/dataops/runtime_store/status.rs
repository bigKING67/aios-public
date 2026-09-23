use tracing::warn;

use super::super::{
    env::{resolve_bool_env, resolve_env_or, resolve_i64_env},
    runtime_store_pg::{
        fetch_postgres_runtime_store_status, RuntimeStoreLimits, DEFAULT_RUNTIME_RETENTION_DAYS,
        DEFAULT_RUNTIME_SCHEMA, DEFAULT_RUNTIME_STORE_DIR,
    },
    runtime_store_types::STORE_MODE_MEMORY,
    types::{
        DataOpsRuntimeFileStore, DataOpsRuntimeRetention, DataOpsRuntimeStorePostgresStatus,
        DataOpsRuntimeStoreStatus,
    },
};
use crate::state::AppState;

pub(super) async fn build_runtime_store_status(
    state: &AppState,
    limits: RuntimeStoreLimits,
) -> DataOpsRuntimeStoreStatus {
    let postgres_enabled = resolve_bool_env("DATAOPS_POSTGRES_ENABLED", false);

    if !postgres_enabled {
        return build_memory_runtime_store_status(false, &limits);
    }

    match fetch_postgres_runtime_store_status(state, limits.clone()).await {
        Ok(status) => status,
        Err(message) => {
            warn!(error = %message, "dataops runtime postgres status check failed");
            build_memory_runtime_store_status(true, &limits)
        }
    }
}

fn build_memory_runtime_store_status(
    postgres_enabled: bool,
    limits: &RuntimeStoreLimits,
) -> DataOpsRuntimeStoreStatus {
    DataOpsRuntimeStoreStatus {
        storage_mode: STORE_MODE_MEMORY.to_string(),
        lock_mode: STORE_MODE_MEMORY.to_string(),
        postgres: DataOpsRuntimeStorePostgresStatus {
            enabled: postgres_enabled,
            connected: false,
            host: resolve_env_or("PGHOST", "127.0.0.1"),
            port: resolve_env_or("PGPORT", "5432"),
            user: resolve_env_or("PGUSER", "postgres"),
            database: super::super::env::resolve_database_name(),
            schema: resolve_env_or("DATAOPS_RUNTIME_PG_SCHEMA", DEFAULT_RUNTIME_SCHEMA),
            schema_exists: false,
            audit_table_exists: false,
            notification_table_exists: false,
            trigger_locks_table_exists: false,
            batch_execution_table_exists: false,
        },
        file_store: DataOpsRuntimeFileStore {
            directory: resolve_env_or("DATAOPS_RUNTIME_STORE_DIR", DEFAULT_RUNTIME_STORE_DIR),
            available: false,
        },
        retention: DataOpsRuntimeRetention {
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
        },
    }
}
