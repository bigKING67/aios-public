use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub derived_assets: Vec<DerivedAsset>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub render_binding: Option<super::render_binding::RenderBinding>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edit_document: Option<serde_json::Value>,
    pub title: String,
    pub aspect: String,
    #[serde(default)]
    pub output_profile: OutputProfile,
    pub clips: Vec<Clip>,
    pub assets: Vec<BoundAsset>,
    pub rights_confirmed: bool,
}

// Only the internal treatment host creates these bindings; public SaveRequest
// cannot introduce object keys or a derived media identity.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DerivedAsset {
    pub asset_version_id: String,
    pub object_key: String,
    pub sha256: String,
    pub duration_ms: u32,
    pub parent_asset_id: Uuid,
    pub parent_sha256: String,
    pub request_sha256: String,
    pub treatment_request: Value,
    pub base_project_revision: i32,
    pub provider_task_id: String,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
pub(super) enum OutputProfile {
    #[default]
    #[serde(rename = "legacy_v1")]
    LegacyV1,
    #[serde(rename = "hd_1080_v1")]
    Hd1080V1,
}

impl OutputProfile {
    pub(super) fn dimensions(self, aspect: &str) -> Option<(u64, u64)> {
        match (self, aspect) {
            (Self::LegacyV1, "portrait") => Some((720, 1280)),
            (Self::LegacyV1, "landscape") => Some((1280, 720)),
            (Self::Hd1080V1, "portrait") => Some((1080, 1920)),
            (Self::Hd1080V1, "landscape") => Some((1920, 1080)),
            (_, "square") => Some((1080, 1080)),
            _ => None,
        }
    }
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

#[cfg(test)]
mod output_profile_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn old_snapshots_remain_legacy_and_unknown_profiles_fail() {
        let mut value = json!({"title":"old","aspect":"portrait","clips":[],"assets":[],"rightsConfirmed":true});
        let snapshot: Snapshot = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(snapshot.output_profile, OutputProfile::LegacyV1);
        assert!(snapshot.render_binding.is_none());
        for profile in [json!("future"), json!(null), json!({})] {
            value["outputProfile"] = profile;
            assert!(serde_json::from_value::<Snapshot>(value.clone()).is_err());
        }
    }
}
