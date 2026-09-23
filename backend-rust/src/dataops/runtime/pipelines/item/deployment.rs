use crate::state::AppState;

use super::super::super::super::{
    prefect::{get_deployment_by_name, resolve_deployment_paused, resolve_deployment_status},
    types::{DataOpsPipeline, DataOpsPipelineRuntime},
};
use super::flow_runs::apply_recent_flow_runs;
use super::RUNTIME_FLOW_RUN_LOOKBACK_LIMIT;

pub(super) async fn apply_deployment_runtime(
    state: &AppState,
    pipeline: &DataOpsPipeline,
    runtime: &mut DataOpsPipelineRuntime,
    next_pipeline: &mut DataOpsPipeline,
    warnings: &mut Vec<String>,
) -> bool {
    match get_deployment_by_name(
        state,
        pipeline.flow_name.as_str(),
        pipeline.deployment_name.as_str(),
    )
    .await
    {
        Ok(Some(deployment)) => {
            runtime.deployment_id = Some(deployment.id.clone());
            runtime.deployment_paused = Some(resolve_deployment_paused(&deployment));
            runtime.deployment_status = resolve_deployment_status(&deployment);
            runtime.work_pool_name = deployment.work_pool_name.clone();

            apply_recent_flow_runs(
                state,
                pipeline,
                next_pipeline,
                runtime,
                deployment.id.as_str(),
                RUNTIME_FLOW_RUN_LOOKBACK_LIMIT,
                warnings,
            )
            .await
        }
        Ok(None) => {
            runtime.operation_error =
                Some("未找到 Deployment，请核对 flowName/deploymentName".to_string());
            warnings.push(format!(
                "任务「{}」在 Prefect 中未找到对应 Deployment",
                pipeline.name
            ));
            true
        }
        Err(error) => {
            runtime.operation_error = Some(format!("查询 Deployment 失败：{}", error.message));
            warnings.push(format!(
                "任务「{}」Deployment 查询失败：{}",
                pipeline.name, error.message
            ));
            !error.is_network_error
        }
    }
}
