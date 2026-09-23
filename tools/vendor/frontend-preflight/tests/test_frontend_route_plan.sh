#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROUTE_PLAN_SH="${TOOLS_DIR}/frontend_route_plan.sh"

if [[ ! -x "${ROUTE_PLAN_SH}" ]]; then
  echo "Route planner script not executable: ${ROUTE_PLAN_SH}" >&2
  exit 2
fi

pass_count=0
fail_count=0

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

authority_project="${tmpdir}/authority_project"
mkdir -p "${authority_project}/src/app"
cat > "${authority_project}/DESIGN.md" <<'EOF_AUTH'
# Project Design Authority

## Typography System
Readable typography contract.

## Color Palette
Token-backed color system.

## Motion Language
Calm interaction language.

## Component Grammar
Reusable component rules.
EOF_AUTH

export FRONTEND_WORKSPACE_ROOT="${authority_project}/src/app"

run_case() {
  local name="$1"
  local expected_rc="$2"
  local expected_tier="$3"
  local expected_code="$4"
  local expected_route="$5"
  local expected_skills_csv="$6"
  local forbidden_skills_csv="$7"
  shift 7

  set +e
  local output
  output="$(bash "${ROUTE_PLAN_SH}" "$@" 2>&1)"
  local rc=$?
  set -e

  local parsed
  if ! parsed="$(python3 - "${output}" "${expected_tier}" "${expected_code}" "${expected_route}" "${expected_skills_csv}" "${forbidden_skills_csv}" <<'PY'
import json
import sys

raw = sys.argv[1]
expected_tier = sys.argv[2]
expected_code = sys.argv[3]
expected_route = sys.argv[4]
expected_skills = [s for s in sys.argv[5].split(",") if s]
forbidden_skills = [s for s in sys.argv[6].split(",") if s]

payload = json.loads(raw)
skills = payload.get("skills") or []
errors = []
expected_execution = {
    "L0": "main_serial",
    "L1-F": "spawn_default",
    "L1-V": "spawn_default",
    "L2": "spawn_worker",
}.get(expected_tier)
expected_subagent_required = expected_tier != "L0"
if payload.get("frontend_tier") != expected_tier:
    errors.append(f"tier={payload.get('frontend_tier')}")
if payload.get("preflight_code") != expected_code:
    errors.append(f"code={payload.get('preflight_code')}")
if payload.get("agent_route") != expected_route:
    errors.append(f"route={payload.get('agent_route')}")
if payload.get("execution_mode") != expected_execution:
    errors.append(f"execution_mode={payload.get('execution_mode')}")
if payload.get("subagent_required") is not expected_subagent_required:
    errors.append(f"subagent_required={payload.get('subagent_required')}")
if expected_subagent_required and payload.get("runtime_remediation_policy") != "repair_then_retry":
    errors.append(f"runtime_remediation_policy={payload.get('runtime_remediation_policy')}")
if expected_subagent_required and not isinstance(payload.get("spawn_agent_intent"), dict):
    errors.append("missing_spawn_agent_intent")
if "本次已启用" in str(payload.get("progress_echo", "")):
    errors.append("misleading_progress_echo")
if payload.get("style_authority_path"):
    digest = str(payload.get("style_authority_digest", ""))
    if len(digest) != 64:
        errors.append("invalid_style_authority_digest")
    if payload.get("style_authority_read_required") is not True:
        errors.append("style_authority_read_not_required")
    if payload.get("style_authority_context_required") is not True:
        errors.append("style_authority_context_not_required")
    if not isinstance(payload.get("style_authority_task_constraints"), list) or not payload.get("style_authority_task_constraints"):
        errors.append("missing_style_authority_task_constraints")
    if not isinstance(payload.get("style_authority_execution_contract"), dict):
        errors.append("missing_style_authority_execution_contract")
    if expected_subagent_required:
        intent = payload.get("spawn_agent_intent") or {}
        if intent.get("style_authority_path") != payload.get("style_authority_path"):
            errors.append("spawn_intent_missing_style_authority_path")
        if not intent.get("style_authority_task_constraints"):
            errors.append("spawn_intent_missing_style_constraints")
for skill in expected_skills:
    if skill not in skills:
        errors.append(f"missing_skill={skill}")
for skill in forbidden_skills:
    if skill in skills:
        errors.append(f"forbidden_skill={skill}")
if not payload.get("quality_tradeoff"):
    errors.append("missing_quality_tradeoff")
print("OK" if not errors else ";".join(errors))
sys.exit(0 if not errors else 1)
PY
)"; then
    echo "✗ ${name}"
    echo "  expected: rc=${expected_rc}, tier=${expected_tier}, code=${expected_code}, route=${expected_route}, skills=${expected_skills_csv}, forbidden=${forbidden_skills_csv}"
    echo "  actual rc=${rc}, check=${parsed}"
    echo "  raw: ${output}"
    fail_count=$((fail_count + 1))
    return
  fi

  if [[ "${rc}" == "${expected_rc}" ]]; then
    echo "✓ ${name}"
    pass_count=$((pass_count + 1))
  else
    echo "✗ ${name}"
    echo "  expected rc=${expected_rc}, actual rc=${rc}"
    echo "  raw: ${output}"
    fail_count=$((fail_count + 1))
  fi
}

