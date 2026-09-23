use sqlx::PgPool;

pub(super) async fn ensure_follow_log_updated_at_trigger(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        CREATE OR REPLACE FUNCTION ads.fn_touch_influencer_library_follow_log_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at := NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        DROP TRIGGER IF EXISTS trg_touch_influencer_library_follow_log_updated_at
          ON ads.influencer_library_follow_log
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TRIGGER trg_touch_influencer_library_follow_log_updated_at
        BEFORE UPDATE ON ads.influencer_library_follow_log
        FOR EACH ROW
        EXECUTE FUNCTION ads.fn_touch_influencer_library_follow_log_updated_at()
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
