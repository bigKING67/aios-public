#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
: "${CREATIVE_CRAFT_PRODUCTION_DIR:?Set the verified Creative Craft production module path}"
: "${PRODUCER_HEADLESS_SHELL_PATH:?Set the headless Chromium executable path}"
export AIOS_CAPTION_BRIDGE_OUTPUT="${AIOS_CAPTION_BRIDGE_OUTPUT:-$ROOT/.cache/content-production-acceptance/caption-worker-bridge/render}"

pg_id=$(docker run --detach --rm -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=content_production_fixture -p 127.0.0.1::5432 postgres:16-alpine)
redis_id=''
trap 'docker stop "$pg_id" >/dev/null; if [ -n "$redis_id" ]; then docker stop "$redis_id" >/dev/null; fi' EXIT
redis_id=$(docker run --detach --rm -p 127.0.0.1::6379 redis:7-alpine)
for i in {1..30}; do if docker exec "$pg_id" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi; sleep 1; done
pg_port=$(docker port "$pg_id" 5432/tcp | awk -F: '{print $NF}')
redis_port=$(docker port "$redis_id" 6379/tcp | awk -F: '{print $NF}')
export CONTENT_PRODUCTION_TEST_DATABASE_URL="postgresql://postgres:fixture@127.0.0.1:$pg_port/content_production_fixture"
export CONTENT_PRODUCTION_TEST_REDIS_URL="redis://127.0.0.1:$redis_port"
export AIOS_CAPTION_PREFLIGHT_ENABLED=true AIOS_VISUAL_REVIEW_MODEL=fixture AIOS_CAPTION_PREFLIGHT_MAX_CALLS=3
docker exec "$pg_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA ads;' >/dev/null
for migration in etl/groland_postgres/sql/migrations/20260522_1600__create_ads_marketing_content_assets.sql sql/migrations/021_content_production.sql sql/migrations/026_content_production_runs.sql sql/migrations/027_content_production_run_renders.sql sql/migrations/028_content_production_planning_queue.sql; do
 docker exec -i "$pg_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < "$migration" >/dev/null
done
bash scripts/backend-rust/cargo-with-cache.sh test caption_preflight_tests -- --ignored --nocapture

if [ -n "${AIOS_REAL_MEDIA_REPLAY:-}" ]; then
 : "${AIOS_REAL_MEDIA_SOURCES:?Set the saved local source manifest}"
 bash scripts/backend-rust/cargo-with-cache.sh test real_media_rust_dispatch -- --ignored --nocapture
fi
