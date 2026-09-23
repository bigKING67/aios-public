#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFLIGHT_RUN_SH="${SCRIPT_DIR}/frontend_preflight_run.sh"
PREFLIGHT_SPEC_JSON="${SCRIPT_DIR}/frontend_preflight_spec.json"
AGENT_ROUTING_JSON="${SCRIPT_DIR}/frontend_agent_routing.json"
LOG_ROTATE_SH="${SCRIPT_DIR}/frontend_preflight_log_rotate.sh"

frontend_tier=""
skills=""
style_authority_path=""
style_authority_source="none"
style_authority_mode="${FRONTEND_STYLE_AUTHORITY_MODE:-auto}"
reasoning_override="auto"

usage() {
  cat <<'EOF'
Usage:
  bash ~/.codex/tools/frontend_worker_entry.sh \
    --frontend-tier <L0|L1-F|L1-V|L2> \
    --skills <comma-separated-skills> \
    [--reasoning-override <auto|high|xhigh>] \
    [--style-authority-path <absolute-path>]

Behavior:
  - Runs frontend preflight via frontend_preflight_run.sh.
  - Validates normalized preflight status/code.
  - Outputs one JSON payload with preflight_status/preflight_code/gate_decision,
    route fields, execution_mode, subagent_required, spawn_agent_intent, and
    runtime_remediation_policy.
  - Exit code 0 means allow (pass/warn), 2 means deny (fail).

Observability:
  - Logs one JSONL event by default to ~/.codex/logs/frontend_preflight_events.jsonl.
  - Set FRONTEND_PREFLIGHT_LOG_ENABLED=0 to disable logging.
  - Set FRONTEND_PREFLIGHT_LOG_CONTEXT to tag event context (default: prod).
  - Set FRONTEND_PREFLIGHT_LOG_PATH to override log path.
  - Set FRONTEND_STYLE_AUTHORITY_PATH to override discovered DESIGN.md.
  - Set FRONTEND_STYLE_AUTHORITY_AUTO=0 to disable upward DESIGN.md discovery.
  - L1-F/L1-V/L2 require authority by default. Set
    FRONTEND_STYLE_AUTHORITY_REQUIRED=0 only for explicit legacy/plumbing exceptions.
  - Set FRONTEND_STYLE_AUTHORITY_MODE=auto|enforce|evolve to describe whether
    DESIGN.md is an enforced baseline or being intentionally evolved.
  - Set FRONTEND_PREFLIGHT_LOG_MAX_BYTES / FRONTEND_PREFLIGHT_LOG_KEEP for rotation thresholds.
  - Set FRONTEND_PREFLIGHT_LOG_MAX_AGE_DAYS for age-based cleanup.
  - Set FRONTEND_PREFLIGHT_LOG_COMPRESS=1 to gzip rotated logs.
  - Canonical status/code list is read from ~/.codex/tools/frontend_preflight_spec.json
    (override path via FRONTEND_PREFLIGHT_SPEC_PATH).
  - Agent routing defaults are read from ~/.codex/tools/frontend_agent_routing.json
    (override path via FRONTEND_AGENT_ROUTING_PATH).
EOF
}

emit_runtime_error() {
  local message="$1"
  python3 - "$message" <<'PY'
import json
import sys

payload = {
    "ok": False,
    "status": "fail",
    "code": "RUNTIME_ERROR",
    "message": sys.argv[1],
    "normalized_chain": [],
    "preflight_status": "fail",
    "preflight_code": "RUNTIME_ERROR",
    "gate_decision": "deny",
}
print(json.dumps(payload, ensure_ascii=False))
PY
}

resolve_style_authority_path() {
  if [[ -n "${style_authority_path}" ]]; then
    style_authority_path="$(python3 - "${style_authority_path}" <<'PY'
from pathlib import Path
import sys

print(Path(sys.argv[1]).expanduser().resolve())
PY
)"
    style_authority_source="explicit"
    return 0
  fi

  if [[ -n "${FRONTEND_STYLE_AUTHORITY_PATH:-}" ]]; then
    style_authority_path="$(python3 - "${FRONTEND_STYLE_AUTHORITY_PATH}" <<'PY'
from pathlib import Path
import sys

print(Path(sys.argv[1]).expanduser().resolve())
PY
)"
    style_authority_source="env"
    return 0
  fi

  if [[ "${FRONTEND_STYLE_AUTHORITY_AUTO:-1}" == "0" ]]; then
    return 0
  fi

  style_authority_path="$(python3 - "${FRONTEND_WORKSPACE_ROOT:-${PWD}}" <<'PY'
