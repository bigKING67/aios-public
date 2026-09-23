from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple

from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from prefect_ops_utils import (  # noqa: E402
  DEFAULT_FEISHU_WEBHOOK_URL,
  extract_notice_lines,
  run_psql,
  send_feishu_notification,
)


REFRESH_RESULT_PATTERN = re.compile(
  r"refresh_douyin_live_detail completed,\s*inserted_rows:\s*(\d+),\s*deleted_rows:\s*(\d+),\s*window:\s*\[([^\]]+)\]",
  re.IGNORECASE,
)

INCREMENTAL_RESULT_PATTERN = re.compile(
  r"incremental refresh completed,\s*source watermark\s*([^,]+),\s*refresh window\s*\[([^\]]+)\]",
  re.IGNORECASE,
)

WINDOW_VALUE_PATTERN = re.compile(
  r"^\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})\s*$"
)

MINUTE_REFRESH_RESULT_PATTERN = re.compile(
  r"douyin_live_session_minute_metrics refreshed for\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})",
  re.IGNORECASE,
)


def _safe_send_notification(**kwargs) -> None:
  try:
    send_feishu_notification(**kwargs, raise_on_error=False)
  except Exception as notify_err:
    get_run_logger().warning(f"Feishu notification failed: {notify_err}")


@task(name="init-douyin-live-detail-watermark", retries=1, retry_delay_seconds=30)
def init_watermark(fallback_window_days: int) -> str:
  logger = get_run_logger()
  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  output = run_psql(
    f"CALL ads.refresh_douyin_live_detail_incremental({fallback_window_days}, TRUE);"
  )
  if output:
    logger.info(output)
  return output


@task(name="refresh-douyin-live-detail-incremental", retries=2, retry_delay_seconds=120)
def run_incremental_refresh(fallback_window_days: int) -> str:
  logger = get_run_logger()
  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  output = run_psql(
    f"CALL ads.refresh_douyin_live_detail_incremental({fallback_window_days}, FALSE);"
  )
  if output:
    logger.info(output)
  return output


def _parse_refresh_window_value(window: str) -> Tuple[str, str]:
  matched = WINDOW_VALUE_PATTERN.match(window)
  if not matched:
    raise ValueError(f"Unrecognized refresh window format: {window}")

  start_date = matched.group(1)
  end_date = matched.group(2)
  if start_date > end_date:
    raise ValueError(f"Invalid refresh window: {window}")
  return start_date, end_date


def _parse_optional_window_row(raw_output: str) -> Tuple[Optional[str], Optional[str]]:
  row = (raw_output or "").strip()
  if not row:
    return None, None

  first_line = row.splitlines()[0].strip()
  if not first_line:
    return None, None

  parts = [part.strip() for part in first_line.split("|")]
  if len(parts) < 2:
    raise ValueError(f"Unrecognized refresh window row: {first_line}")

  start_date, end_date = parts[0], parts[1]
  if start_date in ("", "\\N") or end_date in ("", "\\N"):
    return None, None

  return _parse_refresh_window_value(f"{start_date} - {end_date}")


def resolve_incremental_refresh_window(raw_output: str) -> Tuple[Optional[str], Optional[str]]:
  notice_lines = extract_notice_lines(raw_output)
  starts: List[str] = []
  ends: List[str] = []

  for line in notice_lines:
    refresh_matched = REFRESH_RESULT_PATTERN.search(line)
    if refresh_matched:
      start_date, end_date = _parse_refresh_window_value(refresh_matched.group(3).strip())
      starts.append(start_date)
      ends.append(end_date)
      continue

    incremental_matched = INCREMENTAL_RESULT_PATTERN.search(line)
    if incremental_matched:
      start_date, end_date = _parse_refresh_window_value(incremental_matched.group(2).strip())
      starts.append(start_date)
      ends.append(end_date)

  if not starts or not ends:
    return None, None

  return min(starts), max(ends)


