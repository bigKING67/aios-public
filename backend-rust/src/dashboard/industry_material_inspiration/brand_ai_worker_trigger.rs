use std::sync::Arc;

use serde::Serialize;
use tracing::warn;

use crate::{marketing, state::AppState};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BrandAiBackfillWorkerTrigger {
    status: &'static str,
    queued_jobs: i64,
    pub(super) immediate_limit: i64,
    flow_run_id: Option<String>,
    flow_run_name: Option<String>,
    fallback: &'static str,
    message: String,
}

impl BrandAiBackfillWorkerTrigger {
    pub(super) fn not_requested(queued_jobs: i64) -> Self {
        Self {
            status: "not_requested",
            queued_jobs,
            immediate_limit: marketing::CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT,
            flow_run_id: None,
            flow_run_name: None,
            fallback: "scheduled",
            message: "本次没有新增排队任务，无需即时触发；已有任务继续由定时调度处理。".to_string(),
        }
    }
}

pub(super) async fn trigger(
    state: &Arc<AppState>,
    queued_jobs: i64,
) -> BrandAiBackfillWorkerTrigger {
    if queued_jobs <= 0 {
        return BrandAiBackfillWorkerTrigger::not_requested(queued_jobs);
    }

    match marketing::trigger_content_asset_analysis_batch_worker(state).await {
        Ok(flow_run) => BrandAiBackfillWorkerTrigger {
            status: "created",
            queued_jobs,
            immediate_limit: marketing::CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT,
            flow_run_id: flow_run.id,
            flow_run_name: flow_run.name,
            fallback: "scheduled",
            message: format!(
                "已创建 1 个 Prefect flow run，立即处理上限 {} 条；剩余排队任务继续由同一 Worker 和定时调度处理。",
                marketing::CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT
            ),
        },
        Err(message) => {
            let trigger_error = message.chars().take(300).collect::<String>();
            warn!(
                target: "dashboard-industry-material-inspiration",
                queued_jobs,
                error = %trigger_error,
                "brand ai backfill immediate Prefect trigger failed"
            );
            BrandAiBackfillWorkerTrigger {
                status: "failed",
                queued_jobs,
                immediate_limit: marketing::CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT,
                flow_run_id: None,
                flow_run_name: None,
                fallback: "scheduled",
                message: format!(
                    "新增任务已保留在队列；即时 Prefect 触发失败，将等待定时调度。原因：{trigger_error}"
                ),
            }
        }
    }
}
