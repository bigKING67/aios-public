use crate::state::AppState;

use super::super::super::super::{
    prefect::{
        get_recent_flow_runs_by_deployment_id, resolve_flow_run_end_timestamp,
        resolve_flow_run_state_message, resolve_flow_run_state_name, resolve_flow_run_state_type,
        resolve_flow_run_success_timestamp, resolve_flow_run_timestamp,
        select_latest_successful_flow_run, select_runtime_flow_run,
    },
    time::format_shanghai_datetime,
    types::{DataOpsPipeline, DataOpsPipelineRuntime},
};

pub(super) async fn apply_recent_flow_runs(
    state: &AppState,
    pipeline: &DataOpsPipeline,
    next_pipeline: &mut DataOpsPipeline,
    runtime: &mut DataOpsPipelineRuntime,
    deployment_id: &str,
    limit: usize,
    warnings: &mut Vec<String>,
) -> bool {
    match get_recent_flow_runs_by_deployment_id(state, deployment_id, limit).await {
        Ok(runs) => {
            if let Some(run) = select_runtime_flow_run(runs.as_slice()) {
                runtime.flow_run_id = Some(run.id.clone());
                runtime.flow_run_state_type = resolve_flow_run_state_type(run);
                runtime.flow_run_state_name = resolve_flow_run_state_name(run);
                runtime.flow_run_state_message = resolve_flow_run_state_message(run);
                runtime.flow_run_at = resolve_flow_run_timestamp(run);

                if runtime.flow_run_at.is_none() {
                    runtime.flow_run_at = resolve_flow_run_end_timestamp(run);
                }
            }

            if let Some(success_run) = select_latest_successful_flow_run(runs.as_slice()) {
                if let Some(success_at) = resolve_flow_run_success_timestamp(success_run) {
                    next_pipeline.last_success_at =
                        Some(format_shanghai_datetime(success_at.as_str()));
                }
            }

            true
        }
        Err(error) => {
            runtime.operation_error = Some(format!("查询运行记录失败：{}", error.message));
            warnings.push(format!(
                "任务「{}」运行记录查询失败：{}",
                pipeline.name, error.message
            ));
            !error.is_network_error
        }
    }
}
