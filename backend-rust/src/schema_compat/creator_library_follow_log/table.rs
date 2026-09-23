use sqlx::PgPool;

pub(super) async fn ensure_follow_log_table(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS ads.influencer_library_follow_log (
          id BIGSERIAL PRIMARY KEY,
          influencer_library_id BIGINT NOT NULL REFERENCES ads.influencer_library(id) ON DELETE CASCADE,
          followed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT date_trunc('minute', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai'),
          follow_note TEXT NOT NULL,
          created_by TEXT,
          updated_by TEXT,
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
          is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
          deleted_by TEXT,
          deleted_by_user_id TEXT,
          deleted_at TIMESTAMP WITHOUT TIME ZONE,
          CONSTRAINT chk_influencer_library_follow_log_note_not_blank CHECK (BTRIM(follow_note) <> '')
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'ads'
              AND table_name = 'influencer_library_follow_log'
              AND column_name = 'followed_at'
              AND data_type <> 'timestamp without time zone'
          ) THEN
            ALTER TABLE ads.influencer_library_follow_log
              ALTER COLUMN followed_at TYPE TIMESTAMP WITHOUT TIME ZONE
              USING followed_at::TIMESTAMP WITHOUT TIME ZONE;
          END IF;
        END;
        $$
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        ALTER TABLE IF EXISTS ads.influencer_library_follow_log
          ALTER COLUMN followed_at SET DEFAULT date_trunc('minute', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
