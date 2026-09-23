#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
etl_root="$(cd -- "${script_dir}/.." && pwd)"
container_name="aios-daily-brief-ledger-test-${$}"
postgres_image="${DAILY_BRIEF_TEST_POSTGRES_IMAGE:-postgres:16-alpine}"
runtime=""
temporary_root=""
local_data_dir=""
local_socket_dir=""

cleanup() {
  if [[ "${runtime}" == "docker" ]]; then
    docker rm -fv "${container_name}" >/dev/null 2>&1 || true
  elif [[ "${runtime}" == "local" && -n "${local_data_dir}" ]]; then
    pg_ctl -D "${local_data_dir}" -m immediate stop >/dev/null 2>&1 || true
  fi
  if [[ -n "${temporary_root}" ]]; then
    rm -rf "${temporary_root}"
  fi
}
trap cleanup EXIT INT TERM

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  runtime="docker"
  docker run --detach --rm \
    --name "${container_name}" \
    --env POSTGRES_PASSWORD=fixture \
    --env POSTGRES_DB=daily_brief_fixture \
    "${postgres_image}" >/dev/null

  database_ready() {
    docker exec "${container_name}" \
      psql -Atq -U postgres -d daily_brief_fixture -c 'SELECT 1;' 2>/dev/null \
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

  if [[ "${ready}" -ne 1 ]]; then
    echo "Disposable PostgreSQL did not become ready." >&2
    exit 1
  fi

  run_sql_file() {
    local source_file="$1"
    local container_file="/tmp/$(basename -- "${source_file}")"
    docker cp "${source_file}" "${container_name}:${container_file}"
    docker exec "${container_name}" \
      psql -v ON_ERROR_STOP=1 -U postgres -d daily_brief_fixture \
      -f "${container_file}" >/dev/null
  }

  query_sql() {
    docker exec "${container_name}" \
      psql -Atq -v ON_ERROR_STOP=1 -U postgres -d daily_brief_fixture \
      -c "$1"
  }
elif command -v initdb >/dev/null 2>&1 \
  && command -v pg_ctl >/dev/null 2>&1 \
  && command -v createdb >/dev/null 2>&1 \
  && command -v psql >/dev/null 2>&1; then
  runtime="local"
  temporary_root="$(mktemp -d "/tmp/aios-dbb-${$}.XXXXXX")"
  local_data_dir="${temporary_root}/data"
  local_socket_dir="${temporary_root}/socket"
  mkdir -p "${local_socket_dir}"
  initdb -D "${local_data_dir}" --auth-local=trust --auth-host=reject \
    --no-locale --encoding=UTF8 >/dev/null
  pg_ctl -D "${local_data_dir}" \
    -o "-k ${local_socket_dir} -h ''" -w start >/dev/null
  createdb -h "${local_socket_dir}" -U "$(id -un)" daily_brief_fixture

  run_sql_file() {
    local source_file="$1"
    psql -X -v ON_ERROR_STOP=1 \
      -h "${local_socket_dir}" -U "$(id -un)" -d daily_brief_fixture \
      -f "${source_file}" >/dev/null
  }

  query_sql() {
    psql -Atq -X -v ON_ERROR_STOP=1 \
      -h "${local_socket_dir}" -U "$(id -un)" -d daily_brief_fixture \
      -c "$1"
  }
else
  echo "Docker or local PostgreSQL initdb/pg_ctl/createdb/psql is required." >&2
  exit 1
fi

run_sql_file \
  "${etl_root}/sql/migrations/20260825_1200__create_daily_business_brief_delivery_ledger.sql"
run_sql_file \
  "${etl_root}/tests/sql/daily_business_brief_delivery_ledger_check.sql"
run_sql_file \
  "${etl_root}/tests/sql/daily_business_brief_delivery_ledger_behavior.sql"

query_sql "
  BEGIN;
  INSERT INTO dataops.daily_business_brief_deliveries (
    brief_date, delivery_channel, status, card_sha256
  ) VALUES (
    DATE '2026-08-22', 'production', 'sending', REPEAT('f', 64)
  );
  SELECT pg_sleep(2);
  COMMIT;
" >/dev/null &
first_writer_pid=$!
sleep 0.2

racing_insert="$({
  query_sql "
    INSERT INTO dataops.daily_business_brief_deliveries (
      brief_date, delivery_channel, status, card_sha256
    ) VALUES (
      DATE '2026-08-22', 'production', 'sending', REPEAT('0', 64)
    )
    ON CONFLICT (brief_date)
      WHERE delivery_channel = 'production'
      DO NOTHING
    RETURNING id;
  "
} 2>/dev/null)"

if ! wait "${first_writer_pid}"; then
  echo "First concurrent production reservation failed." >&2
  exit 1
fi
if [[ -n "${racing_insert}" ]]; then
  echo "Concurrent production reservation admitted a second sender." >&2
  exit 1
fi

production_count="$(query_sql "
  SELECT COUNT(*)
  FROM dataops.daily_business_brief_deliveries
  WHERE brief_date = DATE '2026-08-22'
    AND delivery_channel = 'production';
")"
if [[ "${production_count}" != "1" ]]; then
  echo "Concurrent production reservation count was ${production_count}, expected 1." >&2
  exit 1
fi

echo "Daily business brief delivery ledger PostgreSQL contract passed (${runtime})."
