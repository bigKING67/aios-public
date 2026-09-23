from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .sync_config import read_int_env


DEFAULT_LOGIN_EXPIRED_ALERT_REPEAT_SECONDS = 24 * 60 * 60
DEFAULT_FAILURE_ALERT_REPEAT_SECONDS = 24 * 60 * 60
DEFAULT_NOTIFICATION_MODE = "errors"
NOTIFICATION_MODES = {"all", "errors", "off"}
DEFAULT_NOTIFICATION_STATE_PATH = (
  "/tmp/aios-marketing-industry-articles-notification-state.json"
)
LOGIN_EXPIRED_REASON_KEY = "wechat_download_api_login_expired"
FAILURE_INCIDENT_KEY = "failure_incidents"
SOURCE_SYNC_INCIDENT_SCOPE = "source_sync"
CACHE_INCIDENT_SCOPE = "cache"
GENERIC_INCIDENT_SCOPE = "generic"
LOGIN_EXPIRED_REASON_TEXT = "wechat-download-api login expired or unavailable"
CACHE_ONLY_UPSTREAM_UNVERIFIED_DETAIL = "上游登录态：cache-only 未检查"


@dataclass
class LoginExpiredNotificationDecision:
  should_send: bool
  state: Dict[str, Any]
  suppressed_count: int
  last_sent_at: Optional[datetime]


@dataclass
class FailureNotificationDecision:
  should_send: bool
  state: Dict[str, Any]
  scope: str
  suppressed_count: int
  last_sent_at: Optional[datetime]
  is_new_incident: bool


def _resolve_login_expired_alert_repeat_seconds() -> int:
  return read_int_env(
    "WECHAT_ARTICLE_LOGIN_EXPIRED_ALERT_REPEAT_SECONDS",
    DEFAULT_LOGIN_EXPIRED_ALERT_REPEAT_SECONDS,
    0,
    7 * 24 * 60 * 60,
  )


def _resolve_failure_alert_repeat_seconds() -> int:
  return read_int_env(
    "WECHAT_ARTICLE_FAILURE_ALERT_REPEAT_SECONDS",
    DEFAULT_FAILURE_ALERT_REPEAT_SECONDS,
    0,
    7 * 24 * 60 * 60,
  )


def _resolve_notification_state_path() -> Path:
  raw_path = (os.getenv("WECHAT_ARTICLE_NOTIFICATION_STATE_PATH") or "").strip()
  return Path(raw_path or DEFAULT_NOTIFICATION_STATE_PATH)


def _resolve_notification_mode() -> str:
  raw_mode = (
    os.getenv("WECHAT_ARTICLE_NOTIFY_MODE")
    or os.getenv("MARKETING_INDUSTRY_ARTICLES_NOTIFY_MODE")
    or DEFAULT_NOTIFICATION_MODE
  ).strip().lower()
  aliases = {
    "always": "all",
    "true": "all",
    "1": "all",
    "error": "errors",
    "issue": "errors",
    "issues": "errors",
    "anomaly": "errors",
    "anomalies": "errors",
    "false": "off",
    "0": "off",
    "none": "off",
  }
  mode = aliases.get(raw_mode, raw_mode)
  return mode if mode in NOTIFICATION_MODES else DEFAULT_NOTIFICATION_MODE


def _notification_safe_int(value: Any, default: int = 0) -> int:
  try:
    return int(value)
  except (TypeError, ValueError):
    return default


def _to_iso(value: Optional[datetime]) -> Optional[str]:
  if value is None:
    return None
  return value.isoformat()


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
  if not isinstance(value, str) or not value.strip():
    return None
  try:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
  except ValueError:
    return None
  if parsed.tzinfo is None:
    parsed = parsed.replace(tzinfo=timezone.utc)
  return parsed.astimezone(timezone.utc)


def _is_login_expired_reason(reason: str) -> bool:
  return LOGIN_EXPIRED_REASON_TEXT in (reason or "")


def _is_rate_limit_reason(reason: Any) -> bool:
  normalized = str(reason or "").lower()
  return any(
    marker in normalized
    for marker in ("rate limited", "请求过于频繁", "freq control", "ret=200013")
  )


def _failure_incident_identity(reason: str) -> Tuple[str, str]:
  normalized = (reason or "").strip().lower()
  if _is_rate_limit_reason(normalized):
    return SOURCE_SYNC_INCIDENT_SCOPE, "upstream_global_rate_limit"
  if "retry-deferred" in normalized:
    return SOURCE_SYNC_INCIDENT_SCOPE, "all_sources_retry_deferred"
  if "no enabled marketing industry article sources" in normalized:
    return SOURCE_SYNC_INCIDENT_SCOPE, "no_enabled_sources"
  if "all marketing industry article sources failed" in normalized:
    return SOURCE_SYNC_INCIDENT_SCOPE, "all_sources_failed"
  if "rss cache" in normalized or "cache unavailable" in normalized:
    return CACHE_INCIDENT_SCOPE, "rss_cache_failure"
  return GENERIC_INCIDENT_SCOPE, normalized[:500]


