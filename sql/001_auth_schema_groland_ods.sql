-- ============================================================================
-- AIOS Authentication & RBAC System - Database Schema
-- ============================================================================
-- Version: 1.0.1 (Adjusted for groland ODS layer)
-- Created: 2026-02-13
-- Modified: 2026-02-13
-- Description: 企业级认证和权限管理系统的数据库表定义
--
-- Database: groland (ODS layer)
-- Host: 100.71.81.102:5432
-- User: postgres
-- Password: groland67
-- Naming Convention: ods_aios_<table_name>
--
-- Connection command:
-- psql -h 100.71.81.102 -p 5432 -U postgres -d groland -f sql/001_auth_schema_groland_ods.sql
-- Password: groland67
--
-- ============================================================================

-- 设置 PostgreSQL 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 1. ods_aios_users 表 - 用户基础信息与认证凭证
-- 说明：存储所有用户的基础信息、认证凭证、账户状态和安全相关的信息
-- ============================================================================
CREATE TABLE IF NOT EXISTS ods_aios_users (
  id BIGSERIAL PRIMARY KEY COMMENT '用户ID，自增主键',
  username VARCHAR(64) NOT NULL UNIQUE COMMENT '用户名，唯一标识，3-64个字符',
  email VARCHAR(255) NOT NULL UNIQUE COMMENT '邮箱地址，唯一标识，用于密码重置等操作',
  password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt密码哈希值，固定长度60字节（cost=12）',
  full_name VARCHAR(255) COMMENT '用户全名，显示用',
  avatar_url TEXT COMMENT '用户头像URL地址',
  phone VARCHAR(20) COMMENT '用户电话号码',

  -- 状态管理
  is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '账户是否激活，true=激活，false=禁用',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE COMMENT '逻辑删除标志，true=已删除，false=未删除',

  -- 账户安全
  failed_login_attempts INT NOT NULL DEFAULT 0 COMMENT '连续登录失败次数，成功登录后重置为0',
  last_failed_login_at TIMESTAMP COMMENT '最后一次登录失败的时间，用于暴力破解防护',
  last_login_at TIMESTAMP COMMENT '最后一次成功登录的时间',
  password_changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '密码最后修改时间',

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '用户创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '用户信息最后修改时间（自动更新）',
  created_by BIGINT COMMENT '创建此用户的操作者ID',
  updated_by BIGINT COMMENT '最后修改此用户的操作者ID',

  -- 约束
  CONSTRAINT check_users_is_state CHECK (is_active OR is_deleted) COMMENT '确保逻辑状态一致',
  CONSTRAINT check_users_username_length CHECK (LENGTH(username) >= 3) COMMENT '用户名至少3个字符',
  CONSTRAINT check_users_email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') COMMENT '邮箱格式验证',
  CONSTRAINT check_users_password_hash_length CHECK (LENGTH(password_hash) = 60) COMMENT 'bcrypt哈希值固定60字节'
);

COMMENT ON TABLE ods_aios_users IS '用户表：存储用户基础信息、认证凭证、账户状态和安全记录';

CREATE INDEX IF NOT EXISTS idx_ods_aios_users_email ON ods_aios_users(email) WHERE NOT is_deleted COMMENT '邮箱查询索引，加速登录和邮箱查找';
CREATE INDEX IF NOT EXISTS idx_ods_aios_users_username ON ods_aios_users(username) WHERE NOT is_deleted COMMENT '用户名查询索引，加速登录验证';
CREATE INDEX IF NOT EXISTS idx_ods_aios_users_is_active ON ods_aios_users(is_active) WHERE NOT is_deleted COMMENT '激活状态过滤索引，加速用户列表查询';
CREATE INDEX IF NOT EXISTS idx_ods_aios_users_created_at ON ods_aios_users(created_at) COMMENT '创建时间索引，加速时间范围查询';
CREATE INDEX IF NOT EXISTS idx_ods_aios_users_last_login_at ON ods_aios_users(last_login_at) COMMENT '最后登录时间索引，用于用户活跃度分析';

