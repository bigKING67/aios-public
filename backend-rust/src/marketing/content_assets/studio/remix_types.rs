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
    /// `framework` (default, 类型 1 框架混剪) or `sellingPoint` (类型 2 卖点混剪,
    /// requires `sourceAssetId`).
    #[serde(default)]
    pub(super) mode: Option<String>,
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
    /// See `RemixBatchPreviewRequest.mode`.
    #[serde(default)]
    pub(super) mode: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) spend_counts: Option<SpendCounts>,
    pub(super) ordinal: i32,
    pub(super) label_key: String,
    /// Usable segments (类型 1) or fill options of the slot (类型 2).
    pub(super) candidate_count: i32,
    /// 类型 2 only. The reference's selling points in this slot (empty when the
    /// slot has no known selling points); null for 类型 1. Includes fallback slots.
    pub(super) selling_points: Option<Vec<String>>,
    /// 类型 2 only. True when the slot is filled by whole framework segments (类型 1).
    pub(super) fallback: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SpendCounts {
    pub(super) qualified: i32,
    pub(super) low: i32,
    pub(super) unknown: i32,
}

/// Read-only availability. `availableCombinations` counts valid combinations
/// not used by this user's earlier batches (no segment twice, total duration
/// within 3 s..maxSeconds; with a reference original each slot also within
/// ±20 % of its span). It is exact unless `availableIsLowerBound`, which
/// means the space was sampled instead of enumerated.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchPreviewResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) admission_excluded: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) admission_excluded_is_lower_bound: Option<bool>,
    /// `framework` or `sellingPoint`.
    pub(super) mode: String,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) spend_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) spend30d: Option<f64>,
    pub(super) segment_id: Uuid,
    pub(super) asset_id: Uuid,
    pub(super) asset_title: String,
    pub(super) label_key: String,
    pub(super) start_ms: i32,
    pub(super) end_ms: i32,
    /// 类型 2 only (null otherwise). 1-based slot, fill tier (exact, spliced,
    /// varied), whole-framework fallback and the clip's selling points.
    pub(super) slot: Option<i32>,
    pub(super) tier: Option<String>,
    pub(super) fallback: Option<bool>,
    pub(super) selling_points: Option<Vec<String>>,
    /// 类型 2 only. Every selling-point segment of the clip's block, in order
    /// (`segmentId` is the first one); null for 类型 1.
    pub(super) segment_ids: Option<Vec<Uuid>>,
}

