#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-aios_ai_writeback_fixture}"

if [[ "${AIOS_QC_ALLOW_NON_FIXTURE_DB:-0}" != "1" && "${PGDATABASE}" != *fixture* ]]; then
  echo "Refusing to run content asset AI writeback smoke on non-fixture database: ${PGDATABASE}" >&2
  echo "Set AIOS_QC_ALLOW_NON_FIXTURE_DB=1 only for an explicitly disposable test DB." >&2
  exit 2
fi

PSQL=(
  psql
  -X
  -v ON_ERROR_STOP=1
  -h "${PGHOST}"
  -p "${PGPORT}"
  -U "${PGUSER}"
  -d "${PGDATABASE}"
)

echo "==> Bootstrapping content asset AI writeback fixture schema on ${PGHOST}:${PGPORT}/${PGDATABASE}"
"${PSQL[@]}" <<'SQL' >/dev/null
CREATE SCHEMA IF NOT EXISTS ads;

DO $$
BEGIN
  IF to_regclass('ads.marketing_content_assets') IS NOT NULL THEN
    ALTER TABLE ads.marketing_content_assets
      ADD COLUMN IF NOT EXISTS asset_type TEXT DEFAULT 'video',
      ADD COLUMN IF NOT EXISTS asset_status TEXT DEFAULT 'ready',
      ADD COLUMN IF NOT EXISTS profile_status TEXT DEFAULT 'performance_ready',
      ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'waiting_analysis',
      ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual_upload',
      ADD COLUMN IF NOT EXISTS source_platform TEXT,
      ADD COLUMN IF NOT EXISTS source_url TEXT,
      ADD COLUMN IF NOT EXISTS source_record_id TEXT,
      ADD COLUMN IF NOT EXISTS source_sheet_id TEXT,
      ADD COLUMN IF NOT EXISTS source_sheet_name TEXT,
      ADD COLUMN IF NOT EXISTS source_row_index INTEGER,
      ADD COLUMN IF NOT EXISTS external_only BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS bucket TEXT DEFAULT 'aios-content-assets',
      ADD COLUMN IF NOT EXISTS raw_object_key TEXT,
      ADD COLUMN IF NOT EXISTS preview_object_key TEXT,
      ADD COLUMN IF NOT EXISTS cover_object_key TEXT,
      ADD COLUMN IF NOT EXISTS transcript_object_key TEXT,
      ADD COLUMN IF NOT EXISTS analysis_object_key TEXT,
      ADD COLUMN IF NOT EXISTS raw_sha256 TEXT,
      ADD COLUMN IF NOT EXISTS file_ext TEXT,
      ADD COLUMN IF NOT EXISTS mime_type TEXT,
      ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(12, 3),
      ADD COLUMN IF NOT EXISTS width INTEGER,
      ADD COLUMN IF NOT EXISTS height INTEGER,
      ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
      ADD COLUMN IF NOT EXISTS preview_size_bytes BIGINT,
      ADD COLUMN IF NOT EXISTS platform TEXT,
      ADD COLUMN IF NOT EXISTS product_name TEXT,
      ADD COLUMN IF NOT EXISTS creator_name TEXT,
      ADD COLUMN IF NOT EXISTS owner_name TEXT,
      ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS authorization_status TEXT DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS commercial_use_allowed BOOLEAN,
      ADD COLUMN IF NOT EXISTS repurpose_allowed BOOLEAN,
      ADD COLUMN IF NOT EXISTS authorization_starts_at DATE,
      ADD COLUMN IF NOT EXISTS authorization_expires_at DATE,
      ADD COLUMN IF NOT EXISTS authorization_notes TEXT,
      ADD COLUMN IF NOT EXISTS ai_summary TEXT,
      ADD COLUMN IF NOT EXISTS ai_score NUMERIC,
      ADD COLUMN IF NOT EXISTS ai_analysis_source TEXT,
      ADD COLUMN IF NOT EXISTS ai_analysis_model TEXT,
      ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ai_suggested_title TEXT,
      ADD COLUMN IF NOT EXISTS ai_suggested_tags TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS ai_metadata_generated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS title_source TEXT DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS tags_source TEXT DEFAULT 'empty',
      ADD COLUMN IF NOT EXISTS transcript_source TEXT,
      ADD COLUMN IF NOT EXISTS transcript_model TEXT,
      ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS script_excerpt TEXT,
      ADD COLUMN IF NOT EXISTS roi NUMERIC(12, 4),
      ADD COLUMN IF NOT EXISTS ctr NUMERIC(12, 6),
      ADD COLUMN IF NOT EXISTS cvr NUMERIC(12, 6),
      ADD COLUMN IF NOT EXISTS spend NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS gmv NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS uploaded_by TEXT,
      ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;
  END IF;

  IF to_regclass('ads.marketing_content_asset_objects') IS NOT NULL THEN
    ALTER TABLE ads.marketing_content_asset_objects
      ADD COLUMN IF NOT EXISTS object_role TEXT DEFAULT 'raw',
      ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'fixture',
      ADD COLUMN IF NOT EXISTS bucket TEXT DEFAULT 'fixture',
      ADD COLUMN IF NOT EXISTS region TEXT,
      ADD COLUMN IF NOT EXISTS content_type TEXT,
      ADD COLUMN IF NOT EXISTS file_ext TEXT,
      ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
      ADD COLUMN IF NOT EXISTS sha256 TEXT,
      ADD COLUMN IF NOT EXISTS etag TEXT,
      ADD COLUMN IF NOT EXISTS width INTEGER,
      ADD COLUMN IF NOT EXISTS height INTEGER,
      ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(12, 3),
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;
  END IF;

  IF to_regclass('ads.marketing_content_platform_videos') IS NOT NULL THEN
    ALTER TABLE ads.marketing_content_platform_videos
      ADD COLUMN IF NOT EXISTS account_id TEXT,
      ADD COLUMN IF NOT EXISTS account_name TEXT,
      ADD COLUMN IF NOT EXISTS advertiser_id TEXT,
      ADD COLUMN IF NOT EXISTS external_item_id TEXT,
      ADD COLUMN IF NOT EXISTS external_note_id TEXT,
      ADD COLUMN IF NOT EXISTS external_url TEXT,
      ADD COLUMN IF NOT EXISTS publish_title TEXT,
      ADD COLUMN IF NOT EXISTS publish_cover_url TEXT,
      ADD COLUMN IF NOT EXISTS publish_status TEXT DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS confidence NUMERIC(5, 2),
      ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::JSONB;
  END IF;

  IF to_regclass('ads.marketing_content_ad_materials') IS NOT NULL THEN
    ALTER TABLE ads.marketing_content_ad_materials
      ADD COLUMN IF NOT EXISTS account_id TEXT,
      ADD COLUMN IF NOT EXISTS account_name TEXT,
      ADD COLUMN IF NOT EXISTS advertiser_id TEXT,
      ADD COLUMN IF NOT EXISTS external_video_id TEXT,
      ADD COLUMN IF NOT EXISTS material_name TEXT,
      ADD COLUMN IF NOT EXISTS material_title TEXT,
      ADD COLUMN IF NOT EXISTS material_cover_url TEXT,
      ADD COLUMN IF NOT EXISTS material_status TEXT DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS created_at_on_platform TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS confidence NUMERIC(5, 2),
      ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::JSONB;
  END IF;
