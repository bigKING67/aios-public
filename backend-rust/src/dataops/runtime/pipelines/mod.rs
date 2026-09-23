mod concurrency;
mod item;
mod types;

use std::sync::Arc;

use tokio::sync::Semaphore;
use tracing::info;

use crate::state::AppState;

use super::super::{types::DataOpsRuntimePipeline, DATAOPS_CONFIG};
use concurrency::resolve_runtime_prefect_concurrency;
use item::build_runtime_pipeline_item;
use types::RuntimePipelineBuildResult;

pub(super) async fn build_runtime_pipelines(
    state: &AppState,
) -> (Vec<DataOpsRuntimePipeline>, Vec<String>, bool) {
    let concurrency = resolve_runtime_prefect_concurrency();
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut join_set = tokio::task::JoinSet::new();
    let state = Arc::new(state.clone());

    for (index, pipeline) in DATAOPS_CONFIG.pipelines.iter().cloned().enumerate() {
        let state_for_task = Arc::clone(&state);
        let semaphore_for_task = Arc::clone(&semaphore);
        join_set.spawn(async move {
            let permit = semaphore_for_task.acquire_owned().await;
            let _permit =
                permit.map_err(|error| format!("runtime prefect semaphore closed: {error}"))?;
            Ok::<_, String>((
                index,
                build_runtime_pipeline_item(state_for_task.as_ref(), pipeline).await,
            ))
        });
    }

    let mut indexed_items: Vec<(usize, RuntimePipelineBuildResult)> = Vec::new();
    let mut warnings = Vec::new();
    let mut prefect_reachable = true;

    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(item)) => indexed_items.push(item),
            Ok(Err(message)) => {
                warnings.push(message);
                prefect_reachable = false;
            }
            Err(error) => {
                warnings.push(format!("DataOps runtime pipeline task failed: {error}"));
                prefect_reachable = false;
            }
        }
    }

    indexed_items.sort_by_key(|(index, _)| *index);

    let mut pipelines = Vec::with_capacity(indexed_items.len());
    for (_, result) in indexed_items {
        if !result.prefect_reachable {
            prefect_reachable = false;
        }
        warnings.extend(result.warnings);
        pipelines.push(result.pipeline);
    }

    info!(
        pipeline_count = pipelines.len(),
        concurrency, prefect_reachable, "dataops runtime prefect pipeline fanout completed"
    );

    (pipelines, warnings, prefect_reachable)
}
