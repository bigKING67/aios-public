from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, List, Tuple

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


SCOPE_LABELS: Dict[str, str] = {
  "live": "直播",
  "shortvideo": "短视频",
  "card": "商品卡",
}

SCOPE_PROCEDURES: Dict[str, str] = {
  "live": "ads.refresh_report_douyin_trade_sale_live_metrics_week_incremental",
  "shortvideo": "ads.refresh_report_douyin_trade_sale_shortvideo_metrics_week_incremental",
  "card": "ads.refresh_report_douyin_trade_sale_card_metrics_week_incremental",
}

SCOPE_FULL_REFRESH_PROCEDURES: Dict[str, str] = {
  "live": "ads.refresh_report_douyin_trade_sale_live_metrics_week",
  "shortvideo": "ads.refresh_report_douyin_trade_sale_shortvideo_metrics_week",
  "card": "ads.refresh_report_douyin_trade_sale_card_metrics_week",
}

SCOPE_TARGET_TABLES: Dict[str, str] = {
  "live": "ads.report_douyin_trade_sale_live_metrics_week",
  "shortvideo": "ads.report_douyin_trade_sale_shortvideo_metrics_week",
  "card": "ads.report_douyin_trade_sale_card_metrics_week",
}


def _safe_send_notification(**kwargs) -> None:
  try:
    send_feishu_notification(**kwargs, raise_on_error=False)
  except Exception as notify_err:
    get_run_logger().warning(f"Feishu notification failed: {notify_err}")


def _build_sql(scope: str, fallback_window_days: int, init_watermark_only: bool) -> str:
  procedure = SCOPE_PROCEDURES[scope]
  init_flag = "TRUE" if init_watermark_only else "FALSE"
  return f"CALL {procedure}({fallback_window_days}, {init_flag});"


def _build_full_refresh_sql(scope: str) -> str:
  procedure = SCOPE_FULL_REFRESH_PROCEDURES[scope]
  return f"CALL {procedure}(NULL, NULL);"


def _query_target_row_count(scope: str) -> int:
  table_name = SCOPE_TARGET_TABLES[scope]
  output = run_psql(
    f"SELECT COUNT(*)::BIGINT FROM {table_name};",
    tuples_only=True,
  )

  for raw_line in output.splitlines():
    line = raw_line.strip()
    if not line or line.startswith("NOTICE:") or line.startswith("WARNING:"):
      continue
    try:
      return max(int(line.split("|")[0].strip()), 0)
    except ValueError:
      continue

  raise RuntimeError(f"failed to parse row count from query output: table={table_name}, output={output}")


@task(name="refresh-douyin-trade-sale-attribution-metrics-week-incremental", retries=2, retry_delay_seconds=120)
def run_incremental_refresh(
  fallback_window_days: int,
  init_watermark_only: bool = False,
) -> List[Tuple[str, str, bool, int]]:
  logger = get_run_logger()
  if fallback_window_days <= 0:
    raise ValueError("fallback_window_days must be greater than 0")

  results: List[Tuple[str, str, bool, int]] = []
  for scope in ("live", "shortvideo", "card"):
    sql_statement = _build_sql(
      scope=scope,
      fallback_window_days=fallback_window_days,
      init_watermark_only=init_watermark_only,
    )
    output = run_psql(sql_statement)
    if output:
      logger.info("[%s] %s", scope, output)

    bootstrap_full_refresh_executed = False
    row_count = _query_target_row_count(scope)

    if not init_watermark_only and row_count == 0:
      bootstrap_sql = _build_full_refresh_sql(scope)
      bootstrap_output = run_psql(bootstrap_sql)
      bootstrap_full_refresh_executed = True
      row_count = _query_target_row_count(scope)

      bootstrap_notice = (
        "NOTICE: bootstrap full refresh executed because target table is empty"
      )
      output = "\n".join(
        chunk for chunk in [output, bootstrap_notice, bootstrap_output] if chunk
      )

      if bootstrap_output:
        logger.info("[%s] %s", scope, bootstrap_output)

    results.append((scope, output, bootstrap_full_refresh_executed, row_count))
  return results