/// One output. `outcome` is running, succeeded, failed or cancelled (derived from the
/// Run; a failed render stays resumable through the Runs API). The output
/// asset appears only after the worker's reconciliation wrote it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) qc: Option<RemixQc>,
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
    /// The output asset was written but has since been deleted from the library.
    pub(super) output_deleted: bool,
    /// Cover of the output asset once it exists and has one.
    pub(super) output_cover_url: Option<String>,
    pub(super) duration_ms: i64,
    pub(super) segments: Vec<RemixBatchSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) picture_review: Option<RemixPictureReview>,
    /// Human review of the current output; null until reviewed, or once the
    /// output asset it was given for is replaced or deleted.
    pub(super) review: Option<RemixOutputReview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) delivery: Option<RemixDelivery>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) retention: Option<RemixRetention>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixRetention {
    pub(super) reason: String,
    pub(super) status: String,
    pub(super) cleanup_at: Option<String>,
    pub(super) cleaned_at: Option<String>,
    pub(super) can_restore: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixDelivery {
    pub(super) status: String,
    pub(super) cloud_video_id: Option<String>,
    pub(super) video_name: Option<String>,
    pub(super) error_code: Option<String>,
    pub(super) attempts: i32,
    pub(super) updated_at: Option<String>,
    pub(super) enabled: bool,
    pub(super) can_retry: bool,
}

/// Safe business projection of the host QC receipt; no source URLs or raw errors.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixQc {
    pub(super) status: String,
    pub(super) reasons: Vec<String>,
    pub(super) freeze_count: u64,
    pub(super) timestamp_gap_count: u64,
    pub(super) duplicate_pair_count: u64,
    pub(super) max_av_offset_ms: Option<f64>,
    pub(super) source_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) report: Option<RemixQcReport>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixQcReport {
    pub(super) timing_status: String,
    pub(super) freeze_status: String,
    pub(super) picture_status: String,
    pub(super) frame_count: Option<u64>,
    pub(super) audio_start_offset_ms: Option<f64>,
    pub(super) audio_end_offset_ms: Option<f64>,
    pub(super) freeze_threshold_ms: Option<f64>,
    pub(super) av_offset_threshold_ms: Option<f64>,
    pub(super) pts_gap_threshold_ms: Option<f64>,
    pub(super) freeze_noise_db: Option<f64>,
    pub(super) picture_max_distance: Option<f64>,
    pub(super) picture_min_texture: Option<f64>,
    pub(super) checked_segments: Option<u64>,
    pub(super) error_stage: Option<String>,
    pub(super) freeze_events: Vec<RemixQcFreezeEvent>,
    pub(super) freeze_event_count: usize,
    pub(super) timestamp_gaps: Vec<RemixQcTimestampGap>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixQcFreezeEvent {
    pub(super) start_ms: f64,
    pub(super) end_ms: f64,
    pub(super) source_exempt: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixQcTimestampGap {
    pub(super) frame: u64,
    pub(super) delta_ms: f64,
}

/// One output's current human review (成片审核).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixOutputReview {
    /// `approved` or `rejected`.
    pub(super) decision: String,
    /// Rejection reasons (`duplicate_picture`, `voice_break`, `wrong_product`,
    /// `pacing`, `frame_drop`, `wrong_framework`, `other`); empty when approved.
    pub(super) reasons: Vec<String>,
    pub(super) note: Option<String>,
    pub(super) reviewer_user_id: String,
    /// Display name of the reviewer when resolvable; null otherwise.
    pub(super) reviewer_name: Option<String>,
    pub(super) reviewed_at: String,
}

/// Approve or reject one output; repeating it replaces the previous review.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RemixOutputReviewRequest {
    /// `approved` or `rejected`.
    pub(super) decision: String,
    /// Required (at least one) when rejected, absent or empty when approved.
    #[serde(default)]
    pub(super) reasons: Vec<String>,
    /// Up to 500 characters; blank is treated as none.
    #[serde(default)]
    pub(super) note: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixPictureReview {
    pub(super) status: String,
    pub(super) pair_count: u64,
    pub(super) pairs: Vec<RemixPicturePair>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixPicturePair {
    pub(super) left_clip: u64,
    pub(super) right_clip: u64,
    pub(super) left_ms: u64,
    pub(super) right_ms: u64,
}

/// Batch summary. `status` is derived from the current Runs (running,
/// succeeded, partially_failed, failed or cancelled). `failedCount` excludes
/// cancelled Runs, which are counted in `cancelledCount`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatch {
    /// Failed or incomplete automatic-QC Runs, including a partially successful batch.
    pub(super) qc_failed_count: i32,
    pub(super) batch_id: Uuid,
    /// `framework` (框架混剪), `sellingPoint` (卖点混剪) or `edit` (单条剪辑, one output).
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
    /// Succeeded outputs not deleted from the library (an output never linked to an asset counts).
    pub(super) available_count: i32,
    /// Succeeded outputs whose library asset still exists, i.e. the ones a person can review;
    /// waiting for review is reviewable minus approved minus rejected.
    pub(super) reviewable_count: i32,
    /// Reviewable outputs approved / rejected for their current asset.
    pub(super) approved_count: i32,
    pub(super) rejected_count: i32,
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

/// 成片 list page. Every parameter is optional: none returns the newest page of
/// every batch in scope, as before paging existed.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RemixBatchListQuery {
    /// `failed` selects batches with a failed/incomplete automatic-QC Run.
    pub(super) quality: Option<String>,
    /// `framework`, `sellingPoint` or `edit`.
    pub(super) mode: Option<String>,
    /// `with` (still has outputs to watch) or `without` (failed, cancelled or
    /// all outputs deleted); absent lists both.
    pub(super) outputs: Option<String>,
    /// `pending` keeps batches with at least one output waiting for review (待审核).
    pub(super) review: Option<String>,
    /// `nextCursor` of the previous page.
    pub(super) cursor: Option<String>,
    /// 1-based page number for numbered paging; not combined with `cursor`.
    pub(super) page: Option<i64>,
    /// 1–100, default 50.
    pub(super) limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchListResponse {
    pub(super) items: Vec<RemixBatch>,
    /// Pass back as `cursor` for the next page; null on the last page.
    pub(super) next_cursor: Option<String>,
    /// Every batch in the viewer's scope (not just this page), by type.
    pub(super) counts: RemixBatchCounts,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchCounts {
    pub(super) rejected: RemixBatchModeCounts,
    pub(super) qc_failed: RemixBatchModeCounts,
    pub(super) with_outputs: RemixBatchModeCounts,
    pub(super) without_outputs: RemixBatchModeCounts,
    /// Batches with at least one output waiting for review (also counted above).
    pub(super) pending_review: RemixBatchModeCounts,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RemixBatchModeCounts {
    pub(super) all: i64,
    pub(super) framework: i64,
    pub(super) selling_point: i64,
    pub(super) edit: i64,
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
