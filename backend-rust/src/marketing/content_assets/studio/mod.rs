//! AI 创作中心 backend: versioned segment presets and segment assets that
//! reference raw library assets. Gated by `CONTENT_AI_STUDIO_ENABLED`; write
//! and batch visibility rules follow `access::StudioAccess`.
mod access;
mod asset_summaries;
mod domain;
mod error;
mod overview;
mod overview_types;
mod remix;
mod remix_cancel;
mod remix_combos;
mod remix_edit;
mod remix_read;
mod remix_types;
mod repository;
mod suggestions;
mod types;

use super::permissions::{
    ensure_content_asset_read_permission, ensure_content_asset_upload_permission,
};
use crate::{
    auth::CurrentUser,
    config::Settings,
    error::{AppError, AppResult},
    state::AppState,
};
use access::StudioAccess;
use axum::{
    extract::{Path, Query, State},
    routing::{get, patch, post},
    Json, Router,
};
use error::StudioResult;
use remix_types::{
    CreateRemixBatchRequest, CreateRemixEditRequest, RemixBatchDetail, RemixBatchListResponse,
    RemixBatchPreviewRequest, RemixBatchPreviewResponse, RemixEditCheckRequest,
    RemixEditCheckResponse, RemixProductListQuery, RemixProductListResponse,
};
use std::sync::Arc;
use types::{
    AssetSegmentSummaryListResponse, AssetSegmentSummaryQuery, ConfirmContentSegmentsRequest,
    ConfirmContentSegmentsResponse, ContentSegment, ContentSegmentListQuery,
    ContentSegmentListResponse, CreateContentSegmentRequest, CreateSegmentSuggestionsRequest,
    CreateSegmentSuggestionsResponse, SegmentPoolQuery, SegmentPoolResponse,
    SegmentPresetListResponse, SegmentSuggestionJob, SegmentSuggestionJobListQuery,
    SegmentSuggestionJobListResponse, StudioCapabilitiesResponse, UpdateContentSegmentRequest,
};
use uuid::Uuid;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/studio/capabilities", get(capabilities))
        .route("/studio/presets", get(presets))
        .route("/studio/overview", get(studio_overview))
        .route(
            "/studio/asset-segment-summaries",
            get(asset_segment_summaries),
        )
        .route("/studio/segment-pool", get(segment_pool))
        .route("/studio/segments", get(list_segments).post(create_segment))
        .route("/studio/segments:confirm", post(confirm_segments))
        .route("/studio/segments/{segment_id}", patch(update_segment))
        .route(
            "/studio/segment-suggestions",
            get(list_suggestion_jobs).post(create_suggestion_jobs),
        )
        .route(
            "/studio/segment-suggestions/{job_id}",
            get(get_suggestion_job),
        )
        .route("/studio/segment-products", get(list_remix_products))
        .route(
            "/studio/remix-batches",
            get(list_remix_batches).post(create_remix_batch),
        )
        .route("/studio/remix-batches:preview", post(preview_remix_batch))
        .route("/studio/remix-batches/{batch_id}", get(get_remix_batch))
        .route(
            "/studio/remix-batches/{batch_id}/cancel",
            post(cancel_remix_batch),
        )
        .route("/studio/remix-edits", post(create_remix_edit))
        .route("/studio/remix-edits:check", post(check_remix_edit))
}

/// Mirrors the production guard: sign-in first, then the feature flag (503
/// when off), then — only in scoped access — the content-asset write scope
/// for mutations. Returns the access mode the handler must apply.
fn guard<'a>(
    settings: &'a Settings,
    user: &CurrentUser,
    write: bool,
) -> AppResult<StudioAccess<'a>> {
    ensure_content_asset_read_permission(user)?;
    if !settings.content_ai_studio_enabled {
        return Err(AppError::ServiceUnavailable("AI 创作中心尚未启用".into()));
    }
    let access = StudioAccess::from_settings(settings);
    if write && !access.is_open() {
        ensure_content_asset_upload_permission(user)?;
    }
    Ok(access)
}

