from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import List, Tuple

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


ROSTER_PATTERN = re.compile(
  r"refresh_creator_live_influencer_roster completed,\s*source_etl_loaded_at:\s*([^,]+),\s*inserted_rows:\s*(\d+)",
  re.IGNORECASE,
)

TRADE_PATTERN = re.compile(
  r"refresh_creator_live_trade_daily completed,\s*deleted_rows:\s*(\d+),\s*inserted_rows:\s*(\d+),\s*window:\s*\[([^\]]+)\]",
  re.IGNORECASE,
)

INCREMENTAL_PATTERN = re.compile(
  r"refresh_creator_live_dashboard_incremental completed,\s*roster_refreshed:\s*(\w+),\s*trade_refreshed:\s*(\w+),\s*window:\s*\[([^\]]+)\],\s*fallback_window_days:\s*(\d+)",
  re.IGNORECASE,
)


def _safe_send_notification(**kwargs) -> None:
  try:
    send_feishu_notification(**kwargs, raise_on_error=False)
  except Exception as notify_err:
    get_run_logger().warning(f"Feishu notification failed: {notify_err}")


@task(name="init-creator-live-dashboard-watermark", retries=1, retry_delay_seconds=30)
def init_watermark(fallback_window_days: int) -> str:
  logger = get_run_logger()
  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  output = run_psql(
    f"CALL ads.refresh_creator_live_dashboard_incremental({fallback_window_days}, TRUE);"
  )
  if output:
    logger.info(output)
  return output


@task(name="refresh-creator-live-dashboard-incremental", retries=2, retry_delay_seconds=120)
def run_incremental_refresh(fallback_window_days: int) -> str:
  logger = get_run_logger()

  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  output = run_psql(
    f"CALL ads.refresh_creator_live_dashboard_incremental({fallback_window_days}, FALSE);"
  )

  if output:
    logger.info(output)
  return output


@task(name="build-creator-live-dashboard-incremental-summary")
def build_incremental_summary(raw_output: str) -> Tuple[List[str], bool]:
  notice_lines = extract_notice_lines(raw_output)

  if not notice_lines:
    return ["执行完成，未返回额外日志"], False

  details: List[str] = []
  has_effective_update = False

  for line in notice_lines:
    roster_matched = ROSTER_PATTERN.search(line)
    if roster_matched:
      source_etl_loaded_at = roster_matched.group(1).strip()
      inserted_rows = int(roster_matched.group(2).strip())
      details.append(
        f"[roster] source_etl_loaded_at={source_etl_loaded_at}，inserted_rows={inserted_rows}"
      )
      has_effective_update = has_effective_update or inserted_rows > 0
      continue

    trade_matched = TRADE_PATTERN.search(line)
    if trade_matched:
      deleted_rows = int(trade_matched.group(1).strip())
      inserted_rows = int(trade_matched.group(2).strip())
      window = trade_matched.group(3).strip()
      details.append(
        f"[trade_daily] window={window}，deleted={deleted_rows}，inserted={inserted_rows}"
      )
      has_effective_update = has_effective_update or (deleted_rows + inserted_rows) > 0
      continue

    incremental_matched = INCREMENTAL_PATTERN.search(line)
    if incremental_matched:
      roster_refreshed = incremental_matched.group(1).strip().lower() == "true"
      trade_refreshed = incremental_matched.group(2).strip().lower() == "true"
      window = incremental_matched.group(3).strip()
      fallback_window_days = int(incremental_matched.group(4).strip())
      details.append(
        (
          f"[incremental] roster_refreshed={roster_refreshed}，trade_refreshed={trade_refreshed}，"
          f"window={window}，fallback_window_days={fallback_window_days}"
        )
      )
      has_effective_update = has_effective_update or roster_refreshed or trade_refreshed
      continue

  skipped_lines = [line for line in notice_lines if "skipped" in line.lower()]
  if skipped_lines:
    details.append(f"增量跳过：{len(skipped_lines)} 次（无可处理增量）")

  return details or ["执行完成，未识别到刷新明细"], has_effective_update


@flow(name="incremental-refresh-ads-creator-live-dashboard-flow")
def incremental_refresh_creator_live_dashboard_flow(
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
      title="ADS 直播达人看板增量水位初始化通知",
      table_name="etl.creator_live_dashboard_refresh_state",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    return

  has_effective_update = False

  try:
    action = f"incremental refresh fallback_window_days={fallback_window_days}"
    raw_output = run_incremental_refresh(fallback_window_days=fallback_window_days)
    detail_lines, has_effective_update = build_incremental_summary(raw_output=raw_output)
  except Exception as error:
    status = "失败"
    reason = str(error)
    _safe_send_notification(
      title="ADS 直播达人看板增量刷新通知",
      table_name="ads.influencer_live_detail",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    raise

  if has_effective_update:
    _safe_send_notification(
      title="ADS 直播达人看板增量刷新通知",
      table_name="ads.influencer_live_detail",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
  else:
    get_run_logger().info("No effective data update detected; notification skipped.")


if __name__ == "__main__":
  incremental_refresh_creator_live_dashboard_flow()
