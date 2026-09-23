#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
fixture_name="aios-content-production-test-$$"
fixture_id="$(docker run --detach --rm --name "$fixture_name" -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=content_production_fixture -p 127.0.0.1::5432 postgres:16-alpine)"
trap 'docker stop "$fixture_id" >/dev/null' EXIT
for _ in {1..30}; do
  if docker exec "$fixture_id" pg_isready -h 127.0.0.1 -U postgres -d content_production_fixture >/dev/null 2>&1; then break; fi
  sleep 1
done
fixture_port="$(docker port "$fixture_id" 5432/tcp | awk -F: '{print $NF}')"
export CONTENT_PRODUCTION_TEST_DATABASE_URL="postgresql://postgres:fixture@127.0.0.1:${fixture_port}/content_production_fixture"
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA ads;'
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/sql/migrations/20260522_1600__create_ads_marketing_content_assets.sql
for migration in sql/migrations/021_content_production.sql sql/migrations/022_content_production_shot_catalogs.sql sql/migrations/023_content_production_shot_jobs.sql sql/migrations/024_content_production_semantic_jobs.sql; do
  docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < "$migration"
done
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO ads.marketing_content_assets (asset_id, title)
VALUES ('11111111-1111-1111-1111-111111111111', 'Isolated queue fixture');
INSERT INTO ads.content_production_shot_catalogs (catalog_id, owner_user_id, asset_id, content_hash, snapshot)
VALUES ('22222222-2222-2222-2222-222222222222', 'semantic-queue-fixture', '11111111-1111-1111-1111-111111111111', REPEAT('a', 64), '{}');
SQL
PYTHONPATH=etl/groland_postgres/scripts etl/groland_postgres/.venv/bin/python -m unittest discover -s etl/groland_postgres/tests/content_production -v
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::production::postgres_tests -- --ignored