@task(name="build-douyin-trade-sale-attribution-metrics-week-incremental-summary")
def build_incremental_summary(
  scope_outputs: List[Tuple[str, str, bool, int]],
) -> Tuple[List[str], bool]:
  detail_lines: List[str] = []
  has_effective_update = False

  for scope, output, bootstrap_full_refresh_executed, row_count in scope_outputs:
    scope_label = SCOPE_LABELS[scope]
    notice_lines = extract_notice_lines(output)

    if bootstrap_full_refresh_executed:
      has_effective_update = True
      detail_lines.append(
        f"{scope_label}：检测到目标表为空，已自动执行首轮全量回灌（当前行数={row_count}）"
      )

    if not notice_lines:
      detail_lines.append(f"{scope_label}：执行完成，未返回额外日志（当前行数={row_count}）")
      continue

    completed_lines = [line for line in notice_lines if "completed" in line.lower()]
    skipped_lines = [line for line in notice_lines if "skipped" in line.lower()]

    if completed_lines:
      has_effective_update = True
      detail_lines.append(f"{scope_label}：执行完成（当前行数={row_count}）")
      detail_lines.extend([f"{scope_label}：{line}" for line in completed_lines[:2]])
    elif skipped_lines:
      detail_lines.append(f"{scope_label}：增量跳过（无上游数据变更，当前行数={row_count}）")
    else:
      detail_lines.append(f"{scope_label}：{notice_lines[0]}（当前行数={row_count}）")

  return detail_lines or ["执行完成，未识别到刷新明细"], has_effective_update


@flow(name="incremental-refresh-ads-report-douyin-trade-sale-attribution-metrics-week-flow")
def incremental_refresh_report_douyin_trade_sale_attribution_metrics_week_flow(
  fallback_window_days: int = 14,
  init_watermark_only: bool = False,
) -> None:
  action = "incremental refresh"
  status = "成功"
  reason = ""
  detail_lines: List[str] = []

  title = "ADS 抖音归因周指标增量刷新通知"
  target_table = (
    "ads.report_douyin_trade_sale_live_metrics_week / "
    "ads.report_douyin_trade_sale_shortvideo_metrics_week / "
    "ads.report_douyin_trade_sale_card_metrics_week"
  )

  if init_watermark_only:
    action = f"initialize watermark only fallback_window_days={fallback_window_days}"
    title = "ADS 抖音归因周指标增量水位初始化通知"
    target_table = (
      "etl.report_douyin_trade_sale_live_metrics_week_refresh_state / "
      "etl.report_douyin_trade_sale_shortvideo_metrics_week_refresh_state / "
      "etl.report_douyin_trade_sale_card_metrics_week_refresh_state"
    )

    try:
      scope_outputs = run_incremental_refresh(
        fallback_window_days=fallback_window_days,
        init_watermark_only=True,
      )
      detail_lines = ["仅初始化水位，不刷新 ADS 数据"]
      summary_lines, _ = build_incremental_summary(scope_outputs=scope_outputs)
      detail_lines.extend(summary_lines)
    except Exception as error:
      status = "失败"
      reason = str(error)
      raise

    _safe_send_notification(
      title=title,
      table_name=target_table,
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
    scope_outputs = run_incremental_refresh(
      fallback_window_days=fallback_window_days,
      init_watermark_only=False,
    )
    detail_lines, has_effective_update = build_incremental_summary(scope_outputs=scope_outputs)
  except Exception as error:
    status = "失败"
    reason = str(error)
    _safe_send_notification(
      title=title,
      table_name=target_table,
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    raise

  if has_effective_update:
    _safe_send_notification(
      title=title,
      table_name=target_table,
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
  else:
    get_run_logger().info("No effective data update detected; notification skipped.")


if __name__ == "__main__":
  incremental_refresh_report_douyin_trade_sale_attribution_metrics_week_flow()
