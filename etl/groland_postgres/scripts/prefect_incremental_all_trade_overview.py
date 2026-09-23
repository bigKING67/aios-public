from __future__ import annotations

import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Tuple

from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from daily_business_brief.trigger import request_daily_brief_trigger
from prefect_ops_utils import (
  DEFAULT_FEISHU_WEBHOOK_URL,
  extract_notice_lines,
  run_psql,
  send_feishu_notification,
)


OVERVIEW_PLATFORMS = ("douyin", "jd", "taobao", "wx", "xhs")
OVERVIEW_SOURCE_READY_TIMEOUT_SECONDS = 15 * 60
OVERVIEW_SOURCE_READY_POLL_SECONDS = 5

OVERVIEW_SOURCE_READINESS_SQL = """
WITH target AS (
  SELECT CURRENT_DATE - 1 AS target_date
),
source_status AS (
  SELECT target.target_date, 'douyin'::TEXT AS platform,
         EXISTS (
           SELECT 1 FROM ods.douyin_trade_sale_raw src
           WHERE src.stat_date::DATE = target.target_date
         ) AS has_target_date
  FROM target
  UNION ALL
  SELECT target.target_date, 'jd',
         EXISTS (
           SELECT 1 FROM ods.jd_trade_sale_raw src
           WHERE src.stat_date::DATE = target.target_date
         )
  FROM target
  UNION ALL
  SELECT target.target_date, 'taobao',
         EXISTS (
           SELECT 1 FROM ods.taobao_trade_sale_raw src
           WHERE src.stat_date::DATE = target.target_date
         )
  FROM target
  UNION ALL
  SELECT target.target_date, 'wx',
         EXISTS (
           SELECT 1 FROM ods.wx_trade_sale_raw src
           WHERE src.stat_date::DATE = target.target_date
         )
  FROM target
  UNION ALL
  SELECT target.target_date, 'xhs',
         EXISTS (
           SELECT 1 FROM ods.xhs_trade_sale_raw src
           WHERE src.stat_date::DATE = target.target_date
         )
  FROM target
)
SELECT jsonb_build_object(
  'targetDate', target_date::TEXT,
  'missingPlatforms', COALESCE(
    jsonb_agg(platform ORDER BY platform) FILTER (WHERE NOT has_target_date),
    '[]'::JSONB
  )
)::TEXT
FROM source_status
GROUP BY target_date;
"""

OVERVIEW_ADS_READINESS_SQL = """
WITH target AS (
  SELECT DATE '{target_date}' AS target_date
),
expected(platform) AS (
  VALUES ('douyin'), ('jd'), ('taobao'), ('wx'), ('xhs')
)
SELECT jsonb_build_object(
  'targetDate', target.target_date::TEXT,
  'missingPlatforms', COALESCE(
    jsonb_agg(expected.platform ORDER BY expected.platform)
      FILTER (WHERE overview.platform IS NULL),
    '[]'::JSONB
  )
)::TEXT
FROM target
CROSS JOIN expected
LEFT JOIN ads.all_trade_overview overview
  ON overview."date" = target.target_date
 AND overview.platform = expected.platform
GROUP BY target.target_date;
"""

DAILY_BRIEF_PRODUCTION_LEDGER_SQL = """
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'deliveryId', id,
      'status', status,
      'attemptCount', attempt_count
    )::TEXT
    FROM dataops.daily_business_brief_deliveries
    WHERE brief_date = DATE '{target_date}'
      AND delivery_channel = 'production'
    ORDER BY id DESC
    LIMIT 1
  ),
  '{{}}'
);
"""


REFRESH_PLATFORM_PATTERN = re.compile(
  r"refresh_all_trade_overview_platform completed,\s*platform:\s*([^,]+),\s*deleted:\s*(\d+),\s*inserted:\s*(\d+),\s*window:\s*\[([^\]]+)\]",
  re.IGNORECASE,
)

NOWCAST_DAILY_PATTERN = re.compile(
  r"refresh_all_trade_overview_refund_nowcast_daily completed,\s*as_of_date\s*([^,]+),\s*inserted_rows\s*(\d+),\s*maturity_days\s*(\d+),\s*history_days\s*(\d+)(?:,\s*model_version\s*([^,]+))?",
  re.IGNORECASE,
)

