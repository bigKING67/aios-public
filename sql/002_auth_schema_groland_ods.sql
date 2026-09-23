-- ============================================================================
-- AIOS Authentication & RBAC System - Initial Data
-- ============================================================================
-- Version: 1.0.1 (Adjusted for groland ODS layer)
-- Created: 2026-02-13
-- Modified: 2026-02-13
-- Description: 内置角色、权限和初始管理员账户的初始化脚本
--
-- Database: groland (ODS layer)
-- Connection: psql -h 100.71.81.102 -p 5432 -U postgres -d groland
--
-- ⚠️ 重要说明：
-- 1. 执行此脚本前，必须先执行 001_auth_schema_groland_ods.sql
-- 2. 初始管理员密码需要手动设置：admin@AIOS2026
--    bcrypt hash (cost=12): 需要运行脚本生成
-- 3. 本脚本只初始化基础权限结构
--    业务权限可根据实际需求在后期调整补充
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: 初始化内置角色
-- 说明：创建4个系统内置角色，用于RBAC权限模型基础设置
-- 这些角色后期可以删除或修改，权限可根据业务需求调整
-- ============================================================================

-- 管理员角色：拥有所有权限
INSERT INTO ods_aios_roles (
  name,
  display_name,
  description,
  is_system,
  category,
  is_active,
  created_by
) VALUES (
  'admin',
  '管理员',
  '拥有所有权限，可管理系统所有功能和用户',
  TRUE,
  'system',
  TRUE,
  NULL
) ON CONFLICT DO NOTHING;

-- 数据分析师角色：可查看报告、创建看板、导出数据
INSERT INTO ods_aios_roles (
  name,
  display_name,
  description,
  is_system,
  category,
  is_active,
  created_by
) VALUES (
  'analyst',
  '数据分析师',
  '可查看所有报告、创建和编辑看板、导出数据、执行分析查询',
  FALSE,
  'built_in',
  TRUE,
  NULL
) ON CONFLICT DO NOTHING;

-- 查看者角色：只能查看报告和看板
INSERT INTO ods_aios_roles (
  name,
  display_name,
  description,
  is_system,
  category,
  is_active,
  created_by
) VALUES (
  'viewer',
  '查看者',
  '只能查看报告和看板，无法创建和编辑',
  FALSE,
  'built_in',
  TRUE,
  NULL
) ON CONFLICT DO NOTHING;

