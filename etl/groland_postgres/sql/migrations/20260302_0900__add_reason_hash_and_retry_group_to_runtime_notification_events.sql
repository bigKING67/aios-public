-- DataOps 通知事件追踪增强：
-- 1) 新增 reason_hash / retry_group_id 列
-- 2) 新增按失败原因与重发批次检索索引
-- 3) 补齐列与索引注释

CREATE SCHEMA IF NOT EXISTS dataops;

CREATE TABLE IF NOT EXISTS dataops.runtime_notification_events (
  id TEXT PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  reason_hash TEXT,
  retry_group_id TEXT
);

ALTER TABLE dataops.runtime_notification_events
  ADD COLUMN IF NOT EXISTS reason_hash TEXT;

ALTER TABLE dataops.runtime_notification_events
  ADD COLUMN IF NOT EXISTS retry_group_id TEXT;

CREATE INDEX IF NOT EXISTS idx_dataops_runtime_notification_events_reason_hash
  ON dataops.runtime_notification_events (reason_hash, event_at DESC)
  WHERE reason_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dataops_runtime_notification_events_retry_group_id
  ON dataops.runtime_notification_events (retry_group_id, event_at DESC)
  WHERE retry_group_id IS NOT NULL;

COMMENT ON COLUMN dataops.runtime_notification_events.reason_hash
  IS '失败原因归一化哈希（SHA-256），用于按失败原因聚合/检索。';

COMMENT ON COLUMN dataops.runtime_notification_events.retry_group_id
  IS '重发批次链路ID，用于追踪同一批通知重发请求。';

COMMENT ON INDEX dataops.idx_dataops_runtime_notification_events_reason_hash
  IS '按失败原因哈希检索通知事件（含事件时间倒序）。';

COMMENT ON INDEX dataops.idx_dataops_runtime_notification_events_retry_group_id
  IS '按重发批次链路ID检索通知事件（含事件时间倒序）。';
