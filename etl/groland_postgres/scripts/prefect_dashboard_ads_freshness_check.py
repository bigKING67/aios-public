from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List

from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from prefect_ops_utils import (
  DEFAULT_FEISHU_WEBHOOK_URL,
  run_psql,
  send_feishu_notification,
)


def _safe_send_notification(**kwargs) -> None:
  try:
    send_feishu_notification(**kwargs, raise_on_error=False)
  except Exception as notify_err:
    get_run_logger().warning(f"Feishu notification failed: {notify_err}")


def _parse_bool_flag(value: bool | str, field_name: str) -> bool:
  if isinstance(value, bool):
    return value

  normalized = str(value).strip().lower()
  if normalized in {"true", "1", "yes", "y", "on"}:
    return True
  if normalized in {"false", "0", "no", "n", "off"}:
    return False

  raise ValueError(f"{field_name} must be boolean, got {value!r}")


def _resolve_target_date(target_date: str) -> date:
  normalized = (target_date or "").strip().lower()
  if not normalized or normalized == "yesterday":
    return date.today() - timedelta(days=1)
  return date.fromisoformat(normalized)


def _json_date(value: Any) -> str:
  if value is None:
    return "-"
  return str(value)


def _build_freshness_sql(target_date: date) -> str:
  target = target_date.isoformat()
  return f"""
WITH target AS (
  SELECT DATE '{target}' AS target_date
),
overview_source_status AS (
  SELECT
    'douyin'::TEXT AS platform,
    COUNT(*) FILTER (WHERE src.stat_date::DATE = target.target_date)::BIGINT AS ods_rows,
    MAX(src.stat_date)::DATE AS ods_max_date
  FROM ods.douyin_trade_sale_raw src, target
  UNION ALL
  SELECT
    'jd',
    COUNT(*) FILTER (WHERE src.stat_date::DATE = target.target_date)::BIGINT,
    MAX(src.stat_date)::DATE
  FROM ods.jd_trade_sale_raw src, target
  UNION ALL
  SELECT
    'taobao',
    COUNT(*) FILTER (WHERE src.stat_date::DATE = target.target_date)::BIGINT,
    MAX(src.stat_date)::DATE
  FROM ods.taobao_trade_sale_raw src, target
  UNION ALL
  SELECT
    'wx',
    COUNT(*) FILTER (WHERE src.stat_date::DATE = target.target_date)::BIGINT,
    MAX(src.stat_date)::DATE
  FROM ods.wx_trade_sale_raw src, target
  UNION ALL
  SELECT
    'xhs',
    COUNT(*) FILTER (WHERE src.stat_date::DATE = target.target_date)::BIGINT,
    MAX(src.stat_date)::DATE
  FROM ods.xhs_trade_sale_raw src, target
),
pipeline_status AS (
  SELECT
    'overview:' || src.platform AS pipeline,
    src.ods_rows,
    (
      SELECT COUNT(*)::BIGINT
      FROM ads.all_trade_overview a
      WHERE a.platform = src.platform
        AND a."date" = target.target_date
    ) AS ads_rows,
    src.ods_max_date,
    (
      SELECT MAX(a."date")::DATE
      FROM ads.all_trade_overview a
      WHERE a.platform = src.platform
    ) AS ads_max_date,
    state.last_refresh_at
  FROM overview_source_status src
  CROSS JOIN target
  LEFT JOIN etl.all_trade_overview_refresh_state state
    ON state.platform = src.platform

  UNION ALL
  SELECT
    'taobao_goods_daily',
    (SELECT COUNT(*)::BIGINT FROM ods.taobao_trade_sale_goods_raw src, target t WHERE src.stat_date = t.target_date),
    (SELECT COUNT(*)::BIGINT FROM ads.taobao_trade_sale_goods_daily ads, target t WHERE ads.stat_date = t.target_date),
    (SELECT MAX(stat_date)::DATE FROM ods.taobao_trade_sale_goods_raw),
    (SELECT MAX(stat_date)::DATE FROM ads.taobao_trade_sale_goods_daily),
    (SELECT updated_at FROM etl.taobao_trade_sale_goods_daily_refresh_state WHERE id = 1)

  UNION ALL
  SELECT
    'taobao_traffic_shop_daily',
    (SELECT COUNT(*)::BIGINT FROM ods.taobao_traffic_shop_raw src, target t WHERE src.stat_date = t.target_date),
    (SELECT COUNT(*)::BIGINT FROM ads.taobao_traffic_shop_daily ads, target t WHERE ads.stat_date = t.target_date),
    (SELECT MAX(stat_date)::DATE FROM ods.taobao_traffic_shop_raw),
    (SELECT MAX(stat_date)::DATE FROM ads.taobao_traffic_shop_daily),
    (SELECT updated_at FROM etl.taobao_traffic_shop_daily_refresh_state WHERE id = 1)

  UNION ALL
  SELECT
    'taobao_traffic_goods_daily',
    (SELECT COUNT(*)::BIGINT FROM ods.taobao_traffic_goods_raw src, target t WHERE src.stat_date = t.target_date),
    (SELECT COUNT(*)::BIGINT FROM ads.taobao_traffic_goods_daily ads, target t WHERE ads.stat_date = t.target_date),
    (SELECT MAX(stat_date)::DATE FROM ods.taobao_traffic_goods_raw),
    (SELECT MAX(stat_date)::DATE FROM ads.taobao_traffic_goods_daily),
    (SELECT updated_at FROM etl.taobao_traffic_goods_daily_refresh_state WHERE id = 1)

  UNION ALL
  SELECT
    'douyin_live_detail',
    (SELECT COUNT(*)::BIGINT FROM ods.douyin_trade_sale_live_raw src, target t WHERE src.live_start_time::DATE = t.target_date),
    (SELECT COUNT(*)::BIGINT FROM ads.douyin_live_detail ads, target t WHERE ads.stat_date = t.target_date),
    (SELECT MAX(live_start_time)::DATE FROM ods.douyin_trade_sale_live_raw),
    (SELECT MAX(stat_date)::DATE FROM ads.douyin_live_detail),
    (SELECT updated_at FROM etl.douyin_live_detail_refresh_state WHERE id = 1)

  UNION ALL
  SELECT
    'douyin_live_goods_detail',
    (SELECT COUNT(*)::BIGINT FROM ods.douyin_livestream_goods src, target t WHERE src.live_start_time::DATE = t.target_date),
    (SELECT COUNT(*)::BIGINT FROM ads.douyin_live_goods_detail ads, target t WHERE ads.stat_date = t.target_date),
    (SELECT MAX(live_start_time)::DATE FROM ods.douyin_livestream_goods),
    (SELECT MAX(stat_date)::DATE FROM ads.douyin_live_goods_detail),
    (SELECT updated_at FROM etl.douyin_live_goods_detail_refresh_state WHERE id = 1)

  UNION ALL
  SELECT
    'douyin_shortvideo_detail',
    (SELECT COUNT(*)::BIGINT FROM ods.douyin_trade_sale_shortvideo_raw src, target t WHERE src.stat_date = t.target_date),
    (SELECT COUNT(*)::BIGINT FROM ads.douyin_shortvideo_detail ads, target t WHERE ads.stat_date = t.target_date),
    (SELECT MAX(stat_date)::DATE FROM ods.douyin_trade_sale_shortvideo_raw),
    (SELECT MAX(stat_date)::DATE FROM ads.douyin_shortvideo_detail),
    (SELECT updated_at FROM etl.douyin_shortvideo_detail_refresh_state WHERE id = 1)

  UNION ALL
  SELECT
    'douyin_trade_sale_card',
    COALESCE((
      SELECT COUNT(*)::BIGINT
      FROM ods.douyin_trade_sale_card_raw src, target t
      WHERE src."date" = t.target_date
    ), 0) + COALESCE((
      SELECT COUNT(*)::BIGINT
      FROM ods.douyin_trade_sale_card_detail_raw src, target t
      WHERE src.stat_date = t.target_date
    ), 0),
    COALESCE((
      SELECT COUNT(*)::BIGINT
      FROM ads.douyin_trade_sale_card ads, target t
      WHERE ads."date" = t.target_date
    ), 0) + COALESCE((
      SELECT COUNT(*)::BIGINT
      FROM ads.douyin_trade_sale_card_detail ads, target t
      WHERE ads.stat_date = t.target_date
    ), 0),
    GREATEST(
      COALESCE((SELECT MAX("date")::DATE FROM ods.douyin_trade_sale_card_raw), DATE '1970-01-01'),
      COALESCE((SELECT MAX(stat_date)::DATE FROM ods.douyin_trade_sale_card_detail_raw), DATE '1970-01-01')
    ),
    GREATEST(
      COALESCE((SELECT MAX("date")::DATE FROM ads.douyin_trade_sale_card), DATE '1970-01-01'),
      COALESCE((SELECT MAX(stat_date)::DATE FROM ads.douyin_trade_sale_card_detail), DATE '1970-01-01')
    ),
    (SELECT updated_at FROM etl.douyin_trade_sale_card_dashboard_refresh_state WHERE id = 1)
)
SELECT jsonb_pretty(jsonb_agg(
  jsonb_build_object(
    'pipeline', pipeline,
    'status',
      CASE
        WHEN ods_rows > 0 AND ads_rows > 0 THEN 'fresh'
        WHEN ods_rows > 0 AND ads_rows = 0 THEN 'ads_stale_after_ods'
        ELSE 'ods_missing'
      END,
    'targetDate', (SELECT target_date::TEXT FROM target),
    'odsRows', ods_rows,
    'adsRows', ads_rows,
    'odsMaxDate', COALESCE(ods_max_date::TEXT, '-'),
    'adsMaxDate', COALESCE(ads_max_date::TEXT, '-'),
    'lastRefreshAt', COALESCE(last_refresh_at::TEXT, '-')
  )
  ORDER BY pipeline
)) AS payload
FROM pipeline_status;
"""