run_case "dashboard functional component" 0 L1-F OK default_high \
  "design-taste-frontend" "gpt-taste,image-to-code,imagegen-frontend-web" \
  --surface dashboard \
  --intent functional \
  --scope component

run_case "dashboard visual with uploaded reference" 0 L1-V OK default_high \
  "design-taste-frontend,frontend-skill,image-to-code" "gpt-taste,imagegen-frontend-web" \
  --surface dashboard \
  --intent visual-refine \
  --scope component \
  --has-reference-image 1

run_case "landing high-motion page with generated reference" 0 L2 OK worker_xhigh \
  "design-taste-frontend,frontend-skill,gpt-taste,imagegen-frontend-web,image-to-code" "minimalist-ui,brandkit" \
  --surface landing \
  --intent high-motion \
  --scope page \
  --needs-generated-reference 1

run_case "brand reference board for page" 0 L2 OK worker_xhigh \
  "design-taste-frontend,frontend-skill,high-end-visual-design,brandkit,image-to-code" "gpt-taste,imagegen-frontend-web" \
  --surface brand \
  --intent brand \
  --scope page \
  --needs-generated-reference 1

run_case "mobile flow reference" 0 L2 OK worker_xhigh \
  "design-taste-frontend,frontend-skill,high-end-visual-design,imagegen-frontend-mobile,image-to-code" "gpt-taste,brandkit" \
  --surface mobile \
  --intent mobile-flow \
  --scope page \
  --needs-generated-reference 1

run_case "explicit industrial dashboard redesign" 0 L2 OK worker_xhigh \
  "design-taste-frontend,frontend-skill,industrial-brutalist-ui,redesign-existing-projects" "gpt-taste" \
  --surface dashboard \
  --intent redesign \
  --scope page \
  --existing-project 1 \
  --style industrial

run_case "micro copy/style tweak stays serial" 0 L0 OK default_high \
  "design-taste-frontend" "frontend-skill,gpt-taste,image-to-code" \
  --surface dashboard \
  --intent functional \
  --scope micro

set +e
authority_output="$(
  cd "${authority_project}/src/app"
  bash "${ROUTE_PLAN_SH}" \
    --surface dashboard \
    --intent visual-refine \
    --scope component 2>&1
)"
authority_rc=$?
set -e

if [[ "${authority_rc}" -eq 0 ]] && python3 - "${authority_output}" "${authority_project}/DESIGN.md" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(sys.argv[1])
expected = str(Path(sys.argv[2]).resolve())
if payload.get("frontend_tier") != "L1-V":
    raise SystemExit(1)
if payload.get("style_authority_path") != expected:
    raise SystemExit(1)