END;
$$;
SQL
"${PSQL[@]}" -f "${ROOT_DIR}/etl/groland_postgres/sql/migrations/20260522_1600__create_ads_marketing_content_assets.sql" >/dev/null
"${PSQL[@]}" -f "${ROOT_DIR}/etl/groland_postgres/sql/migrations/20260525_1530__add_marketing_content_asset_ai_analysis_metadata.sql" >/dev/null
"${PSQL[@]}" -f "${ROOT_DIR}/etl/groland_postgres/sql/migrations/20260525_1810__add_marketing_content_asset_transcripts.sql" >/dev/null
"${PSQL[@]}" -f "${ROOT_DIR}/etl/groland_postgres/sql/migrations/20260526_1030__add_marketing_content_asset_ai_metadata_suggestions.sql" >/dev/null
"${PSQL[@]}" <<'SQL' >/dev/null
-- Combined fixtures may arrive through the older migration. Reproduce its
-- known partial-column drift so the focused migration proves it can repair it.
ALTER TABLE IF EXISTS ads.marketing_content_asset_video_understanding_jobs
  DROP COLUMN IF EXISTS input_snapshot_hash;
ALTER TABLE IF EXISTS ads.marketing_content_asset_video_understanding_jobs
  DROP COLUMN IF EXISTS cache_key;
ALTER TABLE IF EXISTS ads.marketing_content_asset_video_understanding_results
  DROP COLUMN IF EXISTS cache_key;