def _failure_incident_fingerprint(scope: str, identity: str) -> str:
  return hashlib.sha256(f"{scope}\0{identity}".encode("utf-8")).hexdigest()


def _empty_notification_state() -> Dict[str, Any]:
  return {"version": 1}


def _read_notification_state(path: Path) -> Dict[str, Any]:
  if not path.exists():
    return _empty_notification_state()
  try:
    raw_state = json.loads(path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return _empty_notification_state()
  if not isinstance(raw_state, dict):
    return _empty_notification_state()
  raw_state["version"] = 1
  return raw_state


def _write_notification_state(path: Path, state: Dict[str, Any]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  tmp_path = path.with_name(f"{path.name}.{os.getpid()}.tmp")
  tmp_path.write_text(
    json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
  )
  tmp_path.replace(path)


def _login_expired_state(state: Dict[str, Any]) -> Dict[str, Any]:
  raw_value = state.get(LOGIN_EXPIRED_REASON_KEY)
  return dict(raw_value) if isinstance(raw_value, dict) else {}


def _failure_incidents(state: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
  raw_value = state.get(FAILURE_INCIDENT_KEY)
  if not isinstance(raw_value, dict):
    return {}
  return {
    str(scope): dict(value)
    for scope, value in raw_value.items()
    if isinstance(value, dict)
  }


def _build_failure_incident_state(
  state: Dict[str, Any],
  reason: str,
  now: datetime,
  repeat_seconds: int,
) -> FailureNotificationDecision:
  current = dict(state)
  current["version"] = 1
  scope, identity = _failure_incident_identity(reason)
  fingerprint = _failure_incident_fingerprint(scope, identity)
  incidents = _failure_incidents(current)
  failure_state = dict(incidents.get(scope) or {})
  is_new_incident = failure_state.get("fingerprint") != fingerprint

  if is_new_incident:
    failure_state = {
      "fingerprint": fingerprint,
      "scope": scope,
      "first_seen_at": _to_iso(now),
      "suppressed_count": 0,
    }

  last_sent_at = _parse_iso_datetime(failure_state.get("last_sent_at"))
  suppressed_count = _notification_safe_int(failure_state.get("suppressed_count"), 0)
  should_send = (
    is_new_incident
    or last_sent_at is None
    or repeat_seconds <= 0
    or (now - last_sent_at).total_seconds() >= repeat_seconds
  )
  if not should_send:
    suppressed_count += 1

  failure_state.update(
    {
      "pending_recovery": True,
      "last_seen_at": _to_iso(now),
      "last_reason": (reason or "")[:500],
      "suppressed_count": suppressed_count,
      "last_notification_attempt_at": _to_iso(now),
    }
  )
  incidents[scope] = failure_state
  current[FAILURE_INCIDENT_KEY] = incidents
  return FailureNotificationDecision(
    should_send=should_send,
    state=current,
    scope=scope,
    suppressed_count=suppressed_count,
    last_sent_at=last_sent_at,
    is_new_incident=is_new_incident,
  )


def _mark_failure_notification_sent(
  state: Dict[str, Any],
  scope: str,
  sent_at: datetime,
) -> Dict[str, Any]:
  current = dict(state)
  incidents = _failure_incidents(current)
  failure_state = dict(incidents.get(scope) or {})
  failure_state["last_sent_at"] = _to_iso(sent_at)
  incidents[scope] = failure_state
  current[FAILURE_INCIDENT_KEY] = incidents
  current["version"] = 1
  return current


def _has_pending_failure_recovery(state: Dict[str, Any]) -> bool:
  return any(
    incident.get("pending_recovery")
    for incident in _failure_incidents(state).values()
  )


def _has_verified_source_sync(detail_lines: Sequence[str]) -> bool:
  return any(
    re.search(
      r"来源数：\d+，已处理：\s*[1-9]\d*，失败来源：0(?:\D|$)",
      line,
    )
    for line in detail_lines
  )


def _has_success_notification_issue(detail_lines: Sequence[str]) -> bool:
  for line in detail_lines:
    if re.search(r"失败来源：\s*[1-9]\d*", line):
      return True
    if re.search(r"正文回填：.*失败\s+[1-9]\d*", line):
      return True
    if line.startswith("正文失败样例：") or " 失败：" in line:
      return True
  return False


def _eligible_failure_recovery_scopes(
  state: Dict[str, Any],
  detail_lines: Sequence[str],
) -> List[str]:
  eligible_scopes: List[str] = []
  cache_only = CACHE_ONLY_UPSTREAM_UNVERIFIED_DETAIL in detail_lines
  has_issue = _has_success_notification_issue(detail_lines)
  for scope, failure_state in _failure_incidents(state).items():
    if not failure_state.get("pending_recovery"):
      continue
    if scope == SOURCE_SYNC_INCIDENT_SCOPE:
      if _has_verified_source_sync(detail_lines):
        eligible_scopes.append(scope)
      continue
    if scope == CACHE_INCIDENT_SCOPE:
      if cache_only and not has_issue:
        eligible_scopes.append(scope)
      continue
    if not cache_only and not has_issue:
      eligible_scopes.append(scope)
  return eligible_scopes


def _build_failure_recovery_detail_lines(
  state: Dict[str, Any],
  scopes: Sequence[str],
  detail_lines: Sequence[str],
) -> List[str]:
  recovery_lines = ["营销行业资讯同步故障已恢复"]
  incidents = _failure_incidents(state)
  for scope in scopes:
    failure_state = incidents.get(scope) or {}
    last_reason = str(failure_state.get("last_reason") or "").strip()
    if last_reason:
      recovery_lines.append(f"恢复前失败原因：{last_reason[:220]}")
    suppressed_count = _notification_safe_int(failure_state.get("suppressed_count"), 0)
    if suppressed_count > 0:
      recovery_lines.append(f"恢复前已压制重复通知：{suppressed_count} 次")
  recovery_lines.extend(detail_lines)
  return recovery_lines


def _clear_failure_recovery_state(
  state: Dict[str, Any],
  scopes: Sequence[str],
) -> Dict[str, Any]:
  current = dict(state)
  incidents = _failure_incidents(current)
  for scope in scopes:
    incidents.pop(scope, None)
  if incidents:
    current[FAILURE_INCIDENT_KEY] = incidents
  else:
    current.pop(FAILURE_INCIDENT_KEY, None)
  current["version"] = 1
  return current


def _build_login_expired_failure_state(
  state: Dict[str, Any],
  reason: str,
  now: datetime,
  repeat_seconds: int,
) -> LoginExpiredNotificationDecision:
  current = dict(state)
  current["version"] = 1
  failure_state = _login_expired_state(current)
  last_sent_at = _parse_iso_datetime(failure_state.get("last_sent_at"))
  suppressed_count = _notification_safe_int(failure_state.get("suppressed_count"), 0)

  should_send = (
    last_sent_at is None
    or repeat_seconds <= 0
    or (now - last_sent_at).total_seconds() >= repeat_seconds
  )
  if not should_send:
    suppressed_count += 1

  failure_state.update(
    {
      "pending_recovery": True,
      "last_seen_at": _to_iso(now),
      "last_reason": (reason or "")[:500],
      "suppressed_count": suppressed_count,
      "last_notification_attempt_at": _to_iso(now),
    }
  )
  current[LOGIN_EXPIRED_REASON_KEY] = failure_state
  return LoginExpiredNotificationDecision(
    should_send=should_send,
    state=current,
    suppressed_count=suppressed_count,
    last_sent_at=last_sent_at,
  )


def _mark_login_expired_notification_sent(
  state: Dict[str, Any],
  sent_at: datetime,
) -> Dict[str, Any]:
  current = dict(state)
  failure_state = _login_expired_state(current)
  failure_state["last_sent_at"] = _to_iso(sent_at)
  current[LOGIN_EXPIRED_REASON_KEY] = failure_state
  current["version"] = 1
  return current


def _has_pending_login_expired_recovery(state: Dict[str, Any]) -> bool:
  return bool(_login_expired_state(state).get("pending_recovery"))


def _build_login_expired_recovery_detail_lines(
  state: Dict[str, Any],
  detail_lines: Sequence[str],
) -> List[str]:
  failure_state = _login_expired_state(state)
  recovery_lines = ["wechat-download-api 登录态已恢复，行业资讯同步已成功"]
  last_reason = str(failure_state.get("last_reason") or "").strip()
  if last_reason:
    recovery_lines.append(f"恢复前失败原因：{last_reason[:220]}")
  suppressed_count = _notification_safe_int(failure_state.get("suppressed_count"), 0)
  if suppressed_count > 0:
    recovery_lines.append(f"恢复前已压制重复通知：{suppressed_count} 次")
  recovery_lines.extend(detail_lines)
  return recovery_lines


def _clear_login_expired_recovery_state(state: Dict[str, Any]) -> Dict[str, Any]:
  current = dict(state)
  current.pop(LOGIN_EXPIRED_REASON_KEY, None)
  current["version"] = 1
  return current
