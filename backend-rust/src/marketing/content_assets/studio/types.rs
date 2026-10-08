//! AI 创作中心 request/response contracts. The OpenAPI generator extracts these
//! structs by name, so keep them as plain serde structs with supported types.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StudioCapabilitiesResponse {
    pub(super) enabled: bool,
    /// Open access (`CONTENT_AI_STUDIO_OPEN_ACCESS`): studio writes need only a
    /// sign-in, not the per-asset edit permission, and every remix batch is
    /// visible to every signed-in user.
    pub(super) open_access: bool,
    /// Studio writes are allowed for this caller (always true in open access).
    pub(super) can_write: bool,
    /// AI 切段打标 is available (studio and suggestion flags both on).
    pub(super) segment_suggest_enabled: bool,
    /// Assets accepted per explicit suggestion request.
    pub(super) segment_suggest_max_assets: i32,
    /// 框架混剪批量 is available (studio, remix and Runs flags all on).
    pub(super) remix_enabled: bool,
    /// Runs created per remix batch.
    pub(super) remix_max_per_batch: i32,
    /// Output duration ceiling of one remix in seconds.
    pub(super) remix_max_seconds: i32,
    /// Queued/running remix renders allowed per user.
    pub(super) remix_max_active: i32,
    /// `企业:<name>` when the studio is scoped to one enterprise's originals;
    /// the 整片素材 list filters by this tag. `null` = whole library.
    pub(super) enterprise_tag: Option<String>,
    /// Products the studio offers for originals and segments (enterprise
    /// catalog); empty when not configured.
    pub(super) products: Vec<String>,
    /// The caller may upload originals (the asset library's upload permission).
    pub(super) can_upload: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SegmentPresetLabel {
    pub(super) key: String,
    pub(super) name: String,
    pub(super) definition: String,
    /// Optional minimum span (seconds) for AI 切段: shorter suggestions of this
    /// label are folded into an adjacent segment by the worker post-processor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) min_duration_sec: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SegmentPreset {
    pub(super) preset_key: String,
    pub(super) version: i32,
    pub(super) dimension: String,
    pub(super) name: String,
    pub(super) labels: Vec<SegmentPresetLabel>,
    pub(super) status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SegmentPresetListResponse {
    pub(super) items: Vec<SegmentPreset>,
}

/// One segment of a raw asset. `sourceCurrent=false` means the asset content
/// changed after the segment was written; writes will mark it stale.
/// `sourceDurationMs=null` means the end bound could not be verified.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContentSegment {
    pub(super) segment_id: Uuid,
    pub(super) owner_user_id: String,
    pub(super) asset_id: Uuid,
    pub(super) asset_title: String,
    pub(super) source_content_hash: String,
    pub(super) source_current: bool,
    pub(super) source_duration_ms: Option<i32>,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    pub(super) label_key: String,
    pub(super) product_name: Option<String>,
    pub(super) origin: String,
    pub(super) status: String,
    pub(super) evidence: Value,
    pub(super) revision: i32,
    pub(super) confirmed_by: Option<String>,
    pub(super) confirmed_at: Option<String>,
    pub(super) created_at: String,
    pub(super) updated_at: String,
    /// Frame from inside this segment (`evidence.coverKey`, filled by the AI 切段
    /// worker); `null` until generated, when cards fall back to the original's cover.
    pub(super) cover_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContentSegmentListResponse {
    pub(super) items: Vec<ContentSegment>,
    pub(super) next_cursor: Option<Uuid>,
    /// One entry per distinct source asset in `items`, for card covers.
    pub(super) assets: Vec<SegmentAssetCover>,
}

/// `coverUrl` is a short-lived signed (or CDN) URL; null without a cover.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SegmentAssetCover {
    pub(super) asset_id: Uuid,
    pub(super) cover_url: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ContentSegmentListQuery {
    pub(super) asset_id: Option<Uuid>,
    pub(super) preset_key: Option<String>,
    pub(super) label_key: Option<String>,
    pub(super) product_name: Option<String>,
    pub(super) status: Option<String>,
    pub(super) origin: Option<String>,
    /// true lists only segments without a product (never usable by remix).
    pub(super) without_product: Option<bool>,
    pub(super) cursor: Option<Uuid>,
    pub(super) limit: Option<i64>,
}

/// Human-created segment. Defaults to `confirmed`; `draft=true` keeps it as
/// `suggested`. `sourceContentHash`, when supplied, must equal the current raw
/// asset hash. Missing `productName` inherits the asset product.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateContentSegmentRequest {
    pub(super) asset_id: Uuid,
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    pub(super) label_key: String,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
    #[serde(default)]
    pub(super) product_name: Option<String>,
    #[serde(default)]
    pub(super) source_content_hash: Option<String>,
    #[serde(default)]
    pub(super) draft: bool,
}

