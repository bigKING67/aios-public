from __future__ import annotations

import re
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import List, Optional, Tuple

from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from prefect_ops_utils import run_psql, send_feishu_notification


REFRESH_RESULT_PATTERN = re.compile(
  r"inserted:\s*(\d+),\s*updated:\s*(\d+),\s*deleted:\s*(\d+),\s*unchanged:\s*(\d+),\s*window:\s*\[\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})\s*\]",
  re.IGNORECASE,
)
LEGACY_REFRESH_RESULT_PATTERN = re.compile(
  r"deleted:\s*(\d+),\s*inserted:\s*(\d+),\s*window:\s*\[\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})\s*\]",
  re.IGNORECASE,
)


def _parse_iso_date(raw_value: str, field_name: str) -> date:
  try:
    return date.fromisoformat(raw_value)
  except ValueError as error:
    raise ValueError(f"{field_name} must be in YYYY-MM-DD format") from error


def _resolve_refresh_window(
  start_date: Optional[str],
  end_date: Optional[str],
  window_days: int,
) -> Tuple[date, date]:
  if start_date and end_date:
    resolved_start = _parse_iso_date(start_date, "start_date")
    resolved_end = _parse_iso_date(end_date, "end_date")
  elif start_date or end_date:
    raise ValueError("start_date and end_date must be provided together")
  else:
    if window_days <= 0:
      raise ValueError("window_days must be greater than 0")
    resolved_end = date.today()
    resolved_start = resolved_end - timedelta(days=window_days - 1)

  if resolved_start > resolved_end:
    raise ValueError("start_date cannot be greater than end_date")

  return resolved_start, resolved_end


@task(name="refresh-dwd-taobao-goods-sale-traffic", retries=2, retry_delay_seconds=120)
def refresh_dwd_taobao_goods_sale_traffic(start_date: date, end_date: date) -> str:
  logger = get_run_logger()

  sql_statement = (
    f"CALL dwd.refresh_taobao_goods_sale_traffic('{start_date.isoformat()}', '{end_date.isoformat()}');"
  )

  logger.info(
    "Refreshing dwd.taobao_goods_sale_traffic for window [%s - %s]",
    start_date,
    end_date,
  )

  output = run_psql(sql_statement)
  if output:
    logger.info(output)
  return output


@task(name="build-taobao-goods-sale-traffic-detail-lines")
def build_detail_lines(raw_output: str, start_date: date, end_date: date) -> Tuple[List[str], bool]:
  details: List[str] = [f"请求窗口：{start_date} ~ {end_date}"]
  has_effective_update = False
  normalized_output = raw_output or ""

  match = REFRESH_RESULT_PATTERN.search(normalized_output)
  if match:
    inserted_rows, updated_rows, deleted_rows, unchanged_rows, actual_start_date, actual_end_date = match.groups()
    details.append(
      f"DWD刷新：新增={inserted_rows}，更新={updated_rows}，删除={deleted_rows}，未变化={unchanged_rows}，窗口={actual_start_date} ~ {actual_end_date}"
    )
    has_effective_update = (int(inserted_rows) + int(updated_rows) + int(deleted_rows)) > 0
    notice_lines = [line.strip().replace("NOTICE:", "").strip() for line in normalized_output.splitlines() if line.strip().startswith("NOTICE:")]
    insert_detail_lines = [line for line in notice_lines if line.lower().startswith("insert detail:")]
    update_detail_lines = [line for line in notice_lines if line.lower().startswith("update detail:")]
    if insert_detail_lines:
      details.append(f"新增明细：{insert_detail_lines[0].split(':', 1)[1].strip()}")
    if update_detail_lines:
      details.append(f"更新明细：{update_detail_lines[0].split(':', 1)[1].strip()}")
    return details, has_effective_update

  legacy_match = LEGACY_REFRESH_RESULT_PATTERN.search(normalized_output)
  if legacy_match:
    deleted_rows, inserted_rows, actual_start_date, actual_end_date = legacy_match.groups()
    details.append(
      f"DWD刷新（旧版）：新增={inserted_rows}，更新=0，删除={deleted_rows}，窗口={actual_start_date} ~ {actual_end_date}"
    )
    has_effective_update = (int(inserted_rows) + int(deleted_rows)) > 0
    return details, has_effective_update

  lowered = normalized_output.lower()
  if "has no data, skipped" in lowered:
    details.append("ODS源表无数据，未执行刷新")
  else:
    details.append("刷新已执行（未解析到删除/新增行数）")
  return details, has_effective_update


@flow(name="refresh-dwd-taobao-goods-sale-traffic-flow")
def refresh_taobao_goods_sale_traffic_flow(
  start_date: Optional[str] = None,
  end_date: Optional[str] = None,
  window_days: int = 7,
) -> None:
  action = "full-window refresh"
  status = "成功"
  reason = ""
  detail_lines: List[str] = []
  has_effective_update = False

  try:
    resolved_start, resolved_end = _resolve_refresh_window(
      start_date=start_date,
      end_date=end_date,
      window_days=window_days,
    )
    action = f"full-window refresh [{resolved_start} - {resolved_end}]"
    raw_output = refresh_dwd_taobao_goods_sale_traffic(
      start_date=resolved_start,
      end_date=resolved_end,
    )
    detail_lines, has_effective_update = build_detail_lines(
      raw_output=raw_output,
      start_date=resolved_start,
      end_date=resolved_end,
    )
  except Exception as error:
    status = "失败"
    reason = str(error)
    raise
  finally:
    if status == "失败":
      send_feishu_notification(
        title="DWD 淘宝商品流量成交全量刷新通知",
        table_name="dwd.taobao_goods_sale_traffic",
        action=action,
        status=status,
        reason=reason,
        detail_lines=detail_lines,
      )
    elif has_effective_update:
      send_feishu_notification(
        title="DWD 淘宝商品流量成交全量刷新通知",
        table_name="dwd.taobao_goods_sale_traffic",
        action=action,
        status=status,
        reason=reason,
        detail_lines=detail_lines,
      )
    else:
      get_run_logger().info("No effective data update detected; notification skipped.")


if __name__ == "__main__":
  refresh_taobao_goods_sale_traffic_flow()
