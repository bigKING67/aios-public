from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from dataops_api_client import (  # noqa: E402
  http_post_json,
  normalize_access_token as _normalize_access_token,
  resolve_auth_api_base as _resolve_auth_api_base,
  resolve_dataops_api_base as _resolve_api_base,
  resolve_http_timeout_seconds as _resolve_http_timeout_seconds,
)
from prefect_ops_utils import (
  DEFAULT_FEISHU_WEBHOOK_URL,
  send_feishu_notification,
)


def _resolve_scan_notification_webhook() -> str:
  return (
    (os.getenv("DATAOPS_NOTIFY_TRACE_SLO_SCAN_WEBHOOK_URL") or "").strip()
    or DEFAULT_FEISHU_WEBHOOK_URL
  )


def _safe_send_notification(**kwargs) -> None:
  try:
    sent = send_feishu_notification(
      **kwargs,
      webhook_url=_resolve_scan_notification_webhook(),
      raise_on_error=False,
    )
    if not sent:
      get_run_logger().warning("Feishu notification skipped or failed (no webhook or send error).")
  except Exception as notify_err:
    get_run_logger().warning(f"Feishu notification failed: {notify_err}")


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


def _parse_int_range(
  value: int | str,
  field_name: str,
  min_value: int,
  max_value: int,
) -> int:
  if isinstance(value, bool):
    raise ValueError(f"{field_name} must be integer, got boolean {value!r}")

  if isinstance(value, int):
    parsed = value
  elif isinstance(value, str):
    normalized = value.strip()
    if not normalized:
      raise ValueError(f"{field_name} cannot be empty")
    parsed = int(normalized)
  else:
    raise ValueError(f"{field_name} must be integer, got {value!r}")

  if parsed < min_value or parsed > max_value:
    raise ValueError(
      f"{field_name} out of range: {parsed} (allowed {min_value}-{max_value})"
    )
  return parsed


def _safe_int(value: Any, default: int = 0) -> int:
  if value is None:
    return default
  if isinstance(value, bool):
    return int(value)
  if isinstance(value, int):
    return value
  if isinstance(value, float):
    return int(value)

  text = str(value).strip()
  if not text:
    return default
  try:
    return int(text)
  except (TypeError, ValueError):
    return default


def _safe_text(value: Any, default: str = "-") -> str:
  if value is None:
    return default
  text = str(value).strip()
  return text or default


def _truncate_text(value: str, limit: int) -> str:
  if len(value) <= limit:
    return value
  if limit <= 1:
    return value[:limit]
  return f"{value[: limit - 1]}…"


def _validate_scan_response(scan_result: Dict[str, Any]) -> None:
  required_fields = (
    "executedAt",
    "dryRun",
    "lookbackHours",
    "maxGroups",
    "scanConcurrency",
    "durationMs",
    "processedGroups",
    "breachedGroups",
    "triggeredGroups",
    "groupSource",
    "items",
    "warnings",
  )
  missing_fields = [field for field in required_fields if field not in scan_result]
  if missing_fields:
    raise RuntimeError(
      f"Scan response missing required fields: {', '.join(missing_fields)}"
    )

  if not isinstance(scan_result.get("items"), list):
    raise RuntimeError("Scan response field 'items' must be array")
  if not isinstance(scan_result.get("warnings"), list):
    raise RuntimeError("Scan response field 'warnings' must be array")


def _http_post_json(
  url: str,
  payload: Dict[str, Any],
  headers: Dict[str, str] | None = None,
  timeout_seconds: int = 20,
) -> Tuple[int, Dict[str, Any], str]:
  return http_post_json(
    url,
    payload,
    headers=headers,
    timeout_seconds=timeout_seconds,
    user_agent="AIOS-Prefect-Scan/1.0",
  )


