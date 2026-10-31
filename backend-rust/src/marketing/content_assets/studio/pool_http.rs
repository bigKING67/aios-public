//! HTTP adapters for candidate segment pools and structure pool previews.
use super::{
    asset_summaries,
    error::StudioResult,
    guard, structure_pool,
    structure_pool_types::{StructurePoolQuery, StructurePoolResponse},
    types::{SegmentPoolQuery, SegmentPoolResponse},
};
use crate::{auth::CurrentUser, state::AppState};
use axum::{
    extract::{Query, State},
    Json,
};
use std::sync::Arc;

pub(super) async fn segments(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<SegmentPoolQuery>,
) -> StudioResult<Json<SegmentPoolResponse>> {
    let access = guard(&state.settings, &user, false)?;
    Ok(Json(
        asset_summaries::segment_pool(
            &state.pool,
            query,
            access.enterprise_tag(),
            state.settings.content_ai_studio_cloud_remix_enabled,
        )
        .await?,
    ))
}

pub(super) async fn structures(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Query(query): Query<StructurePoolQuery>,
) -> StudioResult<Json<StructurePoolResponse>> {
    let access = guard(&state.settings, &user, false)?;
    Ok(Json(
        structure_pool::preview(&state.pool, &state.settings, &user, access, query).await?,
    ))
}
