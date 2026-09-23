#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ETL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ETL_ROOT/../.." && pwd)"
CONTAINER_NAME="aios-prefect-backup-restore-test-$$"
POSTGRES_IMAGE="${PREFECT_BACKUP_RESTORE_TEST_POSTGRES_IMAGE:-postgres:14-alpine}"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/aios-prefect-backup-restore.XXXXXX")"

cleanup() {
  docker rm -fv "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -rf -- "$FIXTURE_ROOT"
}
trap cleanup EXIT INT TERM

docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_PASSWORD=fixture \
  --env POSTGRES_DB=aios_prefect \
  --publish 127.0.0.1::5432 \
  "$POSTGRES_IMAGE" >/dev/null

database_ready() {
  docker exec "$CONTAINER_NAME" \
    psql -Atq -U postgres -d aios_prefect -c 'SELECT 1;' 2>/dev/null \
    | grep -qx '1'
}

ready=0
for _ in $(seq 1 60); do
  if database_ready; then
    sleep 1
    if database_ready; then
      ready=1
      break
    fi
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "Disposable PostgreSQL did not become ready." >&2
  exit 1
fi

published_address="$(docker port "$CONTAINER_NAME" 5432/tcp | tail -n 1)"
published_port="${published_address##*:}"
database_url="postgresql://postgres:fixture@127.0.0.1:${published_port}/aios_prefect?sslmode=disable"

ALLOW_NON_ROOT_PREFECT_DB_BOOTSTRAP=1 \
PGHOST=127.0.0.1 \
PGPORT="$published_port" \
PGUSER=postgres \
PGPASSWORD=fixture \
PGDATABASE=aios_prefect \
PREFECT_DB_NAME=prefect_bootstrap_fixture \
PREFECT_DB_ROLE=prefect_bootstrap_fixture \
PREFECT_DB_PASSWORD=role-fixture-password \
bash "$SCRIPT_DIR/bootstrap_prefect_postgres.sh"

bootstrap_contract="$(PGPASSWORD=fixture psql \
  "host=127.0.0.1 port=$published_port user=postgres dbname=aios_prefect sslmode=disable" \
  -Atq <<'SQL'
SELECT
  NOT role.rolsuper
  AND NOT role.rolcreatedb
  AND NOT role.rolcreaterole
  AND NOT role.rolreplication
  AND NOT role.rolbypassrls
  AND database.datdba = role.oid
  AND NOT EXISTS (
    SELECT 1 FROM pg_auth_members WHERE member = role.oid
  )
FROM pg_roles role
JOIN pg_database database ON database.datname = 'prefect_bootstrap_fixture'
WHERE role.rolname = 'prefect_bootstrap_fixture';
SQL
)"
if [[ "$bootstrap_contract" != "t" ]]; then
  echo "Disposable Prefect PostgreSQL bootstrap privilege contract failed." >&2
  exit 1
fi

PGPASSWORD=fixture psql \
  "host=127.0.0.1 port=$published_port user=postgres dbname=aios_prefect sslmode=disable" \
  --set ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE flow_run (id UUID PRIMARY KEY);
CREATE TABLE deployment (id UUID PRIMARY KEY);
CREATE TABLE work_pool (id UUID PRIMARY KEY);
INSERT INTO flow_run (id) VALUES ('00000000-0000-0000-0000-000000000001');
SQL

export ALLOW_NON_ROOT_PREFECT_BACKUP=1
export ALLOW_NON_ROOT_PREFECT_RESTORE_VERIFY=1
export PREFECT_API_DATABASE_CONNECTION_URL="$database_url"
export PREFECT_BACKUP_RESTORE_ADMIN_URL="$database_url"
export PREFECT_BACKUP_ROOT="$FIXTURE_ROOT/backups"
export PREFECT_RESTORE_STATE_DIR="$FIXTURE_ROOT/restore-verifications"
export PROJECT_ROOT="$ETL_ROOT"
export REPO_ROOT="$REPO_ROOT"
export PYTHON_BIN="${PYTHON_BIN:-python3}"

bash "$SCRIPT_DIR/backup_prefect_control_plane.sh"
bash "$SCRIPT_DIR/verify_prefect_control_plane_restore.sh"

test "$(find "$PREFECT_BACKUP_ROOT" -name prefect-metadata.dump -type f | wc -l | tr -d ' ')" = "1"
test "$(find "$PREFECT_RESTORE_STATE_DIR" -name '*.json' -type f | wc -l | tr -d ' ')" = "1"

remaining_restore_databases="$(PGPASSWORD=fixture psql \
  "host=127.0.0.1 port=$published_port user=postgres dbname=aios_prefect sslmode=disable" \
  -Atq -c "SELECT COUNT(*) FROM pg_database WHERE datname LIKE 'aios_prefect_restore_verify_%';")"
if [[ "$remaining_restore_databases" != "0" ]]; then
  echo "Disposable restore verification left scratch databases behind." >&2
  exit 1
fi

echo "Prefect control-plane backup/restore PostgreSQL fixture: PASS"
