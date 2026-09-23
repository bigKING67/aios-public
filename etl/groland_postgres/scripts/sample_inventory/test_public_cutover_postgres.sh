#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../../../.." && pwd)"
container_name="aios-sample-inventory-public-cutover-test-${$}"
postgres_image="${SAMPLE_INVENTORY_TEST_POSTGRES_IMAGE:-postgres:16-alpine}"

cleanup() {
  docker rm -fv "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --detach --rm \
  --name "${container_name}" \
  --env POSTGRES_PASSWORD=fixture \
  --env POSTGRES_DB=sample_inventory_fixture \
  --publish 127.0.0.1::5432 \
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

docker cp "${repo_root}/sql/migrations/014_sample_inventory_transaction_schema.sql" \
  "${container_name}:/tmp/014.sql"
docker exec "${container_name}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d sample_inventory_fixture -f /tmp/014.sql >/dev/null

published_address="$(docker port "${container_name}" 5432/tcp | tail -n 1)"
published_port="${published_address##*:}"
export SAMPLE_INVENTORY_PUBLIC_CUTOVER_TEST_DATABASE_URL="postgresql://postgres:fixture@127.0.0.1:${published_port}/sample_inventory_fixture?sslmode=disable"

node "${repo_root}/scripts/checks/migrations/aios-sample-inventory-public-cutover.postgres.mjs"
