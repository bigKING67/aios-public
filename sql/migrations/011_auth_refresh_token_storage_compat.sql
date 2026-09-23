-- ============================================================================
-- Migration 011: Auth Refresh Token Storage Compatibility
-- ============================================================================
-- Created: 2026-03-06
-- Purpose:
-- 1) 固化 refresh_tokens 表，兼容 text/uuid/bigint 用户 ID
-- 2) 移除 refresh_tokens.user_id 的外键依赖，避免多用户表形态冲突
-- 3) 幂等补齐 refresh_tokens 关键字段与索引，并清理 token_hash 冗余唯一索引
--
-- 背景：
-- - 认证服务会在 auth_users/users/ods_datahub_users 三套结构之间回退查询。
-- - refresh_tokens 若固定为 BIGINT + FK users(id)，当用户 ID 是 UUID 文本时会写入失败（42804）。
-- - 本迁移将 refresh_tokens.user_id 统一为 TEXT，并去除 FK，避免跨表形态不一致导致登录 500。

BEGIN;

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  device_id VARCHAR(255),
  device_name VARCHAR(255),
  user_agent TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP
);

ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS device_name VARCHAR(255);
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;
ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP;

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'refresh_tokens'
      AND tc.constraint_type = 'FOREIGN KEY'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.refresh_tokens DROP CONSTRAINT IF EXISTS %I',
      fk.constraint_name
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  user_id_type text;
BEGIN
  SELECT data_type
  INTO user_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'refresh_tokens'
    AND column_name = 'user_id';

  IF user_id_type IS DISTINCT FROM 'text' THEN
    ALTER TABLE public.refresh_tokens
      ALTER COLUMN user_id TYPE TEXT USING user_id::text;
  END IF;
END;
$$;

ALTER TABLE public.refresh_tokens
  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.refresh_tokens
  ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE public.refresh_tokens
  ALTER COLUMN is_revoked SET NOT NULL;
ALTER TABLE public.refresh_tokens
  ALTER COLUMN is_revoked SET DEFAULT FALSE;
ALTER TABLE public.refresh_tokens
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.refresh_tokens
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

DO $$
DECLARE
  token_hash_unique_exists boolean := FALSE;
  idx_reg regclass := to_regclass('public.idx_refresh_tokens_token_hash');
  has_token_hash_unique_constraint boolean := FALSE;
  idx_owned_by_constraint boolean := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'refresh_tokens'
      AND i.indisunique
      AND pg_get_indexdef(i.indexrelid) ILIKE '%(token_hash)%'
  )
  INTO token_hash_unique_exists;

  IF NOT token_hash_unique_exists THEN
    EXECUTE 'CREATE UNIQUE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens(token_hash)';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.refresh_tokens'::regclass
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (token_hash%'
  )
  INTO has_token_hash_unique_constraint;

  IF idx_reg IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.conindid = idx_reg
    )
    INTO idx_owned_by_constraint;

    IF has_token_hash_unique_constraint AND NOT idx_owned_by_constraint THEN
      EXECUTE 'DROP INDEX IF EXISTS public.idx_refresh_tokens_token_hash';
    END IF;
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON public.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
  ON public.refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_is_revoked
  ON public.refresh_tokens(is_revoked);

COMMIT;
