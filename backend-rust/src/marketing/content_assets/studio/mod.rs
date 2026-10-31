//! AI 创作中心 backend: versioned segment presets and segment assets that
//! reference raw library assets. Gated by `CONTENT_AI_STUDIO_ENABLED`; write
//! and batch visibility rules follow `access::StudioAccess`.
mod access;
mod admission;
mod asset_summaries;
mod competitor;
mod competitor_auto;
mod competitor_catalog;
mod competitor_collection;
mod competitor_overview;
mod competitor_own_structures;
mod competitor_patterns;
mod competitor_reports;
mod competitor_types;
mod competitor_window;
mod daily_remix;
mod daily_remix_http;
#[cfg(test)]
mod daily_remix_postgres_tests;
mod daily_remix_read;
mod daily_remix_types;
mod domain;
mod error;
mod overview;
mod overview_types;
mod overview_window;
mod pool_http;
mod remix;
mod remix_cancel;
mod remix_combos;
mod remix_delivery;
mod remix_edit;
mod remix_list;
mod remix_picture_review;
mod remix_points_plan;
mod remix_preview;
mod remix_quality;
mod remix_read;
mod remix_retention;
mod remix_review;
mod remix_selling_points;
mod remix_types;
mod repository;
mod segment_list;
mod selling_point_labels;
mod structure_pool;
mod structure_pool_allocation;
mod structure_pool_types;
mod suggestions;
mod team_output;
mod team_output_export;
mod team_output_queries;
mod team_output_types;
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
    routing::{get, patch, post, put},
    Json, Router,
};
use competitor_types::{
    CompetitorAnalysis, CompetitorOverviewResponse, CompetitorPatternsQuery,
    CompetitorPatternsResponse, CompetitorReport, CompetitorReportLatestResponse, CompetitorVideo,
    CompetitorVideoListQuery, CompetitorVideoListResponse, CreateCompetitorReportRequest,
    CreateCompetitorVideoRequest, UpdateCompetitorVideoRequest,
};
use error::StudioResult;
use remix_types::{
    CreateRemixBatchRequest, CreateRemixEditRequest, RemixBatchDetail, RemixBatchListQuery,
    RemixBatchListResponse, RemixBatchPreviewRequest, RemixBatchPreviewResponse,
    RemixEditCheckRequest, RemixEditCheckResponse, RemixOutputReviewRequest, RemixProductListQuery,
    RemixProductListResponse,
};
use std::sync::Arc;
use types::{
    AssetSegmentSummaryListResponse, AssetSegmentSummaryQuery, ConfirmContentSegmentsRequest,
    ConfirmContentSegmentsResponse, ContentSegment, ContentSegmentListQuery,
    ContentSegmentListResponse, CreateContentSegmentRequest, CreateSegmentSuggestionsRequest,
    CreateSegmentSuggestionsResponse, SegmentPresetListResponse, SegmentSuggestionJob,
    SegmentSuggestionJobListQuery, SegmentSuggestionJobListResponse, StudioCapabilitiesResponse,
    UpdateContentSegmentRequest,
};
use uuid::Uuid;

/// Queues 罗盘 traffic videos of top-ranked live rooms for analysis (see `competitor_auto`).
pub(super) fn spawn_competitor_auto_analysis(state: Arc<AppState>) {
    competitor_auto::spawn(state);
}

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/studio/capabilities", get(capabilities))
        .route("/studio/presets", get(presets))
        .route("/studio/overview", get(studio_overview))
        .route(
            "/studio/asset-segment-summaries",
            get(asset_segment_summaries),
        )
        .route("/studio/segment-pool", get(pool_http::segments))
        .route("/studio/structure-pool", get(pool_http::structures))
        .route("/studio/daily-remix:run", post(daily_remix_http::run))
        .route("/studio/daily-remix/plans", get(daily_remix_http::get))
        .route("/studio/daily-remix:pause", post(daily_remix_http::pause))
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
        .route(
            "/studio/remix-batches/{batch_id}/items/{ordinal}/review",
            put(review_remix_output).delete(clear_remix_output_review),
        )
        .route(
            "/studio/remix-batches/{batch_id}/items/{ordinal}/delivery:retry",
            post(remix_delivery::retry),
        )
        .route("/studio/remix-edits", post(create_remix_edit))
        .route("/studio/remix-edits:check", post(check_remix_edit))
        .route(
            "/studio/competitor/videos",
            get(list_competitor_videos).post(create_competitor_video),
        )
        .route(
            "/studio/competitor/videos/{aweme_id}",
            get(get_competitor_video).patch(update_competitor_video),
        )
        .route(
            "/studio/competitor/videos/{aweme_id}/analyses",
            post(request_competitor_analysis),
        )
        .route(
            "/studio/competitor/analyses/{analysis_id}",
            get(get_competitor_analysis),
        )
        .route("/studio/competitor/overview", get(get_competitor_overview))
        .route("/studio/competitor/patterns", get(get_competitor_patterns))
        .route(
            "/studio/competitor/reports",
            post(request_competitor_report),
        )
        .route(
            "/studio/competitor/reports/latest",
            get(get_latest_competitor_report),
        )
        .route("/studio/team-output", get(get_team_output))
        .route("/studio/team-output/videos", get(get_team_output_videos))
        .route("/studio/team-output/export", get(export_team_output))
}

