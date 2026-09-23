#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ETL_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
REPO_ROOT="${REPO_ROOT:-$(cd "$ETL_ROOT/../.." && pwd)}"
BACKUP_ROOT="${PREFECT_BACKUP_ROOT:-/var/lib/aios-prefect/backups}"
RETENTION_DAYS="${PREFECT_BACKUP_RETENTION_DAYS:-14}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"

if [[ "$(id -u)" -ne 0 && "${ALLOW_NON_ROOT_PREFECT_BACKUP:-0}" != "1" ]]; then
  echo "Run as root or set ALLOW_NON_ROOT_PREFECT_BACKUP=1 for a controlled fixture." >&2
  exit 1
fi

if [[ ! "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "PREFECT_BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 1
fi

BACKUP_ROOT="$(
  "$PYTHON_BIN" "$SCRIPT_DIR/prefect_filesystem_safety.py" \
    --path "$BACKUP_ROOT" \
    --label PREFECT_BACKUP_ROOT
)"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
published_backup_dir="$BACKUP_ROOT/$timestamp"
backup_dir="$BACKUP_ROOT/.$timestamp.$$"
backup_published=0
install -d -m 0700 "$BACKUP_ROOT"
if [[ -e "$published_backup_dir" || -e "$backup_dir" ]]; then
  echo "Prefect backup destination already exists for timestamp $timestamp." >&2
  exit 1
fi
install -d -m 0700 "$backup_dir"

cleanup() {
  local exit_code=$?
  unset PGPASSWORD
  if [[ "$backup_published" -ne 1 && -d "$backup_dir" ]]; then
    if ! rm -rf -- "$backup_dir"; then
      echo "Failed to remove incomplete Prefect backup directory: $backup_dir" >&2
      if [[ "$exit_code" -eq 0 ]]; then
        exit_code=1
      fi
    fi
  fi
  trap - EXIT INT TERM
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

git_sha="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || printf 'unknown')"
artifacts=()

if [[ -n "${PREFECT_SQLITE_PATH:-}" ]]; then
  if [[ ! -f "$PREFECT_SQLITE_PATH" ]]; then
    echo "Configured Prefect SQLite database is missing: $PREFECT_SQLITE_PATH" >&2
    exit 1
  fi
  sqlite_backup="$backup_dir/prefect-metadata.sqlite3"
  "$PYTHON_BIN" - "$PREFECT_SQLITE_PATH" "$sqlite_backup" <<'PY'
import sqlite3
import sys
from pathlib import Path

source_path = Path(sys.argv[1])
target_path = Path(sys.argv[2])
with sqlite3.connect(f"file:{source_path}?mode=ro", uri=True) as source:
  with sqlite3.connect(target_path) as target:
    source.backup(target)
with sqlite3.connect(f"file:{target_path}?mode=ro", uri=True) as check:
  result = check.execute("PRAGMA quick_check").fetchone()
if result != ("ok",):
  raise SystemExit(f"SQLite backup quick_check failed: {result!r}")
PY
  chmod 0400 "$sqlite_backup"
  artifacts+=("$(basename "$sqlite_backup")")
fi

for legacy_log in /var/log/aios_prefect_server.log /var/log/aios_prefect_worker.log; do
  if [[ -f "$legacy_log" ]]; then
    archive="$backup_dir/$(basename "$legacy_log").gz"
    gzip -c "$legacy_log" > "$archive"
    gzip -t "$archive"
    chmod 0400 "$archive"
    artifacts+=("$(basename "$archive")")
  fi
done

if [[ -n "${PREFECT_API_DATABASE_CONNECTION_URL:-}" ]]; then
  pg_parts=()
  while IFS= read -r -d '' part; do
    pg_parts+=("$part")
  done < <(
    "$PYTHON_BIN" "$SCRIPT_DIR/prefect_postgres_connection.py" \
      --env-key PREFECT_API_DATABASE_CONNECTION_URL
  )
  if [[ "${#pg_parts[@]}" -ne 6 || -z "${pg_parts[0]}" || -z "${pg_parts[2]}" || -z "${pg_parts[4]}" ]]; then
    echo "PostgreSQL backup connection fields are incomplete." >&2
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
  postgres_backup="$backup_dir/prefect-metadata.dump"
  "$PG_DUMP_BIN" --format=custom --file "$postgres_backup"
  "$PG_RESTORE_BIN" --list "$postgres_backup" > "$backup_dir/prefect-metadata.restore-list"
  chmod 0400 "$postgres_backup" "$backup_dir/prefect-metadata.restore-list"
  artifacts+=("$(basename "$postgres_backup")" "prefect-metadata.restore-list")
  unset PGPASSWORD
fi

if [[ "${#artifacts[@]}" -eq 0 ]]; then
  echo "No SQLite path, PostgreSQL URL, or legacy logs were available to back up." >&2
  exit 1
fi

(
  cd "$backup_dir"
  sha256sum "${artifacts[@]}" > SHA256SUMS
  chmod 0400 SHA256SUMS
)

cat > "$backup_dir/MANIFEST" <<EOF
created_at=$timestamp
git_sha=$git_sha
retention_days=$RETENTION_DAYS
artifact_count=${#artifacts[@]}
EOF
chmod 0400 "$backup_dir/MANIFEST"

mv "$backup_dir" "$published_backup_dir"
backup_dir="$published_backup_dir"
backup_published=1

# Retention is scoped to timestamp-named backup directories under the dedicated root.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d \
  -name '20??????T??????Z' -mtime "+$((RETENTION_DAYS - 1))" -exec rm -rf -- {} +

echo "Prefect control-plane backup: PASS directory=$backup_dir artifacts=${#artifacts[@]}"
