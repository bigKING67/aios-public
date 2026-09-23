-- ============================================================================
-- Migration 003: 数据修复脚本（性能优化 Layer 2 - 准备工作）
-- ============================================================================
-- Created: 2026-02-20
-- Description:
-- 修复现有数据中可能存在的约束冲突，为新增约束做准备
-- 1. 检查并修复 valid_until < valid_from 的记录
-- 2. 检查孤立的外键（created_by/updated_by 指向已删除用户）
-- 3. 检查软删除与唯一约束冲突（为后续条件索引准备）

-- ============================================================================
-- 1. Role_Permissions 有效期修复
-- ============================================================================
-- 检查：valid_until 小于 valid_from 的记录
SELECT COUNT(*) as invalid_count
FROM role_permissions
WHERE valid_until IS NOT NULL AND valid_until < valid_from;

-- 修复：将 valid_until 小于 valid_from 的记录设为 NULL（永久有效）
UPDATE role_permissions
SET valid_until = NULL
WHERE valid_until IS NOT NULL AND valid_until < valid_from;

-- ============================================================================
-- 2. User_Roles 有效期修复
-- ============================================================================
SELECT COUNT(*) as invalid_count
FROM user_roles
WHERE valid_until IS NOT NULL AND valid_until < valid_from;

UPDATE user_roles
SET valid_until = NULL
WHERE valid_until IS NOT NULL AND valid_until < valid_from;

-- ============================================================================
-- 3. User_Permissions 有效期修复
-- ============================================================================
SELECT COUNT(*) as invalid_count
FROM user_permissions
WHERE valid_until IS NOT NULL AND valid_until < valid_from;

UPDATE user_permissions
SET valid_until = NULL
WHERE valid_until IS NOT NULL AND valid_until < valid_from;

-- ============================================================================
-- 4. 检查孤立的外键（created_by 指向已删除用户）
-- ============================================================================
-- 注：理论上不应该存在孤立外键（外键约束会阻止）
-- 但如果之前没有外键约束，可能存在不一致数据

-- 检查 users 表中 created_by 孤立
SELECT COUNT(*) as orphaned_created_by
FROM users u
WHERE u.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users target WHERE target.id = u.created_by AND target.is_deleted = FALSE);

-- 检查 users 表中 updated_by 孤立
SELECT COUNT(*) as orphaned_updated_by
FROM users u
WHERE u.updated_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users target WHERE target.id = u.updated_by AND target.is_deleted = FALSE);

-- ============================================================================
-- 5. 验证软删除唯一约束冲突
-- ============================================================================
-- 场景：用户 A 创建，用户 B 软删除，新用户 C 想使用同样的 username
-- 当前 UNIQUE 约束会阻止，应该改为条件索引（WHERE NOT is_deleted）

-- 检查是否存在相同 username 但 is_deleted 值不同的记录
SELECT username, COUNT(*) as count, array_agg(id) as ids
FROM users
GROUP BY username
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 类似地检查 email
SELECT email, COUNT(*) as count, array_agg(id) as ids
FROM users
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 检查 roles.name
SELECT name, COUNT(*) as count, array_agg(id) as ids
FROM roles
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 检查 permissions.code
SELECT code, COUNT(*) as count, array_agg(id) as ids
FROM permissions
GROUP BY code
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- ============================================================================
-- 6. 数据清理（可选：删除完全重复的已删除记录）
-- ============================================================================
-- 注：这是可选的激进清理，仅在确认安全后执行
-- 删除已软删除且有同名未删除记录的重复用户

-- DO $$
-- DECLARE
--   duplicate_users RECORD;
-- BEGIN
--   FOR duplicate_users IN
--     SELECT username, array_agg(id) as ids
--     FROM users
--     GROUP BY username
--     HAVING COUNT(*) > 1
--   LOOP
--     -- 保留未删除的记录，删除已删除的重复记录
--     DELETE FROM users
--     WHERE username = duplicate_users.username
--       AND is_deleted = TRUE
--       AND id != (
--         SELECT id FROM users
--         WHERE username = duplicate_users.username
--           AND is_deleted = FALSE
--         LIMIT 1
--       );
--   END LOOP;
-- END $$;

-- ============================================================================
-- 7. ILIKE 性能验证（执行完迁移后）
-- ============================================================================
-- EXPLAIN ANALYZE 验证 ILIKE 查询是否使用 trigram 索引
-- 执行这些查询，查看是否使用了 idx_users_username_trgm 等索引

-- EXPLAIN ANALYZE
-- SELECT id, username FROM users
-- WHERE username ILIKE '%john%' AND is_deleted = FALSE
-- LIMIT 20;

-- EXPLAIN ANALYZE
-- SELECT id, name FROM roles
-- WHERE name ILIKE '%admin%' AND is_deleted = FALSE
-- LIMIT 20;

-- ============================================================================
-- 8. 最后的数据完整性检查
-- ============================================================================

-- 检查是否有损坏的数据
SELECT 'users' as table_name, COUNT(*) as total, COUNT(*) FILTER (WHERE is_deleted) as deleted
FROM users
UNION ALL
SELECT 'roles', COUNT(*), COUNT(*) FILTER (WHERE is_deleted)
FROM roles
UNION ALL
SELECT 'permissions', COUNT(*), COUNT(*) FILTER (WHERE is_deleted)
FROM permissions
UNION ALL
SELECT 'user_roles', COUNT(*), 0
FROM user_roles
UNION ALL
SELECT 'role_permissions', COUNT(*), 0
FROM role_permissions
UNION ALL
SELECT 'user_permissions', COUNT(*), 0
FROM user_permissions;

-- ============================================================================
-- 修复完成
-- ============================================================================
-- 现在可以执行 002_auth_constraints_indexes.sql 来添加约束和索引
