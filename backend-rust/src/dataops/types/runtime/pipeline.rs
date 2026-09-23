use serde::Serialize;

use super::super::{DataOpsPipeline, DataSyncStream};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsPipelineRuntime {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) deployment_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) deployment_paused: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) deployment_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) work_pool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) flow_run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) flow_run_state_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) flow_run_state_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) flow_run_state_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) flow_run_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) operation_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsRuntimePipeline {
    #[serde(flatten)]
    pub(crate) pipeline: DataOpsPipeline,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) runtime: Option<DataOpsPipelineRuntime>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsRuntimeSyncStream {
    #[serde(flatten)]
    pub(crate) stream: DataSyncStream,
    pub(crate) computed_lag_minutes: i64,
}
