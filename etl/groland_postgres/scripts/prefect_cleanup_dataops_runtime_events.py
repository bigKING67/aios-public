from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, List

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


def _extract_data_line(raw_output: str) -> str:
  for raw_line in raw_output.splitlines():
    line = raw_line.strip()
    if not line:
      continue
    if line.startswith("NOTICE:") or line.startswith("WARNING:"):
      continue
    return line
  return ""


def _parse_cleanup_result(raw_output: str) -> Dict[str, int | str]:
  data_line = _extract_data_line(raw_output)
  if not data_line:
    raise ValueError("cleanup_runtime_events returned empty output")

  values = [value.strip() for value in data_line.split("|")]
  if len(values) < 4:
    raise ValueError(f"unexpected cleanup output: {data_line}")

  cleanup_at = values[0] or "-"
  retain_days = int(values[1])
  audit_deleted = int(values[2])
  notification_deleted = int(values[3])
  batch_execution_deleted = int(values[4]) if len(values) >= 5 and values[4] else 0

  return {
    "cleanup_at": cleanup_at,
    "retain_days": retain_days,
    "audit_deleted": audit_deleted,
    "notification_deleted": notification_deleted,
    "batch_execution_deleted": batch_execution_deleted,
  }


def _parse_bool_flag(value: bool | str, field_name: str) -> bool:
  if isinstance(value, bool):
    return value

  if isinstance(value, str):
    normalized = value.strip().lower()
    if normalized in {"true", "1", "yes", "y"}:
      return True
    if normalized in {"false", "0", "no", "n"}:
      return False

  raise ValueError(
    f"{field_name} must be boolean (true/false), got {value!r}"
  )


def _parse_positive_int(value: int | str, field_name: str) -> int:
  if isinstance(value, int):
    parsed = value
  elif isinstance(value, str):
    normalized = value.strip()
    if not normalized:
      raise ValueError(f"{field_name} cannot be empty")
    parsed = int(normalized)
  else:
    raise ValueError(f"{field_name} must be integer, got {value!r}")

  if parsed <= 0:
    raise ValueError(f"{field_name} must be greater than 0")
  return parsed


@task(name="cleanup-dataops-runtime-events", retries=1, retry_delay_seconds=60)
def run_runtime_cleanup(
  retain_days: int | str,
  cleanup_batch_execution_events: bool | str = True,
) -> Dict[str, int | str]:
  logger = get_run_logger()
  normalized_retain_days = _parse_positive_int(retain_days, "retain_days")
  normalized_cleanup_batch_execution_events = _parse_bool_flag(
    cleanup_batch_execution_events,
    "cleanup_batch_execution_events",
  )

  cleanup_batch_execution_events_sql = (
    "true" if normalized_cleanup_batch_execution_events else "false"
  )
  output = run_psql(
    sql_statement=(
      "SELECT "
      "to_char(cleanup_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS cleanup_at, "
      "retain_days, "
      "audit_deleted, "
      "notification_deleted, "
      "batch_execution_deleted "
      f"FROM dataops.cleanup_runtime_events({normalized_retain_days}, {cleanup_batch_execution_events_sql});"
    ),
    tuples_only=True,
  )

  if output:
    logger.info(output)

  return _parse_cleanup_result(output)


@task(name="build-dataops-runtime-cleanup-summary")
def build_cleanup_summary(result: Dict[str, int | str]) -> List[str]:
  audit_deleted = int(result["audit_deleted"])
  notification_deleted = int(result["notification_deleted"])
  batch_execution_deleted = int(result.get("batch_execution_deleted", 0))
  total_deleted = audit_deleted + notification_deleted + batch_execution_deleted
  retain_days = int(result["retain_days"])
  cleanup_at = str(result["cleanup_at"])

  return [
    f"清理时间={cleanup_at}",
    f"保留天数={retain_days} 天",
    f"审计事件删除={audit_deleted} 行",
    f"通知事件删除={notification_deleted} 行",
    f"批量历史删除={batch_execution_deleted} 行",
    f"总删除={total_deleted} 行",
  ]


@flow(name="cleanup-dataops-runtime-events-flow")
def cleanup_dataops_runtime_events_flow(
  retain_days: int | str = 90,
  cleanup_batch_execution_events: bool | str = True,
  notify_on_deleted_only: bool | str = True,
) -> None:
  normalized_retain_days = _parse_positive_int(retain_days, "retain_days")
  normalized_cleanup_batch_execution_events = _parse_bool_flag(
    cleanup_batch_execution_events,
    "cleanup_batch_execution_events",
  )
  normalized_notify_on_deleted_only = _parse_bool_flag(
    notify_on_deleted_only,
    "notify_on_deleted_only",
  )

  action = (
    "runtime retention cleanup "
    f"retain_days={normalized_retain_days} "
    f"cleanup_batch_execution_events={str(normalized_cleanup_batch_execution_events).lower()}"
  )
  status = "成功"
  reason = ""
  detail_lines: List[str] = []
  total_deleted = 0

  try:
    result = run_runtime_cleanup(
      retain_days=normalized_retain_days,
      cleanup_batch_execution_events=normalized_cleanup_batch_execution_events,
    )
    detail_lines = build_cleanup_summary(result=result)
    total_deleted = (
      int(result["audit_deleted"])
      + int(result["notification_deleted"])
      + int(result.get("batch_execution_deleted", 0))
    )
  except Exception as error:
    status = "失败"
    reason = str(error)
    _safe_send_notification(
      title="DataOps 运行态事件清理通知",
      table_name=(
        "dataops.runtime_audit_events / "
        "dataops.runtime_notification_events / "
        "dataops.runtime_batch_execution_events"
      ),
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    raise

  if normalized_notify_on_deleted_only and total_deleted <= 0:
    get_run_logger().info("No expired runtime events deleted; notification skipped.")
    return

  _safe_send_notification(
    title="DataOps 运行态事件清理通知",
    table_name=(
      "dataops.runtime_audit_events / "
      "dataops.runtime_notification_events / "
      "dataops.runtime_batch_execution_events"
    ),
    action=action,
    status=status,
    reason=reason,
    detail_lines=detail_lines,
    webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
  )


if __name__ == "__main__":
  cleanup_dataops_runtime_events_flow()
