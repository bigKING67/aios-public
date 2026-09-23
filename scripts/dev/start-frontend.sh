#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

load_optional_env_file() {
  local env_file="$1"
  if [ ! -f "$env_file" ]; then
    return 0
  fi
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
}

load_optional_env_file "$PROJECT_ROOT/.env.local"

FRONTEND_PORT="${VITE_PORT:-3000}"
API_GATEWAY_TARGET="${VITE_API_GATEWAY_TARGET:-http://localhost:8000}"
FRONTEND_MODE="${AIOS_DEV_FRONTEND_MODE:-local}"

if [ "$FRONTEND_MODE" = "vps-api" ]; then
  API_GATEWAY_TARGET="${AIOS_VPS_API_URL:-${VITE_API_GATEWAY_TARGET:-}}"
  if [ -z "$API_GATEWAY_TARGET" ]; then
    echo "[frontend] vps-api mode requires VITE_API_GATEWAY_TARGET or AIOS_VPS_API_URL" >&2
    exit 1
  fi
  case "$API_GATEWAY_TARGET" in
    http://127.0.0.1|http://127.0.0.1/*|http://127.0.0.1:*|https://127.0.0.1|https://127.0.0.1/*|https://127.0.0.1:*|http://localhost|http://localhost/*|http://localhost:*|https://localhost|https://localhost/*|https://localhost:*|http://\[::1\]|http://\[::1\]/*|http://\[::1\]:*|https://\[::1\]|https://\[::1\]/*|https://\[::1\]:*)
      echo "[frontend] vps-api mode refuses loopback target: $API_GATEWAY_TARGET" >&2
      exit 1
      ;;
  esac
  if ! curl -fsS --max-time "${VPS_API_HEALTH_TIMEOUT_SECONDS:-8}" "${API_GATEWAY_TARGET%/}/health" >/dev/null; then
    echo "[frontend] VPS backend health check failed: ${API_GATEWAY_TARGET%/}/health" >&2
    exit 1
  fi
elif [ "$FRONTEND_MODE" != "local" ]; then
  echo "[frontend] unsupported AIOS_DEV_FRONTEND_MODE: $FRONTEND_MODE" >&2
  exit 1
fi

export VITE_API_GATEWAY_TARGET="$API_GATEWAY_TARGET"

echo "[frontend] starting AIOS Vite dev server"
echo "[frontend] project root: $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"

if [ ! -d "node_modules" ]; then
  echo "[frontend] node_modules missing; installing dependencies with npm ci"
  npm ci
fi

echo ""
echo "[frontend] app: http://localhost:${FRONTEND_PORT}"
echo "[frontend] API gateway target: ${API_GATEWAY_TARGET}"
echo "[frontend] mode: ${FRONTEND_MODE}"
echo ""

npm run dev
