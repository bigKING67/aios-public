use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Clip {
    pub id: String,
    pub asset_id: Uuid,
    pub start_ms: u32,
    pub end_ms: u32,
    pub caption: String,
    pub volume: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SaveRequest {
    pub expected_revision: Option<i32>,
    pub title: String,
    pub aspect: String,
    pub clips: Vec<Clip>,
    pub rights_confirmed: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BoundAsset {
    pub asset_id: Uuid,
    pub object_key: String,
    pub sha256: String,
    pub duration_ms: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Snapshot {
    pub title: String,
    pub aspect: String,
    pub clips: Vec<Clip>,
    pub assets: Vec<BoundAsset>,
    pub rights_confirmed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Project {
    pub project_id: Uuid,
    pub title: String,
    pub revision: i32,
    pub updated_at: String,
    pub snapshot: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RenderJob {
    pub job_id: Uuid,
    pub revision: i32,
    pub preview: bool,
    pub status: String,
    pub stage: String,
    pub error_message: Option<String>,
    pub playback_url: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub(super) struct ProjectDetail {
    pub project: Project,
    pub jobs: Vec<RenderJob>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RenderRequest {
    pub revision: i32,
    pub preview: bool,
}

#[derive(Deserialize)]
pub(super) struct SearchQuery {
    pub q: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ClipHit {
    pub asset_id: Uuid,
    pub title: String,
    pub transcript_id: Uuid,
    pub start_ms: u32,
    pub end_ms: u32,
    pub text: String,
    pub can_use: bool,
    pub playback_url: String,
}
