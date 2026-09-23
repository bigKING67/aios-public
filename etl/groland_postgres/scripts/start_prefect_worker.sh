#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
UV_BIN="${UV_BIN:-uv}"
PYTHON_BIN="${PYTHON_BIN:-}"
PREFECT_BIN="${PREFECT_BIN:-}"
POOL_NAME="${POOL_NAME:-default-agent-pool}"
POOL_TYPE="${POOL_TYPE:-process}"
HOST_ADDRESS="${HOST_ADDRESS:-127.0.0.1}"
PORT="${PORT:-4200}"
SERVER_WAIT_TIMEOUT_SECONDS="${SERVER_WAIT_TIMEOUT_SECONDS:-120}"
SERVER_WAIT_POLL_SECONDS="${SERVER_WAIT_POLL_SECONDS:-2}"

PREFECT_HOME="${PREFECT_HOME:-$PROJECT_ROOT/.prefect_home}"
PREFECT_API_URL="${PREFECT_API_URL:-http://${HOST_ADDRESS}:${PORT}/api}"

: "${PGPASSWORD:?Missing PGPASSWORD. Please export PGPASSWORD before starting worker.}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-postgres}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-20}"
export PSQL_RETRY_ATTEMPTS="${PSQL_RETRY_ATTEMPTS:-4}"
export PSQL_RETRY_BACKOFF_SECONDS="${PSQL_RETRY_BACKOFF_SECONDS:-3}"
export PSQL_RETRY_BACKOFF_MAX_SECONDS="${PSQL_RETRY_BACKOFF_MAX_SECONDS:-45}"
export PSQL_RETRY_JITTER_MILLISECONDS="${PSQL_RETRY_JITTER_MILLISECONDS:-900}"

mkdir -p "$PREFECT_HOME"

export PREFECT_HOME
export PREFECT_API_URL

cd "$PROJECT_ROOT"

if [[ -z "$PREFECT_BIN" ]]; then
  PREFECT_BIN="$UV_BIN"
  readiness_command=(
    "$UV_BIN" run --frozen python
    "$SCRIPT_DIR/ensure_prefect_worker_ready.py"
    --api-url "$PREFECT_API_URL"
    --pool "$POOL_NAME"
    --pool-type "$POOL_TYPE"
    --prefect-bin "$PROJECT_ROOT/.venv/bin/prefect"
    --timeout-seconds "$SERVER_WAIT_TIMEOUT_SECONDS"
    --poll-interval-seconds "$SERVER_WAIT_POLL_SECONDS"
  )
  "${readiness_command[@]}"
  exec "$UV_BIN" run --frozen prefect worker start --pool "$POOL_NAME"
fi

if [[ -z "$PYTHON_BIN" ]]; then
  echo "PYTHON_BIN is required when PREFECT_BIN is configured." >&2
  exit 1
fi

"$PYTHON_BIN" "$SCRIPT_DIR/ensure_prefect_worker_ready.py" \
  --api-url "$PREFECT_API_URL" \
  --pool "$POOL_NAME" \
  --pool-type "$POOL_TYPE" \
  --prefect-bin "$PREFECT_BIN" \
  --timeout-seconds "$SERVER_WAIT_TIMEOUT_SECONDS" \
  --poll-interval-seconds "$SERVER_WAIT_POLL_SECONDS"

exec "$PREFECT_BIN" worker start --pool "$POOL_NAME"