from pathlib import Path
import sys

start = Path(sys.argv[1]).expanduser().resolve()
if start.is_file():
    start = start.parent

for directory in (start, *start.parents):
    candidate = directory / "DESIGN.md"
    if candidate.is_file():
        print(candidate)
        break
PY
)"
  if [[ -n "${style_authority_path}" ]]; then
    style_authority_source="auto"
  fi
}

resolve_style_authority_mode() {
  style_authority_mode="$(printf '%s' "${style_authority_mode}" | tr '[:upper:]' '[:lower:]')"
  case "${style_authority_mode}" in
    auto|"")
      if [[ -n "${style_authority_path}" ]]; then
        style_authority_mode="enforce"
      else
        style_authority_mode="none"
      fi
      ;;
    enforce|evolve|none)
      ;;
    *)
      emit_runtime_error "FRONTEND_STYLE_AUTHORITY_MODE must be one of: auto|enforce|evolve|none"
      exit 2
      ;;
  esac
}

append_log_jsonl() {
  local gate_output="$1"
  local gate_rc="$2"
  local tier="$3"
  local chain="$4"
  local authority_path="$5"
  local authority_source="$6"
  local authority_mode="$7"
  local agent_route="$8"
  local agent_type="$9"
  local agent_model="${10}"
  local reasoning_target="${11}"
  local route_reason="${12}"
  local execution_mode="${13}"
  local subagent_required="${14}"
  local runtime_remediation_policy="${15}"
  local log_context="${FRONTEND_PREFLIGHT_LOG_CONTEXT:-prod}"

  if [[ "${FRONTEND_PREFLIGHT_LOG_ENABLED:-1}" == "0" ]]; then
    return 0
  fi

  local log_path
  log_path="${FRONTEND_PREFLIGHT_LOG_PATH:-${HOME}/.codex/logs/frontend_preflight_events.jsonl}"
  mkdir -p "$(dirname "${log_path}")"

  if [[ -x "${LOG_ROTATE_SH}" ]]; then
    if [[ "${FRONTEND_PREFLIGHT_LOG_COMPRESS:-0}" == "1" ]]; then
      bash "${LOG_ROTATE_SH}" \
        --log-path "${log_path}" \
        --max-bytes "${FRONTEND_PREFLIGHT_LOG_MAX_BYTES:-5242880}" \
        --keep "${FRONTEND_PREFLIGHT_LOG_KEEP:-14}" \
        --max-age-days "${FRONTEND_PREFLIGHT_LOG_MAX_AGE_DAYS:-30}" \
        --compress \
        --quiet || true
    else
      bash "${LOG_ROTATE_SH}" \
        --log-path "${log_path}" \
        --max-bytes "${FRONTEND_PREFLIGHT_LOG_MAX_BYTES:-5242880}" \
        --keep "${FRONTEND_PREFLIGHT_LOG_KEEP:-14}" \
        --max-age-days "${FRONTEND_PREFLIGHT_LOG_MAX_AGE_DAYS:-30}" \
        --quiet || true
    fi
  fi

  python3 - "${gate_output}" "${gate_rc}" "${log_path}" "${tier}" "${chain}" "${authority_path}" "${authority_source}" "${authority_mode}" "${log_context}" "${agent_route}" "${agent_type}" "${agent_model}" "${reasoning_target}" "${route_reason}" "${execution_mode}" "${subagent_required}" "${runtime_remediation_policy}" <<'PY' || true
import fcntl
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

raw_payload = sys.argv[1]
gate_rc = int(sys.argv[2])
log_path = Path(sys.argv[3])
tier = sys.argv[4]
skills = [s.strip() for s in sys.argv[5].split(",") if s.strip()]
authority_path = sys.argv[6].strip()
authority_source = sys.argv[7].strip() or "none"
authority_mode = sys.argv[8].strip() or "none"
context = sys.argv[9].strip() or "unknown"
agent_route_arg = sys.argv[10].strip()
agent_type_arg = sys.argv[11].strip()
agent_model_arg = sys.argv[12].strip()
reasoning_target_arg = sys.argv[13].strip()
route_reason_arg = sys.argv[14].strip()
execution_mode_arg = sys.argv[15].strip()
subagent_required_arg = sys.argv[16].strip().lower() == "true"
runtime_remediation_policy_arg = sys.argv[17].strip()

base = {
    "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "source": "frontend_worker_entry.sh",
    "context": context,
    "frontend_tier": tier,
    "skills": skills,
    "style_authority_path": authority_path if authority_path else "",
    "style_authority_source": authority_source,
    "style_authority_mode": authority_mode,
    "has_style_authority_path": bool(authority_path),
    "entry_exit_code": gate_rc,
}

lines = [ln.strip() for ln in raw_payload.splitlines() if ln.strip()]
last_line = lines[-1] if lines else ""
try:
    payload = json.loads(last_line) if last_line else {}
except Exception:  # noqa: BLE001
    payload = {}

record = dict(base)
record["preflight_status"] = str(payload.get("preflight_status") or payload.get("status") or "")
record["preflight_code"] = str(payload.get("preflight_code") or payload.get("code") or "")
record["gate_decision"] = str(payload.get("gate_decision") or "")
record["message"] = str(payload.get("message") or "")
record["ok"] = bool(payload.get("ok")) if payload else False
record["agent_route"] = str(payload.get("agent_route") or agent_route_arg or "")
record["agent_type"] = str(payload.get("agent_type") or agent_type_arg or "")
record["agent_model"] = str(payload.get("agent_model") or agent_model_arg or "")
record["reasoning_target"] = str(payload.get("reasoning_target") or reasoning_target_arg or "")
record["route_reason"] = str(payload.get("route_reason") or route_reason_arg or "")
record["execution_mode"] = str(payload.get("execution_mode") or execution_mode_arg or "")
record["subagent_required"] = bool(payload.get("subagent_required", subagent_required_arg))
record["runtime_remediation_policy"] = str(payload.get("runtime_remediation_policy") or runtime_remediation_policy_arg or "")
record["runtime_remediation_required"] = bool(payload.get("runtime_remediation_required", False))
record["spawn_agent_intent"] = payload.get("spawn_agent_intent") if isinstance(payload.get("spawn_agent_intent"), dict) else {}
record["style_authority_digest"] = str(payload.get("style_authority_digest") or "")
record["style_authority_read_required"] = bool(payload.get("style_authority_read_required", False))
record["style_authority_context_required"] = bool(payload.get("style_authority_context_required", False))
record["style_authority_revision_policy"] = str(payload.get("style_authority_revision_policy") or "")

lock_path = Path(str(log_path) + ".lock")
with lock_path.open("a+", encoding="utf-8") as lock_fp:
    fcntl.flock(lock_fp.fileno(), fcntl.LOCK_EX)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --frontend-tier)
      frontend_tier="${2-}"
      shift 2
      ;;
    --skills)
      skills="${2-}"
      shift 2
      ;;
    --reasoning-override)
      reasoning_override="${2-}"
      shift 2
      ;;
    --style-authority-path)
      style_authority_path="${2-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      emit_runtime_error "Unknown argument: $1"
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${frontend_tier}" ]]; then
  emit_runtime_error "--frontend-tier is required."
  usage >&2
  exit 2