-- ============================================================================
-- 2. ods_aios_roles 表 - 角色定义与分类
-- 说明：存储所有的角色定义、分类信息和角色元数据。与权限表关联，实现RBAC的角色部分
-- ============================================================================
CREATE TABLE IF NOT EXISTS ods_aios_roles (
  id BIGSERIAL PRIMARY KEY COMMENT '角色ID，自增主键',
  name VARCHAR(64) NOT NULL UNIQUE COMMENT '角色代码名称，唯一标识，小写字母和下划线，如：admin, analyst',
  display_name VARCHAR(255) NOT NULL COMMENT '角色显示名称，用于UI展示，如：管理员, 数据分析师',
  description TEXT COMMENT '角色描述，说明该角色的职能和权限范围',

  -- 角色分类（用于权限管理和审计）
  category VARCHAR(32) NOT NULL DEFAULT 'custom' COMMENT '角色分类：system(系统内置) | built_in(预设) | custom(自定义)',
  is_system BOOLEAN NOT NULL DEFAULT FALSE COMMENT '系统内置角色标志，true=系统角色不可删除，false=自定义角色可删除',

  -- 状态
  is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '角色是否激活，true=可用，false=停用',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE COMMENT '逻辑删除标志，true=已删除，false=未删除',

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '角色创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '角色最后修改时间（自动更新）',
  created_by BIGINT COMMENT '创建此角色的操作者ID',
  updated_by BIGINT COMMENT '最后修改此角色的操作者ID',

  -- 约束
  CONSTRAINT check_roles_name_format CHECK (name ~ '^[a-z_]+$') COMMENT '角色名只能包含小写字母和下划线',
  CONSTRAINT check_roles_not_deleted CHECK (NOT is_deleted OR name IS NOT NULL) COMMENT '逻辑一致性检查'
);

COMMENT ON TABLE ods_aios_roles IS '角色表：定义系统中的角色，支持RBAC权限模型。与role_permissions表关联实现角色权限映射';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ods_aios_roles_name ON ods_aios_roles(name) WHERE NOT is_deleted COMMENT '角色名唯一性索引，加速角色查找';
CREATE INDEX IF NOT EXISTS idx_ods_aios_roles_is_system ON ods_aios_roles(is_system) WHERE NOT is_deleted COMMENT '系统角色过滤索引';
CREATE INDEX IF NOT EXISTS idx_ods_aios_roles_category ON ods_aios_roles(category) WHERE NOT is_deleted COMMENT '角色分类索引，支持按类型查询';
CREATE INDEX IF NOT EXISTS idx_ods_aios_roles_is_active ON ods_aios_roles(is_active) WHERE NOT is_deleted COMMENT '激活状态索引，加速有效角色查询';

-- ============================================================================
-- 3. ods_aios_permissions 表 - 权限定义与分类
-- 说明：存储所有权限的定义、分类和元信息。权限遵循 module:action:resource_type 编码规范
-- 示例权限代码：dashboard:view:all, report:export:own, user:delete:all
-- ============================================================================
CREATE TABLE IF NOT EXISTS ods_aios_permissions (
  id BIGSERIAL PRIMARY KEY COMMENT '权限ID，自增主键',
  code VARCHAR(128) NOT NULL UNIQUE COMMENT '权限编码，唯一标识，格式：module:action:resource_type，如：dashboard:view:all',
  display_name VARCHAR(255) NOT NULL COMMENT '权限显示名称，用于UI展示和权限选择界面',
  description TEXT COMMENT '权限描述，说明该权限的具体含义和使用场景',

  -- 权限分类（便于管理和查询）
  module VARCHAR(64) NOT NULL COMMENT '权限模块，如：dashboard, report, user, role, permission, audit, system',
  action VARCHAR(64) NOT NULL COMMENT '权限操作，如：view, create, edit, delete, export, share, list',
  resource_type VARCHAR(64) COMMENT '资源范围，如：all(所有), own(自己的), department(部门内), shared(共享)',

  -- 权限类型
  is_system BOOLEAN NOT NULL DEFAULT FALSE COMMENT '系统权限标志，true=系统权限不可删除，false=自定义权限可删除',
  category VARCHAR(32) NOT NULL DEFAULT 'data' COMMENT '权限分类：ui(界面权限) | data(数据权限) | operation(操作权限)',

  -- 状态
  is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '权限是否激活，true=可用，false=停用',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE COMMENT '逻辑删除标志，true=已删除，false=未删除',

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '权限创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '权限最后修改时间（自动更新）',

  -- 约束：权限编码只能包含小写字母、数字、冒号和下划线
  CONSTRAINT check_permissions_code CHECK (code ~ '^[a-z0-9_:]+$') COMMENT '权限编码格式验证',
  CONSTRAINT check_permissions_not_deleted CHECK (NOT is_deleted OR code IS NOT NULL) COMMENT '逻辑一致性检查'
);

