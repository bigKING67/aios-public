-- DataOps 运行态清理能力健康检查
-- 用法：
-- psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f tests/sql/dataops_runtime_cleanup_check.sql

WITH target_schema AS (
  SELECT n.oid AS schema_oid
  FROM pg_namespace n
  WHERE n.nspname = 'dataops'
),
required_tables AS (
  SELECT unnest(ARRAY[
    'runtime_audit_events',
    'runtime_notification_events',
    'runtime_trigger_locks',
    'runtime_batch_execution_events',
    'runtime_cleanup_state'
  ]) AS relname
),
required_functions AS (
  SELECT unnest(ARRAY[
    'cleanup_runtime_events',
    'fn_touch_runtime_cleanup_state_updated_at'
  ]) AS proname
),
required_cleanup_columns AS (
  SELECT unnest(ARRAY[
    'retain_days',
    'last_cleanup_at',
    'last_audit_deleted',
    'last_notification_deleted',
    'last_batch_execution_deleted',
    'updated_at'
  ]) AS column_name
),
required_notification_columns AS (
  SELECT unnest(ARRAY[
    'reason_hash',
    'retry_group_id'
  ]) AS column_name
),
required_indexes AS (
  SELECT unnest(ARRAY[
    'idx_dataops_runtime_audit_events_time',
    'idx_dataops_runtime_notification_events_time',
    'idx_dataops_runtime_notification_events_reason_hash',
    'idx_dataops_runtime_notification_events_retry_group_id',
    'idx_dataops_runtime_trigger_locks_expire',
    'idx_dataops_runtime_batch_execution_events_time'
  ]) AS index_name
)
SELECT
  CASE WHEN (SELECT COUNT(*) FROM target_schema) = 1 THEN 'OK' ELSE 'FAIL' END AS schema_exists,
  (
    SELECT COUNT(*)
    FROM required_tables t
    JOIN pg_class c ON c.relname = t.relname AND c.relkind = 'r'
    JOIN target_schema s ON c.relnamespace = s.schema_oid
  ) AS found_table_count,
  (
    SELECT COUNT(*)
    FROM required_functions f
    JOIN pg_proc p ON p.proname = f.proname
    JOIN target_schema s ON p.pronamespace = s.schema_oid
  ) AS found_function_count,
  (
    SELECT COUNT(*)
    FROM required_cleanup_columns rc
    JOIN information_schema.columns c
      ON c.table_schema = 'dataops'
     AND c.table_name = 'runtime_cleanup_state'
     AND c.column_name = rc.column_name
  ) AS found_cleanup_state_column_count,
  (
    SELECT COUNT(*)
    FROM required_notification_columns rc
    JOIN information_schema.columns c
      ON c.table_schema = 'dataops'
     AND c.table_name = 'runtime_notification_events'
     AND c.column_name = rc.column_name
  ) AS found_notification_tracking_column_count,
  (
    SELECT COUNT(*)
    FROM required_indexes ri
    JOIN pg_class i ON i.relname = ri.index_name AND i.relkind = 'i'
    JOIN target_schema s ON i.relnamespace = s.schema_oid
  ) AS found_index_count,
  (
    SELECT COUNT(*)
    FROM dataops.runtime_cleanup_state
    WHERE id = 1
  ) AS cleanup_state_row_count;
