-- DataOps 触发去重锁表
-- 用途：
-- 1) 在多实例部署下提供跨实例触发互斥
-- 2) 通过过期时间避免僵尸锁长期占用

CREATE SCHEMA IF NOT EXISTS dataops;

CREATE TABLE IF NOT EXISTS dataops.runtime_trigger_locks (
  lock_namespace TEXT NOT NULL,
  lock_key TEXT NOT NULL,
  owner_token TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (lock_namespace, lock_key)
);

COMMENT ON TABLE dataops.runtime_trigger_locks
  IS 'DataOps 触发去重锁表。用于跨实例互斥触发，避免重复提交。';
COMMENT ON COLUMN dataops.runtime_trigger_locks.lock_namespace
  IS '锁命名空间（业务域）。';
COMMENT ON COLUMN dataops.runtime_trigger_locks.lock_key
  IS '锁键（通常为 pipeline id）。';
COMMENT ON COLUMN dataops.runtime_trigger_locks.owner_token
  IS '锁持有者令牌，释放时需匹配以防误删。';
COMMENT ON COLUMN dataops.runtime_trigger_locks.acquired_at
  IS '锁获取时间。';
COMMENT ON COLUMN dataops.runtime_trigger_locks.expires_at
  IS '锁过期时间（UTC）。';
COMMENT ON CONSTRAINT runtime_trigger_locks_pkey ON dataops.runtime_trigger_locks
  IS '主键：namespace + lock_key 唯一锁。';

CREATE INDEX IF NOT EXISTS idx_dataops_runtime_trigger_locks_expire
  ON dataops.runtime_trigger_locks (expires_at ASC);

COMMENT ON INDEX dataops.idx_dataops_runtime_trigger_locks_expire
  IS '加速过期锁更新与巡检。';
