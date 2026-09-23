#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENTRY_SH="${TOOLS_DIR}/frontend_worker_entry.sh"
ROTATE_SH="${TOOLS_DIR}/frontend_preflight_log_rotate.sh"
SUMMARY_SH="${TOOLS_DIR}/frontend_preflight_log_summary.sh"
REPORT_SH="${TOOLS_DIR}/frontend_preflight_report.sh"
POLICY_RUN_SH="${TOOLS_DIR}/frontend_preflight_policy_run.sh"
POLICY_JSON="${TOOLS_DIR}/frontend_preflight_policy.json"

if [[ ! -x "${ENTRY_SH}" ]]; then
  echo "Entry script not executable: ${ENTRY_SH}" >&2
  exit 2
fi

if [[ ! -x "${ROTATE_SH}" ]]; then
  echo "Rotate script not executable: ${ROTATE_SH}" >&2
  exit 2
fi

if [[ ! -x "${SUMMARY_SH}" ]]; then
  echo "Summary script not executable: ${SUMMARY_SH}" >&2
  exit 2
fi

if [[ ! -x "${REPORT_SH}" ]]; then
  echo "Report script not executable: ${REPORT_SH}" >&2
  exit 2
fi

if [[ ! -x "${POLICY_RUN_SH}" ]]; then
  echo "Policy runner script not executable: ${POLICY_RUN_SH}" >&2
  exit 2
fi

if [[ ! -r "${POLICY_JSON}" ]]; then
  echo "Policy file not found or not readable: ${POLICY_JSON}" >&2
  exit 2
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

valid_authority="${tmpdir}/DESIGN_VALID.md"
invalid_authority="${tmpdir}/DESIGN_INVALID.md"

cat > "${valid_authority}" <<'EOF_AUTH'
# DataHub Unified Design

## Typography System
Readable and practical typography.

## Color Palette
Token-based color definitions.

## Motion Language
Controlled transitions for feedback.

## Component Grammar
Consistent component structure and naming.
EOF_AUTH

cat > "${invalid_authority}" <<'EOF_AUTH'
# DataHub Broken Design

## Typography System
## Color Palette
## Component Grammar
EOF_AUTH

pass_count=0
fail_count=0

run_case() {
  local name="$1"
  local expected_rc="$2"
  local expected_status="$3"
  local expected_code="$4"
  local expected_gate="$5"
  shift 5
  local args=("$@")
  if [[ "${expected_gate}" == "allow" && " ${args[*]} " != *" --style-authority-path "* ]]; then
    args+=(--style-authority-path "${valid_authority}")
  fi

  set +e
  local output
  output="$(FRONTEND_PREFLIGHT_LOG_ENABLED=0 bash "${ENTRY_SH}" "${args[@]}" 2>&1)"
  local rc=$?
  set -e

  local parsed
  if ! parsed="$(python3 - "${output}" <<'PY'
import json
import sys

raw = sys.argv[1]
line = ""
for candidate in [ln.strip() for ln in raw.splitlines() if ln.strip()]:
    line = candidate
if not line:
    print("::parse_error::empty_output")
    sys.exit(3)
try:
    payload = json.loads(line)
except Exception as exc:  # noqa: BLE001
    print(f"::parse_error::{exc}")
    sys.exit(3)
status = str(payload.get("status", ""))
code = str(payload.get("code", ""))
gate = str(payload.get("gate_decision", ""))
print(f"{status}\t{code}\t{gate}")
PY
)"; then
    echo "✗ ${name}"
    echo "  expected: rc=${expected_rc}, status=${expected_status}, code=${expected_code}, gate=${expected_gate}"
    echo "  actual:   rc=${rc}, output=${output}"
    fail_count=$((fail_count + 1))
    return
  fi

  local status code gate
  status="$(printf '%s' "${parsed}" | cut -f1)"
  code="$(printf '%s' "${parsed}" | cut -f2)"
  gate="$(printf '%s' "${parsed}" | cut -f3)"

  if [[ "${rc}" == "${expected_rc}" && "${status}" == "${expected_status}" && "${code}" == "${expected_code}" && "${gate}" == "${expected_gate}" ]]; then
    echo "✓ ${name}"
    pass_count=$((pass_count + 1))
  else
    echo "✗ ${name}"
    echo "  expected: rc=${expected_rc}, status=${expected_status}, code=${expected_code}, gate=${expected_gate}"
    echo "  actual:   rc=${rc}, status=${status}, code=${code}, gate=${gate}"
    echo "  raw: ${output}"
    fail_count=$((fail_count + 1))
  fi
}

run_case "L1-F pass" 0 pass OK allow \
  --frontend-tier L1-F \
  --skills design-taste-frontend

run_case "L1-F warn with frontend-skill" 0 warn L1F_CHAIN_WARNING allow \
  --frontend-tier L1-F \
  --skills design-taste-frontend,frontend-skill

run_case "L1-F warn with image-to-code" 0 warn L1F_CHAIN_WARNING allow \
  --frontend-tier L1-F \
  --skills design-taste-frontend,image-to-code

run_case "L1-F warn with gpt-taste" 0 warn L1F_CHAIN_WARNING allow \
  --frontend-tier L1-F \
  --skills design-taste-frontend,gpt-taste

run_case "L1-F warn with redesign skill" 0 warn L1F_CHAIN_WARNING allow \
  --frontend-tier L1-F \
  --skills design-taste-frontend,redesign-existing-projects

run_case "L1-F warn with imagegen frontend web" 0 warn L1F_CHAIN_WARNING allow \
  --frontend-tier L1-F \
  --skills design-taste-frontend,imagegen-frontend-web

run_case "L1-F warn with imagegen frontend mobile" 0 warn L1F_CHAIN_WARNING allow \
  --frontend-tier L1-F \
  --skills design-taste-frontend,imagegen-frontend-mobile

run_case "L1-F warn with brandkit" 0 warn L1F_CHAIN_WARNING allow \
  --frontend-tier L1-F \
  --skills design-taste-frontend,brandkit

run_case "L1-F missing baseline" 2 fail BASELINE_SKILL_MISSING deny \
  --frontend-tier L1-F \
  --skills frontend-skill

run_case "L1-V missing frontend-skill" 2 fail FRONTEND_SKILL_REQUIRED deny \
  --frontend-tier L1-V \
  --skills design-taste-frontend

run_case "L1-V imagegen frontend web pass" 0 pass OK allow \
  --frontend-tier L1-V \
  --skills design-taste-frontend,frontend-skill,imagegen-frontend-web

run_case "L1-V image-to-code pass" 0 pass OK allow \
  --frontend-tier L1-V \
  --skills design-taste-frontend,frontend-skill,image-to-code

run_case "L2 missing style skill" 2 fail STYLE_SKILL_REQUIRED deny \
  --frontend-tier L2 \
  --skills design-taste-frontend,frontend-skill

run_case "L2 imagegen does not satisfy style skill" 2 fail STYLE_SKILL_REQUIRED deny \
  --frontend-tier L2 \
  --skills design-taste-frontend,frontend-skill,imagegen-frontend-web

run_case "L2 image-to-code does not satisfy style skill" 2 fail STYLE_SKILL_REQUIRED deny \
  --frontend-tier L2 \
  --skills design-taste-frontend,frontend-skill,image-to-code

run_case "L2 mutex style conflict" 2 fail STYLE_MUTEX_CONFLICT deny \
  --frontend-tier L2 \
  --skills design-taste-frontend,frontend-skill,high-end-visual-design,minimalist-ui

run_case "L2 gpt-taste pass" 0 pass OK allow \
  --frontend-tier L2 \
  --skills design-taste-frontend,frontend-skill,gpt-taste

run_case "L2 high-end with imagegen pass" 0 pass OK allow \
  --frontend-tier L2 \
  --skills design-taste-frontend,frontend-skill,high-end-visual-design,imagegen-frontend-web

run_case "L2 high-end with imagegen and image-to-code pass" 0 pass OK allow \
  --frontend-tier L2 \
  --skills design-taste-frontend,frontend-skill,high-end-visual-design,imagegen-frontend-web,image-to-code

run_case "L2 gpt-taste mutex conflict" 2 fail STYLE_MUTEX_CONFLICT deny \
  --frontend-tier L2 \
  --skills design-taste-frontend,frontend-skill,gpt-taste,high-end-visual-design

