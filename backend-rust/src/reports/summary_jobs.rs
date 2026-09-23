use std::sync::Arc;

use sqlx::PgPool;

use crate::state::AppState;

pub(super) struct PrepareWeeklySummaryGenerationInput<'a> {
    pub(super) pool: &'a PgPool,
    pub(super) week_period: &'a str,
    pub(super) summary_scope: &'a str,
    pub(super) task_id: &'a str,
    pub(super) provider: &'a str,
    pub(super) model: &'a str,
    pub(super) prompt_config: serde_json::Value,
    pub(super) facts_snapshot: serde_json::Value,
    pub(super) requested_by: &'a str,
    pub(super) force_regenerate: bool,
    pub(super) retry: bool,
}

pub(super) struct WeeklySummaryJob {
    pub(super) state: Arc<AppState>,
    pub(super) week_period: String,
    pub(super) summary_scope: String,
    pub(super) task_id: String,
    pub(super) provider: String,
    pub(super) model: String,
    pub(super) prompt_config: serde_json::Value,
    pub(super) facts_snapshot_overrides: serde_json::Value,
}

pub(super) fn is_deepseek_reasoner_model(provider: &str, model: &str) -> bool {
    if provider.trim().to_lowercase() != "deepseek" {
        return false;
    }

    let normalized_model = model.trim().to_lowercase();
    normalized_model.contains("reasoner")
        || normalized_model.contains("r1")
        || normalized_model.contains("thinking")
}

pub(super) fn is_llm_timeout_error(error: &anyhow::Error) -> bool {
    let text = format!("{error:#}").to_lowercase();
    text.contains("timeout")
        || text.contains("timed out")
        || text.contains("deadline")
        || text.contains("response body read failed")
}

pub(super) fn is_llm_empty_content_error(error: &anyhow::Error) -> bool {
    let text = format!("{error:#}").to_lowercase();
    text.contains("llm content is empty")
        || text.contains("llm response has no usable content")
        || text.contains("llm response content missing")
}
