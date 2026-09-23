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

ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.vps}"
OPERATIONS_ENV_FILE="${PREFECT_OPERATIONS_ENV_FILE:-/etc/aios/prefect-control-plane-operations.env}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
SERVICE_PREFIX="${SERVICE_PREFIX:-aios-prefect}"
SERVER_SERVICE="${SERVICE_PREFIX}-server.service"
WORKER_SERVICE="${SERVICE_PREFIX}-worker.service"
SYSTEMD_USER="${SYSTEMD_USER:-aios-prefect}"
SYSTEMD_GROUP="${SYSTEMD_GROUP:-$SYSTEMD_USER}"
RUNTIME_ENV_GROUP="${AIOS_RUNTIME_ENV_GROUP:-aios-runtime-env}"
STATE_DIR="${PREFECT_STATE_DIR:-/var/lib/aios-prefect}"
RUNTIME_CURRENT="${PREFECT_RUNTIME_CURRENT:-/opt/aios-runtime/prefect/current}"
PYTHON_BIN="${PYTHON_BIN:-$RUNTIME_CURRENT/venv/bin/python}"
PREFECT_BIN="${PREFECT_BIN:-$RUNTIME_CURRENT/venv/bin/prefect}"

if [[ ! "$RUNTIME_ENV_GROUP" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
  echo "Unsafe AIOS_RUNTIME_ENV_GROUP: $RUNTIME_ENV_GROUP" >&2
  exit 1
fi

if [[ "$RUNTIME_ENV_GROUP" == "$SYSTEMD_GROUP" ]]; then
  echo "AIOS_RUNTIME_ENV_GROUP must remain separate from SYSTEMD_GROUP." >&2
  exit 1
fi

HOST_ADDRESS="${HOST_ADDRESS:-127.0.0.1}"
PORT="${PORT:-4200}"
POOL_NAME="${POOL_NAME:-default-agent-pool}"
POOL_TYPE="${POOL_TYPE:-process}"
ALLOW_PUBLIC_PREFECT_BIND="${ALLOW_PUBLIC_PREFECT_BIND:-0}"

case "$HOST_ADDRESS" in
  0.0.0.0|::|\[::\])
    if [ "$ALLOW_PUBLIC_PREFECT_BIND" != "1" ]; then
      echo "Refusing public Prefect bind address $HOST_ADDRESS." >&2
      echo "Use the VPS Tailscale 100.x address, or set ALLOW_PUBLIC_PREFECT_BIND=1 only for an explicitly protected network boundary." >&2
      exit 1
    fi
    ;;
esac

ENABLE_ON_BOOT="${ENABLE_ON_BOOT:-1}"
START_NOW="${START_NOW:-1}"

SERVER_SCRIPT="$ETL_ROOT/scripts/start_prefect_server.sh"
WORKER_SCRIPT="$ETL_ROOT/scripts/start_prefect_worker.sh"
WATCHDOG_SCRIPT="$ETL_ROOT/scripts/prefect_control_plane_watchdog.py"
WATCHDOG_SERVICE="${SERVICE_PREFIX}-watchdog.service"
WATCHDOG_TIMER="${SERVICE_PREFIX}-watchdog.timer"
BACKUP_SCRIPT="$ETL_ROOT/scripts/backup_prefect_control_plane.sh"
BACKUP_SERVICE="${SERVICE_PREFIX}-backup.service"
BACKUP_TIMER="${SERVICE_PREFIX}-backup.timer"
RESTORE_VERIFY_SCRIPT="$ETL_ROOT/scripts/verify_prefect_control_plane_restore.sh"
RESTORE_VERIFY_SERVICE="${SERVICE_PREFIX}-restore-verify.service"
RESTORE_VERIFY_TIMER="${SERVICE_PREFIX}-restore-verify.timer"

if [ ! -x "$SERVER_SCRIPT" ]; then
  echo "Missing executable script: $SERVER_SCRIPT" >&2
  exit 1
fi

if [ ! -x "$WORKER_SCRIPT" ]; then
  echo "Missing executable script: $WORKER_SCRIPT" >&2
  exit 1
fi

if [ ! -f "$WATCHDOG_SCRIPT" ]; then
  echo "Missing watchdog script: $WATCHDOG_SCRIPT" >&2
  exit 1
fi

for required_script in "$BACKUP_SCRIPT" "$RESTORE_VERIFY_SCRIPT"; do
  if [ ! -f "$required_script" ]; then
    echo "Missing Prefect control-plane operation script: $required_script" >&2
    exit 1
  fi
done

if ! id "$SYSTEMD_USER" >/dev/null 2>&1; then
  echo "Missing service user $SYSTEMD_USER. Run install_prefect_runtime.sh first." >&2
  exit 1
fi

if ! getent group "$RUNTIME_ENV_GROUP" >/dev/null 2>&1; then
  echo "Missing shared runtime env group $RUNTIME_ENV_GROUP. Run install_prefect_runtime.sh first." >&2
  exit 1
fi

for executable in "$PYTHON_BIN" "$PREFECT_BIN"; do
  if [ ! -x "$executable" ]; then
    echo "Missing managed Prefect runtime executable: $executable" >&2
    exit 1
  fi
done

mkdir -p "$SYSTEMD_DIR"
install -d -o "$SYSTEMD_USER" -g "$SYSTEMD_GROUP" -m 0750 \
  "$STATE_DIR" "$STATE_DIR/prefect-home" "$STATE_DIR/watchdog"
install -d -o root -g root -m 0700 \
  "$STATE_DIR/backups" "$STATE_DIR/restore-verifications"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing shared Prefect runtime env: $ENV_FILE" >&2
  exit 1
fi
if grep -Eq \
  '^[[:space:]]*(export[[:space:]]+)?(PREFECT_DB_PASSWORD|PREFECT_BACKUP_RESTORE_ADMIN_URL)[[:space:]]*=' \
  "$ENV_FILE"; then
  echo "Shared Prefect runtime env must not contain bootstrap or restore-admin credentials: $ENV_FILE" >&2
  echo "Move them to the root-only operations env: $OPERATIONS_ENV_FILE" >&2
  exit 1
fi

unsafe_env_consumers=()
while IFS= read -r -d '' unit_path; do
  if ! grep -Fq -- "$ENV_FILE" "$unit_path"; then
    continue
  fi

  unit_name="$(basename "$unit_path")"
  if ! unit_properties="$(systemctl show "$unit_name" --no-pager \
    --property=LoadState \
    --property=User \
    --property=Group \
    --property=SupplementaryGroups)"; then
    echo "Unable to inspect shared env consumer: $unit_name" >&2
    exit 1
  fi

  load_state="$(printf '%s\n' "$unit_properties" | sed -n 's/^LoadState=//p')"
  unit_user="$(printf '%s\n' "$unit_properties" | sed -n 's/^User=//p')"
  unit_group="$(printf '%s\n' "$unit_properties" | sed -n 's/^Group=//p')"
  unit_supplementary_groups="$(printf '%s\n' "$unit_properties" | sed -n 's/^SupplementaryGroups=//p')"

  if [[ "$load_state" != "loaded" ]]; then
    echo "Shared env consumer is not loaded by systemd: $unit_name (LoadState=${load_state:-unknown})" >&2
    exit 1
  fi
  if [[ -z "$unit_user" || "$unit_user" == "root" || "$unit_group" == "$RUNTIME_ENV_GROUP" ]]; then
    continue
  fi
  if [[ " $unit_supplementary_groups " == *" $RUNTIME_ENV_GROUP "* ]]; then
    continue
  fi
  unsafe_env_consumers+=("$unit_name(User=$unit_user Group=${unit_group:-default} SupplementaryGroups=${unit_supplementary_groups:-none})")
done < <(find "$SYSTEMD_DIR" -maxdepth 1 \( -type f -o -type l \) -print0)

if [[ ${#unsafe_env_consumers[@]} -gt 0 ]]; then
  echo "Refusing to change shared runtime env ownership; non-root systemd consumers lack $RUNTIME_ENV_GROUP:" >&2
  printf '  - %s\n' "${unsafe_env_consumers[@]}" >&2
  echo "Regenerate each consumer with Group= or SupplementaryGroups=$RUNTIME_ENV_GROUP, daemon-reload, and retry." >&2
  exit 1
fi

if ! (
  unset PREFECT_API_DATABASE_CONNECTION_URL PREFECT_DB_PASSWORD PREFECT_BACKUP_RESTORE_ADMIN_URL
  set -a
  source "$ENV_FILE"
  set +a
  [[ -z "${PREFECT_DB_PASSWORD:-}" ]]
  [[ -z "${PREFECT_BACKUP_RESTORE_ADMIN_URL:-}" ]]
  "$PYTHON_BIN" "$SCRIPT_DIR/prefect_postgres_connection.py" \
    --env-key PREFECT_API_DATABASE_CONNECTION_URL >/dev/null
); then
  echo "Shared Prefect runtime env must resolve without privileged credentials and with a valid PostgreSQL PREFECT_API_DATABASE_CONNECTION_URL." >&2
  exit 1
fi

if [ ! -f "$OPERATIONS_ENV_FILE" ]; then
  echo "Missing root-only Prefect operations env: $OPERATIONS_ENV_FILE" >&2
  exit 1
fi
if ! (
  unset PREFECT_DB_PASSWORD PREFECT_BACKUP_RESTORE_ADMIN_URL
  set -a
  source "$OPERATIONS_ENV_FILE"
  set +a
  [[ -n "${PREFECT_DB_PASSWORD:-}" ]]
  [[ -n "${PREFECT_BACKUP_RESTORE_ADMIN_URL:-}" ]]
); then
  echo "Prefect operations env must define non-empty PREFECT_DB_PASSWORD and PREFECT_BACKUP_RESTORE_ADMIN_URL." >&2
  exit 1
fi

chown root:"$RUNTIME_ENV_GROUP" "$ENV_FILE"
chmod 0640 "$ENV_FILE"
chown root:root "$OPERATIONS_ENV_FILE"
chmod 0600 "$OPERATIONS_ENV_FILE"

cat > "$SYSTEMD_DIR/$SERVER_SERVICE" <<EOF
[Unit]
Description=AIOS Prefect Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SYSTEMD_USER
Group=$SYSTEMD_GROUP
SupplementaryGroups=$RUNTIME_ENV_GROUP
WorkingDirectory=$ETL_ROOT
Environment=PROJECT_ROOT=$ETL_ROOT
Environment=HOST_ADDRESS=$HOST_ADDRESS
Environment=PORT=$PORT
Environment=PREFECT_HOME=$STATE_DIR/prefect-home
Environment=PYTHON_BIN=$PYTHON_BIN
Environment=PREFECT_BIN=$PREFECT_BIN
Environment=PREFECT_SERVER_SERVICES_DB_VACUUM_ENABLED=events,flow_runs
Environment=PREFECT_SERVER_SERVICES_DB_VACUUM_RETENTION_PERIOD=P90D
Environment=PREFECT_SERVER_EVENTS_RETENTION_PERIOD=P7D
ExecStart=/bin/bash -lc 'set -a; [ -f "$ENV_FILE" ] && source "$ENV_FILE"; set +a; export PROJECT_ROOT="$ETL_ROOT"; export HOST_ADDRESS="$HOST_ADDRESS"; export PORT="$PORT"; export PREFECT_HOME="$STATE_DIR/prefect-home"; export PYTHON_BIN="$PYTHON_BIN"; export PREFECT_BIN="$PREFECT_BIN"; export PREFECT_API_URL="\${DATAOPS_PREFECT_API_URL:-http://$HOST_ADDRESS:$PORT/api}"; exec "$SERVER_SCRIPT"'
Restart=always
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_PREFIX-server

[Install]
WantedBy=multi-user.target
EOF

cat > "$SYSTEMD_DIR/$WORKER_SERVICE" <<EOF
[Unit]
Description=AIOS Prefect Worker
After=network-online.target $SERVER_SERVICE
Wants=network-online.target $SERVER_SERVICE

[Service]
Type=simple
User=$SYSTEMD_USER
Group=$SYSTEMD_GROUP
SupplementaryGroups=$RUNTIME_ENV_GROUP
WorkingDirectory=$ETL_ROOT
Environment=PROJECT_ROOT=$ETL_ROOT
Environment=HOST_ADDRESS=$HOST_ADDRESS
Environment=PORT=$PORT
Environment=POOL_NAME=$POOL_NAME
Environment=POOL_TYPE=$POOL_TYPE
Environment=PREFECT_HOME=$STATE_DIR/prefect-home
Environment=PYTHON_BIN=$PYTHON_BIN
Environment=PREFECT_BIN=$PREFECT_BIN
ExecStart=/bin/bash -lc 'set -a; [ -f "$ENV_FILE" ] && source "$ENV_FILE"; set +a; export PROJECT_ROOT="$ETL_ROOT"; export HOST_ADDRESS="$HOST_ADDRESS"; export PORT="$PORT"; export POOL_NAME="$POOL_NAME"; export POOL_TYPE="$POOL_TYPE"; export PREFECT_HOME="$STATE_DIR/prefect-home"; export PYTHON_BIN="$PYTHON_BIN"; export PREFECT_BIN="$PREFECT_BIN"; export PREFECT_API_URL="\${DATAOPS_PREFECT_API_URL:-http://$HOST_ADDRESS:$PORT/api}"; exec "$WORKER_SCRIPT"'
Restart=always
RestartSec=8
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_PREFIX-worker

[Install]
WantedBy=multi-user.target
EOF

cat > "$SYSTEMD_DIR/$WATCHDOG_SERVICE" <<EOF
[Unit]
Description=AIOS Prefect external control-plane watchdog
After=network-online.target $SERVER_SERVICE
Wants=network-online.target

[Service]
Type=oneshot
User=$SYSTEMD_USER
Group=$SYSTEMD_GROUP
SupplementaryGroups=$RUNTIME_ENV_GROUP
WorkingDirectory=$ETL_ROOT
Environment=PREFECT_WATCHDOG_STATE_PATH=$STATE_DIR/watchdog/state.json
ExecStart=/bin/bash -lc 'set -a; [ -f "$ENV_FILE" ] && source "$ENV_FILE"; set +a; export PREFECT_API_URL="\${DATAOPS_PREFECT_API_URL:-http://$HOST_ADDRESS:$PORT/api}"; exec "$PYTHON_BIN" "$WATCHDOG_SCRIPT" --api-url "\$PREFECT_API_URL" --mode "\${PREFECT_WATCHDOG_CONTROL_PLANE_MODE:-legacy}" --state-path "$STATE_DIR/watchdog/state.json"'
NoNewPrivileges=true
PrivateTmp=true
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_PREFIX-watchdog
EOF

cat > "$SYSTEMD_DIR/$WATCHDOG_TIMER" <<EOF
[Unit]
Description=Run AIOS Prefect external watchdog every five minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s
Persistent=true
Unit=$WATCHDOG_SERVICE

[Install]
WantedBy=timers.target
EOF

cat > "$SYSTEMD_DIR/$BACKUP_SERVICE" <<EOF
[Unit]
Description=Back up the AIOS Prefect control plane
After=network-online.target $SERVER_SERVICE
Wants=network-online.target

[Service]
Type=oneshot
User=root
Group=root
WorkingDirectory=$ETL_ROOT
Environment=PREFECT_BACKUP_ROOT=$STATE_DIR/backups
ExecStart=/bin/bash -lc 'set -a; [ -f "$ENV_FILE" ] && source "$ENV_FILE"; set +a; export PROJECT_ROOT="$ETL_ROOT"; export PREFECT_BACKUP_ROOT="$STATE_DIR/backups"; export PYTHON_BIN="$PYTHON_BIN"; exec "$BACKUP_SCRIPT"'
NoNewPrivileges=true
PrivateTmp=true
UMask=0077
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_PREFIX-backup
EOF

cat > "$SYSTEMD_DIR/$BACKUP_TIMER" <<EOF
[Unit]
Description=Run the AIOS Prefect control-plane backup daily

[Timer]
OnCalendar=*-*-* 02:15:00
RandomizedDelaySec=5min
Persistent=true
Unit=$BACKUP_SERVICE

[Install]
WantedBy=timers.target
EOF

cat > "$SYSTEMD_DIR/$RESTORE_VERIFY_SERVICE" <<EOF
[Unit]
Description=Verify a AIOS Prefect control-plane backup by restoring it
After=network-online.target $BACKUP_SERVICE
Wants=network-online.target

[Service]
Type=oneshot
User=root
Group=root
WorkingDirectory=$ETL_ROOT
Environment=PREFECT_BACKUP_ROOT=$STATE_DIR/backups
Environment=PREFECT_RESTORE_STATE_DIR=$STATE_DIR/restore-verifications
ExecStart=/bin/bash -lc 'set -a; [ -f "$ENV_FILE" ] && source "$ENV_FILE"; source "$OPERATIONS_ENV_FILE"; set +a; export PREFECT_BACKUP_ROOT="$STATE_DIR/backups"; export PREFECT_RESTORE_STATE_DIR="$STATE_DIR/restore-verifications"; export PYTHON_BIN="$PYTHON_BIN"; exec "$RESTORE_VERIFY_SCRIPT"'
NoNewPrivileges=true
PrivateTmp=true
UMask=0077
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_PREFIX-restore-verify
EOF

cat > "$SYSTEMD_DIR/$RESTORE_VERIFY_TIMER" <<EOF
[Unit]
Description=Run the AIOS Prefect control-plane restore verification weekly

[Timer]
OnCalendar=Sun *-*-* 04:10:00
RandomizedDelaySec=10min
Persistent=true
Unit=$RESTORE_VERIFY_SERVICE

[Install]
WantedBy=timers.target
EOF

chmod 0644 \
  "$SYSTEMD_DIR/$SERVER_SERVICE" \
  "$SYSTEMD_DIR/$WORKER_SERVICE" \
  "$SYSTEMD_DIR/$WATCHDOG_SERVICE" \
  "$SYSTEMD_DIR/$WATCHDOG_TIMER" \
  "$SYSTEMD_DIR/$BACKUP_SERVICE" \
  "$SYSTEMD_DIR/$BACKUP_TIMER" \
  "$SYSTEMD_DIR/$RESTORE_VERIFY_SERVICE" \
  "$SYSTEMD_DIR/$RESTORE_VERIFY_TIMER"

systemctl daemon-reload

if [ "$ENABLE_ON_BOOT" = "1" ]; then
  systemctl enable \
    "$SERVER_SERVICE" \
    "$WORKER_SERVICE" \
    "$WATCHDOG_TIMER" \
    "$BACKUP_TIMER" \
    "$RESTORE_VERIFY_TIMER"
fi

if [ "$START_NOW" = "1" ]; then
  systemctl restart "$SERVER_SERVICE"
  systemctl restart "$WORKER_SERVICE"
  systemctl restart "$WATCHDOG_TIMER"
  systemctl restart "$BACKUP_TIMER"
  systemctl restart "$RESTORE_VERIFY_TIMER"
fi

echo
echo "Installed systemd services:"
echo "  - $SERVER_SERVICE"
echo "  - $WORKER_SERVICE"
echo "  - $WATCHDOG_SERVICE"
echo "  - $WATCHDOG_TIMER"
echo "  - $BACKUP_SERVICE"
echo "  - $BACKUP_TIMER"
echo "  - $RESTORE_VERIFY_SERVICE"
echo "  - $RESTORE_VERIFY_TIMER"
echo
echo "Useful commands:"
echo "  systemctl status $SERVER_SERVICE --no-pager"
echo "  systemctl status $WORKER_SERVICE --no-pager"
echo "  journalctl -u $SERVER_SERVICE -f"
echo "  journalctl -u $WORKER_SERVICE -f"
echo "  journalctl -u $WATCHDOG_SERVICE -n 100 --no-pager"
echo "  journalctl -u $BACKUP_SERVICE -n 100 --no-pager"
echo "  journalctl -u $RESTORE_VERIFY_SERVICE -n 100 --no-pager"