set +e
stitch_missing_output="$(
  FRONTEND_STYLE_AUTHORITY_AUTO=0 \
  FRONTEND_PREFLIGHT_LOG_ENABLED=0 \
  bash "${ENTRY_SH}" \
    --frontend-tier L1-F \
    --skills design-taste-frontend,stitch-design-taste 2>&1
)"
stitch_missing_rc=$?
set -e

if [[ "${stitch_missing_rc}" -eq 2 ]] && python3 - "${stitch_missing_output}" <<'PY'
import json
import sys

line = [ln.strip() for ln in sys.argv[1].splitlines() if ln.strip()][-1]
payload = json.loads(line)
if payload.get("preflight_status") != "fail":
    raise SystemExit(1)
if payload.get("preflight_code") != "STYLE_AUTHORITY_MISSING":
    raise SystemExit(1)
if payload.get("gate_decision") != "deny":
    raise SystemExit(1)
PY
then
  echo "✓ stitch missing authority"
  pass_count=$((pass_count + 1))
else
  echo "✗ stitch missing authority"
  echo "  expected: rc=2, status=fail, code=STYLE_AUTHORITY_MISSING, gate=deny"
  echo "  actual:   rc=${stitch_missing_rc}, output=${stitch_missing_output}"
  fail_count=$((fail_count + 1))
fi

run_case "stitch invalid authority headings" 2 fail STYLE_AUTHORITY_MISSING deny \
  --frontend-tier L1-F \
  --skills design-taste-frontend,stitch-design-taste \
  --style-authority-path "${invalid_authority}"

run_case "stitch valid authority headings" 0 pass OK allow \
  --frontend-tier L1-F \
  --skills design-taste-frontend,stitch-design-taste \
  --style-authority-path "${valid_authority}"

run_case "L1-V explicit authority validates headings" 0 pass OK allow \
  --frontend-tier L1-V \
  --skills design-taste-frontend,frontend-skill \
  --style-authority-path "${valid_authority}"

run_case "L1-V explicit authority rejects invalid headings" 2 fail STYLE_AUTHORITY_MISSING deny \
  --frontend-tier L1-V \
  --skills design-taste-frontend,frontend-skill \
  --style-authority-path "${invalid_authority}"

set +e
required_authority_output="$(
  FRONTEND_STYLE_AUTHORITY_AUTO=0 \
  FRONTEND_PREFLIGHT_LOG_ENABLED=0 \
  bash "${ENTRY_SH}" \
    --frontend-tier L1-V \
    --skills design-taste-frontend,frontend-skill 2>&1
)"
required_authority_rc=$?
set -e

if [[ "${required_authority_rc}" -eq 2 ]] && python3 - "${required_authority_output}" <<'PY'
import json
import sys

line = [ln.strip() for ln in sys.argv[1].splitlines() if ln.strip()][-1]
payload = json.loads(line)
if payload.get("preflight_status") != "fail":
    raise SystemExit(1)
if payload.get("preflight_code") != "STYLE_AUTHORITY_MISSING":
    raise SystemExit(1)
if payload.get("gate_decision") != "deny":
    raise SystemExit(1)
PY
then
  echo "✓ L1-V default required authority missing"
  pass_count=$((pass_count + 1))
else
  echo "✗ L1-V default required authority missing"
  echo "  expected: rc=2, status=fail, code=STYLE_AUTHORITY_MISSING, gate=deny"
  echo "  actual:   rc=${required_authority_rc}, output=${required_authority_output}"
  fail_count=$((fail_count + 1))
fi

log_file="${tmpdir}/frontend_preflight_events.jsonl"
set +e
FRONTEND_PREFLIGHT_LOG_ENABLED=1 \
FRONTEND_PREFLIGHT_LOG_PATH="${log_file}" \
bash "${ENTRY_SH}" --frontend-tier L1-F --skills design-taste-frontend --style-authority-path "${valid_authority}" >/dev/null 2>&1
log_rc=$?
set -e

if [[ "${log_rc}" -ne 0 ]]; then
  echo "✗ logging smoke"
  echo "  expected: rc=0"
  echo "  actual:   rc=${log_rc}"
  fail_count=$((fail_count + 1))
elif [[ ! -f "${log_file}" ]]; then
  echo "✗ logging smoke"
  echo "  expected: log file exists at ${log_file}"
  fail_count=$((fail_count + 1))
else
  if python3 - "${log_file}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
if not lines:
    raise SystemExit(1)
event = json.loads(lines[-1])
required = {
    "ts_utc",
    "source",
    "frontend_tier",
    "skills",
    "preflight_status",
    "preflight_code",
    "gate_decision",
    "entry_exit_code",
    "agent_route",
    "agent_type",
    "agent_model",
    "reasoning_target",
    "route_reason",
    "execution_mode",
    "subagent_required",
    "runtime_remediation_policy",
    "runtime_remediation_required",
    "spawn_agent_intent",
    "style_authority_digest",
    "style_authority_read_required",
    "style_authority_context_required",
    "style_authority_revision_policy",
}
missing = sorted(required - set(event))
if missing:
    raise SystemExit(1)
if event["frontend_tier"] != "L1-F":
    raise SystemExit(1)
if event["preflight_code"] != "OK":
    raise SystemExit(1)
if event["gate_decision"] != "allow":
    raise SystemExit(1)
if event["agent_route"] != "default_high":
    raise SystemExit(1)
if event["agent_type"] != "default":
    raise SystemExit(1)
if event["agent_model"] != "gpt-5.5":
    raise SystemExit(1)
if event["reasoning_target"] != "high":
    raise SystemExit(1)
if event["route_reason"] != "tier_default":
    raise SystemExit(1)
if event["execution_mode"] != "spawn_default":
    raise SystemExit(1)
if event["subagent_required"] is not True:
    raise SystemExit(1)
if event["runtime_remediation_policy"] != "repair_then_retry":
    raise SystemExit(1)
if event["runtime_remediation_required"] is not False:
    raise SystemExit(1)
if event["spawn_agent_intent"].get("agent_type") != "default":
    raise SystemExit(1)
if event.get("style_authority_path"):
    if len(str(event.get("style_authority_digest", ""))) != 64:
        raise SystemExit(1)
    if event.get("style_authority_read_required") is not True:
        raise SystemExit(1)
    if event.get("style_authority_context_required") is not True:
        raise SystemExit(1)
    if event.get("style_authority_revision_policy") not in {"enforce_current_baseline", "evolve_current_baseline"}:
        raise SystemExit(1)
    if event["spawn_agent_intent"].get("style_authority_path") != event.get("style_authority_path"):
        raise SystemExit(1)
if event.get("style_authority_mode") not in {"none", "enforce"}:
    raise SystemExit(1)
PY
  then
    echo "✓ logging smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ logging smoke"
    echo "  expected: valid JSONL event with tier/code/gate fields"
    echo "  actual:   $(cat "${log_file}")"
    fail_count=$((fail_count + 1))
  fi
fi

route_override_json="${tmpdir}/route_override.json"
if FRONTEND_PREFLIGHT_LOG_ENABLED=0 bash "${ENTRY_SH}" \
  --frontend-tier L1-F \
  --skills design-taste-frontend \
  --reasoning-override xhigh \
  --style-authority-path "${valid_authority}" > "${route_override_json}"; then
  if python3 - "${route_override_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8").strip())
if payload.get("agent_route") != "worker_xhigh":
    raise SystemExit(1)
if payload.get("agent_type") != "worker":
    raise SystemExit(1)
if payload.get("agent_model") != "gpt-5.5":
    raise SystemExit(1)
if payload.get("reasoning_target") != "xhigh":
    raise SystemExit(1)
if payload.get("route_reason") != "explicit_override":
    raise SystemExit(1)
if payload.get("execution_mode") != "spawn_worker":
    raise SystemExit(1)
if payload.get("subagent_required") is not True:
    raise SystemExit(1)
if payload.get("runtime_remediation_policy") != "repair_then_retry":
    raise SystemExit(1)
if payload.get("spawn_agent_intent", {}).get("agent_type") != "worker":
    raise SystemExit(1)
if payload.get("style_authority_path"):
    if payload.get("spawn_agent_intent", {}).get("style_authority_path") != payload.get("style_authority_path"):
        raise SystemExit(1)
    if payload.get("spawn_agent_intent", {}).get("style_authority_read_required") is not True:
        raise SystemExit(1)