async fn capabilities(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> AppResult<Json<StudioCapabilitiesResponse>> {
    ensure_content_asset_read_permission(&user)?;
    let settings = &state.settings;
    let open_access = StudioAccess::from_settings(settings).is_open();
    Ok(Json(StudioCapabilitiesResponse {
        enabled: settings.content_ai_studio_enabled,
        open_access,
        can_write: open_access || ensure_content_asset_upload_permission(&user).is_ok(),
        segment_suggest_enabled: settings.content_ai_studio_enabled
            && settings.content_ai_studio_segment_suggest_enabled,
        segment_suggest_max_assets: i32::try_from(
            settings.content_ai_studio_segment_suggest_max_assets,
        )
        .unwrap_or(i32::MAX),
        remix_enabled: settings.content_ai_studio_enabled
            && remix::ensure_enabled(settings).is_ok(),
        remix_max_per_batch: i32::try_from(settings.content_ai_studio_remix_max_per_batch)
            .unwrap_or(i32::MAX),
        remix_max_seconds: i32::try_from(settings.content_ai_studio_remix_max_seconds)
            .unwrap_or(i32::MAX),
        remix_max_active: i32::try_from(settings.content_ai_studio_remix_max_active)
            .unwrap_or(i32::MAX),
        enterprise_tag: settings.content_ai_studio_enterprise_tag.clone(),
        products: settings.content_ai_studio_products.clone(),
        can_upload: ensure_content_asset_upload_permission(&user).is_ok(),
    }))
}

async fn presets(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> StudioResult<Json<SegmentPresetListResponse>> {
    guard(&state.settings, &user, false)?;
    Ok(Json(SegmentPresetListResponse {
        items: repository::list_presets(&state.pool).await?,
    }))
}

async fn asset_segment_summaries(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<AssetSegmentSummaryQuery>,
) -> StudioResult<Json<AssetSegmentSummaryListResponse>> {
    let access = guard(&state.settings, &user, false)?;
    let asset_ids = asset_summaries::parse_asset_ids(&query)?;
    Ok(Json(
        asset_summaries::list_asset_summaries(
            &state.pool,
            asset_ids,
            query.preset_key,
            access.enterprise_tag(),
        )
        .await?,
    ))
}

async fn studio_overview(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<overview_types::StudioOverviewQuery>,
) -> StudioResult<Json<overview_types::StudioOverviewResponse>> {
    let access = guard(&state.settings, &user, false)?;
    Ok(Json(
        overview::overview(
            &state.pool,
            query,
            access.batch_owner(&user),
            access.enterprise_tag(),
        )
        .await?,
    ))
}

async fn segment_pool(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<SegmentPoolQuery>,
) -> StudioResult<Json<SegmentPoolResponse>> {
    let access = guard(&state.settings, &user, false)?;
    Ok(Json(
        asset_summaries::segment_pool(&state.pool, query, access.enterprise_tag()).await?,
    ))
}

async fn list_segments(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<ContentSegmentListQuery>,
) -> StudioResult<Json<ContentSegmentListResponse>> {
    let access = guard(&state.settings, &user, false)?;
    let mut response =
        repository::list_segments(&state.pool, query, access.enterprise_tag()).await?;
    let mut asset_ids: Vec<Uuid> = Vec::new();
    for segment in &response.items {
        if !asset_ids.contains(&segment.asset_id) {
            asset_ids.push(segment.asset_id);
        }
    }
    response.assets =
        asset_summaries::segment_asset_covers(&state.pool, &state.settings, asset_ids).await?;
    for segment in &mut response.items {
        segment.cover_url = asset_summaries::segment_cover_url(&state.settings, &segment.evidence);
    }
    Ok(Json(response))
}

async fn create_segment(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<CreateContentSegmentRequest>,
) -> StudioResult<Json<ContentSegment>> {
    let access = guard(&state.settings, &user, true)?;
    Ok(Json(
        repository::create_segment(&state.pool, &user, access, request).await?,
    ))
}

async fn update_segment(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(segment_id): Path<Uuid>,
    Json(request): Json<UpdateContentSegmentRequest>,
) -> StudioResult<Json<ContentSegment>> {
    let access = guard(&state.settings, &user, true)?;
    Ok(Json(
        repository::update_segment(&state.pool, &user, access, segment_id, request).await?,
    ))
}

async fn confirm_segments(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<ConfirmContentSegmentsRequest>,
) -> StudioResult<Json<ConfirmContentSegmentsResponse>> {
    let access = guard(&state.settings, &user, true)?;
    Ok(Json(
        repository::confirm_segments(&state.pool, &user, access, request).await?,
    ))
}

async fn create_suggestion_jobs(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<CreateSegmentSuggestionsRequest>,
) -> StudioResult<Json<CreateSegmentSuggestionsResponse>> {
    let access = guard(&state.settings, &user, true)?;
    suggestions::ensure_enabled(&state.settings)?;
    Ok(Json(
        suggestions::create_jobs(
            &state.pool,
            &user,
            access,
            state.settings.content_ai_studio_segment_suggest_max_assets,
            request,
        )
        .await?,
    ))
}

async fn list_suggestion_jobs(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<SegmentSuggestionJobListQuery>,
) -> StudioResult<Json<SegmentSuggestionJobListResponse>> {
    let access = guard(&state.settings, &user, false)?;
    suggestions::ensure_enabled(&state.settings)?;
    Ok(Json(
        suggestions::list_jobs(&state.pool, &user, query, access.enterprise_tag()).await?,
    ))
}

async fn get_suggestion_job(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(job_id): Path<Uuid>,
) -> StudioResult<Json<SegmentSuggestionJob>> {
    let access = guard(&state.settings, &user, false)?;
    suggestions::ensure_enabled(&state.settings)?;
    Ok(Json(
        suggestions::fetch_job(&state.pool, job_id, access.enterprise_tag()).await?,
    ))
}

async fn list_remix_products(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<RemixProductListQuery>,
) -> StudioResult<Json<RemixProductListResponse>> {
    let access = guard(&state.settings, &user, false)?;
    Ok(Json(
        remix_read::products(&state.pool, &query, access.enterprise_tag()).await?,
    ))
}

async fn preview_remix_batch(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<RemixBatchPreviewRequest>,
) -> StudioResult<Json<RemixBatchPreviewResponse>> {
    let access = guard(&state.settings, &user, true)?;
    remix::ensure_enabled(&state.settings)?;
    Ok(Json(
        remix::preview(&state.pool, &state.settings, &user, access, &request).await?,
    ))
}

async fn create_remix_batch(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<CreateRemixBatchRequest>,
) -> StudioResult<Json<RemixBatchDetail>> {
    let access = guard(&state.settings, &user, true)?;
    remix::ensure_enabled(&state.settings)?;
    Ok(Json(
        remix::create(&state.pool, &state.settings, &user, access, &request).await?,
    ))
}

async fn list_remix_batches(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> StudioResult<Json<RemixBatchListResponse>> {
    let access = guard(&state.settings, &user, false)?;
    remix::ensure_enabled(&state.settings)?;
    Ok(Json(
        remix_read::list(
            &state.pool,
            &state.settings,
            &user.user_id,
            access.batch_owner(&user),
            access.enterprise_tag(),
        )
        .await?,
    ))
}

async fn get_remix_batch(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(batch_id): Path<Uuid>,
) -> StudioResult<Json<RemixBatchDetail>> {
    let access = guard(&state.settings, &user, false)?;
    remix::ensure_enabled(&state.settings)?;
    remix_read::ensure_in_enterprise(&state.pool, batch_id, access.enterprise_tag()).await?;
    Ok(Json(
        remix_read::detail(
            &state.pool,
            &state.settings,
            &user.user_id,
            access.batch_owner(&user),
            batch_id,
        )
        .await?,
    ))
}

/// Owner-only in scoped access, any signed-in user in open access; cancels
/// the batch's unsettled Runs and returns the detail.
async fn cancel_remix_batch(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(batch_id): Path<Uuid>,
) -> StudioResult<Json<RemixBatchDetail>> {
    let access = guard(&state.settings, &user, true)?;
    remix::ensure_enabled(&state.settings)?;
    remix_read::ensure_in_enterprise(&state.pool, batch_id, access.enterprise_tag()).await?;
    Ok(Json(
        remix_cancel::cancel(
            &state.pool,
            &state.settings,
            &user.user_id,
            access.batch_owner(&user),
            batch_id,
        )
        .await?,
    ))
}

/// 单条剪辑 duplicate/similar check; same validation as create, no writes.
async fn check_remix_edit(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<RemixEditCheckRequest>,
) -> StudioResult<Json<RemixEditCheckResponse>> {
    let access = guard(&state.settings, &user, true)?;
    remix::ensure_enabled(&state.settings)?;
    Ok(Json(
        remix_edit::check(&state.pool, &state.settings, &user, access, &request).await?,
    ))
}

async fn create_remix_edit(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<CreateRemixEditRequest>,
) -> StudioResult<Json<RemixBatchDetail>> {
    let access = guard(&state.settings, &user, true)?;
    remix::ensure_enabled(&state.settings)?;
    Ok(Json(
        remix_edit::create(&state.pool, &state.settings, &user, access, &request).await?,
    ))
}

#[cfg(test)]
mod route_tests;

#[cfg(test)]
mod remix_postgres_tests;

#[cfg(test)]
mod remix_edit_postgres_tests;

#[cfg(test)]
mod postgres_tests;

#[cfg(test)]
mod suggestion_postgres_tests;

#[cfg(test)]
mod access_postgres_tests;

#[cfg(test)]
mod asset_summary_postgres_tests;
#[cfg(test)]
mod enterprise_postgres_tests;
#[cfg(test)]
mod overview_postgres_tests;
