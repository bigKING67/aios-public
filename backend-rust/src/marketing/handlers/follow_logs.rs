use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};

use crate::{auth::CurrentUser, error::AppResult, state::AppState};

use super::{
    authz::{
        ensure_read_permission, ensure_write_permission, has_creator_library_manage_permission,
        resolve_actor,
    },
    request_helpers::{
        read_expected_updated_at_header, validate_positive_id, validate_positive_log_id,
    },
};
use crate::marketing::{
    repository_follow_logs::{
        create_follow_log, delete_follow_log_by_id, list_follow_logs, update_follow_log_by_id,
    },
    types::{
        CreatorLibraryFollowLogDeleteResponse, CreatorLibraryFollowLogDetailResponse,
        CreatorLibraryFollowLogListResponse, CreatorLibraryFollowLogPayload,
    },
    validation::normalize_follow_log_payload,
};

pub(super) async fn list_creator_follow_logs(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    current_user: CurrentUser,
) -> AppResult<Json<CreatorLibraryFollowLogListResponse>> {
    ensure_read_permission(&current_user)?;
    validate_positive_id(id)?;

    let items = list_follow_logs(
        &state.pool,
        id,
        current_user.user_id.as_str(),
        has_creator_library_manage_permission(&current_user),
    )
    .await?;
    Ok(Json(CreatorLibraryFollowLogListResponse { items }))
}

pub(super) async fn create_creator_follow_log(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    current_user: CurrentUser,
    Json(payload): Json<CreatorLibraryFollowLogPayload>,
) -> AppResult<Json<CreatorLibraryFollowLogDetailResponse>> {
    ensure_write_permission(&current_user)?;
    validate_positive_id(id)?;

    let input = normalize_follow_log_payload(payload)?;
    let actor = resolve_actor(&current_user);
    let item = create_follow_log(&state.pool, id, input.follow_note.as_str(), &actor).await?;
    Ok(Json(CreatorLibraryFollowLogDetailResponse { item }))
}

pub(super) async fn update_creator_follow_log(
    State(state): State<Arc<AppState>>,
    Path((id, log_id)): Path<(i64, i64)>,
    current_user: CurrentUser,
    Json(payload): Json<CreatorLibraryFollowLogPayload>,
) -> AppResult<Json<CreatorLibraryFollowLogDetailResponse>> {
    ensure_write_permission(&current_user)?;
    validate_positive_id(id)?;
    validate_positive_log_id(log_id)?;

    let input = normalize_follow_log_payload(payload)?;
    let actor = resolve_actor(&current_user);
    let item = update_follow_log_by_id(
        &state.pool,
        id,
        log_id,
        &input,
        &actor,
        has_creator_library_manage_permission(&current_user),
    )
    .await?;
    Ok(Json(CreatorLibraryFollowLogDetailResponse { item }))
}

pub(super) async fn delete_creator_follow_log(
    State(state): State<Arc<AppState>>,
    Path((id, log_id)): Path<(i64, i64)>,
    current_user: CurrentUser,
    headers: HeaderMap,
) -> AppResult<Json<CreatorLibraryFollowLogDeleteResponse>> {
    ensure_write_permission(&current_user)?;
    validate_positive_id(id)?;
    validate_positive_log_id(log_id)?;

    let expected_updated_at = read_expected_updated_at_header(&headers)?;
    let actor = resolve_actor(&current_user);
    delete_follow_log_by_id(
        &state.pool,
        id,
        log_id,
        expected_updated_at.as_deref(),
        &actor,
        has_creator_library_manage_permission(&current_user),
    )
    .await?;
    Ok(Json(CreatorLibraryFollowLogDeleteResponse {
        deleted: true,
    }))
}
