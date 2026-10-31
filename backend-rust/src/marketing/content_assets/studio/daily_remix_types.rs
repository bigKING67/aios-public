use super::structure_pool_types::StructurePoolResponse;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DailyRemixQuery {
    pub(super) date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DailyRemixRunRequest {
    pub(super) date: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DailyRemixPauseRequest {
    pub(super) date: String,
    pub(super) paused: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DailyRemixPlanResponse {
    pub(super) date: String,
    /// not_started / paused / waiting_sources / over_budget / running / done.
    pub(super) status: String,
    pub(super) requested_count: i32,
    pub(super) planned_count: i64,
    pub(super) succeeded_count: i64,
    pub(super) failed_count: i64,
    pub(super) active_count: i64,
    pub(super) shortfall: i64,
    pub(super) dispatch_complete: bool,
    pub(super) stop_reason: Option<String>,
    pub(super) budget_yuan: Option<f64>,
    /// Public 1080P price estimate, not an account bill or actual spend.
    pub(super) estimated_cost_yuan: f64,
    pub(super) structure_pool: Option<StructurePoolResponse>,
    pub(super) batches: Vec<DailyRemixBatch>,
    pub(super) structures: Vec<DailyRemixStructureResult>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DailyRemixStructureResult {
    pub(super) structure_index: i32,
    pub(super) target_count: i32,
    pub(super) planned_count: i32,
    pub(super) reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DailyRemixBatch {
    pub(super) batch_id: Uuid,
    pub(super) structure_index: i32,
    pub(super) planned_count: i32,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FrozenPlan {
    pub(super) pool: StructurePoolResponse,
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    pub(super) enterprise_tag: Option<String>,
}
