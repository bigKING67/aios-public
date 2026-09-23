use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub(super) use super::detail_types::{
    ContentAssetAdMaterial, ContentAssetAnalysisResultResponse, ContentAssetDetailResponse,
    ContentAssetEvent, ContentAssetImportRun, ContentAssetObject, ContentAssetPlatformVideo,
    ContentAssetShortVideoProfileHint, ContentAssetSource, ContentAssetTranscript,
    ImportRunCreateRequest, ImportRunCreateResponse, ImportRunListResponse, PlaybackUrlRequest,
    PlaybackUrlResponse, PlaybackVariant,
};

#[derive(Debug, Deserialize, Default)]
pub(super) struct ContentAssetQuery {
    pub(super) keyword: Option<String>,
    pub(super) platform: Option<String>,
    pub(super) product_name: Option<String>,
    pub(super) creator_name: Option<String>,
    pub(super) owner_user_id: Option<String>,
    pub(super) video_type: Option<String>,
    pub(super) content_scene: Option<String>,
    pub(super) content_scene_group: Option<String>,
    pub(super) content_scene_subtype: Option<String>,
    pub(super) tag: Option<String>,
    pub(super) tags: Option<String>,
    pub(super) asset_status: Option<String>,
    pub(super) lifecycle_status: Option<String>,
    pub(super) external_only: Option<String>,
    pub(super) todo: Option<String>,
    pub(super) page: Option<i64>,
    pub(super) page_size: Option<i64>,
    pub(super) sort: Option<String>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetQuery {
    pub(super) keyword: Option<String>,
    pub(super) platform: Option<String>,
    pub(super) product_name: Option<String>,
    pub(super) creator_name: Option<String>,
    pub(super) owner_user_id: Option<String>,
    pub(super) video_type: Option<String>,
    pub(super) content_scene: Option<String>,
    pub(super) content_scene_group: Option<String>,
    pub(super) content_scene_subtype: Option<String>,
    pub(super) tags: Vec<String>,
    pub(super) asset_status: Option<String>,
    pub(super) lifecycle_status: Option<String>,
    pub(super) external_only: Option<bool>,
    pub(super) todo: Option<String>,
    pub(super) page: i64,
    pub(super) page_size: i64,
    pub(super) sort: ContentAssetSort,
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct ContentAssetProcessingJobQuery {
    #[serde(rename = "assetId")]
    pub(super) asset_id: Option<Uuid>,
    pub(super) status: Option<String>,
    #[serde(rename = "jobType")]
    pub(super) job_type: Option<String>,
    pub(super) limit: Option<i64>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetProcessingJobQuery {
    pub(super) asset_id: Option<Uuid>,
    pub(super) status: Option<String>,
    pub(super) job_type: Option<String>,
    pub(super) limit: i64,
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct ContentAssetUnmatchedStatsQuery {
    #[serde(rename = "matchType")]
    pub(super) match_type: Option<String>,
    pub(super) limit: Option<i64>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetUnmatchedStatsQuery {
    pub(super) match_type: Option<String>,
    pub(super) limit: i64,
}

#[derive(Debug, Clone, Copy)]
pub(super) enum ContentAssetSort {
    Recommended,
    UpdatedDesc,
    UploadedDesc,
    TitleAsc,
    RoiDesc,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetListResponse {
    pub(super) items: Vec<ContentAssetItem>,
    pub(super) total: i64,
    pub(super) page: i64,
    #[serde(rename = "pageSize")]
    pub(super) page_size: i64,
    pub(super) summary: ContentAssetSummary,
    #[serde(rename = "filterOptions")]
    pub(super) filter_options: ContentAssetFilterOptions,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct ContentAssetItem {
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    pub(super) title: String,
    #[serde(rename = "assetType")]
    pub(super) asset_type: String,
    #[serde(rename = "assetStatus")]
    pub(super) asset_status: String,
    #[serde(rename = "profileStatus")]
    pub(super) profile_status: String,
    #[serde(rename = "lifecycleStatus")]
    pub(super) lifecycle_status: String,
    #[serde(rename = "externalOnly")]
    pub(super) external_only: bool,
    pub(super) bucket: String,
    #[serde(rename = "rawObjectKey")]
    pub(super) raw_object_key: Option<String>,
    #[serde(rename = "previewObjectKey")]
    pub(super) preview_object_key: Option<String>,
    #[serde(rename = "coverObjectKey")]
    pub(super) cover_object_key: Option<String>,
    #[serde(rename = "transcriptObjectKey")]
    pub(super) transcript_object_key: Option<String>,
    #[serde(rename = "coverUrl", skip_serializing_if = "Option::is_none")]
    pub(super) cover_url: Option<String>,
    #[serde(rename = "rawSha256")]
    pub(super) raw_sha256: Option<String>,
    #[serde(rename = "fileExt")]
    pub(super) file_ext: Option<String>,
    #[serde(rename = "mimeType")]
    pub(super) mime_type: Option<String>,
    #[serde(rename = "durationSeconds")]
    pub(super) duration_seconds: Option<f64>,
    pub(super) width: Option<i32>,
    pub(super) height: Option<i32>,
    #[serde(rename = "fileSizeBytes")]
    pub(super) file_size_bytes: Option<i64>,
    #[serde(rename = "previewSizeBytes")]
    pub(super) preview_size_bytes: Option<i64>,
    pub(super) platform: Option<String>,
    #[serde(rename = "platformNames")]
    pub(super) platform_names: Vec<String>,
    #[serde(rename = "productName")]
    pub(super) product_name: Option<String>,
    #[serde(rename = "productNames")]
    pub(super) product_names: Vec<String>,
    #[serde(rename = "skuNames")]
    pub(super) sku_names: Vec<String>,
    #[serde(rename = "creatorName")]
    pub(super) creator_name: Option<String>,
    #[serde(rename = "videoType")]
    pub(super) video_type: Option<String>,
    #[serde(rename = "contentScene")]
    pub(super) content_scene: Option<String>,
    #[serde(rename = "contentSceneGroup")]
    pub(super) content_scene_group: Option<String>,
    #[serde(rename = "contentSceneSubtype")]
    pub(super) content_scene_subtype: Option<String>,
    #[serde(rename = "ownerName")]
    pub(super) owner_name: Option<String>,
    #[serde(rename = "ownerUserId")]
    pub(super) owner_user_id: Option<String>,
    #[serde(rename = "uploadedByUserId")]
    pub(super) uploaded_by_user_id: Option<String>,
    #[serde(rename = "canEdit")]
    pub(super) can_edit: bool,
    pub(super) tags: Vec<String>,
    #[serde(rename = "aiSuggestedTitle")]
    pub(super) ai_suggested_title: Option<String>,
    #[serde(rename = "aiSuggestedTags")]
    pub(super) ai_suggested_tags: Vec<String>,
    #[serde(rename = "aiMetadataGeneratedAt")]
    pub(super) ai_metadata_generated_at: Option<String>,
    #[serde(rename = "titleSource")]
    pub(super) title_source: String,
    #[serde(rename = "tagsSource")]
    pub(super) tags_source: String,
    pub(super) notes: Option<String>,
    #[serde(rename = "authorizationStatus")]
    pub(super) authorization_status: String,
    #[serde(rename = "commercialUseAllowed")]
    pub(super) commercial_use_allowed: Option<bool>,
    #[serde(rename = "repurposeAllowed")]
    pub(super) repurpose_allowed: Option<bool>,
    #[serde(rename = "authorizationStartsAt")]
    pub(super) authorization_starts_at: Option<String>,
    #[serde(rename = "authorizationExpiresAt")]
    pub(super) authorization_expires_at: Option<String>,
    #[serde(rename = "authorizationNotes")]
    pub(super) authorization_notes: Option<String>,
    #[serde(rename = "aiSummary")]
    pub(super) ai_summary: Option<String>,
    #[serde(rename = "aiScore")]
    pub(super) ai_score: Option<f64>,
    #[serde(rename = "aiAnalysisSource")]
    pub(super) ai_analysis_source: Option<String>,
    #[serde(rename = "aiAnalysisModel")]
    pub(super) ai_analysis_model: Option<String>,
    #[serde(rename = "aiAnalyzedAt")]
    pub(super) ai_analyzed_at: Option<String>,
    #[serde(rename = "transcriptSource")]
    pub(super) transcript_source: Option<String>,
    #[serde(rename = "transcriptModel")]
    pub(super) transcript_model: Option<String>,
    #[serde(rename = "transcribedAt")]
    pub(super) transcribed_at: Option<String>,
    #[serde(rename = "scriptExcerpt")]
    pub(super) script_excerpt: Option<String>,
    pub(super) roi: Option<f64>,
    pub(super) ctr: Option<f64>,
    pub(super) cvr: Option<f64>,
    pub(super) spend: Option<f64>,
    pub(super) gmv: Option<f64>,
    #[serde(rename = "sourceType")]
    pub(super) source_type: String,
    #[serde(rename = "sourcePlatform")]
    pub(super) source_platform: Option<String>,
    #[serde(rename = "sourceUrl")]
    pub(super) source_url: Option<String>,
    #[serde(rename = "sourceSheetId")]
    pub(super) source_sheet_id: Option<String>,
    #[serde(rename = "sourceSheetName")]
    pub(super) source_sheet_name: Option<String>,
    #[serde(rename = "sourceRowIndex")]
    pub(super) source_row_index: Option<i32>,
    #[serde(rename = "uploadedAt")]
    pub(super) uploaded_at: Option<String>,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: String,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetSummary {
    #[serde(rename = "totalAssets")]
    pub(super) total_assets: i64,
    #[serde(rename = "readyAssets")]
    pub(super) ready_assets: i64,
    #[serde(rename = "externalOnlyAssets")]
    pub(super) external_only_assets: i64,
    #[serde(rename = "pendingAssets")]
    pub(super) pending_assets: i64,
    #[serde(rename = "failedAssets")]
    pub(super) failed_assets: i64,
    #[serde(rename = "totalRawSizeBytes")]
    pub(super) total_raw_size_bytes: i64,
    #[serde(rename = "latestUpdatedAt")]
    pub(super) latest_updated_at: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct ContentAssetHealthResponse {
    pub(super) status: String,
    #[serde(rename = "checkedAt")]
    pub(super) checked_at: String,
    pub(super) database: ContentAssetDatabaseHealth,
    pub(super) storage: ContentAssetStorageHealth,
    pub(super) delivery: ContentAssetDeliveryHealth,
    pub(super) assets: ContentAssetHealthAssetStats,
    pub(super) jobs: ContentAssetProcessingJobSummary,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetDatabaseHealth {
    pub(super) status: String,
    #[serde(rename = "assetsTableExists")]
    pub(super) assets_table_exists: bool,
    #[serde(rename = "objectsTableExists")]
    pub(super) objects_table_exists: bool,
    #[serde(rename = "processingJobsTableExists")]
    pub(super) processing_jobs_table_exists: bool,
    #[serde(rename = "dwdAdStatsTableExists")]
    pub(super) dwd_ad_stats_table_exists: bool,
    #[serde(rename = "dwdPlatformVideoStatsTableExists")]
    pub(super) dwd_platform_video_stats_table_exists: bool,
    #[serde(rename = "dwsDailySummaryTableExists")]
    pub(super) dws_daily_summary_table_exists: bool,
    #[serde(rename = "dwsLifetimeSummaryTableExists")]
    pub(super) dws_lifetime_summary_table_exists: bool,
    #[serde(rename = "rollupFunctionExists")]
    pub(super) rollup_function_exists: bool,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetHealthAssetStats {
    #[serde(rename = "totalAssets")]
    pub(super) total_assets: i64,
    #[serde(rename = "readyAssets")]
    pub(super) ready_assets: i64,
    #[serde(rename = "previewReadyAssets")]
    pub(super) preview_ready_assets: i64,
    #[serde(rename = "coverReadyAssets")]
    pub(super) cover_ready_assets: i64,
    #[serde(rename = "rawOnlyAssets")]
    pub(super) raw_only_assets: i64,
    #[serde(rename = "externalOnlyAssets")]
    pub(super) external_only_assets: i64,
    #[serde(rename = "pendingAssets")]
    pub(super) pending_assets: i64,
    #[serde(rename = "failedAssets")]
    pub(super) failed_assets: i64,
    #[serde(rename = "totalRawSizeBytes")]
    pub(super) total_raw_size_bytes: i64,
    #[serde(rename = "latestUpdatedAt")]
    pub(super) latest_updated_at: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct ContentAssetStorageHealth {
    pub(super) status: String,
    pub(super) provider: String,
    pub(super) bucket: String,
    pub(super) region: String,
    pub(super) endpoint: String,
    #[serde(rename = "credentialsConfigured")]
    pub(super) credentials_configured: bool,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct ContentAssetDeliveryHealth {
    pub(super) status: String,
    pub(super) provider: String,
    #[serde(rename = "cdnBaseUrl")]
    pub(super) cdn_base_url: Option<String>,
    #[serde(rename = "signedUrlTtlSeconds")]
    pub(super) signed_url_ttl_seconds: u64,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetFilterOptions {
    pub(super) platforms: Vec<String>,
    pub(super) products: Vec<String>,
    pub(super) skus: Vec<String>,
    pub(super) creators: Vec<String>,
    #[serde(rename = "videoTypes")]
    pub(super) video_types: Vec<String>,
    #[serde(rename = "contentScenes")]
    pub(super) content_scenes: Vec<String>,
    #[serde(rename = "contentSceneGroups")]
    pub(super) content_scene_groups: Vec<String>,
    #[serde(rename = "contentSceneSubtypes")]
    pub(super) content_scene_subtypes: Vec<String>,
    #[serde(rename = "ownerOptions")]
    pub(super) owner_options: Vec<ContentAssetOwnerOption>,
    #[serde(rename = "assetStatuses")]
    pub(super) asset_statuses: Vec<String>,
    #[serde(rename = "lifecycleStatuses")]
    pub(super) lifecycle_statuses: Vec<String>,
    pub(super) tags: Vec<String>,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetOwnerOption {
    #[serde(rename = "userId")]
    pub(super) user_id: String,
    pub(super) username: String,
    #[serde(rename = "displayName")]
    pub(super) display_name: String,
    pub(super) roles: Vec<String>,
    #[serde(rename = "isManager")]
    pub(super) is_manager: bool,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetProcessingJobSummary {
    #[serde(rename = "queuedJobs")]
    pub(super) queued_jobs: i64,
    #[serde(rename = "runningJobs")]
    pub(super) running_jobs: i64,
    #[serde(rename = "succeededJobs")]
    pub(super) succeeded_jobs: i64,
    #[serde(rename = "failedJobs")]
    pub(super) failed_jobs: i64,
    #[serde(rename = "staleRunningJobs")]
    pub(super) stale_running_jobs: i64,
    #[serde(rename = "latestFinishedAt")]
    pub(super) latest_finished_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetProcessingJobListResponse {
    pub(super) items: Vec<ContentAssetProcessingJob>,
    pub(super) summary: ContentAssetProcessingJobSummary,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetProcessingJobBackfillRequest {
    pub(super) limit: Option<i64>,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetProcessingJobBackfillResponse {
    #[serde(rename = "scannedAssets")]
    pub(super) scanned_assets: i64,
    #[serde(rename = "affectedAssets")]
    pub(super) affected_assets: i64,
    #[serde(rename = "candidateJobs")]
    pub(super) candidate_jobs: i64,
    #[serde(rename = "createdJobs")]
    pub(super) created_jobs: i64,
    #[serde(rename = "previewJobs")]
    pub(super) preview_jobs: i64,
    #[serde(rename = "coverJobs")]
    pub(super) cover_jobs: i64,
    #[serde(rename = "skippedExistingJobs")]
    pub(super) skipped_existing_jobs: i64,
    #[serde(rename = "estimatedRawBytes")]
    pub(super) estimated_raw_bytes: i64,
    pub(super) message: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetProcessingJob {
    #[serde(rename = "jobId")]
    pub(super) job_id: Uuid,
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    pub(super) title: String,
    #[serde(rename = "assetStatus")]
    pub(super) asset_status: String,
    #[serde(rename = "durationSeconds")]
    pub(super) duration_seconds: Option<f64>,
    #[serde(rename = "jobType")]
    pub(super) job_type: String,
    pub(super) status: String,
    pub(super) attempts: i32,
    #[serde(rename = "maxAttempts")]
    pub(super) max_attempts: i32,
    #[serde(rename = "inputObjectKey")]
    pub(super) input_object_key: Option<String>,
    #[serde(rename = "outputObjectKey")]
    pub(super) output_object_key: Option<String>,
    pub(super) metadata: Value,
    #[serde(rename = "errorMessage")]
    pub(super) error_message: Option<String>,
    #[serde(rename = "queuedAt")]
    pub(super) queued_at: String,
    #[serde(rename = "startedAt")]
    pub(super) started_at: Option<String>,
    #[serde(rename = "finishedAt")]
    pub(super) finished_at: Option<String>,
    #[serde(rename = "createdAt")]
    pub(super) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: String,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetUnmatchedStatsSummary {
    #[serde(rename = "totalGroups")]
    pub(super) total_groups: i64,
    #[serde(rename = "adMaterialGroups")]
    pub(super) ad_material_groups: i64,
    #[serde(rename = "platformVideoGroups")]
    pub(super) platform_video_groups: i64,
    #[serde(rename = "totalRows")]
    pub(super) total_rows: i64,
    #[serde(rename = "latestStatDate")]
    pub(super) latest_stat_date: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct ContentAssetUnmatchedStatsItem {
    #[serde(rename = "identityKey")]
    pub(super) identity_key: String,
    #[serde(rename = "matchType")]
    pub(super) match_type: String,
    pub(super) platform: String,
    #[serde(rename = "accountId")]
    pub(super) account_id: Option<String>,
    #[serde(rename = "accountName")]
    pub(super) account_name: Option<String>,
    #[serde(rename = "advertiserId")]
    pub(super) advertiser_id: Option<String>,
    #[serde(rename = "externalMaterialId")]
    pub(super) external_material_id: Option<String>,
    #[serde(rename = "externalVideoId")]
    pub(super) external_video_id: Option<String>,
    #[serde(rename = "externalItemId")]
    pub(super) external_item_id: Option<String>,
    #[serde(rename = "externalNoteId")]
    pub(super) external_note_id: Option<String>,
    #[serde(rename = "firstStatDate")]
    pub(super) first_stat_date: Option<String>,
    #[serde(rename = "lastStatDate")]
    pub(super) last_stat_date: Option<String>,
    #[serde(rename = "rowCount")]
    pub(super) row_count: i64,
    pub(super) impressions: i64,
    pub(super) clicks: i64,
    pub(super) plays: i64,
    pub(super) interactions: i64,
    pub(super) cost: Option<f64>,
    pub(super) gmv: Option<f64>,
    pub(super) roi: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct ContentAssetUnmatchedStatsResponse {
    pub(super) items: Vec<ContentAssetUnmatchedStatsItem>,
    pub(super) summary: ContentAssetUnmatchedStatsSummary,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetUnmatchedStatsBindRequest {
    #[serde(rename = "matchType")]
    pub(super) match_type: String,
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    pub(super) platform: String,
    #[serde(rename = "accountId")]
    pub(super) account_id: Option<String>,
    #[serde(rename = "accountName")]
    pub(super) account_name: Option<String>,
    #[serde(rename = "advertiserId")]
    pub(super) advertiser_id: Option<String>,
    #[serde(rename = "externalMaterialId")]
    pub(super) external_material_id: Option<String>,
    #[serde(rename = "externalVideoId")]
    pub(super) external_video_id: Option<String>,
    #[serde(rename = "externalItemId")]
    pub(super) external_item_id: Option<String>,
    #[serde(rename = "externalNoteId")]
    pub(super) external_note_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct ContentAssetUnmatchedStatsBindResponse {
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    #[serde(rename = "platformVideoId")]
    pub(super) platform_video_id: Option<Uuid>,
    #[serde(rename = "adMaterialId")]
    pub(super) ad_material_id: Option<Uuid>,
    #[serde(rename = "affectedRows")]
    pub(super) affected_rows: i64,
    pub(super) message: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetDouyinVideoIdResolveResponse {
    #[serde(rename = "sourceUrl")]
    pub(super) source_url: String,
    #[serde(rename = "resolvedUrl")]
    pub(super) resolved_url: String,
    #[serde(rename = "externalVideoId")]
    pub(super) external_video_id: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetVideoLinkPreviewResponse {
    pub(super) candidates: Vec<ContentAssetVideoLinkPreviewCandidateResponse>,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetVideoLinkMaterialSuggestionResponse {
    pub(super) status: String,
    pub(super) source: String,
    #[serde(rename = "externalVideoId")]
    pub(super) external_video_id: String,
    #[serde(rename = "recommendedExternalItemId")]
    pub(super) recommended_external_item_id: Option<String>,
    #[serde(rename = "materialIds")]
    pub(super) material_ids: Vec<String>,
    #[serde(rename = "matchStatus")]
    pub(super) match_status: Option<String>,
    pub(super) reason: String,
    #[serde(rename = "requiresConfirmation")]
    pub(super) requires_confirmation: bool,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetVideoLinkPreviewCandidateResponse {
    #[serde(rename = "sourceType")]
    pub(super) source_type: String,
    #[serde(rename = "sourceUrl")]
    pub(super) source_url: String,
    #[serde(rename = "resolvedUrl")]
    pub(super) resolved_url: String,
    #[serde(rename = "externalVideoId")]
    pub(super) external_video_id: Option<String>,
    #[serde(rename = "externalItemId")]
    pub(super) external_item_id: Option<String>,
    #[serde(
        rename = "qianchuanMaterialSuggestion",
        skip_serializing_if = "Option::is_none"
    )]
    pub(super) qianchuan_material_suggestion:
        Option<ContentAssetVideoLinkMaterialSuggestionResponse>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub(super) enum ContentAssetVideoLinkImportResponse {
    Imported {
        detail: Box<ContentAssetDetailResponse>,
    },
    AwaitingManualUpload {
        platform: String,
        #[serde(rename = "externalVideoId")]
        external_video_id: String,
        #[serde(rename = "sourceUrl")]
        source_url: String,
        #[serde(rename = "resolvedUrl")]
        resolved_url: String,
        #[serde(rename = "canBindAfterUpload")]
        can_bind_after_upload: bool,
        #[serde(rename = "downloadAttempt")]
        download_attempt: Box<ContentAssetVideoLinkDownloadAttemptResponse>,
        #[serde(rename = "nextAction")]
        next_action: ContentAssetVideoLinkNextActionResponse,
    },
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetVideoLinkDownloadAttemptResponse {
    pub(super) status: String,
    pub(super) reason: String,
    pub(super) message: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetVideoLinkNextActionResponse {
    #[serde(rename = "type")]
    pub(super) action_type: String,
    pub(super) label: String,
}