@task(name="resolve-dataops-scan-token", retries=1, retry_delay_seconds=20)
def resolve_dataops_scan_token() -> str:
  direct_token = _normalize_access_token(
    (os.getenv("DATAOPS_SCAN_TOKEN") or "").strip()
    or (os.getenv("DATAOPS_TEST_TOKEN") or "").strip()
  )
  if direct_token:
    return direct_token

  username = (
    (os.getenv("DATAOPS_SCAN_USERNAME") or "").strip()
    or (os.getenv("DATAOPS_TEST_USERNAME") or "").strip()
  )
  password = (
    (os.getenv("DATAOPS_SCAN_PASSWORD") or "").strip()
    or (os.getenv("DATAOPS_TEST_PASSWORD") or "").strip()
  )
  if not username or not password:
    raise RuntimeError(
      "Missing scan credentials. Provide DATAOPS_SCAN_TOKEN or DATAOPS_SCAN_USERNAME + DATAOPS_SCAN_PASSWORD."
    )

  timeout_seconds = _resolve_http_timeout_seconds()
  status_code, body, raw_text = _http_post_json(
    f"{_resolve_auth_api_base()}/auth/login",
    {
      "username": username,
      "password": password,
    },
    timeout_seconds=timeout_seconds,
  )
  if status_code != 200:
    raise RuntimeError(f"Login failed with status={status_code}, body={raw_text[:500]}")

  access_token = _normalize_access_token(str(body.get("access_token") or ""))
  if not access_token:
    raise RuntimeError("Login response missing access_token")
  return access_token


@task(name="run-dataops-notification-trace-slo-scan", retries=1, retry_delay_seconds=30)
def run_notification_trace_slo_scan(
  access_token: str,
  dry_run: bool,
  lookback_hours: int,
  max_groups: int,
  scan_concurrency: int,
) -> Dict[str, Any]:
  normalized_access_token = _normalize_access_token(access_token)
  if not normalized_access_token:
    raise RuntimeError("Missing access token for scan request")

  timeout_seconds = _resolve_http_timeout_seconds()
  status_code, body, raw_text = _http_post_json(
    f"{_resolve_api_base()}/runtime/notification-trace/scan",
    {
      "dryRun": dry_run,
      "lookbackHours": lookback_hours,
      "maxGroups": max_groups,
      "scanConcurrency": scan_concurrency,
    },
    headers={
      "Authorization": f"Bearer {normalized_access_token}",
    },
    timeout_seconds=timeout_seconds,
  )
  if status_code != 200:
    raise RuntimeError(f"Scan request failed with status={status_code}, body={raw_text[:500]}")
  return body


def _build_scan_summary_lines(scan_result: Dict[str, Any]) -> List[str]:
  executed_at = _safe_text(scan_result.get("executedAt"))
  dry_run = bool(scan_result.get("dryRun"))
  lookback_hours = _safe_int(scan_result.get("lookbackHours"))
  max_groups = _safe_int(scan_result.get("maxGroups"))
  scan_concurrency = _safe_int(scan_result.get("scanConcurrency"))
  duration_ms = _safe_int(scan_result.get("durationMs"))
  processed_groups = _safe_int(scan_result.get("processedGroups"))
  breached_groups = _safe_int(scan_result.get("breachedGroups"))
  triggered_groups = _safe_int(scan_result.get("triggeredGroups"))
  group_source = _safe_text(scan_result.get("groupSource"))
  warnings = scan_result.get("warnings") or []
  warning_count = len(warnings) if isinstance(warnings, list) else 0
  items = scan_result.get("items") or []
  if not isinstance(items, list):
    items = []

  risk_counter = {
    "critical": 0,
    "warning": 0,
    "watch": 0,
    "normal": 0,
  }
  for item in items:
    if not isinstance(item, dict):
      continue
    risk_level = _safe_text(item.get("riskLevel"), "")
    if risk_level in risk_counter:
      risk_counter[risk_level] += 1

  detail_lines = [
    f"执行时间={executed_at}",
    f"模式={'dry-run' if dry_run else 'execute'}",
    f"回看窗口={lookback_hours} 小时",
    f"最大分组={max_groups}",
    f"扫描并发={scan_concurrency}",
    f"处理分组={processed_groups}",
    f"SLO命中分组={breached_groups}",
    f"触发分组={triggered_groups}",
    f"扫描耗时={duration_ms} ms",
    f"分组来源={group_source}",
    f"告警条数={warning_count}",
    (
      "风险分布="
      f"critical:{risk_counter['critical']},"
      f"warning:{risk_counter['warning']},"
      f"watch:{risk_counter['watch']},"
      f"normal:{risk_counter['normal']}"
    ),
  ]
  if warning_count > 0:
    for index, warning in enumerate(warnings[:5]):
      detail_lines.append(f"warning[{index + 1}]={str(warning)[:220]}")

  for index, raw_item in enumerate(items[:3]):
    if not isinstance(raw_item, dict):
      continue
    retry_group_id = _truncate_text(_safe_text(raw_item.get("retryGroupId"), "-"), 72)
    risk_level = _safe_text(raw_item.get("riskLevel"), "-")
    risk_score = _safe_int(raw_item.get("riskScore"))
    event_count = _safe_int(raw_item.get("eventCount"))
    triggered_count = _safe_int(raw_item.get("triggeredCount"))
    detail_lines.append(
      f"top[{index + 1}]={retry_group_id} risk={risk_level}/{risk_score} events={event_count} triggered={triggered_count}"
    )

  return detail_lines