COMMENT ON TABLE ods_aios_permissions IS '权限表：定义系统中的所有权限。权限编码遵循 module:action:resource_type 规范。与role_permissions和user_permissions表关联实现权限管理';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ods_aios_permissions_code ON ods_aios_permissions(code) WHERE NOT is_deleted COMMENT '权限编码唯一性索引，加速权限查找';
CREATE INDEX IF NOT EXISTS idx_ods_aios_permissions_module_action ON ods_aios_permissions(module, action) WHERE NOT is_deleted COMMENT '模块操作复合索引，加速权限分类查询';
CREATE INDEX IF NOT EXISTS idx_ods_aios_permissions_is_system ON ods_aios_permissions(is_system) WHERE NOT is_deleted COMMENT '系统权限过滤索引';
CREATE INDEX IF NOT EXISTS idx_ods_aios_permissions_category ON ods_aios_permissions(category) WHERE NOT is_deleted COMMENT '权限分类索引，支持权限分组展示';

-- ============================================================================
-- 4. ods_aios_role_permissions 表 - 角色权限关系
-- 说明：存储角色和权限的关联关系。实现了权限的细粒度控制和临时权限机制
-- 支持资源级过滤（resource_filter）和时间限制（valid_until）
-- ============================================================================
CREATE TABLE IF NOT EXISTS ods_aios_role_permissions (
  id BIGSERIAL PRIMARY KEY COMMENT '关系ID，自增主键',
  role_id BIGINT NOT NULL COMMENT '角色ID，外键关联ods_aios_roles表',
  permission_id BIGINT NOT NULL COMMENT '权限ID，外键关联ods_aios_permissions表',

  -- 权限配置（支持更细粒度的权限控制）
  -- 示例：{"department_id": [1, 2], "region": "北京"}
  resource_filter JSONB COMMENT 'JSON格式的资源过滤条件，用于实现属性级权限控制(ABAC)。示例：{"dept_id":[1,2],"region":"北京"}',

  -- 权限有效期（用于临时角色权限）
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '权限生效时间，null表示立即生效',
  valid_until TIMESTAMP COMMENT '权限失效时间，null表示永久有效。用于临时权限分配',

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '权限分配时间',
  created_by BIGINT COMMENT '分配此权限的操作者ID',

  -- 外键和约束
  FOREIGN KEY (role_id) REFERENCES ods_aios_roles(id) ON DELETE CASCADE COMMENT '角色删除时级联删除该角色的权限关系',
  FOREIGN KEY (permission_id) REFERENCES ods_aios_permissions(id) ON DELETE CASCADE COMMENT '权限删除时级联删除相关的角色权限关系',
  UNIQUE(role_id, permission_id) COMMENT '同一角色不能重复分配同一权限'
);

COMMENT ON TABLE ods_aios_role_permissions IS '角色权限关系表：存储角色拥有的权限列表。支持ABAC(属性级权限)和临时权限(时间限制)';