PY
  then
    echo "✓ route override xhigh smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ route override xhigh smoke"
    echo "  expected: --reasoning-override xhigh routes to worker_xhigh"
    cat "${route_override_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ route override xhigh smoke"
  echo "  expected: entry command succeeds"
  fail_count=$((fail_count + 1))
fi

route_l2_json="${tmpdir}/route_l2.json"
if FRONTEND_PREFLIGHT_LOG_ENABLED=0 bash "${ENTRY_SH}" \
  --frontend-tier L2 \
  --skills design-taste-frontend,frontend-skill,minimalist-ui \
  --style-authority-path "${valid_authority}" > "${route_l2_json}"; then
  if python3 - "${route_l2_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8").strip())
if payload.get("agent_route") != "worker_xhigh":
    raise SystemExit(1)
if payload.get("agent_type") != "worker":
    raise SystemExit(1)
if payload.get("agent_model") != "gpt-5.5":
    raise SystemExit(1)
if payload.get("reasoning_target") != "xhigh":
    raise SystemExit(1)
if payload.get("route_reason") != "tier_default":
    raise SystemExit(1)
if payload.get("execution_mode") != "spawn_worker":
    raise SystemExit(1)
if payload.get("subagent_required") is not True:
    raise SystemExit(1)
if payload.get("runtime_remediation_policy") != "repair_then_retry":
    raise SystemExit(1)
if payload.get("spawn_agent_intent", {}).get("agent_type") != "worker":
    raise SystemExit(1)
if payload.get("style_authority_path"):
    if payload.get("spawn_agent_intent", {}).get("style_authority_path") != payload.get("style_authority_path"):
        raise SystemExit(1)
    if len(str(payload.get("style_authority_digest", ""))) != 64:
        raise SystemExit(1)
PY
  then
    echo "✓ route L2 default xhigh smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ route L2 default xhigh smoke"
    echo "  expected: L2 defaults to worker_xhigh"
    cat "${route_l2_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ route L2 default xhigh smoke"
  echo "  expected: entry command succeeds"
  fail_count=$((fail_count + 1))
fi

authority_mode_json="${tmpdir}/authority_mode.json"
if FRONTEND_PREFLIGHT_LOG_ENABLED=0 \
  FRONTEND_STYLE_AUTHORITY_MODE=evolve \
  bash "${ENTRY_SH}" \
    --frontend-tier L1-V \
    --skills design-taste-frontend,frontend-skill \
    --style-authority-path "${valid_authority}" > "${authority_mode_json}"; then
  if python3 - "${authority_mode_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8").strip())
if payload.get("preflight_code") != "OK":
    raise SystemExit(1)
if payload.get("style_authority_mode") != "evolve":
    raise SystemExit(1)
if payload.get("style_authority_source") != "explicit":
    raise SystemExit(1)
PY
  then
    echo "✓ authority mode evolve smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ authority mode evolve smoke"
    echo "  expected: entry payload reports style_authority_mode=evolve"
    cat "${authority_mode_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ authority mode evolve smoke"
  echo "  expected: entry command succeeds"
  fail_count=$((fail_count + 1))
fi

authority_project="${tmpdir}/authority_project"
mkdir -p "${authority_project}/src/pages"
cp "${valid_authority}" "${authority_project}/DESIGN.md"
authority_entry_json="${tmpdir}/authority_entry.json"
if (
  cd "${authority_project}/src/pages"
  FRONTEND_PREFLIGHT_LOG_ENABLED=0 bash "${ENTRY_SH}" \
    --frontend-tier L1-V \
    --skills design-taste-frontend,frontend-skill
) > "${authority_entry_json}"; then
  if python3 - "${authority_entry_json}" "${authority_project}/DESIGN.md" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8").strip())
expected = str(Path(sys.argv[2]).resolve())
if payload.get("preflight_code") != "OK":
    raise SystemExit(1)
if payload.get("style_authority_path") != expected:
    raise SystemExit(1)
if payload.get("style_authority_source") != "auto":
    raise SystemExit(1)
if payload.get("has_style_authority_path") is not True:
    raise SystemExit(1)
PY
  then
    echo "✓ auto DESIGN.md discovery smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ auto DESIGN.md discovery smoke"
    echo "  expected: discovered parent DESIGN.md in entry payload"
    cat "${authority_entry_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ auto DESIGN.md discovery smoke"
  echo "  expected: entry command succeeds with discovered authority"
  cat "${authority_entry_json}" || true
  fail_count=$((fail_count + 1))
fi

rotate_log="${tmpdir}/rotate/frontend_preflight_events.jsonl"
mkdir -p "$(dirname "${rotate_log}")"

# Seed with one large line; first rotation should happen on the next append.
python3 - "${rotate_log}" <<'PY'
from pathlib import Path
import json
import sys

path = Path(sys.argv[1])
payload = {"seed": "x" * 1200}
path.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
PY

for _ in 1 2 3; do
  FRONTEND_PREFLIGHT_LOG_ENABLED=1 \
  FRONTEND_PREFLIGHT_LOG_PATH="${rotate_log}" \
  FRONTEND_PREFLIGHT_LOG_MAX_BYTES=256 \
  FRONTEND_PREFLIGHT_LOG_KEEP=2 \
  bash "${ENTRY_SH}" --frontend-tier L1-F --skills design-taste-frontend --style-authority-path "${valid_authority}" >/dev/null
done

if python3 - "${rotate_log}" <<'PY'
from pathlib import Path
import sys

log_path = Path(sys.argv[1])
rotated = sorted(log_path.parent.glob(log_path.name + ".20*Z*"))
if not log_path.exists():
    raise SystemExit(1)
if len(rotated) < 1:
    raise SystemExit(1)
if len(rotated) > 2:
    raise SystemExit(1)
PY
then
  echo "✓ rotate smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ rotate smoke"
  echo "  expected: log rotated and retained <= 2 files"
  echo "  actual files:"
  ls -l "${tmpdir}/rotate" || true
  fail_count=$((fail_count + 1))
fi

summary_out="${tmpdir}/summary.txt"
if bash "${SUMMARY_SH}" --log-path "${rotate_log}" --days 365 --top 3 > "${summary_out}"; then
  if grep -En "Events in window:|Gate decision:|Top 3 preflight codes:|Tier deny-rate:" "${summary_out}" >/dev/null; then
    echo "✓ summary smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary smoke"
    echo "  expected: summary output contains key sections"
    echo "  actual:"
    cat "${summary_out}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary smoke"
  echo "  expected: summary command succeeds"
  fail_count=$((fail_count + 1))
fi

summary_json="${tmpdir}/summary.json"
if bash "${SUMMARY_SH}" --log-path "${rotate_log}" --days 365 --top 3 --json > "${summary_json}"; then
  if python3 - "${summary_json}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = json.loads(path.read_text(encoding="utf-8"))
if "ok" not in payload:
    raise SystemExit(1)
summary = payload.get("summary", {})
required = {"events_in_window", "gate", "top_codes", "checks", "daily_breakdown", "tier_gate"}
if not required.issubset(set(summary)):
    raise SystemExit(1)
for key in ["agent_route_distribution", "agent_type_distribution", "reasoning_distribution", "route_reason_distribution"]:
    if key not in summary:
        raise SystemExit(1)
PY
  then
    echo "✓ summary json smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary json smoke"
    echo "  expected: --json output contains expected keys"
    echo "  actual:"
    cat "${summary_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary json smoke"
  echo "  expected: summary --json command succeeds"
  fail_count=$((fail_count + 1))
fi