@flow(name="dataops-notification-trace-slo-scan-flow")
def dataops_notification_trace_slo_scan_flow(
  dry_run: bool | str = True,
  lookback_hours: int | str = 24,
  max_groups: int | str = 30,
  scan_concurrency: int | str = 4,
  notify_on_issue_only: bool | str = True,
) -> None:
  logger = get_run_logger()
  normalized_dry_run = _parse_bool_flag(dry_run, "dry_run")
  normalized_lookback_hours = _parse_int_range(lookback_hours, "lookback_hours", 1, 720)
  normalized_max_groups = _parse_int_range(max_groups, "max_groups", 1, 200)
  normalized_scan_concurrency = _parse_int_range(
    scan_concurrency,
    "scan_concurrency",
    1,
    12,
  )
  normalized_notify_on_issue_only = _parse_bool_flag(
    notify_on_issue_only,
    "notify_on_issue_only",
  )

  action = (
    "notification trace slo scan "
    f"dry_run={str(normalized_dry_run).lower()} "
    f"lookback_hours={normalized_lookback_hours} "
    f"max_groups={normalized_max_groups} "
    f"scan_concurrency={normalized_scan_concurrency}"
  )
  status = "成功"
  reason = ""
  detail_lines: List[str] = []

  try:
    access_token = resolve_dataops_scan_token()
    scan_result = run_notification_trace_slo_scan(
      access_token=access_token,
      dry_run=normalized_dry_run,
      lookback_hours=normalized_lookback_hours,
      max_groups=normalized_max_groups,
      scan_concurrency=normalized_scan_concurrency,
    )
    _validate_scan_response(scan_result)
    detail_lines = _build_scan_summary_lines(scan_result)
    for line in detail_lines:
      logger.info(line)

    breached_groups = _safe_int(scan_result.get("breachedGroups"))
    triggered_groups = _safe_int(scan_result.get("triggeredGroups"))
    warnings = scan_result.get("warnings")
    warning_count = len(warnings) if isinstance(warnings, list) else 0
    has_issue = breached_groups > 0 or triggered_groups > 0 or warning_count > 0
    if normalized_notify_on_issue_only and not has_issue:
      logger.info("No issue detected, notification skipped.")
      return
  except Exception as error:
    status = "失败"
    reason = str(error)
    if not detail_lines:
      detail_lines = [
        f"错误信息={_truncate_text(reason, 500)}",
        f"模式={'dry-run' if normalized_dry_run else 'execute'}",
        f"回看窗口={normalized_lookback_hours} 小时",
        f"最大分组={normalized_max_groups}",
        f"扫描并发={normalized_scan_concurrency}",
      ]
    _safe_send_notification(
      title="DataOps 通知链路SLO巡检",
      table_name="dataops.runtime_notification_events",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
    )
    raise

  _safe_send_notification(
    title="DataOps 通知链路SLO巡检",
    table_name="dataops.runtime_notification_events",
    action=action,
    status=status,
    reason=reason,
    detail_lines=detail_lines,
  )


if __name__ == "__main__":
  dataops_notification_trace_slo_scan_flow()
