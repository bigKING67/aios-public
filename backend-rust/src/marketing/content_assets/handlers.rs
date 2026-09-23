use std::{sync::Arc, time::Duration};

use axum::{
    extract::{Path, Query, State},
    routing::{get, patch, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::Value;
use tracing::error;
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    asset_lookup::list_asset_lookup,
    asset_mutations::{create_manual_upload_asset, update_asset_profile, ManualUploadActor},
    coverage::{query_content_asset_coverage, ContentAssetCoverageResponse},
    delivery::{build_object_read_url, build_playback_url, build_upload_url},
    douyin_video_link::{preview_video_links, resolve_douyin_video_id},
    handler_support::{
        attach_cover_urls, build_delivery_health, build_raw_object_key, build_storage_health,
        duplicate_asset_conflict, with_detail_delivery_urls,
    },
    identity_mutations::{
        bind_unmatched_stats, create_ad_material, create_platform_video, update_ad_material,
        update_platform_video,
    },
    mutation_types::{
        ContentAssetAdMaterialCreateRequest, ContentAssetAiJobBackfillRequest,
        ContentAssetAiJobBackfillResponse, ContentAssetAnalysisJobCreateRequest,
        ContentAssetDouyinVideoIdResolveRequest, ContentAssetPlatformVideoCreateRequest,
        ContentAssetProfileUpdateRequest, ContentAssetTranscriptJobCreateRequest,
        ContentAssetUploadCompleteRequest, ContentAssetUploadCreateRequest,
        ContentAssetUploadCreateResponse, ContentAssetVideoLinkImportRequest,
        ContentAssetVideoLinkPreviewRequest, NormalizedContentAssetUploadComplete,
    },
    performance_daily::get_asset_performance_daily,
    permissions::{
        attach_asset_permissions, ensure_content_asset_edit_permission,
        ensure_content_asset_manage_permission, ensure_content_asset_owner_option,
        ensure_content_asset_read_permission, ensure_content_asset_upload_permission,
    },
    prefect_trigger::spawn_processing_job_prefect_trigger,
    processing_mutations::{
        backfill_ai_processing_jobs, backfill_derivative_processing_jobs, cancel_processing_job,
        complete_manual_upload_asset, create_analysis_processing_job,
        create_transcript_processing_job, reset_stale_processing_job, retry_processing_job,
    },
    repository::{
        count_assets, create_import_run, query_asset_by_id, query_assets,
        query_content_asset_health, query_duplicate_asset_by_sha256, query_filter_options,
        query_import_runs, query_processing_job_by_id, query_processing_job_summary,
        query_processing_jobs, query_summary, query_unmatched_stats,
    },
    repository_detail::query_asset_detail,
    source_upload::create_source_upload_request,
    types::{
        ContentAssetAnalysisResultResponse, ContentAssetDouyinVideoIdResolveResponse,
        ContentAssetFilterOptions, ContentAssetHealthResponse, ContentAssetListResponse,
        ContentAssetProcessingJob, ContentAssetProcessingJobBackfillRequest,
        ContentAssetProcessingJobBackfillResponse, ContentAssetProcessingJobListResponse,
        ContentAssetProcessingJobQuery, ContentAssetQuery, ContentAssetSummary,
        ContentAssetUnmatchedStatsBindRequest, ContentAssetUnmatchedStatsBindResponse,
        ContentAssetUnmatchedStatsQuery, ContentAssetUnmatchedStatsResponse,
        ContentAssetVideoLinkImportResponse, ContentAssetVideoLinkPreviewCandidateResponse,
        ContentAssetVideoLinkPreviewResponse, ImportRunCreateRequest, ImportRunCreateResponse,
        ImportRunListResponse, PlaybackUrlRequest, PlaybackUrlResponse,
    },
    upload_verification::verify_raw_upload_sha256,
    validation::{
        normalize_ad_material_create, normalize_ai_job_backfill, normalize_analysis_job_create,
        normalize_import_mode, normalize_platform_video_create, normalize_processing_job_query,
        normalize_profile_update, normalize_query, normalize_sheet_ids,
        normalize_transcript_job_create, normalize_unmatched_stats_query,
        normalize_upload_complete, normalize_upload_create,
    },
    video_link_import::import_content_asset_from_video_link,
    video_link_material_suggestion::query_qianchuan_material_suggestion_for_video,
};

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(get_content_asset_health))
        .route("/summary", get(get_summary))
        .route("/coverage", get(get_coverage))
        .route("/filter-options", get(get_filter_options))
        .route(
            "/unmatched-stats",
            get(list_unmatched_stats).post(post_unmatched_stats_bind),
        )
        .route("/processing-jobs", get(list_processing_jobs))
        .route(
            "/processing-jobs/backfill-derivatives",
            post(post_processing_jobs_backfill_derivatives),
        )
        .route(
            "/processing-jobs/backfill-ai",
            post(post_processing_jobs_backfill_ai),
        )
        .route(
            "/processing-jobs/{job_id}/retry",
            post(post_processing_job_retry),
        )
        .route(
            "/processing-jobs/{job_id}/cancel",
            post(post_processing_job_cancel),
        )
        .route(
            "/processing-jobs/{job_id}/reset-stale",
            post(post_processing_job_reset_stale),
        )
        .route("/uploads", post(create_upload_request))
        .route(
            "/uploads/{asset_id}/complete",
            post(complete_upload_request),
        )
        .route(
            "/douyin-video-id/resolve",
            post(post_douyin_video_id_resolve),
        )
        .route("/video-link/preview", post(post_video_link_preview))
        .route("/video-link/import", post(post_video_link_import))
        .route("/assets", get(list_assets))
        .route("/assets/lookup", get(list_asset_lookup))
        .route(
            "/assets/{asset_id}",
            get(get_asset_detail).patch(patch_asset_profile),
        )
        .route(
            "/assets/{asset_id}/performance/daily",
            get(get_asset_performance_daily),
        )
        .route(
            "/assets/{asset_id}/source-upload",
            post(create_source_upload_request),
        )
        .route(
            "/assets/{asset_id}/analysis-result",
            get(get_asset_analysis_result),
        )
        .route("/assets/{asset_id}/playback-url", post(create_playback_url))
        .route(
            "/assets/{asset_id}/analysis-jobs",
            post(post_asset_analysis_job),
        )
        .route(
            "/assets/{asset_id}/transcript-jobs",
            post(post_asset_transcript_job),
        )
        .route(
            "/assets/{asset_id}/platform-videos",
            post(post_platform_video),
        )
        .route(
            "/assets/{asset_id}/platform-videos/{platform_video_id}",
            patch(patch_platform_video),
        )
        .route("/assets/{asset_id}/ad-materials", post(post_ad_material))
        .route(
            "/assets/{asset_id}/ad-materials/{ad_material_id}",
            patch(patch_ad_material),
        )
        .route(
            "/import-runs",
            get(list_import_runs).post(create_import_request),
        )
}