NOWCAST_QUALITY_PATTERN = re.compile(
  r"refresh_all_trade_overview_refund_nowcast_quality_daily completed,\s*as_of_date\s*([^,]+),\s*eval_age_days\s*(\d+),\s*eval_window_days\s*(\d+),\s*inserted_rows\s*(\d+),\s*alert_platforms\s*(\d+)(?:,\s*model_version\s*([^,]+))?",
  re.IGNORECASE,
)


def _parse_readiness(
  raw_output: str,
  *,
  label: str,
) -> Tuple[str, List[str]]:
  try:
    payload = json.loads(raw_output.strip())
  except (AttributeError, json.JSONDecodeError) as error:
    raise RuntimeError(f"{label} returned invalid JSON") from error

  if not isinstance(payload, dict):
    raise RuntimeError(f"{label} returned a non-object payload")

  target_date = payload.get("targetDate")
  missing_platforms = payload.get("missingPlatforms")
  if not isinstance(target_date, str) or not target_date:
    raise RuntimeError(f"{label} omitted targetDate")
  if not isinstance(missing_platforms, list) or any(
    not isinstance(platform, str) for platform in missing_platforms
  ):
    raise RuntimeError(f"{label} returned invalid missingPlatforms")

  unknown_platforms = sorted(set(missing_platforms) - set(OVERVIEW_PLATFORMS))
  if unknown_platforms:
    raise RuntimeError(
      f"{label} returned unknown platforms: "
      + ", ".join(unknown_platforms)
    )

  return target_date, sorted(set(missing_platforms))


def _parse_source_readiness(raw_output: str) -> Tuple[str, List[str]]:
  return _parse_readiness(raw_output, label="overview source readiness")


def _parse_ads_readiness(raw_output: str) -> Tuple[str, List[str]]:
  return _parse_readiness(raw_output, label="overview ADS readiness")


def _parse_bool_flag(value: bool | str, field_name: str) -> bool:
  if isinstance(value, bool):
    return value
  if isinstance(value, str):
    normalized = value.strip().lower()
    if normalized in {"true", "1", "yes", "y", "on"}:
      return True
    if normalized in {"false", "0", "no", "n", "off", ""}:
      return False
  raise ValueError(f"{field_name} must be boolean (true/false), got {value!r}")


def _parse_target_date(target_date: str) -> date:
  try:
    parsed = date.fromisoformat(target_date)
  except (TypeError, ValueError) as error:
    raise RuntimeError(
      f"overview readiness returned invalid target date: {target_date!r}"
    ) from error
  return parsed


def _parse_production_ledger(raw_output: str) -> Dict[str, Any]:
  try:
    payload = json.loads(raw_output.strip())
  except (AttributeError, json.JSONDecodeError) as error:
    raise RuntimeError("daily brief production ledger returned invalid JSON") from error
  if not isinstance(payload, dict):
    raise RuntimeError(
      "daily brief production ledger returned a non-object payload"
    )
  status = payload.get("status")
  if status is None:
    return {}
  if status not in {"sending", "sent", "failed", "uncertain"}:
    raise RuntimeError(
      f"daily brief production ledger returned invalid status: {status!r}"
    )
  return payload


def _safe_send_notification(**kwargs) -> None:
  try:
    send_feishu_notification(**kwargs, raise_on_error=False)
  except Exception as notify_err:
    get_run_logger().warning(f"Feishu notification failed: {notify_err}")


@task(name="wait-all-trade-overview-source-readiness")
def wait_for_overview_source_readiness(
  timeout_seconds: int = OVERVIEW_SOURCE_READY_TIMEOUT_SECONDS,
  poll_seconds: int = OVERVIEW_SOURCE_READY_POLL_SECONDS,
) -> str:
  if timeout_seconds <= 0:
    raise ValueError("timeout_seconds must be greater than 0")
  if poll_seconds <= 0:
    raise ValueError("poll_seconds must be greater than 0")

  logger = get_run_logger()
  deadline = time.monotonic() + timeout_seconds

  while True:
    raw_output = run_psql(
      OVERVIEW_SOURCE_READINESS_SQL,
      tuples_only=True,
      timeout=min(timeout_seconds, 30),
    )
    target_date, missing_platforms = _parse_source_readiness(raw_output)
    if not missing_platforms:
      logger.info(
        "overview source readiness passed target_date=%s platforms=%s",
        target_date,
        ",".join(OVERVIEW_PLATFORMS),
      )
      return target_date

    remaining_seconds = deadline - time.monotonic()
    if remaining_seconds <= 0:
      raise RuntimeError(
        "overview source readiness timed out "
        f"target_date={target_date} missing_platforms={','.join(missing_platforms)}"
      )

    sleep_seconds = min(float(poll_seconds), remaining_seconds)
    logger.warning(
      "overview sources are not ready target_date=%s missing_platforms=%s "
      "retry_in_seconds=%.1f",
      target_date,
      ",".join(missing_platforms),
      sleep_seconds,
    )
    time.sleep(sleep_seconds)


