#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTAINER_NAME="aios-report-overview-dependency-test-$$"
POSTGRES_IMAGE="${REPORT_OVERVIEW_DEPENDENCY_POSTGRES_IMAGE:-postgres:16-alpine}"

cleanup() {
  docker rm -fv "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the disposable report overview dependency fixture." >&2
  exit 1
fi

docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_PASSWORD=fixture \
  --env POSTGRES_DB=report_overview_dependency_fixture \
  --publish 127.0.0.1::5432 \
  "$POSTGRES_IMAGE" >/dev/null

database_ready() {
  docker exec "$CONTAINER_NAME" \
    psql -Atq -U postgres -d report_overview_dependency_fixture -c 'SELECT 1;' 2>/dev/null \
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
export REPORT_OVERVIEW_DEPENDENCY_TEST_DATABASE_URL="postgresql://postgres:fixture@127.0.0.1:${published_port}/report_overview_dependency_fixture?sslmode=disable"

cd "$REPO_ROOT"
node scripts/checks/dataops/report-overview-dependency.postgres.mjs
