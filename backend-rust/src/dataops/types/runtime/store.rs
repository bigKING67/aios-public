use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsRuntimeStorePostgresStatus {
    pub(crate) enabled: bool,
    pub(crate) connected: bool,
    pub(crate) host: String,
    pub(crate) port: String,
    pub(crate) user: String,
    pub(crate) database: String,
    pub(crate) schema: String,
    pub(crate) schema_exists: bool,
    pub(crate) audit_table_exists: bool,
    pub(crate) notification_table_exists: bool,
    pub(crate) trigger_locks_table_exists: bool,
    pub(crate) batch_execution_table_exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsRuntimeStoreStatus {
    pub(crate) storage_mode: String,
    pub(crate) lock_mode: String,
    pub(crate) postgres: DataOpsRuntimeStorePostgresStatus,
    pub(crate) file_store: DataOpsRuntimeFileStore,
    pub(crate) retention: DataOpsRuntimeRetention,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsRuntimeFileStore {
    pub(crate) directory: String,
    pub(crate) available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsRuntimeRetention {
    pub(crate) retain_days: i64,
    pub(crate) cleanup_state_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_cleanup_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_audit_deleted: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_notification_deleted: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_batch_execution_deleted: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) updated_at: Option<String>,
    pub(crate) max_audit_events: i64,
    pub(crate) max_notification_events: i64,
    pub(crate) max_batch_execution_events: i64,
}
