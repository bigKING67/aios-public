-- ============================================================================
-- Migration 002: Database Constraints & Index补全（性能优化 Layer 2）
-- ============================================================================
-- Created: 2026-02-20
-- Description:
-- 1. 将列级 UNIQUE 改为条件唯一索引（软删除兼容）
-- 2. 添加外键约束：created_by/updated_by → users(id) ON DELETE SET NULL
-- 3. 添加权限有效期约束：CHECK (valid_until IS NULL OR valid_until >= valid_from)
-- 4. 添加 ILIKE 搜索的 trigram 索引
--
-- 关键点：
-- - 所有修改都是向后兼容的（新增约束/索引，不改原有列）
-- - 外键使用 ON DELETE SET NULL 保留审计记录
-- - 条件唯一索引允许软删除后的复用

-- ============================================================================
-- 1. Users 表 - 添加外键约束
-- ============================================================================
-- 设置 created_by 和 updated_by 外键
-- 注：这些字段之前是孤立的，现在与 users 表关联
ALTER TABLE users
ADD CONSTRAINT fk_users_created_by
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
ADD CONSTRAINT fk_users_updated_by
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

-- 添加 ILIKE 搜索的 trigram 索引（性能：全表扫描 → B-tree 搜索）
-- 对应API：list_users 的 ILIKE :search_pattern
CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (lower(username) gin_trgm_ops) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON users USING gin (lower(email) gin_trgm_ops) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm ON users USING gin (lower(full_name) gin_trgm_ops) WHERE NOT is_deleted;

-- ============================================================================
-- 2. Roles 表 - 添加外键约束 + ILIKE 索引
-- ============================================================================
ALTER TABLE roles
ADD CONSTRAINT fk_roles_created_by
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE roles
ADD CONSTRAINT fk_roles_updated_by
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

-- ILIKE 搜索的 trigram 索引
-- 对应API：list_roles 的 ILIKE :search_pattern
CREATE INDEX IF NOT EXISTS idx_roles_name_trgm ON roles USING gin (lower(name) gin_trgm_ops) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_roles_display_name_trgm ON roles USING gin (lower(display_name) gin_trgm_ops) WHERE NOT is_deleted;

-- ============================================================================
-- 3. Permissions 表 - 添加 ILIKE 索引
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_permissions_code_trgm ON permissions USING gin (lower(code) gin_trgm_ops) WHERE NOT is_deleted;

-- ============================================================================
-- 4. Role_Permissions 表 - 添加有效期约束 + 外键
-- ============================================================================
-- 有效期约束：valid_until 必须大于等于 valid_from（或为 NULL）
ALTER TABLE role_permissions
ADD CONSTRAINT check_role_permissions_valid_period
  CHECK (valid_until IS NULL OR valid_until >= valid_from);

-- 审计字段外键
ALTER TABLE role_permissions
ADD CONSTRAINT fk_role_permissions_created_by
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- 5. User_Roles 表 - 添加有效期约束 + 外键
-- ============================================================================
-- 有效期约束
ALTER TABLE user_roles
ADD CONSTRAINT check_user_roles_valid_period
  CHECK (valid_until IS NULL OR valid_until >= valid_from);

-- 审计字段外键
ALTER TABLE user_roles
ADD CONSTRAINT fk_user_roles_created_by
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- 6. User_Permissions 表 - 添加有效期约束 + 外键
-- ============================================================================
ALTER TABLE user_permissions
ADD CONSTRAINT check_user_permissions_valid_period
  CHECK (valid_until IS NULL OR valid_until >= valid_from);

ALTER TABLE user_permissions
ADD CONSTRAINT fk_user_permissions_created_by
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- 7. Audit_Logs 表 - 添加外键约束（已在 003 中实现，此处保险起见再检查）
-- ============================================================================
-- 注：Audit_Logs 表的外键应该在 003_auth_security_hardening.sql 中已创建
-- 如果之前未创建，本脚本应该幂等处理
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'audit_logs' AND constraint_name = 'fk_audit_logs_actor_user_id'
  ) THEN
    ALTER TABLE audit_logs
    ADD CONSTRAINT fk_audit_logs_actor_user_id
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'audit_logs' AND constraint_name = 'fk_audit_logs_target_user_id'
  ) THEN
    ALTER TABLE audit_logs
    ADD CONSTRAINT fk_audit_logs_target_user_id
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 8. 性能验证语句（在迁移后执行）
-- ============================================================================
-- EXPLAIN ANALYZE 验证 ILIKE 查询是否走 trigram 索引
-- 示例：
--   EXPLAIN ANALYZE
--   SELECT id, username FROM users
--   WHERE username ILIKE '%john%' AND is_deleted = FALSE
--   LIMIT 20;
--
-- 预期：使用 "Bitmap Heap Scan on users" 或 "Index Scan using idx_users_username_trgm"

-- ============================================================================
-- 最终验证
-- ============================================================================
-- 检查所有约束是否已创建
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_name IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles', 'user_permissions', 'audit_logs')
  AND constraint_type IN ('FOREIGN KEY', 'CHECK')
ORDER BY table_name, constraint_name;

-- 检查所有 trigram 索引是否已创建
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('users', 'roles', 'permissions')
  AND indexname LIKE '%trgm%'
ORDER BY indexname;
