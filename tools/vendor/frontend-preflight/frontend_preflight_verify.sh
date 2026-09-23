#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="${SCRIPT_DIR}/tests"
POLICY_RUN_SH="${SCRIPT_DIR}/frontend_preflight_policy_run.sh"
POLICY_JSON="${SCRIPT_DIR}/frontend_preflight_policy.json"
ROUTING_JSON="${SCRIPT_DIR}/frontend_agent_routing.json"
TASTE_SKILL_POLICY_JSON="${SCRIPT_DIR}/frontend_taste_skill_policy.json"

bash -n "${SCRIPT_DIR}/frontend_route_plan.sh"
bash -n "${SCRIPT_DIR}/frontend_worker_entry.sh"
bash -n "${SCRIPT_DIR}/frontend_taste_skill_update.sh"
bash -n "${SCRIPT_DIR}/frontend_taste_skill_auto_update.sh"
bash -n "${SCRIPT_DIR}/frontend_preflight_log_rotate.sh"
bash -n "${SCRIPT_DIR}/frontend_preflight_log_maintenance.sh"
bash -n "${SCRIPT_DIR}/frontend_preflight_log_summary.sh"
bash -n "${SCRIPT_DIR}/frontend_preflight_report.sh"
bash -n "${POLICY_RUN_SH}"
bash -n "${TESTS_DIR}/test_frontend_route_plan.sh"
bash -n "${TESTS_DIR}/test_frontend_preflight.sh"
bash -n "${TESTS_DIR}/test_frontend_preflight_spec_sync.sh"
bash -n "${TESTS_DIR}/test_frontend_taste_skill_update.sh"

python3 -m py_compile "${SCRIPT_DIR}/frontend_preflight.py"
python3 -m py_compile "${SCRIPT_DIR}/frontend_taste_skill_update.py"

if [[ ! -r "${POLICY_JSON}" ]]; then
  echo "Policy file not found or not readable: ${POLICY_JSON}" >&2
  exit 1
fi

if [[ ! -r "${ROUTING_JSON}" ]]; then
  echo "Routing file not found or not readable: ${ROUTING_JSON}" >&2
  exit 1
fi

if [[ ! -r "${TASTE_SKILL_POLICY_JSON}" ]]; then
  echo "Taste skill policy file not found or not readable: ${TASTE_SKILL_POLICY_JSON}" >&2
  exit 1
fi

python3 -m json.tool "${ROUTING_JSON}" >/dev/null
python3 -m json.tool "${TASTE_SKILL_POLICY_JSON}" >/dev/null

tmp_policy_log="$(mktemp)"
trap 'rm -f "${tmp_policy_log}"' EXIT
python3 - "${tmp_policy_log}" <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

path = Path(sys.argv[1])
event = {
    "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "source": "frontend_preflight_verify.sh",
    "context": "prod",
    "frontend_tier": "L1-F",
    "skills": ["design-taste-frontend"],
    "preflight_status": "pass",
    "preflight_code": "OK",
    "gate_decision": "allow",
    "entry_exit_code": 0,
    "ok": True,
}
path.write_text(json.dumps(event, ensure_ascii=False) + "\n", encoding="utf-8")
PY
bash "${POLICY_RUN_SH}" --policy-path "${POLICY_JSON}" --profile prod --log-path "${tmp_policy_log}" --json >/dev/null

python3 - "${tmp_policy_log}" <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

path = Path(sys.argv[1])
event = {
    "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "source": "frontend_preflight_verify.sh",
    "context": "prod",
    "frontend_tier": "L2",
    "skills": ["design-taste-frontend"],
    "preflight_status": "fail",
    "preflight_code": "RUNTIME_ERROR",
    "gate_decision": "deny",
    "entry_exit_code": 2,
    "ok": False,
}
path.write_text(json.dumps(event, ensure_ascii=False) + "\n", encoding="utf-8")
PY
set +e
bash "${POLICY_RUN_SH}" --policy-path "${POLICY_JSON}" --profile prod --log-path "${tmp_policy_log}" --json >/dev/null
policy_negative_rc=$?
set -e
if [[ "${policy_negative_rc}" -ne 2 ]]; then
  echo "Expected policy negative fixture rc=2, got rc=${policy_negative_rc}" >&2
  exit 1
fi

tmp_test_dir="$(mktemp -d)"
trap 'rm -f "${tmp_policy_log}"; rm -rf "${tmp_test_dir}"' EXIT

run_parallel_test() {
  local name="$1"
  local command="$2"
  local stdout_file="${tmp_test_dir}/${name}.out"
  local stderr_file="${tmp_test_dir}/${name}.err"
  (
    set +e
    eval "${command}" >"${stdout_file}" 2>"${stderr_file}"
    echo "$?" >"${tmp_test_dir}/${name}.rc"
  ) &
}

run_parallel_test "test_frontend_preflight" "bash \"${TESTS_DIR}/test_frontend_preflight.sh\""
run_parallel_test "test_frontend_preflight_spec_sync" "bash \"${TESTS_DIR}/test_frontend_preflight_spec_sync.sh\""
run_parallel_test "test_frontend_route_plan" "bash \"${TESTS_DIR}/test_frontend_route_plan.sh\""
run_parallel_test "test_frontend_taste_skill_update" "bash \"${TESTS_DIR}/test_frontend_taste_skill_update.sh\""

wait

for name in \
  test_frontend_preflight \
  test_frontend_preflight_spec_sync \
  test_frontend_route_plan \
  test_frontend_taste_skill_update
do
  rc="$(cat "${tmp_test_dir}/${name}.rc")"
  if [[ "${rc}" -ne 0 ]]; then
    echo "[frontend_preflight_verify] ${name} failed with rc=${rc}" >&2
    cat "${tmp_test_dir}/${name}.out" >&2 || true
    cat "${tmp_test_dir}/${name}.err" >&2 || true
    exit "${rc}"
  fi
done

cat "${tmp_test_dir}/test_frontend_preflight.out"
cat "${tmp_test_dir}/test_frontend_preflight_spec_sync.out"
cat "${tmp_test_dir}/test_frontend_route_plan.out"
cat "${tmp_test_dir}/test_frontend_taste_skill_update.out"