fi

if [[ "${reasoning_override}" != "auto" && "${reasoning_override}" != "high" && "${reasoning_override}" != "xhigh" ]]; then
  emit_runtime_error "--reasoning-override must be one of: auto|high|xhigh"
  usage >&2
  exit 2
fi

resolve_style_authority_path
resolve_style_authority_mode

if [[ ! -x "${PREFLIGHT_RUN_SH}" ]]; then
  emit_runtime_error "Preflight runner not found or not executable: ${PREFLIGHT_RUN_SH}"
  exit 2
fi

spec_path="${FRONTEND_PREFLIGHT_SPEC_PATH:-${PREFLIGHT_SPEC_JSON}}"
if [[ ! -r "${spec_path}" ]]; then
  emit_runtime_error "Preflight spec not found or not readable: ${spec_path}"
  exit 2
fi

routing_path="${FRONTEND_AGENT_ROUTING_PATH:-${AGENT_ROUTING_JSON}}"
if [[ ! -r "${routing_path}" ]]; then
  emit_runtime_error "Agent routing config not found or not readable: ${routing_path}"
  exit 2
fi

set +e
routing_resolution="$(
python3 - "${routing_path}" "${frontend_tier}" "${reasoning_override}" <<'PY'
import json
from pathlib import Path
import sys

routing_path = Path(sys.argv[1])
tier = sys.argv[2].strip()
override = sys.argv[3].strip().lower()

payload = json.loads(routing_path.read_text(encoding="utf-8"))
if int(payload.get("version", 0)) != 1:
    raise SystemExit(f"invalid routing version: {payload.get('version')}")

