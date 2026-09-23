mod backfill;
mod indexes;
mod table;
mod triggers;

use sqlx::PgPool;

use super::relation_exists;

pub(super) async fn ensure_creator_library_follow_log_schema(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query("CREATE SCHEMA IF NOT EXISTS ads")
        .execute(pool)
        .await?;

    if !relation_exists(pool, "ads.influencer_library").await? {
        return Ok(());
    }

    table::ensure_follow_log_table(pool).await?;
    indexes::ensure_follow_log_indexes(pool).await?;
    triggers::ensure_follow_log_updated_at_trigger(pool).await?;
    backfill::backfill_follow_log_from_legacy_columns(pool).await?;
    backfill::sync_legacy_follow_columns_from_latest_log(pool).await?;

    Ok(())
}
