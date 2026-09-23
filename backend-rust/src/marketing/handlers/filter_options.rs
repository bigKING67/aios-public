use std::sync::Arc;

use axum::{extract::State, Json};

use crate::{auth::CurrentUser, error::AppResult, state::AppState};

use super::authz::ensure_read_permission;
use crate::marketing::{repository::query_filter_options, types::CreatorLibraryFilterOptions};

pub(super) async fn get_creator_filter_options(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<CreatorLibraryFilterOptions>> {
    ensure_read_permission(&current_user)?;
    Ok(Json(query_cached_filter_options(&state).await?))
}

pub(super) async fn query_cached_filter_options(
    state: &Arc<AppState>,
) -> AppResult<CreatorLibraryFilterOptions> {
    if let Some(options) = state.creator_library_filter_cache.get().await {
        return Ok(options);
    }

    let _refresh_guard = state.creator_library_filter_cache.lock_refresh().await;
    if let Some(options) = state.creator_library_filter_cache.get().await {
        return Ok(options);
    }

    let refresh_epoch = state.creator_library_filter_cache.current_epoch().await;
    let options = query_filter_options(&state.pool).await?;
    state
        .creator_library_filter_cache
        .set_if_current(options.clone(), refresh_epoch)
        .await;
    Ok(options)
}
