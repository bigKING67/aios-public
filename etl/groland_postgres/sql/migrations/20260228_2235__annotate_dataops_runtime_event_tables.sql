-- DataOps 运行态表注释修复迁移
-- 目的：为已执行过旧版建表脚本的环境补齐 COMMENT

CREATE SCHEMA IF NOT EXISTS dataops;

CREATE TABLE IF NOT EXISTS dataops.runtime_audit_events (
  id TEXT PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS dataops.runtime_notification_events (
  id TEXT PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dataops_runtime_audit_events_time
  ON dataops.runtime_audit_events (event_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dataops_runtime_notification_events_time
  ON dataops.runtime_notification_events (event_at DESC, id DESC);

COMMENT ON SCHEMA dataops
  IS 'DataOps 运行态元数据，存储审计和通知事件，不落 public schema。';

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

COMMENT ON INDEX dataops.idx_dataops_runtime_audit_events_time
  IS '按事件时间倒序查询审计事件。';
COMMENT ON INDEX dataops.idx_dataops_runtime_notification_events_time
  IS '按事件时间倒序查询通知事件。';
