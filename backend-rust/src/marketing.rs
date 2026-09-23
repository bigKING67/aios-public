use std::sync::Arc;

use axum::Router;

use crate::state::AppState;

mod anchor_tags;
mod bd_accounts;
mod cache;
mod content_assets;
mod creator_library_xlsx;
mod csv;
mod handlers;
mod industry_news;
mod repository;
mod repository_access;
mod repository_follow_logs;
mod repository_mutation;
mod repository_row_filters;
mod repository_sql;
mod template_xlsx;
mod types;
mod validation;

pub(crate) use cache::CreatorLibraryFilterOptionsCache;
pub(crate) use content_assets::AnalysisCacheHydrationBatchResult;

pub(crate) fn ensure_content_asset_manage_permission(
    current_user: &crate::auth::CurrentUser,
) -> crate::error::AppResult<()> {
    content_assets::ensure_manage_permission(current_user)
}

pub(crate) async fn create_content_asset_analysis_processing_job(
    pool: &sqlx::PgPool,
    asset_id: uuid::Uuid,
    source: &str,
    profile: Option<&str>,
    force: bool,
    actor: Option<&str>,
) -> crate::error::AppResult<uuid::Uuid> {
    content_assets::create_analysis_processing_job_for_asset(
        pool, asset_id, source, profile, force, actor,
    )
    .await
}

#[allow(dead_code)] // Kept as the stable single-asset entry; it delegates to the batch owner.
pub(crate) async fn create_content_asset_analysis_cache_hydration_job(
    pool: &sqlx::PgPool,
    asset_id: uuid::Uuid,
    source: &str,
    profile: Option<&str>,
    actor: Option<&str>,
) -> crate::error::AppResult<uuid::Uuid> {
    content_assets::create_analysis_cache_hydration_job_for_asset(
        pool, asset_id, source, profile, actor,
    )
    .await
}

pub(crate) async fn create_analysis_cache_hydration_jobs_for_assets(
    pool: &sqlx::PgPool,
    asset_ids: &[uuid::Uuid],
    source: &str,
    profile: Option<&str>,
    actor: Option<&str>,
) -> crate::error::AppResult<AnalysisCacheHydrationBatchResult> {
    content_assets::create_analysis_cache_hydration_jobs_for_assets(
        pool, asset_ids, source, profile, actor,
    )
    .await
}

pub(crate) async fn trigger_content_asset_analysis_batch_worker(
    state: &Arc<AppState>,
) -> Result<crate::dataops::prefect::PrefectRunCreateResult, String> {
    content_assets::trigger_content_asset_analysis_batch_worker(state).await
}

pub(crate) const CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT: i64 =
    content_assets::CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .nest("/creator-library", handlers::creator_library_router())
        .nest("/content-assets", content_assets::router())
        .nest("/industry-news", industry_news::router())
}

pub(crate) fn spawn_content_asset_stale_upload_cleanup(state: Arc<AppState>) {
    content_assets::spawn_stale_upload_cleanup(state);
}
