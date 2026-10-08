//! 框架混剪批次 request/response contracts. The OpenAPI generator extracts
//! these structs by name, so keep them as plain serde structs.
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Preview input. Exactly one of `labels` (explicit ordered slot sequence) or
/// `sourceAssetId` (slots = that asset's current confirmed segments in time
/// order) is required. `productName` must equal each segment's product
/// exactly; `count` is bounded by the per-batch limit in capabilities.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RemixBatchPreviewRequest {
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    #[serde(default)]
    pub(super) labels: Option<Vec<String>>,
    #[serde(default)]
    pub(super) source_asset_id: Option<Uuid>,
    pub(super) product_name: String,
    pub(super) count: i32,
}

/// Same input as preview plus an idempotency key. A replay with the same key
/// and input returns the existing batch; another input is a 409.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateRemixBatchRequest {
    pub(super) idempotency_key: String,
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    #[serde(default)]
    pub(super) labels: Option<Vec<String>>,
    #[serde(default)]
    pub(super) source_asset_id: Option<Uuid>,
    pub(super) product_name: String,
    pub(super) count: i32,
}

/// Usable confirmed segments of one ordered slot after product, content hash,
/// source rights/permission and duration filtering.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixSlotAvailability {
    pub(super) ordinal: i32,
    pub(super) label_key: String,
    pub(super) candidate_count: i32,
}

/// Read-only availability. `availableCombinations` counts valid combinations
/// not used by this user's earlier batches (no segment twice, total duration
/// within 3 s..maxSeconds). It is exact unless `availableIsLowerBound`, which
/// means the space was sampled instead of enumerated.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchPreviewResponse {
    pub(super) labels: Vec<String>,
    pub(super) source_asset_id: Option<Uuid>,
    pub(super) product_name: String,
    pub(super) slots: Vec<RemixSlotAvailability>,
    /// Label keys of slots without any usable candidate.
    pub(super) missing_labels: Vec<String>,
    /// Candidate assets dropped because rights, permission or readiness failed.
    pub(super) excluded_asset_count: i32,
    /// Product of slot candidate counts (saturates at the largest 64-bit integer).
    pub(super) theoretical_combinations: i64,
    pub(super) available_combinations: i64,
    pub(super) available_is_lower_bound: bool,
    pub(super) previously_used_combinations: i64,
    /// True when the reference original's own segment combination was skipped
    /// so that no output reproduces the original.
    pub(super) reference_combination_excluded: bool,
    pub(super) requested_count: i32,
    pub(super) plannable_count: i32,
    pub(super) shortfall_reason: Option<String>,
    pub(super) seed: i64,
}

/// One segment of a remix output, in playback order.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchSegment {
    pub(super) segment_id: Uuid,
    pub(super) asset_id: Uuid,
    pub(super) asset_title: String,
    pub(super) label_key: String,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
}

/// One output. `outcome` is running, succeeded, failed or cancelled (derived from the
/// Run; a failed render stays resumable through the Runs API). The output
/// asset appears only after the worker's reconciliation wrote it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchItem {
    pub(super) ordinal: i32,
    pub(super) run_id: Uuid,
    pub(super) combination_hash: String,
    pub(super) outcome: String,
    pub(super) run_status: String,
    pub(super) run_stage: String,
    pub(super) waiting_reason: Option<String>,
    pub(super) job_status: Option<String>,
    pub(super) job_error: Option<String>,
    pub(super) output_asset_id: Option<Uuid>,
    /// Cover of the output asset once it exists and has one.
    pub(super) output_cover_url: Option<String>,
    pub(super) duration_ms: i64,
    pub(super) segments: Vec<RemixBatchSegment>,
}

/// Batch summary. `status` is derived from the current Runs (running,
/// succeeded, partially_failed, failed or cancelled). `failedCount` excludes
/// cancelled Runs, which are counted in `cancelledCount`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatch {
    pub(super) batch_id: Uuid,
    /// `framework` (框架混剪) or `edit` (单条剪辑, one output).
    pub(super) mode: String,
    /// The user who created the batch (its Runs and output assets belong to them).
    pub(super) owner_user_id: String,
    /// Display name of the creator when resolvable; null otherwise.
    pub(super) owner_name: Option<String>,
    /// Whether the caller created the batch (the Runs task pages are owner-only).
    pub(super) owned_by_current_user: bool,
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    pub(super) labels: Vec<String>,
    pub(super) source_asset_id: Option<Uuid>,
    pub(super) product_name: String,
    pub(super) requested_count: i32,
    pub(super) planned_count: i32,
    pub(super) seed: i64,
    pub(super) status: String,
    pub(super) shortfall_reason: Option<String>,
    pub(super) succeeded_count: i32,
    pub(super) failed_count: i32,
    pub(super) running_count: i32,
    pub(super) cancelled_count: i32,
    /// Covers of the first outputs (up to 4, output order) for list thumbnails.
    pub(super) cover_urls: Vec<String>,
    /// Waiting reason of the first failed output, if any (e.g. render_failed).
    pub(super) failure_reason: Option<String>,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchDetail {
    pub(super) batch: RemixBatch,
    pub(super) items: Vec<RemixBatchItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchListResponse {
    pub(super) items: Vec<RemixBatch>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RemixProductListQuery {
    pub(super) preset_key: Option<String>,
    pub(super) preset_version: Option<i32>,
}

/// Distinct products of current confirmed segments (the same-product key).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixProduct {
    pub(super) product_name: String,
    pub(super) confirmed_segment_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixProductListResponse {
    pub(super) items: Vec<RemixProduct>,
}

/// One clip of a 单条剪辑, in playback order: a confirmed segment, optionally
/// trimmed inside its own bounds (`segment.startMs ≤ startMs < endMs ≤
/// segment.endMs`, at least 1 s).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RemixEditClip {
    pub(super) segment_id: Uuid,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
}

/// Read-only duplicate check of a 单条剪辑 before it is created.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RemixEditCheckRequest {
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    pub(super) clips: Vec<RemixEditClip>,
}

/// Creates a one-output batch (mode `edit`). An existing live or succeeded
/// output with the same ordered intervals is a 409 `remix_edit_duplicate`
/// unless `allowDuplicate`; a replay with the same key and clips returns the
/// existing batch.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateRemixEditRequest {
    pub(super) idempotency_key: String,
    pub(super) preset_key: String,
    pub(super) preset_version: i32,
    pub(super) clips: Vec<RemixEditClip>,
    #[serde(default)]
    pub(super) allow_duplicate: bool,
}

/// An existing output (running or succeeded) compared with the requested edit.
/// `overlap` is the shared source time over the longer of the two (0–1).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixEditMatch {
    pub(super) batch_id: Uuid,
    pub(super) ordinal: i32,
    pub(super) mode: String,
    pub(super) product_name: String,
    pub(super) outcome: String,
    pub(super) output_asset_id: Option<Uuid>,
    pub(super) output_cover_url: Option<String>,
    pub(super) duration_ms: i64,
    pub(super) overlap: f64,
    pub(super) created_at: String,
}

/// `exact`: same ordered (original, in, out) intervals. `similar`: overlap ≥
/// 0.8 but not exact, most similar first (at most 3).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixEditCheckResponse {
    pub(super) product_name: String,
    pub(super) duration_ms: i64,
    pub(super) exact: Vec<RemixEditMatch>,
    pub(super) similar: Vec<RemixEditMatch>,
}
