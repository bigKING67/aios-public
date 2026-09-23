-- DataOps 运行态清理函数扩展：
-- 1) 新增批量执行历史清理统计列
-- 2) 清理函数支持可选清理 runtime_batch_execution_events
-- 3) 清理结果返回新增 batch_execution_deleted

CREATE SCHEMA IF NOT EXISTS dataops;

ALTER TABLE dataops.runtime_cleanup_state
  ADD COLUMN IF NOT EXISTS last_batch_execution_deleted INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN dataops.runtime_cleanup_state.last_batch_execution_deleted
  IS '最近一次清理删除的批量执行历史行数。';

ALTER TABLE dataops.runtime_cleanup_state
  DROP CONSTRAINT IF EXISTS chk_runtime_cleanup_state_deleted_non_negative;

ALTER TABLE dataops.runtime_cleanup_state
  ADD CONSTRAINT chk_runtime_cleanup_state_deleted_non_negative CHECK (
    last_audit_deleted >= 0
    AND last_notification_deleted >= 0
    AND last_batch_execution_deleted >= 0
  );

COMMENT ON CONSTRAINT chk_runtime_cleanup_state_deleted_non_negative ON dataops.runtime_cleanup_state
  IS '删除行数必须为非负整数（审计/通知/批量历史）。';

DROP FUNCTION IF EXISTS dataops.cleanup_runtime_events(INTEGER);
DROP FUNCTION IF EXISTS dataops.cleanup_runtime_events(INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION dataops.cleanup_runtime_events(
  p_retain_days INTEGER DEFAULT 90,
  p_cleanup_batch_execution_events BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  cleanup_at TIMESTAMPTZ,
  retain_days INTEGER,
  audit_deleted INTEGER,
  notification_deleted INTEGER,
  batch_execution_deleted INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_cutoff TIMESTAMPTZ;
  v_audit_deleted INTEGER := 0;
  v_notification_deleted INTEGER := 0;
  v_batch_execution_deleted INTEGER := 0;
  v_cleanup_batch_execution_events BOOLEAN := COALESCE(p_cleanup_batch_execution_events, TRUE);
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

  IF v_cleanup_batch_execution_events THEN
    DELETE FROM dataops.runtime_batch_execution_events
    WHERE event_at < v_cutoff;
    GET DIAGNOSTICS v_batch_execution_deleted = ROW_COUNT;
  END IF;

  INSERT INTO dataops.runtime_cleanup_state (
    id,
    retain_days,
    last_cleanup_at,
    last_audit_deleted,
    last_notification_deleted,
    last_batch_execution_deleted,
    created_at,
    updated_at
  )
  VALUES (
    1,
    p_retain_days,
    v_now,
    v_audit_deleted,
    v_notification_deleted,
    v_batch_execution_deleted,
    v_now,
    v_now
  )
  ON CONFLICT (id) DO UPDATE
  SET
    retain_days = EXCLUDED.retain_days,
    last_cleanup_at = EXCLUDED.last_cleanup_at,
    last_audit_deleted = EXCLUDED.last_audit_deleted,
    last_notification_deleted = EXCLUDED.last_notification_deleted,
    last_batch_execution_deleted = EXCLUDED.last_batch_execution_deleted,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY
  SELECT
    v_now,
    p_retain_days,
    v_audit_deleted,
    v_notification_deleted,
    v_batch_execution_deleted;
END;
$$;

COMMENT ON FUNCTION dataops.cleanup_runtime_events(INTEGER, BOOLEAN)
  IS '按保留天数清理 DataOps 运行态审计/通知/批量历史事件，并返回本次清理结果。';

INSERT INTO dataops.runtime_cleanup_state (
  id,
  retain_days,
  last_cleanup_at,
  last_audit_deleted,
  last_notification_deleted,
  last_batch_execution_deleted
)
VALUES (
  1,
  90,
  NULL,
  0,
  0,
  0
)
ON CONFLICT (id) DO NOTHING;
