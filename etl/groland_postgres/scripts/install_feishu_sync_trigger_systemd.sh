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
SERVICE_NAME="${SERVICE_PREFIX}-trigger.service"
SYSTEMD_USER="${SYSTEMD_USER:-root}"
SYSTEMD_GROUP="${SYSTEMD_GROUP:-$SYSTEMD_USER}"
UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/uv-cache}"
LOG_FILE="${LOG_FILE:-/var/log/aios_feishu_sync.log}"
TRIGGER_BIND="${TRIGGER_BIND:-0.0.0.0}"
TRIGGER_PORT="${TRIGGER_PORT:-17888}"
TRIGGER_ALLOWED_CIDRS="${TRIGGER_ALLOWED_CIDRS:-172.16.0.0/12,127.0.0.1/32}"
TRIGGER_SERVER_SCRIPT="${TRIGGER_SERVER_SCRIPT:-$ETL_ROOT/scripts/feishu_sync_trigger_server.py}"
RUN_SYNC_SCRIPT="${RUN_SYNC_SCRIPT:-$ETL_ROOT/scripts/run_feishu_sync.sh}"
UNIT_PREFIX="${UNIT_PREFIX:-${SERVICE_PREFIX}-manual}"

ENABLE_ON_BOOT="${ENABLE_ON_BOOT:-1}"
START_NOW="${START_NOW:-1}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$TRIGGER_SERVER_SCRIPT" ]; then
  echo "Missing trigger server script: $TRIGGER_SERVER_SCRIPT" >&2
  exit 1
fi

if [ ! -x "$RUN_SYNC_SCRIPT" ]; then
  echo "Missing executable sync script: $RUN_SYNC_SCRIPT" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${DATAOPS_FEISHU_SYNC_TRIGGER_TOKEN:-${FEISHU_SYNC_TRIGGER_TOKEN:-}}" ]; then
  echo "Missing trigger token in env file: DATAOPS_FEISHU_SYNC_TRIGGER_TOKEN (or FEISHU_SYNC_TRIGGER_TOKEN)" >&2
  exit 1
fi

mkdir -p "$SYSTEMD_DIR"
mkdir -p "$UV_CACHE_DIR"
touch "$LOG_FILE"
chown "$SYSTEMD_USER:$SYSTEMD_GROUP" "$LOG_FILE"
chown -R "$SYSTEMD_USER:$SYSTEMD_GROUP" "$UV_CACHE_DIR"

cat > "$SYSTEMD_DIR/$SERVICE_NAME" <<EOF
[Unit]
Description=AIOS Feishu Sync Trigger API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SYSTEMD_USER
Group=$SYSTEMD_GROUP
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$ENV_FILE
Environment=FEISHU_SYNC_ENV_FILE=$ENV_FILE
Environment=FEISHU_SYNC_REPO_ROOT=$REPO_ROOT
Environment=FEISHU_SYNC_PROJECT_ROOT=$ETL_ROOT
Environment=FEISHU_SYNC_RUN_SCRIPT=$RUN_SYNC_SCRIPT
Environment=FEISHU_SYNC_UV_CACHE_DIR=$UV_CACHE_DIR
Environment=FEISHU_SYNC_LOG_FILE=$LOG_FILE
Environment=FEISHU_SYNC_TRIGGER_BIND=$TRIGGER_BIND
Environment=FEISHU_SYNC_TRIGGER_PORT=$TRIGGER_PORT
Environment=FEISHU_SYNC_TRIGGER_ALLOWED_CIDRS=$TRIGGER_ALLOWED_CIDRS
Environment=FEISHU_SYNC_SYSTEMD_USER=$SYSTEMD_USER
Environment=FEISHU_SYNC_SYSTEMD_GROUP=$SYSTEMD_GROUP
Environment=FEISHU_SYNC_SYSTEMD_UNIT_PREFIX=$UNIT_PREFIX
ExecStart=/usr/bin/python3 $TRIGGER_SERVER_SCRIPT
Restart=always
RestartSec=5
NoNewPrivileges=true
TimeoutStopSec=15
StandardOutput=append:$LOG_FILE
StandardError=append:$LOG_FILE

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
echo "Installed trigger service:"
echo "  - $SERVICE_NAME"
echo
echo "Useful commands:"
echo "  systemctl status $SERVICE_NAME --no-pager"
echo "  journalctl -u $SERVICE_NAME -f"
echo
echo "Web container env suggestions:"
echo "  DATAOPS_FEISHU_SYNC_TRIGGER_URL=http://host.docker.internal:$TRIGGER_PORT/trigger"
echo "  DATAOPS_FEISHU_SYNC_TRIGGER_TOKEN=<same token as $ENV_FILE>"
echo "  DATAOPS_FEISHU_SYNC_TRIGGER_TIMEOUT_MS=10000"
