#!/usr/bin/env bash
set -euo pipefail

log_path="${HOME}/.codex/logs/frontend_preflight_events.jsonl"
days="7"
top="5"
json_mode="0"
fail_on_deny_rate=""
fail_on_codes_serialized=""
fail_on_tier_deny_rate_serialized=""
fail_on_deny_trend_days=""
fail_on_tier_deny_trend_serialized=""
contexts_serialized=""
trend_min_events="3"
trend_min_step_pct="0"
include_rotated="0"
include_gzip_rotated="0"
max_rotated_files="64"
require_min_events="0"
no_data_action="fail"
state_path=""
incremental_mode="0"
max_parse_error_rate_pct=""
parse_error_action="skip"
state_max_events="50000"

usage() {
  cat <<'USAGE'
Usage:
  bash ~/.codex/tools/frontend_preflight_log_summary.sh \
    [--log-path <absolute-path>] \
    [--days <n>] \
    [--top <n>] \
    [--json] \
    [--fail-on-deny-rate <percent>] \
    [--fail-on-code <CODE[:count]>]... \
    [--fail-on-tier-deny-rate <TIER:percent>]... \
    [--fail-on-deny-trend <days>] \
    [--fail-on-tier-deny-trend <TIER:days>]... \
    [--context <name>[,<name>...]]... \
    [--trend-min-events <count>] \
    [--trend-min-step-pct <percent>] \
    [--include-rotated] \
    [--include-gzip-rotated] \
    [--max-rotated-files <n>] \
    [--require-min-events <count>] \
    [--no-data-action <fail|warn|skip>] \
    [--state-path <absolute-path>] \
    [--incremental] \
    [--max-parse-error-rate-pct <percent>] \
    [--parse-error-action <fail|warn|skip>] \
    [--state-max-events <count>]

Behavior:
  - Summarizes frontend preflight events in the last N days (UTC).
  - Reports total events, allow/deny split, status split, tier split, top preflight codes.
  - --json returns machine-readable output including daily breakdown.
  - --fail-on-deny-rate fails when overall deny_rate >= threshold.
  - --fail-on-code fails when CODE appears >= count (default count=1).
  - --fail-on-tier-deny-rate fails when tier deny_rate >= threshold.
  - --fail-on-deny-trend fails when overall deny_rate rises for N consecutive UTC days.
  - --fail-on-tier-deny-trend fails when the target tier deny_rate rises for N consecutive UTC days.
  - --context keeps only matching event contexts (for example: prod,ci,test).
  - Trend checks only evaluate days with events >= --trend-min-events and require each daily increase
    to be >= --trend-min-step-pct.
  - --include-rotated includes rotated files matching <log>.20*Z*.
  - --include-gzip-rotated also includes rotated gzip files (<log>.20*Z*.gz).
  - --max-rotated-files limits how many newest rotated files are read.
  - --require-min-events enforces a minimum sample size before policy is considered valid.
  - --no-data-action controls behavior when events_in_window < require-min-events.
  - --incremental enables state-based incremental parsing.
  - --state-path customizes incremental state path (default: <log>.summary_state.json).
  - --max-parse-error-rate-pct fails/warns/skips when parse_error_rate exceeds threshold.
  - --parse-error-action controls parse quality threshold behavior (default: skip).
  - --state-max-events controls incremental state retention cap (default: 50000).
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --log-path)
      log_path="${2-}"
      shift 2
      ;;
    --days)
      days="${2-}"
      shift 2
      ;;
    --top)
      top="${2-}"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    --fail-on-deny-rate)
      fail_on_deny_rate="${2-}"
      shift 2
      ;;
    --fail-on-code)
      if [[ -n "${fail_on_codes_serialized}" ]]; then
        fail_on_codes_serialized+=$'\x1f'
      fi
      fail_on_codes_serialized+="${2-}"
      shift 2
      ;;
    --fail-on-tier-deny-rate)
      if [[ -n "${fail_on_tier_deny_rate_serialized}" ]]; then
        fail_on_tier_deny_rate_serialized+=$'\x1f'
      fi
      fail_on_tier_deny_rate_serialized+="${2-}"
      shift 2
      ;;
    --fail-on-deny-trend)
      fail_on_deny_trend_days="${2-}"
      shift 2
      ;;
    --fail-on-tier-deny-trend)
      if [[ -n "${fail_on_tier_deny_trend_serialized}" ]]; then
        fail_on_tier_deny_trend_serialized+=$'\x1f'
      fi
      fail_on_tier_deny_trend_serialized+="${2-}"
      shift 2
      ;;
    --context)
      if [[ -n "${contexts_serialized}" ]]; then
        contexts_serialized+=$'\x1f'
      fi
      contexts_serialized+="${2-}"
      shift 2
      ;;
    --trend-min-events)
      trend_min_events="${2-}"
      shift 2
      ;;
    --trend-min-step-pct)
      trend_min_step_pct="${2-}"
      shift 2
      ;;
    --include-rotated)
      include_rotated="1"
      shift
      ;;
    --include-gzip-rotated)
      include_gzip_rotated="1"
      shift
      ;;
    --max-rotated-files)
      max_rotated_files="${2-}"
      shift 2
      ;;
    --require-min-events)
      require_min_events="${2-}"
      shift 2
      ;;
    --no-data-action)
      no_data_action="${2-}"
      shift 2
      ;;
    --state-path)
      state_path="${2-}"
      shift 2
      ;;
    --incremental)
      incremental_mode="1"
      shift
      ;;
    --max-parse-error-rate-pct)
      max_parse_error_rate_pct="${2-}"
      shift 2
      ;;
    --parse-error-action)
      parse_error_action="${2-}"
      shift 2
      ;;
    --state-max-events)
      state_max_events="${2-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${log_path}" != /* ]]; then
  echo "--log-path must be absolute: ${log_path}" >&2
  exit 2
fi

if ! [[ "${days}" =~ ^[0-9]+$ ]] || [[ "${days}" -lt 1 ]]; then
  echo "--days must be an integer >= 1: ${days}" >&2
  exit 2
fi

if ! [[ "${top}" =~ ^[0-9]+$ ]] || [[ "${top}" -lt 1 ]]; then
  echo "--top must be an integer >= 1: ${top}" >&2
  exit 2
fi

if [[ -n "${fail_on_deny_rate}" ]]; then
  if ! [[ "${fail_on_deny_rate}" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    echo "--fail-on-deny-rate must be a non-negative number: ${fail_on_deny_rate}" >&2
    exit 2
  fi
fi

if [[ -n "${fail_on_deny_trend_days}" ]]; then
  if ! [[ "${fail_on_deny_trend_days}" =~ ^[0-9]+$ ]] || [[ "${fail_on_deny_trend_days}" -lt 2 ]]; then
    echo "--fail-on-deny-trend must be an integer >= 2: ${fail_on_deny_trend_days}" >&2
    exit 2
  fi
fi

if ! [[ "${trend_min_events}" =~ ^[0-9]+$ ]] || [[ "${trend_min_events}" -lt 1 ]]; then
  echo "--trend-min-events must be an integer >= 1: ${trend_min_events}" >&2
  exit 2
fi

if ! [[ "${trend_min_step_pct}" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "--trend-min-step-pct must be a non-negative number: ${trend_min_step_pct}" >&2
  exit 2
fi

if ! [[ "${max_rotated_files}" =~ ^[0-9]+$ ]] || [[ "${max_rotated_files}" -lt 1 ]]; then
  echo "--max-rotated-files must be an integer >= 1: ${max_rotated_files}" >&2
  exit 2
fi

if ! [[ "${require_min_events}" =~ ^[0-9]+$ ]]; then
  echo "--require-min-events must be an integer >= 0: ${require_min_events}" >&2
  exit 2
fi

if [[ "${no_data_action}" != "fail" && "${no_data_action}" != "warn" && "${no_data_action}" != "skip" ]]; then
  echo "--no-data-action must be one of: fail|warn|skip (actual: ${no_data_action})" >&2
  exit 2
fi

if [[ "${include_gzip_rotated}" == "1" ]]; then
  include_rotated="1"
fi

if [[ -n "${state_path}" && "${state_path}" != /* ]]; then
  echo "--state-path must be absolute: ${state_path}" >&2
  exit 2
fi

if [[ "${incremental_mode}" != "0" && "${incremental_mode}" != "1" ]]; then
  echo "--incremental must be a flag (no value)." >&2
  exit 2
fi

if [[ "${incremental_mode}" == "1" && -z "${state_path}" ]]; then
  state_path="${log_path}.summary_state.json"
fi

if [[ -n "${max_parse_error_rate_pct}" ]]; then
  if ! [[ "${max_parse_error_rate_pct}" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    echo "--max-parse-error-rate-pct must be a non-negative number: ${max_parse_error_rate_pct}" >&2
    exit 2
  fi
fi

if [[ "${parse_error_action}" != "fail" && "${parse_error_action}" != "warn" && "${parse_error_action}" != "skip" ]]; then
  echo "--parse-error-action must be one of: fail|warn|skip (actual: ${parse_error_action})" >&2
  exit 2
fi

if ! [[ "${state_max_events}" =~ ^[0-9]+$ ]] || [[ "${state_max_events}" -lt 1 ]]; then
  echo "--state-max-events must be an integer >= 1: ${state_max_events}" >&2
  exit 2
fi

python3 - \
  "${log_path}" \
  "${days}" \
  "${top}" \
  "${json_mode}" \
  "${fail_on_deny_rate}" \
  "${fail_on_codes_serialized}" \
  "${fail_on_tier_deny_rate_serialized}" \
  "${fail_on_deny_trend_days}" \
  "${fail_on_tier_deny_trend_serialized}" \
  "${contexts_serialized}" \
  "${trend_min_events}" \
  "${trend_min_step_pct}" \
  "${include_rotated}" \
  "${include_gzip_rotated}" \
  "${max_rotated_files}" \
  "${require_min_events}" \
  "${no_data_action}" \
  "${state_path}" \
  "${incremental_mode}" \
  "${max_parse_error_rate_pct}" \
  "${parse_error_action}" \
  "${state_max_events}" <<'PY'
from __future__ import annotations

import gzip
import json
import os
import fcntl
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional

log_path = Path(sys.argv[1])
days = int(sys.argv[2])
top_n = int(sys.argv[3])
json_mode = sys.argv[4] == "1"
fail_on_deny_rate_raw = sys.argv[5].strip()
fail_on_codes_raw = [item.strip() for item in sys.argv[6].split("\x1f") if item.strip()]
fail_on_tier_deny_rate_raw = [item.strip() for item in sys.argv[7].split("\x1f") if item.strip()]
fail_on_deny_trend_days_raw = sys.argv[8].strip()
fail_on_tier_deny_trend_raw = [item.strip() for item in sys.argv[9].split("\x1f") if item.strip()]
contexts_raw = [item.strip() for item in sys.argv[10].split("\x1f") if item.strip()]
trend_min_events = int(sys.argv[11])
trend_min_step_pct = float(sys.argv[12])
include_rotated = sys.argv[13] == "1"
include_gzip_rotated = sys.argv[14] == "1"
max_rotated_files = int(sys.argv[15])
require_min_events = int(sys.argv[16])
no_data_action = sys.argv[17].strip() or "fail"
state_path_raw = sys.argv[18].strip()
incremental_requested = sys.argv[19] == "1"
max_parse_error_rate_raw = sys.argv[20].strip()
parse_error_action = sys.argv[21].strip().lower() or "skip"
state_max_events = int(sys.argv[22])

if no_data_action not in {"fail", "warn", "skip"}:
    raise SystemExit(f"Invalid --no-data-action: {no_data_action}")

if parse_error_action not in {"fail", "warn", "skip"}:
    raise SystemExit(f"Invalid --parse-error-action: {parse_error_action}")

state_path = Path(state_path_raw) if state_path_raw else None

contexts_filter: set[str] = set()
for raw in contexts_raw:
    for item in raw.split(","):
        value = item.strip()
        if value:
            contexts_filter.add(value)

now = datetime.now(timezone.utc)
cutoff = now - timedelta(days=days)
cutoff_ts = cutoff.timestamp()

signature = {
    "version": 1,
    "log_path": str(log_path),
    "days": days,
    "include_rotated": include_rotated,
    "include_gzip_rotated": include_gzip_rotated,
    "max_rotated_files": max_rotated_files,
    "contexts": sorted(contexts_filter),
}


def parse_ts_utc(value: str) -> datetime:
    raw = value.strip()
    if not raw:
        raise ValueError("empty ts_utc")
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    ts = datetime.fromisoformat(raw)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def top_codes_from_counter(counter: Counter[str], total: int, top_n: int) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for code, count in counter.most_common(top_n):
        rows.append(
            {
                "code": code,
                "count": count,
                "rate_pct": round((count / total * 100), 4) if total else 0.0,
            }
        )
    return rows


def build_tier_summary(counter_map: Dict[str, Counter[str]]) -> Dict[str, Dict[str, Any]]:
    result: Dict[str, Dict[str, Any]] = {}
    for tier in sorted(counter_map):
        gate = counter_map[tier]
        allow = int(gate.get("allow", 0))
        deny = int(gate.get("deny", 0))
        events = int(sum(gate.values()))
        deny_rate = (deny / events * 100) if events else 0.0
        result[tier] = {
            "events": events,
            "allow": allow,
            "deny": deny,
            "deny_rate_pct": round(deny_rate, 4),
        }
    return result


def safe_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except FileNotFoundError:
        return -1.0


def resolve_input_paths() -> List[Path]:
    paths: List[Path] = []
    if log_path.exists():
        paths.append(log_path)

    if include_rotated:
        rotated = sorted(
            log_path.parent.glob(log_path.name + ".20*Z*"),
            key=safe_mtime,
            reverse=True,
        )
        if not include_gzip_rotated:
            rotated = [p for p in rotated if not p.name.endswith(".gz")]
        paths.extend(rotated[:max_rotated_files])
    return paths


def open_event_stream(path: Path):
    if path.name.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return path.open("r", encoding="utf-8", errors="replace")


def serialize_event(
    *,
    ts: datetime,
    gate: str,
    status: str,
    tier: str,
    code: str,
    context: str,
    agent_route: str,
    agent_type: str,
    reasoning_target: str,
    route_reason: str,
) -> Dict[str, Any]:
    return {
        "ts_epoch": float(ts.timestamp()),
        "ts_utc": ts.isoformat(timespec="seconds"),
        "gate": gate,
        "status": status,
        "tier": tier,
        "code": code,
        "context": context,
        "agent_route": agent_route,
        "agent_type": agent_type,
        "reasoning_target": reasoning_target,
        "route_reason": route_reason,
    }


def normalize_state_event(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    try:
        ts_epoch = float(raw.get("ts_epoch"))
    except Exception:  # noqa: BLE001
        return None
    gate = str(raw.get("gate", "")).strip() or "unknown"
    status = str(raw.get("status", "")).strip() or "unknown"
    tier = str(raw.get("tier", "")).strip() or "unknown"
    code = str(raw.get("code", "")).strip() or "unknown"
    context = str(raw.get("context", "")).strip() or "unknown"
    agent_route = str(raw.get("agent_route", "")).strip() or "unknown"
    agent_type = str(raw.get("agent_type", "")).strip() or "unknown"
    reasoning_target = str(raw.get("reasoning_target", "")).strip() or "unknown"
    route_reason = str(raw.get("route_reason", "")).strip() or "unknown"
    return {
        "ts_epoch": ts_epoch,
        "ts_utc": str(raw.get("ts_utc", "")).strip(),
        "gate": gate,
        "status": status,
        "tier": tier,
        "code": code,
        "context": context,
        "agent_route": agent_route,
        "agent_type": agent_type,
        "reasoning_target": reasoning_target,
        "route_reason": route_reason,
    }


# Aggregates for current parse run (not state historical totals).
total_lines = 0
parsed_files: List[str] = []
skipped_files: List[str] = []
missing_files: List[str] = []
read_errors: List[Dict[str, str]] = []
invalid_json_lines = 0
invalid_ts_lines = 0
filtered_out_of_window = 0
filtered_by_context = 0

incremental_info: Dict[str, Any] = {
    "enabled": incremental_requested,
    "state_path": str(state_path) if state_path is not None else None,
    "lock_path": str(Path(str(state_path) + ".lock")) if state_path is not None else None,
    "lock_acquired": False,
    "mode": "full_scan",
    "state_loaded": False,
    "fallback_reason": None,
    "state_write_error": None,
    "state_max_events": state_max_events,
    "state_pruned_count": 0,
    "events_from_state": 0,
    "events_newly_parsed": 0,
}

loaded_state_events: List[Dict[str, Any]] = []
offset_state: Dict[str, Dict[str, Any]] = {}
state_source_paths: List[str] = []

incremental_state_enabled = incremental_requested and state_path is not None
state_lock_fp: Optional[Any] = None

if incremental_state_enabled and state_path is not None:
    lock_path = Path(str(state_path) + ".lock")
    try:
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        state_lock_fp = lock_path.open("a+", encoding="utf-8")
        fcntl.flock(state_lock_fp.fileno(), fcntl.LOCK_EX)
        incremental_info["lock_acquired"] = True
    except Exception as exc:  # noqa: BLE001
        incremental_info["fallback_reason"] = f"state_lock_error:{exc}"
        incremental_state_enabled = False

if incremental_state_enabled and state_path is not None:
    if state_path.exists():
        try:
            payload = json.loads(state_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("state root must be object")
            if int(payload.get("version", 0)) != 1:
                raise ValueError("unsupported state version")
            if payload.get("signature") != signature:
                incremental_info["fallback_reason"] = "signature_mismatch"
            else:
                raw_events = payload.get("events", [])
                if not isinstance(raw_events, list):
                    raise ValueError("state.events must be array")
                normalized: List[Dict[str, Any]] = []
                for item in raw_events:
                    parsed = normalize_state_event(item)
                    if parsed is not None:
                        normalized.append(parsed)
                loaded_state_events = normalized

                raw_offsets = payload.get("offsets", {})
                if raw_offsets is None:
                    raw_offsets = {}
                if not isinstance(raw_offsets, dict):
                    raise ValueError("state.offsets must be object")
                for key, value in raw_offsets.items():
                    if isinstance(key, str) and isinstance(value, dict):
                        offset_state[key] = value

                raw_sources = payload.get("source_paths", [])
                if isinstance(raw_sources, list):
                    state_source_paths = [str(item) for item in raw_sources if str(item).strip()]

                incremental_info["state_loaded"] = True
        except Exception as exc:  # noqa: BLE001
            incremental_info["fallback_reason"] = f"state_read_error:{exc}"
            incremental_state_enabled = False
    else:
        incremental_info["fallback_reason"] = "state_missing"
        incremental_state_enabled = False

input_paths = resolve_input_paths()
input_path_strings = [str(path) for path in input_paths]

if incremental_state_enabled:
    if not incremental_info["state_loaded"]:
        incremental_info["mode"] = "full_scan"
    elif sorted(input_path_strings) != sorted(state_source_paths):
        incremental_info["mode"] = "full_scan"
        incremental_info["fallback_reason"] = "source_set_changed"
    else:
        incremental_info["mode"] = "incremental"
else:
    incremental_info["mode"] = "full_scan"

if incremental_info["mode"] != "incremental":
    loaded_state_events = []
    offset_state = {}


def parse_sources(
    *,
    source_paths: List[Path],
    mode: str,
    offsets: Dict[str, Dict[str, Any]],
) -> tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    global total_lines
    global invalid_json_lines
    global invalid_ts_lines
    global filtered_out_of_window
    global filtered_by_context

    new_events: List[Dict[str, Any]] = []
    updated_offsets: Dict[str, Dict[str, Any]] = {}

    for source_path in source_paths:
        source_key = str(source_path)
        is_gzip = source_path.name.endswith(".gz")

        try:
            stat_info = source_path.stat()
        except FileNotFoundError:
            missing_files.append(source_key)
            continue
        except OSError as exc:
            read_errors.append({"path": source_key, "error": str(exc)})
            continue

        inode = f"{stat_info.st_dev}:{stat_info.st_ino}"
        size = int(stat_info.st_size)
        mtime = float(stat_info.st_mtime)

        prev = offsets.get(source_key, {})
        prev_inode = str(prev.get("inode", ""))
        prev_size = int(prev.get("size", -1)) if str(prev.get("size", "")).lstrip("-").isdigit() else -1
        prev_mtime = float(prev.get("mtime", -1.0)) if str(prev.get("mtime", "")).strip() else -1.0
        prev_offset = int(prev.get("offset", 0)) if str(prev.get("offset", "")).isdigit() else 0

        start_offset = 0
        skip_read = False
        if mode == "incremental":
            if is_gzip:
                if prev_inode == inode and prev_size == size and abs(prev_mtime - mtime) < 1e-9:
                    skip_read = True
            else:
                if prev_inode == inode and size >= prev_offset:
                    start_offset = prev_offset

        if skip_read:
            skipped_files.append(source_key)
            updated_offsets[source_key] = {
                "inode": inode,
                "size": size,
                "mtime": mtime,
                "offset": size,
            }
            continue

        try:
            with open_event_stream(source_path) as fp:
                parsed_files.append(source_key)
                if not is_gzip and start_offset > 0:
                    fp.seek(start_offset)
                for raw_line in fp:
                    line = raw_line.strip()
                    if not line:
                        continue
                    total_lines += 1

                    try:
                        event = json.loads(line)
                    except Exception:  # noqa: BLE001
                        invalid_json_lines += 1
                        continue

                    try:
                        ts = parse_ts_utc(str(event.get("ts_utc", "")))
                    except Exception:  # noqa: BLE001
                        invalid_ts_lines += 1
                        continue

                    if ts < cutoff:
                        filtered_out_of_window += 1
                        continue

                    context = str(event.get("context", "")).strip() or "unknown"
                    if contexts_filter and context not in contexts_filter:
                        filtered_by_context += 1
                        continue

                    gate = str(event.get("gate_decision", "")).strip() or "unknown"
                    status = str(event.get("preflight_status", "")).strip() or "unknown"
                    tier = str(event.get("frontend_tier", "")).strip() or "unknown"
                    code = str(event.get("preflight_code", "")).strip() or "unknown"
                    agent_route = str(event.get("agent_route", "")).strip() or "unknown"
                    agent_type = str(event.get("agent_type", "")).strip() or "unknown"
                    reasoning_target = str(event.get("reasoning_target", "")).strip() or "unknown"
                    route_reason = str(event.get("route_reason", "")).strip() or "unknown"
                    new_events.append(
                        serialize_event(
                            ts=ts,
                            gate=gate,
                            status=status,
                            tier=tier,
                            code=code,
                            context=context,
                            agent_route=agent_route,
                            agent_type=agent_type,
                            reasoning_target=reasoning_target,
                            route_reason=route_reason,
                        )
                    )

                if is_gzip:
                    current_offset = size
                else:
                    current_offset = int(fp.tell())
                updated_offsets[source_key] = {
                    "inode": inode,
                    "size": size,
                    "mtime": mtime,
                    "offset": current_offset,
                }
        except FileNotFoundError:
            missing_files.append(source_key)
        except OSError as exc:
            read_errors.append({"path": source_key, "error": str(exc)})

    return new_events, updated_offsets


new_events, updated_offsets = parse_sources(
    source_paths=input_paths,
    mode=str(incremental_info["mode"]),
    offsets=offset_state,
)

state_events_window: List[Dict[str, Any]] = []
for item in loaded_state_events:
    if float(item["ts_epoch"]) >= cutoff_ts:
        state_events_window.append(item)

events_window = state_events_window + new_events
events_window = [item for item in events_window if float(item["ts_epoch"]) >= cutoff_ts]

incremental_info["events_from_state"] = len(state_events_window)
incremental_info["events_newly_parsed"] = len(new_events)

# Aggregate from in-window events.
valid_events = len(events_window)
gate_counter: Counter[str] = Counter()
status_counter: Counter[str] = Counter()
tier_counter: Counter[str] = Counter()
code_counter: Counter[str] = Counter()
tier_gate_counter: Dict[str, Counter[str]] = defaultdict(Counter)
context_counter: Counter[str] = Counter()
agent_route_counter: Counter[str] = Counter()
agent_type_counter: Counter[str] = Counter()
reasoning_counter: Counter[str] = Counter()
route_reason_counter: Counter[str] = Counter()
daily_buckets: Dict[str, Dict[str, Any]] = {}

for record in events_window:
    gate = record["gate"]
    status = record["status"]
    tier = record["tier"]
    code = record["code"]
    context = record["context"]
    agent_route = record.get("agent_route", "unknown")
    agent_type = record.get("agent_type", "unknown")
    reasoning_target = record.get("reasoning_target", "unknown")
    route_reason = record.get("route_reason", "unknown")

    gate_counter[gate] += 1
    status_counter[status] += 1
    tier_counter[tier] += 1
    code_counter[code] += 1
    tier_gate_counter[tier][gate] += 1
    context_counter[context] += 1
    agent_route_counter[agent_route] += 1
    agent_type_counter[agent_type] += 1
    reasoning_counter[reasoning_target] += 1
    route_reason_counter[route_reason] += 1

    day_key = datetime.fromtimestamp(float(record["ts_epoch"]), tz=timezone.utc).date().isoformat()
    day_bucket = daily_buckets.setdefault(
        day_key,
        {
            "events": 0,
            "allow": 0,
            "deny": 0,
            "code_counter": Counter(),
            "tier_gate_counter": defaultdict(Counter),
            "route_counter": Counter(),
        },
    )
    day_bucket["events"] += 1
    day_bucket["code_counter"][code] += 1
    day_bucket["tier_gate_counter"][tier][gate] += 1
    day_bucket["route_counter"][agent_route] += 1
    if gate == "allow":
        day_bucket["allow"] += 1
    elif gate == "deny":
        day_bucket["deny"] += 1

allow = int(gate_counter.get("allow", 0))
deny = int(gate_counter.get("deny", 0))
allow_rate = (allow / valid_events * 100) if valid_events else 0.0
deny_rate = (deny / valid_events * 100) if valid_events else 0.0

tier_gate_summary = build_tier_summary(tier_gate_counter)

daily_breakdown: List[Dict[str, Any]] = []
for day in sorted(daily_buckets):
    day_bucket = daily_buckets[day]
    events = int(day_bucket["events"])
    allow_day = int(day_bucket["allow"])
    deny_day = int(day_bucket["deny"])
    deny_rate_day = (deny_day / events * 100) if events else 0.0
    tier_day_summary = build_tier_summary(day_bucket["tier_gate_counter"])
    code_counts: Dict[str, int] = {
        code: int(count) for code, count in day_bucket["code_counter"].items()
    }
    route_counts: Dict[str, int] = {
        route: int(count) for route, count in day_bucket["route_counter"].items()
    }
    daily_breakdown.append(
        {
            "date_utc": day,
            "events": events,
            "allow": allow_day,
            "deny": deny_day,
            "deny_rate_pct": round(deny_rate_day, 4),
            "code_counts": code_counts,
            "route_counts": route_counts,
            "top_codes": top_codes_from_counter(day_bucket["code_counter"], events, top_n),
            "tiers": tier_day_summary,
        }
    )

failed_checks: List[Dict[str, Any]] = []
warnings: List[Dict[str, Any]] = []

if require_min_events > 0 and valid_events < require_min_events:
    min_events_check = {
        "type": "min_events",
        "required_events": require_min_events,
        "actual_events": valid_events,
        "action": no_data_action,
    }
    if no_data_action == "fail":
        failed_checks.append(min_events_check)
    elif no_data_action == "warn":
        warnings.append(min_events_check)

if fail_on_deny_rate_raw:
    threshold = float(fail_on_deny_rate_raw)
    if deny_rate >= threshold:
        failed_checks.append(
            {
                "type": "deny_rate",
                "threshold": threshold,
                "actual": round(deny_rate, 4),
            }
        )

for raw_rule in fail_on_codes_raw:
    if ":" in raw_rule:
        code, count_str = raw_rule.split(":", 1)
        code = code.strip()
        count_str = count_str.strip()
        if not count_str.isdigit():
            raise SystemExit(f"Invalid --fail-on-code rule: {raw_rule}")
        threshold_count = int(count_str)
    else:
        code = raw_rule.strip()
        threshold_count = 1

    if not code:
        raise SystemExit(f"Invalid --fail-on-code rule: {raw_rule}")

    actual_count = int(code_counter.get(code, 0))
    if actual_count >= threshold_count:
        failed_checks.append(
            {
                "type": "code_count",
                "code": code,
                "threshold_count": threshold_count,
                "actual_count": actual_count,
            }
        )

for raw_rule in fail_on_tier_deny_rate_raw:
    if ":" not in raw_rule:
        raise SystemExit(f"Invalid --fail-on-tier-deny-rate rule (expected TIER:percent): {raw_rule}")
    tier, threshold_str = raw_rule.split(":", 1)
    tier = tier.strip()
    threshold_str = threshold_str.strip()
    if not tier:
        raise SystemExit(f"Invalid --fail-on-tier-deny-rate rule: {raw_rule}")
    try:
        threshold = float(threshold_str)
    except ValueError as exc:
        raise SystemExit(f"Invalid --fail-on-tier-deny-rate rule: {raw_rule}") from exc
    if threshold < 0:
        raise SystemExit(f"Invalid --fail-on-tier-deny-rate rule: {raw_rule}")

    tier_stats = tier_gate_summary.get(tier)
    if not tier_stats:
        continue
    actual = float(tier_stats["deny_rate_pct"])
    events = int(tier_stats["events"])
    if events > 0 and actual >= threshold:
        failed_checks.append(
            {
                "type": "tier_deny_rate",
                "tier": tier,
                "threshold": threshold,
                "actual": round(actual, 4),
                "events": events,
            }
        )


def evaluate_trend(
    *,
    daily_rows: List[Dict[str, Any]],
    required_days: int,
    min_events: int,
    min_step_pct: float,
    tier: Optional[str] = None,
) -> Dict[str, Any]:
    if required_days < 2:
        return {"evaluated": False, "triggered": False, "reason": "required_days_lt_2"}

    day_map: Dict[date, Dict[str, Any]] = {}
    for row in daily_rows:
        d = date.fromisoformat(str(row["date_utc"]))
        if tier is None:
            day_map[d] = {
                "events": int(row["events"]),
                "deny_rate_pct": float(row["deny_rate_pct"]),
            }
        else:
            tier_data = row.get("tiers", {}).get(tier)
            if tier_data is None:
                continue
            day_map[d] = {
                "events": int(tier_data.get("events", 0)),
                "deny_rate_pct": float(tier_data.get("deny_rate_pct", 0.0)),
            }

    if not day_map:
        return {"evaluated": False, "triggered": False, "reason": "no_data"}

    latest_day = max(day_map.keys())
    start_day = latest_day - timedelta(days=required_days - 1)

    points: List[Dict[str, Any]] = []
    for idx in range(required_days):
        current_day = start_day + timedelta(days=idx)
        if current_day not in day_map:
            return {
                "evaluated": False,
                "triggered": False,
                "reason": "missing_calendar_day",
                "missing_date_utc": current_day.isoformat(),
            }
        entry = day_map[current_day]
        events = int(entry["events"])
        if events < min_events:
            return {
                "evaluated": False,
                "triggered": False,
                "reason": "insufficient_events",
                "date_utc": current_day.isoformat(),
                "events": events,
                "min_events": min_events,
            }
        points.append(
            {
                "date_utc": current_day.isoformat(),
                "events": events,
                "deny_rate_pct": round(float(entry["deny_rate_pct"]), 4),
            }
        )

    for prev, curr in zip(points, points[1:]):
        delta = float(curr["deny_rate_pct"]) - float(prev["deny_rate_pct"])
        if not (delta > 0 and delta >= min_step_pct):
            return {
                "evaluated": True,
                "triggered": False,
                "reason": "not_increasing",
                "points": points,
                "min_step_pct": min_step_pct,
            }

    return {
        "evaluated": True,
        "triggered": True,
        "reason": "increasing",
        "points": points,
        "min_step_pct": min_step_pct,
    }


trend_evaluations: List[Dict[str, Any]] = []

if fail_on_deny_trend_days_raw:
    required_days = int(fail_on_deny_trend_days_raw)
    trend_result = evaluate_trend(
        daily_rows=daily_breakdown,
        required_days=required_days,
        min_events=trend_min_events,
        min_step_pct=trend_min_step_pct,
        tier=None,
    )
    trend_evaluations.append(
        {
            "type": "deny_trend",
            "required_days": required_days,
            "tier": None,
            "result": trend_result,
        }
    )
    if trend_result.get("triggered"):
        failed_checks.append(
            {
                "type": "deny_trend",
                "required_days": required_days,
                "min_events": trend_min_events,
                "min_step_pct": trend_min_step_pct,
                "points": trend_result.get("points", []),
            }
        )

for raw_rule in fail_on_tier_deny_trend_raw:
    if ":" not in raw_rule:
        raise SystemExit(f"Invalid --fail-on-tier-deny-trend rule (expected TIER:days): {raw_rule}")
    tier, days_str = raw_rule.split(":", 1)
    tier = tier.strip()
    days_str = days_str.strip()
    if not tier or not days_str.isdigit() or int(days_str) < 2:
        raise SystemExit(f"Invalid --fail-on-tier-deny-trend rule: {raw_rule}")
    required_days = int(days_str)

    trend_result = evaluate_trend(
        daily_rows=daily_breakdown,
        required_days=required_days,
        min_events=trend_min_events,
        min_step_pct=trend_min_step_pct,
        tier=tier,
    )
    trend_evaluations.append(
        {
            "type": "tier_deny_trend",
            "required_days": required_days,
            "tier": tier,
            "result": trend_result,
        }
    )
    if trend_result.get("triggered"):
        failed_checks.append(
            {
                "type": "tier_deny_trend",
                "tier": tier,
                "required_days": required_days,
                "min_events": trend_min_events,
                "min_step_pct": trend_min_step_pct,
                "points": trend_result.get("points", []),
            }
        )

# Incremental state write is best-effort and never changes summary exit behavior.
if incremental_requested and state_path is not None and state_lock_fp is not None:
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_events = sorted(events_window, key=lambda item: float(item["ts_epoch"]))
        if len(state_events) > state_max_events:
            incremental_info["state_pruned_count"] = len(state_events) - state_max_events
            state_events = state_events[-state_max_events:]
        state_payload = {
            "version": 1,
            "signature": signature,
            "source_paths": input_path_strings,
            "offsets": updated_offsets,
            "events": state_events,
            "saved_at_utc": now.isoformat(timespec="seconds"),
        }
        tmp_path = state_path.with_suffix(state_path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(state_payload, ensure_ascii=False), encoding="utf-8")
        tmp_path.replace(state_path)
    except Exception as exc:  # noqa: BLE001
        incremental_info["state_write_error"] = str(exc)

parse_error_rate_pct = ((invalid_json_lines + invalid_ts_lines) / total_lines * 100) if total_lines else 0.0

if max_parse_error_rate_raw:
    parse_rate_threshold = float(max_parse_error_rate_raw)
    if parse_error_rate_pct >= parse_rate_threshold:
        parse_quality_item = {
            "type": "parse_quality",
            "threshold_pct": round(parse_rate_threshold, 4),
            "actual_pct": round(parse_error_rate_pct, 4),
            "action": parse_error_action,
            "invalid_json_lines": invalid_json_lines,
            "invalid_ts_lines": invalid_ts_lines,
            "parsed_lines": total_lines,
        }
        if parse_error_action == "fail":
            failed_checks.append(parse_quality_item)
        elif parse_error_action == "warn":
            warnings.append(parse_quality_item)

summary = {
    "window": {
        "days": days,
        "from_utc": cutoff.isoformat(timespec="seconds"),
        "to_utc": now.isoformat(timespec="seconds"),
    },
    "log_path": str(log_path),
    "input_sources": {
        "include_rotated": include_rotated,
        "include_gzip_rotated": include_gzip_rotated,
        "max_rotated_files": max_rotated_files,
        "files_parsed": parsed_files,
        "skipped_files": skipped_files,
        "missing_files": missing_files,
        "read_errors": read_errors,
        "incremental": incremental_info,
    },
    "parsed_lines": total_lines,
    "events_in_window": valid_events,
    "parse_quality": {
        "invalid_json_lines": invalid_json_lines,
        "invalid_ts_lines": invalid_ts_lines,
        "filtered_out_of_window": filtered_out_of_window,
        "filtered_by_context": filtered_by_context,
        "parse_error_rate_pct": round(parse_error_rate_pct, 4),
    },
    "gate": {
        "allow": allow,
        "deny": deny,
        "allow_rate_pct": round(allow_rate, 4),
        "deny_rate_pct": round(deny_rate, 4),
    },
    "status_distribution": dict(status_counter),
    "context_distribution": dict(context_counter),
    "agent_route_distribution": dict(agent_route_counter),
    "agent_type_distribution": dict(agent_type_counter),
    "reasoning_distribution": dict(reasoning_counter),
    "route_reason_distribution": dict(route_reason_counter),
    "tier_distribution": dict(tier_counter),
    "tier_gate": tier_gate_summary,
    "top_codes": top_codes_from_counter(code_counter, valid_events, top_n),
    "daily_breakdown": daily_breakdown,
    "checks": {
        "contexts": sorted(contexts_filter),
        "fail_on_deny_rate": float(fail_on_deny_rate_raw) if fail_on_deny_rate_raw else None,
        "fail_on_codes": fail_on_codes_raw,
        "fail_on_tier_deny_rate": fail_on_tier_deny_rate_raw,
        "fail_on_deny_trend_days": int(fail_on_deny_trend_days_raw) if fail_on_deny_trend_days_raw else None,
        "fail_on_tier_deny_trend": fail_on_tier_deny_trend_raw,
        "trend_min_events": trend_min_events,
        "trend_min_step_pct": trend_min_step_pct,
        "require_min_events": require_min_events,
        "no_data_action": no_data_action,
        "max_parse_error_rate_pct": float(max_parse_error_rate_raw) if max_parse_error_rate_raw else None,
        "parse_error_action": parse_error_action,
        "trend_evaluations": trend_evaluations,
        "warnings": warnings,
        "failed": failed_checks,
    },
}

ok = len(failed_checks) == 0

if json_mode:
    print(json.dumps({"ok": ok, "summary": summary}, ensure_ascii=False))
else:
    print(f"Frontend preflight summary (UTC, last {days} days)")
    print(f"Window: {summary['window']['from_utc']} -> {summary['window']['to_utc']}")
    print(f"Log file: {log_path}")
    print(
        "Input sources: "
        f"include_rotated={include_rotated}, "
        f"include_gzip_rotated={include_gzip_rotated}, "
        f"max_rotated_files={max_rotated_files}"
    )
    print(f"Parsed files: {len(parsed_files)}")
    if skipped_files:
        print(f"Skipped files: {len(skipped_files)}")
    if missing_files:
        print(f"Missing files: {len(missing_files)}")
    if read_errors:
        print(f"Read errors: {len(read_errors)}")
    if contexts_filter:
        print(f"Context filter: {','.join(sorted(contexts_filter))}")
    if incremental_requested:
        inc = summary["input_sources"]["incremental"]
        print(
            "Incremental: "
            f"mode={inc.get('mode')}, "
            f"state_loaded={inc.get('state_loaded')}, "
            f"fallback_reason={inc.get('fallback_reason')}"
        )
        if inc.get("state_write_error"):
            print(f"Incremental state write error: {inc.get('state_write_error')}")
    print(f"Parsed lines: {total_lines}")
    print(f"Events in window: {valid_events}")
    print(
        "Parse quality: "
        f"invalid_json={invalid_json_lines}, "
        f"invalid_ts={invalid_ts_lines}, "
        f"filtered_out_of_window={filtered_out_of_window}, "
        f"filtered_by_context={filtered_by_context}, "
        f"parse_error_rate={parse_error_rate_pct:.2f}%"
    )

    if valid_events > 0:
        print()
        print(f"Gate decision: allow={allow} ({allow_rate:.1f}%), deny={deny} ({deny_rate:.1f}%)")

        print("Status distribution:")
        for status, count in status_counter.most_common():
            rate = (count / valid_events) * 100
            print(f"- {status}: {count} ({rate:.1f}%)")

        print("Context distribution:")
        for context, count in context_counter.most_common():
            rate = (count / valid_events) * 100
            print(f"- {context}: {count} ({rate:.1f}%)")

        print("Agent route distribution:")
        for route, count in agent_route_counter.most_common():
            rate = (count / valid_events) * 100
            print(f"- {route}: {count} ({rate:.1f}%)")

        print("Agent type distribution:")
        for agent_type, count in agent_type_counter.most_common():
            rate = (count / valid_events) * 100
            print(f"- {agent_type}: {count} ({rate:.1f}%)")

        print("Reasoning target distribution:")
        for target, count in reasoning_counter.most_common():
            rate = (count / valid_events) * 100
            print(f"- {target}: {count} ({rate:.1f}%)")

        print("Tier distribution:")
        for tier, count in tier_counter.most_common():
            rate = (count / valid_events) * 100
            print(f"- {tier}: {count} ({rate:.1f}%)")

        print("Tier deny-rate:")
        for tier in sorted(tier_gate_summary):
            item = tier_gate_summary[tier]
            print(f"- {tier}: deny={item['deny']} / {item['events']} ({item['deny_rate_pct']:.1f}%)")

        print(f"Top {top_n} preflight codes:")
        for item in summary["top_codes"]:
            print(f"- {item['code']}: {item['count']} ({item['rate_pct']:.1f}%)")

    if trend_evaluations:
        print()
        print("Trend checks:")
        for item in trend_evaluations:
            check_type = item["type"]
            required_days = item["required_days"]
            tier = item["tier"]
            result = item["result"]
            label = "overall" if tier is None else str(tier)
            if result.get("evaluated"):
                status = "triggered" if result.get("triggered") else "not-triggered"
                print(f"- {check_type} ({label}, {required_days}d): {status}")
            else:
                print(f"- {check_type} ({label}, {required_days}d): skipped ({result.get('reason', 'unknown')})")

    if not ok:
        print()
        print("Threshold checks failed:")
        for item in failed_checks:
            t = item["type"]
            if t == "deny_rate":
                print(f"- deny_rate >= {item['threshold']:.4f}, actual={item['actual']:.4f}")
            elif t == "code_count":
                print(f"- code {item['code']} >= {item['threshold_count']}, actual={item['actual_count']}")
            elif t == "tier_deny_rate":
                print(
                    f"- tier {item['tier']} deny_rate >= {item['threshold']:.4f}, "
                    f"actual={item['actual']:.4f}"
                )
            elif t in {"deny_trend", "tier_deny_trend"}:
                scope = "overall" if t == "deny_trend" else f"tier {item['tier']}"
                print(
                    f"- {scope} deny_rate trend up for {item['required_days']} consecutive days "
                    f"(min_events={item['min_events']}, min_step_pct={item['min_step_pct']})"
                )
            elif t == "min_events":
                print(
                    f"- min_events required={item['required_events']}, "
                    f"actual={item['actual_events']} (action={item['action']})"
                )
            elif t == "parse_quality":
                print(
                    f"- parse_error_rate >= {item['threshold_pct']:.4f}%, "
                    f"actual={item['actual_pct']:.4f}%"
                )
            else:
                print(f"- {t}: {item}")

    if warnings:
        print()
        print("Threshold warnings:")
        for item in warnings:
            if item["type"] == "min_events":
                print(
                    f"- min_events required={item['required_events']}, "
                    f"actual={item['actual_events']} (action={item['action']})"
                )
            elif item["type"] == "parse_quality":
                print(
                    f"- parse_error_rate >= {item['threshold_pct']:.4f}%, "
                    f"actual={item['actual_pct']:.4f}%"
                )
            else:
                print(f"- {item}")

if state_lock_fp is not None:
    try:
        fcntl.flock(state_lock_fp.fileno(), fcntl.LOCK_UN)
    except Exception:
        pass
    try:
        state_lock_fp.close()
    except Exception:
        pass

raise SystemExit(0 if ok else 2)
PY
