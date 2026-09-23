#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

SRC_DIR="${FRONTEND_PREFLIGHT_TOOLS_SRC:-${HOME}/.codex/tools}"
DEST_DIR="${REPO_ROOT}/tools/vendor/frontend-preflight"
MANIFEST_FILE="${DEST_DIR}/MANIFEST.sha256"
META_FILE="${DEST_DIR}/MANIFEST.meta"

required_files=(
  "frontend_preflight.py"
  "frontend_agent_routing.json"
  "frontend_preflight_log_maintenance.sh"
  "frontend_preflight_log_rotate.sh"
  "frontend_preflight_log_summary.sh"
  "frontend_preflight_policy.json"
  "frontend_preflight_policy_run.sh"
  "frontend_preflight_report.sh"
  "frontend_preflight_run.sh"
  "frontend_preflight_spec.json"
  "frontend_preflight_verify.sh"
  "frontend_route_plan.sh"
  "frontend_taste_skill_auto_update.sh"
  "frontend_taste_skill_policy.json"
  "frontend_taste_skill_update.py"
  "frontend_taste_skill_update.sh"
  "frontend_worker_entry.sh"
  "templates/frontend-taste-skill-crontab.example"
  "templates/frontend-taste-skill-launchd.plist"
  "tests/test_frontend_route_plan.sh"
  "tests/test_frontend_preflight.sh"
  "tests/test_frontend_preflight_spec_sync.sh"
  "tests/test_frontend_taste_skill_update.sh"
)

if [[ ! -d "${SRC_DIR}" ]]; then
  echo "[sync:frontend:preflight-tools] source dir not found: ${SRC_DIR}" >&2
  exit 2
fi

for rel in "${required_files[@]}"; do
  if [[ ! -e "${SRC_DIR}/${rel}" ]]; then
    echo "[sync:frontend:preflight-tools] required source file missing: ${SRC_DIR}/${rel}" >&2
    exit 2
  fi
done

mkdir -p "${DEST_DIR}"
rsync -a --delete \
  --exclude "__pycache__/" \
  --exclude "*.pyc" \
  --exclude ".DS_Store" \
  "${SRC_DIR}/" "${DEST_DIR}/"

(
  cd "${DEST_DIR}"
  LC_ALL=C find . -type f \
    ! -name "MANIFEST.sha256" \
    ! -name "MANIFEST.meta" \
    ! -path "./__pycache__/*" \
    -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 shasum -a 256
) > "${MANIFEST_FILE}"

{
  echo "source=${SRC_DIR}"
  echo "synced_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
} > "${META_FILE}"

echo "[sync:frontend:preflight-tools] synced to ${DEST_DIR}"
echo "[sync:frontend:preflight-tools] manifest: ${MANIFEST_FILE}"
