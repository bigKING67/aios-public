#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend-rust"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_MODE="${AIOS_DEV_BACKEND_MODE:-local}"
runtime_read_only_was_set=0
runtime_read_only_override=""
if [ "${AIOS_RUNTIME_READ_ONLY+x}" = "x" ]; then
  runtime_read_only_was_set=1
  runtime_read_only_override="$AIOS_RUNTIME_READ_ONLY"
fi
database_url_was_set=0
database_url_override=""
if [ "${DATABASE_URL+x}" = "x" ]; then
  database_url_was_set=1
  database_url_override="$DATABASE_URL"
fi

load_rust_env() {
  if command -v cargo > /dev/null 2>&1; then
    return 0
  fi

  if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck disable=SC1090
    . "$HOME/.cargo/env"
  fi
}

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

echo "🚀 启动 AIOS Rust 后端..."
echo "项目目录: $PROJECT_ROOT"
echo "后端目录: $BACKEND_DIR"
echo ""

load_rust_env
if ! command -v cargo > /dev/null 2>&1; then
  echo "❌ 未检测到 cargo，请先安装 Rust toolchain: https://rustup.rs"
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  if [ -f "$BACKEND_DIR/.env.example" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    echo "⚠️  已从 .env.example 生成 backend-rust/.env"
    echo "   请先补齐 DATABASE_URL / SECRET_KEY / LLM keys 后重试。"
    exit 1
  fi
  echo "❌ backend-rust/.env 缺失且找不到 .env.example"
  exit 1
fi

load_optional_env_file "$PROJECT_ROOT/.env.local"
load_optional_env_file "$PROJECT_ROOT/.env.content-assets.local"
if [ "$runtime_read_only_was_set" = "1" ]; then
  export AIOS_RUNTIME_READ_ONLY="$runtime_read_only_override"
fi
if [ "$database_url_was_set" = "1" ]; then
  export DATABASE_URL="$database_url_override"
fi

case "$BACKEND_MODE" in
  local)
    ;;
  vps-prefect)
    remote_prefect_api_url="${AIOS_VPS_PREFECT_API_URL:-${DATAOPS_PREFECT_API_URL:-}}"
    if [ -z "$remote_prefect_api_url" ]; then
      echo "❌ vps-prefect 模式需要在 .env.local 配置 AIOS_VPS_PREFECT_API_URL" >&2
      exit 1
    fi
    export DATAOPS_PREFECT_API_URL="$remote_prefect_api_url"
    PREFECT_REMOTE_REQUIRE_NON_LOCAL=1 \
      bash "$PROJECT_ROOT/scripts/dataops/check-prefect-remote.sh" "$DATAOPS_PREFECT_API_URL"
    if [ -z "${DATABASE_URL:-}" ]; then
      echo "❌ vps-prefect 模式需要通过进程环境或 .env.local 配置 DATABASE_URL" >&2
      exit 1
    fi
    bash "$PROJECT_ROOT/scripts/dataops/check-postgres-remote.sh" "$DATABASE_URL"
    ;;
  *)
    echo "❌ 不支持的 AIOS_DEV_BACKEND_MODE: $BACKEND_MODE" >&2
    echo "支持值: local, vps-prefect" >&2
    exit 1
    ;;
esac

port_processes="$(lsof -nP -iTCP:${BACKEND_PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$port_processes" ]; then
  existing_pids="$(echo "$port_processes" | awk 'NR>1 {print $2}' | sort -u | xargs)"
  echo "❌ 端口 ${BACKEND_PORT} 已被占用，后端无法启动"
  echo "$port_processes"
  echo "请先结束占用进程后重试：kill ${existing_pids}"
  exit 1
fi

cd "$BACKEND_DIR"

echo "📍 Health Check: http://localhost:${BACKEND_PORT}/health"
echo "📍 Backend mode: ${BACKEND_MODE}"
if [ "$BACKEND_MODE" = "vps-prefect" ]; then
  echo "📍 Prefect API: ${DATAOPS_PREFECT_API_URL%/}"
fi
echo ""

exec bash "$PROJECT_ROOT/scripts/backend-rust/cargo-with-cache.sh" run --bin aios-backend-rust
