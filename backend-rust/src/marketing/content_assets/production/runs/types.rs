use crate::marketing::content_assets::production::types::{Clip, Snapshot};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct CreateRunRequest {
    pub idempotency_key: String,
    pub title: String,
    pub brief: String,
    pub task_type: String,
    pub asset_ids: Vec<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub narration_asset_id: Option<Uuid>,
    pub aspect: String,
    pub target_seconds: u32,
    #[serde(default)]
    pub review_before_production: bool,
    #[serde(default)]
    pub model_call_confirmed: bool,
    pub rights_confirmed: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub generate_captions: bool,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub max_auto_repairs: u8,
}

fn is_zero(value: &u8) -> bool {
    *value == 0
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct PlanDocument {
    pub summary: String,
    pub clips: Vec<Clip>,
    pub reasons: Vec<String>,
    pub gaps: Vec<String>,
    #[serde(default)]
    pub locked_clip_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub narration_captions: Option<super::captions::NarrationCaptions>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct VersionRequest {
    pub expected_version: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct RevisePlanRequest {
    pub expected_version: i32,
    pub expected_plan_revision: i32,
    pub document: PlanDocument,
    #[serde(default)]
    pub unlock_clip_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct AdoptPlanRequest {
    pub expected_version: i32,
    pub expected_plan_revision: i32,
    pub expected_project_revision: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::marketing::content_assets::production) struct PlanRevision {
    pub revision: i32,
    pub execution_version: i32,
    pub document: PlanDocument,
    pub origin: String,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::marketing::content_assets::production) struct Run {
    pub run_id: Uuid,
    pub version: i32,
    pub execution_version: i32,
    pub plan_revision: i32,
    pub status: String,
    pub stage: String,
    pub waiting_reason: Option<String>,
    pub request: CreateRunRequest,
    pub project_id: Option<Uuid>,
    pub project_revision: Option<i32>,
    pub render_job_id: Option<Uuid>,
    pub pause_requested: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip)]
    pub sources: Snapshot,
    #[serde(skip)]
    pub active_attempt: Option<Uuid>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::marketing::content_assets::production) struct RunDetail {
    pub run: Run,
    pub plan: Option<PlanRevision>,
}

fn is_false(value: &bool) -> bool {
    !*value
}
