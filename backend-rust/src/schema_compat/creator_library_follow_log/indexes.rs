use sqlx::PgPool;

pub(super) async fn ensure_follow_log_indexes(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_influencer_library_follow_log_creator_active
          ON ads.influencer_library_follow_log (
            influencer_library_id,
            followed_at DESC,
            created_at DESC,
            id DESC
          )
          WHERE is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_influencer_library_follow_log_created_by_user_id
          ON ads.influencer_library_follow_log (created_by_user_id)
          WHERE is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
