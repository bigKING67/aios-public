use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsRuntimeFeishuSyncJob {
    pub(crate) id: String,
    pub(crate) service_name: String,
    pub(crate) job_name: String,
    pub(crate) source_table: String,
    pub(crate) target: String,
    pub(crate) status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_synced_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) lag_minutes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_watermark: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_primary_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) note: Option<String>,
}
