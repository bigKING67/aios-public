-- DataOps 运行态事件保留清理
-- 用途：
-- 1) 以“保留天数”为口径清理 runtime_audit_events / runtime_notification_events
-- 2) 记录最近一次清理时间和删除行数，供 DataOps 页面观测

CREATE SCHEMA IF NOT EXISTS dataops;

CREATE TABLE IF NOT EXISTS dataops.runtime_cleanup_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  retain_days INTEGER NOT NULL,
  last_cleanup_at TIMESTAMPTZ,
  last_audit_deleted INTEGER NOT NULL DEFAULT 0,
  last_notification_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_runtime_cleanup_state_singleton CHECK (id = 1),
  CONSTRAINT chk_runtime_cleanup_state_retain_days CHECK (retain_days BETWEEN 1 AND 3650),
  CONSTRAINT chk_runtime_cleanup_state_deleted_non_negative CHECK (
    last_audit_deleted >= 0 AND last_notification_deleted >= 0
  )
);

COMMENT ON TABLE dataops.runtime_cleanup_state
  IS 'DataOps 运行态事件清理状态表（单行），记录保留策略与最近清理结果。';
COMMENT ON COLUMN dataops.runtime_cleanup_state.id
  IS '固定单行主键（恒为1）。';
COMMENT ON COLUMN dataops.runtime_cleanup_state.retain_days
  IS '运行态事件保留天数（超过该天数的数据会被清理）。';
COMMENT ON COLUMN dataops.runtime_cleanup_state.last_cleanup_at
  IS '最近一次清理执行时间。';
COMMENT ON COLUMN dataops.runtime_cleanup_state.last_audit_deleted
  IS '最近一次清理删除的审计事件行数。';
COMMENT ON COLUMN dataops.runtime_cleanup_state.last_notification_deleted
  IS '最近一次清理删除的通知事件行数。';
COMMENT ON COLUMN dataops.runtime_cleanup_state.created_at
  IS '状态记录创建时间。';
COMMENT ON COLUMN dataops.runtime_cleanup_state.updated_at
  IS '状态记录更新时间。';
COMMENT ON CONSTRAINT runtime_cleanup_state_pkey ON dataops.runtime_cleanup_state
  IS '主键：固定单行ID。';
COMMENT ON CONSTRAINT chk_runtime_cleanup_state_singleton ON dataops.runtime_cleanup_state
  IS '单行约束：id 必须为 1。';
COMMENT ON CONSTRAINT chk_runtime_cleanup_state_retain_days ON dataops.runtime_cleanup_state
  IS '保留天数范围约束：1~3650 天。';
COMMENT ON CONSTRAINT chk_runtime_cleanup_state_deleted_non_negative ON dataops.runtime_cleanup_state
  IS '删除行数必须为非负整数。';

CREATE INDEX IF NOT EXISTS idx_dataops_runtime_cleanup_state_last_cleanup_at
  ON dataops.runtime_cleanup_state (last_cleanup_at DESC);

COMMENT ON INDEX dataops.idx_dataops_runtime_cleanup_state_last_cleanup_at
  IS '按最近清理时间排序查看清理状态。';

CREATE OR REPLACE FUNCTION dataops.fn_touch_runtime_cleanup_state_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION dataops.fn_touch_runtime_cleanup_state_updated_at()
  IS '更新 runtime_cleanup_state 行时自动刷新 updated_at。';

DROP TRIGGER IF EXISTS trg_touch_runtime_cleanup_state_updated_at
  ON dataops.runtime_cleanup_state;

CREATE TRIGGER trg_touch_runtime_cleanup_state_updated_at
BEFORE UPDATE ON dataops.runtime_cleanup_state
FOR EACH ROW
EXECUTE FUNCTION dataops.fn_touch_runtime_cleanup_state_updated_at();

COMMENT ON TRIGGER trg_touch_runtime_cleanup_state_updated_at ON dataops.runtime_cleanup_state
  IS '更新 runtime_cleanup_state 行时自动刷新 updated_at。';

CREATE OR REPLACE FUNCTION dataops.cleanup_runtime_events(p_retain_days INTEGER DEFAULT 90)
RETURNS TABLE (
  cleanup_at TIMESTAMPTZ,
  retain_days INTEGER,
  audit_deleted INTEGER,
  notification_deleted INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_cutoff TIMESTAMPTZ;
  v_audit_deleted INTEGER := 0;
  v_notification_deleted INTEGER := 0;
BEGIN
  IF p_retain_days IS NULL OR p_retain_days < 1 OR p_retain_days > 3650 THEN
    RAISE EXCEPTION 'p_retain_days must be between 1 and 3650 days, got %', p_retain_days;
  END IF;

  v_cutoff := v_now - make_interval(days => p_retain_days);

  DELETE FROM dataops.runtime_audit_events
  WHERE event_at < v_cutoff;
  GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

  DELETE FROM dataops.runtime_notification_events
  WHERE event_at < v_cutoff;
  GET DIAGNOSTICS v_notification_deleted = ROW_COUNT;

  INSERT INTO dataops.runtime_cleanup_state (
    id,
    retain_days,
    last_cleanup_at,
    last_audit_deleted,
    last_notification_deleted,
    created_at,
    updated_at
  )
  VALUES (
    1,
    p_retain_days,
    v_now,
    v_audit_deleted,
    v_notification_deleted,
    v_now,
    v_now
  )
  ON CONFLICT (id) DO UPDATE
  SET
    retain_days = EXCLUDED.retain_days,
    last_cleanup_at = EXCLUDED.last_cleanup_at,
    last_audit_deleted = EXCLUDED.last_audit_deleted,
    last_notification_deleted = EXCLUDED.last_notification_deleted,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY
  SELECT v_now, p_retain_days, v_audit_deleted, v_notification_deleted;
END;
$$;

COMMENT ON FUNCTION dataops.cleanup_runtime_events(INTEGER)
  IS '按保留天数清理 DataOps 运行态审计/通知事件，并返回本次清理结果。';

INSERT INTO dataops.runtime_cleanup_state (
  id,
  retain_days,
  last_cleanup_at,
  last_audit_deleted,
  last_notification_deleted
)
VALUES (
  1,
  90,
  NULL,
  0,
  0
)
ON CONFLICT (id) DO NOTHING;
