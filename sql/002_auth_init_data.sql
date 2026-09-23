-- ============================================================================
-- AIOS Authentication & RBAC System - Initial Data
-- ============================================================================
-- Version: 1.0.0
-- Created: 2026-02-13
-- Description: 内置角色、权限和初始管理员账户
--
-- ⚠️ 注意：
-- 1. 初始管理员密码需要手动设置：admin@AIOS2026
--    bcrypt hash (cost=12): $2b$12$xNHVR...(需要运行 generate_initial_admin_hash.py)
-- 2. 运行此脚本前，请先执行 001_auth_schema.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: 内置角色
-- ============================================================================
INSERT INTO roles (name, display_name, description, is_system, category, is_active, created_by)
VALUES
  -- 系统内置角色
  ('admin', '管理员', '拥有所有权限，可管理系统所有功能和用户', TRUE, 'system', TRUE, NULL),
  ('analyst', '数据分析师', '可查看报告、创建和编辑看板、导出数据', FALSE, 'built_in', TRUE, NULL),
  ('viewer', '查看者', '只能查看报告和看板，无法创建和编辑', FALSE, 'built_in', TRUE, NULL),
  ('guest', '访客', '仅可查看共享报告，权限最少', FALSE, 'built_in', TRUE, NULL);

-- ============================================================================
-- PART 2: 权限定义
-- ============================================================================
-- Dashboard 权限
INSERT INTO permissions (code, display_name, module, action, resource_type, is_system, category, is_active)
VALUES
  -- Dashboard 权限
  ('dashboard:view:all', '查看所有看板', 'dashboard', 'view', 'all', TRUE, 'data', TRUE),
  ('dashboard:view:own', '查看自己的看板', 'dashboard', 'view', 'own', TRUE, 'data', TRUE),
  ('dashboard:view:shared', '查看共享看板', 'dashboard', 'view', 'shared', TRUE, 'data', TRUE),
  ('dashboard:create', '创建看板', 'dashboard', 'create', 'all', TRUE, 'operation', TRUE),
  ('dashboard:edit:all', '编辑所有看板', 'dashboard', 'edit', 'all', TRUE, 'operation', TRUE),
  ('dashboard:edit:own', '编辑自己的看板', 'dashboard', 'edit', 'own', TRUE, 'operation', TRUE),
  ('dashboard:delete:all', '删除所有看板', 'dashboard', 'delete', 'all', TRUE, 'operation', TRUE),
  ('dashboard:delete:own', '删除自己的看板', 'dashboard', 'delete', 'own', TRUE, 'operation', TRUE),
  ('dashboard:share', '共享看板', 'dashboard', 'share', 'all', TRUE, 'operation', TRUE),
  ('dashboard:export', '导出看板', 'dashboard', 'export', 'all', TRUE, 'operation', TRUE),

  -- Report 权限
  ('report:view:all', '查看所有报告', 'report', 'view', 'all', TRUE, 'data', TRUE),
  ('report:view:own', '查看自己的报告', 'report', 'view', 'own', TRUE, 'data', TRUE),
  ('report:view:shared', '查看共享报告', 'report', 'view', 'shared', TRUE, 'data', TRUE),
  ('report:export', '导出报告', 'report', 'export', 'all', TRUE, 'operation', TRUE),
  ('report:create', '创建报告', 'report', 'create', 'all', TRUE, 'operation', TRUE),
  ('report:edit:all', '编辑所有报告', 'report', 'edit', 'all', TRUE, 'operation', TRUE),
  ('report:edit:own', '编辑自己的报告', 'report', 'edit', 'own', TRUE, 'operation', TRUE),
  ('report:delete:all', '删除所有报告', 'report', 'delete', 'all', TRUE, 'operation', TRUE),
  ('report:delete:own', '删除自己的报告', 'report', 'delete', 'own', TRUE, 'operation', TRUE),
  ('report:share', '共享报告', 'report', 'share', 'all', TRUE, 'operation', TRUE),

  -- Analysis 权限
  ('analysis:query', '执行数据查询', 'analysis', 'query', 'all', TRUE, 'operation', TRUE),
  ('analysis:create', '创建自定义分析', 'analysis', 'create', 'all', TRUE, 'operation', TRUE),
  ('analysis:edit:own', '编辑自己的分析', 'analysis', 'edit', 'own', TRUE, 'operation', TRUE),
  ('analysis:delete:own', '删除自己的分析', 'analysis', 'delete', 'own', TRUE, 'operation', TRUE),
  ('analysis:save_template', '保存分析模板', 'analysis', 'save_template', 'all', TRUE, 'operation', TRUE),

  -- User 管理权限
  ('user:list', '查看用户列表', 'user', 'list', 'all', TRUE, 'data', TRUE),
  ('user:view', '查看用户详情', 'user', 'view', 'all', TRUE, 'data', TRUE),
  ('user:create', '创建用户', 'user', 'create', 'all', TRUE, 'operation', TRUE),
  ('user:edit', '编辑用户', 'user', 'edit', 'all', TRUE, 'operation', TRUE),
  ('user:delete', '删除用户', 'user', 'delete', 'all', TRUE, 'operation', TRUE),
  ('user:assign_role', '分配用户角色', 'user', 'assign_role', 'all', TRUE, 'operation', TRUE),
  ('user:assign_permission', '分配用户权限', 'user', 'assign_permission', 'all', TRUE, 'operation', TRUE),
  ('user:reset_password', '重置用户密码', 'user', 'reset_password', 'all', TRUE, 'operation', TRUE),

  -- Role 管理权限
  ('role:list', '查看角色列表', 'role', 'list', 'all', TRUE, 'data', TRUE),
  ('role:view', '查看角色详情', 'role', 'view', 'all', TRUE, 'data', TRUE),
  ('role:create', '创建角色', 'role', 'create', 'all', TRUE, 'operation', TRUE),
  ('role:edit', '编辑角色', 'role', 'edit', 'all', TRUE, 'operation', TRUE),
  ('role:delete', '删除角色', 'role', 'delete', 'all', TRUE, 'operation', TRUE),
  ('role:assign_permission', '分配角色权限', 'role', 'assign_permission', 'all', TRUE, 'operation', TRUE),

  -- Permission 管理权限
  ('permission:list', '查看权限列表', 'permission', 'list', 'all', TRUE, 'data', TRUE),
  ('permission:view', '查看权限详情', 'permission', 'view', 'all', TRUE, 'data', TRUE),

  -- 审计和系统权限
  ('audit:view', '查看审计日志', 'audit', 'view', 'all', TRUE, 'data', TRUE),
  ('system:settings', '系统设置', 'system', 'settings', 'all', TRUE, 'operation', TRUE),
  ('system:monitor', '系统监控', 'system', 'monitor', 'all', TRUE, 'data', TRUE);