@task(name="build-douyin-live-detail-incremental-summary")
def build_incremental_summary(raw_output: str) -> Tuple[List[str], bool]:
  notice_lines = extract_notice_lines(raw_output)
  if not notice_lines:
    return ["执行完成，未返回额外日志"], False

  details: List[str] = []
  total_inserted = 0
  total_deleted = 0

  for line in notice_lines:
    refresh_matched = REFRESH_RESULT_PATTERN.search(line)
    if refresh_matched:
      inserted_rows = int(refresh_matched.group(1).strip())
      deleted_rows = int(refresh_matched.group(2).strip())
      window = refresh_matched.group(3).strip()
      total_inserted += inserted_rows
      total_deleted += deleted_rows
      details.append(f"ADS刷新窗口：{window}，插入 {inserted_rows}，删除 {deleted_rows}")
      continue

    incremental_matched = INCREMENTAL_RESULT_PATTERN.search(line)
    if incremental_matched:
      source_watermark = incremental_matched.group(1).strip()
      window = incremental_matched.group(2).strip()
      details.append(f"增量水位：{source_watermark}，增量窗口：{window}")
      continue

    if "init watermark completed" in line.lower():
      details.append(line)

  if total_inserted > 0 or total_deleted > 0:
    details.append(f"真实变更：插入 {total_inserted}，删除 {total_deleted}")

  has_effective_update = (total_inserted + total_deleted) > 0
  return details or ["执行完成，未识别到刷新明细"], has_effective_update


@task(name="refresh-douyin-live-session-minute-metrics", retries=2, retry_delay_seconds=120)
def refresh_session_minute_metrics(refresh_start_date: str, refresh_end_date: str) -> str:
  logger = get_run_logger()
  _parse_refresh_window_value(f"{refresh_start_date} - {refresh_end_date}")

  output = run_psql(
    "CALL ads.refresh_douyin_live_session_minute_metrics("
    f"DATE '{refresh_start_date}', DATE '{refresh_end_date}'"
    ");"
  )
  if output:
    logger.info(output)
  return output


@task(name="resolve-douyin-live-session-minute-metrics-window")
def resolve_session_minute_metrics_window(
  refresh_start_date: str,
  refresh_end_date: str,
) -> Tuple[str, str]:
  _parse_refresh_window_value(f"{refresh_start_date} - {refresh_end_date}")

  output = run_psql(
    f"""
WITH refreshed_detail_window AS (
  SELECT DATE '{refresh_start_date}' AS start_date, DATE '{refresh_end_date}' AS end_date
),
candidate_sessions AS (
  SELECT
    d.live_start_time::DATE AS live_start_date,
    (
      CASE
        WHEN d.live_end_time IS NOT NULL AND d.live_end_time > d.live_start_time
          THEN d.live_end_time
        ELSE d.live_start_time + (GREATEST(COALESCE(d.live_duration_minutes, 0), 1) * INTERVAL '1 minute')
      END
    )::DATE AS live_end_boundary_date
  FROM ads.douyin_live_detail d
  JOIN refreshed_detail_window w
    ON d.live_start_time::DATE BETWEEN w.start_date AND w.end_date
  WHERE d.live_start_time IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(d.anchor_douyin_id, '')), '') IS NOT NULL
)
SELECT
  COALESCE(MIN(live_start_date), DATE '{refresh_start_date}')::TEXT
  || '|'
  || COALESCE(MAX(live_end_boundary_date), DATE '{refresh_end_date}')::TEXT
FROM candidate_sessions;
""",
    tuples_only=True,
  )
  resolved_start_date, resolved_end_date = _parse_optional_window_row(output)
  return resolved_start_date or refresh_start_date, resolved_end_date or refresh_end_date


@task(name="resolve-douyin-live-session-minute-raw-update-window")
def resolve_minute_raw_update_window(
  fallback_window_days: int,
) -> Tuple[Optional[str], Optional[str]]:
  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  output = run_psql(
    f"""
WITH bridge_state AS (
  SELECT COALESCE(MAX(source_updated_at), TIMESTAMP '1970-01-01 00:00:00') AS max_source_updated_at
  FROM ads.douyin_live_session_minute_metrics
),
changed_raw AS (
  SELECT
    MIN(m.live_minute_time::DATE) AS start_date,
    MAX(m.live_minute_time::DATE) AS end_date
  FROM ods.douyin_livestream_minute_raw m
  CROSS JOIN bridge_state b
  WHERE COALESCE(m.updated_at, m.live_minute_time) > b.max_source_updated_at
),
latest_raw AS (
  SELECT MAX(m.live_minute_time::DATE) AS max_date
  FROM ods.douyin_livestream_minute_raw m
),
resolved AS (
  SELECT
    COALESCE(
      c.start_date,
      CASE
        WHEN l.max_date IS NOT NULL THEN l.max_date - ({fallback_window_days - 1} * INTERVAL '1 day')
        ELSE NULL
      END
    )::DATE AS start_date,
    COALESCE(c.end_date, l.max_date)::DATE AS end_date,
    c.start_date IS NOT NULL AS has_changed_raw
  FROM changed_raw c
  CROSS JOIN latest_raw l
)
SELECT start_date::TEXT || '|' || end_date::TEXT
FROM resolved
WHERE has_changed_raw IS TRUE
  AND start_date IS NOT NULL
  AND end_date IS NOT NULL;
""",
    tuples_only=True,
  )
  return _parse_optional_window_row(output)


