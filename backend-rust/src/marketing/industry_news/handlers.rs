use std::sync::Arc;

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};

use crate::{auth::CurrentUser, error::AppResult, state::AppState};

use super::{
    repository::{count_articles, query_articles, query_sources, query_summary},
    types::{IndustryArticleListResponse, IndustryArticleQuery, IndustryArticleSource},
    validation::normalize_query,
};

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/articles", get(list_articles))
        .route("/sources", get(list_sources))
}

async fn list_articles(
    State(state): State<Arc<AppState>>,
    _current_user: CurrentUser,
    Query(query): Query<IndustryArticleQuery>,
) -> AppResult<Json<IndustryArticleListResponse>> {
    let normalized = normalize_query(query)?;
    let (total, items, summary, sources) = tokio::try_join!(
        count_articles(&state.pool, &normalized),
        query_articles(&state.pool, &normalized),
        query_summary(&state.pool),
        query_sources(&state.pool),
    )?;

    Ok(Json(IndustryArticleListResponse {
        items,
        total,
        page: normalized.page,
        page_size: normalized.page_size,
        summary,
        sources,
    }))
}

async fn list_sources(
    State(state): State<Arc<AppState>>,
    _current_user: CurrentUser,
) -> AppResult<Json<Vec<IndustryArticleSource>>> {
    Ok(Json(query_sources(&state.pool).await?))
}
