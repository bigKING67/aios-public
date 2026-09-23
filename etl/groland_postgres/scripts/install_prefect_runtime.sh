#!/usr/bin/env bash

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root (for example: sudo -i)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ETL_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
REPO_ROOT="${REPO_ROOT:-$(cd "$ETL_ROOT/../.." && pwd)}"
SERVICE_USER="${PREFECT_SERVICE_USER:-aios-prefect}"
SERVICE_GROUP="${PREFECT_SERVICE_GROUP:-$SERVICE_USER}"
RUNTIME_ENV_GROUP="${AIOS_RUNTIME_ENV_GROUP:-aios-runtime-env}"
RUNTIME_ENV_OPERATOR_USER="${AIOS_RUNTIME_ENV_OPERATOR_USER:-aios-operator}"
STATE_DIR="${PREFECT_STATE_DIR:-/var/lib/aios-prefect}"
RUNTIME_ROOT="${PREFECT_RUNTIME_ROOT:-/opt/aios-runtime/prefect}"
UV_BIN="${UV_BIN:-uv}"
RUNTIME_PYTHON="${PREFECT_RUNTIME_PYTHON:-}"
RUNTIME_PYTHON_VERSION="${PREFECT_RUNTIME_PYTHON_VERSION:-3.11.15}"
RUNTIME_PYTHON_DIR="${PREFECT_RUNTIME_PYTHON_DIR:-$RUNTIME_ROOT/python}"
RUNUSER_BIN="${RUNUSER_BIN:-runuser}"

