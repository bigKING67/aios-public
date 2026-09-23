mod asset_lookup;
mod asset_mutations;
mod cleanup;
mod coverage;
mod delivery;
mod detail_types;
mod douyin_video_link;
mod douyin_video_source;
mod events;
mod guards;
mod handler_support;
mod handlers;
mod identity_lookup;
mod identity_metadata;
mod identity_mutations;
mod identity_unmatched_bindings;
mod mutation_types;
mod performance;
mod performance_daily;
mod performance_snapshot;
mod permissions;
mod prefect_trigger;
mod processing_mutations;
mod production;
mod repository;
mod repository_detail;
mod repository_filters;
mod repository_options;
mod row_mapping;
mod source_upload;
mod text_normalization;
mod types;
mod upload_verification;
mod validation;
mod validation_taxonomy;
mod validation_text;
mod video_link_import;
mod video_link_material_suggestion;
mod write_errors;

pub(crate) use processing_mutations::AnalysisCacheHydrationBatchResult;

pub(crate) fn ensure_manage_permission(
    current_user: &crate::auth::CurrentUser,
) -> crate::error::AppResult<()> {
    permissions::ensure_content_asset_manage_permission(current_user)
}

pub(crate) async fn create_analysis_processing_job_for_asset(
    pool: &sqlx::PgPool,
    asset_id: uuid::Uuid,
    source: &str,
    profile: Option<&str>,
    force: bool,
    actor: Option<&str>,
) -> crate::error::AppResult<uuid::Uuid> {
    processing_mutations::create_analysis_processing_job(
        pool,
        asset_id,
        mutation_types::NormalizedContentAssetAnalysisJobCreate {
            source: source.to_string(),
            profile: profile.map(str::to_string),
            force,
        },
        actor,
    )
    .await
}

#[allow(dead_code)] // Preserve the existing content-assets boundary for single-asset callers.
pub(crate) async fn create_analysis_cache_hydration_job_for_asset(
    pool: &sqlx::PgPool,
    asset_id: uuid::Uuid,
    source: &str,
    profile: Option<&str>,
    actor: Option<&str>,
) -> crate::error::AppResult<uuid::Uuid> {
    processing_mutations::create_analysis_cache_hydration_job(
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
    processing_mutations::create_analysis_cache_hydration_jobs(
        pool, asset_ids, source, profile, actor,
    )
    .await
}

pub(crate) async fn trigger_content_asset_analysis_batch_worker(
    state: &std::sync::Arc<crate::state::AppState>,
) -> Result<crate::dataops::prefect::PrefectRunCreateResult, String> {
    prefect_trigger::trigger_analysis_batch_prefect_worker(state).await
}

pub(crate) const CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT: i64 =
    prefect_trigger::CONTENT_ASSET_ANALYSIS_IMMEDIATE_LIMIT;

pub(super) fn router() -> axum::Router<std::sync::Arc<crate::state::AppState>> {
    handlers::router().merge(production::router())
}

pub(super) fn spawn_stale_upload_cleanup(state: std::sync::Arc<crate::state::AppState>) {
    cleanup::spawn_stale_upload_cleanup(state);
}
