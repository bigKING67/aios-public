use axum::http::StatusCode;
use chrono::Utc;
use serde_json::{Map, Value};

use crate::state::AppState;

use super::super::super::{
    prefect::{
        create_flow_run_by_deployment_id, get_deployment_by_name,
        get_recent_flow_runs_by_deployment_id, resolve_flow_run_state_type,
        BLOCKING_FLOW_RUN_STATES,
    },
    types::DataOpsPipeline,
};

pub(super) struct TriggerPipelineRunResult {
    pub(super) requested_flow_run_name: String,
    pub(super) flow_run_id: Option<String>,
    pub(super) flow_run_name: Option<String>,
}

pub(super) async fn trigger_pipeline_flow_run(
    state: &AppState,
    pipeline: &DataOpsPipeline,
    parameters: Map<String, Value>,
) -> Result<TriggerPipelineRunResult, (StatusCode, String)> {
    let deployment = get_deployment_by_name(
        state,
        pipeline.flow_name.as_str(),
        pipeline.deployment_name.as_str(),
    )
    .await
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.message))?;

    let deployment = deployment.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            format!(
                "未找到 Deployment：{}/{}",
                pipeline.flow_name, pipeline.deployment_name
            ),
        )
    })?;

    let recent_runs = get_recent_flow_runs_by_deployment_id(state, deployment.id.as_str(), 20)
        .await
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.message))?;

    let blocking_state = recent_runs
        .iter()
        .filter_map(resolve_flow_run_state_type)
        .find(|state| {
            BLOCKING_FLOW_RUN_STATES
                .iter()
                .any(|item| item.eq_ignore_ascii_case(state.as_str()))
        });

    if let Some(blocking) = blocking_state {
        return Err((
            StatusCode::CONFLICT,
            format!(
                "任务「{}」当前存在活动运行（{}），请稍后重试",
                pipeline.name, blocking
            ),
        ));
    }

    let requested_flow_run_name =
        format!("manual-{}-{}", pipeline.id, Utc::now().timestamp_millis());
    let run = create_flow_run_by_deployment_id(
        state,
        deployment.id.as_str(),
        requested_flow_run_name.as_str(),
        parameters,
    )
    .await
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.message))?;

    Ok(TriggerPipelineRunResult {
        requested_flow_run_name,
        flow_run_id: run.id,
        flow_run_name: run.name,
    })
}