parse_quality_log="${tmpdir}/parse_quality/frontend_preflight_events.jsonl"
mkdir -p "$(dirname "${parse_quality_log}")"
python3 - "${parse_quality_log}" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
rows = [
    "{bad json",
    json.dumps(
        {
            "ts_utc": "invalid-ts",
            "source": "frontend_worker_entry.sh",
            "context": "prod",
            "frontend_tier": "L1-F",
            "skills": ["design-taste-frontend"],
            "preflight_status": "pass",
            "preflight_code": "OK",
            "gate_decision": "allow",
            "entry_exit_code": 0,
            "ok": True,
        },
        ensure_ascii=False,
    ),
    json.dumps(
        {
            "ts_utc": "2020-01-01T00:00:00+00:00",
            "source": "frontend_worker_entry.sh",
            "context": "prod",
            "frontend_tier": "L1-F",
            "skills": ["design-taste-frontend"],
            "preflight_status": "pass",
            "preflight_code": "OK",
            "gate_decision": "allow",
            "entry_exit_code": 0,
            "ok": True,
        },
        ensure_ascii=False,
    ),
    json.dumps(
        {
            "ts_utc": "2026-03-06T10:00:00+00:00",
            "source": "frontend_worker_entry.sh",
            "context": "ci",
            "frontend_tier": "L1-F",
            "skills": ["design-taste-frontend"],
            "preflight_status": "fail",
            "preflight_code": "STYLE_SKILL_REQUIRED",
            "gate_decision": "deny",
            "entry_exit_code": 2,
            "ok": False,
        },
        ensure_ascii=False,
    ),
    json.dumps(
        {
            "ts_utc": "2026-03-06T11:00:00+00:00",
            "source": "frontend_worker_entry.sh",
            "context": "prod",
            "frontend_tier": "L1-F",
            "skills": ["design-taste-frontend"],
            "preflight_status": "pass",
            "preflight_code": "OK",
            "gate_decision": "allow",
            "entry_exit_code": 0,
            "ok": True,
        },
        ensure_ascii=False,
    ),
]
path.write_text("\n".join(rows) + "\n", encoding="utf-8")
PY

parse_quality_json="${tmpdir}/parse_quality.json"
if bash "${SUMMARY_SH}" --log-path "${parse_quality_log}" --days 365 --top 3 --context prod --json > "${parse_quality_json}"; then
  if python3 - "${parse_quality_json}" <<'PY'
import json
import math
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
summary = payload.get("summary", {})
if int(summary.get("events_in_window", 0)) != 1:
    raise SystemExit(1)
pq = summary.get("parse_quality", {})
expected = {
    "invalid_json_lines": 1,
    "invalid_ts_lines": 1,
    "filtered_out_of_window": 1,
    "filtered_by_context": 1,
}
for key, val in expected.items():
    if int(pq.get(key, -1)) != val:
        raise SystemExit(1)
rate = float(pq.get("parse_error_rate_pct", -1))
if not math.isclose(rate, 40.0, rel_tol=0.0, abs_tol=0.001):
    raise SystemExit(1)
PY
  then
    echo "✓ summary parse-quality smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary parse-quality smoke"
    echo "  expected: parse_quality counters and rate are accurate"
    cat "${parse_quality_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary parse-quality smoke"
  echo "  expected: summary command succeeds"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${SUMMARY_SH}" \
  --log-path "${parse_quality_log}" \
  --days 365 \
  --top 3 \
  --context prod \
  --max-parse-error-rate-pct 20 \
  --parse-error-action fail >/dev/null 2>&1
summary_parse_quality_fail_rc=$?
set -e
if [[ "${summary_parse_quality_fail_rc}" -eq 2 ]]; then
  echo "✓ summary parse-quality threshold fail smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary parse-quality threshold fail smoke"
  echo "  expected: rc=2 when parse_error_rate threshold triggers with action=fail"
  echo "  actual:   rc=${summary_parse_quality_fail_rc}"
  fail_count=$((fail_count + 1))
fi

summary_parse_quality_warn_json="${tmpdir}/summary_parse_quality_warn.json"
if bash "${SUMMARY_SH}" \
  --log-path "${parse_quality_log}" \
  --days 365 \
  --top 3 \
  --context prod \
  --max-parse-error-rate-pct 20 \
  --parse-error-action warn \
  --json > "${summary_parse_quality_warn_json}"; then
  if python3 - "${summary_parse_quality_warn_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if not payload.get("ok", False):
    raise SystemExit(1)
warnings = payload.get("summary", {}).get("checks", {}).get("warnings", [])
if not warnings:
    raise SystemExit(1)
if warnings[0].get("type") != "parse_quality":
    raise SystemExit(1)
PY
  then
    echo "✓ summary parse-quality threshold warn smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary parse-quality threshold warn smoke"
    echo "  expected: parse_quality warning is emitted"
    cat "${summary_parse_quality_warn_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary parse-quality threshold warn smoke"
  echo "  expected: summary command succeeds for warn action"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${SUMMARY_SH}" --log-path "${rotate_log}" --days 365 --top 3 --fail-on-code OK:1 >/dev/null 2>&1
summary_fail_rc=$?
set -e
if [[ "${summary_fail_rc}" -eq 2 ]]; then
  echo "✓ summary threshold fail smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary threshold fail smoke"
  echo "  expected: rc=2 when fail-on-code triggers"
  echo "  actual:   rc=${summary_fail_rc}"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${SUMMARY_SH}" --log-path "${rotate_log}" --days 365 --top 3 --fail-on-code NON_EXISTING_CODE:1 >/dev/null 2>&1
summary_pass_rc=$?
set -e
if [[ "${summary_pass_rc}" -eq 0 ]]; then
  echo "✓ summary threshold pass smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary threshold pass smoke"
  echo "  expected: rc=0 when threshold not triggered"
  echo "  actual:   rc=${summary_pass_rc}"
  fail_count=$((fail_count + 1))
fi

metrics_log="${tmpdir}/metrics/frontend_preflight_events.jsonl"
mkdir -p "$(dirname "${metrics_log}")"
python3 - "${metrics_log}" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
rows = []

# 3 consecutive days with increasing deny-rate for L1-F: 20% -> 40% -> 70%
plan = [
    ("2026-03-01", 8, 2),
    ("2026-03-02", 6, 4),
    ("2026-03-03", 3, 7),
]
for day, allow_count, deny_count in plan:
    for i in range(allow_count):
        rows.append(
            {
                "ts_utc": f"{day}T10:{i:02d}:00+00:00",
                "source": "frontend_worker_entry.sh",
                "frontend_tier": "L1-F",
                "skills": ["design-taste-frontend"],
                "preflight_status": "pass",
                "preflight_code": "OK",
                "gate_decision": "allow",
                "entry_exit_code": 0,
                "ok": True,
            }
        )
    for i in range(deny_count):
        rows.append(
            {
                "ts_utc": f"{day}T11:{i:02d}:00+00:00",
                "source": "frontend_worker_entry.sh",
                "frontend_tier": "L1-F",
                "skills": ["frontend-skill"],
                "preflight_status": "fail",
                "preflight_code": "BASELINE_SKILL_MISSING",
                "gate_decision": "deny",
                "entry_exit_code": 2,
                "ok": False,
            }
        )

# Add a stable L2 slice for tier distribution sanity.
for i in range(5):
    rows.append(
        {
            "ts_utc": f"2026-03-03T12:{i:02d}:00+00:00",
            "source": "frontend_worker_entry.sh",
            "frontend_tier": "L2",
            "skills": ["design-taste-frontend", "frontend-skill", "minimalist-ui"],
            "preflight_status": "pass",
            "preflight_code": "OK",
            "gate_decision": "allow",
            "entry_exit_code": 0,
            "ok": True,
        }
    )

path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
PY

set +e
bash "${SUMMARY_SH}" --log-path "${metrics_log}" --days 365 --top 3 --fail-on-tier-deny-rate L1-F:40 >/dev/null 2>&1
summary_tier_fail_rc=$?
set -e
if [[ "${summary_tier_fail_rc}" -eq 2 ]]; then
  echo "✓ summary tier threshold fail smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary tier threshold fail smoke"
  echo "  expected: rc=2 when tier deny threshold triggers"
  echo "  actual:   rc=${summary_tier_fail_rc}"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${SUMMARY_SH}" --log-path "${metrics_log}" --days 365 --top 3 --fail-on-tier-deny-rate L1-F:60 >/dev/null 2>&1
summary_tier_pass_rc=$?
set -e
if [[ "${summary_tier_pass_rc}" -eq 0 ]]; then
  echo "✓ summary tier threshold pass smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary tier threshold pass smoke"
  echo "  expected: rc=0 when tier deny threshold not triggered"
  echo "  actual:   rc=${summary_tier_pass_rc}"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${SUMMARY_SH}" --log-path "${metrics_log}" --days 365 --top 3 --fail-on-deny-trend 3 --trend-min-events 5 --trend-min-step-pct 1 >/dev/null 2>&1