CREATE INDEX IF NOT EXISTS idx_ods_aios_role_permissions_role_id ON ods_aios_role_permissions(role_id) COMMENT '角色ID索引，加速查询某角色的权限';
CREATE INDEX IF NOT EXISTS idx_ods_aios_role_permissions_permission_id ON ods_aios_role_permissions(permission_id) COMMENT '权限ID索引，加速查询拥有某权限的角色';
CREATE INDEX IF NOT EXISTS idx_ods_aios_role_permissions_valid_period ON ods_aios_role_permissions(valid_from, valid_until) COMMENT '时间范围索引，加速有效权限查询';

-- ============================================================================
-- 5. ods_aios_user_roles 表 - 用户角色关系
-- 说明：存储用户和角色的关联关系。支持用户拥有多个角色，支持临时角色分配(时间限制)
-- 实现了RBAC权限模型的关键关联表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ods_aios_user_roles (
  id BIGSERIAL PRIMARY KEY COMMENT '关系ID，自增主键',
  user_id BIGINT NOT NULL COMMENT '用户ID，外键关联ods_aios_users表',
  role_id BIGINT NOT NULL COMMENT '角色ID，外键关联ods_aios_roles表',

  -- 角色有效期（支持临时角色授予）
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '角色生效时间，null表示立即生效',
  valid_until TIMESTAMP COMMENT '角色失效时间，null表示永久有效。用于临时角色分配(如项目临时管理员)',

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '角色分配时间',
  created_by BIGINT COMMENT '分配此角色的操作者ID',

  -- 外键和约束
  FOREIGN KEY (user_id) REFERENCES ods_aios_users(id) ON DELETE CASCADE COMMENT '用户删除时级联删除其角色分配',
  FOREIGN KEY (role_id) REFERENCES ods_aios_roles(id) ON DELETE CASCADE COMMENT '角色删除时级联删除用户的该角色分配',
  UNIQUE(user_id, role_id) COMMENT '同一用户不能重复分配同一角色'
);

COMMENT ON TABLE ods_aios_user_roles IS '用户角色关系表：存储用户拥有的角色列表。支持一个用户多个角色，支持临时角色分配(时间限制)';

CREATE INDEX IF NOT EXISTS idx_ods_aios_user_roles_user_id ON ods_aios_user_roles(user_id) COMMENT '用户ID索引，加速查询某用户的角色';
CREATE INDEX IF NOT EXISTS idx_ods_aios_user_roles_role_id ON ods_aios_user_roles(role_id) COMMENT '角色ID索引，加速查询拥有某角色的用户';
CREATE INDEX IF NOT EXISTS idx_ods_aios_user_roles_valid_period ON ods_aios_user_roles(valid_from, valid_until) COMMENT '时间范围索引，加速有效角色查询';

-- ============================================================================
-- 6. ods_aios_user_permissions 表 - 用户直接权限
-- 说明：存储直接分配给用户的权限（不通过角色）。实现了ABAC属性级权限，支持临时权限和细粒度控制
-- 用于特殊场景下的权限分配，如临时项目权限、部门级权限等
-- ============================================================================
CREATE TABLE IF NOT EXISTS ods_aios_user_permissions (
  id BIGSERIAL PRIMARY KEY COMMENT '关系ID，自增主键',
  user_id BIGINT NOT NULL COMMENT '用户ID，外键关联ods_aios_users表',
  permission_id BIGINT NOT NULL COMMENT '权限ID，外键关联ods_aios_permissions表',

  -- 权限有效期
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '权限生效时间，null表示立即生效',
  valid_until TIMESTAMP COMMENT '权限失效时间，null表示永久有效。用于临时权限分配',

  -- 授权原因和来源
  grant_reason VARCHAR(255) COMMENT '权限授予原因，如："临时项目管理员"、"跨部门协作"',
  grant_source VARCHAR(32) COMMENT '权限来源：manual(手动分配) | workflow(工作流自动) | api(API分配) | auto_escalate(自动提升)',

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '权限分配时间',
  created_by BIGINT COMMENT '分配此权限的操作者ID',

  -- 外键和约束
  FOREIGN KEY (user_id) REFERENCES ods_aios_users(id) ON DELETE CASCADE COMMENT '用户删除时级联删除其直接权限',
  FOREIGN KEY (permission_id) REFERENCES ods_aios_permissions(id) ON DELETE CASCADE COMMENT '权限删除时级联删除用户的该直接权限',
  UNIQUE(user_id, permission_id) COMMENT '同一用户不能重复分配同一权限'
);

