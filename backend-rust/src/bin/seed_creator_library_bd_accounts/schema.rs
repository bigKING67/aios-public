use anyhow::anyhow;
use sqlx::{PgPool, Row};

use super::rbac::ensure_auth_rbac;

pub(super) async fn ensure_schema(pool: &PgPool) -> anyhow::Result<()> {
    let has_auth_users = table_exists(pool, "public.auth_users").await?;
    let has_auth_roles = table_exists(pool, "public.auth_roles").await?;
    let has_auth_permissions = table_exists(pool, "public.auth_permissions").await?;
    let has_auth_user_roles = table_exists(pool, "public.auth_user_roles").await?;
    let has_auth_role_permissions = table_exists(pool, "public.auth_role_permissions").await?;
    if !(has_auth_users
        && has_auth_roles
        && has_auth_permissions
        && has_auth_user_roles
        && has_auth_role_permissions)
    {
        return Err(anyhow!(
            "auth tables are required: auth_users/auth_roles/auth_permissions/auth_user_roles/auth_role_permissions"
        ));
    }

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
          updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
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
    ensure_auth_rbac(pool).await?;
    Ok(())
}

async fn table_exists(pool: &PgPool, table: &str) -> anyhow::Result<bool> {
    let row = sqlx::query("SELECT to_regclass($1) IS NOT NULL AS exists")
        .bind(table)
        .fetch_one(pool)
        .await?;
    Ok(row.try_get("exists").unwrap_or(false))
}
