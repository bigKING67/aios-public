use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::types::ContentAssetItem;

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetDetailResponse {
    pub(super) asset: ContentAssetItem,
    pub(super) objects: Vec<ContentAssetObject>,
    pub(super) transcript: Option<ContentAssetTranscript>,
    #[serde(rename = "platformVideos")]
    pub(super) platform_videos: Vec<ContentAssetPlatformVideo>,
    #[serde(rename = "adMaterials")]
    pub(super) ad_materials: Vec<ContentAssetAdMaterial>,
    #[serde(rename = "shortVideoProfileHint")]
    pub(super) short_video_profile_hint: Option<ContentAssetShortVideoProfileHint>,
    #[serde(rename = "performanceSnapshot")]
    pub(super) performance_snapshot: Option<ContentAssetPerformanceSnapshot>,
    pub(super) sources: Vec<ContentAssetSource>,
    pub(super) events: Vec<ContentAssetEvent>,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetPerformanceSnapshot {
    #[serde(rename = "deliveryMode")]
    pub(super) delivery_mode: String,
    #[serde(rename = "hasQianchuanPerformance")]
    pub(super) has_qianchuan_performance: bool,
    #[serde(rename = "latestStatDate")]
    pub(super) latest_stat_date: Option<String>,
    pub(super) totals: ContentAssetPerformanceTotals,
    pub(super) materials: Vec<ContentAssetPerformanceMaterial>,
    #[serde(rename = "qualityFlags")]
    pub(super) quality_flags: Vec<String>,
}

#[derive(Debug, Serialize, Default)]
pub(super) struct ContentAssetPerformanceTotals {
    #[serde(rename = "materialCount")]
    pub(super) material_count: i64,
    #[serde(rename = "productMaterialCount")]
    pub(super) product_material_count: i64,
    #[serde(rename = "liveMaterialCount")]
    pub(super) live_material_count: i64,
    #[serde(rename = "totalImpressions")]
    pub(super) total_impressions: i64,
    #[serde(rename = "totalClicks")]
    pub(super) total_clicks: i64,
    #[serde(rename = "totalCost")]
    pub(super) total_cost: f64,
    #[serde(rename = "totalOrders")]
    pub(super) total_orders: i64,
    #[serde(rename = "totalGmv")]
    pub(super) total_gmv: f64,
    #[serde(rename = "totalNetGmv")]
    pub(super) total_net_gmv: f64,
    #[serde(rename = "totalNetOrders")]
    pub(super) total_net_orders: i64,
    pub(super) ctr: Option<f64>,
    pub(super) cvr: Option<f64>,
    #[serde(rename = "payRoi")]
    pub(super) pay_roi: Option<f64>,
    #[serde(rename = "netGmvRoi")]
    pub(super) net_gmv_roi: Option<f64>,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetPerformanceMaterial {
    #[serde(rename = "materialId")]
    pub(super) material_id: String,
    #[serde(rename = "adMaterialId")]
    pub(super) ad_material_id: Option<Uuid>,
    #[serde(rename = "platformVideoId")]
    pub(super) platform_video_id: Option<Uuid>,
    pub(super) objective: String,
    #[serde(rename = "sourceTable")]
    pub(super) source_table: String,
    #[serde(rename = "materialVideoName")]
    pub(super) material_video_name: Option<String>,
    #[serde(rename = "liveRoomName")]
    pub(super) live_room_name: Option<String>,
    #[serde(rename = "douyinAccountDisplayId")]
    pub(super) douyin_account_display_id: Option<String>,
    #[serde(rename = "firstStatDate")]
    pub(super) first_stat_date: Option<String>,
    #[serde(rename = "lastStatDate")]
    pub(super) last_stat_date: Option<String>,
    #[serde(rename = "activeDays")]
    pub(super) active_days: i32,
    #[serde(rename = "totalImpressions")]
    pub(super) total_impressions: i64,
    #[serde(rename = "totalClicks")]
    pub(super) total_clicks: i64,
    #[serde(rename = "totalCost")]
    pub(super) total_cost: f64,
    #[serde(rename = "totalOrders")]
    pub(super) total_orders: i64,
    #[serde(rename = "totalGmv")]
    pub(super) total_gmv: f64,
    #[serde(rename = "totalNetGmv")]
    pub(super) total_net_gmv: f64,
    #[serde(rename = "totalNetOrders")]
    pub(super) total_net_orders: i64,
    pub(super) ctr: Option<f64>,
    pub(super) cvr: Option<f64>,
    #[serde(rename = "payRoi")]
    pub(super) pay_roi: Option<f64>,
    #[serde(rename = "netGmvRoi")]
    pub(super) net_gmv_roi: Option<f64>,
    #[serde(rename = "orderCost")]
    pub(super) order_cost: Option<f64>,
    #[serde(rename = "netOrderCost")]
    pub(super) net_order_cost: Option<f64>,
    #[serde(rename = "refundRate1h")]
    pub(super) refund_rate_1h: Option<f64>,
    #[serde(rename = "videoPlayCount")]
    pub(super) video_play_count: Option<i64>,
    #[serde(rename = "videoCompletePlayRate")]
    pub(super) video_complete_play_rate: Option<f64>,
    #[serde(rename = "avgWatchDuration")]
    pub(super) avg_watch_duration: Option<f64>,
    #[serde(rename = "playRate5s")]
    pub(super) play_rate_5s: Option<f64>,
    #[serde(rename = "playRate10s")]
    pub(super) play_rate_10s: Option<f64>,
    #[serde(rename = "latestLiveAcceptanceStatus")]
    pub(super) latest_live_acceptance_status: Option<String>,
    #[serde(rename = "dataQualityStatus")]
    pub(super) data_quality_status: String,
    #[serde(rename = "sampleQualityStatus")]
    pub(super) sample_quality_status: String,
    #[serde(rename = "diagnosisStatus")]
    pub(super) diagnosis_status: String,
    #[serde(rename = "latestMetrics")]
    pub(super) latest_metrics: Value,
    #[serde(rename = "liveAcceptance")]
    pub(super) live_acceptance: Option<ContentAssetLiveAcceptanceSnapshot>,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetLiveAcceptanceSnapshot {
    #[serde(rename = "attributionLevel")]
    pub(super) attribution_level: String,
    #[serde(rename = "statDate")]
    pub(super) stat_date: String,
    #[serde(rename = "douyinAccountDisplayId")]
    pub(super) douyin_account_display_id: String,
    #[serde(rename = "anchorNickname")]
    pub(super) anchor_nickname: Option<String>,
    #[serde(rename = "liveWatchUserCount")]
    pub(super) live_watch_user_count: Option<i64>,
    #[serde(rename = "liveProductClickUser")]
    pub(super) live_product_click_user: Option<i64>,
    #[serde(rename = "productClickRateUser")]
    pub(super) product_click_rate_user: Option<f64>,
    #[serde(rename = "watchToPayRateUser")]
    pub(super) watch_to_pay_rate_user: Option<f64>,
    #[serde(rename = "clickToPayRateUser")]
    pub(super) click_to_pay_rate_user: Option<f64>,
    #[serde(rename = "liveOrderCount")]
    pub(super) live_order_count: Option<i64>,
    #[serde(rename = "liveGmv")]
    pub(super) live_gmv: Option<f64>,
    #[serde(rename = "acceptanceQualityStatus")]
    pub(super) acceptance_quality_status: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetShortVideoProfileHint {
    #[serde(rename = "matchStatus")]
    pub(super) match_status: String,
    pub(super) source: String,
    #[serde(rename = "creatorName")]
    pub(super) creator_name: Option<String>,
    #[serde(rename = "creatorAccountId")]
    pub(super) creator_account_id: Option<String>,
    #[serde(rename = "productNames")]
    pub(super) product_names: Vec<String>,
    #[serde(rename = "videoType")]
    pub(super) video_type: Option<String>,
    #[serde(rename = "contentScene")]
    pub(super) content_scene: Option<String>,
    #[serde(rename = "contentSceneGroup")]
    pub(super) content_scene_group: Option<String>,
    #[serde(rename = "contentSceneSubtype")]
    pub(super) content_scene_subtype: Option<String>,
    #[serde(rename = "qianchuanMaterialIds")]
    pub(super) qianchuan_material_ids: Vec<String>,
    #[serde(rename = "videoIds")]
    pub(super) video_ids: Vec<String>,
    #[serde(rename = "matchedRowCount")]
    pub(super) matched_row_count: i64,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetAnalysisResultResponse {
    #[serde(rename = "objectKey")]
    pub(super) object_key: String,
    #[serde(rename = "generatedAt")]
    pub(super) generated_at: String,
    pub(super) metadata: Value,
    pub(super) document: Value,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetTranscript {
    #[serde(rename = "transcriptId")]
    pub(super) transcript_id: Uuid,
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    #[serde(rename = "sourceObjectKey")]
    pub(super) source_object_key: String,
    #[serde(rename = "transcriptObjectKey")]
    pub(super) transcript_object_key: String,
    pub(super) provider: String,
    pub(super) model: String,
    pub(super) language: Option<String>,
    pub(super) status: String,
    #[serde(rename = "transcriptText")]
    pub(super) transcript_text: String,
    #[serde(rename = "scriptText")]
    pub(super) script_text: String,
    #[serde(rename = "srtText")]
    pub(super) srt_text: String,
    pub(super) segments: Value,
    #[serde(rename = "durationSeconds")]
    pub(super) duration_seconds: Option<f64>,
    #[serde(rename = "wordCount")]
    pub(super) word_count: Option<i32>,
    pub(super) confidence: Option<f64>,
    pub(super) metadata: Value,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetObject {
    #[serde(rename = "objectId")]
    pub(super) object_id: Uuid,
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    #[serde(rename = "objectRole")]
    pub(super) object_role: String,
    #[serde(rename = "storageProvider")]
    pub(super) storage_provider: String,
    pub(super) bucket: String,
    #[serde(rename = "objectKey")]
    pub(super) object_key: String,
    #[serde(rename = "contentType")]
    pub(super) content_type: Option<String>,
    #[serde(rename = "fileExt")]
    pub(super) file_ext: Option<String>,
    #[serde(rename = "sizeBytes")]
    pub(super) size_bytes: Option<i64>,
    pub(super) sha256: Option<String>,
    pub(super) status: String,
    pub(super) metadata: Value,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetPlatformVideo {
    #[serde(rename = "platformVideoId")]
    pub(super) platform_video_id: Uuid,
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    pub(super) platform: String,
    #[serde(rename = "accountId")]
    pub(super) account_id: Option<String>,
    #[serde(rename = "accountName")]
    pub(super) account_name: Option<String>,
    #[serde(rename = "advertiserId")]
    pub(super) advertiser_id: Option<String>,
    #[serde(rename = "externalVideoId")]
    pub(super) external_video_id: Option<String>,
    #[serde(rename = "externalItemId")]
    pub(super) external_item_id: Option<String>,
    #[serde(rename = "externalNoteId")]
    pub(super) external_note_id: Option<String>,
    #[serde(rename = "externalUrl")]
    pub(super) external_url: Option<String>,
    #[serde(rename = "publishTitle")]
    pub(super) publish_title: Option<String>,
    #[serde(rename = "publishStatus")]
    pub(super) publish_status: String,
    #[serde(rename = "relationStatus")]
    pub(super) relation_status: String,
    pub(super) source: String,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetAdMaterial {
    #[serde(rename = "adMaterialId")]
    pub(super) ad_material_id: Uuid,
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    #[serde(rename = "platformVideoId")]
    pub(super) platform_video_id: Option<Uuid>,
    #[serde(rename = "adPlatform")]
    pub(super) ad_platform: String,
    #[serde(rename = "accountId")]
    pub(super) account_id: Option<String>,
    #[serde(rename = "accountName")]
    pub(super) account_name: Option<String>,
    #[serde(rename = "advertiserId")]
    pub(super) advertiser_id: Option<String>,
    #[serde(rename = "externalMaterialId")]
    pub(super) external_material_id: String,
    #[serde(rename = "externalVideoId")]
    pub(super) external_video_id: Option<String>,
    #[serde(rename = "materialName")]
    pub(super) material_name: Option<String>,
    #[serde(rename = "materialTitle")]
    pub(super) material_title: Option<String>,
    #[serde(rename = "materialStatus")]
    pub(super) material_status: String,
    #[serde(rename = "relationStatus")]
    pub(super) relation_status: String,
    pub(super) source: String,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetSource {
    #[serde(rename = "sourceId")]
    pub(super) source_id: i64,
    #[serde(rename = "sourceKind")]
    pub(super) source_kind: String,
    #[serde(rename = "sourceUrl")]
    pub(super) source_url: Option<String>,
    #[serde(rename = "sourceTitle")]
    pub(super) source_title: Option<String>,
    #[serde(rename = "feishuFileToken")]
    pub(super) feishu_file_token: Option<String>,
    #[serde(rename = "feishuSheetId")]
    pub(super) feishu_sheet_id: Option<String>,
    #[serde(rename = "feishuSheetName")]
    pub(super) feishu_sheet_name: Option<String>,
    #[serde(rename = "feishuRowIndex")]
    pub(super) feishu_row_index: Option<i32>,
    #[serde(rename = "externalPlatform")]
    pub(super) external_platform: Option<String>,
    #[serde(rename = "externalStatus")]
    pub(super) external_status: String,
    pub(super) metadata: Value,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetEvent {
    #[serde(rename = "eventId")]
    pub(super) event_id: i64,
    #[serde(rename = "eventType")]
    pub(super) event_type: String,
    pub(super) actor: Option<String>,
    pub(super) message: Option<String>,
    pub(super) payload: Value,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct PlaybackUrlRequest {
    pub(super) variant: PlaybackVariant,
}

#[derive(Debug, Deserialize, Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub(super) enum PlaybackVariant {
    Preview,
    Raw,
}

#[derive(Debug, Serialize)]
pub(super) struct PlaybackUrlResponse {
    pub(super) url: String,
    pub(super) variant: PlaybackVariant,
    #[serde(rename = "expiresAt")]
    pub(super) expires_at: String,
    pub(super) provider: String,
    #[serde(rename = "contentType")]
    pub(super) content_type: String,
    #[serde(rename = "fileSizeBytes")]
    pub(super) file_size_bytes: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ImportRunCreateRequest {
    pub(super) mode: Option<String>,
    #[serde(rename = "sourceUrl")]
    pub(super) source_url: Option<String>,
    #[serde(rename = "spreadsheetToken")]
    pub(super) spreadsheet_token: Option<String>,
    #[serde(rename = "sheetIds")]
    pub(super) sheet_ids: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub(super) struct ImportRunCreateResponse {
    #[serde(rename = "runId")]
    pub(super) run_id: Uuid,
    pub(super) mode: String,
    pub(super) status: String,
    pub(super) message: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ImportRunListResponse {
    pub(super) items: Vec<ContentAssetImportRun>,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetImportRun {
    #[serde(rename = "runId")]
    pub(super) run_id: Uuid,
    pub(super) mode: String,
    pub(super) status: String,
    #[serde(rename = "sourceUrl")]
    pub(super) source_url: String,
    #[serde(rename = "spreadsheetToken")]
    pub(super) spreadsheet_token: Option<String>,
    #[serde(rename = "sheetIds")]
    pub(super) sheet_ids: Vec<String>,
    #[serde(rename = "dryRunPayload")]
    pub(super) dry_run_payload: Value,
    #[serde(rename = "totalRows")]
    pub(super) total_rows: i32,
    #[serde(rename = "attachmentCount")]
    pub(super) attachment_count: i32,
    #[serde(rename = "uploadedCount")]
    pub(super) uploaded_count: i32,
    #[serde(rename = "externalOnlyCount")]
    pub(super) external_only_count: i32,
    #[serde(rename = "failedCount")]
    pub(super) failed_count: i32,
    #[serde(rename = "errorMessage")]
    pub(super) error_message: Option<String>,
    #[serde(rename = "requestedBy")]
    pub(super) requested_by: Option<String>,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
    #[serde(rename = "finishedAt")]
    pub(super) finished_at: Option<String>,
}