async fn get_content_asset_health(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<ContentAssetHealthResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    let (database, assets, jobs) = query_content_asset_health(&state.pool).await?;
    let storage = build_storage_health(state.settings.as_ref());
    let delivery = build_delivery_health(state.settings.as_ref(), storage.status == "ok");
    let status = if database.status == "ok" && storage.status == "ok" && delivery.status == "ok" {
        "ok"
    } else {
        "degraded"
    };
    Ok(Json(ContentAssetHealthResponse {
        status: status.to_string(),
        checked_at: Utc::now().to_rfc3339(),
        database,
        storage,
        delivery,
        assets,
        jobs,
    }))
}

async fn create_upload_request(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<ContentAssetUploadCreateRequest>,
) -> AppResult<Json<ContentAssetUploadCreateResponse>> {
    ensure_content_asset_upload_permission(&current_user)?;
    let normalized = normalize_upload_create(payload)?;
    ensure_content_asset_owner_option(&state.pool, normalized.owner_user_id.as_deref()).await?;
    if let Some(raw_sha256) = normalized.raw_sha256.as_deref() {
        if let Some(duplicate) =
            query_duplicate_asset_by_sha256(&state.pool, raw_sha256, None).await?
        {
            return Err(duplicate_asset_conflict(&duplicate));
        }
    }
    let asset_id = Uuid::new_v4();
    let object_key = build_raw_object_key(asset_id, &normalized.file_ext);
    let upload = build_upload_url(&state.settings, &object_key, &normalized.content_type)?;
    create_manual_upload_asset(
        &state.pool,
        asset_id,
        &state.settings.tos_bucket,
        &state.settings.tos_region,
        &object_key,
        normalized,
        ManualUploadActor {
            username: current_user.username.as_deref(),
            user_id: Some(current_user.user_id.as_str()),
        },
    )
    .await?;
    Ok(Json(ContentAssetUploadCreateResponse {
        asset_id,
        bucket: state.settings.tos_bucket.clone(),
        object_key,
        upload_url: upload.url,
        method: "PUT".to_string(),
        expires_at: upload.expires_at,
        headers: upload.headers,
    }))
}