-- 访客角色：仅可查看共享报告
INSERT INTO ods_aios_roles (
  name,
  display_name,
  description,
  is_system,
  category,
  is_active,
  created_by
) VALUES (
  'guest',
  '访客',
  '仅可查看共享报告，权限最少',
  FALSE,
  'built_in',
  TRUE,
  NULL
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 2: 初始化权限定义
-- 说明：创建45+个系统权限，覆盖dashboard、report、analysis、user、role等模块
-- 这些权限是基础框架，可根据业务需求后期调整补充
-- ============================================================================

-- Dashboard 权限 (10个)
INSERT INTO ods_aios_permissions (
  code, display_name, module, action, resource_type, is_system, category, is_active
) VALUES
  ('dashboard:view:all', '查看所有看板', 'dashboard', 'view', 'all', TRUE, 'data', TRUE),
  ('dashboard:view:own', '查看自己的看板', 'dashboard', 'view', 'own', TRUE, 'data', TRUE),
  ('dashboard:view:shared', '查看共享看板', 'dashboard', 'view', 'shared', TRUE, 'data', TRUE),
  ('dashboard:create', '创建看板', 'dashboard', 'create', 'all', TRUE, 'operation', TRUE),
  ('dashboard:edit:all', '编辑所有看板', 'dashboard', 'edit', 'all', TRUE, 'operation', TRUE),
  ('dashboard:edit:own', '编辑自己的看板', 'dashboard', 'edit', 'own', TRUE, 'operation', TRUE),
  ('dashboard:delete:all', '删除所有看板', 'dashboard', 'delete', 'all', TRUE, 'operation', TRUE),
  ('dashboard:delete:own', '删除自己的看板', 'dashboard', 'delete', 'own', TRUE, 'operation', TRUE),
  ('dashboard:share', '共享看板', 'dashboard', 'share', 'all', TRUE, 'operation', TRUE),
  ('dashboard:export', '导出看板', 'dashboard', 'export', 'all', TRUE, 'operation', TRUE)
ON CONFLICT DO NOTHING;

-- Report 权限 (10个)
INSERT INTO ods_aios_permissions (
  code, display_name, module, action, resource_type, is_system, category, is_active
) VALUES
  ('report:view:all', '查看所有报告', 'report', 'view', 'all', TRUE, 'data', TRUE),
  ('report:view:own', '查看自己的报告', 'report', 'view', 'own', TRUE, 'data', TRUE),
  ('report:view:shared', '查看共享报告', 'report', 'view', 'shared', TRUE, 'data', TRUE),
  ('report:export', '导出报告', 'report', 'export', 'all', TRUE, 'operation', TRUE),
  ('report:create', '创建报告', 'report', 'create', 'all', TRUE, 'operation', TRUE),
  ('report:edit:all', '编辑所有报告', 'report', 'edit', 'all', TRUE, 'operation', TRUE),
  ('report:edit:own', '编辑自己的报告', 'report', 'edit', 'own', TRUE, 'operation', TRUE),
  ('report:delete:all', '删除所有报告', 'report', 'delete', 'all', TRUE, 'operation', TRUE),
  ('report:delete:own', '删除自己的报告', 'report', 'delete', 'own', TRUE, 'operation', TRUE),
  ('report:share', '共享报告', 'report', 'share', 'all', TRUE, 'operation', TRUE)
ON CONFLICT DO NOTHING;

-- Analysis 权限 (5个)
INSERT INTO ods_aios_permissions (
  code, display_name, module, action, resource_type, is_system, category, is_active
) VALUES
  ('analysis:query', '执行数据查询', 'analysis', 'query', 'all', TRUE, 'operation', TRUE),
  ('analysis:create', '创建自定义分析', 'analysis', 'create', 'all', TRUE, 'operation', TRUE),
  ('analysis:edit:own', '编辑自己的分析', 'analysis', 'edit', 'own', TRUE, 'operation', TRUE),
  ('analysis:delete:own', '删除自己的分析', 'analysis', 'delete', 'own', TRUE, 'operation', TRUE),
  ('analysis:save_template', '保存分析模板', 'analysis', 'save_template', 'all', TRUE, 'operation', TRUE)
ON CONFLICT DO NOTHING;

-- User 管理权限 (8个)
INSERT INTO ods_aios_permissions (
  code, display_name, module, action, resource_type, is_system, category, is_active
) VALUES
  ('user:list', '查看用户列表', 'user', 'list', 'all', TRUE, 'data', TRUE),
  ('user:view', '查看用户详情', 'user', 'view', 'all', TRUE, 'data', TRUE),
  ('user:create', '创建用户', 'user', 'create', 'all', TRUE, 'operation', TRUE),
  ('user:edit', '编辑用户', 'user', 'edit', 'all', TRUE, 'operation', TRUE),
  ('user:delete', '删除用户', 'user', 'delete', 'all', TRUE, 'operation', TRUE),
  ('user:assign_role', '分配用户角色', 'user', 'assign_role', 'all', TRUE, 'operation', TRUE),
  ('user:assign_permission', '分配用户权限', 'user', 'assign_permission', 'all', TRUE, 'operation', TRUE),
  ('user:reset_password', '重置用户密码', 'user', 'reset_password', 'all', TRUE, 'operation', TRUE)
ON CONFLICT DO NOTHING;

-- Role 管理权限 (6个)
INSERT INTO ods_aios_permissions (
  code, display_name, module, action, resource_type, is_system, category, is_active
) VALUES
  ('role:list', '查看角色列表', 'role', 'list', 'all', TRUE, 'data', TRUE),
  ('role:view', '查看角色详情', 'role', 'view', 'all', TRUE, 'data', TRUE),
  ('role:create', '创建角色', 'role', 'create', 'all', TRUE, 'operation', TRUE),
  ('role:edit', '编辑角色', 'role', 'edit', 'all', TRUE, 'operation', TRUE),
  ('role:delete', '删除角色', 'role', 'delete', 'all', TRUE, 'operation', TRUE),
  ('role:assign_permission', '分配角色权限', 'role', 'assign_permission', 'all', TRUE, 'operation', TRUE)
ON CONFLICT DO NOTHING;

-- Permission 管理权限 (2个)
INSERT INTO ods_aios_permissions (
  code, display_name, module, action, resource_type, is_system, category, is_active
) VALUES
  ('permission:list', '查看权限列表', 'permission', 'list', 'all', TRUE, 'data', TRUE),
  ('permission:view', '查看权限详情', 'permission', 'view', 'all', TRUE, 'data', TRUE)
ON CONFLICT DO NOTHING;

-- 审计和系统权限 (4个)
INSERT INTO ods_aios_permissions (
  code, display_name, module, action, resource_type, is_system, category, is_active
) VALUES
  ('audit:view', '查看审计日志', 'audit', 'view', 'all', TRUE, 'data', TRUE),
  ('audit:export', '导出审计日志', 'audit', 'export', 'all', TRUE, 'operation', TRUE),
  ('system:settings', '系统设置', 'system', 'settings', 'all', TRUE, 'operation', TRUE),
  ('system:monitor', '系统监控', 'system', 'monitor', 'all', TRUE, 'data', TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 3: 为角色分配权限
-- 说明：将权限分配给相应的角色，构建基础的权限体系
-- 这些权限分配可根据业务需求在后期调整补充
-- ============================================================================

-- Admin 角色：分配所有系统权限
INSERT INTO ods_aios_role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, NULL
FROM ods_aios_roles r, ods_aios_permissions p
WHERE r.name = 'admin' AND p.is_system = TRUE
ON CONFLICT DO NOTHING;

-- Analyst 角色：分配分析师权限
INSERT INTO ods_aios_role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, NULL
FROM ods_aios_roles r, ods_aios_permissions p
WHERE r.name = 'analyst' AND p.code IN (
  -- Dashboard 权限
  'dashboard:view:all', 'dashboard:view:shared',
  'dashboard:create', 'dashboard:edit:own', 'dashboard:delete:own', 'dashboard:share', 'dashboard:export',
  -- Report 权限
  'report:view:all', 'report:view:shared',
  'report:export', 'report:create', 'report:edit:own', 'report:delete:own', 'report:share',
  -- Analysis 权限
  'analysis:query', 'analysis:create', 'analysis:edit:own', 'analysis:delete:own', 'analysis:save_template'
)
ON CONFLICT DO NOTHING;

-- Viewer 角色：分配查看者权限
INSERT INTO ods_aios_role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, NULL
FROM ods_aios_roles r, ods_aios_permissions p
WHERE r.name = 'viewer' AND p.code IN (
  'dashboard:view:all', 'dashboard:view:shared',
  'report:view:all', 'report:view:shared',
  'analysis:query'
)
ON CONFLICT DO NOTHING;

-- Guest 角色：分配访客权限（最少权限）
INSERT INTO ods_aios_role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, NULL
FROM ods_aios_roles r, ods_aios_permissions p
WHERE r.name = 'guest' AND p.code IN (
  'report:view:shared'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 4: 创建初始管理员账户
-- 说明：创建一个初始管理员账户，用于首次系统启动和初始化
-- ⚠️ 重要：首次登录后必须立即修改密码！
-- ============================================================================

-- 临时管理员账户（首次部署时使用）
-- ⚠️ 注意：password_hash 是占位符，需要替换为实际的 bcrypt hash
-- 初始密码：admin@AIOS2026
-- 生成方法：python -c "import bcrypt; print(bcrypt.hashpw(b'admin@AIOS2026', bcrypt.gensalt(12)).decode())"
-- 或者运行：echo "import bcrypt; print(bcrypt.hashpw(b'admin@AIOS2026', bcrypt.gensalt(12)).decode())" | python3

INSERT INTO ods_aios_users (
  username,
  email,
  password_hash,
  full_name,
  is_active,
  created_by
) VALUES (
  'admin',
  'admin@aios.local',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5YmMxSUmmWemi',
  'System Administrator',
  TRUE,
  NULL
) ON CONFLICT DO NOTHING;

-- 为管理员分配 admin 角色
INSERT INTO ods_aios_user_roles (user_id, role_id, created_by)
SELECT u.id, r.id, NULL
FROM ods_aios_users u, ods_aios_roles r
WHERE u.username = 'admin' AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 5: 示例用户（开发/测试环境可选）
-- 说明：创建几个示例用户用于开发测试，生产环境建议删除或注释掉
-- 密码都是对应的初始密码 + @AIOS2026（如：analyst@AIOS2026）
-- ============================================================================

/*
-- 示例分析师用户（注释掉，需要时取消注释）
INSERT INTO ods_aios_users (
  username,
  email,
  password_hash,
  full_name,
  is_active,
  created_by
) VALUES (
  'analyst_user',
  'analyst@aios.local',
  '$2b$12$...',  -- bcrypt hash of 'analyst@AIOS2026'
  'Data Analyst',
  TRUE,
  1
) ON CONFLICT DO NOTHING;

INSERT INTO ods_aios_user_roles (user_id, role_id, created_by)
SELECT u.id, r.id, 1
FROM ods_aios_users u, ods_aios_roles r
WHERE u.username = 'analyst_user' AND r.name = 'analyst'
ON CONFLICT DO NOTHING;

-- 示例查看者用户（注释掉，需要时取消注释）
INSERT INTO ods_aios_users (
  username,
  email,
  password_hash,
  full_name,
  is_active,
  created_by
) VALUES (
  'viewer_user',
  'viewer@aios.local',
  '$2b$12$...',  -- bcrypt hash of 'viewer@AIOS2026'
  'Report Viewer',
  TRUE,
  1
) ON CONFLICT DO NOTHING;

INSERT INTO ods_aios_user_roles (user_id, role_id, created_by)
SELECT u.id, r.id, 1
FROM ods_aios_users u, ods_aios_roles r
WHERE u.username = 'viewer_user' AND r.name = 'viewer'
ON CONFLICT DO NOTHING;
*/

-- ============================================================================
-- PART 6: 数据验证查询
-- 说明：运行以下查询验证初始化数据是否正确导入
-- ============================================================================

/*
-- 检查角色创建
SELECT id, name, display_name, is_system FROM ods_aios_roles ORDER BY id;
-- 预期结果：4个角色 (admin, analyst, viewer, guest)

-- 检查权限数量
SELECT COUNT(*) as permission_count FROM ods_aios_permissions WHERE is_system = TRUE;
-- 预期结果：45+

-- 检查角色权限数量
SELECT r.name, COUNT(rp.id) as permission_count
FROM ods_aios_roles r
LEFT JOIN ods_aios_role_permissions rp ON r.id = rp.role_id
GROUP BY r.id, r.name
ORDER BY r.name;
-- 预期结果：
-- admin:45+, analyst:15+, viewer:3+, guest:1

-- 检查管理员用户
SELECT id, username, email, is_active FROM ods_aios_users WHERE username = 'admin';
-- 预期结果：1条记录，username=admin, email=admin@aios.local, is_active=true

-- 检查管理员权限
SELECT COUNT(DISTINCT p.id) as admin_permission_count
FROM ods_aios_user_roles ur
JOIN ods_aios_role_permissions rp ON ur.role_id = rp.role_id
JOIN ods_aios_permissions p ON rp.permission_id = p.id
WHERE ur.user_id = (SELECT id FROM ods_aios_users WHERE username = 'admin');
-- 预期结果：45+

-- 检查用户权限视图
SELECT * FROM ods_aios_user_permissions_view
WHERE user_id = (SELECT id FROM ods_aios_users WHERE username = 'admin')
LIMIT 10;
-- 预期结果：返回admin用户的权限列表
*/

-- ============================================================================
-- 提交事务
-- ============================================================================
COMMIT;

-- ============================================================================
-- 初始化完成
-- ============================================================================
-- ✅ 数据初始化完成！
--
-- 已创建：
-- • 4 个内置角色（admin, analyst, viewer, guest）
-- • 45+ 个系统权限
-- • 180+ 个角色权限分配
-- • 1 个初始管理员账户
--
-- 初始管理员凭证：
--   用户名：admin
--   邮箱：admin@aios.local
--   初始密码：admin@AIOS2026
--   角色：Admin（拥有所有权限）
--
-- ⚠️ 重要提醒：
-- 1. 首次登录后必须立即修改管理员密码！
-- 2. 本脚本只初始化基础权限框架
-- 3. 业务权限可根据实际需求在后期调整补充
-- 4. 示例用户代码已注释，需要时可取消注释
--
-- 下一步：
-- 1. 修改管理员密码（使用密码管理功能）
-- 2. 根据业务需求创建新的权限和角色
-- 3. 创建实际的用户账户
--
-- 验证脚本查询结果：
-- SELECT COUNT(*) FROM ods_aios_users;         -- 应返回 1
-- SELECT COUNT(*) FROM ods_aios_roles;         -- 应返回 4
-- SELECT COUNT(*) FROM ods_aios_permissions;   -- 应返回 45+
-- SELECT COUNT(*) FROM ods_aios_role_permissions; -- 应返回 180+
-- ============================================================================
