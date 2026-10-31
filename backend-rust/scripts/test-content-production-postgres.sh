#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
scope="${1:-all}"
if [[ "$scope" != "all" && "$scope" != "studio" && "$scope" != "cloud-remix" && "$scope" != "daily-remix" && "$scope" != "remix-qc" && "$scope" != "remix-delivery" && "$scope" != "remix-retention" ]] || (( $# > 1 )); then
  echo "Usage: $0 [all|studio|cloud-remix|daily-remix|remix-qc|remix-delivery|remix-retention]" >&2
  exit 2
fi
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
# AI 切段 v5 reads the library's Seed ASR transcripts.
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/sql/migrations/20260525_1810__add_marketing_content_asset_transcripts.sql
for migration in sql/migrations/021_content_production.sql sql/migrations/022_content_production_shot_catalogs.sql sql/migrations/023_content_production_shot_jobs.sql sql/migrations/024_content_production_semantic_jobs.sql sql/migrations/026_content_production_runs.sql sql/migrations/027_content_production_run_renders.sql sql/migrations/028_content_production_planning_queue.sql sql/migrations/029_content_ai_studio_segments.sql sql/migrations/030_content_ai_studio_segment_suggestions.sql sql/migrations/031_content_ai_studio_remix_batches.sql sql/migrations/032_content_ai_studio_remix_batch_cancel.sql sql/migrations/035_content_ai_studio_selling_points.sql sql/migrations/042_content_ai_studio_selling_point_business_labels.sql sql/migrations/043_content_ai_studio_makeup_effect_label.sql sql/migrations/044_content_ai_studio_segment_multilabel.sql sql/migrations/045_content_ai_studio_endorsement_categories.sql sql/migrations/046_content_ai_studio_remix_output_reviews.sql; do
  docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < "$migration"
done
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO ads.marketing_content_assets (asset_id, title)
VALUES ('11111111-1111-1111-1111-111111111111', 'Isolated queue fixture');
INSERT INTO ads.content_production_shot_catalogs (catalog_id, owner_user_id, asset_id, content_hash, snapshot)
VALUES ('22222222-2222-2222-2222-222222222222', 'semantic-queue-fixture', '11111111-1111-1111-1111-111111111111', REPEAT('a', 64), '{}');
SQL
# 竞品爆款 lives in the bql_aios schema `competitor`; its migrations need no ads tables and come
# before the Python suite, whose competitor queue tests use them.
for migration in sql/bql/backend/002_competitor_videos_analyses.sql sql/bql/backend/003_competitor_stat_snapshots.sql sql/bql/backend/004_competitor_reports.sql sql/bql/backend/006_competitor_date_windows.sql sql/bql/backend/007_competitor_manual_collection.sql sql/bql/backend/008_competitor_auto_repair_limit.sql sql/bql/backend/009_competitor_film_enrichments.sql sql/bql/backend/010_cloud_video.sql sql/bql/backend/011_cloud_video_spend_by_day.sql sql/bql/backend/012_cloud_video_team_output.sql sql/bql/warehouse/20261026_2300__competitor_compass_live_trade_traffic_videos.sql; do
  docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < "$migration"
done
# Text IDs let the legacy numeric route fixtures and the BQL service UUID coexist.
# Production auth_users uses UUID; full BQL migration replay tests that schema.
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE public.auth_users (id TEXT PRIMARY KEY, username VARCHAR(64) UNIQUE NOT NULL,
  display_name VARCHAR(128) NOT NULL, password_hash VARCHAR(255), is_active BOOLEAN,
  auth_provider VARCHAR(32), email VARCHAR(128), full_name VARCHAR(128),
  external_id VARCHAR(128), avatar_url VARCHAR(512), created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(), last_login_at TIMESTAMPTZ);
SQL
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < sql/bql/backend/014_daily_remix_plans.sql
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < sql/bql/backend/015_remix_review_qc_reasons.sql
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < sql/bql/backend/016_cloud_video_pushes.sql
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < sql/bql/backend/017_remix_output_retention.sql
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/remix_review_qc_reasons_contract.sql
if [[ "$scope" == "daily-remix" || "$scope" == "remix-delivery" || "$scope" == "remix-retention" ]]; then
  # Replay the actual BQL baseline and every forward migration in a second,
  # fresh database, including its UUID auth schema (the legacy fixture uses text).
  docker exec "$fixture_id" createdb -U postgres bql_aios
  if [[ "$scope" == "remix-delivery" || "$scope" == "remix-retention" ]]; then
    docker exec "$fixture_id" psql -U postgres -d bql_aios -v ON_ERROR_STOP=1 -c 'CREATE ROLE aios_gpu_node NOLOGIN'
  fi
  for migration in sql/bql/backend/*.sql; do
    docker exec -i "$fixture_id" psql -U postgres -d bql_aios -v ON_ERROR_STOP=1 --single-transaction < "$migration"
  done
  docker exec -i "$fixture_id" psql -U postgres -d bql_aios -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/daily_remix_plans_contract.sql
  docker exec -i "$fixture_id" psql -U postgres -d bql_aios -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/remix_review_qc_reasons_contract.sql
  if [[ "$scope" == "remix-retention" ]]; then
    docker exec -i "$fixture_id" psql -U postgres -d bql_aios -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/remix_retention_contract.sql
    PYTHONPATH=etl/groland_postgres/scripts:etl/groland_postgres/tests/content_production etl/groland_postgres/.venv/bin/python -m unittest test_remix_retention_postgres test_cloud_video_push test_cloud_video_push_postgres -v
    bash scripts/backend-rust/cargo-with-cache.sh test remix_retention_postgres_tests -- --ignored --test-threads=1
    exit 0
  fi
  if [[ "$scope" == "remix-delivery" ]]; then
    docker exec -i "$fixture_id" psql -U postgres -d bql_aios -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/cloud_video_pushes_contract.sql
    PYTHONPATH=etl/groland_postgres/scripts:etl/groland_postgres/tests/content_production etl/groland_postgres/.venv/bin/python -m unittest test_cloud_video_push test_cloud_video_push_postgres test_cloud_video_sync test_cloud_video_intake_postgres -v
    bash scripts/backend-rust/cargo-with-cache.sh test remix_review_postgres_tests -- --ignored --test-threads=1
    bash scripts/backend-rust/cargo-with-cache.sh test remix_delivery_postgres_tests -- --ignored --test-threads=1
    exit 0
  fi
  bash scripts/backend-rust/cargo-with-cache.sh test daily_remix_postgres_tests -- --ignored --test-threads=1
  exit 0
fi
# Studio-only contracts use the same disposable schema. Media/browser fixtures have
# their own explicit Redis/renderer setup and are not PostgreSQL-only contracts.
if [[ "$scope" == "remix-qc" ]]; then
  PYTHONPATH=etl/groland_postgres/scripts:etl/groland_postgres/tests/content_production etl/groland_postgres/.venv/bin/python -m unittest test_remix_output_postgres test_remix_qc_sources_postgres -v
  exit 0
fi
if [[ "$scope" == "cloud-remix" ]]; then
  PYTHONPATH=etl/groland_postgres/scripts:etl/groland_postgres/tests/content_production etl/groland_postgres/.venv/bin/python -m unittest test_remix_cloud_sources test_remix_cloud_sources_postgres test_remix_mediakit test_remix_output_postgres -v
  bash scripts/backend-rust/cargo-with-cache.sh test cloud_remix_postgres_tests -- --ignored --test-threads=1
  exit 0
fi
if [[ "$scope" == "studio" ]]; then
  bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio:: -- --ignored --test-threads=1 --skip browser_acceptance_tests --skip remix_points_media_tests
  exit 0
fi
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/competitor_stat_snapshots_contract.sql
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/competitor_reports_contract.sql
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/competitor_film_enrichments_contract.sql
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/cloud_video_team_output_contract.sql
PYTHONPATH=etl/groland_postgres/scripts etl/groland_postgres/.venv/bin/python -m unittest discover -s etl/groland_postgres/tests/content_production -v
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/competitor_auto_repair_contract.sql
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::production::postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::production::runs::tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::production::runs::execution_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::production::runs::planning_queue_tests -- --ignored --test-threads=1
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/content_production_runs_contract.sql
docker exec -i "$fixture_id" psql -U postgres -d content_production_fixture -v ON_ERROR_STOP=1 < etl/groland_postgres/tests/sql/content_ai_studio_selling_points_contract.sql
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::segment_multilabel_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::suggestion_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::remix_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::admission_postgres_tests -- --ignored --test-threads=1
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::structure_pool_postgres_tests -- --ignored --test-threads=1
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::remix_list_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::remix_review_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::remix_edit_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::remix_points_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::team_output_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::remix_points_voiceover_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::access_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::asset_summary_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::overview_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::enterprise_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::competitor_reports_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::competitor_videos_postgres_tests -- --ignored
bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::competitor_window_postgres_tests -- --ignored

bash scripts/backend-rust/cargo-with-cache.sh test marketing::content_assets::studio::competitor_catalog_postgres_tests -- --ignored --test-threads=1
