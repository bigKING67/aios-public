#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

run_fixture() {
  local label="$1"
  local database="$2"
  local smoke_script="$3"
  local backend_test_filter="${4:-}"
  local post_smoke_script="${5:-}"
  local container="aios-${label}-fixture-$(date +%s)-$$"
  local fixture_object_root=""
  local mapped
  local port

  echo "==> Starting disposable Postgres fixture: ${label}"
  docker run --rm -d \
    --name "${container}" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB="${database}" \
    -p 127.0.0.1::5432 \
    postgres:16-alpine >/dev/null

  cleanup_fixture() {
    docker stop "${container}" >/dev/null 2>&1 || true
    if [[ -n "${fixture_object_root}" ]]; then
      rm -rf "${fixture_object_root}"
    fi
  }
  trap cleanup_fixture RETURN

  mapped="$(docker port "${container}" 5432/tcp)"
  port="${mapped##*:}"

  for _ in $(seq 1 60); do
    if PGPASSWORD=postgres pg_isready \
      -h 127.0.0.1 \
      -p "${port}" \
      -U postgres \
      -d "${database}" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  PGPASSWORD=postgres pg_isready \
    -h 127.0.0.1 \
    -p "${port}" \
    -U postgres \
    -d "${database}" >/dev/null

  PGHOST=127.0.0.1 \
    PGPORT="${port}" \
    PGUSER=postgres \
    PGPASSWORD=postgres \
    PGDATABASE="${database}" \
    bash "${ROOT_DIR}/${smoke_script}"

  if [[ -n "${post_smoke_script}" ]]; then
    echo "==> Running AI writeback against the same qianchuan fixture DB"
    fixture_object_root="$(mktemp -d "${TMPDIR:-/tmp}/aios-content-assets-${label}-objects.XXXXXX")"
    PGHOST=127.0.0.1 \
      PGPORT="${port}" \
      PGUSER=postgres \
      PGPASSWORD=postgres \
      PGDATABASE="${database}" \
      CONTENT_ASSET_AI_WRITEBACK_PRESERVE_EXISTING_ASSET=1 \
      CONTENT_ASSET_FIXTURE_OBJECT_ROOT="${fixture_object_root}" \
      bash "${ROOT_DIR}/${post_smoke_script}"

    PSQL=(
      psql
      -X
      -v ON_ERROR_STOP=1
      -h 127.0.0.1
      -p "${port}"
      -U postgres
      -d "${database}"
    )
    PGPASSWORD=postgres "${PSQL[@]}" <<'SQL'
DO $$
DECLARE
  v_material_count INTEGER;
  v_summary_count INTEGER;
  v_analysis_count INTEGER;
  v_title TEXT;
BEGIN
  SELECT COUNT(*)
  INTO v_material_count
  FROM ads.marketing_content_ad_materials
  WHERE asset_id = '11111111-1111-1111-1111-111111111111'
    AND external_material_id IN ('MAT-PRODUCT-001', 'MAT-LIVE-001')
    AND relation_status = 'active';

  IF v_material_count <> 2 THEN
    RAISE EXCEPTION 'combined fixture material relations were not preserved: %', v_material_count;
  END IF;

  SELECT COUNT(*)
  INTO v_summary_count
  FROM dws.marketing_content_qianchuan_material_summary
  WHERE asset_id = '11111111-1111-1111-1111-111111111111'
    AND material_id IN ('MAT-PRODUCT-001', 'MAT-LIVE-001');

  IF v_summary_count <> 2 THEN
    RAISE EXCEPTION 'combined fixture qianchuan summaries were not preserved: %', v_summary_count;
  END IF;

  SELECT COUNT(*)
  INTO v_summary_count
  FROM dws.marketing_content_asset_qianchuan_summary
  WHERE asset_id = '11111111-1111-1111-1111-111111111111'
    AND material_count = 2
    AND product_material_count = 1
    AND live_material_count = 1
    AND total_impressions = 30000
    AND total_clicks = 2000
    AND total_orders = 70
    AND total_cost = 2000
    AND total_gmv = 6800;

  IF v_summary_count <> 1 THEN
    RAISE EXCEPTION 'combined fixture qianchuan asset summary was not preserved: %', v_summary_count;
  END IF;

  SELECT COUNT(*)
  INTO v_analysis_count
  FROM ads.marketing_content_asset_objects
  WHERE asset_id = '11111111-1111-1111-1111-111111111111'
    AND object_role = 'analysis'
    AND status = 'active'
    AND object_key = 'analysis/11111111-1111-1111-1111-111111111111/fixture-v21.json';

  IF v_analysis_count <> 1 THEN
    RAISE EXCEPTION 'combined fixture analysis object missing: %', v_analysis_count;
  END IF;

  SELECT title
  INTO v_title
  FROM ads.marketing_content_assets
  WHERE asset_id = '11111111-1111-1111-1111-111111111111';

  IF v_title <> 'qianchuan fixture mixed product live asset' THEN
    RAISE EXCEPTION 'combined fixture asset title was not preserved: %', v_title;
  END IF;
END;
$$;
SQL

    echo "==> Running live-readonly proof gate against the same disposable fixture DB"
    AIOS_QC_ALLOW_LIVE_READONLY=1 \
      MAX_STALENESS_DAYS=3650 \
      PGHOST=127.0.0.1 \
      PGPORT="${port}" \
      PGUSER=postgres \
      PGPASSWORD=postgres \
      PGDATABASE="${database}" \
      bash "${ROOT_DIR}/scripts/checks/marketing/content-assets-qianchuan-live-readonly-smoke.sh"
  fi

  if [[ -n "${backend_test_filter}" ]]; then
    echo "==> Running backend qianchuan fixture route/query tests"
    AIOS_QC_FIXTURE_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${port}/${database}" \
      bash "${ROOT_DIR}/scripts/backend-rust/cargo-with-cache.sh" test "${backend_test_filter}" -- --nocapture
  fi

  cleanup_fixture
  trap - RETURN
}

run_fixture \
  "qc-combined" \
  "aios_qc_fixture" \
  "scripts/checks/marketing/content-assets-qianchuan-fixture-smoke.sh" \
  "fixture_when_configured" \
  "scripts/checks/marketing/content-assets-ai-writeback-fixture-smoke.sh"

run_fixture \
  "ai-writeback" \
  "aios_ai_writeback_fixture" \
  "scripts/checks/marketing/content-assets-ai-writeback-fixture-smoke.sh"

echo "content assets qianchuan fixture suite passed"