if payload.get("style_authority_source") != "auto":
    raise SystemExit(1)
if payload.get("style_authority_mode") != "enforce":
    raise SystemExit(1)
if payload.get("design_evolution_required") is not False:
    raise SystemExit(1)
if "--style-authority-path" not in payload.get("preflight_command", ""):
    raise SystemExit(1)
if "Using auto DESIGN.md style authority." not in payload.get("quality_tradeoff", ""):
    raise SystemExit(1)
if payload.get("preflight_code") != "OK":
    raise SystemExit(1)
PY
then
  echo "✓ route planner auto DESIGN.md authority"
  pass_count=$((pass_count + 1))
else
  echo "✗ route planner auto DESIGN.md authority"
  echo "  expected: auto-discovered DESIGN.md in route plan payload"
  echo "  actual rc=${authority_rc}"
  echo "  raw: ${authority_output}"
  fail_count=$((fail_count + 1))
fi

set +e
missing_authority_output="$(
  FRONTEND_STYLE_AUTHORITY_AUTO=0 \
  bash "${ROUTE_PLAN_SH}" \
    --surface dashboard \
    --intent visual-refine \
    --scope component 2>&1
)"
missing_authority_rc=$?
set -e

if [[ "${missing_authority_rc}" -eq 2 ]] && python3 - "${missing_authority_output}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("frontend_tier") != "L1-V":
    raise SystemExit(1)
if payload.get("preflight_status") != "fail":
    raise SystemExit(1)
if payload.get("preflight_code") != "STYLE_AUTHORITY_MISSING":
    raise SystemExit(1)
if payload.get("style_authority_path") != "":
    raise SystemExit(1)
if payload.get("style_authority_read_required") is not True:
    raise SystemExit(1)
if payload.get("style_authority_revision_policy") != "none":
    raise SystemExit(1)
PY
then
  echo "✓ route planner L1+ missing DESIGN.md authority"
  pass_count=$((pass_count + 1))
else
  echo "✗ route planner L1+ missing DESIGN.md authority"
  echo "  expected: rc=2, code=STYLE_AUTHORITY_MISSING"
  echo "  actual rc=${missing_authority_rc}"
  echo "  raw: ${missing_authority_output}"
  fail_count=$((fail_count + 1))
fi

set +e
missing_evolve_output="$(
  FRONTEND_STYLE_AUTHORITY_AUTO=0 \
  bash "${ROUTE_PLAN_SH}" \
    --surface dashboard \
    --intent redesign \
    --scope page \
    --existing-project 1 \
    --style minimalist \
    --design-authority-mode evolve 2>&1
)"
missing_evolve_rc=$?
set -e

if [[ "${missing_evolve_rc}" -eq 2 ]] && python3 - "${missing_evolve_output}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("frontend_tier") != "L2":
    raise SystemExit(1)
if payload.get("preflight_status") != "fail":
    raise SystemExit(1)
if payload.get("preflight_code") != "STYLE_AUTHORITY_MISSING":
    raise SystemExit(1)
if payload.get("style_authority_mode") != "evolve":
    raise SystemExit(1)
if payload.get("design_evolution_required") is not True:
    raise SystemExit(1)
if payload.get("style_authority_revision_policy") != "none":
    raise SystemExit(1)
PY
then
  echo "✓ route planner evolve missing DESIGN.md authority"
  pass_count=$((pass_count + 1))
else
  echo "✗ route planner evolve missing DESIGN.md authority"
  echo "  expected: rc=2, code=STYLE_AUTHORITY_MISSING, mode=evolve"
  echo "  actual rc=${missing_evolve_rc}"
  echo "  raw: ${missing_evolve_output}"
  fail_count=$((fail_count + 1))
fi

set +e
candidate_output="$(
  cd "${authority_project}/src/app"
  bash "${ROUTE_PLAN_SH}" \
    --surface dashboard \
    --intent redesign \
    --scope page \
    --existing-project 1 \
    --style minimalist 2>&1
)"
candidate_rc=$?
set -e