tier_defaults = payload.get("tier_defaults")
overrides = payload.get("overrides")
if not isinstance(tier_defaults, dict) or not isinstance(overrides, dict):
    raise SystemExit("routing config missing tier_defaults/overrides")

if override not in {"auto", "high", "xhigh"}:
    raise SystemExit(f"invalid override: {override}")

if override == "high":
    selected = overrides.get("explicit_high")
elif override == "xhigh":
    selected = overrides.get("explicit_xhigh")
else:
    selected = tier_defaults.get(tier)

if not isinstance(selected, dict):
    raise SystemExit(f"routing rule not found for tier={tier}, override={override}")

agent_route = str(selected.get("agent_route", "")).strip()
agent_type = str(selected.get("agent_type", "")).strip()
agent_model = str(selected.get("agent_model", "")).strip()
reasoning_target = str(selected.get("reasoning_target", "")).strip()
route_reason = str(selected.get("route_reason", "")).strip()
execution_mode = str(selected.get("execution_mode", "")).strip()
subagent_required = selected.get("subagent_required")
runtime_remediation_policy = str(selected.get("runtime_remediation_policy", "")).strip()

if agent_route not in {"default_high", "worker_xhigh"}:
    raise SystemExit(f"invalid agent_route: {agent_route}")
if agent_type not in {"default", "worker"}:
    raise SystemExit(f"invalid agent_type: {agent_type}")
if agent_route == "default_high" and agent_type != "default":
    raise SystemExit(f"default_high must use agent_type=default, got: {agent_type}")
if agent_route == "worker_xhigh" and agent_type != "worker":
    raise SystemExit(f"worker_xhigh must use agent_type=worker, got: {agent_type}")
if agent_model != "gpt-5.5":
    raise SystemExit(f"invalid agent_model: {agent_model}")
if agent_route == "default_high" and agent_model != "gpt-5.5":
    raise SystemExit(f"default_high must use gpt-5.5, got: {agent_model}")
if agent_route == "worker_xhigh" and agent_model != "gpt-5.5":
    raise SystemExit(f"worker_xhigh must use gpt-5.5, got: {agent_model}")
if reasoning_target not in {"high", "xhigh"}:
    raise SystemExit(f"invalid reasoning_target: {reasoning_target}")
if route_reason not in {"tier_default", "explicit_override", "safety_escalation"}:
    raise SystemExit(f"invalid route_reason: {route_reason}")
if execution_mode not in {"main_serial", "spawn_default", "spawn_worker"}:
    raise SystemExit(f"invalid execution_mode: {execution_mode}")
if not isinstance(subagent_required, bool):
    raise SystemExit("subagent_required must be boolean")
if runtime_remediation_policy not in {"not_required", "repair_then_retry"}:
    raise SystemExit(f"invalid runtime_remediation_policy: {runtime_remediation_policy}")
if execution_mode == "main_serial" and subagent_required:
    raise SystemExit("main_serial must not require a subagent")
if execution_mode in {"spawn_default", "spawn_worker"} and not subagent_required:
    raise SystemExit(f"{execution_mode} must require a subagent")
if execution_mode == "spawn_default" and agent_type != "default":
    raise SystemExit(f"spawn_default must use agent_type=default, got: {agent_type}")
if execution_mode == "spawn_worker" and agent_type != "worker":
    raise SystemExit(f"spawn_worker must use agent_type=worker, got: {agent_type}")
if subagent_required and runtime_remediation_policy != "repair_then_retry":
    raise SystemExit("subagent-required routes must use runtime_remediation_policy=repair_then_retry")

print(agent_route)
print(agent_type)
print(agent_model)
print(reasoning_target)
print(route_reason)
print(execution_mode)
print("true" if subagent_required else "false")
print(runtime_remediation_policy)
PY
)"
routing_rc=$?
set -e
if [[ "${routing_rc}" -ne 0 ]]; then
  emit_runtime_error "Failed to resolve agent route from ${routing_path} (tier=${frontend_tier}, override=${reasoning_override})."
  exit 2
fi

