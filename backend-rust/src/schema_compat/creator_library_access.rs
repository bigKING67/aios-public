use sqlx::PgPool;

pub(super) async fn ensure_creator_library_access_schema(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query("CREATE SCHEMA IF NOT EXISTS ads")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        ALTER TABLE IF EXISTS ads.influencer_library
          ADD COLUMN IF NOT EXISTS owner_user_id TEXT
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS ads.creator_library_bd_identity (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          display_name TEXT NOT NULL,
          owner_alias TEXT NOT NULL,
          owner_alias_norm TEXT NOT NULL,
          is_primary BOOLEAN NOT NULL DEFAULT FALSE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_creator_library_bd_identity_user_id_not_blank CHECK (BTRIM(user_id) <> ''),
          CONSTRAINT chk_creator_library_bd_identity_username_not_blank CHECK (BTRIM(username) <> ''),
          CONSTRAINT chk_creator_library_bd_identity_display_name_not_blank CHECK (BTRIM(display_name) <> ''),
          CONSTRAINT chk_creator_library_bd_identity_owner_alias_not_blank CHECK (BTRIM(owner_alias) <> ''),
          CONSTRAINT chk_creator_library_bd_identity_owner_alias_norm_not_blank CHECK (BTRIM(owner_alias_norm) <> '')
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE UNIQUE INDEX IF NOT EXISTS ux_creator_library_bd_identity_alias_active
          ON ads.creator_library_bd_identity (owner_alias_norm)
          WHERE is_active = TRUE
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_creator_library_bd_identity_user_active
          ON ads.creator_library_bd_identity (user_id)
          WHERE is_active = TRUE
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        DO $$
        BEGIN
          IF to_regclass('ads.influencer_library') IS NOT NULL THEN
            CREATE INDEX IF NOT EXISTS idx_influencer_library_owner_user_id_active
              ON ads.influencer_library (owner_user_id)
              WHERE is_deleted = FALSE;
            CREATE INDEX IF NOT EXISTS idx_influencer_library_updated_active
              ON ads.influencer_library (updated_at DESC, id DESC)
              WHERE is_deleted = FALSE;
          END IF;
        END;
        $$
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE OR REPLACE FUNCTION ads.fn_touch_creator_library_bd_identity_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.owner_alias_norm := LOWER(BTRIM(NEW.owner_alias));
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
        DROP TRIGGER IF EXISTS trg_touch_creator_library_bd_identity_updated_at
          ON ads.creator_library_bd_identity
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TRIGGER trg_touch_creator_library_bd_identity_updated_at
        BEFORE UPDATE ON ads.creator_library_bd_identity
        FOR EACH ROW
        EXECUTE FUNCTION ads.fn_touch_creator_library_bd_identity_updated_at()
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
