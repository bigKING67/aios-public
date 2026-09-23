use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PrefectDeployment {
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) paused: Option<bool>,
    #[serde(default)]
    pub(crate) is_schedule_active: Option<bool>,
    #[serde(default)]
    pub(crate) status: Option<Value>,
    #[serde(default)]
    pub(crate) work_pool_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PrefectFlowRunState {
    #[serde(default)]
    pub(crate) r#type: Option<String>,
    #[serde(default)]
    pub(crate) name: Option<String>,
    #[serde(default)]
    pub(crate) message: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PrefectFlowRun {
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) name: Option<String>,
    #[serde(default)]
    pub(crate) state: Option<PrefectFlowRunState>,
    #[serde(default)]
    pub(crate) state_type: Option<String>,
    #[serde(default)]
    pub(crate) state_name: Option<String>,
    #[serde(default)]
    pub(crate) state_message: Option<String>,
    #[serde(default)]
    pub(crate) start_time: Option<String>,
    #[serde(default)]
    pub(crate) end_time: Option<String>,
    #[serde(default)]
    pub(crate) expected_start_time: Option<String>,
    #[serde(default)]
    pub(crate) created: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug)]
pub(crate) struct PrefectError {
    pub(crate) message: String,
    pub(crate) status: Option<StatusCode>,
    pub(crate) is_network_error: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct PrefectRunCreateResult {
    pub(crate) id: Option<String>,
    pub(crate) name: Option<String>,
}
