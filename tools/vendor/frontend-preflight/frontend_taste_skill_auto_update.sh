#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_JSON="${FRONTEND_TASTE_SKILL_POLICY:-${SCRIPT_DIR}/frontend_taste_skill_policy.json}"

mode="${FRONTEND_TASTE_SKILL_UPDATE_MODE:-}"
verify="${FRONTEND_TASTE_SKILL_UPDATE_VERIFY:-}"
log_path="${FRONTEND_TASTE_SKILL_UPDATE_LOG_PATH:-}"

if [[ -z "${mode}" ]]; then
  mode="$(python3 - "${POLICY_JSON}" <<'PY'
import json
import os
import sys
from pathlib import Path

path = Path(os.path.expanduser(sys.argv[1]))
policy = json.loads(path.read_text(encoding="utf-8"))
print(policy.get("autoUpdate", {}).get("defaultMode", "apply"))
PY
)"
fi

if [[ -z "${verify}" ]]; then
  verify="$(python3 - "${POLICY_JSON}" <<'PY'
import json
import os
import sys
from pathlib import Path

path = Path(os.path.expanduser(sys.argv[1]))
policy = json.loads(path.read_text(encoding="utf-8"))
print("1" if policy.get("autoUpdate", {}).get("verifyAfterApply", True) else "0")
PY
)"
fi

if [[ -z "${log_path}" ]]; then
  log_path="$(python3 - "${POLICY_JSON}" <<'PY'
import json
import os
import sys
from pathlib import Path

path = Path(os.path.expanduser(sys.argv[1]))
policy = json.loads(path.read_text(encoding="utf-8"))
print(os.path.expanduser(policy.get("autoUpdate", {}).get("logPath", "~/.codex/logs/frontend_taste_skill_update.log")))
PY
)"
fi

mkdir -p "$(dirname "${log_path}")"

args=(--policy "${POLICY_JSON}" --mode "${mode}" --output text)
if [[ "${mode}" == "apply" && "${verify}" == "1" ]]; then
  args+=(--verify)
fi

{
  echo "===== $(date -u +"%Y-%m-%dT%H:%M:%SZ") frontend taste-skill ${mode} ====="
  bash "${SCRIPT_DIR}/frontend_taste_skill_update.sh" "${args[@]}"
} >>"${log_path}" 2>&1