resolved_agent_route="$(printf '%s\n' "${routing_resolution}" | sed -n '1p')"
resolved_agent_type="$(printf '%s\n' "${routing_resolution}" | sed -n '2p')"
resolved_agent_model="$(printf '%s\n' "${routing_resolution}" | sed -n '3p')"
resolved_reasoning_target="$(printf '%s\n' "${routing_resolution}" | sed -n '4p')"
resolved_route_reason="$(printf '%s\n' "${routing_resolution}" | sed -n '5p')"
resolved_execution_mode="$(printf '%s\n' "${routing_resolution}" | sed -n '6p')"
resolved_subagent_required="$(printf '%s\n' "${routing_resolution}" | sed -n '7p')"
resolved_runtime_remediation_policy="$(printf '%s\n' "${routing_resolution}" | sed -n '8p')"

set +e
preflight_output="$(
  bash "${PREFLIGHT_RUN_SH}" \
    --frontend-tier "${frontend_tier}" \
    --skills "${skills}" \
    --style-authority-path "${style_authority_path}" 2>&1
)"
preflight_rc=$?
set -e

set +e
gate_output="$(
python3 - "${preflight_output}" "${preflight_rc}" "${spec_path}" "${resolved_agent_route}" "${resolved_agent_type}" "${resolved_agent_model}" "${resolved_reasoning_target}" "${resolved_route_reason}" "${resolved_execution_mode}" "${resolved_subagent_required}" "${resolved_runtime_remediation_policy}" "${style_authority_path}" "${style_authority_source}" "${style_authority_mode}" <<'PY'
import json
import hashlib
import sys
from typing import Any
from pathlib import Path

raw = sys.argv[1]
preflight_rc = int(sys.argv[2])
spec_path = Path(sys.argv[3])
agent_route = str(sys.argv[4]).strip()
agent_type = str(sys.argv[5]).strip()
agent_model = str(sys.argv[6]).strip()
reasoning_target = str(sys.argv[7]).strip()
route_reason = str(sys.argv[8]).strip()
execution_mode = str(sys.argv[9]).strip()
subagent_required = str(sys.argv[10]).strip().lower() == "true"
runtime_remediation_policy = str(sys.argv[11]).strip()
style_authority_path = str(sys.argv[12]).strip()
style_authority_source = str(sys.argv[13]).strip() or "none"
style_authority_mode = str(sys.argv[14]).strip() or "none"


def compute_authority_digest(path: str) -> str:
    if not path:
        return ""
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except Exception:  # noqa: BLE001
        return ""


authority_digest = compute_authority_digest(style_authority_path)
style_authority_read_required = bool(style_authority_path)
style_authority_context_required = bool(style_authority_path)
if not style_authority_path:
    style_authority_revision_policy = "none"
elif style_authority_mode == "evolve":
    style_authority_revision_policy = "evolve_current_baseline"
else:
    style_authority_revision_policy = "enforce_current_baseline"


def spawn_agent_intent() -> dict[str, Any]:
    if not subagent_required:
        return {}
    intent: dict[str, Any] = {
        "agent_type": agent_type,
        "model": agent_model,
        "reasoning_effort": reasoning_target,
    }
    if style_authority_path:
        intent.update(
            {
                "style_authority_path": style_authority_path,
                "style_authority_mode": style_authority_mode,
                "style_authority_digest": authority_digest,
                "style_authority_read_required": True,
                "style_authority_context_required": True,
                "style_authority_revision_policy": style_authority_revision_policy,
            }
        )
    return intent

