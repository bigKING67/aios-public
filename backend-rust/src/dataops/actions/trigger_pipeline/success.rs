use axum::{http::StatusCode, response::Response};
use serde_json::{json, Map, Value};

use crate::{auth::CurrentUser, state::AppState};

use super::super::super::{
    responses::action_success, runtime_store_types::RuntimeLockResult, types::DataOpsPipeline,
};
use super::super::{lock_fallback_warning_text, lock_warning_value};
use super::{audit::append_trigger_pipeline_audit, prefect_run::TriggerPipelineRunResult};

pub(super) async fn handle_pipeline_trigger_success(
    state: &AppState,
    current_user: &CurrentUser,
    pipeline: &DataOpsPipeline,
    run: TriggerPipelineRunResult,
    parameters: Map<String, Value>,
    lock_result: RuntimeLockResult,
) -> Response {
    append_trigger_pipeline_audit(
        state,
        current_user,
        pipeline.name.as_str(),
        "成功",
        build_success_detail(pipeline, &run, &parameters, &lock_result),
    )
    .await;

    action_success(
        StatusCode::OK,
        "trigger_pipeline",
        format!("已触发任务「{}」", pipeline.name).as_str(),
        Some(pipeline.id.clone()),
        None,
        Some(json!({
            "flowRunId": run.flow_run_id,
            "flowRunName": run
                .flow_run_name
                .unwrap_or_else(|| run.requested_flow_run_name.clone()),
            "lockMode": lock_result.mode,
            "lockWarning": lock_warning_value(lock_result.warning.as_ref()),
        })),
    )
}

fn build_success_detail(
    pipeline: &DataOpsPipeline,
    run: &TriggerPipelineRunResult,
    parameters: &Map<String, Value>,
    lock_result: &RuntimeLockResult,
) -> String {
    let flow_run_display = run
        .flow_run_id
        .clone()
        .or_else(|| run.flow_run_name.clone())
        .unwrap_or_else(|| run.requested_flow_run_name.clone());
    let mut detail = format!(
        "触发成功，deployment={}，flowRun={}，lockMode={}",
        pipeline.deployment_name, flow_run_display, lock_result.mode
    );
    if !parameters.is_empty() {
        detail = format!(
            "{}，parameters={}",
            detail,
            serde_json::to_string(parameters).unwrap_or_else(|_| "{}".to_string())
        );
    }
    if let Some(lock_warning) = lock_fallback_warning_text(lock_result.warning.as_ref()) {
        detail = format!("{}，lockWarning={}", detail, lock_warning);
    }

    detail
}
