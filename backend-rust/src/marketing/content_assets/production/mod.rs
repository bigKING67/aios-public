mod assets;
mod catalog_domain;
mod catalogs;
mod domain;
mod jobs;
mod planning;
mod render_binding;
mod repository;
mod runs;
mod search;
mod semantic_jobs;
mod shot_jobs;
mod types;
mod visible_text;
mod visual_search;

use super::permissions::{
    ensure_content_asset_read_permission, ensure_content_asset_upload_permission,
};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{DefaultBodyLimit, Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use types::{Project, ProjectDetail, SaveRequest, SearchQuery};
use uuid::Uuid;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/production/capabilities", get(capabilities))
        .route("/production/clips", get(clips))
        .route(
            "/production/shot-jobs",
            get(shot_jobs::list).post(shot_jobs::enqueue),
        )
        .route(
            "/production/shot-jobs/{job_id}/cancel",
            post(shot_jobs::cancel),
        )
        .route(
            "/production/semantic-jobs",
            get(semantic_jobs::list).post(semantic_jobs::enqueue),
        )
        .route(
            "/production/semantic-jobs/{job_id}/cancel",
            post(semantic_jobs::cancel),
        )
        .route(
            "/production/shot-catalogs/{catalog_id}/semantic-clips",
            get(semantic_jobs::search),
        )
        .route("/production/visual-clips", get(visual_search::search))
        .route("/production/plans", post(planning::create))
        .route("/production/runs", get(runs::list).post(runs::create))
        .route("/production/runs/{run_id}", get(runs::detail))
        .route(
            "/production/caption-preflight-jobs/{job_id}/authorize",
            post(runs::caption_preflight::authorize),
        )
        .route(
            "/production/caption-preflight-jobs/{job_id}/authorize-worker",
            post(runs::caption_preflight::authorize_worker),
        )
        .route(
            "/production/runs/{run_id}/plans/{revision}",
            get(runs::plan_version),
        )
        .route("/production/runs/{run_id}/pause", post(runs::pause))
        .route("/production/runs/{run_id}/resume", post(runs::resume))
        .route("/production/runs/{run_id}/cancel", post(runs::cancel))
        .route("/production/runs/{run_id}/plan", post(runs::generate))
        .route(
            "/production/runs/{run_id}/repair-replacement",
            post(runs::replacement_repair::repair),
        )
        .route(
            "/production/runs/{run_id}/apply-replacement",
            post(runs::replacement_apply::apply),
        )
        .route(
            "/production/runs/{run_id}/select-replacement",
            post(runs::replacement_selection::select),
        )
        .route(
            "/production/runs/{run_id}/replacement-candidates",
            post(runs::replacement_candidates::search),
        )
        .route(
            "/production/runs/{run_id}/selected-revision-draft",
            post(runs::selected_revision::draft),
        )
        .route(
            "/production/runs/{run_id}/plan-revisions",
            post(runs::revise),
        )
        .route("/production/runs/{run_id}/adopt-plan", post(runs::adopt))
        .route("/production/runs/{run_id}/produce", post(runs::produce))
        .route("/production/runs/{run_id}/result", get(runs::result))
        .route(
            "/production/shot-catalogs",
            get(catalogs::list)
                .post(catalogs::import)
                .layer(DefaultBodyLimit::max(256 * 1024)),
        )
        .route(
            "/production/shot-catalogs/{catalog_id}",
            get(catalogs::detail),
        )
        .route("/production/projects", get(list).post(create))
        .route("/production/projects/{project_id}", get(detail).put(update))
        .route(
            "/production/projects/{project_id}/renders",
            post(jobs::enqueue),
        )
        .route(
            "/production/projects/{project_id}/renders/{job_id}/cancel",
            post(jobs::cancel),
        )
}

fn guard(state: &AppState, user: &CurrentUser, write: bool) -> AppResult<()> {
    ensure_content_asset_read_permission(user)?;
    if !state.settings.content_production_enabled {
        return Err(AppError::ServiceUnavailable("视频创作尚未启用".into()));
    }
    if write {
        ensure_content_asset_upload_permission(user)?;
    }
    Ok(())
}
async fn capabilities(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> AppResult<Json<Value>> {
    ensure_content_asset_read_permission(&user)?;
    Ok(Json(
        json!({"enabled":state.settings.content_production_enabled,"planningEnabled":state.settings.content_production_planning_enabled,"persistentPlansEnabled":state.settings.content_production_enabled && state.settings.content_production_runs_enabled,"autonomousEditingEnabled":false,"shotExtractionEnabled":state.settings.content_production_shot_extraction_enabled,"semanticsEnabled":state.settings.content_production_semantics_enabled,"canWrite":ensure_content_asset_upload_permission(&user).is_ok(),"maxDurationSeconds":600}),
    ))
}
async fn clips(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, false)?;
    Ok(Json(
        json!({"items":search::search(&state,&user,&query.q).await?}),
    ))
}
async fn list(State(state): State<Arc<AppState>>, user: CurrentUser) -> AppResult<Json<Value>> {
    guard(&state, &user, false)?;
    Ok(Json(
        json!({"items":repository::list_projects(&state.pool,&user.user_id).await?}),
    ))
}
async fn create(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<SaveRequest>,
) -> AppResult<Json<Project>> {
    guard(&state, &user, true)?;
    let expected = request.expected_revision;
    let snapshot = assets::bind_assets(&state, &user, request).await?;
    Ok(Json(
        repository::save(&state.pool, &user.user_id, None, expected, snapshot).await?,
    ))
}
async fn update(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<SaveRequest>,
) -> AppResult<Json<Project>> {
    guard(&state, &user, true)?;
    repository::get_project(&state.pool, &user.user_id, id).await?;
    let expected = request.expected_revision;
    let snapshot = assets::bind_assets(&state, &user, request).await?;
    Ok(Json(
        repository::save(&state.pool, &user.user_id, Some(id), expected, snapshot).await?,
    ))
}
async fn detail(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ProjectDetail>> {
    guard(&state, &user, false)?;
    let project = repository::get_project(&state.pool, &user.user_id, id).await?;
    // Owners can reopen a draft to replace revoked or changed sources. Save,
    // enqueue, worker execution and output delivery still recheck every source.
    Ok(Json(ProjectDetail {
        project,
        jobs: jobs::list_jobs(&state, &user, id).await?,
    }))
}

#[cfg(test)]
mod postgres_tests;

#[cfg(test)]
mod http_e2e_tests;

#[cfg(test)]
mod planning_http_fixture;

#[cfg(test)]
mod visual_http_fixture;

#[cfg(test)]
mod catalog_http_fixture;

#[cfg(test)]
mod shot_jobs_http_fixture;

#[cfg(test)]
mod semantic_http_fixture;

pub(super) use runs::framework_remix;
pub(crate) use runs::spawn_planner;
