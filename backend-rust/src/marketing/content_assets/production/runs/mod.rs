mod adopt;
mod attempts;
mod automatic_repair;
#[cfg(test)]
mod automatic_repair_browser_fixture;
#[cfg(test)]
mod automatic_repair_host_fixture;
#[cfg(test)]
mod automatic_repair_tests;
mod caption_candidate;
mod caption_dependency;
mod caption_freeze;
#[cfg(test)]
mod caption_http_fixture;
pub(super) mod caption_preflight;
mod caption_preflight_planning;
#[cfg(test)]
mod caption_preflight_tests;
#[cfg(test)]
mod caption_render_fixture;
mod caption_review_window;
mod caption_source;
mod caption_windows;
#[cfg(test)]
mod caption_worker_bridge_tests;
mod captions;
mod domain;
mod evidence_candidates;
#[cfg(test)]
pub(super) mod evidence_http_fixture;
mod evidence_planning;
#[cfg(test)]
mod evidence_tests;
mod execution;
pub(in crate::marketing::content_assets) mod framework_remix;
#[cfg(test)]
mod full_service_fixture;
#[cfg(test)]
mod media_daemon_fixture;
mod output;
#[cfg(test)]
pub(super) mod picture_http_fixture;
mod picture_remix;
mod picture_slots;
#[cfg(test)]
mod picture_tests;
mod planner;
mod planning_continuation;
mod planning_fallback;
mod planning_queue;
mod planning_repair;
#[cfg(test)]
mod preservation_probe;
#[cfg(test)]
mod real_selection_probe;
#[cfg(test)]
mod render_binding_http_fixture;
pub(super) mod replacement_apply;
#[cfg(test)]
mod replacement_apply_fixture;
pub(super) mod replacement_candidates;
pub(super) mod replacement_repair;
pub(super) mod replacement_selection;
#[cfg(test)]
mod replacement_selection_fixture;
mod replacement_text_review;
mod repository;
mod selected_review;
#[cfg(test)]
mod selected_review_http_fixture;
pub(super) mod selected_revision;
mod selection_context;
mod selection_review;
#[cfg(test)]
mod service_process_fixture;
mod transitions;
#[cfg(test)]
mod treated_caption_automation_fixture;
#[cfg(test)]
mod treated_caption_http_fixture;
mod treated_captions;
mod types;
mod visual_caption_evidence;
mod visual_review;
#[cfg(test)]
mod visual_review_http_fixture;

use super::{
    assets,
    types::{Clip, SaveRequest},
};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use std::sync::Arc;
use types::*;
use uuid::Uuid;

fn guard(state: &AppState, user: &CurrentUser, write: bool) -> AppResult<()> {
    super::guard(state, user, write)?;
    if !state.settings.content_production_runs_enabled {
        return Err(AppError::ServiceUnavailable("持久制作任务尚未启用".into()));
    }
    Ok(())
}

pub(super) async fn create(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(mut request): Json<CreateRunRequest>,
) -> AppResult<Json<RunDetail>> {
    guard(&state, &user, true)?;
    request.title = request.title.trim().into();
    request.brief = request.brief.trim().into();
    framework_remix::reject_public(&request.task_type)?;
    domain::validate_request(&request)?;
    let sources = assets::bind_assets(
        &state,
        &user,
        SaveRequest {
            expected_revision: None,
            title: request.title.clone(),
            aspect: request.aspect.clone(),
            rights_confirmed: request.rights_confirmed,
            clips: request
                .asset_ids
                .iter()
                .enumerate()
                .map(|(i, id)| Clip {
                    id: format!("scope-{i}"),
                    asset_id: *id,
                    start_ms: 0,
                    end_ms: 100,
                    caption: String::new(),
                    volume: 1.0,
                })
                .collect(),
        },
    )
    .await?;
    picture_remix::validate_source(&request, &sources)?;
    let run = repository::create(&state.pool, &user.user_id, &request, &sources).await?;
    assets::revalidate(&state, &user, &run.sources).await?;
    Ok(Json(
        repository::detail(&state.pool, &user.user_id, run.run_id).await?,
    ))
}