async fn complete_upload_request(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<ContentAssetUploadCompleteRequest>,
) -> AppResult<Json<super::types::ContentAssetDetailResponse>> {
    let normalized = normalize_upload_complete(payload)?;
    ensure_content_asset_edit_permission(&state.pool, &current_user, asset_id).await?;
    let verified = verify_raw_upload_sha256(
        &state.pool,
        &state.http_client,
        state.settings.as_ref(),
        asset_id,
        normalized.raw_sha256.as_deref(),
    )
    .await?;
    if let Some(duplicate) =
        query_duplicate_asset_by_sha256(&state.pool, &verified.sha256, Some(asset_id)).await?
    {
        return Err(duplicate_asset_conflict(&duplicate));
    }
    let verified_payload = NormalizedContentAssetUploadComplete {
        file_size_bytes: Some(verified.size_bytes),
        raw_sha256: Some(verified.sha256),
    };
    let queued_jobs = complete_manual_upload_asset(
        &state.pool,
        asset_id,
        verified_payload,
        current_user.username.as_deref(),
    )
    .await?;
    for job in queued_jobs {
        spawn_processing_job_prefect_trigger(
            Arc::clone(&state),
            asset_id,
            job.job_id,
            job.job_type.as_str(),
        );
    }
    Ok(Json(with_detail_delivery_urls(
        query_asset_detail(&state.pool, asset_id).await?,
        state.settings.as_ref(),
        &current_user,
    )))
}

async fn post_douyin_video_id_resolve(
    current_user: CurrentUser,
    Json(payload): Json<ContentAssetDouyinVideoIdResolveRequest>,
) -> AppResult<Json<ContentAssetDouyinVideoIdResolveResponse>> {
    ensure_content_asset_upload_permission(&current_user)?;
    let resolved = tokio::time::timeout(
        Duration::from_secs(8),
        resolve_douyin_video_id(payload.input.as_str()),
    )
    .await
    .map_err(|_| AppError::bad_request("抖音短链解析超时，请稍后重试或手动填写抖音视频ID"))??;

    Ok(Json(ContentAssetDouyinVideoIdResolveResponse {
        source_url: resolved.source_url,
        resolved_url: resolved.resolved_url,
        external_video_id: resolved.external_video_id,
    }))
}

async fn post_video_link_preview(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<ContentAssetVideoLinkPreviewRequest>,
) -> AppResult<Json<ContentAssetVideoLinkPreviewResponse>> {
    ensure_content_asset_upload_permission(&current_user)?;
    let candidates = tokio::time::timeout(
        Duration::from_secs(10),
        preview_video_links(payload.input.as_str()),
    )
    .await
    .map_err(|_| AppError::bad_request("视频链接解析超时，请稍后重试或手动填写素材ID"))??;

    let mut response_candidates = Vec::with_capacity(candidates.len());
    for candidate in candidates {
        let qianchuan_material_suggestion = if let Some(external_video_id) =
            candidate.external_video_id.as_deref()
        {
            query_qianchuan_material_suggestion_for_video(&state.pool, external_video_id).await?
        } else {
            None
        };
        response_candidates.push(ContentAssetVideoLinkPreviewCandidateResponse {
            source_type: candidate.source_type.as_str().to_string(),
            source_url: candidate.source_url,
            resolved_url: candidate.resolved_url,
            external_video_id: candidate.external_video_id,
            external_item_id: candidate.external_item_id,
            qianchuan_material_suggestion,
        });
    }

    Ok(Json(ContentAssetVideoLinkPreviewResponse {
        candidates: response_candidates,
    }))
}

async fn post_video_link_import(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<ContentAssetVideoLinkImportRequest>,
) -> AppResult<Json<ContentAssetVideoLinkImportResponse>> {
    Ok(Json(
        import_content_asset_from_video_link(&state, &current_user, payload).await?,
    ))
}