/// 团队产出: its own permission (not the studio's open access), then the feature flag.
fn team_output_guard(settings: &Settings, user: &CurrentUser) -> AppResult<()> {
    team_output::ensure_team_output_access(user)?;
    if !settings.content_ai_studio_enabled {
        return Err(AppError::ServiceUnavailable("AI 创作中心尚未启用".into()));
    }
    Ok(())
}

async fn get_team_output(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<team_output_types::TeamOutputQuery>,
) -> StudioResult<Json<team_output_types::TeamOutputResponse>> {
    team_output_guard(&state.settings, &user)?;
    Ok(Json(
        team_output_queries::team_output(&state.pool, query, chrono::Utc::now()).await?,
    ))
}

async fn get_team_output_videos(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<team_output_types::TeamOutputVideosQuery>,
) -> StudioResult<Json<team_output_types::TeamOutputVideosResponse>> {
    team_output_guard(&state.settings, &user)?;
    Ok(Json(
        team_output_queries::team_output_videos(&state.pool, query, chrono::Utc::now()).await?,
    ))
}

/// The page's rows (`kind=summary`, default) or every (成片, person) row (`kind=videos`) as XLSX.
async fn export_team_output(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<team_output_types::TeamOutputExportQuery>,
) -> StudioResult<axum::response::Response> {
    use axum::response::IntoResponse;
    team_output_guard(&state.settings, &user)?;
    let kind = team_output_export::ExportKind::parse(query.kind.as_deref())?;
    let person_key = query.person_key.clone();
    let (name, bytes) = team_output_export::export(
        &state.pool,
        query.into(),
        kind,
        person_key.as_deref(),
        chrono::Utc::now(),
    )
    .await?;
    let disposition = team_output_export::content_disposition(&name);
    Ok((
        [
            (
                axum::http::header::CONTENT_TYPE,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string(),
            ),
            (axum::http::header::CONTENT_DISPOSITION, disposition),
        ],
        bytes,
    )
        .into_response())
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

async fn list_segments(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<ContentSegmentListQuery>,
) -> StudioResult<Json<ContentSegmentListResponse>> {
    let access = guard(&state.settings, &user, false)?;
    let mut response = repository::list_segments(
        &state.pool,
        query,
        access.enterprise_tag(),
        state.settings.content_ai_studio_admission_min_spend,
    )
    .await?;
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
        remix_read::products(
            &state.pool,
            &query,
            access.enterprise_tag(),
            state.settings.content_ai_studio_cloud_remix_enabled,
        )
        .await?,
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
    Query(query): Query<RemixBatchListQuery>,
) -> StudioResult<Json<RemixBatchListResponse>> {
    let access = guard(&state.settings, &user, false)?;
    remix::ensure_enabled(&state.settings)?;
    Ok(Json(
        remix_list::list(
            &state.pool,
            &state.settings,
            &user.user_id,
            access.batch_owner(&user),
            access.enterprise_tag(),
            &query,
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

/// 成片审核: same access as cancel. Approves or rejects one output (replacing
/// any earlier review) and returns the detail.
async fn review_remix_output(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path((batch_id, ordinal)): Path<(Uuid, i32)>,
    Json(request): Json<RemixOutputReviewRequest>,
) -> StudioResult<Json<RemixBatchDetail>> {
    let access = guard(&state.settings, &user, true)?;
    remix::ensure_enabled(&state.settings)?;
    remix_read::ensure_in_enterprise(&state.pool, batch_id, access.enterprise_tag()).await?;
    Ok(Json(
        remix_review::review(
            &state.pool,
            &state.settings,
            &user.user_id,
            access.batch_owner(&user),
            batch_id,
            ordinal,
            &request,
        )
        .await?,
    ))
}

/// Clears one output's review (back to 待审核) and returns the detail.
async fn clear_remix_output_review(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path((batch_id, ordinal)): Path<(Uuid, i32)>,
) -> StudioResult<Json<RemixBatchDetail>> {
    let access = guard(&state.settings, &user, true)?;
    remix::ensure_enabled(&state.settings)?;
    remix_read::ensure_in_enterprise(&state.pool, batch_id, access.enterprise_tag()).await?;
    Ok(Json(
        remix_review::clear(
            &state.pool,
            &state.settings,
            &user.user_id,
            access.batch_owner(&user),
            batch_id,
            ordinal,
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
mod team_output_postgres_tests;

#[cfg(test)]
mod remix_delivery_postgres_tests;
#[cfg(test)]
mod remix_list_postgres_tests;
#[cfg(test)]
mod remix_postgres_tests;
#[cfg(test)]
mod remix_retention_postgres_tests;
#[cfg(test)]
mod remix_review_postgres_tests;

#[cfg(test)]
mod remix_edit_postgres_tests;

#[cfg(test)]
mod remix_points_postgres_tests;
#[cfg(test)]
mod remix_points_voiceover_postgres_tests;

#[cfg(test)]
mod remix_points_media_tests;

#[cfg(test)]
mod browser_acceptance_tests;

#[cfg(test)]
mod postgres_tests;

#[cfg(test)]
mod segment_multilabel_postgres_tests;

#[cfg(test)]
mod suggestion_postgres_tests;

#[cfg(test)]
mod access_postgres_tests;

#[cfg(test)]
mod asset_summary_postgres_tests;
#[cfg(test)]
mod competitor_catalog_postgres_tests;
#[cfg(test)]
mod competitor_reports_postgres_tests;
#[cfg(test)]
mod competitor_videos_postgres_tests;
#[cfg(test)]
mod competitor_window_postgres_tests;
#[cfg(test)]
mod enterprise_postgres_tests;
#[cfg(test)]
mod overview_postgres_tests;

async fn list_competitor_videos(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<CompetitorVideoListQuery>,
) -> StudioResult<Json<CompetitorVideoListResponse>> {
    guard(&state.settings, &user, false)?;
    Ok(Json(
        competitor_catalog::list_videos(&state.pool, &state.settings, &query).await?,
    ))
}

async fn create_competitor_video(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<CreateCompetitorVideoRequest>,
) -> StudioResult<Json<CompetitorVideo>> {
    guard(&state.settings, &user, true)?;
    Ok(Json(
        competitor_collection::create_video(&state.pool, &state.settings, &user, request).await?,
    ))
}

async fn request_competitor_analysis(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(aweme_id): Path<String>,
) -> StudioResult<Json<CompetitorAnalysis>> {
    guard(&state.settings, &user, true)?;
    Ok(Json(
        competitor::request_analysis(&state, &user, &aweme_id).await?,
    ))
}

async fn get_competitor_analysis(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(analysis_id): Path<Uuid>,
) -> StudioResult<Json<CompetitorAnalysis>> {
    guard(&state.settings, &user, false)?;
    Ok(Json(
        competitor::get_analysis_with_evidence_urls(&state, analysis_id).await?,
    ))
}

async fn get_competitor_overview(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<CompetitorPatternsQuery>,
) -> StudioResult<Json<CompetitorOverviewResponse>> {
    guard(&state.settings, &user, false)?;
    Ok(Json(competitor_overview::overview(&state, query).await?))
}

async fn request_competitor_report(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(body): Json<CreateCompetitorReportRequest>,
) -> StudioResult<Json<CompetitorReport>> {
    guard(&state.settings, &user, true)?;
    Ok(Json(
        competitor_reports::request(&state.pool, &user, body).await?,
    ))
}

async fn get_latest_competitor_report(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<CreateCompetitorReportRequest>,
) -> StudioResult<Json<CompetitorReportLatestResponse>> {
    guard(&state.settings, &user, false)?;
    Ok(Json(competitor_reports::latest(&state.pool, query).await?))
}

async fn get_competitor_patterns(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<CompetitorPatternsQuery>,
) -> StudioResult<Json<CompetitorPatternsResponse>> {
    let access = guard(&state.settings, &user, false)?;
    Ok(Json(
        competitor_patterns::patterns(&state.pool, query, access.enterprise_tag()).await?,
    ))
}

async fn get_competitor_video(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(aweme_id): Path<String>,
) -> StudioResult<Json<CompetitorVideo>> {
    guard(&state.settings, &user, false)?;
    Ok(Json(
        competitor::fetch_video(&state.pool, Some(&state.settings), &aweme_id).await?,
    ))
}
async fn update_competitor_video(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(aweme_id): Path<String>,
    Json(request): Json<UpdateCompetitorVideoRequest>,
) -> StudioResult<Json<CompetitorVideo>> {
    guard(&state.settings, &user, true)?;
    Ok(Json(
        competitor_collection::update_video(&state.pool, &state.settings, &aweme_id, request)
            .await?,
    ))
}

#[cfg(test)]
mod admission_postgres_tests;

#[cfg(test)]
mod structure_pool_postgres_tests;

#[cfg(test)]
mod cloud_remix_postgres_tests;
