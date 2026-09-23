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


REFRESH_RESULT_PATTERN = re.compile(
  r"refresh_report_taobao_trade_product_metrics_week completed,\s*inserted:\s*(\d+),\s*deleted:\s*(\d+),\s*window:\s*\[([^\]]+)\]",
  re.IGNORECASE,
)


def _safe_send_notification(**kwargs) -> None:
  try:
    send_feishu_notification(**kwargs, raise_on_error=False)
  except Exception as notify_err:
    get_run_logger().warning(f"Feishu notification failed: {notify_err}")


def _format_refresh_line(raw_line: str) -> Tuple[str, int, int]:
  matched = REFRESH_RESULT_PATTERN.search(raw_line)
  if matched:
    inserted_rows = int(matched.group(1).strip())
    deleted_rows = int(matched.group(2).strip())
    window = matched.group(3).strip()
    return (
      f"ADS刷新窗口：{window}，插入 {inserted_rows}，删除 {deleted_rows}",
      inserted_rows,
      deleted_rows,
    )

  return raw_line, 0, 0


@task(name="init-taobao-trade-product-metrics-week-watermark", retries=1, retry_delay_seconds=30)
def init_watermark(fallback_window_days: int) -> str:
  logger = get_run_logger()
  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  output = run_psql(
    f"CALL ads.refresh_report_taobao_trade_product_metrics_week_incremental({fallback_window_days}, TRUE);"
  )
  if output:
    logger.info(output)
  return output


@task(name="refresh-taobao-trade-product-metrics-week-incremental", retries=2, retry_delay_seconds=120)
def run_incremental_refresh(fallback_window_days: int) -> str:
  logger = get_run_logger()

  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  output = run_psql(
    f"CALL ads.refresh_report_taobao_trade_product_metrics_week_incremental({fallback_window_days}, FALSE);"
  )

  if output:
    logger.info(output)
  return output


@task(name="build-taobao-trade-product-metrics-week-incremental-summary")
def build_incremental_summary(raw_output: str) -> Tuple[List[str], bool]:
  notice_lines = extract_notice_lines(raw_output)

  if not notice_lines:
    return ["执行完成，未返回额外日志"], False

  skipped_lines = [line for line in notice_lines if "skipped" in line.lower()]
  refreshed_raw_lines = [
    line for line in notice_lines
    if "refresh_report_taobao_trade_product_metrics_week completed" in line.lower()
  ]

  refreshed_lines: List[str] = []
  total_inserted = 0
  total_deleted = 0

  for line in refreshed_raw_lines:
    formatted_line, inserted_rows, deleted_rows = _format_refresh_line(line)
    refreshed_lines.append(formatted_line)
    total_inserted += inserted_rows
    total_deleted += deleted_rows

  details: List[str] = []
  if refreshed_lines:
    details.extend(refreshed_lines[:3])
    details.append(f"真实变更：插入 {total_inserted}，删除 {total_deleted}")

  if skipped_lines:
    details.append(f"增量跳过：{len(skipped_lines)} 次（无上游数据变更）")

  has_effective_update = (total_inserted + total_deleted) > 0
  if refreshed_lines and total_inserted == 0 and total_deleted == 0:
    has_effective_update = False

  return details or ["执行完成，未识别到刷新明细"], has_effective_update


@flow(name="incremental-refresh-ads-report-taobao-trade-product-metrics-week-flow")
def incremental_refresh_report_taobao_trade_product_metrics_week_flow(
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
      title="ADS 天猫商品周归因增量水位初始化通知",
      table_name="etl.report_taobao_trade_product_metrics_week_refresh_state",
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
      title="ADS 天猫商品周归因增量刷新通知",
      table_name="ads.report_taobao_trade_product_metrics_week",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    raise

  if has_effective_update:
    _safe_send_notification(
      title="ADS 天猫商品周归因增量刷新通知",
      table_name="ads.report_taobao_trade_product_metrics_week",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
  else:
    get_run_logger().info("No effective data update detected; notification skipped.")


if __name__ == "__main__":
  incremental_refresh_report_taobao_trade_product_metrics_week_flow()