async fn get_summary(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<ContentAssetSummary>> {
    ensure_content_asset_read_permission(&current_user)?;
    Ok(Json(query_summary(&state.pool).await?))
}

async fn get_coverage(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<ContentAssetCoverageResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    Ok(Json(query_content_asset_coverage(&state.pool).await?))
}

async fn get_filter_options(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<ContentAssetFilterOptions>> {
    ensure_content_asset_read_permission(&current_user)?;
    Ok(Json(query_filter_options(&state.pool).await?))
}

async fn list_unmatched_stats(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<ContentAssetUnmatchedStatsQuery>,
) -> AppResult<Json<ContentAssetUnmatchedStatsResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    let normalized = normalize_unmatched_stats_query(query)?;
    Ok(Json(query_unmatched_stats(&state.pool, &normalized).await?))
}

async fn post_unmatched_stats_bind(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<ContentAssetUnmatchedStatsBindRequest>,
) -> AppResult<Json<ContentAssetUnmatchedStatsBindResponse>> {
    ensure_content_asset_edit_permission(&state.pool, &current_user, payload.asset_id).await?;
    Ok(Json(
        bind_unmatched_stats(&state.pool, payload, current_user.username.as_deref()).await?,
    ))
}

async fn list_processing_jobs(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<ContentAssetProcessingJobQuery>,
) -> AppResult<Json<ContentAssetProcessingJobListResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    let normalized = normalize_processing_job_query(query)?;
    let (items, summary) = tokio::try_join!(
        query_processing_jobs(&state.pool, &normalized),
        query_processing_job_summary(&state.pool, Some(&normalized)),
    )?;
    Ok(Json(ContentAssetProcessingJobListResponse {
        items,
        summary,
    }))
}

async fn post_processing_jobs_backfill_derivatives(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<ContentAssetProcessingJobBackfillRequest>,
) -> AppResult<Json<ContentAssetProcessingJobBackfillResponse>> {
    ensure_content_asset_manage_permission(&current_user)?;
    let limit = payload.limit.unwrap_or(100);
    if !(1..=500).contains(&limit) {
        return Err(AppError::bad_request("limit 必须在 1 到 500 之间"));
    }
    Ok(Json(
        backfill_derivative_processing_jobs(&state.pool, limit, current_user.username.as_deref())
            .await?,
    ))
}

async fn post_processing_jobs_backfill_ai(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<ContentAssetAiJobBackfillRequest>,
) -> AppResult<Json<ContentAssetAiJobBackfillResponse>> {
    ensure_content_asset_manage_permission(&current_user)?;
    let normalized = normalize_ai_job_backfill(payload)?;
    Ok(Json(
        backfill_ai_processing_jobs(&state.pool, normalized, current_user.username.as_deref())
            .await?,
    ))
}

async fn post_processing_job_retry(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(job_id): Path<Uuid>,
) -> AppResult<Json<ContentAssetProcessingJob>> {
    let job = query_processing_job_by_id(&state.pool, job_id)
        .await?
        .ok_or(AppError::NotFound)?;
    ensure_content_asset_edit_permission(&state.pool, &current_user, job.asset_id).await?;
    let asset_id = job.asset_id;
    let job_type = job.job_type.clone();
    retry_processing_job(&state.pool, job_id, current_user.username.as_deref()).await?;
    spawn_processing_job_prefect_trigger(Arc::clone(&state), asset_id, job_id, job_type.as_str());
    let job = query_processing_job_by_id(&state.pool, job_id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(job))
}

async fn post_processing_job_cancel(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(job_id): Path<Uuid>,
) -> AppResult<Json<ContentAssetProcessingJob>> {
    let job = query_processing_job_by_id(&state.pool, job_id)
        .await?
        .ok_or(AppError::NotFound)?;
    ensure_content_asset_edit_permission(&state.pool, &current_user, job.asset_id).await?;
    cancel_processing_job(&state.pool, job_id, current_user.username.as_deref()).await?;
    let job = query_processing_job_by_id(&state.pool, job_id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(job))
}

async fn post_processing_job_reset_stale(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(job_id): Path<Uuid>,
) -> AppResult<Json<ContentAssetProcessingJob>> {
    ensure_content_asset_manage_permission(&current_user)?;
    reset_stale_processing_job(&state.pool, job_id, current_user.username.as_deref()).await?;
    let job = query_processing_job_by_id(&state.pool, job_id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(job))
}

