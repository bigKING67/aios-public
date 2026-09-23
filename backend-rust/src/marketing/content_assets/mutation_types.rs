use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetAnalysisJobCreateRequest {
    pub(super) source: Option<String>,
    pub(super) profile: Option<String>,
    pub(super) force: Option<bool>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetAnalysisJobCreate {
    pub(super) source: String,
    pub(super) profile: Option<String>,
    pub(super) force: bool,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetTranscriptJobCreateRequest {
    pub(super) source: Option<String>,
    pub(super) force: Option<bool>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetTranscriptJobCreate {
    pub(super) source: String,
    pub(super) force: bool,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetAiJobBackfillRequest {
    #[serde(rename = "jobType")]
    pub(super) job_type: String,
    pub(super) source: Option<String>,
    pub(super) profile: Option<String>,
    pub(super) limit: Option<i64>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetAiJobBackfill {
    pub(super) job_type: String,
    pub(super) source: String,
    pub(super) profile: Option<String>,
    pub(super) limit: i64,
}

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetAiJobBackfillResponse {
    #[serde(rename = "jobType")]
    pub(super) job_type: String,
    pub(super) source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) profile: Option<String>,
    #[serde(rename = "scannedAssets")]
    pub(super) scanned_assets: i64,
    #[serde(rename = "candidateAssets")]
    pub(super) candidate_assets: i64,
    #[serde(rename = "queuedJobs")]
    pub(super) queued_jobs: i64,
    #[serde(rename = "skippedReadyAssets")]
    pub(super) skipped_ready_assets: i64,
    #[serde(rename = "skippedRunningJobs")]
    pub(super) skipped_running_jobs: i64,
    #[serde(rename = "skippedNoInput")]
    pub(super) skipped_no_input: i64,
    #[serde(rename = "skippedExistingJobs")]
    pub(super) skipped_existing_jobs: i64,
    pub(super) message: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetProfileUpdateRequest {
    pub(super) title: String,
    pub(super) platform: Option<String>,
    #[serde(rename = "platformNames")]
    pub(super) platform_names: Option<Vec<String>>,
    #[serde(rename = "productName")]
    pub(super) product_name: Option<String>,
    #[serde(rename = "productNames")]
    pub(super) product_names: Option<Vec<String>>,
    #[serde(rename = "skuNames")]
    pub(super) sku_names: Option<Vec<String>>,
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
    pub(super) tags: Vec<String>,
    pub(super) notes: Option<String>,
    #[serde(rename = "profileStatus")]
    pub(super) profile_status: String,
    #[serde(rename = "lifecycleStatus")]
    pub(super) lifecycle_status: String,
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
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetProfileUpdate {
    pub(super) title: String,
    pub(super) platform: Option<String>,
    pub(super) platform_names: Vec<String>,
    pub(super) product_name: Option<String>,
    pub(super) product_names: Vec<String>,
    pub(super) sku_names: Vec<String>,
    pub(super) creator_name: Option<String>,
    pub(super) video_type: Option<String>,
    pub(super) content_scene: Option<String>,
    pub(super) content_scene_group: Option<String>,
    pub(super) content_scene_subtype: Option<String>,
    pub(super) owner_name: Option<String>,
    pub(super) owner_user_id: Option<String>,
    pub(super) tags: Vec<String>,
    pub(super) notes: Option<String>,
    pub(super) profile_status: String,
    pub(super) lifecycle_status: String,
    pub(super) authorization_status: String,
    pub(super) commercial_use_allowed: Option<bool>,
    pub(super) repurpose_allowed: Option<bool>,
    pub(super) authorization_starts_at: Option<chrono::NaiveDate>,
    pub(super) authorization_expires_at: Option<chrono::NaiveDate>,
    pub(super) authorization_notes: Option<String>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetUploadCreate {
    pub(super) file_name: String,
    pub(super) file_ext: String,
    pub(super) content_type: String,
    pub(super) file_size_bytes: Option<i64>,
    pub(super) title: String,
    pub(super) title_source: String,
    pub(super) platform: Option<String>,
    pub(super) platform_names: Vec<String>,
    pub(super) product_name: Option<String>,
    pub(super) product_names: Vec<String>,
    pub(super) sku_names: Vec<String>,
    pub(super) creator_name: Option<String>,
    pub(super) video_type: Option<String>,
    pub(super) content_scene: Option<String>,
    pub(super) content_scene_group: Option<String>,
    pub(super) content_scene_subtype: Option<String>,
    pub(super) owner_name: Option<String>,
    pub(super) owner_user_id: Option<String>,
    pub(super) raw_sha256: Option<String>,
    pub(super) tags: Vec<String>,
    pub(super) tags_source: String,
    pub(super) notes: Option<String>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetUploadComplete {
    pub(super) file_size_bytes: Option<i64>,
    pub(super) raw_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetUploadCreateRequest {
    #[serde(rename = "fileName")]
    pub(super) file_name: String,
    #[serde(rename = "contentType")]
    pub(super) content_type: Option<String>,
    #[serde(rename = "fileSizeBytes")]
    pub(super) file_size_bytes: Option<i64>,
    pub(super) title: Option<String>,
    pub(super) platform: Option<String>,
    #[serde(rename = "platformNames")]
    pub(super) platform_names: Option<Vec<String>>,
    #[serde(rename = "productName")]
    pub(super) product_name: Option<String>,
    #[serde(rename = "productNames")]
    pub(super) product_names: Option<Vec<String>>,
    #[serde(rename = "skuNames")]
    pub(super) sku_names: Option<Vec<String>>,
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
    #[serde(rename = "rawSha256")]
    pub(super) raw_sha256: Option<String>,
    pub(super) tags: Option<Vec<String>>,
    pub(super) notes: Option<String>,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetUploadCreateResponse {
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    pub(super) bucket: String,
    #[serde(rename = "objectKey")]
    pub(super) object_key: String,
    #[serde(rename = "uploadUrl")]
    pub(super) upload_url: String,
    pub(super) method: String,
    #[serde(rename = "expiresAt")]
    pub(super) expires_at: String,
    pub(super) headers: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetUploadCompleteRequest {
    #[serde(rename = "fileSizeBytes")]
    pub(super) file_size_bytes: Option<i64>,
    #[serde(rename = "rawSha256")]
    pub(super) raw_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetDouyinVideoIdResolveRequest {
    pub(super) input: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetVideoLinkPreviewRequest {
    pub(super) input: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetVideoLinkImportRequest {
    pub(super) input: String,
    #[serde(rename = "candidateIndex")]
    pub(super) candidate_index: Option<usize>,
    pub(super) title: Option<String>,
    pub(super) platform: Option<String>,
    #[serde(rename = "platformNames")]
    pub(super) platform_names: Option<Vec<String>>,
    #[serde(rename = "productName")]
    pub(super) product_name: Option<String>,
    #[serde(rename = "productNames")]
    pub(super) product_names: Option<Vec<String>>,
    #[serde(rename = "skuNames")]
    pub(super) sku_names: Option<Vec<String>>,
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
    pub(super) tags: Option<Vec<String>>,
    pub(super) notes: Option<String>,
    #[serde(rename = "externalVideoId")]
    pub(super) external_video_id: Option<String>,
    #[serde(rename = "externalItemId")]
    pub(super) external_item_id: Option<String>,
    #[serde(rename = "externalNoteId")]
    pub(super) external_note_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetPlatformVideoCreateRequest {
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
    pub(super) publish_status: Option<String>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetPlatformVideoCreate {
    pub(super) platform: String,
    pub(super) account_id: Option<String>,
    pub(super) account_name: Option<String>,
    pub(super) advertiser_id: Option<String>,
    pub(super) external_video_id: Option<String>,
    pub(super) external_item_id: Option<String>,
    pub(super) external_note_id: Option<String>,
    pub(super) external_url: Option<String>,
    pub(super) publish_title: Option<String>,
    pub(super) publish_status: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct ContentAssetAdMaterialCreateRequest {
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
    pub(super) material_status: Option<String>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetAdMaterialCreate {
    pub(super) platform_video_id: Option<Uuid>,
    pub(super) ad_platform: String,
    pub(super) account_id: Option<String>,
    pub(super) account_name: Option<String>,
    pub(super) advertiser_id: Option<String>,
    pub(super) external_material_id: String,
    pub(super) external_video_id: Option<String>,
    pub(super) material_name: Option<String>,
    pub(super) material_title: Option<String>,
    pub(super) material_status: String,
}
