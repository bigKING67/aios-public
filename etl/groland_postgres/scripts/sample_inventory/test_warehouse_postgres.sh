#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../../../.." && pwd)"
container_name="aios-sample-inventory-warehouse-test-${$}"
postgres_image="${SAMPLE_INVENTORY_TEST_POSTGRES_IMAGE:-postgres:16-alpine}"

cleanup() {
  docker rm -fv "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --detach --rm \
  --name "${container_name}" \
  --env POSTGRES_PASSWORD=fixture \
  --env POSTGRES_DB=sample_inventory_fixture \
  "${postgres_image}" >/dev/null

database_ready() {
  docker exec "${container_name}" \
    psql -Atq -U postgres -d sample_inventory_fixture -c 'SELECT 1;' 2>/dev/null \
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

declare -a sql_files=(
  "sql/migrations/014_sample_inventory_transaction_schema.sql"
  "sql/migrations/015_sample_inventory_public_ux_support.sql"
  "etl/groland_postgres/tests/sql/sample_inventory_manual_reservation_migration_fixture.sql"
  "sql/migrations/016_sample_inventory_manual_reservation_semantics.sql"
  "etl/groland_postgres/tests/sql/sample_inventory_manual_reservation_migration_check.sql"
  "etl/groland_postgres/tests/sql/sample_inventory_approval_stock_migration_fixture.sql"
  "sql/migrations/017_sample_inventory_approval_stock_deduction.sql"
  "sql/migrations/017_sample_inventory_approval_stock_deduction.sql"
  "etl/groland_postgres/tests/sql/sample_inventory_approval_stock_migration_check.sql"
  "etl/groland_postgres/sql/migrations/20260726_1600__create_sample_inventory_ods_dwd.sql"
  "etl/groland_postgres/sql/migrations/20260727_1730__harden_sample_inventory_warehouse_refresh.sql"
  "etl/groland_postgres/tests/sql/sample_inventory_transaction_check.sql"
  "etl/groland_postgres/tests/sql/sample_inventory_warehouse_check.sql"
  "etl/groland_postgres/tests/sql/sample_inventory_warehouse_regression.sql"
)

for relative_path in "${sql_files[@]}"; do
  file_name="$(basename -- "${relative_path}")"
  docker cp "${repo_root}/${relative_path}" "${container_name}:/tmp/${file_name}"
  docker exec "${container_name}" psql -v ON_ERROR_STOP=1 -U postgres -d sample_inventory_fixture \
    -f "/tmp/${file_name}" >/dev/null
done

rollback_database="sample_inventory_approval_rollback_fixture"
docker exec "${container_name}" createdb -U postgres "${rollback_database}"

declare -a rollback_setup_files=(
  "sql/migrations/014_sample_inventory_transaction_schema.sql"
  "sql/migrations/015_sample_inventory_public_ux_support.sql"
  "sql/migrations/016_sample_inventory_manual_reservation_semantics.sql"
  "etl/groland_postgres/tests/sql/sample_inventory_approval_stock_migration_rollback_fixture.sql"
)

for relative_path in "${rollback_setup_files[@]}"; do
  file_name="$(basename -- "${relative_path}")"
  docker cp "${repo_root}/${relative_path}" "${container_name}:/tmp/${file_name}"
  docker exec "${container_name}" psql -v ON_ERROR_STOP=1 -U postgres -d "${rollback_database}" \
    -f "/tmp/${file_name}" >/dev/null
done

migration_file="017_sample_inventory_approval_stock_deduction.sql"
if docker exec "${container_name}" psql -v ON_ERROR_STOP=1 -U postgres -d "${rollback_database}" \
  -f "/tmp/${migration_file}" >/dev/null; then
  echo "Approval stock migration unexpectedly succeeded for the rollback fixture." >&2
  exit 1
fi

rollback_check="etl/groland_postgres/tests/sql/sample_inventory_approval_stock_migration_rollback_check.sql"
rollback_check_file="$(basename -- "${rollback_check}")"
docker cp "${repo_root}/${rollback_check}" "${container_name}:/tmp/${rollback_check_file}"
docker exec "${container_name}" psql -v ON_ERROR_STOP=1 -U postgres -d "${rollback_database}" \
  -f "/tmp/${rollback_check_file}" >/dev/null
