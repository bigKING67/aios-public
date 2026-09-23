#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ETL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SYNC_ROOT="${ETL_DIR}/dataops/feishu_sync"

ENV_FILE_PATH="${ENV_FILE:-${ETL_DIR}/.env}"
if [[ "${1:-}" == "--env-file" ]]; then
  if [[ $# -lt 2 ]]; then
    echo "Missing value for --env-file" >&2
    exit 2
  fi
  ENV_FILE_PATH="$2"
  shift 2
fi

if [[ -f "${ENV_FILE_PATH}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE_PATH}"
  set +a
fi

export PYTHONPATH="${SYNC_ROOT}:${PYTHONPATH:-}"

cd "${ETL_DIR}"
uv run python -m feishu_data_hub.sync.scheduler "$@"
