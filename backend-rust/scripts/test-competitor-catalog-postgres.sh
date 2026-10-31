#!/usr/bin/env bash
# Isolated catalogue regression; never points at a developer or production database.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
fixture_id="$(docker run --detach --rm -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=content_production_fixture -p 127.0.0.1::5432 postgres:16-alpine)"
trap 'docker stop "$fixture_id" >/dev/null' EXIT
for _ in {1..30}; do
  if docker exec "$fixture_id" pg_isready -h 127.0.0.1 -U postgres -d content_production_fixture >/dev/null 2>&1; then break; fi
  sleep 1
done
fixture_port="$(docker port "$fixture_id" 5432/tcp | awk -F: '{print $NF}')"
export CONTENT_PRODUCTION_TEST_DATABASE_URL="postgresql://postgres:fixture@127.0.0.1:${fixture_port}/content_production_fixture"
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/sql/migrations/20260522_1600__create_ads_marketing_content_assets.sql
for migration in sql/bql/backend/002_competitor_videos_analyses.sql sql/bql/backend/003_competitor_stat_snapshots.sql sql/bql/backend/004_competitor_reports.sql sql/bql/backend/006_competitor_date_windows.sql sql/bql/backend/007_competitor_manual_collection.sql sql/bql/backend/008_competitor_auto_repair_limit.sql sql/bql/warehouse/20261026_2300__competitor_compass_live_trade_traffic_videos.sql; do
  docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 -q < "$migration"
done
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/competitor_manual_collection_contract.sql
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/competitor_auto_repair_contract.sql
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::competitor_videos_postgres_tests -- --ignored --test-threads=1
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::competitor_catalog_postgres_tests -- --ignored --test-threads=1

COMPETITOR_TEST_DATABASE_URL="$CONTENT_PRODUCTION_TEST_DATABASE_URL" CONTENT_AI_STUDIO_SEGMENT_SUGGEST_LIVE=0 etl/groland_postgres/.venv/bin/python -m unittest discover -s etl/groland_postgres/tests/content_production -p "test_competitor_worker.py" -q
COMPETITOR_TEST_DATABASE_URL="$CONTENT_PRODUCTION_TEST_DATABASE_URL" etl/groland_postgres/.venv/bin/python -m pytest -q \
  etl/groland_postgres/tests/content_production/test_competitor_connections.py \
  etl/groland_postgres/tests/content_production/test_competitor_quality_feedback.py