/// Optimistic update: `expectedRevision` must equal the stored revision.
/// A blank `productName` clears the product; `status` accepts
/// suggested/confirmed/rejected.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct UpdateContentSegmentRequest {
    pub(super) expected_revision: i32,
    #[serde(default)]
    pub(super) start_ms: Option<i32>,
    #[serde(default)]
    pub(super) end_ms: Option<i32>,
    #[serde(default)]
    pub(super) label_key: Option<String>,
    #[serde(default)]
    pub(super) product_name: Option<String>,
    #[serde(default)]
    pub(super) status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ConfirmContentSegmentItem {
    pub(super) segment_id: Uuid,
    pub(super) expected_revision: i32,
}

/// All-or-nothing batch confirmation.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ConfirmContentSegmentsRequest {
    pub(super) items: Vec<ConfirmContentSegmentItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ConfirmContentSegmentsResponse {
    pub(super) items: Vec<ContentSegment>,
}

/// 409 body of studio writes. `detail` is the same human text as every other
/// error; `code` is one of segment_overlap, batch_overlap, source_changed,
/// stale_segment, revision_conflict, idempotency_conflict, remix_unavailable,
/// remix_active_limit or remix_edit_duplicate; `segmentIds` lists the involved
/// segments (may be empty).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContentSegmentConflictResponse {
    pub(super) detail: String,
    pub(super) code: &'static str,
    pub(super) segment_ids: Vec<Uuid>,
}

/// Explicit AI 切段 request for 1..N library assets under one preset version.
/// `labelKeys` narrows the candidate labels the model may use: omitted means
/// every preset label; when present it must be non-empty, duplicate-free and
/// belong to the preset version. It is stored in preset order.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateSegmentSuggestionsRequest {
    pub(super) asset_ids: Vec<Uuid>,
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    #[serde(default)]
    pub(super) label_keys: Option<Vec<String>>,
}

/// One AI 切段 job. `status` is queued, running, succeeded, failed or
/// cancelled; failed jobs are never retried automatically. `errorCode` is
/// machine-readable (for example source_changed or provider_error).
/// `resultSummary` counts inserted/superseded suggestions and dropped model
/// items; model output is evidence only and every segment stays `suggested`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SegmentSuggestionJob {
    pub(super) job_id: Uuid,
    pub(super) owner_user_id: String,
    pub(super) asset_id: Uuid,
    pub(super) asset_title: String,
    pub(super) source_content_hash: String,
    pub(super) source_current: bool,
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    /// Candidate labels of this job in preset order (all preset labels for
    /// jobs created before label subsets existed).
    pub(super) label_keys: Vec<String>,
    pub(super) status: String,
    pub(super) stage: String,
    pub(super) attempt: i32,
    pub(super) error_code: Option<String>,
    pub(super) error_message: Option<String>,
    pub(super) model: Option<String>,
    pub(super) prompt_version: Option<String>,
    pub(super) usage: Option<Value>,
    pub(super) result_summary: Option<Value>,
    pub(super) created_at: String,
    pub(super) started_at: Option<String>,
    pub(super) finished_at: Option<String>,
}

/// `reusedJobIds` lists items that were already queued/running for the same
/// (asset, preset) and were returned instead of creating a new job.
/// `labelKeyMismatchJobIds` is the subset of reused jobs whose own `labelKeys`
/// differ from this request; they keep their original candidate labels.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateSegmentSuggestionsResponse {
    pub(super) items: Vec<SegmentSuggestionJob>,
    pub(super) reused_job_ids: Vec<Uuid>,
    pub(super) label_key_mismatch_job_ids: Vec<Uuid>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SegmentSuggestionJobListQuery {
    pub(super) asset_id: Option<Uuid>,
    pub(super) limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SegmentSuggestionJobListResponse {
    pub(super) items: Vec<SegmentSuggestionJob>,
}

/// `assetIds` is a comma-separated list of 1–100 library asset UUIDs.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AssetSegmentSummaryQuery {
    pub(super) asset_ids: Option<String>,
    /// Count only this preset (for example `framework`); omitted = all presets.
    pub(super) preset_key: Option<String>,
}

/// Per-asset annotation state for the 整片素材 cards, across all presets.
/// Rejected and stale segments are not counted; `suggestionActive` is true
/// while an AI 切段 job for the asset is queued or running.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AssetSegmentSummary {
    pub(super) asset_id: Uuid,
    pub(super) suggested_count: i64,
    pub(super) confirmed_count: i64,
    pub(super) suggestion_active: bool,
}

/// One item per requested asset id, in request order (unknown ids report zero).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AssetSegmentSummaryListResponse {
    pub(super) items: Vec<AssetSegmentSummary>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SegmentPoolQuery {
    pub(super) preset_key: Option<String>,
    pub(super) preset_version: Option<i32>,
}

/// Confirmed segments usable by 框架混剪 for one (product, label): the source
/// asset is live and its content hash still matches. `productName` is null for
/// segments without a product, which remix can never select.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SegmentPoolCell {
    pub(super) product_name: Option<String>,
    pub(super) label_key: String,
    pub(super) confirmed_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SegmentPoolResponse {
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    pub(super) items: Vec<SegmentPoolCell>,
}
