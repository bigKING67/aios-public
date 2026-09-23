use sqlx::PgPool;

use crate::error::AppResult;

use super::super::types::{
    BD_MANAGER_ROLE_CODE, BD_ROLE_CODE, CREATOR_LIBRARY_MANAGE_PERMISSION,
    CREATOR_LIBRARY_READ_PERMISSIONS, CREATOR_LIBRARY_WRITE_PERMISSIONS,
};
use super::errors::map_sql_error;

pub(super) async fn ensure_auth_rbac(pool: &PgPool) -> AppResult<()> {
    sqlx::query(
        r#"
        ALTER TABLE IF EXISTS public.auth_users
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        "#,
    )
    .execute(pool)
    .await
    .map_err(map_sql_error("ensure auth user timestamps failed"))?;

    sqlx::query(
        r#"
        ALTER TABLE IF EXISTS public.auth_roles
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        "#,
    )
    .execute(pool)
    .await
    .map_err(map_sql_error("ensure auth role timestamps failed"))?;

    sqlx::query(
        r#"
        INSERT INTO auth_roles (name)
        SELECT name
        FROM (VALUES ($1), ($2)) AS roles(name)
        WHERE NOT EXISTS (
          SELECT 1 FROM auth_roles existing WHERE LOWER(existing.name) = LOWER(roles.name)
        )
        "#,
    )
    .bind(BD_ROLE_CODE)
    .bind(BD_MANAGER_ROLE_CODE)
    .execute(pool)
    .await
    .map_err(map_sql_error("ensure creator library BD roles failed"))?;

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
    .bind(CREATOR_LIBRARY_READ_PERMISSIONS[0])
    .bind(CREATOR_LIBRARY_WRITE_PERMISSIONS[0])
    .bind(CREATOR_LIBRARY_MANAGE_PERMISSION)
    .execute(pool)
    .await
    .map_err(map_sql_error("ensure creator library permissions failed"))?;

    ensure_role_permissions(
        pool,
        BD_ROLE_CODE,
        &[
            CREATOR_LIBRARY_READ_PERMISSIONS[0],
            CREATOR_LIBRARY_WRITE_PERMISSIONS[0],
        ],
    )
    .await?;
    ensure_role_permissions(
        pool,
        BD_MANAGER_ROLE_CODE,
        &[
            CREATOR_LIBRARY_READ_PERMISSIONS[0],
            CREATOR_LIBRARY_WRITE_PERMISSIONS[0],
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
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO auth_role_permissions (role_id, permission_id)
        SELECT role.id, permission.id
        FROM auth_roles role
        JOIN auth_permissions permission ON permission.key = ANY($2)
        WHERE LOWER(role.name) = LOWER($1)
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
    .await
    .map_err(map_sql_error(
        "ensure creator library role permissions failed",
    ))?;
    Ok(())
}
