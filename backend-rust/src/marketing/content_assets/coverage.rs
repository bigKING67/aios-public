use serde::Serialize;
use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Default, Clone)]
pub(super) struct ContentAssetCoverageResponse {
    #[serde(rename = "totalAssets")]
    pub(super) total_assets: i64,
    #[serde(rename = "readyAssets")]
    pub(super) ready_assets: i64,
    #[serde(rename = "rawReadyAssets")]
    pub(super) raw_ready_assets: i64,
    #[serde(rename = "previewReadyAssets")]
    pub(super) preview_ready_assets: i64,
    #[serde(rename = "coverReadyAssets")]
    pub(super) cover_ready_assets: i64,
    #[serde(rename = "aiAnalyzedAssets")]
    pub(super) ai_analyzed_assets: i64,
    #[serde(rename = "transcriptReadyAssets")]
    pub(super) transcript_ready_assets: i64,
    #[serde(rename = "platformBoundAssets")]
    pub(super) platform_bound_assets: i64,
    #[serde(rename = "adMaterialBoundAssets")]
    pub(super) ad_material_bound_assets: i64,
    #[serde(rename = "authorizationKnownAssets")]
    pub(super) authorization_known_assets: i64,
    #[serde(rename = "repurposeKnownAssets")]
    pub(super) repurpose_known_assets: i64,
    #[serde(rename = "externalOnlyAssets")]
    pub(super) external_only_assets: i64,
    #[serde(rename = "pendingAssets")]
    pub(super) pending_assets: i64,
    #[serde(rename = "failedAssets")]
    pub(super) failed_assets: i64,
    #[serde(rename = "totalRawSizeBytes")]
    pub(super) total_raw_size_bytes: i64,
    #[serde(rename = "analysisFailedJobs")]
    pub(super) analysis_failed_jobs: i64,
    #[serde(rename = "transcriptFailedJobs")]
    pub(super) transcript_failed_jobs: i64,
    #[serde(rename = "latestUpdatedAt")]
    pub(super) latest_updated_at: Option<String>,
}

pub(super) async fn query_content_asset_coverage(
    pool: &PgPool,
) -> AppResult<ContentAssetCoverageResponse> {
    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*)::BIGINT AS total_assets,
          COUNT(*) FILTER (WHERE asset.asset_status = 'ready')::BIGINT AS ready_assets,
          COUNT(*) FILTER (WHERE asset.raw_object_key IS NOT NULL)::BIGINT AS raw_ready_assets,
          COUNT(*) FILTER (WHERE asset.preview_object_key IS NOT NULL)::BIGINT AS preview_ready_assets,
          COUNT(*) FILTER (WHERE asset.cover_object_key IS NOT NULL)::BIGINT AS cover_ready_assets,
          COUNT(*) FILTER (
            WHERE asset.ai_analyzed_at IS NOT NULL OR asset.analysis_object_key IS NOT NULL
          )::BIGINT AS ai_analyzed_assets,
          COUNT(*) FILTER (
            WHERE asset.transcribed_at IS NOT NULL
              OR asset.transcript_object_key IS NOT NULL
              OR NULLIF(asset.script_excerpt, '') IS NOT NULL
          )::BIGINT AS transcript_ready_assets,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM ads.marketing_content_platform_videos video
              WHERE video.asset_id = asset.asset_id AND video.relation_status = 'active'
            )
          )::BIGINT AS platform_bound_assets,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM ads.marketing_content_ad_materials material
              WHERE material.asset_id = asset.asset_id AND material.relation_status = 'active'
            )
            OR EXISTS (
              SELECT 1
              FROM ads.marketing_content_platform_videos video
              WHERE video.asset_id = asset.asset_id
                AND video.relation_status = 'active'
                AND video.platform = 'douyin'
                AND NULLIF(BTRIM(video.external_item_id), '') IS NOT NULL
            )
          )::BIGINT AS ad_material_bound_assets,
          COUNT(*) FILTER (
            WHERE asset.authorization_status <> 'unknown'
              OR asset.commercial_use_allowed IS NOT NULL
              OR asset.authorization_expires_at IS NOT NULL
          )::BIGINT AS authorization_known_assets,
          COUNT(*) FILTER (WHERE asset.repurpose_allowed IS NOT NULL)::BIGINT AS repurpose_known_assets,
          COUNT(*) FILTER (WHERE asset.external_only = TRUE)::BIGINT AS external_only_assets,
          COUNT(*) FILTER (WHERE asset.asset_status IN ('pending_processing', 'processing'))::BIGINT AS pending_assets,
          COUNT(*) FILTER (WHERE asset.asset_status = 'failed')::BIGINT AS failed_assets,
          COALESCE(SUM(asset.file_size_bytes), 0)::BIGINT AS total_raw_size_bytes,
          (
            SELECT COUNT(*)::BIGINT
            FROM ads.marketing_content_asset_processing_jobs job
            JOIN ads.marketing_content_assets job_asset ON job_asset.asset_id = job.asset_id
            WHERE job.job_type = 'analysis'
              AND job.status = 'failed'
              AND job_asset.is_deleted = FALSE
          ) AS analysis_failed_jobs,
          (
            SELECT COUNT(*)::BIGINT
            FROM ads.marketing_content_asset_processing_jobs job
            JOIN ads.marketing_content_assets job_asset ON job_asset.asset_id = job.asset_id
            WHERE job.job_type = 'transcript'
              AND job.status = 'failed'
              AND job_asset.is_deleted = FALSE
          ) AS transcript_failed_jobs,
          MAX(asset.updated_at)::TEXT AS latest_updated_at
        FROM ads.marketing_content_assets asset
        WHERE asset.is_deleted = FALSE
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "query marketing content asset coverage failed");
        AppError::Internal
    })?;

    Ok(ContentAssetCoverageResponse {
        total_assets: row.try_get("total_assets").unwrap_or(0),
        ready_assets: row.try_get("ready_assets").unwrap_or(0),
        raw_ready_assets: row.try_get("raw_ready_assets").unwrap_or(0),
        preview_ready_assets: row.try_get("preview_ready_assets").unwrap_or(0),
        cover_ready_assets: row.try_get("cover_ready_assets").unwrap_or(0),
        ai_analyzed_assets: row.try_get("ai_analyzed_assets").unwrap_or(0),
        transcript_ready_assets: row.try_get("transcript_ready_assets").unwrap_or(0),
        platform_bound_assets: row.try_get("platform_bound_assets").unwrap_or(0),
        ad_material_bound_assets: row.try_get("ad_material_bound_assets").unwrap_or(0),
        authorization_known_assets: row.try_get("authorization_known_assets").unwrap_or(0),
        repurpose_known_assets: row.try_get("repurpose_known_assets").unwrap_or(0),
        external_only_assets: row.try_get("external_only_assets").unwrap_or(0),
        pending_assets: row.try_get("pending_assets").unwrap_or(0),
        failed_assets: row.try_get("failed_assets").unwrap_or(0),
        total_raw_size_bytes: row.try_get("total_raw_size_bytes").unwrap_or(0),
        analysis_failed_jobs: row.try_get("analysis_failed_jobs").unwrap_or(0),
        transcript_failed_jobs: row.try_get("transcript_failed_jobs").unwrap_or(0),
        latest_updated_at: row.try_get("latest_updated_at").ok(),
    })
}
