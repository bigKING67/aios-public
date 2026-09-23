#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${PREFECT_BACKUP_ROOT:-/var/lib/aios-prefect/backups}"
RESTORE_STATE_DIR="${PREFECT_RESTORE_STATE_DIR:-/var/lib/aios-prefect/restore-verifications}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
CREATEDB_BIN="${CREATEDB_BIN:-createdb}"
DROPDB_BIN="${DROPDB_BIN:-dropdb}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
PSQL_BIN="${PSQL_BIN:-psql}"

if [[ "$(id -u)" -ne 0 && "${ALLOW_NON_ROOT_PREFECT_RESTORE_VERIFY:-0}" != "1" ]]; then
  echo "Run as root or set ALLOW_NON_ROOT_PREFECT_RESTORE_VERIFY=1 for a controlled fixture." >&2
  exit 1
fi

: "${PREFECT_BACKUP_RESTORE_ADMIN_URL:?Missing PREFECT_BACKUP_RESTORE_ADMIN_URL}"

BACKUP_ROOT="$(
  "$PYTHON_BIN" "$SCRIPT_DIR/prefect_filesystem_safety.py" \
    --path "$BACKUP_ROOT" \
    --label PREFECT_BACKUP_ROOT
)"
RESTORE_STATE_DIR="$(
  "$PYTHON_BIN" "$SCRIPT_DIR/prefect_filesystem_safety.py" \
    --path "$RESTORE_STATE_DIR" \
    --label PREFECT_RESTORE_STATE_DIR
)"

latest_backup="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -name '20??????T??????Z' -print | sort | tail -n 1)"
if [[ -z "$latest_backup" ]]; then
  echo "No timestamped Prefect backup is available under $BACKUP_ROOT." >&2
  exit 1
fi

dump_path="$latest_backup/prefect-metadata.dump"
checksums_path="$latest_backup/SHA256SUMS"
if [[ ! -f "$dump_path" || ! -f "$checksums_path" ]]; then
  echo "Latest Prefect backup lacks the PostgreSQL dump or SHA256SUMS." >&2
  exit 1
fi

expected_sha256="$(awk '$2 == "prefect-metadata.dump" { print $1 }' "$checksums_path")"
if [[ ! "$expected_sha256" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Latest Prefect backup has no unique pinned dump checksum." >&2
  exit 1
fi
actual_sha256="$(sha256sum "$dump_path" | awk '{ print $1 }')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  echo "Latest Prefect backup dump checksum drifted." >&2
  exit 1
fi

pg_parts=()
while IFS= read -r -d '' part; do
  pg_parts+=("$part")
done < <(
  "$PYTHON_BIN" "$SCRIPT_DIR/prefect_postgres_connection.py" \
    --env-key PREFECT_BACKUP_RESTORE_ADMIN_URL \
    --default-database postgres
)
if [[ "${#pg_parts[@]}" -ne 6 || -z "${pg_parts[0]}" || -z "${pg_parts[2]}" ]]; then
  echo "PostgreSQL restore verification connection fields are incomplete." >&2
  exit 1
fi

export PGHOST="${pg_parts[0]}"
export PGPORT="${pg_parts[1]}"
export PGUSER="${pg_parts[2]}"
export PGPASSWORD="${pg_parts[3]}"
export PGDATABASE="${pg_parts[4]}"
unset PGSSLMODE
if [[ -n "${pg_parts[5]}" ]]; then
  export PGSSLMODE="${pg_parts[5]}"
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
lower_timestamp="$(printf '%s' "$timestamp" | tr '[:upper:]' '[:lower:]')"
restore_database="aios_prefect_restore_verify_${lower_timestamp}_$$"
restore_database="${restore_database//[^a-z0-9_]/_}"
restore_created=0

cleanup() {
  local exit_code=$?
  if [[ "$restore_created" -eq 1 ]]; then
    if ! "$DROPDB_BIN" --if-exists "$restore_database" >/dev/null 2>&1; then
      echo "Failed to remove Prefect restore verification database: $restore_database" >&2
      if [[ "$exit_code" -eq 0 ]]; then
        exit_code=1
      fi
    fi
  fi
  unset PGPASSWORD
  trap - EXIT INT TERM
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$CREATEDB_BIN" "$restore_database"
restore_created=1
"$PG_RESTORE_BIN" \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --dbname "$restore_database" \
  "$dump_path"

restored_contract="$("$PSQL_BIN" --dbname "$restore_database" -Atq <<'SQL'
SELECT
  to_regclass('public.flow_run') IS NOT NULL
  AND to_regclass('public.deployment') IS NOT NULL
  AND to_regclass('public.work_pool') IS NOT NULL;
SQL
)"
if [[ "$restored_contract" != "t" ]]; then
  echo "Restored Prefect database is missing required metadata tables." >&2
  exit 1
fi

"$DROPDB_BIN" --if-exists "$restore_database"
restore_created=0

install -d -m 0700 "$RESTORE_STATE_DIR"
state_path="$RESTORE_STATE_DIR/$timestamp.json"
temporary_state="$RESTORE_STATE_DIR/.$timestamp.$$.tmp"
cat > "$temporary_state" <<EOF
{
  "schemaVersion": 1,
  "verifiedAt": "$timestamp",
  "backupName": "$(basename "$latest_backup")",
  "dumpSha256": "$actual_sha256",
  "requiredTablesPresent": true
}
EOF
chmod 0400 "$temporary_state"
mv "$temporary_state" "$state_path"

echo "Prefect control-plane restore verification: PASS backup=$(basename "$latest_backup") state=$state_path"
