-- DataOps 批量执行历史事件表
-- 说明：
-- 1) 用于持久化 DataOps 页面发起的批量触发/暂停/恢复结果
-- 2) 存储在 dataops schema，避免落 public
-- 3) 采用 payload JSONB 便于低耦合扩展

CREATE TABLE IF NOT EXISTS dataops.runtime_batch_execution_events (
  id TEXT PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

COMMENT ON TABLE dataops.runtime_batch_execution_events
  IS 'DataOps 批量执行历史事件表。';
COMMENT ON COLUMN dataops.runtime_batch_execution_events.id
  IS '批量事件唯一ID。';
COMMENT ON COLUMN dataops.runtime_batch_execution_events.event_at
  IS '事件时间（服务端写入时间）。';
COMMENT ON COLUMN dataops.runtime_batch_execution_events.payload
  IS '批量执行完整载荷（JSON）。';
COMMENT ON CONSTRAINT runtime_batch_execution_events_pkey ON dataops.runtime_batch_execution_events
  IS '主键：批量事件唯一ID。';

CREATE INDEX IF NOT EXISTS idx_dataops_runtime_batch_execution_events_time
  ON dataops.runtime_batch_execution_events (event_at DESC, id DESC);

COMMENT ON INDEX dataops.idx_dataops_runtime_batch_execution_events_time
  IS '按事件时间倒序查询批量执行历史。';
