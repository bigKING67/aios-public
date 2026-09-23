use sqlx::PgPool;

use super::constants::{
    CREATOR_LIBRARY_MANAGE_PERMISSION, CREATOR_LIBRARY_READ_PERMISSION,
    CREATOR_LIBRARY_WRITE_PERMISSION,
};

pub(super) async fn ensure_auth_rbac(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        ALTER TABLE IF EXISTS public.auth_users
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        ALTER TABLE IF EXISTS public.auth_roles
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO auth_roles (name)
        SELECT name
        FROM (VALUES ('bd'), ('bd_manager')) AS roles(name)
        WHERE NOT EXISTS (
          SELECT 1 FROM auth_roles existing WHERE LOWER(existing.name) = LOWER(roles.name)
        )
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO auth_permissions (key)
        SELECT key
        FROM (
          VALUES
            ($1),
            ($2),
            ($3)
        ) AS permissions(key)
        WHERE NOT EXISTS (
          SELECT 1 FROM auth_permissions existing WHERE existing.key = permissions.key
        )
        "#,
    )
    .bind(CREATOR_LIBRARY_READ_PERMISSION)
    .bind(CREATOR_LIBRARY_WRITE_PERMISSION)
    .bind(CREATOR_LIBRARY_MANAGE_PERMISSION)
    .execute(pool)
    .await?;
    ensure_role_permissions(
        pool,
        "bd",
        &[
            CREATOR_LIBRARY_READ_PERMISSION,
            CREATOR_LIBRARY_WRITE_PERMISSION,
        ],
    )
    .await?;
    ensure_role_permissions(
        pool,
        "bd_manager",
        &[
            CREATOR_LIBRARY_READ_PERMISSION,
            CREATOR_LIBRARY_WRITE_PERMISSION,
            CREATOR_LIBRARY_MANAGE_PERMISSION,
        ],
    )
    .await?;
    Ok(())
}

async fn ensure_role_permissions(
    pool: &PgPool,
    role_name: &str,
    permission_keys: &[&str],
) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO auth_role_permissions (role_id, permission_id)
        SELECT role.id, permission.id
        FROM auth_roles role
        JOIN auth_permissions permission ON permission.key = ANY($2)
        WHERE role.name = $1
          AND NOT EXISTS (
            SELECT 1
            FROM auth_role_permissions existing
            WHERE existing.role_id = role.id
              AND existing.permission_id = permission.id
          )
        "#,
    )
    .bind(role_name)
    .bind(permission_keys)
    .execute(pool)
    .await?;
    Ok(())
}