@task(name="trigger-daily-business-brief-after-ads-ready")
def trigger_daily_business_brief_after_ads_ready(
  target_date: str,
) -> Dict[str, Any]:
  logger = get_run_logger()
  parsed_target_date = _parse_target_date(target_date)
  ads_output = run_psql(
    OVERVIEW_ADS_READINESS_SQL.format(target_date=parsed_target_date.isoformat()),
    tuples_only=True,
    timeout=30,
  )
  observed_target_date, missing_platforms = _parse_ads_readiness(ads_output)
  if observed_target_date != parsed_target_date.isoformat():
    raise RuntimeError(
      "overview ADS readiness target mismatch: "
      f"expected={parsed_target_date.isoformat()} observed={observed_target_date}"
    )
  if missing_platforms:
    raise RuntimeError(
      "overview ADS is not ready for daily brief "
      f"target_date={parsed_target_date.isoformat()} "
      f"missing_platforms={','.join(missing_platforms)}"
    )

  ledger_output = run_psql(
    DAILY_BRIEF_PRODUCTION_LEDGER_SQL.format(
      target_date=parsed_target_date.isoformat(),
    ),
    tuples_only=True,
    timeout=30,
  )
  ledger = _parse_production_ledger(ledger_output)
  if ledger:
    status = str(ledger["status"])
    logger.info(
      "Daily business brief readiness trigger suppressed: target_date=%s "
      "ledger_status=%s delivery_id=%s attempt_count=%s",
      parsed_target_date,
      status,
      ledger.get("deliveryId"),
      ledger.get("attemptCount"),
    )
    return {
      "status": "suppressed",
      "targetDate": parsed_target_date.isoformat(),
      "ledgerStatus": status,
    }

  trigger_result = request_daily_brief_trigger(target_date=parsed_target_date)
  logger.info(
    "Daily business brief readiness trigger finished: target_date=%s "
    "status=%s flow_run_id=%s flow_run_name=%s",
    parsed_target_date,
    trigger_result.status,
    trigger_result.flow_run_id or "unavailable",
    trigger_result.flow_run_name or "unavailable",
  )
  return {
    **trigger_result.to_dict(),
    "targetDate": parsed_target_date.isoformat(),
  }


@task(name="init-all-trade-overview-watermark", retries=1, retry_delay_seconds=30)
def init_watermark(fallback_window_days: int) -> str:
  logger = get_run_logger()
  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  output = run_psql(
    f"CALL ads.refresh_all_trade_overview_incremental({fallback_window_days}, TRUE);"
  )
  if output:
    logger.info(output)
  return output


@task(name="refresh-all-trade-overview-incremental", retries=2, retry_delay_seconds=120)
def run_incremental_refresh(fallback_window_days: int) -> str:
  logger = get_run_logger()
  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  output = run_psql(
    f"CALL ads.refresh_all_trade_overview_incremental({fallback_window_days}, FALSE);"
  )
  if output:
    logger.info(output)
  return output


