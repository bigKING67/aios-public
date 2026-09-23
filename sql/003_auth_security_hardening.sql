-- ============================================================================
-- AIOS Authentication Hardening & RBAC Migration
-- ============================================================================
-- Version: 1.1.0
-- Created: 2026-02-20
-- Description:
--   1. 新增 login_attempts 表（登录失败锁定）
--   2. 幂等补齐 refresh_tokens / audit_logs 表
--   3. 权限码两段式迁移为三段式 module:action:scope
--   4. 初始化 sixseven / groland67 管理员账号
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1) Refresh Token 表（幂等补齐）
-- ============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  device_id VARCHAR(255),
  device_name VARCHAR(255),
  user_agent TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_is_revoked ON refresh_tokens(is_revoked);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- ============================================================================
-- 2) Audit Log 表（幂等补齐）
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action_type VARCHAR(64) NOT NULL,
  action_category VARCHAR(32) NOT NULL,
  actor_user_id BIGINT,
  target_user_id BIGINT,
  description TEXT,
  resource_type VARCHAR(64),
  resource_id BIGINT,
  status VARCHAR(32) NOT NULL,
  error_message TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_id VARCHAR(255),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_category ON audit_logs(action_category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type_id ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);

-- ============================================================================
-- 3) 登录失败记录表（新增）
-- ============================================================================
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_id BIGINT,
  failed_attempts INT NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMP,
  last_failed_at TIMESTAMP,
  locked_until TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_login_attempts_username_ip UNIQUE (username, ip_address),
  CONSTRAINT check_login_attempts_non_negative CHECK (failed_attempts >= 0),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until);
CREATE INDEX IF NOT EXISTS idx_login_attempts_last_failed_at ON login_attempts(last_failed_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trigger_login_attempts_updated_at'
  ) THEN
    CREATE TRIGGER trigger_login_attempts_updated_at
      BEFORE UPDATE ON login_attempts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

-- ============================================================================
-- 4) 权限码迁移：两段式 -> 三段式
-- ============================================================================
WITH duplicated_legacy_permissions AS (
  SELECT p.id
  FROM permissions p
  WHERE p.is_deleted = FALSE
    AND p.code ~ '^[a-z0-9_]+:[a-z0-9_]+$'
    AND EXISTS (
      SELECT 1
      FROM permissions p2
      WHERE p2.code = p.code || ':all'
        AND p2.id <> p.id
    )
)
UPDATE permissions p
SET
  is_deleted = TRUE,
  is_active = FALSE,
  updated_at = CURRENT_TIMESTAMP
WHERE p.id IN (SELECT id FROM duplicated_legacy_permissions);

UPDATE permissions
SET
  code = code || ':all',
  resource_type = COALESCE(NULLIF(resource_type, ''), 'all'),
  updated_at = CURRENT_TIMESTAMP
WHERE is_deleted = FALSE
  AND code ~ '^[a-z0-9_]+:[a-z0-9_]+$';

UPDATE permissions
SET
  module = split_part(code, ':', 1),
  action = split_part(code, ':', 2),
  resource_type = split_part(code, ':', 3),
  updated_at = CURRENT_TIMESTAMP
WHERE is_deleted = FALSE
  AND code ~ '^[a-z0-9_]+:[a-z0-9_]+:[a-z0-9_]+$';

-- ============================================================================
-- 5) 核心权限补齐（全部三段式）
-- ============================================================================
INSERT INTO permissions (
  code,
  display_name,
  description,
  module,
  action,
  resource_type,
  is_system,
  category,
  is_active,
  is_deleted,
  created_at,
  updated_at
)
VALUES
  ('auth:login:all', '登录', '账号密码登录', 'auth', 'login', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('auth:refresh:all', '刷新令牌', '轮换刷新令牌', 'auth', 'refresh', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('auth:logout:all', '登出', '撤销刷新令牌', 'auth', 'logout', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('auth:me:all', '当前用户信息', '查看当前用户及权限', 'auth', 'me', 'all', TRUE, 'data', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('user:list:all', '用户列表', '查看用户列表', 'user', 'list', 'all', TRUE, 'data', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('user:view:all', '用户详情', '查看用户详情', 'user', 'view', 'all', TRUE, 'data', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('user:create:all', '创建用户', '创建新用户', 'user', 'create', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('user:edit:all', '编辑用户', '编辑用户信息', 'user', 'edit', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('user:delete:all', '删除用户', '删除用户', 'user', 'delete', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('user:assign_role:all', '分配用户角色', '给用户分配角色', 'user', 'assign_role', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role:list:all', '角色列表', '查看角色列表', 'role', 'list', 'all', TRUE, 'data', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role:view:all', '角色详情', '查看角色详情', 'role', 'view', 'all', TRUE, 'data', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role:create:all', '创建角色', '创建新角色', 'role', 'create', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role:edit:all', '编辑角色', '编辑角色信息', 'role', 'edit', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role:delete:all', '删除角色', '删除角色', 'role', 'delete', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role:assign_permission:all', '分配角色权限', '给角色分配权限', 'role', 'assign_permission', 'all', TRUE, 'operation', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission:list:all', '权限列表', '查看权限列表', 'permission', 'list', 'all', TRUE, 'data', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission:view:all', '权限详情', '查看权限详情', 'permission', 'view', 'all', TRUE, 'data', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('audit:view:all', '审计日志', '查看审计日志', 'audit', 'view', 'all', TRUE, 'data', TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  resource_type = EXCLUDED.resource_type,
  is_active = TRUE,
  is_deleted = FALSE,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- 6) 确保 admin 角色存在并拥有所有权限
-- ============================================================================
INSERT INTO roles (
  name,
  display_name,
  description,
  category,
  is_system,
  is_active,
  is_deleted,
  created_at,
  updated_at
)
VALUES (
  'admin',
  '管理员',
  '系统超级管理员',
  'system',
  TRUE,
  TRUE,
  FALSE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (name)
DO UPDATE SET
  is_active = TRUE,
  is_deleted = FALSE,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, NULL
FROM roles r
JOIN permissions p
  ON p.is_deleted = FALSE
  AND p.is_active = TRUE
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- 7) 初始化 sixseven 管理员账号
-- ============================================================================
UPDATE users
SET
  password_hash = crypt('groland67', gen_salt('bf', 12)),
  full_name = 'SixSeven Administrator',
  is_active = TRUE,
  is_deleted = FALSE,
  failed_login_attempts = 0,
  last_failed_login_at = NULL,
  password_changed_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
WHERE username = 'sixseven';

INSERT INTO users (
  username,
  email,
  password_hash,
  full_name,
  is_active,
  is_deleted,
  created_at,
  updated_at
)
SELECT
  'sixseven',
  'sixseven_admin@aios.local',
  crypt('groland67', gen_salt('bf', 12)),
  'SixSeven Administrator',
  TRUE,
  FALSE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM users
  WHERE username = 'sixseven'
);

INSERT INTO user_roles (user_id, role_id, created_by)
SELECT u.id, r.id, u.id
FROM users u
JOIN roles r ON r.name = 'admin'
WHERE u.username = 'sixseven'
ON CONFLICT (user_id, role_id) DO NOTHING;

DELETE FROM login_attempts
WHERE username = 'sixseven';

COMMIT;
