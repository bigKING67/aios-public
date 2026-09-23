#!/usr/bin/env bash

set -euo pipefail

log() {
  printf '[overview-schema-check] %s\n' "$*"
}

fail() {
  printf '[overview-schema-check] ERROR: %s\n' "$*" >&2
  exit 1
}

if [[ -n "${PSQL_BIN:-}" ]]; then
  PSQL_CMD="$PSQL_BIN"
elif command -v psql >/dev/null 2>&1; then
  PSQL_CMD="$(command -v psql)"
else
  fail "未找到 psql，可通过环境变量 PSQL_BIN 指定。"
fi

has_database_url="0"
has_pg_tuple="0"

if [[ -n "${DATABASE_URL:-}" ]]; then
  has_database_url="1"
fi

if [[ -n "${PGHOST:-}" && -n "${PGUSER:-}" && -n "${PGDATABASE:-}" ]]; then
  has_pg_tuple="1"
fi

if [[ "$has_database_url" != "1" && "$has_pg_tuple" != "1" ]]; then
  fail "缺少数据库连接配置。请提供 DATABASE_URL，或至少设置 PGHOST/PGUSER/PGDATABASE（密码可来自 PGPASSWORD/.pgpass）。"
fi

CHECK_SQL="$(cat <<'SQL'
WITH checks AS (
  SELECT
    'column ads.all_trade_overview.refund_amount_pay_time' AS object_name,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'ads'
        AND c.table_name = 'all_trade_overview'
        AND c.column_name = 'refund_amount_pay_time'
    ) AS is_present
  UNION ALL
  SELECT
    'column ads.all_trade_overview.user_pay_amount' AS object_name,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'ads'
        AND c.table_name = 'all_trade_overview'
        AND c.column_name = 'user_pay_amount'
    ) AS is_present
  UNION ALL
  SELECT
    'column ads.all_trade_overview.refund_amount_refund_time' AS object_name,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'ads'
        AND c.table_name = 'all_trade_overview'
        AND c.column_name = 'refund_amount_refund_time'
    ) AS is_present
  UNION ALL
  SELECT
    'table ads.all_trade_overview_refund_nowcast_daily' AS object_name,
    to_regclass('ads.all_trade_overview_refund_nowcast_daily') IS NOT NULL AS is_present
  UNION ALL
  SELECT
    'table ads.all_trade_overview_refund_nowcast_quality_daily' AS object_name,
    to_regclass('ads.all_trade_overview_refund_nowcast_quality_daily') IS NOT NULL AS is_present
  UNION ALL
  SELECT
    'table ads.all_trade_overview_refund_nowcast_calibration_weekly' AS object_name,
    to_regclass('ads.all_trade_overview_refund_nowcast_calibration_weekly') IS NOT NULL AS is_present
  UNION ALL
  SELECT
    'table ads.all_trade_overview_refund_nowcast_active_calibration' AS object_name,
    to_regclass('ads.all_trade_overview_refund_nowcast_active_calibration') IS NOT NULL AS is_present
  UNION ALL
  SELECT
    'procedure ads.refresh_all_trade_overview_incremental' AS object_name,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'ads'
        AND p.proname = 'refresh_all_trade_overview_incremental'
    ) AS is_present
  UNION ALL
  SELECT
    'procedure ads.refresh_all_trade_overview_refund_nowcast_daily' AS object_name,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'ads'
        AND p.proname = 'refresh_all_trade_overview_refund_nowcast_daily'
    ) AS is_present
  UNION ALL
  SELECT
    'procedure ads.refresh_all_trade_overview_refund_nowcast_quality_daily' AS object_name,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'ads'
        AND p.proname = 'refresh_all_trade_overview_refund_nowcast_quality_daily'
    ) AS is_present
  UNION ALL
  SELECT
    'procedure ads.refresh_all_trade_overview_refund_nowcast_calibration_weekly' AS object_name,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'ads'
        AND p.proname = 'refresh_all_trade_overview_refund_nowcast_calibration_weekly'
    ) AS is_present
  UNION ALL
  SELECT
    'procedure ads.activate_all_trade_overview_refund_nowcast_calibration' AS object_name,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'ads'
        AND p.proname = 'activate_all_trade_overview_refund_nowcast_calibration'
    ) AS is_present
)
SELECT object_name
FROM checks
WHERE NOT is_present
ORDER BY object_name;
SQL
)"

log "开始校验看板 overview 关键 schema 依赖..."
missing_objects="$("$PSQL_CMD" -X -A -t -v ON_ERROR_STOP=1 -c "$CHECK_SQL")"

if [[ -n "$missing_objects" ]]; then
  log "检测到缺失对象："
  while IFS= read -r object_name; do
    [[ -n "$object_name" ]] || continue
    printf '  - %s\n' "$object_name" >&2
  done <<< "$missing_objects"
  fail "schema 预检失败。请先执行 20260325_2310、20260326_0910、20260612_1500、20260613_1730、20260613_1930 相关迁移，并完成一次 ETL 补刷。"
fi

log "schema 预检通过。"
