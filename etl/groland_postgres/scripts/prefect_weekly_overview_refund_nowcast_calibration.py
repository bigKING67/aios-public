from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Tuple

from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from prefect_ops_utils import (
  DEFAULT_FEISHU_WEBHOOK_URL,
  extract_notice_lines,
  run_psql,
  send_feishu_notification,
)


CALIBRATION_PATTERN = re.compile(
  r"refresh_all_trade_overview_refund_nowcast_calibration_weekly completed,\s*"
  r"as_of_date\s*([^,]+),\s*inserted_rows\s*(\d+),\s*"
  r"tune_candidates\s*(\d+),\s*alert_rows\s*(\d+),\s*"
  r"eval_window_days\s*(\d+),\s*threshold_wape\s*([0-9.]+)",
  re.IGNORECASE,
)

ACTIVATION_PATTERN = re.compile(
  r"activate_all_trade_overview_refund_nowcast_calibration completed,\s*"
  r"as_of_date\s*([^,]+),\s*eval_window_days\s*(\d+),\s*"
  r"candidates\s*(\d+),\s*updated_rows\s*(\d+),\s*"
  r"retired_rows\s*(\d+),\s*inserted_rows\s*(\d+),\s*"
  r"max_factor_move\s*([0-9.]+)",
  re.IGNORECASE,
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


def _parse_int_param(value: int | str, field_name: str) -> int:
  try:
    parsed = int(value)
  except (TypeError, ValueError) as error:
    raise ValueError(f"{field_name} must be integer, got {value!r}") from error
  return parsed


def _parse_float_param(value: float | str, field_name: str) -> float:
  try:
    parsed = float(value)
  except (TypeError, ValueError) as error:
    raise ValueError(f"{field_name} must be numeric, got {value!r}") from error
  return parsed


def _resolve_as_of_date(as_of_date: str) -> date:
  normalized = (as_of_date or "").strip().lower()
  if not normalized or normalized == "today":
    return date.today()
  return date.fromisoformat(normalized)


def _format_rate(value: Any) -> str:
  if value is None:
    return "-"
  try:
    return f"{float(value):.4f}"
  except (TypeError, ValueError):
    return str(value)


@task(name="refresh-overview-refund-nowcast-weekly-calibration", retries=1, retry_delay_seconds=60)
def refresh_weekly_calibration(
  as_of_date: str,
  eval_window_days: int,
  min_sample_count: int,
  threshold_wape: float,
) -> str:
  logger = get_run_logger()
  resolved_date = _resolve_as_of_date(as_of_date)

  if eval_window_days < 7 or eval_window_days > 180:
    raise ValueError("eval_window_days must be between 7 and 180")
  if min_sample_count < 1:
    raise ValueError("min_sample_count must be >= 1")
  if threshold_wape <= 0 or threshold_wape > 1:
    raise ValueError("threshold_wape must be in (0, 1]")

  output = run_psql(
    (
      "CALL ads.refresh_all_trade_overview_refund_nowcast_calibration_weekly("
      f"DATE '{resolved_date.isoformat()}', "
      f"{eval_window_days}, "
      f"{min_sample_count}, "
      f"{threshold_wape:.6f}"
      ");"
    ),
    timeout=180,
  )
  if output:
    logger.info(output)
  return output


@task(name="activate-overview-refund-nowcast-weekly-calibration", retries=1, retry_delay_seconds=60)
def activate_weekly_calibration(
  as_of_date: str,
  eval_window_days: int,
  min_sample_count: int,
  max_factor_move: float,
) -> str:
  logger = get_run_logger()
  resolved_date = _resolve_as_of_date(as_of_date)

  if eval_window_days < 7 or eval_window_days > 180:
    raise ValueError("eval_window_days must be between 7 and 180")
  if min_sample_count < 1:
    raise ValueError("min_sample_count must be >= 1")
  if max_factor_move <= 0 or max_factor_move > 0.30:
    raise ValueError("max_factor_move must be in (0, 0.30]")

  output = run_psql(
    (
      "CALL ads.activate_all_trade_overview_refund_nowcast_calibration("
      f"DATE '{resolved_date.isoformat()}', "
      f"{eval_window_days}, "
      f"{min_sample_count}, "
      f"{max_factor_move:.6f}"
      ");"
    ),
    timeout=180,
  )
  if output:
    logger.info(output)
  return output


@task(name="load-overview-refund-nowcast-weekly-calibration-summary")
def load_weekly_calibration_summary(
  as_of_date: str,
  eval_window_days: int,
) -> List[Dict[str, Any]]:
  resolved_date = _resolve_as_of_date(as_of_date)
  output = run_psql(
    f"""
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'platform', c.platform,
      'evalAgeDays', c.eval_age_days,
      'sampleCount', c.sample_count,
      'qualityStatus', c.quality_status,
      'recommendationStatus', c.recommendation_status,
      'factor', c.candidate_adjustment_factor,
      'wapeBefore', c.wape_before,
      'wapeAfter', c.wape_after,
      'biasBefore', c.bias_before,
      'biasAfter', c.bias_after,
      'zeroMissCount', c.zero_miss_count,
      'reason', c.recommendation_reason
    )
    ORDER BY
      CASE c.recommendation_status
        WHEN 'review_zero_miss' THEN 0
        WHEN 'tune_candidate' THEN 1
        WHEN 'keep' THEN 2
        ELSE 3
      END,
      c.platform,
      c.eval_age_days
  ),
  '[]'::jsonb
)::TEXT AS payload
FROM ads.all_trade_overview_refund_nowcast_calibration_weekly c
WHERE c.as_of_date = DATE '{resolved_date.isoformat()}'
  AND c.eval_window_days = {eval_window_days};
""",
    tuples_only=True,
    timeout=120,
  )
  payload = json.loads(output or "[]")
  if not isinstance(payload, list):
    raise RuntimeError("weekly calibration query returned non-array payload")
  return payload


@task(name="build-overview-refund-nowcast-weekly-calibration-summary")
def build_weekly_calibration_summary(
  raw_output: str,
  rows: List[Dict[str, Any]],
) -> Tuple[List[str], bool]:
  notice_lines = extract_notice_lines(raw_output)
  detail_lines: List[str] = []
  should_notify = False

  for line in notice_lines:
    matched = CALIBRATION_PATTERN.search(line)
    if matched:
      as_of_date = matched.group(1).strip()
      inserted_rows = int(matched.group(2).strip())
      tune_candidates = int(matched.group(3).strip())
      alert_rows = int(matched.group(4).strip())
      eval_window_days = int(matched.group(5).strip())
      threshold_wape = matched.group(6).strip()
      should_notify = tune_candidates > 0 or alert_rows > 0
      detail_lines.append(
        (
          f"[weekly-calibration] as_of={as_of_date}，window={eval_window_days}d，"
          f"行数={inserted_rows}，建议/复核={tune_candidates}，质量告警={alert_rows}，"
          f"WAPE阈值={threshold_wape}"
        )
      )
      continue

    activation_matched = ACTIVATION_PATTERN.search(line)
    if activation_matched:
      as_of_date = activation_matched.group(1).strip()
      eval_window_days = int(activation_matched.group(2).strip())
      candidates = int(activation_matched.group(3).strip())
      updated_rows = int(activation_matched.group(4).strip())
      retired_rows = int(activation_matched.group(5).strip())
      inserted_rows = int(activation_matched.group(6).strip())
      max_factor_move = activation_matched.group(7).strip()
      should_notify = should_notify or candidates > 0 or updated_rows > 0 or inserted_rows > 0
      detail_lines.append(
        (
          f"[active-calibration] as_of={as_of_date}，window={eval_window_days}d，"
          f"候选={candidates}，更新={updated_rows}，替换={retired_rows}，"
          f"新增生效={inserted_rows}，单周最大变动={max_factor_move}"
        )
      )

  attention_rows = [
    row
    for row in rows
    if row.get("recommendationStatus") in {"tune_candidate", "review_zero_miss"}
  ]
  display_rows = attention_rows or rows[:6]

  for row in display_rows[:10]:
    detail_lines.append(
      (
        f"[{row.get('platform')} age={row.get('evalAgeDays')}d] "
        f"status={row.get('recommendationStatus')}，"
        f"WAPE={_format_rate(row.get('wapeBefore'))}->{_format_rate(row.get('wapeAfter'))}，"
        f"bias={_format_rate(row.get('biasBefore'))}->{_format_rate(row.get('biasAfter'))}，"
        f"factor={_format_rate(row.get('factor'))}，"
        f"zero_miss={row.get('zeroMissCount')}，"
        f"{row.get('reason')}"
      )
    )

  if not detail_lines:
    detail_lines = ["weekly calibration 执行完成，未返回明细"]

  return detail_lines, should_notify


@flow(name="weekly-overview-refund-nowcast-calibration-flow")
def weekly_overview_refund_nowcast_calibration_flow(
  as_of_date: str = "today",
  eval_window_days: int | str = 42,
  min_sample_count: int | str = 10,
  threshold_wape: float | str = 0.15,
  max_factor_move: float | str = 0.08,
  notify_on_pass: bool | str = True,
) -> None:
  status = "成功"
  reason = ""
  action = (
    "weekly refund nowcast calibration "
    f"as_of_date={as_of_date} eval_window_days={eval_window_days}"
  )
  detail_lines: List[str] = []

  try:
    notify_on_pass = _parse_bool_flag(notify_on_pass, "notify_on_pass")
    eval_window_days = _parse_int_param(eval_window_days, "eval_window_days")
    min_sample_count = _parse_int_param(min_sample_count, "min_sample_count")
    threshold_wape = _parse_float_param(threshold_wape, "threshold_wape")
    max_factor_move = _parse_float_param(max_factor_move, "max_factor_move")
    calibration_output = refresh_weekly_calibration(
      as_of_date=as_of_date,
      eval_window_days=eval_window_days,
      min_sample_count=min_sample_count,
      threshold_wape=threshold_wape,
    )
    activation_output = activate_weekly_calibration(
      as_of_date=as_of_date,
      eval_window_days=eval_window_days,
      min_sample_count=min_sample_count,
      max_factor_move=max_factor_move,
    )
    raw_output = "\n".join(
      output for output in (calibration_output, activation_output) if output
    )
    rows = load_weekly_calibration_summary(
      as_of_date=as_of_date,
      eval_window_days=eval_window_days,
    )
    detail_lines, should_notify = build_weekly_calibration_summary(
      raw_output=raw_output,
      rows=rows,
    )
  except Exception as error:
    status = "失败"
    reason = str(error)
    _safe_send_notification(
      title="ADS 退款 nowcast 周度校准通知",
      table_name="ads.all_trade_overview_refund_nowcast_calibration_weekly",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    raise

  if notify_on_pass or should_notify:
    _safe_send_notification(
      title="ADS 退款 nowcast 周度校准通知",
      table_name="ads.all_trade_overview_refund_nowcast_calibration_weekly",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
  else:
    get_run_logger().info("Weekly calibration passed without attention rows; notification skipped.")


if __name__ == "__main__":
  weekly_overview_refund_nowcast_calibration_flow()
