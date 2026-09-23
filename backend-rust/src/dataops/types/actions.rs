use serde::Deserialize;
use serde_json::{Map, Value};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsActionRequest {
    pub(crate) action: String,
    #[serde(default)]
    pub(crate) pipeline_id: Option<String>,
    #[serde(default)]
    pub(crate) channel_id: Option<String>,
    #[serde(default)]
    pub(crate) parameters: Option<Map<String, Value>>,
    #[serde(default)]
    pub(crate) batch_execution: bool,
}