SQL
"${PSQL[@]}" -f "${ROOT_DIR}/etl/groland_postgres/sql/migrations/20260713_1100__ensure_marketing_content_video_understanding_storage.sql" >/dev/null
"${PSQL[@]}" -f "${ROOT_DIR}/etl/groland_postgres/sql/migrations/20260713_1100__ensure_marketing_content_video_understanding_storage.sql" >/dev/null
"${PSQL[@]}" -f "${ROOT_DIR}/etl/groland_postgres/tests/sql/marketing_content_video_understanding_storage_check.sql" >/dev/null

echo "==> Running _complete_analysis_job against fixture DB"
AIOS_REPO_ROOT="${ROOT_DIR}" uv run --project "${ROOT_DIR}/etl/groland_postgres" python - <<'PY'
from __future__ import annotations

import json
import os
import sys
import types
from pathlib import Path

import psycopg2
import psycopg2.extras


root_dir = Path(os.environ["AIOS_REPO_ROOT"])
sys.path.insert(0, str(root_dir / "etl/groland_postgres/scripts"))

from marketing_content_assets import analysis_processor  # noqa: E402


ASSET_ID = "11111111-1111-1111-1111-111111111111"
JOB_ID = "22222222-2222-2222-2222-222222222222"
HYDRATION_JOB_ID = "77777777-7777-7777-7777-777777777777"
FAILED_ASSET_ID = "33333333-3333-3333-3333-333333333333"
FAILED_JOB_ID = "44444444-4444-4444-4444-444444444444"
SKIPPED_ASSET_ID = "55555555-5555-5555-5555-555555555555"
SKIPPED_JOB_ID = "66666666-6666-6666-6666-666666666666"
ANALYSIS_KEY = "analysis/11111111-1111-1111-1111-111111111111/fixture-v21.json"
MODEL_NAME = "doubao-seed-2-0-lite-260428"
SCHEMA_VERSION = "2.1"
PROMPT_VERSION = "v9"
PROMPT_KEY = "content_asset_analysis:v9:schema:2.1"
PRESERVE_EXISTING_ASSET = os.environ.get("CONTENT_ASSET_AI_WRITEBACK_PRESERVE_EXISTING_ASSET") == "1"

