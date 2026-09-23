use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsNotificationChannel {
    pub(crate) id: String,
    pub(crate) channel_name: String,
    pub(crate) protocol: String,
    pub(crate) provider: String,
    pub(crate) endpoint_masked: String,
    pub(crate) enabled: bool,
    pub(crate) status: String,
    pub(crate) retry_policy: String,
    #[serde(default)]
    pub(crate) last_delivered_at: Option<String>,
    pub(crate) failure_count24h: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsNotificationEvent {
    pub(crate) id: String,
    pub(crate) channel_id: String,
    pub(crate) level: String,
    pub(crate) event_type: String,
    pub(crate) title: String,
    pub(crate) target_table: String,
    pub(crate) flow_name: String,
    pub(crate) status: String,
    pub(crate) sent_at: String,
    pub(crate) detail: String,
    #[serde(default)]
    pub(crate) reason_hash: Option<String>,
    #[serde(default)]
    pub(crate) retry_group_id: Option<String>,
}