@task(name="check-dashboard-ads-freshness", retries=1, retry_delay_seconds=30)
def check_dashboard_ads_freshness(target_date: str) -> List[Dict[str, Any]]:
  logger = get_run_logger()
  resolved_target_date = _resolve_target_date(target_date)
  output = run_psql(
    _build_freshness_sql(resolved_target_date),
    tuples_only=True,
    timeout=120,
  )
  payload = json.loads(output)
  if not isinstance(payload, list):
    raise RuntimeError("freshness query returned non-array payload")

  logger.info(
    "dashboard freshness target=%s payload=%s",
    resolved_target_date.isoformat(),
    json.dumps(payload, ensure_ascii=False),
  )
  return payload


@task(name="build-dashboard-ads-freshness-summary")
def build_freshness_summary(rows: List[Dict[str, Any]]) -> tuple[List[str], bool, bool]:
  stale_rows = [row for row in rows if row.get("status") == "ads_stale_after_ods"]
  missing_rows = [row for row in rows if row.get("status") == "ods_missing"]

  details: List[str] = []
  for row in rows:
    details.append(
      (
        f"{row.get('pipeline')}: {row.get('status')}，"
        f"target={row.get('targetDate')}，"
        f"ODS={row.get('odsRows')}，ADS={row.get('adsRows')}，"
        f"ODS最大={_json_date(row.get('odsMaxDate'))}，ADS最大={_json_date(row.get('adsMaxDate'))}，"
        f"lastRefresh={_json_date(row.get('lastRefreshAt'))}"
      )
    )

  return details, bool(stale_rows), bool(missing_rows)