@task(name="build-all-trade-overview-incremental-summary")
def build_incremental_summary(raw_output: str) -> Tuple[List[str], bool, bool]:
  notice_lines = extract_notice_lines(raw_output)
  if not notice_lines:
    return ["执行完成，未返回额外日志"], False, False

  details: List[str] = []
  total_deleted = 0
  total_inserted = 0
  has_nowcast_quality_alert = False

  for line in notice_lines:
    matched = REFRESH_PLATFORM_PATTERN.search(line)
    if matched:
      platform = matched.group(1).strip()
      deleted_rows = int(matched.group(2).strip())
      inserted_rows = int(matched.group(3).strip())
      window = matched.group(4).strip()

      total_deleted += deleted_rows
      total_inserted += inserted_rows
      details.append(
        f"[{platform}] 窗口={window}，删除={deleted_rows}，新增={inserted_rows}"
      )
      continue

    nowcast_daily_matched = NOWCAST_DAILY_PATTERN.search(line)
    if nowcast_daily_matched:
      as_of_date = nowcast_daily_matched.group(1).strip()
      inserted_rows = int(nowcast_daily_matched.group(2).strip())
      maturity_days = int(nowcast_daily_matched.group(3).strip())
      history_days = int(nowcast_daily_matched.group(4).strip())
      model_version = (
        nowcast_daily_matched.group(5).strip()
        if nowcast_daily_matched.group(5)
        else "unknown"
      )
      details.append(
        (
          f"[nowcast] as_of={as_of_date}，样本行={inserted_rows}，"
          f"maturity_days={maturity_days}，history_days={history_days}，model={model_version}"
        )
      )
      continue

    nowcast_quality_matched = NOWCAST_QUALITY_PATTERN.search(line)
    if nowcast_quality_matched:
      as_of_date = nowcast_quality_matched.group(1).strip()
      eval_age_days = int(nowcast_quality_matched.group(2).strip())
      eval_window_days = int(nowcast_quality_matched.group(3).strip())
      inserted_rows = int(nowcast_quality_matched.group(4).strip())
      alert_platforms = int(nowcast_quality_matched.group(5).strip())
      model_version = (
        nowcast_quality_matched.group(6).strip()
        if nowcast_quality_matched.group(6)
        else "unknown"
      )
      has_nowcast_quality_alert = has_nowcast_quality_alert or alert_platforms > 0
      quality_label = "告警" if alert_platforms > 0 else "通过"
      details.append(
        (
          f"[nowcast-quality] as_of={as_of_date}，age={eval_age_days}d，window={eval_window_days}d，"
          f"平台行={inserted_rows}，告警平台={alert_platforms}（{quality_label}），model={model_version}"
        )
      )
      continue

  skipped_lines = [line for line in notice_lines if "skipped" in line.lower()]
  if skipped_lines:
    details.append(f"增量跳过：{len(skipped_lines)} 个平台（无 ODS 增量）")

  if details:
    details.append(f"总计变更：删除={total_deleted}，新增={total_inserted}")

  has_effective_update = (total_deleted + total_inserted) > 0
  if not details:
    details = ["执行完成，未识别到刷新明细"]

  return details, has_effective_update, has_nowcast_quality_alert


@flow(name="incremental-refresh-ads-all-trade-overview-flow")
def incremental_refresh_all_trade_overview_flow(
  fallback_window_days: int = 7,
  init_watermark_only: bool = False,
  trigger_daily_brief: bool | str = False,
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
      summary_lines, _, _ = build_incremental_summary(raw_output=raw_output)
      detail_lines.extend(summary_lines)
    except Exception as error:
      status = "失败"
      reason = str(error)
      raise

    _safe_send_notification(
      title="ADS 全渠道日经营总览增量水位初始化通知",
      table_name="etl.all_trade_overview_refresh_state",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    return

  has_effective_update = False
  has_nowcast_quality_alert = False
  normalized_trigger_daily_brief = _parse_bool_flag(
    trigger_daily_brief,
    "trigger_daily_brief",
  )

  try:
    action = (
      f"incremental refresh fallback_window_days={fallback_window_days} "
      f"trigger_daily_brief={str(normalized_trigger_daily_brief).lower()}"
    )
    readiness_target_date = wait_for_overview_source_readiness()
    raw_output = run_incremental_refresh(fallback_window_days=fallback_window_days)
    detail_lines, has_effective_update, has_nowcast_quality_alert = (
      build_incremental_summary(raw_output=raw_output)
    )
    detail_lines.insert(
      0,
      f"[source-readiness] target={readiness_target_date}，全部平台 ODS 已就绪",
    )
    if normalized_trigger_daily_brief:
      trigger_result = trigger_daily_business_brief_after_ads_ready(
        target_date=readiness_target_date,
      )
      detail_lines.insert(
        1,
        "[daily-brief-trigger] "
        f"target={readiness_target_date}，"
        f"status={trigger_result.get('status', 'unknown')}",
      )
  except Exception as error:
    status = "失败"
    reason = str(error)
    _safe_send_notification(
      title="ADS 全渠道日经营总览增量刷新通知",
      table_name="ads.all_trade_overview",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    raise

  if has_effective_update or has_nowcast_quality_alert:
    if has_nowcast_quality_alert:
      detail_lines.append("nowcast 质量告警：WAPE 超过阈值的平台数大于 0，请优先核查活动日修正与上游增量。")
    _safe_send_notification(
      title="ADS 全渠道日经营总览增量刷新通知",
      table_name="ads.all_trade_overview",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
  else:
    get_run_logger().info("No effective data update detected; notification skipped.")


if __name__ == "__main__":
  incremental_refresh_all_trade_overview_flow()
