BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;

ALTER TABLE IF EXISTS ads.influencer_library
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT;

COMMENT ON COLUMN ads.influencer_library.owner_user_id
IS '达人库稳定归属账号 ID。owner_name 仅作为展示/兼容字段，记录级权限以 owner_user_id 优先。';

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
);

COMMENT ON TABLE ads.creator_library_bd_identity
IS '达人库 BD 账号身份映射。用 owner_alias 兼容旧归属BD文本，用 user_id 做权限判断。';
COMMENT ON COLUMN ads.creator_library_bd_identity.user_id
IS 'auth_users/users/ods 用户 ID 的文本形态。';
COMMENT ON COLUMN ads.creator_library_bd_identity.owner_alias
IS '达人库旧 owner_name 文本或业务别名。';
COMMENT ON COLUMN ads.creator_library_bd_identity.owner_alias_norm
IS 'owner_alias 的小写 trim 归一值，用于唯一匹配。';

CREATE UNIQUE INDEX IF NOT EXISTS ux_creator_library_bd_identity_alias_active
  ON ads.creator_library_bd_identity (owner_alias_norm)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_creator_library_bd_identity_user_active
  ON ads.creator_library_bd_identity (user_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_influencer_library_owner_user_id_active
  ON ads.influencer_library (owner_user_id)
  WHERE is_deleted = FALSE;

CREATE OR REPLACE FUNCTION ads.fn_touch_creator_library_bd_identity_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.owner_alias_norm := LOWER(BTRIM(NEW.owner_alias));
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_creator_library_bd_identity_updated_at
  ON ads.creator_library_bd_identity;

CREATE TRIGGER trg_touch_creator_library_bd_identity_updated_at
BEFORE UPDATE ON ads.creator_library_bd_identity
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_creator_library_bd_identity_updated_at();

ALTER TABLE IF EXISTS public.auth_users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS public.auth_roles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF to_regclass('public.auth_roles') IS NOT NULL THEN
    INSERT INTO public.auth_roles (name)
    SELECT role_name
    FROM (VALUES ('bd'), ('bd_manager')) AS roles(role_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.auth_roles existing_role
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
        ('marketing:creator_library:read'),
        ('marketing:creator_library:write'),
        ('marketing:creator_library:manage')
    ) AS permissions(permission_key)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.auth_permissions existing_permission
      WHERE existing_permission.key = permissions.permission_key
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.auth_role_permissions') IS NOT NULL THEN
    INSERT INTO public.auth_role_permissions (role_id, permission_id)
    SELECT role.id, permission.id
    FROM public.auth_roles AS role
    JOIN public.auth_permissions AS permission
      ON permission.key IN (
        'marketing:creator_library:read',
        'marketing:creator_library:write'
      )
    WHERE role.name = 'bd'
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
        'marketing:creator_library:read',
        'marketing:creator_library:write',
        'marketing:creator_library:manage'
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
$$;

COMMIT;
