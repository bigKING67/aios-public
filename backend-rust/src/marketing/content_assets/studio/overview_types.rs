//! AI 创作中心首页总览 contracts (`GET /studio/overview`). The OpenAPI generator
//! extracts these structs by name, so keep them as plain serde structs.
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// `period`: `last7` | `last30` (default) | `month` (current calendar month, Asia/Shanghai).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioOverviewQuery {
    pub(super) period: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioOverviewResponse {
    pub(super) period: StudioOverviewPeriod,
    pub(super) costs: StudioOverviewCosts,
    pub(super) pipeline: StudioOverviewPipeline,
    pub(super) recent: Vec<StudioOverviewActivity>,
    /// `team` when studio access is open (every user's work), `own` otherwise.
    pub(super) scope: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioOverviewPeriod {
    pub(super) key: String,
    /// Inclusive Asia/Shanghai calendar dates (`YYYY-MM-DD`).
    pub(super) from: String,
    pub(super) to: String,
}

/// Estimates from recorded usage and published list prices; not a bill.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioOverviewCosts {
    pub(super) model_analysis: StudioModelAnalysisCost,
    pub(super) cloud_composition: StudioCloudCompositionCost,
    pub(super) total_cny: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioModelAnalysisCost {
    /// Calls that recorded usage (failed provider calls may still be billed).
    pub(super) calls: i64,
    pub(super) input_tokens: i64,
    pub(super) audio_input_tokens: i64,
    pub(super) cached_tokens: i64,
    pub(super) output_tokens: i64,
    pub(super) estimated_cny: f64,
    /// Calls on a model without a configured price (tokens counted, cost not).
    pub(super) unpriced_calls: i64,
    pub(super) pricing: StudioModelPricing,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioModelPricing {
    pub(super) model: String,
    pub(super) tier: String,
    pub(super) input_per_million: f64,
    pub(super) audio_input_per_million: f64,
    pub(super) cached_per_million: f64,
    pub(super) output_per_million: f64,
    pub(super) verified_on: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioCloudCompositionCost {
    /// Completed MediaKit compositions with a stored receipt.
    pub(super) tasks: i64,
    pub(super) output_seconds: f64,
    pub(super) by_resolution: Vec<StudioResolutionUsage>,
    pub(super) estimated_cny: f64,
    pub(super) base_per_minute: f64,
    pub(super) verified_on: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioResolutionUsage {
    pub(super) resolution: String,
    pub(super) seconds: f64,
    pub(super) coefficient: f64,
    pub(super) estimated_cny: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioOverviewPipeline {
    /// Ready library originals (AI 创作 outputs excluded).
    pub(super) ready_assets: i64,
    pub(super) analysis_active: i64,
    pub(super) analysis_succeeded: i64,
    pub(super) analysis_failed: i64,
    pub(super) segments_suggested: i64,
    pub(super) segments_confirmed: i64,
    pub(super) remix_batches_running: i64,
    pub(super) remix_batches_failed: i64,
    /// Remix outputs registered in the period.
    pub(super) outputs: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioOverviewActivity {
    /// `analysis` (AI 分析 job), `remix` (框架混剪 batch) or `edit` (单条剪辑 batch).
    pub(super) kind: String,
    pub(super) id: Uuid,
    pub(super) title: String,
    pub(super) status: String,
    pub(super) detail: Option<String>,
    pub(super) created_at: String,
}