if [[ "${candidate_rc}" -eq 0 ]] && python3 - "${candidate_output}" "${authority_project}/DESIGN.md" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(sys.argv[1])
expected = str(Path(sys.argv[2]).resolve())
if payload.get("frontend_tier") != "L2":
    raise SystemExit(1)
if payload.get("style_authority_path") != expected:
    raise SystemExit(1)
if payload.get("style_authority_mode") != "enforce":
    raise SystemExit(1)
if payload.get("design_evolution_required") is not False:
    raise SystemExit(1)
if payload.get("style_authority_evolution_candidate") is not True:
    raise SystemExit(1)
if payload.get("style_authority_revision_policy") != "enforce_current_baseline":
    raise SystemExit(1)
if payload.get("style_authority_execution_contract", {}).get("mode") != "enforce":
    raise SystemExit(1)
if payload.get("style_authority_execution_contract", {}).get("evolution_candidate") is not True:
    raise SystemExit(1)
if not payload.get("style_authority_task_constraints"):
    raise SystemExit(1)
if payload.get("spawn_agent_intent", {}).get("style_authority_revision_policy") != "enforce_current_baseline":
    raise SystemExit(1)
if "evolution candidate" not in payload.get("quality_tradeoff", ""):
    raise SystemExit(1)
if payload.get("preflight_code") != "OK":
    raise SystemExit(1)
PY
then
  echo "✓ route planner design evolution candidate"
  pass_count=$((pass_count + 1))
else
  echo "✗ route planner design evolution candidate"
  echo "  expected: auto redesign page stays enforce and marks candidate"
  echo "  actual rc=${candidate_rc}"
  echo "  raw: ${candidate_output}"
  fail_count=$((fail_count + 1))
fi

set +e
evolve_output="$(
  cd "${authority_project}/src/app"
  bash "${ROUTE_PLAN_SH}" \
    --surface dashboard \
    --intent redesign \
    --scope page \
    --existing-project 1 \
    --style minimalist \
    --design-authority-mode evolve 2>&1
)"
evolve_rc=$?
set -e

if [[ "${evolve_rc}" -eq 0 ]] && python3 - "${evolve_output}" "${authority_project}/DESIGN.md" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(sys.argv[1])
expected = str(Path(sys.argv[2]).resolve())
if payload.get("frontend_tier") != "L2":
    raise SystemExit(1)
if payload.get("style_authority_path") != expected:
    raise SystemExit(1)
if payload.get("style_authority_mode") != "evolve":
    raise SystemExit(1)
if payload.get("design_evolution_required") is not True:
    raise SystemExit(1)
if payload.get("style_authority_evolution_candidate") is not False:
    raise SystemExit(1)
if payload.get("style_authority_revision_policy") != "evolve_current_baseline":
    raise SystemExit(1)
if payload.get("style_authority_execution_contract", {}).get("mode") != "evolve":
    raise SystemExit(1)
if not payload.get("style_authority_task_constraints"):
    raise SystemExit(1)
if payload.get("spawn_agent_intent", {}).get("style_authority_revision_policy") != "evolve_current_baseline":
    raise SystemExit(1)
if "DESIGN.md must be updated" not in payload.get("quality_tradeoff", ""):
    raise SystemExit(1)
if payload.get("preflight_code") != "OK":
    raise SystemExit(1)
PY
then
  echo "✓ route planner approved design evolution mode"
  pass_count=$((pass_count + 1))
else
  echo "✗ route planner approved design evolution mode"
  echo "  expected: explicit evolve marks DESIGN.md evolution required"
  echo "  actual rc=${evolve_rc}"
  echo "  raw: ${evolve_output}"
  fail_count=$((fail_count + 1))
fi

if [[ "${fail_count}" -ne 0 ]]; then
  echo
  echo "route_plan_passed=${pass_count} route_plan_failed=${fail_count}" >&2
  exit 1
fi

echo
echo "route_plan_passed=${pass_count} route_plan_failed=0"