async fn list_assets(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<ContentAssetQuery>,
) -> AppResult<Json<ContentAssetListResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    let normalized = normalize_query(query)?;
    let (total, mut items, summary, filter_options) = tokio::try_join!(
        count_assets(&state.pool, &normalized),
        query_assets(&state.pool, &normalized),
        query_summary(&state.pool),
        query_filter_options(&state.pool),
    )?;
    attach_cover_urls(&mut items, state.settings.as_ref());
    attach_asset_permissions(&mut items, &current_user);
    Ok(Json(ContentAssetListResponse {
        items,
        total,
        page: normalized.page,
        page_size: normalized.page_size,
        summary,
        filter_options,
    }))
}

async fn get_asset_detail(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
) -> AppResult<Json<super::types::ContentAssetDetailResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    Ok(Json(with_detail_delivery_urls(
        query_asset_detail(&state.pool, asset_id).await?,
        state.settings.as_ref(),
        &current_user,
    )))
}

async fn get_asset_analysis_result(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Query(query): Query<ContentAssetAnalysisResultQuery>,
) -> AppResult<Json<ContentAssetAnalysisResultResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    let detail = query_asset_detail(&state.pool, asset_id).await?;
    let analysis_object = detail
        .objects
        .iter()
        .find(|object| {
            object.object_role == "analysis"
                && object.status == "active"
                && query
                    .object_key
                    .as_ref()
                    .map(|object_key| object.object_key == *object_key)
                    .unwrap_or(true)
        })
        .ok_or(AppError::NotFound)?;
    let object_url = build_object_read_url(&state.settings, &analysis_object.object_key)?;
    let response = state
        .http_client
        .get(&object_url)
        .send()
        .await
        .map_err(|error| {
            error!(?error, %asset_id, object_key = %analysis_object.object_key, "fetch content asset analysis object failed");
            AppError::Internal
        })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::NotFound);
    }
    if !response.status().is_success() {
        error!(
            status = %response.status(),
            %asset_id,
            object_key = %analysis_object.object_key,
            "content asset analysis object returned non-success status",
        );
        return Err(AppError::Internal);
    }
    let document = response.json::<Value>().await.map_err(|error| {
        error!(?error, %asset_id, object_key = %analysis_object.object_key, "parse content asset analysis object failed");
        AppError::Internal
    })?;
    Ok(Json(ContentAssetAnalysisResultResponse {
        object_key: analysis_object.object_key.clone(),
        generated_at: analysis_object.created_at.clone(),
        metadata: analysis_object.metadata.clone(),
        document,
    }))
}

#[derive(Debug, Deserialize)]
struct ContentAssetAnalysisResultQuery {
    #[serde(rename = "objectKey")]
    object_key: Option<String>,
}

async fn create_playback_url(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<PlaybackUrlRequest>,
) -> AppResult<Json<PlaybackUrlResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    let asset = query_asset_by_id(&state.pool, asset_id)
        .await?
        .ok_or(crate::error::AppError::NotFound)?;
    Ok(Json(build_playback_url(
        &state.settings,
        &asset,
        payload.variant,
    )?))
}

async fn post_asset_analysis_job(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<ContentAssetAnalysisJobCreateRequest>,
) -> AppResult<Json<ContentAssetProcessingJob>> {
    ensure_content_asset_edit_permission(&state.pool, &current_user, asset_id).await?;
    let normalized = normalize_analysis_job_create(payload)?;
    let job_id = create_analysis_processing_job(
        &state.pool,
        asset_id,
        normalized,
        current_user.username.as_deref(),
    )
    .await?;
    spawn_processing_job_prefect_trigger(Arc::clone(&state), asset_id, job_id, "analysis");
    let job = query_processing_job_by_id(&state.pool, job_id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(job))
}

async fn post_asset_transcript_job(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<ContentAssetTranscriptJobCreateRequest>,
) -> AppResult<Json<ContentAssetProcessingJob>> {
    ensure_content_asset_edit_permission(&state.pool, &current_user, asset_id).await?;
    let normalized = normalize_transcript_job_create(payload)?;
    let job_id = create_transcript_processing_job(
        &state.pool,
        asset_id,
        normalized,
        current_user.username.as_deref(),
    )
    .await?;
    spawn_processing_job_prefect_trigger(Arc::clone(&state), asset_id, job_id, "transcript");
    let job = query_processing_job_by_id(&state.pool, job_id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(job))
}

