ALTER TABLE IF EXISTS ads.marketing_content_assets
  ADD COLUMN IF NOT EXISTS product_names TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sku_names TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id TEXT;

UPDATE ads.marketing_content_assets
SET product_names = ARRAY[product_name]
WHERE product_name IS NOT NULL
  AND NULLIF(BTRIM(product_name), '') IS NOT NULL
  AND CARDINALITY(product_names) = 0;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_product_names
  ON ads.marketing_content_assets USING GIN (product_names);

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_sku_names
  ON ads.marketing_content_assets USING GIN (sku_names);

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_owner_user
  ON ads.marketing_content_assets (owner_user_id)
  WHERE owner_user_id IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_uploaded_by_user
  ON ads.marketing_content_assets (uploaded_by_user_id)
  WHERE uploaded_by_user_id IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_raw_sha256
  ON ads.marketing_content_assets (raw_sha256)
  WHERE raw_sha256 IS NOT NULL AND is_deleted = FALSE;

DO $$
BEGIN
  IF to_regclass('public.auth_roles') IS NOT NULL THEN
    INSERT INTO public.auth_roles (name)
    SELECT role_name
    FROM (VALUES ('content_ops'), ('content_ops_manager')) AS roles(role_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.auth_roles existing_role
      WHERE LOWER(existing_role.name) = LOWER(roles.role_name)
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.auth_permissions') IS NOT NULL THEN
    INSERT INTO public.auth_permissions (key)
    SELECT permission_key
    FROM (
      VALUES
        ('marketing:content_assets:read'),
        ('marketing:content_assets:write'),
        ('marketing:content_assets:manage')
    ) AS permissions(permission_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.auth_permissions existing_permission
      WHERE existing_permission.key = permissions.permission_key
    );
  END IF;
END;
$$;

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
$$;

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
$$;