-- ============================================================================
-- PART 3: 为角色分配权限
-- ============================================================================

-- Admin 角色：拥有所有权限
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, NULL
FROM roles r, permissions p
WHERE r.name = 'admin' AND p.is_system = TRUE;

-- Analyst 角色：分析师权限
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, NULL
FROM roles r, permissions p
WHERE r.name = 'analyst' AND p.code IN (
  -- Dashboard
  'dashboard:view:all', 'dashboard:view:shared',
  'dashboard:create', 'dashboard:edit:own', 'dashboard:delete:own', 'dashboard:share', 'dashboard:export',
  -- Report
  'report:view:all', 'report:view:shared',
  'report:export', 'report:create', 'report:edit:own', 'report:delete:own', 'report:share',
  -- Analysis
  'analysis:query', 'analysis:create', 'analysis:edit:own', 'analysis:delete:own', 'analysis:save_template'
);

-- Viewer 角色：查看者权限
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, NULL
FROM roles r, permissions p
WHERE r.name = 'viewer' AND p.code IN (
  'dashboard:view:all', 'dashboard:view:shared',
  'report:view:all', 'report:view:shared',
  'analysis:query'
);

-- Guest 角色：访客权限（最少权限）
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, NULL
FROM roles r, permissions p
WHERE r.name = 'guest' AND p.code IN (
  'report:view:shared'
);

