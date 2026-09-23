-- ============================================================================
-- AIOS Authentication & RBAC System - Database Schema
-- ============================================================================
-- Version: 1.0.0
-- Created: 2026-02-13
-- Description: 企业级认证和权限管理系统的数据库表定义
-- ============================================================================

-- 设置 PostgreSQL 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 1. USERS 表 - 用户基础信息
-- ============================================================================
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt hash, cost=12
  full_name VARCHAR(255),
  avatar_url TEXT,
  phone VARCHAR(20),

  -- 状态管理
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

  -- 账户安全
  failed_login_attempts INT NOT NULL DEFAULT 0,
  last_failed_login_at TIMESTAMP,
  last_login_at TIMESTAMP,
  password_changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT,
  updated_by BIGINT,

  -- 约束
  CONSTRAINT check_is_state CHECK (is_active OR is_deleted),
  CONSTRAINT check_username_length CHECK (LENGTH(username) >= 3),
  CONSTRAINT check_email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  CONSTRAINT check_password_hash_length CHECK (LENGTH(password_hash) = 60)  -- bcrypt hash 固定长度
);

CREATE INDEX idx_users_email ON users(email) WHERE NOT is_deleted;
CREATE INDEX idx_users_username ON users(username) WHERE NOT is_deleted;
CREATE INDEX idx_users_is_active ON users(is_active) WHERE NOT is_deleted;
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login_at ON users(last_login_at);

-- ============================================================================
-- 2. ROLES 表 - 角色定义
-- ============================================================================
CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- 角色分类（用于权限管理和审计）
  category VARCHAR(32) NOT NULL DEFAULT 'custom',  -- system | built_in | custom
  is_system BOOLEAN NOT NULL DEFAULT FALSE,  -- 系统内置角色，不可删除

  -- 状态
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT,
  updated_by BIGINT,

  -- 约束
  CONSTRAINT check_name_format CHECK (name ~ '^[a-z_]+$'),  -- 小写字母和下划线
  CONSTRAINT check_role_not_deleted CHECK (NOT is_deleted OR name IS NOT NULL)
);

CREATE UNIQUE INDEX idx_roles_name ON roles(name) WHERE NOT is_deleted;
CREATE INDEX idx_roles_is_system ON roles(is_system) WHERE NOT is_deleted;
CREATE INDEX idx_roles_category ON roles(category) WHERE NOT is_deleted;
CREATE INDEX idx_roles_is_active ON roles(is_active) WHERE NOT is_deleted;

-- ============================================================================
-- 3. PERMISSIONS 表 - 权限定义
-- ============================================================================
CREATE TABLE permissions (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(128) NOT NULL UNIQUE,  -- e.g., dashboard:view:all, report:export:own
  display_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- 权限分类（便于管理和查询）
  module VARCHAR(64) NOT NULL,        -- dashboard, report, user, role, etc.
  action VARCHAR(64) NOT NULL,        -- view, create, edit, delete, export, etc.
  resource_type VARCHAR(64),          -- all, own, department, etc.

  -- 权限类型
  is_system BOOLEAN NOT NULL DEFAULT FALSE,  -- 系统权限，不可删除
  category VARCHAR(32) NOT NULL DEFAULT 'data',  -- ui | data | operation

  -- 状态
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 约束：权限编码只能包含小写字母、数字、冒号和下划线
  CONSTRAINT check_permission_code CHECK (code ~ '^[a-z0-9_:]+$'),
  CONSTRAINT check_permission_not_deleted CHECK (NOT is_deleted OR code IS NOT NULL)
);

CREATE UNIQUE INDEX idx_permissions_code ON permissions(code) WHERE NOT is_deleted;
CREATE INDEX idx_permissions_module_action ON permissions(module, action) WHERE NOT is_deleted;
CREATE INDEX idx_permissions_is_system ON permissions(is_system) WHERE NOT is_deleted;
CREATE INDEX idx_permissions_category ON permissions(category) WHERE NOT is_deleted;

-- ============================================================================
-- 4. ROLE_PERMISSIONS 表 - 角色权限关系
-- ============================================================================
CREATE TABLE role_permissions (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,

  -- 权限配置（支持更细粒度的权限控制）
  -- 示例：{"department_id": [1, 2], "region": "北京"}
  resource_filter JSONB,

  -- 权限有效期（用于临时角色权限）
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP,  -- NULL 表示永久有效

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT,

  -- 外键和约束
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX idx_role_permissions_valid_period ON role_permissions(valid_from, valid_until);

-- ============================================================================
-- 5. USER_ROLES 表 - 用户角色关系
-- ============================================================================
CREATE TABLE user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,

  -- 角色有效期（支持临时角色授予）
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP,  -- NULL 表示永久有效

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT,

  -- 外键和约束
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_valid_period ON user_roles(valid_from, valid_until);

-- ============================================================================
-- 6. USER_PERMISSIONS 表 - 用户直接权限（用于临时授权）
-- ============================================================================
CREATE TABLE user_permissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,

  -- 权限有效期
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP,  -- NULL 表示永久有效

  -- 授权原因和来源
  grant_reason VARCHAR(255),
  grant_source VARCHAR(32),  -- manual | workflow | api | auto_escalate

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT,

  -- 外键和约束
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(user_id, permission_id)
);

CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_permission_id ON user_permissions(permission_id);
CREATE INDEX idx_user_permissions_valid_period ON user_permissions(valid_from, valid_until);

-- ============================================================================
-- 7. REFRESH_TOKENS 表 - Refresh Token 管理
-- ============================================================================
CREATE TABLE refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA256 hash of the token

  -- Token 状态
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,

  -- 设备信息（可选，用于设备管理）
  device_id VARCHAR(255),
  device_name VARCHAR(255),
  user_agent TEXT,
  ip_address VARCHAR(45),  -- IPv4 (15) or IPv6 (39)

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,

  -- 外键
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_is_revoked ON refresh_tokens(is_revoked);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- ============================================================================
-- 8. AUDIT_LOGS 表 - 审计日志
-- ============================================================================
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,

  -- 操作信息
  action_type VARCHAR(64) NOT NULL,     -- login, logout, create_user, delete_role, etc.
  action_category VARCHAR(32) NOT NULL,  -- auth | user | role | permission | data

  -- 操作者信息
  actor_user_id BIGINT,                 -- 操作者ID（可能为NULL，如系统操作）
  target_user_id BIGINT,                -- 目标用户ID（可能为NULL）

  -- 操作详情
  description TEXT,
  resource_type VARCHAR(64),            -- user, role, permission, report, dashboard, etc.
  resource_id BIGINT,

  -- 操作结果
  status VARCHAR(32) NOT NULL,          -- success | failure
  error_message TEXT,

  -- 环境信息
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_id VARCHAR(255),              -- 用于链路追踪

  -- 变更数据（变更前后对比）
  old_values JSONB,
  new_values JSONB,

  -- 时间
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_action_category ON audit_logs(action_category);
CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_target_user_id ON audit_logs(target_user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource_type_id ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_status ON audit_logs(status);

-- ============================================================================
-- 9. SESSIONS 表 - 会话管理（可选，用于控制并发登录）
-- ============================================================================
CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  session_token_hash VARCHAR(64) NOT NULL UNIQUE,

  -- 会话信息
  device_id VARCHAR(255),
  device_name VARCHAR(255),
  user_agent TEXT,
  ip_address VARCHAR(45),

  -- 会话状态
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,

  -- 审计
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_is_active ON sessions(is_active);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_session_token_hash ON sessions(session_token_hash);

-- ============================================================================
-- 视图：用户权限视图（用于权限查询）
-- ============================================================================
CREATE VIEW user_permissions_view AS
SELECT DISTINCT
  u.id as user_id,
  p.id as permission_id,
  p.code,
  p.display_name,
  p.module,
  p.action,
  p.resource_type,
  'role' as grant_type,
  ur.valid_until
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN role_permissions rp ON ur.role_id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
WHERE u.is_active = TRUE
  AND u.is_deleted = FALSE
  AND p.is_active = TRUE
  AND p.is_deleted = FALSE
  AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
  AND (rp.valid_until IS NULL OR rp.valid_until > CURRENT_TIMESTAMP)

UNION ALL

SELECT
  u.id as user_id,
  p.id as permission_id,
  p.code,
  p.display_name,
  p.module,
  p.action,
  p.resource_type,
  'direct' as grant_type,
  up.valid_until
FROM users u
JOIN user_permissions up ON u.id = up.user_id
JOIN permissions p ON up.permission_id = p.id
WHERE u.is_active = TRUE
  AND u.is_deleted = FALSE
  AND p.is_active = TRUE
  AND p.is_deleted = FALSE
  AND (up.valid_until IS NULL OR up.valid_until > CURRENT_TIMESTAMP);

-- ============================================================================
-- 触发器：自动更新 updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_permissions_updated_at BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 注释：表和列的文档
-- ============================================================================
COMMENT ON TABLE users IS '用户表：存储用户基础信息和认证数据';
COMMENT ON COLUMN users.password_hash IS 'bcrypt 哈希密码，固定长度 60';
COMMENT ON COLUMN users.failed_login_attempts IS '连续登录失败次数（成功登录后重置）';
COMMENT ON COLUMN users.last_failed_login_at IS '最后一次登录失败的时间';

COMMENT ON TABLE roles IS '角色表：存储角色定义和分类';
COMMENT ON COLUMN roles.is_system IS '系统内置角色，不可修改或删除';
COMMENT ON COLUMN roles.category IS '角色分类：system(系统) | built_in(内置) | custom(自定义)';

COMMENT ON TABLE permissions IS '权限表：存储权限定义，编码规范为 module:action:resource_type';
COMMENT ON COLUMN permissions.resource_filter IS 'JSONB 格式的资源过滤条件，用于细粒度权限控制';

COMMENT ON TABLE audit_logs IS '审计日志表：记录所有敏感操作，用于合规性检查和问题排查';
COMMENT ON COLUMN audit_logs.request_id IS '请求唯一标识，用于分布式链路追踪';

-- ============================================================================
-- 最终验证
-- ============================================================================
-- 执行以下 SQL 检查所有表和索引是否创建成功
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;
