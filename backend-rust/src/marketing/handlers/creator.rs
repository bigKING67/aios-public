use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Json,
};

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    authz::{ensure_read_permission, ensure_write_permission, resolve_actor},
    filter_options::query_cached_filter_options,
    request_helpers::{
        ensure_manual_creator_influencer_id, read_expected_updated_at_header, validate_positive_id,
    },
};
use crate::marketing::{
    repository::{
        count_creators, delete_creator_by_id, fetch_creator_by_id, insert_creator, list_creators,
        query_summary, update_creator_by_id,
    },
    types::{
        CreatorLibraryDeleteResponse, CreatorLibraryDetailResponse, CreatorLibraryListResponse,
        CreatorLibraryPayload, CreatorLibraryQuery,
    },
    validation::{normalize_payload, normalize_query},
};

pub(super) async fn list_creator_library(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<CreatorLibraryQuery>,
) -> AppResult<Json<CreatorLibraryListResponse>> {
    ensure_read_permission(&current_user)?;
    let normalized = normalize_query(query)?;
    let actor = resolve_actor(&current_user);
    let summary_query = async {
        if normalized.include_summary {
            query_summary(&state.pool).await
        } else {
            Ok(Default::default())
        }
    };
    let filter_options_query = async {
        if normalized.include_filter_options {
            query_cached_filter_options(&state).await
        } else {
            Ok(Default::default())
        }
    };
    let (total, items, summary, filter_options) = tokio::try_join!(
        count_creators(&state.pool, &normalized, actor.user_id.as_str()),
        list_creators(
            &state.pool,
            &normalized,
            actor.user_id.as_str(),
            actor.can_manage
        ),
        summary_query,
        filter_options_query,
    )?;

    Ok(Json(CreatorLibraryListResponse {
        items,
        total,
        page: normalized.page,
        page_size: normalized.page_size,
        summary,
        filter_options,
    }))
}

pub(super) async fn get_creator(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    current_user: CurrentUser,
) -> AppResult<Json<CreatorLibraryDetailResponse>> {
    ensure_read_permission(&current_user)?;
    validate_positive_id(id)?;

    let actor = resolve_actor(&current_user);
    let item = fetch_creator_by_id(&state.pool, id, actor.user_id.as_str(), actor.can_manage)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(CreatorLibraryDetailResponse { item }))
}

pub(super) async fn create_creator(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<CreatorLibraryPayload>,
) -> AppResult<Json<CreatorLibraryDetailResponse>> {
    ensure_write_permission(&current_user)?;
    let input = normalize_payload(payload)?;
    ensure_manual_creator_influencer_id(&input.influencer_id)?;
    let actor = resolve_actor(&current_user);
    let item = insert_creator(&state.pool, &input, &actor, "manual").await?;
    state.creator_library_filter_cache.invalidate().await;
    Ok(Json(CreatorLibraryDetailResponse { item }))
}

pub(super) async fn update_creator(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    current_user: CurrentUser,
    Json(payload): Json<CreatorLibraryPayload>,
) -> AppResult<Json<CreatorLibraryDetailResponse>> {
    ensure_write_permission(&current_user)?;
    validate_positive_id(id)?;

    let input = normalize_payload(payload)?;
    let actor = resolve_actor(&current_user);
    let item = update_creator_by_id(&state.pool, id, &input, &actor).await?;
    state.creator_library_filter_cache.invalidate().await;
    Ok(Json(CreatorLibraryDetailResponse { item }))
}

pub(super) async fn delete_creator(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    current_user: CurrentUser,
    headers: HeaderMap,
) -> AppResult<Json<CreatorLibraryDeleteResponse>> {
    ensure_write_permission(&current_user)?;
    validate_positive_id(id)?;

    let expected_updated_at = read_expected_updated_at_header(&headers)?;
    let actor = resolve_actor(&current_user);
    delete_creator_by_id(&state.pool, id, expected_updated_at.as_deref(), &actor).await?;
    state.creator_library_filter_cache.invalidate().await;
    Ok(Json(CreatorLibraryDeleteResponse { deleted: true }))
}
