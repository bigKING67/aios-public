use sqlx::PgPool;

use super::relation_exists;

pub(super) async fn ensure_creator_library_concurrency_indexes(
    pool: &PgPool,
) -> anyhow::Result<()> {
    if !relation_exists(pool, "ads.influencer_library").await? {
        return Ok(());
    }

    sqlx::query("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        .execute(pool)
        .await?;

    for sql in [
        r#"
        CREATE INDEX IF NOT EXISTS idx_influencer_library_updated_active
          ON ads.influencer_library (updated_at DESC, id DESC)
          WHERE is_deleted = FALSE
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS idx_influencer_library_name_trgm_active
          ON ads.influencer_library
          USING GIN (influencer_name gin_trgm_ops)
          WHERE is_deleted = FALSE
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS idx_influencer_library_influencer_id_trgm_active
          ON ads.influencer_library
          USING GIN (influencer_id gin_trgm_ops)
          WHERE is_deleted = FALSE
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS idx_influencer_library_tags_gin_active
          ON ads.influencer_library
          USING GIN (tags)
          WHERE is_deleted = FALSE
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS idx_influencer_library_owner_user_updated_active
          ON ads.influencer_library (owner_user_id, updated_at DESC, id DESC)
          WHERE is_deleted = FALSE
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS idx_influencer_library_created_by_updated_active
          ON ads.influencer_library (created_by_user_id, updated_at DESC, id DESC)
          WHERE is_deleted = FALSE
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS idx_influencer_library_cooperation_updated_active
          ON ads.influencer_library (cooperation_status_norm, updated_at DESC, id DESC)
          WHERE is_deleted = FALSE
        "#,
    ] {
        sqlx::query(sql).execute(pool).await?;
    }

    Ok(())
}
