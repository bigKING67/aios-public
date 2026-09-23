#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUMMARY_SH="${SCRIPT_DIR}/frontend_preflight_log_summary.sh"

policy_path="${SCRIPT_DIR}/frontend_preflight_policy.json"
log_path="${HOME}/.codex/logs/frontend_preflight_events.jsonl"
days_override=""
top_override=""
contexts_override_serialized=""
profile_override=""
json_mode="0"

usage() {
  cat <<'USAGE'
Usage:
  bash ~/.codex/tools/frontend_preflight_policy_run.sh \
    [--policy-path <absolute-path>] \
    [--log-path <absolute-path>] \
    [--days <n>] \
    [--top <n>] \
    [--context <name>[,<name>...]]... \
    [--profile <name>] \
    [--json]

Behavior:
  - Loads unified thresholds from frontend_preflight_policy.json.
  - Supports legacy single-policy format and profile format (default_profile + profiles).
  - Converts policy thresholds to frontend_preflight_log_summary.sh flags.
  - verify/CI should call this script to avoid threshold drift.
  - CLI --context overrides policy contexts when provided.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --policy-path)
      policy_path="${2-}"
      shift 2
      ;;
    --log-path)
      log_path="${2-}"
      shift 2
      ;;
    --days)
      days_override="${2-}"
      shift 2
      ;;
    --top)
      top_override="${2-}"
      shift 2
      ;;
    --context)
      if [[ -n "${contexts_override_serialized}" ]]; then
        contexts_override_serialized+=$'\x1f'
      fi
      contexts_override_serialized+="${2-}"
      shift 2
      ;;
    --profile)
      profile_override="${2-}"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
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

