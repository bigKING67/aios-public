use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsAuditEvent {
    pub(crate) id: String,
    pub(crate) action: String,
    pub(crate) operator: String,
    pub(crate) scope: String,
    pub(crate) result: String,
    pub(crate) event_at: String,
    pub(crate) detail: String,
}