for identity in "$SERVICE_USER" "$SERVICE_GROUP" "$RUNTIME_ENV_GROUP" "$RUNTIME_ENV_OPERATOR_USER"; do
  if [[ ! "$identity" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
    echo "Unsafe runtime user or group name: $identity" >&2
    exit 1
  fi
done

if [[ "$RUNTIME_ENV_GROUP" == "$SERVICE_GROUP" ]]; then
  echo "AIOS_RUNTIME_ENV_GROUP must remain separate from PREFECT_SERVICE_GROUP." >&2
  exit 1
fi

if ! id "$RUNTIME_ENV_OPERATOR_USER" >/dev/null 2>&1; then
  echo "Missing runtime env operator user: $RUNTIME_ENV_OPERATOR_USER" >&2
  exit 1
fi

if ! command -v "$UV_BIN" >/dev/null 2>&1; then
  echo "Missing uv executable: $UV_BIN" >&2
  exit 1
fi

if [[ ! "$RUNTIME_PYTHON_VERSION" =~ ^3\.11\.[0-9]+$ ]]; then
  echo "PREFECT_RUNTIME_PYTHON_VERSION must pin an exact Python 3.11 patch release." >&2
  exit 1
fi

RUNTIME_ROOT="$(readlink -m "$RUNTIME_ROOT")"
RUNTIME_PYTHON_DIR="$(readlink -m "$RUNTIME_PYTHON_DIR")"
case "$RUNTIME_PYTHON_DIR" in
  "$RUNTIME_ROOT"/*) ;;
  *)
    echo "PREFECT_RUNTIME_PYTHON_DIR must remain below PREFECT_RUNTIME_ROOT." >&2
    exit 1
    ;;
esac

if ! command -v "$RUNUSER_BIN" >/dev/null 2>&1; then
  echo "Missing runuser executable: $RUNUSER_BIN" >&2
  exit 1
fi

if [[ "$(git -C "$REPO_ROOT" branch --show-current)" != "main" ]]; then
  echo "Prefect runtime installation requires branch main." >&2
  exit 1
fi

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)" ]]; then
  echo "Prefect runtime installation refuses a dirty checkout." >&2
  exit 1
fi

runtime_python_source="explicit"
if [[ -z "$RUNTIME_PYTHON" ]]; then
  runtime_python_source="system"
  for candidate in /usr/bin/python3.11 /usr/local/bin/python3.11; do
    if [[ -x "$candidate" ]] && "$candidate" -c \
      'import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)'; then
      RUNTIME_PYTHON="$candidate"
      break
    fi
  done
fi

if [[ -z "$RUNTIME_PYTHON" ]]; then
  runtime_python_source="runtime-managed"
  install -d -o root -g root -m 0755 "$RUNTIME_ROOT" "$RUNTIME_PYTHON_DIR"
  UV_PYTHON_INSTALL_DIR="$RUNTIME_PYTHON_DIR" \
    "$UV_BIN" python install "$RUNTIME_PYTHON_VERSION" --no-bin
  RUNTIME_PYTHON="$(
    UV_PYTHON_INSTALL_DIR="$RUNTIME_PYTHON_DIR" \
      "$UV_BIN" python find "$RUNTIME_PYTHON_VERSION" \
        --managed-python --resolve-links --no-project
  )"
  chown -R root:root "$RUNTIME_PYTHON_DIR"
  chmod -R a+rX,go-w "$RUNTIME_PYTHON_DIR"
fi

if [[ ! -x "$RUNTIME_PYTHON" ]]; then
  echo "Missing executable runtime Python: $RUNTIME_PYTHON" >&2
  exit 1
fi

runtime_python_target="$(readlink -f "$RUNTIME_PYTHON")"
case "$runtime_python_target" in
  /root|/root/*)
    echo "Managed runtime interpreter must not resolve under /root: $runtime_python_target" >&2
    exit 1
    ;;
esac

runtime_python_full_version="$($RUNTIME_PYTHON -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
runtime_python_version="${runtime_python_full_version%.*}"
if [[ "$runtime_python_version" != "3.11" ]]; then
  echo "Managed Prefect runtime requires Python 3.11, found $runtime_python_full_version at $RUNTIME_PYTHON" >&2
  exit 1
fi
if [[ "$runtime_python_source" == "runtime-managed" && "$runtime_python_full_version" != "$RUNTIME_PYTHON_VERSION" ]]; then
  echo "Runtime-managed Python version drifted: expected $RUNTIME_PYTHON_VERSION, found $runtime_python_full_version" >&2
  exit 1
fi

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
RELEASE_DIR="$RUNTIME_ROOT/releases/$GIT_SHA"
TEMP_LINK="$RUNTIME_ROOT/.current.$GIT_SHA.$$"

if ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
  groupadd --system "$SERVICE_GROUP"
fi

if ! getent group "$RUNTIME_ENV_GROUP" >/dev/null 2>&1; then
  groupadd --system "$RUNTIME_ENV_GROUP"
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd \
    --system \
    --gid "$SERVICE_GROUP" \
    --home-dir "$STATE_DIR" \
    --shell /usr/sbin/nologin \
    "$SERVICE_USER"
fi

usermod --append --groups "$RUNTIME_ENV_GROUP" "$SERVICE_USER"
usermod --append --groups "$RUNTIME_ENV_GROUP" "$RUNTIME_ENV_OPERATOR_USER"

install -d -o root -g root -m 0755 "$RUNTIME_ROOT" "$RUNTIME_ROOT/releases"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0750 \
  "$STATE_DIR" "$STATE_DIR/prefect-home" "$STATE_DIR/watchdog" "$STATE_DIR/backups"

if [[ ! -x "$RELEASE_DIR/venv/bin/prefect" ]]; then
  install -d -o root -g root -m 0755 "$RELEASE_DIR"
  UV_PROJECT_ENVIRONMENT="$RELEASE_DIR/venv" \
  UV_PYTHON="$RUNTIME_PYTHON" \
  UV_NO_MANAGED_PYTHON=1 \
  UV_PYTHON_DOWNLOADS=never \
    "$UV_BIN" sync --project "$ETL_ROOT" --frozen --no-dev
fi

installed_version="$($RELEASE_DIR/venv/bin/python -c 'import importlib.metadata; print(importlib.metadata.version("prefect"))')"
if [[ "$installed_version" != "3.7.8" ]]; then
  echo "Managed runtime Prefect version drifted: $installed_version" >&2
  exit 1
fi

runtime_python_target="$(readlink -f "$RELEASE_DIR/venv/bin/python")"
case "$runtime_python_target" in
  /root|/root/*)
    echo "Managed runtime interpreter must not resolve under /root: $runtime_python_target" >&2
    exit 1
    ;;
esac

chown -R root:root "$RELEASE_DIR"
chmod -R go-w "$RELEASE_DIR"

if ! "$RUNUSER_BIN" --user "$SERVICE_USER" -- \
  "$RELEASE_DIR/venv/bin/python" -c \
  'import importlib.metadata, prefect; assert importlib.metadata.version("prefect") == prefect.__version__ == "3.7.8"'; then
  echo "Managed runtime is not executable by service user $SERVICE_USER." >&2
  exit 1
fi

ln -s "$RELEASE_DIR" "$TEMP_LINK"
mv -Tf "$TEMP_LINK" "$RUNTIME_ROOT/current"

echo "Prefect managed runtime installed:"
echo "  git_sha=$GIT_SHA"
echo "  release=$RELEASE_DIR"
echo "  prefect_version=$installed_version"
echo "  runtime_python=$runtime_python_target"
echo "  runtime_python_source=$runtime_python_source"
echo "  service_user=$SERVICE_USER"
echo "  runtime_env_group=$RUNTIME_ENV_GROUP"
echo "  runtime_env_operator=$RUNTIME_ENV_OPERATOR_USER"