COMMENT ON TABLE ods_aios_user_permissions IS '用户直接权限表：存储直接分配给用户的权限(不通过角色)。支持临时权限和特殊场景下的细粒度权限控制';

CREATE INDEX IF NOT EXISTS idx_ods_aios_user_permissions_user_id ON ods_aios_user_permissions(user_id) COMMENT '用户ID索引，加速查询某用户的直接权限';
CREATE INDEX IF NOT EXISTS idx_ods_aios_user_permissions_permission_id ON ods_aios_user_permissions(permission_id) COMMENT '权限ID索引，加速查询拥有某权限的用户';
CREATE INDEX IF NOT EXISTS idx_ods_aios_user_permissions_valid_period ON ods_aios_user_permissions(valid_from, valid_until) COMMENT '时间范围索引，加速有效权限查询';

-- ============================================================================
-- 7. ods_aios_refresh_tokens 表 - Refresh Token 管理
-- 说明：存储用户的Refresh Token，用于刷新Access Token。实现了Token轮换机制，提高安全性
-- 支持设备级别的Token管理，可以实现设备管理、多设备登录控制等功能
-- ============================================================================
CREATE TABLE IF NOT EXISTS ods_aios_refresh_tokens (
  id BIGSERIAL PRIMARY KEY COMMENT 'Token记录ID，自增主键',
  user_id BIGINT NOT NULL COMMENT '用户ID，外键关联ods_aios_users表',
  token_hash VARCHAR(64) NOT NULL UNIQUE COMMENT 'Token的SHA256哈希值(而非原始token)，存储hash而非原始token以防数据泄露',

  -- Token 状态
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Token撤销标志，true=已撤销，false=有效。用于登出时清除token',
  expires_at TIMESTAMP NOT NULL COMMENT 'Token过期时间，通常为创建时间+7天',

  -- 设备信息（可选，用于设备管理）
  device_id VARCHAR(255) COMMENT '设备唯一标识，用于多设备管理',
  device_name VARCHAR(255) COMMENT '设备名称，如："iPhone 12"、"Chrome浏览器"',
  user_agent TEXT COMMENT '用户代理字符串，用于识别客户端类型',
  ip_address VARCHAR(45) COMMENT 'Token创建时的IP地址(IPv4或IPv6)',

  -- 审计字段
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Token创建时间',
  last_used_at TIMESTAMP COMMENT '最后使用此Token刷新Access Token的时间',
  revoked_at TIMESTAMP COMMENT 'Token被撤销的时间',

  -- 外键
  FOREIGN KEY (user_id) REFERENCES ods_aios_users(id) ON DELETE CASCADE COMMENT '用户删除时级联删除其refresh token'
);

COMMENT ON TABLE ods_aios_refresh_tokens IS 'Refresh Token管理表：存储用户的刷新令牌。支持设备级别管理、Token轮换和多设备登录控制';

CREATE INDEX IF NOT EXISTS idx_ods_aios_refresh_tokens_user_id ON ods_aios_refresh_tokens(user_id) COMMENT '用户ID索引，加速查询用户的token列表';
CREATE INDEX IF NOT EXISTS idx_ods_aios_refresh_tokens_expires_at ON ods_aios_refresh_tokens(expires_at) COMMENT '过期时间索引，加速清理过期token';
CREATE INDEX IF NOT EXISTS idx_ods_aios_refresh_tokens_is_revoked ON ods_aios_refresh_tokens(is_revoked) COMMENT '撤销状态索引，加速查询有效token';
CREATE INDEX IF NOT EXISTS idx_ods_aios_refresh_tokens_token_hash ON ods_aios_refresh_tokens(token_hash) COMMENT 'Token哈希索引，加速token验证查询';