if [[ "${policy_path}" != /* ]]; then
  echo "--policy-path must be absolute: ${policy_path}" >&2
  exit 2
fi

if [[ "${log_path}" != /* ]]; then
  echo "--log-path must be absolute: ${log_path}" >&2
  exit 2
fi

if [[ -n "${days_override}" ]]; then
  if ! [[ "${days_override}" =~ ^[0-9]+$ ]] || [[ "${days_override}" -lt 1 ]]; then
    echo "--days must be an integer >= 1: ${days_override}" >&2
    exit 2
  fi
fi

if [[ -n "${top_override}" ]]; then
  if ! [[ "${top_override}" =~ ^[0-9]+$ ]] || [[ "${top_override}" -lt 1 ]]; then
    echo "--top must be an integer >= 1: ${top_override}" >&2
    exit 2
  fi
fi

if [[ -n "${profile_override}" ]]; then
  if [[ "${profile_override}" =~ [[:space:]] ]]; then
    echo "--profile must not include whitespace: ${profile_override}" >&2
    exit 2
  fi
fi

if [[ ! -x "${SUMMARY_SH}" ]]; then
  echo "Summary script not executable: ${SUMMARY_SH}" >&2
  exit 2
fi

if [[ ! -r "${policy_path}" ]]; then
  echo "Policy file not found or not readable: ${policy_path}" >&2
  exit 2
fi

python3 - "${policy_path}" "${log_path}" "${days_override}" "${top_override}" "${contexts_override_serialized}" "${profile_override}" "${json_mode}" "${SUMMARY_SH}" <<'PY'
from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
import subprocess
import sys
from typing import Any, Dict

policy_path = Path(sys.argv[1])
log_path = sys.argv[2]
days_override_raw = sys.argv[3].strip()
top_override_raw = sys.argv[4].strip()
contexts_override_raw = [item.strip() for item in sys.argv[5].split("\x1f") if item.strip()]
profile_override_raw = sys.argv[6].strip()
json_mode = sys.argv[7] == "1"
summary_sh = Path(sys.argv[8])


def fail(msg: str) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(2)


def require_int(name: str, value: Any, *, min_value: int = 0) -> int:
    if isinstance(value, bool):
        fail(f"{name} must be an integer")
    try:
        parsed = int(str(value))
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"{name} must be an integer") from exc
    if parsed < min_value:
        fail(f"{name} must be >= {min_value}")
    return parsed


def require_float(name: str, value: Any, *, min_value: float = 0.0) -> float:
    try:
        parsed = float(str(value))
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"{name} must be a number") from exc
    if parsed < min_value:
        fail(f"{name} must be >= {min_value}")
    return parsed


def require_bool(name: str, value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and str(value) in {"0", "1"}:
        return bool(int(value))
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y"}:
            return True
        if normalized in {"false", "0", "no", "n"}:
            return False
    fail(f"{name} must be a boolean")


def parse_contexts(raw_items: list[str]) -> list[str]:
    out: list[str] = []
    for raw in raw_items:
        for item in raw.split(","):
            value = item.strip()
            if value and value not in out:
                out.append(value)
    return out


def parse_policy_contexts(raw: Any, *, name: str) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        fail(f"{name} must be an array of strings")
    out: list[str] = []
    for item in raw:
        value = str(item).strip()
        if value and value not in out:
            out.append(value)
    return out


def parse_policy_section(section: Dict[str, Any], *, prefix: str) -> Dict[str, Any]:
    allowed_section_keys = {"window", "contexts", "thresholds", "sources", "checks"}
    unknown_section_keys = sorted([key for key in section.keys() if key not in allowed_section_keys])
    if unknown_section_keys:
        fail(f"unknown {prefix} keys: {', '.join(unknown_section_keys)}")

    window = section.get("window", {})
    if window is None:
        window = {}
    if not isinstance(window, dict):
        fail(f"{prefix}.window must be an object")
    unknown_window_keys = sorted([key for key in window.keys() if key not in {"days", "top"}])
    if unknown_window_keys:
        fail(f"unknown {prefix}.window keys: {', '.join(unknown_window_keys)}")

    thresholds = section.get("thresholds", {})
    if thresholds is None:
        thresholds = {}
    if not isinstance(thresholds, dict):
        fail(f"{prefix}.thresholds must be an object")
    allowed_threshold_keys = {
        "deny_rate_pct",
        "codes",
        "tier_deny_rate_pct",
        "deny_trend_days",
        "tier_deny_trend_days",
        "trend_min_events",
        "trend_min_step_pct",
    }
    unknown_threshold_keys = sorted([key for key in thresholds.keys() if key not in allowed_threshold_keys])
    if unknown_threshold_keys:
        fail(f"unknown {prefix}.thresholds keys: {', '.join(unknown_threshold_keys)}")

    sources = section.get("sources", {})
    if sources is None:
        sources = {}
    if not isinstance(sources, dict):
        fail(f"{prefix}.sources must be an object")
    allowed_sources_keys = {"include_rotated", "include_gzip_rotated", "max_rotated_files"}
    unknown_sources_keys = sorted([key for key in sources.keys() if key not in allowed_sources_keys])
    if unknown_sources_keys:
        fail(f"unknown {prefix}.sources keys: {', '.join(unknown_sources_keys)}")

    checks = section.get("checks", {})
    if checks is None:
        checks = {}
    if not isinstance(checks, dict):
        fail(f"{prefix}.checks must be an object")
    allowed_checks_keys = {
        "min_events",
        "no_data_action",
        "max_parse_error_rate_pct",
        "parse_error_action",
    }
    unknown_checks_keys = sorted([key for key in checks.keys() if key not in allowed_checks_keys])
    if unknown_checks_keys:
        fail(f"unknown {prefix}.checks keys: {', '.join(unknown_checks_keys)}")

    return {
        "window": window,
        "contexts": parse_policy_contexts(section.get("contexts"), name=f"{prefix}.contexts"),
        "thresholds": thresholds,
        "sources": sources,
        "checks": checks,
    }


def merge_policy_dict(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged: Dict[str, Any] = deepcopy(base)
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = merge_policy_dict(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def resolve_profile(name: str, profiles: Dict[str, Any], trail: list[str]) -> Dict[str, Any]:
    if name in trail:
        cycle = " -> ".join(trail + [name])
        fail(f"profile extends cycle detected: {cycle}")

    raw_profile = profiles.get(name)
    if not isinstance(raw_profile, dict):
        fail(f"policy.profiles.{name} must be an object")

    allowed_profile_keys = {"extends", "window", "contexts", "thresholds", "sources", "checks"}
    unknown_profile_keys = sorted([key for key in raw_profile.keys() if key not in allowed_profile_keys])
    if unknown_profile_keys:
        fail(f"unknown policy.profiles.{name} keys: {', '.join(unknown_profile_keys)}")

    extends_raw = raw_profile.get("extends")
    parent_name = ""
    if extends_raw is not None:
        parent_name = str(extends_raw).strip()
        if not parent_name:
            fail(f"policy.profiles.{name}.extends must be a non-empty string")
        if parent_name not in profiles:
            fail(f"unknown policy profile in extends: {name} -> {parent_name}")

    resolved: Dict[str, Any] = {}
    if parent_name:
        resolved = resolve_profile(parent_name, profiles, trail + [name])

    local_section = {k: v for k, v in raw_profile.items() if k != "extends"}
    return merge_policy_dict(resolved, local_section)


if not summary_sh.exists() or not summary_sh.is_file():
    fail(f"Summary script not found: {summary_sh}")

try:
    policy = json.loads(policy_path.read_text(encoding="utf-8"))
except Exception as exc:  # noqa: BLE001
    raise SystemExit(f"Failed to read policy file {policy_path}: {exc}")

if not isinstance(policy, dict):
    fail("policy root must be an object")

version = policy.get("version", 1)
if str(version) != "1":
    fail(f"unsupported policy version: {version}")

selected_profile_name: str | None = None
policy_section: Dict[str, Any]

if "profiles" in policy:
    allowed_root_keys = {"version", "default_profile", "profiles"}
    unknown_root_keys = sorted([key for key in policy.keys() if key not in allowed_root_keys])
    if unknown_root_keys:
        fail(f"unknown policy keys: {', '.join(unknown_root_keys)}")

    profiles = policy.get("profiles")
    if not isinstance(profiles, dict) or not profiles:
        fail("policy.profiles must be a non-empty object")

    default_profile = str(policy.get("default_profile", "")).strip()
    if not default_profile:
        default_profile = "prod" if "prod" in profiles else ""
    if not default_profile:
        fail("policy.default_profile is required when policy.profiles is used")

    selected_profile_name = profile_override_raw or default_profile
    if selected_profile_name not in profiles:
        fail(f"unknown policy profile: {selected_profile_name}")

    resolved_profile = resolve_profile(selected_profile_name, profiles, [])
    policy_section = parse_policy_section(
        resolved_profile, prefix=f"policy.profiles.{selected_profile_name}"
    )
else:
    allowed_root_keys = {"version", "window", "contexts", "thresholds", "sources", "checks"}
    unknown_root_keys = sorted([key for key in policy.keys() if key not in allowed_root_keys])
    if unknown_root_keys:
        fail(f"unknown policy keys: {', '.join(unknown_root_keys)}")
    legacy_section = {key: value for key, value in policy.items() if key != "version"}
    policy_section = parse_policy_section(legacy_section, prefix="policy")
    if profile_override_raw:
        fail("--profile is only supported when policy.profiles exists")

window = policy_section["window"]
if days_override_raw:
    days = require_int("--days", days_override_raw, min_value=1)
else:
    days = require_int("policy.window.days", window.get("days", 7), min_value=1)

if top_override_raw:
    top = require_int("--top", top_override_raw, min_value=1)
else:
    top = require_int("policy.window.top", window.get("top", 5), min_value=1)

cli_contexts = parse_contexts(contexts_override_raw)
contexts = cli_contexts if cli_contexts else policy_section["contexts"]
thresholds = policy_section["thresholds"]
sources = policy_section["sources"]
checks = policy_section["checks"]

cmd = [
    "bash",
    str(summary_sh),
    "--log-path",
    log_path,
    "--days",
    str(days),
    "--top",
    str(top),
]

for ctx in contexts:
    cmd.extend(["--context", ctx])

include_rotated = require_bool("sources.include_rotated", sources.get("include_rotated", False))
include_gzip_rotated = require_bool(
    "sources.include_gzip_rotated", sources.get("include_gzip_rotated", False)
)
max_rotated_files = require_int(
    "sources.max_rotated_files", sources.get("max_rotated_files", 64), min_value=1
)
if include_gzip_rotated:
    include_rotated = True

if include_rotated:
    cmd.append("--include-rotated")
if include_gzip_rotated:
    cmd.append("--include-gzip-rotated")
cmd.extend(["--max-rotated-files", str(max_rotated_files)])

min_events = require_int("checks.min_events", checks.get("min_events", 0), min_value=0)
cmd.extend(["--require-min-events", str(min_events)])

no_data_action = str(checks.get("no_data_action", "fail")).strip().lower()
if no_data_action not in {"fail", "warn", "skip"}:
    fail("checks.no_data_action must be one of: fail|warn|skip")
cmd.extend(["--no-data-action", no_data_action])

parse_error_action = str(checks.get("parse_error_action", "skip")).strip().lower()
if parse_error_action not in {"fail", "warn", "skip"}:
    fail("checks.parse_error_action must be one of: fail|warn|skip")
cmd.extend(["--parse-error-action", parse_error_action])

max_parse_error_rate_pct = checks.get("max_parse_error_rate_pct")
if max_parse_error_rate_pct is not None:
    cmd.extend([
        "--max-parse-error-rate-pct",
        str(
            require_float(
                "checks.max_parse_error_rate_pct", max_parse_error_rate_pct, min_value=0.0
            )
        ),
    ])

deny_rate = thresholds.get("deny_rate_pct")
if deny_rate is not None:
    cmd.extend([
        "--fail-on-deny-rate",
        str(require_float("thresholds.deny_rate_pct", deny_rate, min_value=0.0)),
    ])

codes = thresholds.get("codes", [])
if codes is None:
    codes = []
if not isinstance(codes, list):
    fail("thresholds.codes must be an array")
for item in codes:
    if isinstance(item, str):
        code = item.strip()
        min_count = 1
    elif isinstance(item, dict):
        code = str(item.get("code", "")).strip()
        min_count = require_int(
            f"thresholds.codes[{code or '?'}].min_count",
            item.get("min_count", 1),
            min_value=1,
        )
    else:
        fail("thresholds.codes items must be string or object")

    if not code:
        fail("thresholds.codes item missing code")
    cmd.extend(["--fail-on-code", f"{code}:{min_count}"])

tier_deny_rate = thresholds.get("tier_deny_rate_pct", {})
if tier_deny_rate is None:
    tier_deny_rate = {}
if not isinstance(tier_deny_rate, dict):
    fail("thresholds.tier_deny_rate_pct must be an object")
for tier, value in sorted(tier_deny_rate.items()):
    tier_name = str(tier).strip()
    if not tier_name:
        fail("thresholds.tier_deny_rate_pct contains empty tier")
    pct = require_float(f"thresholds.tier_deny_rate_pct.{tier_name}", value, min_value=0.0)
    cmd.extend(["--fail-on-tier-deny-rate", f"{tier_name}:{pct}"])

deny_trend_days = thresholds.get("deny_trend_days")
if deny_trend_days is not None:
    trend_days = require_int("thresholds.deny_trend_days", deny_trend_days, min_value=2)
    cmd.extend(["--fail-on-deny-trend", str(trend_days)])

tier_deny_trend = thresholds.get("tier_deny_trend_days", {})
if tier_deny_trend is None:
    tier_deny_trend = {}
if not isinstance(tier_deny_trend, dict):
    fail("thresholds.tier_deny_trend_days must be an object")
for tier, value in sorted(tier_deny_trend.items()):
    tier_name = str(tier).strip()
    if not tier_name:
        fail("thresholds.tier_deny_trend_days contains empty tier")
    trend_days = require_int(
        f"thresholds.tier_deny_trend_days.{tier_name}", value, min_value=2
    )
    cmd.extend(["--fail-on-tier-deny-trend", f"{tier_name}:{trend_days}"])

trend_min_events = thresholds.get("trend_min_events")
if trend_min_events is not None:
    cmd.extend([
        "--trend-min-events",
        str(require_int("thresholds.trend_min_events", trend_min_events, min_value=1)),
    ])

trend_min_step = thresholds.get("trend_min_step_pct")
if trend_min_step is not None:
    cmd.extend([
        "--trend-min-step-pct",
        str(require_float("thresholds.trend_min_step_pct", trend_min_step, min_value=0.0)),
    ])

if json_mode:
    cmd.append("--json")

result = subprocess.run(cmd, check=False)
raise SystemExit(result.returncode)
PY