analysis = {
  "summary": "Data/content fusion diagnosis: content_asset_ai_v2.1 full_fusion_fixture live acceptance is the primary weak stage.",
  "score": 76,
  "confidence": 0.82,
  "analysis_schema_version": SCHEMA_VERSION,
  "diagnosis_mode": "data_content_fusion",
  "delivery_mode": "qianchuan_all_domain",
  "objective": "live_all_domain_shortvideo",
  "timeline": [{"start": 0, "end": 3, "observation": "strong opening hook"}],
  "performance_diagnosis": {
    "verdict": "mixed",
    "live_acceptance_status": "available",
    "metric_evidence": [{"metric": "ctr", "value": 0.041}],
    "live_acceptance_attribution": {
      "level": "account_date_environment",
      "confidence": "medium",
    },
  },
  "content_diagnosis": {
    "hook_assessment": {"strength": "strong"},
    "cart_assessment": {"weakness": "offer handoff is not explicit enough"},
    "evidence_ledger": [
      {
        "id": "content:hook",
        "metric": "前三秒钩子",
        "value": "强",
        "benchmark": "3 秒内讲清收益",
        "judgment": "good",
        "source": "input_video",
        "meaning": "好点：前三秒能清楚给出利益点，支撑进房点击。",
      }
    ],
  },
  "fusion_diagnosis": {
    "one_sentence_summary": "content_asset_ai_v2.1 full_fusion_fixture：素材钩子能解释点击与进房，但直播承接弱限制成交。",
    "final_verdict": "needs_iteration",
    "good_points": ["前三秒能清楚给出利益点", "商品挂车素材可小幅放量验证"],
    "bad_points": [{"label": "直播承接", "value": "弱", "judgment": "weak"}],
    "primary_problem_stage": "live_room_acceptance_weak",
    "final_root_cause_owner": "live_room",
    "confidence": 0.82,
    "why": "CTR 和进房意图可用，但账号日期级直播承接偏弱；这是直播承接归因边界，不代表 MAT-LIVE-001 单素材精确成交贡献。",
    "metric_evidence": [
      {
        "key": "ctr",
        "metric": "点击率",
        "label": "点击率",
        "value": "4.1%",
        "benchmark": ">= 1.5%",
        "judgment": "good",
      },
    ],
    "content_evidence": [
      {
        "metric": "前三秒钩子",
        "label": "前三秒钩子",
        "value": "强",
        "benchmark": "3 秒内讲清收益",
        "judgment": "good",
      },
    ],
    "evidence_ledger": [
      {
        "id": "fusion:root_cause",
        "metric": "直播承接归因边界",
        "value": "account_date_environment",
        "benchmark": "账号日期级承接环境",
        "judgment": "weak",
        "source": "performanceDiagnosis + input_video",
        "meaning": "素材引流可以，成交承接不能归因到单 material_id。",
      }
    ],
    "live_acceptance_attribution": {
      "level": "account_date_environment",
      "confidence": "medium",
      "source": "dws.marketing_content_qianchuan_live_room_acceptance_di",
      "limitation": "直播间成交数据为账号/日期级承接环境，不代表单 material_id 精确成交贡献。",
    },
    "next_actions": [
      {
        "title": "重剪直播承接版",
        "detail": "开头保留利益点，进房前补直播间权益、价格锚点和购买路径。",
        "owner": "creative",
        "priority": "high",
        "metric_target": "live_room_click_rate",
        "expected_metric_lift": "提升直播间商品点击率",
        "action_type": "check_live_room_script",
        "reason": "素材点击不弱但直播承接弱。",
        "evidence_refs": ["ev_live_acceptance", "content:hook"],
      }
    ],
  },
  "scores": {"fusion_overall_score": 76, "confidence": 0.82},
  "evidence_ledger": [
    {
      "id": "ev_live_acceptance",
      "metric": "直播承接",
      "value": "弱",
      "benchmark": "account_date_environment",
      "judgment": "weak",
      "source": "performance",
      "meaning": "click quality is not converted by the live room acceptance layer",
    }
  ],
  "next_actions": [
    {
      "title": "商品挂车素材小幅放量",
      "detail": "商品挂车素材先小预算放量，监控退款率和净 GMV ROI。",
      "owner": "operator",
      "priority": "medium",
      "metric_target": "net_gmv_roi",
      "expected_metric_lift": "保持净 GMV ROI > 4",
      "action_type": "scale_product_cart_material",
      "evidence_refs": ["ev_live_acceptance"],
    },
    {
      "title": "重剪直播承接版",
      "detail": "围绕直播间权益重剪一版引流素材，不自动调整投放预算。",
      "owner": "creative",
      "priority": "high",
      "metric_target": "live_room_click_rate",
      "expected_metric_lift": "提升直播间商品点击率",
      "action_type": "revise_live_room_offer",
      "evidence_refs": ["ev_live_acceptance", "content:hook"],
    }
  ],
  "risk": {"notes": ["boost metrics are explanatory only"]},
}

result = types.SimpleNamespace(
  analysis=analysis,
  text=json.dumps(analysis, ensure_ascii=False),
  usage={"input_tokens": 123, "output_tokens": 456},
  response_id="resp_fixture_v21_writeback",
  request_settings={
    "analysis_schema_version": SCHEMA_VERSION,
    "prompt_version": PROMPT_VERSION,
    "analysis_profile": "raw_deep",
  },
)

fixture_object_root = os.environ.get("CONTENT_ASSET_FIXTURE_OBJECT_ROOT")
if fixture_object_root:
  fixture_object_path = Path(fixture_object_root) / ANALYSIS_KEY
  fixture_object_path.parent.mkdir(parents=True, exist_ok=True)
  fixture_object_path.write_text(result.text, encoding="utf-8")


def require(condition: bool, message: str) -> None:
  if not condition:
    raise AssertionError(message)


ASSET_IDS = (ASSET_ID, FAILED_ASSET_ID, SKIPPED_ASSET_ID)
JOB_IDS = (JOB_ID, FAILED_JOB_ID, SKIPPED_JOB_ID)
ASSET_ROWS = (
  (ASSET_ID, JOB_ID, "raw_media_hash_fixture", "raw/fixture.mp4"),
  (FAILED_ASSET_ID, FAILED_JOB_ID, "raw_media_hash_failed", "raw/failed.mp4"),
  (SKIPPED_ASSET_ID, SKIPPED_JOB_ID, "", None),
)

