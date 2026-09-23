#!/usr/bin/env bash

set -euo pipefail

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found. This script must run on a systemd-based Linux host." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (for example: sudo -i)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ETL_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
REPO_ROOT="${REPO_ROOT:-$(cd "$ETL_ROOT/../.." && pwd)}"

ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.feishu-sync.vps}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
SERVICE_PREFIX="${SERVICE_PREFIX:-aios-feishu-sync}"
SERVICE_NAME="${SERVICE_PREFIX}.service"
SYSTEMD_USER="${SYSTEMD_USER:-root}"
SYSTEMD_GROUP="${SYSTEMD_GROUP:-$SYSTEMD_USER}"
UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/uv-cache}"

ENABLE_ON_BOOT="${ENABLE_ON_BOOT:-1}"
START_NOW="${START_NOW:-1}"

SCHEDULER_SCRIPT="$ETL_ROOT/scripts/run_feishu_sync_scheduler.sh"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [ ! -x "$SCHEDULER_SCRIPT" ]; then
  echo "Missing executable script: $SCHEDULER_SCRIPT" >&2
  exit 1
fi

mkdir -p "$SYSTEMD_DIR"
mkdir -p "$UV_CACHE_DIR"
touch /var/log/aios_feishu_sync.log
chown "$SYSTEMD_USER:$SYSTEMD_GROUP" /var/log/aios_feishu_sync.log
chown -R "$SYSTEMD_USER:$SYSTEMD_GROUP" "$UV_CACHE_DIR"

cat > "$SYSTEMD_DIR/$SERVICE_NAME" <<EOF
[Unit]
Description=AIOS Feishu Sync Scheduler
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SYSTEMD_USER
Group=$SYSTEMD_GROUP
WorkingDirectory=$REPO_ROOT
Environment=PROJECT_ROOT=$ETL_ROOT
Environment=UV_CACHE_DIR=$UV_CACHE_DIR
ExecStart=/bin/bash -lc 'set -a; [ -f "$ENV_FILE" ] && source "$ENV_FILE"; set +a; export PROJECT_ROOT="$ETL_ROOT"; export UV_CACHE_DIR="$UV_CACHE_DIR"; exec "$SCHEDULER_SCRIPT" --env-file "$ENV_FILE"'
Restart=always
RestartSec=10
TimeoutStopSec=30
StandardOutput=append:/var/log/aios_feishu_sync.log
StandardError=append:/var/log/aios_feishu_sync.log

[Install]
WantedBy=multi-user.target
EOF

chmod 0644 "$SYSTEMD_DIR/$SERVICE_NAME"
systemctl daemon-reload

if [ "$ENABLE_ON_BOOT" = "1" ]; then
  systemctl enable "$SERVICE_NAME"
fi

if [ "$START_NOW" = "1" ]; then
  systemctl restart "$SERVICE_NAME"
fi

echo
echo "Installed systemd service:"
echo "  - $SERVICE_NAME"
echo
echo "Useful commands:"
echo "  systemctl status $SERVICE_NAME --no-pager"
echo "  journalctl -u $SERVICE_NAME -f"