-- ============================================================================
-- 8. ods_aios_audit_logs 表 - 审计日志
-- 说明：记录所有敏感操作的审计日志，包括登录、权限变更、用户创建等
-- 用于安全审计、问题排查、合规性验证等。包含完整的变更记录(old_values/new_values)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ods_aios_audit_logs (
  id BIGSERIAL PRIMARY KEY COMMENT '日志ID，自增主键',

  -- 操作信息
  action_type VARCHAR(64) NOT NULL COMMENT '操作类型，如：login, logout, create_user, update_user, delete_user, assign_role, assign_permission',
  action_category VARCHAR(32) NOT NULL COMMENT '操作分类：auth(认证) | user(用户管理) | role(角色管理) | permission(权限管理) | data(数据操作)',

  -- 操作者信息
  actor_user_id BIGINT COMMENT '操作者(执行操作的用户)ID，可为null(系统操作)',
  target_user_id BIGINT COMMENT '被操作的(目标)用户ID，可为null(非用户操作)',

  -- 操作详情
  description TEXT COMMENT '操作的文本描述，如："用户gaoqian成功登录"',
  resource_type VARCHAR(64) COMMENT '操作对象类型，如：user, role, permission, report, dashboard',
  resource_id BIGINT COMMENT '操作对象的ID',

  -- 操作结果
  status VARCHAR(32) NOT NULL COMMENT '操作结果：success(成功) | failure(失败)',
  error_message TEXT COMMENT '操作失败时的错误信息',

  -- 环境信息
  ip_address VARCHAR(45) COMMENT '操作时的IP地址(IPv4或IPv6)，用于追踪操作来源',
  user_agent TEXT COMMENT '用户代理字符串，用于识别操作客户端',
  request_id VARCHAR(255) COMMENT '请求ID，用于分布式系统中的链路追踪',

  -- 变更数据（变更前后对比）
  old_values JSONB COMMENT 'JSON格式的操作前数据快照，用于数据审计和恢复',
  new_values JSONB COMMENT 'JSON格式的操作后数据快照，用于变更跟踪',

  -- 时间
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '日志记录时间',

  -- 外键
  FOREIGN KEY (actor_user_id) REFERENCES ods_aios_users(id) ON DELETE SET NULL COMMENT '操作者删除时设为null，保留日志记录',
  FOREIGN KEY (target_user_id) REFERENCES ods_aios_users(id) ON DELETE SET NULL COMMENT '目标用户删除时设为null，保留日志记录'
);

COMMENT ON TABLE ods_aios_audit_logs IS '审计日志表：记录所有敏感操作(登录、权限变更等)。用于安全审计、问题排查、合规性验证和数据追溯';

CREATE INDEX IF NOT EXISTS idx_ods_aios_audit_logs_action_type ON ods_aios_audit_logs(action_type) COMMENT '操作类型索引，加速特定操作查询';
CREATE INDEX IF NOT EXISTS idx_ods_aios_audit_logs_action_category ON ods_aios_audit_logs(action_category) COMMENT '操作分类索引，加速按分类查询';
CREATE INDEX IF NOT EXISTS idx_ods_aios_audit_logs_actor_user_id ON ods_aios_audit_logs(actor_user_id) COMMENT '操作者ID索引，加速查询某用户的操作历史';
CREATE INDEX IF NOT EXISTS idx_ods_aios_audit_logs_target_user_id ON ods_aios_audit_logs(target_user_id) COMMENT '目标用户ID索引，加速查询针对某用户的操作';
CREATE INDEX IF NOT EXISTS idx_ods_aios_audit_logs_created_at ON ods_aios_audit_logs(created_at DESC) COMMENT '创建时间索引(倒序)，加速时间范围查询和最近操作查询';
CREATE INDEX IF NOT EXISTS idx_ods_aios_audit_logs_resource_type_id ON ods_aios_audit_logs(resource_type, resource_id) COMMENT '资源类型ID复合索引，加速特定资源的操作历史查询';
CREATE INDEX IF NOT EXISTS idx_ods_aios_audit_logs_status ON ods_aios_audit_logs(status) COMMENT '操作结果索引，加速失败操作查询';

