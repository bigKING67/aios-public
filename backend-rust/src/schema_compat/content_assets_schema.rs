use sqlx::PgPool;

pub(super) async fn ensure_content_assets_schema(pool: &PgPool) -> anyhow::Result<()> {
    let assets_table_exists = sqlx::query_scalar::<_, Option<String>>(
        "SELECT to_regclass('ads.marketing_content_assets')::TEXT",
    )
    .fetch_one(pool)
    .await?
    .is_some();
    if !assets_table_exists {
        return Ok(());
    }

    sqlx::query(
        r#"
        ALTER TABLE IF EXISTS ads.marketing_content_assets
          ADD COLUMN IF NOT EXISTS product_names TEXT[] NOT NULL DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS sku_names TEXT[] NOT NULL DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS platform_names TEXT[] NOT NULL DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS video_type TEXT,
          ADD COLUMN IF NOT EXISTS content_scene TEXT,
          ADD COLUMN IF NOT EXISTS content_scene_group TEXT,
          ADD COLUMN IF NOT EXISTS content_scene_subtype TEXT,
          ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
          ADD COLUMN IF NOT EXISTS uploaded_by_user_id TEXT
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        UPDATE ads.marketing_content_assets
        SET product_names = ARRAY[product_name]
        WHERE product_name IS NOT NULL
          AND NULLIF(BTRIM(product_name), '') IS NOT NULL
          AND CARDINALITY(product_names) = 0
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        UPDATE ads.marketing_content_assets
        SET platform_names = ARRAY[platform]
        WHERE platform IS NOT NULL
          AND NULLIF(BTRIM(platform), '') IS NOT NULL
          AND CARDINALITY(platform_names) = 0
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_product_names
          ON ads.marketing_content_assets USING GIN (product_names)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_sku_names
          ON ads.marketing_content_assets USING GIN (sku_names)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_platform_names
          ON ads.marketing_content_assets USING GIN (platform_names)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_owner_user
          ON ads.marketing_content_assets (owner_user_id)
          WHERE owner_user_id IS NOT NULL AND is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_uploaded_by_user
          ON ads.marketing_content_assets (uploaded_by_user_id)
          WHERE uploaded_by_user_id IS NOT NULL AND is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_video_type
          ON ads.marketing_content_assets (video_type)
          WHERE video_type IS NOT NULL AND is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_content_scene
          ON ads.marketing_content_assets (content_scene)
          WHERE content_scene IS NOT NULL AND is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_content_scene_group
          ON ads.marketing_content_assets (content_scene_group)
          WHERE content_scene_group IS NOT NULL AND is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_content_scene_subtype
          ON ads.marketing_content_assets (content_scene_subtype)
          WHERE content_scene_subtype IS NOT NULL AND is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_raw_sha256
          ON ads.marketing_content_assets (raw_sha256)
          WHERE raw_sha256 IS NOT NULL AND is_deleted = FALSE
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