def emit_bootstrap_error(message: str) -> int:
    payload = {
        "ok": False,
        "status": "fail",
        "code": "RUNTIME_ERROR",
        "message": message,
        "normalized_chain": [],
        "preflight_status": "fail",
        "preflight_code": "RUNTIME_ERROR",
        "gate_decision": "deny",
        "agent_route": agent_route,
        "agent_type": agent_type,
        "agent_model": agent_model,
        "reasoning_target": reasoning_target,
        "route_reason": route_reason,
        "execution_mode": execution_mode,
        "subagent_required": subagent_required,
        "spawn_agent_intent": spawn_agent_intent(),
        "runtime_remediation_required": False,
        "runtime_remediation_policy": runtime_remediation_policy,
        "style_authority_path": style_authority_path,
        "style_authority_source": style_authority_source,
        "style_authority_mode": style_authority_mode,
        "style_authority_digest": authority_digest,
        "style_authority_read_required": style_authority_read_required,
        "style_authority_context_required": style_authority_context_required,
        "style_authority_revision_policy": style_authority_revision_policy,
        "has_style_authority_path": bool(style_authority_path),
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 2


try:
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    allowed_status = set(spec["entry_gate"]["allowed_status"])
    allow_status = set(spec["entry_gate"]["allow_status"])
    normalized_codes = set(spec["normalized_error_codes"])
    if not allowed_status or not normalized_codes:
        raise ValueError("allowed_status or normalized_error_codes is empty")
    if not allow_status.issubset(allowed_status):
        raise ValueError("entry_gate.allow_status is not a subset of entry_gate.allowed_status")
except Exception as exc:  # noqa: BLE001
    raise SystemExit(emit_bootstrap_error(f"Invalid preflight spec ({spec_path}): {exc}"))


def emit(
    *,
    status: str,
    code: str,
    message: str,
    normalized_chain: list[str] | None = None,
) -> int:
    chain = normalized_chain if isinstance(normalized_chain, list) else []
    gate_decision = "allow" if status in allow_status else "deny"
    authority_required_now = (
        style_authority_read_required
        or code == "STYLE_AUTHORITY_MISSING"
        or style_authority_mode == "evolve"
    )
    payload = {
        "ok": status in {"pass", "warn"},
        "status": status,
        "code": code,
        "message": message,
        "normalized_chain": chain,
        "preflight_status": status,
        "preflight_code": code,
        "gate_decision": gate_decision,
        "agent_route": agent_route,
        "agent_type": agent_type,
        "agent_model": agent_model,
        "reasoning_target": reasoning_target,
        "route_reason": route_reason,
        "execution_mode": execution_mode,
        "subagent_required": subagent_required,
        "spawn_agent_intent": spawn_agent_intent(),
        "runtime_remediation_required": False,
        "runtime_remediation_policy": runtime_remediation_policy,
        "style_authority_path": style_authority_path,
        "style_authority_source": style_authority_source,
        "style_authority_mode": style_authority_mode,
        "style_authority_digest": authority_digest,
        "style_authority_read_required": authority_required_now,
        "style_authority_context_required": authority_required_now,
        "style_authority_revision_policy": style_authority_revision_policy,
        "has_style_authority_path": bool(style_authority_path),
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0 if gate_decision == "allow" else 2


def extract_json_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return ""
    # Use the last non-empty line to avoid wrapper warnings before JSON payload.
    return lines[-1]


json_line = extract_json_line(raw)
if not json_line:
    raise SystemExit(
        emit(
            status="fail",
            code="RUNTIME_ERROR",
            message=f"Preflight produced empty output (rc={preflight_rc}).",
        )
    )

try:
    payload: dict[str, Any] = json.loads(json_line)
except json.JSONDecodeError:
    trimmed = raw.strip().replace("\n", " | ")
    if len(trimmed) > 400:
        trimmed = trimmed[:400] + "..."
    raise SystemExit(
        emit(
            status="fail",
            code="RUNTIME_ERROR",
            message=f"Preflight output is not valid JSON (rc={preflight_rc}): {trimmed}",
        )
    )

status = str(payload.get("status", "")).strip()
code = str(payload.get("code", "")).strip()
message = str(payload.get("message", "")).strip() or "Preflight result missing message."
normalized_chain = payload.get("normalized_chain")
if not isinstance(normalized_chain, list):
    normalized_chain = []
else:
    normalized_chain = [str(item) for item in normalized_chain]

if status not in allowed_status:
    raise SystemExit(
        emit(
            status="fail",
            code="RUNTIME_ERROR",
            message=f"Invalid preflight status: {status or '<empty>'}",
            normalized_chain=normalized_chain,
        )
    )

if code not in normalized_codes:
    raise SystemExit(
        emit(
            status="fail",
            code="PREFLIGHT_INVALID_CODE",
            message=f"Invalid preflight code: {code or '<empty>'}",
            normalized_chain=normalized_chain,
        )
    )

if status == "fail":
    raise SystemExit(
        emit(
            status="fail",
            code=code,
            message=message,
            normalized_chain=normalized_chain,
        )
    )

raise SystemExit(
    emit(
        status=status,
        code=code,
        message=message,
        normalized_chain=normalized_chain,
    )
)
PY
)"
gate_rc=$?
set -e

echo "${gate_output}"
append_log_jsonl "${gate_output}" "${gate_rc}" "${frontend_tier}" "${skills}" "${style_authority_path}" "${style_authority_source}" "${style_authority_mode}" "${resolved_agent_route}" "${resolved_agent_type}" "${resolved_agent_model}" "${resolved_reasoning_target}" "${resolved_route_reason}" "${resolved_execution_mode}" "${resolved_subagent_required}" "${resolved_runtime_remediation_policy}"

exit "${gate_rc}"