-- ============================================================================
-- 9. ods_aios_sessions 表 - 会话管理
-- 说明：管理用户的登录会话，支持多设备登录、设备管理、会话控制等功能
-- 可用于实现"强制下线"、"同设备单一登录"等安全策略
-- ============================================================================
CREATE TABLE IF NOT EXISTS ods_aios_sessions (
  id BIGSERIAL PRIMARY KEY COMMENT '会话ID，自增主键',
  user_id BIGINT NOT NULL COMMENT '用户ID，外键关联ods_aios_users表',
  session_token_hash VARCHAR(64) NOT NULL UNIQUE COMMENT '会话Token的SHA256哈希值，存储hash而非原始token',

  -- 会话信息
  device_id VARCHAR(255) COMMENT '设备唯一标识，用于设备级会话管理',
  device_name VARCHAR(255) COMMENT '设备名称，如："iPhone 12"、"Windows Chrome"',
  user_agent TEXT COMMENT '用户代理字符串，用于客户端识别',
  ip_address VARCHAR(45) COMMENT '登录时的IP地址(IPv4或IPv6)',

  -- 会话状态
  is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '会话是否活跃，true=活跃，false=已失效/登出',
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后活动时间，用于会话超时控制',
  expires_at TIMESTAMP NOT NULL COMMENT '会话过期时间，通常为创建时间+30天',

  -- 审计
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '会话创建(登录)时间',

  -- 外键
  FOREIGN KEY (user_id) REFERENCES ods_aios_users(id) ON DELETE CASCADE COMMENT '用户删除时级联删除其会话'
);

COMMENT ON TABLE ods_aios_sessions IS '会话管理表：管理用户的登录会话。支持多设备登录、设备管理和会话控制。可实现强制下线、同设备单一登录等安全策略';

CREATE INDEX IF NOT EXISTS idx_ods_aios_sessions_user_id ON ods_aios_sessions(user_id) COMMENT '用户ID索引，加速查询用户的会话列表';
CREATE INDEX IF NOT EXISTS idx_ods_aios_sessions_is_active ON ods_aios_sessions(is_active) COMMENT '活跃状态索引，加速查询有效会话';
CREATE INDEX IF NOT EXISTS idx_ods_aios_sessions_expires_at ON ods_aios_sessions(expires_at) COMMENT '过期时间索引，加速清理过期会话';
CREATE INDEX IF NOT EXISTS idx_ods_aios_sessions_session_token_hash ON ods_aios_sessions(session_token_hash) COMMENT '会话token索引，加速会话验证查询';

-- ============================================================================
-- 视图：ods_aios_user_permissions_view - 用户权限视图
-- 说明：合并用户通过角色获得的权限和直接分配的权限，提供统一的权限查询接口
-- 用于权限检查时，可直接查询用户的所有有效权限，避免复杂的JOIN操作
-- ============================================================================
CREATE OR REPLACE VIEW ods_aios_user_permissions_view AS
-- 通过角色获得的权限
SELECT DISTINCT
  u.id as user_id COMMENT '用户ID',
  p.id as permission_id COMMENT '权限ID',
  p.code as permission_code COMMENT '权限编码',
  p.display_name COMMENT '权限显示名称',
  p.module COMMENT '权限所属模块',
  p.action COMMENT '权限操作',
  p.resource_type COMMENT '资源范围',
  'role' as grant_type COMMENT '权限来源：role(角色)或direct(直接)',
  ur.valid_until COMMENT '权限失效时间'