async fn patch_asset_profile(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<ContentAssetProfileUpdateRequest>,
) -> AppResult<Json<super::types::ContentAssetDetailResponse>> {
    ensure_content_asset_edit_permission(&state.pool, &current_user, asset_id).await?;
    let normalized = normalize_profile_update(payload)?;
    ensure_content_asset_owner_option(&state.pool, normalized.owner_user_id.as_deref()).await?;
    update_asset_profile(
        &state.pool,
        asset_id,
        normalized,
        current_user.username.as_deref(),
    )
    .await?;
    Ok(Json(with_detail_delivery_urls(
        query_asset_detail(&state.pool, asset_id).await?,
        state.settings.as_ref(),
        &current_user,
    )))
}

async fn post_platform_video(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<ContentAssetPlatformVideoCreateRequest>,
) -> AppResult<Json<super::types::ContentAssetDetailResponse>> {
    ensure_content_asset_edit_permission(&state.pool, &current_user, asset_id).await?;
    let normalized = normalize_platform_video_create(payload)?;
    create_platform_video(
        &state.pool,
        asset_id,
        normalized,
        current_user.username.as_deref(),
    )
    .await?;
    Ok(Json(with_detail_delivery_urls(
        query_asset_detail(&state.pool, asset_id).await?,
        state.settings.as_ref(),
        &current_user,
    )))
}

async fn patch_platform_video(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path((asset_id, platform_video_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ContentAssetPlatformVideoCreateRequest>,
) -> AppResult<Json<super::types::ContentAssetDetailResponse>> {
    ensure_content_asset_edit_permission(&state.pool, &current_user, asset_id).await?;
    let normalized = normalize_platform_video_create(payload)?;
    update_platform_video(
        &state.pool,
        asset_id,
        platform_video_id,
        normalized,
        current_user.username.as_deref(),
    )
    .await?;
    Ok(Json(with_detail_delivery_urls(
        query_asset_detail(&state.pool, asset_id).await?,
        state.settings.as_ref(),
        &current_user,
    )))
}

async fn post_ad_material(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<ContentAssetAdMaterialCreateRequest>,
) -> AppResult<Json<super::types::ContentAssetDetailResponse>> {
    ensure_content_asset_edit_permission(&state.pool, &current_user, asset_id).await?;
    let normalized = normalize_ad_material_create(payload)?;
    create_ad_material(
        &state.pool,
        asset_id,
        normalized,
        current_user.username.as_deref(),
    )
    .await?;
    Ok(Json(with_detail_delivery_urls(
        query_asset_detail(&state.pool, asset_id).await?,
        state.settings.as_ref(),
        &current_user,
    )))
}

async fn patch_ad_material(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path((asset_id, ad_material_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ContentAssetAdMaterialCreateRequest>,
) -> AppResult<Json<super::types::ContentAssetDetailResponse>> {
    ensure_content_asset_edit_permission(&state.pool, &current_user, asset_id).await?;
    let normalized = normalize_ad_material_create(payload)?;
    update_ad_material(
        &state.pool,
        asset_id,
        ad_material_id,
        normalized,
        current_user.username.as_deref(),
    )
    .await?;
    Ok(Json(with_detail_delivery_urls(
        query_asset_detail(&state.pool, asset_id).await?,
        state.settings.as_ref(),
        &current_user,
    )))
}

async fn list_import_runs(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<ImportRunListResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    Ok(Json(ImportRunListResponse {
        items: query_import_runs(&state.pool).await?,
    }))
}

async fn create_import_request(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<ImportRunCreateRequest>,
) -> AppResult<Json<ImportRunCreateResponse>> {
    ensure_content_asset_upload_permission(&current_user)?;
    let mode = normalize_import_mode(payload.mode)?;
    let run_id = Uuid::new_v4();
    let source_url = payload.source_url.unwrap_or_else(|| {
        "https://example.invalid/feishu-source?sheet=sheet001".to_string()
    });
    let sheet_ids = normalize_sheet_ids(payload.sheet_ids);
    create_import_run(
        &state.pool,
        run_id,
        mode.as_str(),
        source_url.as_str(),
        payload.spreadsheet_token.as_deref(),
        sheet_ids,
        current_user.username.as_deref(),
    )
    .await?;
    Ok(Json(ImportRunCreateResponse {
        run_id,
        mode,
        status: "requested".to_string(),
        message: "已记录导入请求；实际 dry-run/sample-upload/full-upload 请由 Prefect 或 CLI worker 执行。".to_string(),
    }))
}

#[cfg(test)]
pub(crate) mod qianchuan_http_route_tests;