UPSERT_ASSET_SQL = (
  """
  INSERT INTO ads.marketing_content_assets (
    asset_id,
    title,
    asset_type,
    asset_status,
    profile_status,
    lifecycle_status,
    source_type,
    bucket,
    raw_object_key,
    raw_sha256,
    tags,
    title_source,
    tags_source,
    is_deleted
  ) VALUES (
    %s,
    'unnamed fixture asset',
    'video',
    'ready',
    'performance_ready',
    'waiting_analysis',
    'manual_upload',
    'aios-content-assets',
    %s,
    %s,
    ARRAY[]::text[],
    'unknown',
    'empty',
    FALSE
  )
  ON CONFLICT (asset_id) DO UPDATE SET
    title = EXCLUDED.title,
    asset_type = EXCLUDED.asset_type,
    asset_status = EXCLUDED.asset_status,
    profile_status = EXCLUDED.profile_status,
    lifecycle_status = EXCLUDED.lifecycle_status,
    source_type = EXCLUDED.source_type,
    bucket = EXCLUDED.bucket,
    raw_object_key = EXCLUDED.raw_object_key,
    raw_sha256 = EXCLUDED.raw_sha256,
    tags = EXCLUDED.tags,
    title_source = EXCLUDED.title_source,
    tags_source = EXCLUDED.tags_source,
    is_deleted = FALSE,
    updated_at = CURRENT_TIMESTAMP
  """
)

PRESERVE_ASSET_UPSERT_SQL = (
  """
  INSERT INTO ads.marketing_content_assets (
    asset_id,
    title,
    asset_type,
    asset_status,
    profile_status,
    lifecycle_status,
    source_type,
    bucket,
    raw_object_key,
    raw_sha256,
    tags,
    title_source,
    tags_source,
    is_deleted
  ) VALUES (
    %s,
    'unnamed fixture asset',
    'video',
    'ready',
    'performance_ready',
    'waiting_analysis',
    'manual_upload',
    'aios-content-assets',
    %s,
    %s,
    ARRAY[]::text[],
    'unknown',
    'empty',
    FALSE
  )
  ON CONFLICT (asset_id) DO UPDATE SET
    asset_type = EXCLUDED.asset_type,
    asset_status = EXCLUDED.asset_status,
    profile_status = EXCLUDED.profile_status,
    lifecycle_status = EXCLUDED.lifecycle_status,
    source_type = COALESCE(NULLIF(ads.marketing_content_assets.source_type, ''), EXCLUDED.source_type),
    bucket = COALESCE(NULLIF(ads.marketing_content_assets.bucket, ''), EXCLUDED.bucket),
    raw_object_key = COALESCE(NULLIF(ads.marketing_content_assets.raw_object_key, ''), EXCLUDED.raw_object_key),
    raw_sha256 = COALESCE(NULLIF(ads.marketing_content_assets.raw_sha256, ''), EXCLUDED.raw_sha256),
    tags = CASE
      WHEN COALESCE(CARDINALITY(ads.marketing_content_assets.tags), 0) = 0 THEN EXCLUDED.tags
      ELSE ads.marketing_content_assets.tags
    END,
    title_source = COALESCE(NULLIF(ads.marketing_content_assets.title_source, ''), EXCLUDED.title_source),
    tags_source = COALESCE(NULLIF(ads.marketing_content_assets.tags_source, ''), EXCLUDED.tags_source),
    is_deleted = FALSE,
    updated_at = CURRENT_TIMESTAMP
  """
)