summary_trend_fail_rc=$?
set -e
if [[ "${summary_trend_fail_rc}" -eq 2 ]]; then
  echo "✓ summary trend fail smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary trend fail smoke"
  echo "  expected: rc=2 when overall trend triggers"
  echo "  actual:   rc=${summary_trend_fail_rc}"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${SUMMARY_SH}" --log-path "${metrics_log}" --days 365 --top 3 --fail-on-tier-deny-trend L1-F:3 --trend-min-events 5 --trend-min-step-pct 1 >/dev/null 2>&1
summary_tier_trend_fail_rc=$?
set -e
if [[ "${summary_tier_trend_fail_rc}" -eq 2 ]]; then
  echo "✓ summary tier trend fail smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary tier trend fail smoke"
  echo "  expected: rc=2 when tier trend triggers"
  echo "  actual:   rc=${summary_tier_trend_fail_rc}"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${SUMMARY_SH}" --log-path "${metrics_log}" --days 365 --top 3 --fail-on-deny-trend 3 --trend-min-events 5 --trend-min-step-pct 50 >/dev/null 2>&1
summary_trend_pass_rc=$?
set -e
if [[ "${summary_trend_pass_rc}" -eq 0 ]]; then
  echo "✓ summary trend pass smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary trend pass smoke"
  echo "  expected: rc=0 when trend min-step is too high"
  echo "  actual:   rc=${summary_trend_pass_rc}"
  fail_count=$((fail_count + 1))
fi

report_day_out="${tmpdir}/report_day.txt"
if bash "${REPORT_SH}" --log-path "${metrics_log}" --days 365 --top 2 --period day > "${report_day_out}"; then
  if grep -En "Daily:|2026-03-01|deny_rate=|top=" "${report_day_out}" >/dev/null; then
    echo "✓ report day smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ report day smoke"
    echo "  expected: daily report contains day-level rows"
    cat "${report_day_out}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ report day smoke"
  echo "  expected: report command succeeds"
  fail_count=$((fail_count + 1))
fi

report_week_json="${tmpdir}/report_week.json"
if bash "${REPORT_SH}" --log-path "${metrics_log}" --days 365 --top 2 --period week --json > "${report_week_json}"; then
  if python3 - "${report_week_json}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = json.loads(path.read_text(encoding="utf-8"))
if payload.get("period") != "week":
    raise SystemExit(1)
rows = payload.get("rows", [])
if not rows:
    raise SystemExit(1)
row = rows[0]
required = {"bucket", "events", "deny_rate_pct", "top_codes"}
if not required.issubset(set(row)):
    raise SystemExit(1)
PY
  then
    echo "✓ report week json smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ report week json smoke"
    echo "  expected: weekly JSON report has required fields"
    cat "${report_week_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ report week json smoke"
  echo "  expected: report --json command succeeds"
  fail_count=$((fail_count + 1))
fi

context_log="${tmpdir}/context/frontend_preflight_events.jsonl"
mkdir -p "$(dirname "${context_log}")"
python3 - "${context_log}" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
rows = []

for i in range(3):
    rows.append(
        {
            "ts_utc": f"2026-03-04T10:{i:02d}:00+00:00",
            "source": "frontend_worker_entry.sh",
            "context": "prod",
            "frontend_tier": "L1-F",
            "skills": ["design-taste-frontend"],
            "preflight_status": "pass",
            "preflight_code": "OK",
            "gate_decision": "allow",
            "entry_exit_code": 0,
            "ok": True,
        }
    )

rows.append(
    {
        "ts_utc": "2026-03-04T11:00:00+00:00",
        "source": "frontend_worker_entry.sh",
        "context": "prod",
        "frontend_tier": "L1-F",
        "skills": ["frontend-skill"],
        "preflight_status": "fail",
        "preflight_code": "BASELINE_SKILL_MISSING",
        "gate_decision": "deny",
        "entry_exit_code": 2,
        "ok": False,
    }
)

for i in range(3):
    rows.append(
        {
            "ts_utc": f"2026-03-04T12:{i:02d}:00+00:00",
            "source": "frontend_worker_entry.sh",
            "context": "ci",
            "frontend_tier": "L2",
            "skills": ["design-taste-frontend", "frontend-skill"],
            "preflight_status": "fail",
            "preflight_code": "STYLE_SKILL_REQUIRED",
            "gate_decision": "deny",
            "entry_exit_code": 2,
            "ok": False,
        }
    )

path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
PY

set +e
bash "${SUMMARY_SH}" --log-path "${context_log}" --days 365 --top 3 --context prod --fail-on-deny-rate 30 >/dev/null 2>&1
context_prod_rc=$?
set -e
if [[ "${context_prod_rc}" -eq 0 ]]; then
  echo "✓ summary context prod pass smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary context prod pass smoke"
  echo "  expected: rc=0 for context=prod with deny-rate below threshold"
  echo "  actual:   rc=${context_prod_rc}"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${SUMMARY_SH}" --log-path "${context_log}" --days 365 --top 3 --context ci --fail-on-deny-rate 30 >/dev/null 2>&1
context_ci_rc=$?
set -e
if [[ "${context_ci_rc}" -eq 2 ]]; then
  echo "✓ summary context ci fail smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary context ci fail smoke"
  echo "  expected: rc=2 for context=ci with deny-rate above threshold"
  echo "  actual:   rc=${context_ci_rc}"
  fail_count=$((fail_count + 1))
fi

context_report_json="${tmpdir}/context_report.json"
if bash "${REPORT_SH}" --log-path "${context_log}" --days 365 --top 2 --period day --context prod --json > "${context_report_json}"; then
  if python3 - "${context_report_json}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = json.loads(path.read_text(encoding="utf-8"))
if payload.get("contexts") != ["prod"]:
    raise SystemExit(1)
rows = payload.get("rows", [])
if not rows:
    raise SystemExit(1)
events = sum(int(row.get("events", 0)) for row in rows)
if events != 4:
    raise SystemExit(1)
PY
  then
    echo "✓ report context filter smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ report context filter smoke"
    echo "  expected: report --context only includes prod rows"
    cat "${context_report_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ report context filter smoke"
  echo "  expected: report --context command succeeds"
  fail_count=$((fail_count + 1))
fi

policy_fail_json="${tmpdir}/policy_fail.json"
cat > "${policy_fail_json}" <<'EOF_POLICY'
{
  "version": 1,
  "window": {
    "days": 365,
    "top": 3
  },
  "thresholds": {
    "deny_rate_pct": 30,
    "tier_deny_rate_pct": {
      "L1-F": 40
    },
    "deny_trend_days": 3,
    "tier_deny_trend_days": {
      "L1-F": 3
    },
    "trend_min_events": 5,
    "trend_min_step_pct": 1
  }
}
EOF_POLICY

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_fail_json}" --log-path "${metrics_log}" >/dev/null 2>&1
policy_fail_rc=$?
set -e
if [[ "${policy_fail_rc}" -eq 2 ]]; then
  echo "✓ policy fail smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy fail smoke"
  echo "  expected: rc=2 when policy thresholds trigger"
  echo "  actual:   rc=${policy_fail_rc}"
  fail_count=$((fail_count + 1))
fi

policy_pass_json="${tmpdir}/policy_pass.json"
cat > "${policy_pass_json}" <<'EOF_POLICY'
{
  "version": 1,
  "window": {
    "days": 365,
    "top": 3
  },
  "thresholds": {
    "deny_rate_pct": 90,
    "codes": [
      {
        "code": "NON_EXISTING_CODE",
        "min_count": 2
      }
    ],
    "tier_deny_rate_pct": {
      "L1-F": 90
    },
    "deny_trend_days": 3,
    "tier_deny_trend_days": {
      "L1-F": 3
    },
    "trend_min_events": 5,
    "trend_min_step_pct": 50
  }
}
EOF_POLICY

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_pass_json}" --log-path "${metrics_log}" >/dev/null 2>&1
policy_pass_rc=$?
set -e
if [[ "${policy_pass_rc}" -eq 0 ]]; then
  echo "✓ policy pass smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy pass smoke"
  echo "  expected: rc=0 when policy thresholds do not trigger"
  echo "  actual:   rc=${policy_pass_rc}"
  fail_count=$((fail_count + 1))
fi

