#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOST_ADDRESS="${HOST_ADDRESS:-127.0.0.1}"
PORT="${PORT:-4200}"
UV_BIN="${UV_BIN:-uv}"
PYTHON_BIN="${PYTHON_BIN:-}"
PREFECT_BIN="${PREFECT_BIN:-}"

PREFECT_HOME="${PREFECT_HOME:-$PROJECT_ROOT/.prefect_home}"
PREFECT_API_URL="${PREFECT_API_URL:-http://${HOST_ADDRESS}:${PORT}/api}"

mkdir -p "$PREFECT_HOME"

export PREFECT_HOME
export PREFECT_API_URL

cd "$PROJECT_ROOT"

if [[ -n "$PYTHON_BIN" ]]; then
  "$PYTHON_BIN" "$SCRIPT_DIR/patch_prefect_sqlite_deployment_transactions.py"
else
  "$UV_BIN" run --frozen python \
    "$SCRIPT_DIR/patch_prefect_sqlite_deployment_transactions.py"
fi

if [[ -n "$PREFECT_BIN" ]]; then
  exec "$PREFECT_BIN" server start --host "$HOST_ADDRESS" --port "$PORT"
else
  exec "$UV_BIN" run --frozen prefect server start --host "$HOST_ADDRESS" --port "$PORT"
fi