with psycopg2.connect("") as conn:
  with conn.cursor() as cur:
    cur.execute(
      """
      DELETE FROM ads.marketing_content_asset_video_understanding_results
      WHERE asset_id IN (%s, %s, %s)
      """,
      ASSET_IDS,
    )
    cur.execute(
      """
      DELETE FROM ads.marketing_content_asset_video_understanding_jobs
      WHERE asset_id IN (%s, %s, %s)
        OR job_id IN (%s, %s, %s)
      """,
      (*ASSET_IDS, *JOB_IDS),
    )
    cur.execute(
      """
      DELETE FROM ads.marketing_content_asset_processing_jobs
      WHERE asset_id IN (%s, %s, %s)
        OR job_id IN (%s, %s, %s)
      """,
      (*ASSET_IDS, *JOB_IDS),
    )
    cur.execute(
      """
      DELETE FROM ads.marketing_content_asset_events
      WHERE asset_id IN (%s, %s, %s)
        AND event_type IN (
          'analysis_completed',
          'analysis_failed',
          'analysis_cache_hydration_completed'
        )
      """,
      ASSET_IDS,
    )
    cur.execute(
      """
      DELETE FROM ads.marketing_content_asset_objects
      WHERE asset_id IN (%s, %s, %s)
        AND object_role = 'analysis'
      """,
      ASSET_IDS,
    )

    if not PRESERVE_EXISTING_ASSET:
      cur.execute(
        """
        DELETE FROM ads.marketing_content_assets
        WHERE asset_id IN (%s, %s, %s)
        """,
        ASSET_IDS,
      )

    asset_upsert_sql = PRESERVE_ASSET_UPSERT_SQL if PRESERVE_EXISTING_ASSET else UPSERT_ASSET_SQL
    for asset_id, job_id, raw_sha256, input_object_key in ASSET_ROWS:
      cur.execute(asset_upsert_sql, (asset_id, input_object_key, raw_sha256))
      cur.execute(
        """
        INSERT INTO ads.marketing_content_asset_processing_jobs (
          job_id,
          asset_id,
          job_type,
          status,
          attempts,
          max_attempts,
          input_object_key,
          metadata,
          started_at
        ) VALUES (
          %s,
          %s,
          'analysis',
          'running',
          1,
          1,
          %s,
          '{}'::jsonb,
          CURRENT_TIMESTAMP
        )
        """,
        (job_id, asset_id, input_object_key),
      )
  conn.commit()

  analysis_processor._complete_analysis_job(
    conn,
    job={
      "asset_id": ASSET_ID,
      "job_id": JOB_ID,
      "bucket": "aios-content-assets",
      "raw_sha256": "raw_media_hash_fixture",
    },
    analysis_key=ANALYSIS_KEY,
    analysis_size_bytes=len(result.text.encode("utf-8")),
    analysis_sha256="a" * 64,
    summary=analysis["summary"],
    score=76,
    suggested_title="Live acceptance review asset",
    suggested_tags=["live_acceptance", "qianchuan_all_domain"],
    result=result,
    model_name=MODEL_NAME,
    request_settings=result.request_settings,
    input_role="raw",
    input_object_key="raw/fixture.mp4",
    model_input_role="raw",
    model_input_object_key="raw/fixture.mp4",
    input_strategy="signed_url",
  )
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT object_id::text
      FROM ads.marketing_content_asset_objects
      WHERE asset_id = %s
        AND object_role = 'analysis'
        AND object_key = %s
      LIMIT 1
      """,
      (ASSET_ID, ANALYSIS_KEY),
    )
    analysis_object_id = cur.fetchone()[0]
    cur.execute(
      "DELETE FROM ads.marketing_content_asset_video_understanding_results WHERE asset_id = %s",
      (ASSET_ID,),
    )
    cur.execute(
      "DELETE FROM ads.marketing_content_asset_video_understanding_jobs WHERE asset_id = %s",
      (ASSET_ID,),
    )
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_processing_jobs (
        job_id, asset_id, job_type, status, attempts, max_attempts,
        input_object_key, metadata, started_at
      ) VALUES (
        %s, %s, 'analysis', 'running', 1, 1, %s,
        jsonb_build_object(
          'operation', 'hydrate_video_understanding_cache',
          'model_call_expected', FALSE
        ),
        CURRENT_TIMESTAMP
      )
      """,
      (HYDRATION_JOB_ID, ASSET_ID, ANALYSIS_KEY),
    )
  conn.commit()
  analysis_processor._complete_analysis_cache_hydration_job(
    conn,
    job={
      "asset_id": ASSET_ID,
      "job_id": HYDRATION_JOB_ID,
      "analysis_object_id": analysis_object_id,
      "raw_sha256": "raw_media_hash_fixture",
    },
    result=result,
    model_name=MODEL_NAME,
    request_settings=result.request_settings,
    analysis_artifact_object_key=ANALYSIS_KEY,
    input_role="raw",
    input_object_key="raw/fixture.mp4",
    model_input_role="raw",
    model_input_object_key="raw/fixture.mp4",
    input_strategy="signed_url",
  )
  analysis_processor._fail_analysis_job(
    conn,
    {
      "asset_id": FAILED_ASSET_ID,
      "job_id": FAILED_JOB_ID,
      "input_object_key": "raw/failed.mp4",
      "raw_sha256": "raw_media_hash_failed",
      "attempts": 1,
      "max_attempts": 1,
    },
    "AccountOverdueError: model service has been paused",
    model_name=MODEL_NAME,
    analysis_schema_version=SCHEMA_VERSION,
    prompt_version=PROMPT_VERSION,
  )
  analysis_processor._fail_analysis_job(
    conn,
    {
      "asset_id": SKIPPED_ASSET_ID,
      "job_id": SKIPPED_JOB_ID,
      "attempts": 1,
      "max_attempts": 1,
    },
    "missing video: no analyzable video object",
    model_name=MODEL_NAME,
    analysis_schema_version=SCHEMA_VERSION,
    prompt_version=PROMPT_VERSION,
  )

