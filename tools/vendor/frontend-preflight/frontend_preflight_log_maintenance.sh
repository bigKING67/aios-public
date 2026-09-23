#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROTATE_SH="${SCRIPT_DIR}/frontend_preflight_log_rotate.sh"

if [[ ! -x "${ROTATE_SH}" ]]; then
  echo "Rotate script not executable: ${ROTATE_SH}" >&2
  exit 2
fi

log_path="${FRONTEND_PREFLIGHT_LOG_PATH:-${HOME}/.codex/logs/frontend_preflight_events.jsonl}"
max_bytes="${FRONTEND_PREFLIGHT_LOG_MAX_BYTES:-5242880}"
keep="${FRONTEND_PREFLIGHT_LOG_KEEP:-14}"
max_age_days="${FRONTEND_PREFLIGHT_LOG_MAX_AGE_DAYS:-30}"
compress="${FRONTEND_PREFLIGHT_LOG_COMPRESS:-1}"

if [[ "${compress}" == "1" ]]; then
  bash "${ROTATE_SH}" \
    --log-path "${log_path}" \
    --max-bytes "${max_bytes}" \
    --keep "${keep}" \
    --max-age-days "${max_age_days}" \
    --compress \
    --quiet
else
  bash "${ROTATE_SH}" \
    --log-path "${log_path}" \
    --max-bytes "${max_bytes}" \
    --keep "${keep}" \
    --max-age-days "${max_age_days}" \
    --quiet
fi