FROM ods_aios_users u
JOIN ods_aios_user_roles ur ON u.id = ur.user_id
JOIN ods_aios_role_permissions rp ON ur.role_id = rp.role_id
JOIN ods_aios_permissions p ON rp.permission_id = p.id
WHERE u.is_active = TRUE
  AND u.is_deleted = FALSE
  AND p.is_active = TRUE
  AND p.is_deleted = FALSE
  AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
  AND (rp.valid_until IS NULL OR rp.valid_until > CURRENT_TIMESTAMP)

UNION ALL

-- 直接分配给用户的权限
SELECT
  u.id as user_id,
  p.id as permission_id,
  p.code as permission_code,
  p.display_name,
  p.module,
  p.action,
  p.resource_type,
  'direct' as grant_type,
  up.valid_until
FROM ods_aios_users u
JOIN ods_aios_user_permissions up ON u.id = up.user_id
JOIN ods_aios_permissions p ON up.permission_id = p.id
WHERE u.is_active = TRUE
  AND u.is_deleted = FALSE
  AND p.is_active = TRUE
  AND p.is_deleted = FALSE
  AND (up.valid_until IS NULL OR up.valid_until > CURRENT_TIMESTAMP);

COMMENT ON VIEW ods_aios_user_permissions_view IS '用户权限视图：合并角色权限和直接权限，提供统一的权限查询接口。用于权限检查时快速查询用户的所有有效权限';

-- ============================================================================
-- 触发器：自动更新 updated_at 字段
-- 说明：在表中任何列被修改时，自动更新updated_at为当前时间。用于记录数据变更时间
-- ============================================================================
CREATE OR REPLACE FUNCTION ods_aios_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql COMMENT '自动更新updated_at列的触发器函数';

DROP TRIGGER IF EXISTS trigger_ods_aios_users_updated_at ON ods_aios_users;
CREATE TRIGGER trigger_ods_aios_users_updated_at
  BEFORE UPDATE ON ods_aios_users
  FOR EACH ROW
  EXECUTE FUNCTION ods_aios_update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_ods_aios_roles_updated_at ON ods_aios_roles;
CREATE TRIGGER trigger_ods_aios_roles_updated_at
  BEFORE UPDATE ON ods_aios_roles
  FOR EACH ROW
  EXECUTE FUNCTION ods_aios_update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_ods_aios_permissions_updated_at ON ods_aios_permissions;
CREATE TRIGGER trigger_ods_aios_permissions_updated_at
  BEFORE UPDATE ON ods_aios_permissions
  FOR EACH ROW
  EXECUTE FUNCTION ods_aios_update_updated_at_column();

-- ============================================================================
-- 执行完成
-- ============================================================================
-- ✅ 表创建完成！
--
-- 创建了以下对象：
-- • 9 张核心表（共约 100 列）
-- • 20 个高性能索引
-- • 1 个权限查询视图
-- • 3 个自动更新触发器
-- • 详细的表和字段注释（便于后期维护）
--
-- 命名规范：ods_aios_<原表名>
-- 表名说明：
-- 1. ods_aios_users        - 用户表
-- 2. ods_aios_roles        - 角色表
-- 3. ods_aios_permissions  - 权限表
-- 4. ods_aios_role_permissions  - 角色权限关系表
-- 5. ods_aios_user_roles   - 用户角色关系表
-- 6. ods_aios_user_permissions  - 用户直接权限表
-- 7. ods_aios_refresh_tokens    - Token管理表
-- 8. ods_aios_audit_logs   - 审计日志表
-- 9. ods_aios_sessions     - 会话管理表
--
-- 验证脚本：
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'ods_aios_%'
-- ORDER BY table_name;
--
-- 下一步：执行 sql/002_auth_schema_groland_ods.sql 初始化权限和角色数据
-- ============================================================================
