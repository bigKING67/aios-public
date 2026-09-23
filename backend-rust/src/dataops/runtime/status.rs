use super::super::types::{DataOpsPipelineRuntime, DataOpsRuntimePipeline, DataSyncStream};

const PIPELINE_HEALTHY_STATES: &[&str] = &["COMPLETED", "RUNNING"];
const PIPELINE_WARNING_STATES: &[&str] = &["PENDING", "SCHEDULED", "LATE"];
const PIPELINE_ERROR_STATES: &[&str] = &["FAILED", "CRASHED", "CANCELLED", "TIMEDOUT"];

pub(super) fn resolve_stream_status_by_lag(
    stream: &DataSyncStream,
    lag_minutes: i64,
    linked_pipelines: &[DataOpsRuntimePipeline],
) -> String {
    if linked_pipelines
        .iter()
        .any(|item| item.pipeline.status.eq_ignore_ascii_case("error"))
    {
        return "error".to_string();
    }

    if linked_pipelines
        .iter()
        .any(|item| item.pipeline.status.eq_ignore_ascii_case("warning"))
    {
        return "warning".to_string();
    }

    if !linked_pipelines.is_empty()
        && linked_pipelines
            .iter()
            .all(|item| item.pipeline.status.eq_ignore_ascii_case("paused"))
    {
        return "paused".to_string();
    }

    if lag_minutes <= 45 {
        return "healthy".to_string();
    }

    if lag_minutes <= 120 {
        return "warning".to_string();
    }

    if stream.status.eq_ignore_ascii_case("paused") {
        return "paused".to_string();
    }

    "error".to_string()
}

pub(super) fn derive_pipeline_status(
    base_status: &str,
    runtime: &DataOpsPipelineRuntime,
) -> String {
    if runtime.deployment_paused.unwrap_or(false) {
        return "paused".to_string();
    }

    if let Some(operation_error) = runtime.operation_error.as_ref() {
        if operation_error.contains("未找到 Deployment") {
            return "warning".to_string();
        }
        return "error".to_string();
    }

    let Some(flow_state) = runtime.flow_run_state_type.as_ref() else {
        return base_status.to_string();
    };

    if PIPELINE_HEALTHY_STATES
        .iter()
        .any(|item| item.eq_ignore_ascii_case(flow_state.as_str()))
    {
        return "healthy".to_string();
    }
    if PIPELINE_WARNING_STATES
        .iter()
        .any(|item| item.eq_ignore_ascii_case(flow_state.as_str()))
    {
        return "warning".to_string();
    }
    if PIPELINE_ERROR_STATES
        .iter()
        .any(|item| item.eq_ignore_ascii_case(flow_state.as_str()))
    {
        return "error".to_string();
    }

    base_status.to_string()
}
