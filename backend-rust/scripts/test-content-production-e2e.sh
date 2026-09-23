#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
fixture_pg=""
fixture_redis=""
cleanup() {
  if [[ -n "$fixture_pg" ]]; then docker stop "$fixture_pg" >/dev/null; fi
  if [[ -n "$fixture_redis" ]]; then docker stop "$fixture_redis" >/dev/null; fi
}
trap cleanup EXIT
fixture_pg="$(docker run --detach --rm -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=content_production_e2e -p 127.0.0.1::5432 postgres:16-alpine)"
fixture_redis="$(docker run --detach --rm -p 127.0.0.1::6379 redis:7-alpine)"
for _ in {1..30}; do
  if docker exec "$fixture_pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && docker exec "$fixture_redis" redis-cli ping >/dev/null 2>&1; then break; fi
  sleep 1
done
fixture_pg_port="$(docker port "$fixture_pg" 5432/tcp | awk -F: '{print $NF}')"
fixture_redis_port="$(docker port "$fixture_redis" 6379/tcp | awk -F: '{print $NF}')"
export CONTENT_PRODUCTION_TEST_DATABASE_URL="postgresql://postgres:fixture@127.0.0.1:${fixture_pg_port}/content_production_e2e"
export CONTENT_PRODUCTION_TEST_REDIS_URL="redis://127.0.0.1:${fixture_redis_port}"
etl/groland_postgres/.venv/bin/python etl/groland_postgres/tests/content_production/run_e2e.py "$@"
