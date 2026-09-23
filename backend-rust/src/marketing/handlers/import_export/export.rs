use std::sync::Arc;

use axum::{
    extract::{Query, State},
    response::Response,
};

use crate::{
    auth::CurrentUser,
    error::AppResult,
    marketing::{
        csv::{build_creators_csv, csv_response},
        repository::list_creators,
        types::{CreatorLibraryQuery, MAX_EXPORT_ROWS},
        validation::normalize_query,
    },
    state::AppState,
};

use super::super::authz::{ensure_read_permission, resolve_actor};

pub(in crate::marketing::handlers) async fn export_creators_csv(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<CreatorLibraryQuery>,
) -> AppResult<Response> {
    ensure_read_permission(&current_user)?;
    let mut normalized = normalize_query(query)?;
    normalized.page = 1;
    normalized.page_size = MAX_EXPORT_ROWS;
    let actor = resolve_actor(&current_user);
    let items = list_creators(
        &state.pool,
        &normalized,
        actor.user_id.as_str(),
        actor.can_manage,
    )
    .await?;
    let csv = build_creators_csv(&items);
    Ok(csv_response("influencer_library_export.csv", csv))
}