@task(name="build-douyin-live-session-minute-metrics-summary")
def build_session_minute_metrics_summary(raw_output: str) -> List[str]:
  notice_lines = extract_notice_lines(raw_output)
  if not notice_lines:
    return ["分钟桥接刷新已执行，未返回额外日志"]

  details: List[str] = []
  for line in notice_lines:
    refresh_matched = MINUTE_REFRESH_RESULT_PATTERN.search(line)
    if refresh_matched:
      details.append(
        f"分钟桥接刷新窗口：{refresh_matched.group(1)} - {refresh_matched.group(2)}"
      )
      continue

    if "douyin_live_session_minute_metrics refresh skipped" in line.lower():
      details.append(line)

  return details or notice_lines


@flow(name="incremental-refresh-ads-douyin-live-detail-flow")
def incremental_refresh_douyin_live_detail_flow(
  fallback_window_days: int = 14,
  init_watermark_only: bool = False,
) -> None:
  action = "incremental refresh"
  status = "成功"
  reason = ""
  detail_lines: List[str] = []

  if init_watermark_only:
    action = f"initialize watermark only fallback_window_days={fallback_window_days}"
    try:
      raw_output = init_watermark(fallback_window_days=fallback_window_days)
      detail_lines = ["仅初始化水位，不刷新 ADS 数据"]
      summary_lines, _ = build_incremental_summary(raw_output=raw_output)
      detail_lines.extend(summary_lines)
    except Exception as error:
      status = "失败"
      reason = str(error)
      raise

    _safe_send_notification(
      title="ADS 抖音直播明细事实增量水位初始化通知",
      table_name="etl.douyin_live_detail_refresh_state",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    return

  has_effective_update = False
  has_minute_refresh = False

  try:
    action = f"incremental refresh fallback_window_days={fallback_window_days}"
    raw_output = run_incremental_refresh(fallback_window_days=fallback_window_days)
    detail_lines, has_effective_update = build_incremental_summary(raw_output=raw_output)

    minute_refresh_start_date: Optional[str] = None
    minute_refresh_end_date: Optional[str] = None
    if has_effective_update:
      refresh_start_date, refresh_end_date = resolve_incremental_refresh_window(raw_output)
      if refresh_start_date is None or refresh_end_date is None:
        raise RuntimeError(
          "Live-detail refresh changed rows but did not expose a parseable refresh window."
        )
      minute_refresh_start_date, minute_refresh_end_date = resolve_session_minute_metrics_window(
        refresh_start_date=refresh_start_date,
        refresh_end_date=refresh_end_date,
      )
      detail_lines.append(
        f"分钟桥接扩展窗口：{minute_refresh_start_date} - {minute_refresh_end_date}"
      )
    else:
      minute_refresh_start_date, minute_refresh_end_date = resolve_minute_raw_update_window(
        fallback_window_days=fallback_window_days,
      )
      if minute_refresh_start_date and minute_refresh_end_date:
        detail_lines.append(
          f"分钟源表增量窗口：{minute_refresh_start_date} - {minute_refresh_end_date}"
        )

    if minute_refresh_start_date and minute_refresh_end_date:
      minute_output = refresh_session_minute_metrics(
        refresh_start_date=minute_refresh_start_date,
        refresh_end_date=minute_refresh_end_date,
      )
      has_minute_refresh = True
      detail_lines.extend(build_session_minute_metrics_summary(raw_output=minute_output))
  except Exception as error:
    status = "失败"
    reason = str(error)
    _safe_send_notification(
      title="ADS 抖音直播明细事实增量刷新通知",
      table_name="ads.douyin_live_detail",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    raise

  if has_effective_update:
    _safe_send_notification(
      title="ADS 抖音直播明细事实增量刷新通知",
      table_name="ads.douyin_live_detail",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
  else:
    if has_minute_refresh:
      _safe_send_notification(
        title="ADS 抖音直播明细事实增量刷新通知",
        table_name="ads.douyin_live_detail",
        action=action,
        status=status,
        reason=reason,
        detail_lines=detail_lines,
        webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
      )
    else:
      get_run_logger().info("No effective data update detected; notification skipped.")


if __name__ == "__main__":
  incremental_refresh_douyin_live_detail_flow()
