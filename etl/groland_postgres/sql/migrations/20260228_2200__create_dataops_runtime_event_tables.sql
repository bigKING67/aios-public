-- DataOps 运行态存储表（审计/通知）
-- 用途：
-- 1) 持久化 DataOps 运行审计与通知事件
-- 2) 支撑多实例环境下的一致性读取

CREATE SCHEMA IF NOT EXISTS dataops;

COMMENT ON SCHEMA dataops
  IS 'DataOps 运行态元数据，存储审计和通知事件，不落 public schema。';

CREATE TABLE IF NOT EXISTS dataops.runtime_audit_events (
  id TEXT PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

COMMENT ON TABLE dataops.runtime_audit_events
  IS 'DataOps 运行审计事件表。';
COMMENT ON COLUMN dataops.runtime_audit_events.id
  IS '事件唯一ID。';
COMMENT ON COLUMN dataops.runtime_audit_events.event_at
  IS '事件时间（服务端写入时间）。';
COMMENT ON COLUMN dataops.runtime_audit_events.payload
  IS '审计事件完整载荷（JSON）。';
COMMENT ON CONSTRAINT runtime_audit_events_pkey ON dataops.runtime_audit_events
  IS '主键：事件唯一ID。';

CREATE TABLE IF NOT EXISTS dataops.runtime_notification_events (
  id TEXT PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

COMMENT ON TABLE dataops.runtime_notification_events
  IS 'DataOps 通知事件表（Webhook 发送记录）。';
COMMENT ON COLUMN dataops.runtime_notification_events.id
  IS '事件唯一ID。';
COMMENT ON COLUMN dataops.runtime_notification_events.event_at
  IS '事件时间（服务端写入时间）。';
COMMENT ON COLUMN dataops.runtime_notification_events.payload
  IS '通知事件完整载荷（JSON）。';
COMMENT ON CONSTRAINT runtime_notification_events_pkey ON dataops.runtime_notification_events
  IS '主键：事件唯一ID。';

CREATE INDEX IF NOT EXISTS idx_dataops_runtime_audit_events_time
  ON dataops.runtime_audit_events (event_at DESC, id DESC);

COMMENT ON INDEX dataops.idx_dataops_runtime_audit_events_time
  IS '按事件时间倒序查询审计事件。';

CREATE INDEX IF NOT EXISTS idx_dataops_runtime_notification_events_time
  ON dataops.runtime_notification_events (event_at DESC, id DESC);

COMMENT ON INDEX dataops.idx_dataops_runtime_notification_events_time
  IS '按事件时间倒序查询通知事件。';
