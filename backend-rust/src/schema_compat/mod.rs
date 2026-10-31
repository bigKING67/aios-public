use sqlx::PgPool;

use crate::config::ModuleProfile;

mod auth_schema;
mod content_assets_schema;
mod creator_library_access;
mod creator_library_follow_log;
mod creator_library_indexes;

pub async fn ensure_runtime_schema(
    pool: &PgPool,
    module_profile: ModuleProfile,
) -> anyhow::Result<()> {
    if module_profile.serves_groland_modules() {
        creator_library_follow_log::ensure_creator_library_follow_log_schema(pool).await?;
        creator_library_access::ensure_creator_library_access_schema(pool).await?;
        creator_library_indexes::ensure_creator_library_concurrency_indexes(pool).await?;
    }
    content_assets_schema::ensure_content_assets_schema(pool).await?;
    auth_schema::ensure_auth_timestamp_schema(pool).await?;
    Ok(())
}

async fn relation_exists(pool: &PgPool, relation: &str) -> anyhow::Result<bool> {
    let value = sqlx::query_scalar::<_, Option<String>>("SELECT to_regclass($1)::TEXT")
        .bind(relation)
        .fetch_one(pool)
        .await?;
    Ok(value.is_some())
}