with psycopg2.connect("", cursor_factory=psycopg2.extras.RealDictCursor) as conn:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_assets
      WHERE asset_id = %s
      """,
      (ASSET_ID,),
    )
    asset = cur.fetchone()
    require(asset is not None, "asset row missing")
    require(asset["ai_summary"].startswith("Data/content fusion diagnosis"), "ai_summary not written")
    require(float(asset["ai_score"]) == 76.0, "ai_score not written")
    require(asset["analysis_object_key"] == ANALYSIS_KEY, "analysis_object_key not written")
    require(asset["ai_analysis_source"] == "raw", "ai_analysis_source not written")
    require(asset["ai_analysis_model"] == MODEL_NAME, "ai_analysis_model not written")
    require(asset["lifecycle_status"] == "testable", "lifecycle_status not advanced")

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_objects
      WHERE asset_id = %s AND object_role = 'analysis'
      """,
      (ASSET_ID,),
    )
    analysis_object = cur.fetchone()
    require(analysis_object is not None, "analysis object row missing")
    metadata = analysis_object["metadata"]
    require(metadata["analysis_schema_version"] == SCHEMA_VERSION, "schema metadata missing")
    require(metadata["diagnosis_mode"] == "data_content_fusion", "diagnosis mode metadata missing")
    require(metadata["delivery_mode"] == "qianchuan_all_domain", "delivery mode metadata missing")
    require(metadata["objective"] == "live_all_domain_shortvideo", "objective metadata missing")
    require(metadata["primary_problem_stage"] == "live_room_acceptance_weak", "problem stage metadata missing")
    require(metadata["final_root_cause_owner"] == "live_room", "owner metadata missing")
    require(metadata["has_video_understanding"] is True, "video-understanding flag missing")
    require(metadata["has_performance_snapshot"] is True, "performance flag missing")
    require(metadata["has_live_acceptance"] is True, "live acceptance flag missing")

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_video_understanding_jobs
      WHERE asset_id = %s
      """,
      (ASSET_ID,),
    )
    video_job = cur.fetchone()
    require(video_job is not None, "video-understanding job row missing")
    require(video_job["status"] == "succeeded", "video-understanding job not succeeded")
    require(video_job["model_name"] == MODEL_NAME, "video job model mismatch")
    require(video_job["prompt_version"] == PROMPT_KEY, "video job prompt mismatch")
    require(video_job["analysis_schema_version"] == SCHEMA_VERSION, "video job schema mismatch")
    require(len(video_job["input_snapshot_hash"]) == 64, "video job input hash missing")
    require(video_job["cache_key"].startswith("content-asset-video-understanding:"), "video job cache key missing")

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_video_understanding_results
      WHERE asset_id = %s
      """,
      (ASSET_ID,),
    )
    video_result = cur.fetchone()
    require(video_result is not None, "video-understanding result row missing")
    require(video_result["analysis_schema_version"] == SCHEMA_VERSION, "video result schema mismatch")
    require(len(video_result["input_snapshot_hash"]) == 64, "video result input hash missing")
    require(video_result["cache_key"].startswith("content-asset-video-understanding:"), "video result cache key missing")
    require(float(video_result["confidence"]) == 0.82, "video result confidence mismatch")
    require(video_result["result_json"]["analysis"]["diagnosis_mode"] == "data_content_fusion", "video result json missing")

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_processing_jobs
      WHERE job_id = %s
      """,
      (JOB_ID,),
    )
    processing_job = cur.fetchone()
    require(processing_job is not None, "processing job missing")
    require(processing_job["status"] == "succeeded", "processing job not succeeded")
    require(processing_job["output_object_key"] == ANALYSIS_KEY, "processing output key missing")
    require(processing_job["metadata"]["analysis_schema_version"] == SCHEMA_VERSION, "processing schema metadata missing")
    require(processing_job["metadata"]["primary_problem_stage"] == "live_room_acceptance_weak", "processing problem stage missing")
    require(processing_job["metadata"]["has_performance_snapshot"] is True, "processing performance flag missing")
    require(
      processing_job["metadata"]["video_understanding_cache_persisted"] is True,
      "processing structured cache persistence flag missing",
    )

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_processing_jobs
      WHERE job_id = %s
      """,
      (HYDRATION_JOB_ID,),
    )
    hydration_job = cur.fetchone()
    require(hydration_job is not None, "hydration processing job missing")
    require(hydration_job["status"] == "succeeded", "hydration processing job not succeeded")
    require(
      hydration_job["metadata"]["operation"] == "hydrate_video_understanding_cache",
      "hydration operation metadata missing",
    )
    require(
      hydration_job["metadata"]["model_call_performed"] is False,
      "hydration must record no model call",
    )
    require(
      hydration_job["metadata"]["video_understanding_cache_persisted"] is True,
      "hydration structured persistence flag missing",
    )

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_events
      WHERE asset_id = %s AND event_type = 'analysis_cache_hydration_completed'
      """,
      (ASSET_ID,),
    )
    hydration_event = cur.fetchone()
    require(hydration_event is not None, "hydration completion event missing")
    require(
      hydration_event["payload"]["modelCallPerformed"] is False,
      "hydration event must record no model call",
    )

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_events
      WHERE asset_id = %s AND event_type = 'analysis_completed'
      """,
      (ASSET_ID,),
    )
    event = cur.fetchone()
    require(event is not None, "analysis_completed event missing")
    require(event["payload"]["analysisObjectKey"] == ANALYSIS_KEY, "event analysis key missing")
    require(event["payload"]["provider"] == "ark", "event provider missing")
    require(event["payload"]["modelInputRole"] == "raw", "event model input role missing")

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_video_understanding_jobs
      WHERE job_id = %s
      """,
      (FAILED_JOB_ID,),
    )
    failed_video_job = cur.fetchone()
    require(failed_video_job is not None, "failed video-understanding job missing")
    require(failed_video_job["status"] == "failed", "failed video-understanding status mismatch")
    require(failed_video_job["model_name"] == MODEL_NAME, "failed video job model mismatch")
    require(failed_video_job["prompt_version"] == PROMPT_KEY, "failed video job prompt mismatch")
    require("AccountOverdueError" in failed_video_job["error_message"], "failed video job error missing")

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_processing_jobs
      WHERE job_id = %s
      """,
      (FAILED_JOB_ID,),
    )
    failed_processing_job = cur.fetchone()
    require(failed_processing_job is not None, "failed processing job missing")
    require(failed_processing_job["status"] == "failed", "failed processing job status mismatch")
    require(
      failed_processing_job["metadata"]["video_understanding_job_status"] == "failed",
      "failed processing video status metadata missing",
    )
    require(
      failed_processing_job["metadata"]["video_understanding_job_recorded"] is True,
      "failed processing recorded flag missing",
    )

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_video_understanding_jobs
      WHERE job_id = %s
      """,
      (SKIPPED_JOB_ID,),
    )
    skipped_video_job = cur.fetchone()
    require(skipped_video_job is not None, "skipped video-understanding job missing")
    require(skipped_video_job["status"] == "skipped", "skipped video-understanding status mismatch")
    require(skipped_video_job["analysis_schema_version"] == SCHEMA_VERSION, "skipped video job schema mismatch")
    require("missing video" in skipped_video_job["error_message"], "skipped video job error missing")

    cur.execute(
      """
      SELECT *
      FROM ads.marketing_content_asset_processing_jobs
      WHERE job_id = %s
      """,
      (SKIPPED_JOB_ID,),
    )
    skipped_processing_job = cur.fetchone()
    require(skipped_processing_job is not None, "skipped processing job missing")
    require(skipped_processing_job["status"] == "failed", "skipped processing job status mismatch")
    require(
      skipped_processing_job["metadata"]["video_understanding_job_status"] == "skipped",
      "skipped processing video status metadata missing",
    )
    require(
      skipped_processing_job["metadata"]["video_understanding_job_recorded"] is True,
      "skipped processing recorded flag missing",
    )

print("content asset AI v2.1 writeback/lifecycle fixture smoke passed")
PY
