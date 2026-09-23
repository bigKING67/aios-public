use sqlx::PgPool;

pub(super) async fn ensure_auth_timestamp_schema(pool: &PgPool) -> anyhow::Result<()> {
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
        DO $$
        BEGIN
          IF to_regclass('public.auth_roles') IS NOT NULL THEN
            INSERT INTO public.auth_roles (name)
            SELECT role_name
            FROM (VALUES ('bd'), ('bd_manager'), ('content_ops'), ('content_ops_manager')) AS roles(role_name)
            WHERE NOT EXISTS (
              SELECT 1
              FROM public.auth_roles existing_role
              WHERE LOWER(existing_role.name) = LOWER(roles.role_name)
            );
          END IF;
        END;
        $$
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        DO $$
        BEGIN
          IF to_regclass('public.auth_permissions') IS NOT NULL THEN
            INSERT INTO public.auth_permissions (key)
            SELECT permission_key
            FROM (
              VALUES
                ('marketing:creator_library:read'),
                ('marketing:creator_library:write'),
                ('marketing:creator_library:manage'),
                ('marketing:content_assets:read'),
                ('marketing:content_assets:write'),
                ('marketing:content_assets:manage')
            ) AS permissions(permission_key)
            WHERE NOT EXISTS (
              SELECT 1
              FROM public.auth_permissions existing_permission
              WHERE existing_permission.key = permissions.permission_key
            );
          END IF;
        END;
        $$
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        DO $$
        BEGIN
          IF to_regclass('public.auth_role_permissions') IS NOT NULL THEN
            DELETE FROM public.auth_role_permissions role_permission
            USING public.auth_roles role, public.auth_permissions permission
            WHERE role_permission.role_id = role.id
              AND role_permission.permission_id = permission.id
              AND role.name IN ('bd', 'bd_manager')
              AND permission.key IN (
                'marketing:content_assets:write',
                'marketing:content_assets:manage'
              );

            INSERT INTO public.auth_role_permissions (role_id, permission_id)
            SELECT role.id, permission.id
            FROM public.auth_roles AS role
            JOIN public.auth_permissions AS permission
              ON permission.key IN (
                'marketing:creator_library:read',
                'marketing:creator_library:write',
                'marketing:content_assets:read'
              )
            WHERE role.name = 'bd'
              AND NOT EXISTS (
                SELECT 1
                FROM public.auth_role_permissions existing_mapping
                WHERE existing_mapping.role_id = role.id
                  AND existing_mapping.permission_id = permission.id
              );
          END IF;
        END;
        $$
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        DO $$
        BEGIN
          IF to_regclass('public.auth_role_permissions') IS NOT NULL THEN
            INSERT INTO public.auth_role_permissions (role_id, permission_id)
            SELECT role.id, permission.id
            FROM public.auth_roles AS role
            JOIN public.auth_permissions AS permission
              ON permission.key IN (
                'marketing:content_assets:read',
                'marketing:content_assets:write'
              )
            WHERE role.name = 'content_ops'
              AND NOT EXISTS (
                SELECT 1
                FROM public.auth_role_permissions existing_mapping
                WHERE existing_mapping.role_id = role.id
                  AND existing_mapping.permission_id = permission.id
              );

            INSERT INTO public.auth_role_permissions (role_id, permission_id)
            SELECT role.id, permission.id
            FROM public.auth_roles AS role
            JOIN public.auth_permissions AS permission
              ON permission.key IN (
                'marketing:content_assets:read',
                'marketing:content_assets:write',
                'marketing:content_assets:manage'
              )
            WHERE role.name = 'content_ops_manager'
              AND NOT EXISTS (
                SELECT 1
                FROM public.auth_role_permissions existing_mapping
                WHERE existing_mapping.role_id = role.id
                  AND existing_mapping.permission_id = permission.id
              );
          END IF;
        END;
        $$
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        DO $$
        BEGIN
          IF to_regclass('public.auth_user_roles') IS NOT NULL
             AND to_regclass('public.auth_users') IS NOT NULL
             AND to_regclass('public.auth_roles') IS NOT NULL THEN
            INSERT INTO public.auth_user_roles (user_id, role_id)
            SELECT user_item.id, role.id
            FROM public.auth_users user_item
            JOIN public.auth_roles role ON role.name = 'content_ops'
            WHERE LOWER(user_item.username) IN ('__public_identity_bootstrap_disabled__')
              AND NOT EXISTS (
                SELECT 1
                FROM public.auth_user_roles existing_mapping
                WHERE existing_mapping.user_id = user_item.id
                  AND existing_mapping.role_id = role.id
              );

            INSERT INTO public.auth_user_roles (user_id, role_id)
            SELECT user_item.id, role.id
            FROM public.auth_users user_item
            JOIN public.auth_roles role ON role.name = 'content_ops_manager'
            WHERE LOWER(user_item.username) IN ('__public_identity_bootstrap_disabled__')
              AND NOT EXISTS (
                SELECT 1
                FROM public.auth_user_roles existing_mapping
                WHERE existing_mapping.user_id = user_item.id
                  AND existing_mapping.role_id = role.id
              );
          END IF;
        END;
        $$
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        DO $$
        BEGIN
          IF to_regclass('public.auth_role_permissions') IS NOT NULL THEN
            INSERT INTO public.auth_role_permissions (role_id, permission_id)
            SELECT role.id, permission.id
            FROM public.auth_roles AS role
            JOIN public.auth_permissions AS permission
              ON permission.key IN (
                'marketing:creator_library:read',
                'marketing:creator_library:write',
                'marketing:creator_library:manage',
                'marketing:content_assets:read'
              )
            WHERE role.name = 'bd_manager'
              AND NOT EXISTS (
                SELECT 1
                FROM public.auth_role_permissions existing_mapping
                WHERE existing_mapping.role_id = role.id
                  AND existing_mapping.permission_id = permission.id
              );
          END IF;
        END;
        $$
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