policy_context_json="${tmpdir}/policy_context.json"
cat > "${policy_context_json}" <<'EOF_POLICY'
{
  "version": 1,
  "window": {
    "days": 365,
    "top": 3
  },
  "contexts": [
    "ci"
  ],
  "thresholds": {
    "deny_rate_pct": 30
  }
}
EOF_POLICY

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_context_json}" --log-path "${context_log}" >/dev/null 2>&1
policy_context_default_rc=$?
set -e
if [[ "${policy_context_default_rc}" -eq 2 ]]; then
  echo "✓ policy context default smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy context default smoke"
  echo "  expected: rc=2 with policy contexts=ci"
  echo "  actual:   rc=${policy_context_default_rc}"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_context_json}" --log-path "${context_log}" --context prod >/dev/null 2>&1
policy_context_override_rc=$?
set -e
if [[ "${policy_context_override_rc}" -eq 0 ]]; then
  echo "✓ policy context override smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy context override smoke"
  echo "  expected: rc=0 when --context prod overrides policy contexts"
  echo "  actual:   rc=${policy_context_override_rc}"
  fail_count=$((fail_count + 1))
fi

policy_profiles_json="${tmpdir}/policy_profiles.json"
cat > "${policy_profiles_json}" <<'EOF_POLICY'
{
  "version": 1,
  "default_profile": "prod",
  "profiles": {
    "prod": {
      "window": {
        "days": 365,
        "top": 3
      },
      "contexts": [
        "prod"
      ],
      "thresholds": {
        "deny_rate_pct": 30
      }
    },
    "ci": {
      "window": {
        "days": 365,
        "top": 3
      },
      "contexts": [
        "ci"
      ],
      "thresholds": {
        "deny_rate_pct": 30
      }
    }
  }
}
EOF_POLICY

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_profiles_json}" --log-path "${context_log}" >/dev/null 2>&1
policy_profiles_default_rc=$?
set -e
if [[ "${policy_profiles_default_rc}" -eq 0 ]]; then
  echo "✓ policy profile default smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy profile default smoke"
  echo "  expected: rc=0 with default profile=prod"
  echo "  actual:   rc=${policy_profiles_default_rc}"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_profiles_json}" --profile ci --log-path "${context_log}" >/dev/null 2>&1
policy_profiles_ci_rc=$?
set -e
if [[ "${policy_profiles_ci_rc}" -eq 2 ]]; then
  echo "✓ policy profile override smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy profile override smoke"
  echo "  expected: rc=2 with --profile ci"
  echo "  actual:   rc=${policy_profiles_ci_rc}"
  fail_count=$((fail_count + 1))
fi

policy_profiles_extends_json="${tmpdir}/policy_profiles_extends.json"
cat > "${policy_profiles_extends_json}" <<'EOF_POLICY'
{
  "version": 1,
  "default_profile": "prod",
  "profiles": {
    "base": {
      "window": {
        "days": 365,
        "top": 3
      },
      "contexts": [
        "prod"
      ],
      "thresholds": {
        "deny_rate_pct": 20
      }
    },
    "prod": {
      "extends": "base"
    },
    "ci": {
      "extends": "base",
      "contexts": [
        "ci"
      ],
      "thresholds": {
        "deny_rate_pct": 101
      }
    }
  }
}
EOF_POLICY

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_profiles_extends_json}" --log-path "${context_log}" >/dev/null 2>&1
policy_profiles_extends_prod_rc=$?
set -e
if [[ "${policy_profiles_extends_prod_rc}" -eq 2 ]]; then
  echo "✓ policy profile extends inherit smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy profile extends inherit smoke"
  echo "  expected: rc=2 when prod inherits deny_rate_pct=20 from base profile"
  echo "  actual:   rc=${policy_profiles_extends_prod_rc}"
  fail_count=$((fail_count + 1))
fi

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_profiles_extends_json}" --profile ci --log-path "${context_log}" >/dev/null 2>&1
policy_profiles_extends_ci_rc=$?
set -e
if [[ "${policy_profiles_extends_ci_rc}" -eq 0 ]]; then
  echo "✓ policy profile extends override smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy profile extends override smoke"
  echo "  expected: rc=0 when ci overrides inherited threshold to a non-triggering value"
  echo "  actual:   rc=${policy_profiles_extends_ci_rc}"
  fail_count=$((fail_count + 1))
fi

policy_profiles_cycle_json="${tmpdir}/policy_profiles_cycle.json"
cat > "${policy_profiles_cycle_json}" <<'EOF_POLICY'
{
  "version": 1,
  "default_profile": "a",
  "profiles": {
    "a": {
      "extends": "b"
    },
    "b": {
      "extends": "a"
    }
  }
}
EOF_POLICY

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_profiles_cycle_json}" --log-path "${context_log}" >/dev/null 2>&1
policy_profiles_cycle_rc=$?
set -e
if [[ "${policy_profiles_cycle_rc}" -eq 2 ]]; then
  echo "✓ policy profile extends cycle smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy profile extends cycle smoke"
  echo "  expected: rc=2 when profile extends chain contains a cycle"
  echo "  actual:   rc=${policy_profiles_cycle_rc}"
  fail_count=$((fail_count + 1))
fi

rotated_mix_log="${tmpdir}/rotated_mix/frontend_preflight_events.jsonl"
mkdir -p "$(dirname "${rotated_mix_log}")"
python3 - "${rotated_mix_log}" <<'PY'
import gzip
import json
from pathlib import Path
import sys

log_path = Path(sys.argv[1])
active_event = {
    "ts_utc": "2026-03-05T10:00:00+00:00",
    "source": "frontend_worker_entry.sh",
    "context": "prod",
    "frontend_tier": "L1-F",
    "skills": ["design-taste-frontend"],
    "preflight_status": "pass",
    "preflight_code": "OK",
    "gate_decision": "allow",
    "entry_exit_code": 0,
    "ok": True,
}
rotated_plain_event = {
    "ts_utc": "2026-03-05T11:00:00+00:00",
    "source": "frontend_worker_entry.sh",
    "context": "prod",
    "frontend_tier": "L1-F",
    "skills": ["frontend-skill"],
    "preflight_status": "fail",
    "preflight_code": "BASELINE_SKILL_MISSING",
    "gate_decision": "deny",
    "entry_exit_code": 2,
    "ok": False,
}
rotated_gzip_event = {
    "ts_utc": "2026-03-05T12:00:00+00:00",
    "source": "frontend_worker_entry.sh",
    "context": "prod",
    "frontend_tier": "L2",
    "skills": ["design-taste-frontend", "frontend-skill"],
    "preflight_status": "fail",
    "preflight_code": "STYLE_SKILL_REQUIRED",
    "gate_decision": "deny",
    "entry_exit_code": 2,
    "ok": False,
}

log_path.write_text(json.dumps(active_event, ensure_ascii=False) + "\n", encoding="utf-8")
plain_path = Path(str(log_path) + ".20260305T110000000Z.111")
plain_path.write_text(json.dumps(rotated_plain_event, ensure_ascii=False) + "\n", encoding="utf-8")
gzip_path = Path(str(log_path) + ".20260305T120000000Z.222.gz")
with gzip.open(gzip_path, "wt", encoding="utf-8") as fp:
    fp.write(json.dumps(rotated_gzip_event, ensure_ascii=False) + "\n")
PY

rotated_base_json="${tmpdir}/rotated_base.json"
if bash "${SUMMARY_SH}" --log-path "${rotated_mix_log}" --days 365 --top 3 --json > "${rotated_base_json}"; then
  if python3 - "${rotated_base_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
summary = payload.get("summary", {})
if int(summary.get("events_in_window", 0)) != 1:
    raise SystemExit(1)
sources = summary.get("input_sources", {})
if int(len(sources.get("files_parsed", []))) != 1:
    raise SystemExit(1)
PY
  then
    echo "✓ summary rotated default source smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary rotated default source smoke"
    echo "  expected: only active log is counted by default"
    cat "${rotated_base_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary rotated default source smoke"
  echo "  expected: summary command succeeds"
  fail_count=$((fail_count + 1))
fi

rotated_plain_json="${tmpdir}/rotated_plain.json"
if bash "${SUMMARY_SH}" --log-path "${rotated_mix_log}" --days 365 --top 3 --include-rotated --json > "${rotated_plain_json}"; then
  if python3 - "${rotated_plain_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
summary = payload.get("summary", {})
if int(summary.get("events_in_window", 0)) != 2:
    raise SystemExit(1)
