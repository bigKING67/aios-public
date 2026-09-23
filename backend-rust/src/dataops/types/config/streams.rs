use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataSyncStream {
    pub(crate) id: String,
    pub(crate) stream_name: String,
    #[serde(default)]
    pub(crate) layers: Vec<String>,
    pub(crate) source: String,
    pub(crate) target: String,
    pub(crate) checkpoint_table: String,
    pub(crate) lag_minutes: i64,
    pub(crate) last_sync_at: String,
    pub(crate) status: String,
    #[serde(default)]
    pub(crate) note: Option<String>,
}
