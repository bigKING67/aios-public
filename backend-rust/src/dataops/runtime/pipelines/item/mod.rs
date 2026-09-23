use std::time::Instant;

use crate::state::AppState;

use super::super::super::types::{DataOpsPipeline, DataOpsRuntimePipeline};
use super::types::RuntimePipelineBuildResult;

mod deployment;
mod flow_runs;
mod runtime;
mod slow_log;
mod status;

const RUNTIME_FLOW_RUN_LOOKBACK_LIMIT: usize = 20;

pub(super) async fn build_runtime_pipeline_item(
    state: &AppState,
    pipeline: DataOpsPipeline,
) -> RuntimePipelineBuildResult {
    let item_started = Instant::now();
    let mut warnings = Vec::new();
    let mut runtime = runtime::empty_pipeline_runtime();
    let mut next_pipeline = pipeline.clone();

    let prefect_reachable = deployment::apply_deployment_runtime(
        state,
        &pipeline,
        &mut runtime,
        &mut next_pipeline,
        &mut warnings,
    )
    .await;

    status::finalize_pipeline_status(&mut next_pipeline, &runtime);
    slow_log::warn_slow_pipeline_item(pipeline.id.as_str(), item_started.elapsed().as_millis());

    RuntimePipelineBuildResult {
        pipeline: DataOpsRuntimePipeline {
            pipeline: next_pipeline,
            runtime: Some(runtime),
        },
        warnings,
        prefect_reachable,
    }
}