@flow(name="dashboard-ads-freshness-check-flow")
def dashboard_ads_freshness_check_flow(
  target_date: str = "yesterday",
  notify_on_issue_only: bool = True,
  fail_on_stale: bool = False,
) -> None:
  notify_on_issue_only = _parse_bool_flag(notify_on_issue_only, "notify_on_issue_only")
  fail_on_stale = _parse_bool_flag(fail_on_stale, "fail_on_stale")

  rows = check_dashboard_ads_freshness(target_date=target_date)
  detail_lines, has_ads_stale, has_ods_missing = build_freshness_summary(rows=rows)
  has_issue = has_ads_stale or has_ods_missing

  status = "告警" if has_issue else "成功"
  if has_ads_stale:
    status = "失败" if fail_on_stale else "告警"

  if has_issue or not notify_on_issue_only:
    _safe_send_notification(
      title="Dashboard ADS 新鲜度检查",
      table_name="ads dashboard pipelines",
      action=f"freshness check target_date={target_date}",
      status=status,
      reason="ODS 已到但 ADS 未刷" if has_ads_stale else "",
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )

  if has_ads_stale and fail_on_stale:
    raise RuntimeError("ODS has target-date rows but ADS is stale for at least one pipeline")


if __name__ == "__main__":
  dashboard_ads_freshness_check_flow()
