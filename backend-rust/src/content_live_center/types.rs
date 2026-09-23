use std::collections::BTreeMap;

use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize, Default)]
pub(super) struct LiveCenterSessionQuery {
    pub(super) keyword: Option<String>,
    #[serde(rename = "shopId", alias = "shop_id")]
    pub(super) shop_id: Option<String>,
    #[serde(rename = "anchorDouyinId", alias = "anchor_douyin_id")]
    pub(super) anchor_douyin_id: Option<String>,
    #[serde(rename = "startDate", alias = "start_date")]
    pub(super) start_date: Option<String>,
    #[serde(rename = "endDate", alias = "end_date")]
    pub(super) end_date: Option<String>,
    pub(super) page: Option<i64>,
    #[serde(rename = "pageSize", alias = "page_size")]
    pub(super) page_size: Option<i64>,
}

#[derive(Debug, Clone)]
pub(super) struct NormalizedLiveCenterSessionQuery {
    pub(super) keyword: Option<String>,
    pub(super) shop_id: Option<String>,
    pub(super) anchor_douyin_id: Option<String>,
    pub(super) start_date: Option<NaiveDate>,
    pub(super) end_date: Option<NaiveDate>,
    pub(super) page: i64,
    pub(super) page_size: i64,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct LiveCenterSessionItem {
    #[serde(rename = "sessionId")]
    pub(super) session_id: String,
    #[serde(rename = "shopId")]
    pub(super) shop_id: String,
    #[serde(rename = "shopName")]
    pub(super) shop_name: String,
    #[serde(rename = "anchorDouyinId")]
    pub(super) anchor_douyin_id: String,
    #[serde(rename = "anchorNickname")]
    pub(super) anchor_nickname: String,
    #[serde(rename = "anchorAvatar")]
    pub(super) anchor_avatar: Option<String>,
    #[serde(rename = "liveStartTime")]
    pub(super) live_start_time: String,
    #[serde(rename = "liveEndTime")]
    pub(super) live_end_time: Option<String>,
    #[serde(rename = "liveDurationMinutes")]
    pub(super) live_duration_minutes: i64,
    #[serde(rename = "liveOrderCount")]
    pub(super) live_order_count: i64,
    #[serde(rename = "liveGmv")]
    pub(super) live_gmv: f64,
    #[serde(rename = "liveUserPayAmount")]
    pub(super) live_user_pay_amount: f64,
    #[serde(rename = "minuteOrderCount")]
    pub(super) minute_order_count: i64,
    #[serde(rename = "minutePointCount")]
    pub(super) minute_point_count: i64,
    #[serde(rename = "recordingSegmentCount")]
    pub(super) recording_segment_count: i64,
    #[serde(rename = "analysisStatus")]
    pub(super) analysis_status: Option<String>,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterSessionListResponse {
    pub(super) items: Vec<LiveCenterSessionItem>,
    pub(super) total: i64,
    pub(super) page: i64,
    #[serde(rename = "pageSize")]
    pub(super) page_size: i64,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterDateBoundsResponse {
    #[serde(rename = "minDate")]
    pub(super) min_date: Option<String>,
    #[serde(rename = "maxDate")]
    pub(super) max_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterMinuteMetric {
    #[serde(rename = "liveMinuteTime")]
    pub(super) live_minute_time: String,
    #[serde(rename = "minuteOffset")]
    pub(super) minute_offset: i32,
    #[serde(rename = "orderCount")]
    pub(super) order_count: i64,
    #[serde(rename = "matchStatus")]
    pub(super) match_status: String,
    #[serde(rename = "matchReason")]
    pub(super) match_reason: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct LiveCenterRecording {
    #[serde(rename = "recordingId")]
    pub(super) recording_id: Uuid,
    #[serde(rename = "sessionId")]
    pub(super) session_id: String,
    pub(super) status: String,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: String,
    pub(super) segments: Vec<LiveCenterRecordingSegment>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct LiveCenterRecordingSegment {
    #[serde(rename = "segmentId")]
    pub(super) segment_id: Uuid,
    #[serde(rename = "recordingId")]
    pub(super) recording_id: Uuid,
    #[serde(rename = "segmentIndex")]
    pub(super) segment_index: i32,
    pub(super) bucket: String,
    #[serde(rename = "rawObjectKey")]
    pub(super) raw_object_key: String,
    #[serde(rename = "previewObjectKey")]
    pub(super) preview_object_key: Option<String>,
    #[serde(rename = "fileName")]
    pub(super) file_name: String,
    #[serde(rename = "mimeType")]
    pub(super) mime_type: Option<String>,
    #[serde(rename = "fileExt")]
    pub(super) file_ext: Option<String>,
    #[serde(rename = "fileSizeBytes")]
    pub(super) file_size_bytes: Option<i64>,
    pub(super) sha256: Option<String>,
    #[serde(rename = "durationSeconds")]
    pub(super) duration_seconds: Option<f64>,
    #[serde(rename = "startOffsetSeconds")]
    pub(super) start_offset_seconds: Option<f64>,
    #[serde(rename = "endOffsetSeconds")]
    pub(super) end_offset_seconds: Option<f64>,
    #[serde(rename = "uploadStatus")]
    pub(super) upload_status: String,
    #[serde(rename = "processingStatus")]
    pub(super) processing_status: String,
    #[serde(rename = "uploadedByUserId")]
    pub(super) uploaded_by_user_id: Option<String>,
    #[serde(rename = "uploadedAt")]
    pub(super) uploaded_at: Option<String>,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: String,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterAnalysisJob {
    #[serde(rename = "analysisId")]
    pub(super) analysis_id: Uuid,
    #[serde(rename = "sessionId")]
    pub(super) session_id: String,
    #[serde(rename = "recordingId")]
    pub(super) recording_id: Option<Uuid>,
    pub(super) status: String,
    pub(super) model: Option<String>,
    #[serde(rename = "analysisProfile")]
    pub(super) analysis_profile: Option<String>,
    pub(super) provider: Option<String>,
    #[serde(rename = "promptVersion")]
    pub(super) prompt_version: Option<String>,
    #[serde(rename = "inputSnapshot")]
    pub(super) input_snapshot: Value,
    #[serde(rename = "progressPercent")]
    pub(super) progress_percent: i32,
    #[serde(rename = "processingStage")]
    pub(super) processing_stage: Option<String>,
    #[serde(rename = "outputObjectKey")]
    pub(super) output_object_key: Option<String>,
    #[serde(rename = "responseId")]
    pub(super) response_id: Option<String>,
    #[serde(rename = "usageJson")]
    pub(super) usage_json: Value,
    #[serde(rename = "analysisJson")]
    pub(super) analysis_json: Value,
    #[serde(rename = "errorMessage")]
    pub(super) error_message: Option<String>,
    #[serde(rename = "createdByUserId")]
    pub(super) created_by_user_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
    #[serde(rename = "startedAt")]
    pub(super) started_at: Option<String>,
    #[serde(rename = "completedAt")]
    pub(super) completed_at: Option<String>,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: String,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterSessionDetailResponse {
    pub(super) session: LiveCenterSessionItem,
    #[serde(rename = "minuteMetrics")]
    pub(super) minute_metrics: Vec<LiveCenterMinuteMetric>,
    pub(super) recording: Option<LiveCenterRecording>,
    pub(super) analyses: Vec<LiveCenterAnalysisJob>,
}

#[derive(Debug, Deserialize)]
pub(super) struct LiveCenterUploadCreateRequest {
    #[serde(rename = "fileName")]
    pub(super) file_name: String,
    #[serde(rename = "contentType")]
    pub(super) content_type: Option<String>,
    #[serde(rename = "fileSizeBytes")]
    pub(super) file_size_bytes: Option<i64>,
    pub(super) sha256: Option<String>,
    #[serde(rename = "segmentIndex")]
    pub(super) segment_index: Option<i32>,
}

#[derive(Debug, Clone)]
pub(super) struct NormalizedLiveCenterUploadCreate {
    pub(super) file_name: String,
    pub(super) content_type: String,
    pub(super) file_size_bytes: Option<i64>,
    pub(super) sha256: Option<String>,
    pub(super) segment_index: i32,
    pub(super) file_ext: String,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterUploadCreateResponse {
    #[serde(rename = "recordingId")]
    pub(super) recording_id: Uuid,
    #[serde(rename = "segmentId")]
    pub(super) segment_id: Uuid,
    pub(super) bucket: String,
    #[serde(rename = "objectKey")]
    pub(super) object_key: String,
    #[serde(rename = "uploadStrategy")]
    pub(super) upload_strategy: String,
    #[serde(rename = "uploadUrl")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) upload_url: Option<String>,
    pub(super) method: String,
    #[serde(rename = "expiresAt")]
    pub(super) expires_at: String,
    pub(super) headers: BTreeMap<String, String>,
    #[serde(rename = "uploadId")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) upload_id: Option<String>,
    #[serde(rename = "partSizeBytes")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) part_size_bytes: Option<i64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(super) parts: Vec<LiveCenterUploadPartUrl>,
    #[serde(rename = "completedParts")]
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(super) completed_parts: Vec<LiveCenterUploadCompletePartResponse>,
}

#[derive(Debug, Deserialize)]
pub(super) struct LiveCenterMultipartResumeRequest {
    #[serde(rename = "sessionId", alias = "session_id")]
    pub(super) session_id: String,
    #[serde(rename = "uploadId")]
    pub(super) upload_id: String,
    #[serde(rename = "fileSizeBytes")]
    pub(super) file_size_bytes: i64,
}

#[derive(Debug, Clone)]
pub(super) struct NormalizedLiveCenterMultipartResume {
    pub(super) session_id: String,
    pub(super) upload_id: String,
    pub(super) file_size_bytes: i64,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterMultipartResumeResponse {
    #[serde(rename = "recordingId")]
    pub(super) recording_id: Uuid,
    #[serde(rename = "segmentId")]
    pub(super) segment_id: Uuid,
    pub(super) bucket: String,
    #[serde(rename = "objectKey")]
    pub(super) object_key: String,
    #[serde(rename = "uploadStrategy")]
    pub(super) upload_strategy: String,
    #[serde(rename = "uploadId")]
    pub(super) upload_id: String,
    #[serde(rename = "partSizeBytes")]
    pub(super) part_size_bytes: i64,
    #[serde(rename = "expiresAt")]
    pub(super) expires_at: String,
    pub(super) parts: Vec<LiveCenterUploadPartUrl>,
    #[serde(rename = "completedParts")]
    pub(super) completed_parts: Vec<LiveCenterUploadCompletePartResponse>,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterUploadPartUrl {
    #[serde(rename = "partNumber")]
    pub(super) part_number: i32,
    #[serde(rename = "startByte")]
    pub(super) start_byte: i64,
    #[serde(rename = "endByteExclusive")]
    pub(super) end_byte_exclusive: i64,
    #[serde(rename = "uploadUrl")]
    pub(super) upload_url: String,
    pub(super) method: String,
    #[serde(rename = "expiresAt")]
    pub(super) expires_at: String,
    pub(super) headers: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub(super) struct LiveCenterUploadCompletePartResponse {
    #[serde(rename = "partNumber")]
    pub(super) part_number: i32,
    pub(super) etag: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct LiveCenterUploadCompleteRequest {
    #[serde(rename = "fileSizeBytes")]
    pub(super) file_size_bytes: Option<i64>,
    pub(super) sha256: Option<String>,
    #[serde(rename = "durationSeconds")]
    pub(super) duration_seconds: Option<f64>,
    #[serde(rename = "multipartUploadId")]
    pub(super) multipart_upload_id: Option<String>,
    #[serde(rename = "multipartParts")]
    pub(super) multipart_parts: Option<Vec<LiveCenterUploadCompletePartRequest>>,
}

#[derive(Debug, Deserialize)]
pub(super) struct LiveCenterUploadCompletePartRequest {
    #[serde(rename = "partNumber")]
    pub(super) part_number: i32,
    pub(super) etag: String,
}

#[derive(Debug, Clone)]
pub(super) struct NormalizedLiveCenterUploadComplete {
    pub(super) file_size_bytes: Option<i64>,
    pub(super) sha256: Option<String>,
    pub(super) duration_seconds: Option<f64>,
    pub(super) multipart_upload_id: Option<String>,
    pub(super) multipart_parts: Vec<NormalizedLiveCenterUploadCompletePart>,
}

#[derive(Debug, Clone)]
pub(super) struct NormalizedLiveCenterUploadCompletePart {
    pub(super) part_number: i32,
    pub(super) etag: String,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterPlaybackUrlResponse {
    pub(super) url: String,
    pub(super) variant: String,
    #[serde(rename = "expiresAt")]
    pub(super) expires_at: String,
    pub(super) provider: String,
    #[serde(rename = "contentType")]
    pub(super) content_type: String,
    #[serde(rename = "fileSizeBytes")]
    pub(super) file_size_bytes: Option<i64>,
}

#[derive(Debug, Serialize)]
pub(super) struct LiveCenterRecordingSegmentCleanupResponse {
    #[serde(rename = "recordingId")]
    pub(super) recording_id: Uuid,
    #[serde(rename = "segmentId")]
    pub(super) segment_id: Uuid,
    #[serde(rename = "uploadStatus")]
    pub(super) upload_status: String,
    #[serde(rename = "processingStatus")]
    pub(super) processing_status: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct LiveCenterAnalysisCreateRequest {
    pub(super) model: Option<String>,
    #[serde(rename = "analysisProfile", alias = "analysis_profile")]
    pub(super) analysis_profile: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct NormalizedLiveCenterAnalysisCreate {
    pub(super) model: String,
    pub(super) analysis_profile: String,
    pub(super) prompt_version: String,
}

#[derive(Debug, Clone)]
pub(super) struct LiveCenterSessionIdentity {
    pub(super) session_id: String,
    pub(super) shop_id: String,
    pub(super) anchor_douyin_id: String,
    pub(super) live_start_time: NaiveDateTime,
}

#[derive(Debug, Clone)]
pub(super) struct LiveCenterUploadInsert {
    pub(super) segment_id: Uuid,
    pub(super) object_key: String,
    pub(super) bucket: String,
    pub(super) normalized: NormalizedLiveCenterUploadCreate,
    pub(super) uploaded_by_user_id: String,
}

#[derive(Debug, Clone)]
pub(super) struct LiveCenterExistingUploadSegment {
    pub(super) recording_id: Uuid,
    pub(super) segment_id: Uuid,
    pub(super) raw_object_key: String,
    pub(super) file_name: String,
    pub(super) file_size_bytes: Option<i64>,
    pub(super) upload_status: String,
    pub(super) multipart_upload_id: Option<String>,
    pub(super) multipart_part_size_bytes: Option<i64>,
}

#[derive(Debug, Clone)]
pub(super) struct LiveCenterPlaybackSegment {
    pub(super) session_key: String,
    pub(super) raw_object_key: String,
    pub(super) mime_type: Option<String>,
    pub(super) file_size_bytes: Option<i64>,
    pub(super) upload_status: String,
    pub(super) multipart_upload_id: Option<String>,
    pub(super) multipart_part_size_bytes: Option<i64>,
}