pub(super) async fn list(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> AppResult<Json<Value>> {
    guard(&state, &user, false)?;
    Ok(Json(
        json!({"items":repository::list(&state.pool,&user.user_id).await?}),
    ))
}

pub(super) async fn detail(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<RunDetail>> {
    guard(&state, &user, false)?;
    Ok(Json(
        repository::detail(&state.pool, &user.user_id, id).await?,
    ))
}

pub(super) async fn plan_version(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path((id, revision)): Path<(Uuid, i32)>,
) -> AppResult<Json<PlanRevision>> {
    guard(&state, &user, false)?;
    repository::get(&state.pool, &user.user_id, id).await?;
    if revision <= 0 {
        return Err(AppError::bad_request("方案版本必须为正数"));
    }
    let mut db = state
        .pool
        .acquire()
        .await
        .map_err(super::repository::db_error)?;
    Ok(Json(
        repository::plan(&mut db, id, revision)
            .await?
            .ok_or(AppError::NotFound)?,
    ))
}

pub(super) async fn pause(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<VersionRequest>,
) -> AppResult<Json<RunDetail>> {
    guard(&state, &user, true)?;
    Ok(Json(
        transitions::control(
            &state.pool,
            &user.user_id,
            id,
            request.expected_version,
            transitions::Control::Pause,
        )
        .await?,
    ))
}

pub(super) async fn resume(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<VersionRequest>,
) -> AppResult<Json<RunDetail>> {
    guard(&state, &user, true)?;
    let run = repository::get(&state.pool, &user.user_id, id).await?;
    assets::revalidate(&state, &user, &run.sources).await?;
    Ok(Json(
        transitions::control(
            &state.pool,
            &user.user_id,
            id,
            request.expected_version,
            transitions::Control::Resume,
        )
        .await?,
    ))
}

pub(super) async fn cancel(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<VersionRequest>,
) -> AppResult<Json<RunDetail>> {
    guard(&state, &user, true)?;
    Ok(Json(
        transitions::control(
            &state.pool,
            &user.user_id,
            id,
            request.expected_version,
            transitions::Control::Cancel,
        )
        .await?,
    ))
}

pub(super) async fn revise(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<RevisePlanRequest>,
) -> AppResult<Json<RunDetail>> {
    guard(&state, &user, true)?;
    let run = repository::get(&state.pool, &user.user_id, id).await?;
    framework_remix::reject_public(&run.request.task_type)?;
    assets::revalidate(&state, &user, &run.sources).await?;
    Ok(Json(
        transitions::revise(&state.pool, &user.user_id, id, request).await?,
    ))
}

pub(super) async fn adopt(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<AdoptPlanRequest>,
) -> AppResult<Json<RunDetail>> {
    guard(&state, &user, true)?;
    let run = repository::get(&state.pool, &user.user_id, id).await?;
    assets::revalidate(&state, &user, &run.sources).await?;
    Ok(Json(
        adopt::adopt(&state.pool, &user.user_id, id, request).await?,
    ))
}

pub(super) async fn generate(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<VersionRequest>,
) -> AppResult<Json<RunDetail>> {
    guard(&state, &user, true)?;
    if !state.settings.content_production_planning_enabled {
        return Err(AppError::ServiceUnavailable("分镜规划尚未启用".into()));
    }
    let run = repository::get(&state.pool, &user.user_id, id).await?;
    if !run.request.model_call_confirmed {
        return Err(AppError::bad_request("任务未授权模型调用"));
    }
    assets::revalidate(&state, &user, &run.sources).await?;
    attempts::enqueue(&state.pool, &user.user_id, id, request.expected_version).await?;
    Ok(Json(
        repository::detail(&state.pool, &user.user_id, id).await?,
    ))
}

pub(super) async fn produce(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<AdoptPlanRequest>,
) -> AppResult<Json<RunDetail>> {
    guard(&state, &user, true)?;
    let run = repository::get(&state.pool, &user.user_id, id).await?;
    assets::revalidate(&state, &user, &run.sources).await?;
    Ok(Json(
        execution::produce(&state.pool, &user.user_id, id, request).await?,
    ))
}

pub(super) async fn result(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, false)?;
    output::read(&state, &user, id).await.map(Json)
}

#[cfg(test)]
mod tests;

#[cfg(test)]
pub(super) mod http_fixture;

#[cfg(test)]
pub(super) mod render_http_fixture;

#[cfg(test)]
mod execution_tests;

#[cfg(test)]
mod treatment_http_fixture;

pub(crate) use planner::spawn as spawn_planner;

#[cfg(test)]
mod planning_queue_tests;

#[cfg(test)]
pub(super) mod background_http_fixture;

#[cfg(test)]
pub(super) mod batch_http_fixture;

#[cfg(test)]
mod caption_candidate_http_fixture;

#[cfg(test)]
mod caption_candidate_rerender_fixture;

#[cfg(test)]
mod caption_candidate_browser_fixture;

#[cfg(test)]
pub(super) mod replay_http_fixture;

#[cfg(test)]
mod real_media_dispatch_tests;

#[cfg(test)]
mod real_media_evidence_fixture;

#[cfg(test)]
mod real_media_planner_fixture;