sources = summary.get("input_sources", {})
if int(len(sources.get("files_parsed", []))) != 2:
    raise SystemExit(1)
PY
  then
    echo "✓ summary include-rotated smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary include-rotated smoke"
    echo "  expected: active + plain rotated logs are counted"
    cat "${rotated_plain_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary include-rotated smoke"
  echo "  expected: summary command succeeds"
  fail_count=$((fail_count + 1))
fi

rotated_gzip_json="${tmpdir}/rotated_gzip.json"
if bash "${SUMMARY_SH}" --log-path "${rotated_mix_log}" --days 365 --top 3 --include-gzip-rotated --json > "${rotated_gzip_json}"; then
  if python3 - "${rotated_gzip_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
summary = payload.get("summary", {})
if int(summary.get("events_in_window", 0)) != 3:
    raise SystemExit(1)
sources = summary.get("input_sources", {})
if int(len(sources.get("files_parsed", []))) != 3:
    raise SystemExit(1)
PY
  then
    echo "✓ summary include-gzip-rotated smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary include-gzip-rotated smoke"
    echo "  expected: active + plain + gzip rotated logs are counted"
    cat "${rotated_gzip_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary include-gzip-rotated smoke"
  echo "  expected: summary command succeeds"
  fail_count=$((fail_count + 1))
fi

empty_log="${tmpdir}/empty/frontend_preflight_events.jsonl"
mkdir -p "$(dirname "${empty_log}")"
: > "${empty_log}"

set +e
bash "${SUMMARY_SH}" --log-path "${empty_log}" --days 365 --top 3 --require-min-events 1 --no-data-action fail >/dev/null 2>&1
min_events_fail_rc=$?
set -e
if [[ "${min_events_fail_rc}" -eq 2 ]]; then
  echo "✓ summary min-events fail smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary min-events fail smoke"
  echo "  expected: rc=2 when events are below required minimum"
  echo "  actual:   rc=${min_events_fail_rc}"
  fail_count=$((fail_count + 1))
fi

min_events_warn_json="${tmpdir}/min_events_warn.json"
if bash "${SUMMARY_SH}" --log-path "${empty_log}" --days 365 --top 3 --require-min-events 1 --no-data-action warn --json > "${min_events_warn_json}"; then
  if python3 - "${min_events_warn_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if not payload.get("ok", False):
    raise SystemExit(1)
warnings = payload.get("summary", {}).get("checks", {}).get("warnings", [])
if not warnings:
    raise SystemExit(1)
if warnings[0].get("type") != "min_events":
    raise SystemExit(1)
PY
  then
    echo "✓ summary min-events warn smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary min-events warn smoke"
    echo "  expected: warning emitted with min_events type"
    cat "${min_events_warn_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary min-events warn smoke"
  echo "  expected: summary --json command succeeds"
  fail_count=$((fail_count + 1))
fi

policy_invalid_json="${tmpdir}/policy_invalid_unknown_key.json"
cat > "${policy_invalid_json}" <<'EOF_POLICY'
{
  "version": 1,
  "window": {
    "days": 365,
    "top": 3
  },
  "contexts": [
    "prod"
  ],
  "sources": {
    "include_rotated": true
  },
  "checks": {
    "min_events": 1,
    "no_data_action": "fail"
  },
  "thresholds": {
    "deny_rate_pct": 90
  },
  "unexpected_root_key": "boom"
}
EOF_POLICY

set +e
bash "${POLICY_RUN_SH}" --policy-path "${policy_invalid_json}" --log-path "${metrics_log}" >/dev/null 2>&1
policy_invalid_rc=$?
set -e
if [[ "${policy_invalid_rc}" -eq 2 ]]; then
  echo "✓ policy strict unknown-key smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ policy strict unknown-key smoke"
  echo "  expected: rc=2 for unknown policy key"
  echo "  actual:   rc=${policy_invalid_rc}"
  fail_count=$((fail_count + 1))
fi

incremental_log="${tmpdir}/incremental/frontend_preflight_events.jsonl"
incremental_state="${tmpdir}/incremental/state.json"
mkdir -p "$(dirname "${incremental_log}")"
python3 - "${incremental_log}" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
rows = [
    {
        "ts_utc": "2026-03-07T10:00:00+00:00",
        "source": "frontend_worker_entry.sh",
        "context": "prod",
        "frontend_tier": "L1-F",
        "skills": ["design-taste-frontend"],
        "preflight_status": "pass",
        "preflight_code": "OK",
        "gate_decision": "allow",
        "entry_exit_code": 0,
        "ok": True,
    },
    {
        "ts_utc": "2026-03-07T11:00:00+00:00",
        "source": "frontend_worker_entry.sh",
        "context": "prod",
        "frontend_tier": "L2",
        "skills": ["design-taste-frontend"],
        "preflight_status": "fail",
        "preflight_code": "STYLE_SKILL_REQUIRED",
        "gate_decision": "deny",
        "entry_exit_code": 2,
        "ok": False,
    },
]
path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
PY

incremental_first_json="${tmpdir}/incremental_first.json"
if bash "${SUMMARY_SH}" --log-path "${incremental_log}" --days 365 --top 3 --incremental --state-path "${incremental_state}" --json > "${incremental_first_json}"; then
  if python3 - "${incremental_first_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
summary = payload.get("summary", {})
if int(summary.get("events_in_window", 0)) != 2:
    raise SystemExit(1)
inc = summary.get("input_sources", {}).get("incremental", {})
if str(inc.get("mode")) != "full_scan":
    raise SystemExit(1)
PY
  then
    echo "✓ summary incremental first-run smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary incremental first-run smoke"
    echo "  expected: first incremental run falls back to full_scan with 2 events"
    cat "${incremental_first_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary incremental first-run smoke"
  echo "  expected: summary --incremental command succeeds"
  fail_count=$((fail_count + 1))
fi

python3 - "${incremental_log}" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
with path.open("a", encoding="utf-8") as fp:
    fp.write(
        json.dumps(
            {
                "ts_utc": "2026-03-07T12:00:00+00:00",
                "source": "frontend_worker_entry.sh",
                "context": "prod",
                "frontend_tier": "L1-F",
                "skills": ["design-taste-frontend"],
                "preflight_status": "pass",
                "preflight_code": "OK",
                "gate_decision": "allow",
                "entry_exit_code": 0,
                "ok": True,
            },
            ensure_ascii=False,
        )
        + "\n"
    )
PY

incremental_second_json="${tmpdir}/incremental_second.json"
if bash "${SUMMARY_SH}" --log-path "${incremental_log}" --days 365 --top 3 --incremental --state-path "${incremental_state}" --json > "${incremental_second_json}"; then
  if python3 - "${incremental_second_json}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
summary = payload.get("summary", {})
if int(summary.get("events_in_window", 0)) != 3:
    raise SystemExit(1)
inc = summary.get("input_sources", {}).get("incremental", {})
if str(inc.get("mode")) != "incremental":
    raise SystemExit(1)
if int(inc.get("events_newly_parsed", -1)) != 1:
    raise SystemExit(1)
PY
  then
    echo "✓ summary incremental append smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary incremental append smoke"
    echo "  expected: second incremental run parses only appended event"
    cat "${incremental_second_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary incremental append smoke"
  echo "  expected: second summary --incremental command succeeds"
  fail_count=$((fail_count + 1))
fi

state_cap_log="${tmpdir}/state_cap/frontend_preflight_events.jsonl"
state_cap_state="${tmpdir}/state_cap/state.json"
mkdir -p "$(dirname "${state_cap_log}")"
python3 - "${state_cap_log}" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
rows = []
for idx in range(1, 6):
    rows.append(
        {
            "ts_utc": f"2026-03-08T0{idx}:00:00+00:00",
            "source": "frontend_worker_entry.sh",
            "context": "prod",
            "frontend_tier": "L1-F",
            "skills": ["design-taste-frontend"],
            "preflight_status": "pass",
            "preflight_code": "OK",
            "gate_decision": "allow",
            "entry_exit_code": 0,
            "ok": True,
        }
    )
path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
PY

