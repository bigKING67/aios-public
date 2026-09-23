use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsBatchExecutionRecord {
    pub(crate) id: String,
    pub(crate) action: String,
    pub(crate) label: String,
    pub(crate) executed_at: String,
    pub(crate) total_count: i64,
    pub(crate) success_count: i64,
    pub(crate) failed_count: i64,
    pub(crate) skipped_count: i64,
    pub(crate) operator: String,
    #[serde(default)]
    pub(crate) parameters: Option<Map<String, Value>>,
    pub(crate) items: Vec<DataOpsBatchExecutionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsBatchExecutionItem {
    pub(crate) pipeline_id: String,
    pub(crate) pipeline_name: String,
    pub(crate) status: String,
    pub(crate) message: String,
    pub(crate) retryable: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BatchExecutionSaveRequest {
    #[serde(default)]
    pub(crate) action: Option<String>,
    #[serde(default)]
    pub(crate) label: Option<String>,
    #[serde(default)]
    pub(crate) executed_at: Option<String>,
    #[serde(default)]
    pub(crate) total_count: Option<Value>,
    #[serde(default)]
    pub(crate) success_count: Option<Value>,
    #[serde(default)]
    pub(crate) failed_count: Option<Value>,
    #[serde(default)]
    pub(crate) skipped_count: Option<Value>,
    #[serde(default)]
    pub(crate) parameters: Option<Map<String, Value>>,
    #[serde(default)]
    pub(crate) items: Option<Vec<Value>>,
}