-- ============================================================================
-- PART 4: 初始管理员账户
-- ============================================================================
-- ⚠️ 重要：以下 password_hash 是占位符，需要替换为实际的 bcrypt hash
-- 生成方法：
-- 1. Python: python -c "import bcrypt; print(bcrypt.hashpw(b'admin@AIOS2026', bcrypt.gensalt(12)).decode())"
-- 2. 或运行提供的 generate_initial_admin_hash.py 脚本

-- 临时管理员账户（首次部署后需要手动修改密码）
INSERT INTO users (username, email, password_hash, full_name, is_active, created_by)
VALUES (
  'admin',
  'admin@aios.local',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5YmMxSUmmWemi',  -- hash('admin@AIOS2026')
  'System Administrator',
  TRUE,
  NULL
);

-- 为管理员分配 admin 角色
INSERT INTO user_roles (user_id, role_id, created_by)
SELECT u.id, r.id, NULL
FROM users u, roles r
WHERE u.username = 'admin' AND r.name = 'admin';

-- ============================================================================
-- PART 5: 示例用户（开发/测试环境）
-- ============================================================================
-- 取消注释以下代码以创建示例用户

/*
-- 示例分析师
INSERT INTO users (username, email, password_hash, full_name, is_active, created_by)
VALUES (
  'analyst_user',
  'analyst@aios.local',
  '$2b$12$...',  -- hash('analyst@AIOS2026')
  'Data Analyst',
  TRUE,
  1  -- created by admin
);

INSERT INTO user_roles (user_id, role_id, created_by)
SELECT u.id, r.id, 1
FROM users u, roles r
WHERE u.username = 'analyst_user' AND r.name = 'analyst';

-- 示例查看者
INSERT INTO users (username, email, password_hash, full_name, is_active, created_by)
VALUES (
  'viewer_user',
  'viewer@aios.local',
  '$2b$12$...',  -- hash('viewer@AIOS2026')
  'Report Viewer',
  TRUE,
  1
);

INSERT INTO user_roles (user_id, role_id, created_by)
SELECT u.id, r.id, 1
FROM users u, roles r
WHERE u.username = 'viewer_user' AND r.name = 'viewer';
*/

-- ============================================================================
-- PART 6: 验证数据
-- ============================================================================
-- 运行以下查询验证数据是否正确插入

/*
-- 检查角色
SELECT id, name, display_name, is_system FROM roles ORDER BY id;

-- 检查权限
SELECT code, display_name, module, action FROM permissions ORDER BY module, action LIMIT 20;

-- 检查角色权限数量
SELECT r.name, COUNT(p.id) as permission_count
FROM roles r
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
GROUP BY r.id, r.name
ORDER BY r.name;

-- 检查管理员用户
SELECT u.id, u.username, u.email, u.is_active
FROM users u
WHERE u.username = 'admin';

-- 检查管理员权限
SELECT COUNT(*)
FROM user_roles ur
JOIN role_permissions rp ON ur.role_id = rp.role_id
WHERE ur.user_id = 1;
*/

-- ============================================================================
-- 提交事务
-- ============================================================================
COMMIT;

-- ============================================================================
-- 执行后验证
-- ============================================================================
-- 1. 检查表中的数据行数
-- SELECT 'users' as table_name, COUNT(*) as count FROM users
-- UNION ALL SELECT 'roles', COUNT(*) FROM roles
-- UNION ALL SELECT 'permissions', COUNT(*) FROM permissions
-- UNION ALL SELECT 'role_permissions', COUNT(*) FROM role_permissions
-- UNION ALL SELECT 'user_roles', COUNT(*) FROM user_roles;

-- 2. 检查初始管理员是否成功创建
-- SELECT id, username, email, is_active FROM users WHERE username = 'admin';

-- 3. 检查管理员是否有所有权限
-- SELECT p.code, p.display_name
-- FROM permissions p
-- WHERE p.id NOT IN (
--   SELECT permission_id FROM role_permissions
--   WHERE role_id = (SELECT id FROM roles WHERE name = 'admin')
-- );
-- (应该返回 0 行)