state_cap_json="${tmpdir}/state_cap.json"
if bash "${SUMMARY_SH}" \
  --log-path "${state_cap_log}" \
  --days 365 \
  --top 3 \
  --incremental \
  --state-path "${state_cap_state}" \
  --state-max-events 2 \
  --json > "${state_cap_json}"; then
  if python3 - "${state_cap_json}" "${state_cap_state}" <<'PY'
import json
import sys
from pathlib import Path

summary_payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
state_payload = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))

inc = summary_payload.get("summary", {}).get("input_sources", {}).get("incremental", {})
if int(inc.get("state_max_events", -1)) != 2:
    raise SystemExit(1)
if int(inc.get("state_pruned_count", -1)) != 3:
    raise SystemExit(1)
if not bool(inc.get("lock_acquired", False)):
    raise SystemExit(1)

events = state_payload.get("events", [])
if len(events) != 2:
    raise SystemExit(1)
ts_rows = [str(item.get("ts_utc", "")) for item in events]
if ts_rows != ["2026-03-08T04:00:00+00:00", "2026-03-08T05:00:00+00:00"]:
    raise SystemExit(1)
PY
  then
    echo "✓ summary incremental state-max-events prune smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ summary incremental state-max-events prune smoke"
    echo "  expected: state payload pruned to last 2 events with prune_count=3"
    cat "${state_cap_json}"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ summary incremental state-max-events prune smoke"
  echo "  expected: summary command succeeds"
  fail_count=$((fail_count + 1))
fi

summary_lock_log="${tmpdir}/summary_lock/frontend_preflight_events.jsonl"
summary_lock_state="${tmpdir}/summary_lock/state.json"
mkdir -p "$(dirname "${summary_lock_log}")"
python3 - "${summary_lock_log}" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
rows = []
for idx in range(30):
    rows.append(
        {
            "ts_utc": f"2026-03-09T10:{idx:02d}:00+00:00",
            "source": "frontend_worker_entry.sh",
            "context": "prod",
            "frontend_tier": "L1-F",
            "skills": ["design-taste-frontend"],
            "preflight_status": "pass",
            "preflight_code": "OK",
            "gate_decision": "allow",
            "entry_exit_code": 0,
            "ok": True,
        }
    )
path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
PY

summary_lock_a="${tmpdir}/summary_lock_a.json"
summary_lock_b="${tmpdir}/summary_lock_b.json"
set +e
bash "${SUMMARY_SH}" \
  --log-path "${summary_lock_log}" \
  --days 365 \
  --top 3 \
  --incremental \
  --state-path "${summary_lock_state}" \
  --json > "${summary_lock_a}" 2>/dev/null &
summary_lock_pid_a=$!
bash "${SUMMARY_SH}" \
  --log-path "${summary_lock_log}" \
  --days 365 \
  --top 3 \
  --incremental \
  --state-path "${summary_lock_state}" \
  --json > "${summary_lock_b}" 2>/dev/null &
summary_lock_pid_b=$!
wait "${summary_lock_pid_a}"
summary_lock_rc_a=$?
wait "${summary_lock_pid_b}"
summary_lock_rc_b=$?
set -e

if [[ "${summary_lock_rc_a}" -ne 0 || "${summary_lock_rc_b}" -ne 0 ]]; then
  echo "✗ summary incremental lock concurrency smoke"
  echo "  expected: both concurrent incremental summaries exit 0"
  echo "  actual:   rc_a=${summary_lock_rc_a}, rc_b=${summary_lock_rc_b}"
  fail_count=$((fail_count + 1))
elif python3 - "${summary_lock_a}" "${summary_lock_b}" "${summary_lock_state}" <<'PY'
import json
import sys
from pathlib import Path

for output_path in sys.argv[1:3]:
    payload = json.loads(Path(output_path).read_text(encoding="utf-8"))
    if not payload.get("ok", False):
        raise SystemExit(1)
    inc = payload.get("summary", {}).get("input_sources", {}).get("incremental", {})
    if not bool(inc.get("lock_acquired", False)):
        raise SystemExit(1)

state_payload = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))
if int(state_payload.get("version", 0)) != 1:
    raise SystemExit(1)
events = state_payload.get("events", [])
if not isinstance(events, list) or len(events) == 0:
    raise SystemExit(1)
PY
then
  echo "✓ summary incremental lock concurrency smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ summary incremental lock concurrency smoke"
  echo "  expected: outputs and shared state file remain valid under concurrent runs"
  fail_count=$((fail_count + 1))
fi

prune_log="${tmpdir}/prune/frontend_preflight_events.jsonl"
mkdir -p "$(dirname "${prune_log}")"
python3 - "${prune_log}" <<'PY'
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import sys

log_path = Path(sys.argv[1])
log_path.write_text("{}\n", encoding="utf-8")
now = datetime.now(timezone.utc)
old = log_path.parent / (log_path.name + ".20240101T000000000Z.111")
new = log_path.parent / (log_path.name + ".20260101T000000000Z.222")
old.write_text("old\n", encoding="utf-8")
new.write_text("new\n", encoding="utf-8")
os.utime(old, (int((now - timedelta(days=10)).timestamp()), int((now - timedelta(days=10)).timestamp())))
os.utime(new, (int((now - timedelta(days=1)).timestamp()), int((now - timedelta(days=1)).timestamp())))
PY

if bash "${ROTATE_SH}" --log-path "${prune_log}" --max-bytes 999999 --keep 5 --max-age-days 7 --quiet; then
  if python3 - "${prune_log}" <<'PY'
from pathlib import Path
import sys

log_path = Path(sys.argv[1])
rotated = sorted(log_path.parent.glob(log_path.name + ".20*Z*"))
# old file should be deleted by age, new should stay.
if len(rotated) != 1:
    raise SystemExit(1)
name = rotated[0].name
if not name.endswith(".222"):
    raise SystemExit(1)
PY
  then
    echo "✓ rotate prune without rotate smoke"
    pass_count=$((pass_count + 1))
  else
    echo "✗ rotate prune without rotate smoke"
    echo "  expected: stale rotated file removed even when no active rotation"
    ls -la "$(dirname "${prune_log}")"
    fail_count=$((fail_count + 1))
  fi
else
  echo "✗ rotate prune without rotate smoke"
  echo "  expected: rotate command succeeds"
  fail_count=$((fail_count + 1))
fi

stress_log="${tmpdir}/stress/frontend_preflight_events.jsonl"
mkdir -p "$(dirname "${stress_log}")"
stress_jobs=30
pids=()
for _ in $(seq 1 "${stress_jobs}"); do
  FRONTEND_PREFLIGHT_LOG_ENABLED=1 \
  FRONTEND_PREFLIGHT_LOG_PATH="${stress_log}" \
  FRONTEND_PREFLIGHT_LOG_MAX_BYTES=100000000 \
  FRONTEND_PREFLIGHT_LOG_KEEP=5 \
  FRONTEND_PREFLIGHT_LOG_MAX_AGE_DAYS=0 \
  FRONTEND_PREFLIGHT_LOG_COMPRESS=0 \
  bash "${ENTRY_SH}" --frontend-tier L1-F --skills design-taste-frontend >/dev/null 2>&1 &
  pids+=("$!")
done

stress_wait_fail=0
for pid in "${pids[@]}"; do
  if ! wait "${pid}"; then
    stress_wait_fail=$((stress_wait_fail + 1))
  fi
done

if [[ "${stress_wait_fail}" -ne 0 ]]; then
  echo "✗ concurrent stress smoke"
  echo "  expected: all ${stress_jobs} entry calls exit 0"
  echo "  actual failed jobs: ${stress_wait_fail}"
  fail_count=$((fail_count + 1))
elif python3 - "${stress_log}" "${stress_jobs}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
expected = int(sys.argv[2])
lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
if len(lines) != expected:
    raise SystemExit(1)
for line in lines:
    payload = json.loads(line)
    if payload.get("preflight_code") != "OK":
        raise SystemExit(1)
    if payload.get("gate_decision") != "allow":
        raise SystemExit(1)
PY
then
  echo "✓ concurrent stress smoke"
  pass_count=$((pass_count + 1))
else
  echo "✗ concurrent stress smoke"
  echo "  expected: ${stress_jobs} valid JSONL allow events"
  echo "  actual:"
  wc -l "${stress_log}" || true
  fail_count=$((fail_count + 1))
fi

echo
echo "passed=${pass_count} failed=${fail_count}"
if [[ "${fail_count}" -gt 0 ]]; then
  exit 1
fi
