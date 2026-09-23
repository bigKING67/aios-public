from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any, Mapping

import psycopg2
import psycopg2.extras

from .ark_responses import (
  ArkAnalysisResult,
  DEFAULT_CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION,
  DEFAULT_CONTENT_ASSET_FUSION_ANALYSIS_PROMPT_VERSION,
  normalize_content_asset_analysis_contract,
)
from .worker_runtime import json_safe


def analysis_schema_version(request_settings: Mapping[str, Any] | None) -> str:
  if request_settings:
    value = str(request_settings.get("analysis_schema_version") or "").strip()
    if value:
      return value
  return DEFAULT_CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION


def analysis_prompt_version_from_settings(
  request_settings: Mapping[str, Any] | None,
  schema_version: str,
) -> str:
  request_settings = request_settings or {}
  prompt_version_value = str(
    request_settings.get("prompt_version")
    or request_settings.get("fusion_analysis_prompt_version")
    or request_settings.get("video_understanding_prompt_version")
    or DEFAULT_CONTENT_ASSET_FUSION_ANALYSIS_PROMPT_VERSION
  ).strip()
  if prompt_version_value.startswith("content_asset_analysis:"):
    return prompt_version_value
  return f"content_asset_analysis:{prompt_version_value}:schema:{schema_version}"


def video_understanding_media_hash(job: Mapping[str, Any], model_input_object_key: str) -> str:
  media_hash = str(job.get("raw_sha256") or "").strip()
  if media_hash:
    return media_hash
  identity_source = model_input_object_key or f"{job.get('asset_id')}:{job.get('job_id')}"
  return hashlib.sha256(identity_source.encode("utf-8")).hexdigest()


def video_understanding_cache_key(
  *,
  asset_id: str,
  media_hash: str,
  model_name: str,
  prompt_version: str,
  schema_version: str,
  input_snapshot_hash: str = "",
) -> str:
  base_key = (
    f"content-asset-video-understanding:{asset_id}:{media_hash}:"
    f"{model_name}:{prompt_version}:{schema_version}"
  )
  return f"{base_key}:{input_snapshot_hash}" if input_snapshot_hash else base_key


def video_understanding_input_snapshot(
  *,
  input_role: str,
  input_object_key: str,
  model_input_role: str,
  model_input_object_key: str,
  input_strategy: str,
  request_settings: Mapping[str, Any],
) -> dict[str, Any]:
  return {
    "inputRole": input_role,
    "inputObjectKey": input_object_key,
    "modelInputRole": model_input_role,
    "modelInputObjectKey": model_input_object_key,
    "inputStrategy": input_strategy,
    "analysisProfile": request_settings.get("analysis_profile"),
    "requestSettings": dict(request_settings),
  }


def video_understanding_input_snapshot_hash(input_snapshot: Mapping[str, Any]) -> str:
  input_snapshot_json = json.dumps(input_snapshot, ensure_ascii=False, sort_keys=True)
  return hashlib.sha256(input_snapshot_json.encode("utf-8")).hexdigest()


def load_cached_video_understanding_result(
  conn: psycopg2.extensions.connection,
  *,
  job: dict[str, Any],
  model_name: str,
  request_settings: dict[str, Any],
  input_role: str,
  input_object_key: str,
  model_input_role: str,
  model_input_object_key: str,
  input_strategy: str,
) -> ArkAnalysisResult | None:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      SELECT
        to_regclass('ads.marketing_content_asset_video_understanding_jobs') IS NOT NULL AS jobs_exists,
        to_regclass('ads.marketing_content_asset_video_understanding_results') IS NOT NULL AS results_exists
      """
    )
    exists_row = cur.fetchone() or {}
    if not _cursor_bool(exists_row, "jobs_exists") or not _cursor_bool(exists_row, "results_exists", 1):
      return None

    asset_id = str(job["asset_id"])
    schema_version = analysis_schema_version(request_settings)
    prompt_version = analysis_prompt_version_from_settings(request_settings, schema_version)
    media_hash = video_understanding_media_hash(job, model_input_object_key)
    input_snapshot = video_understanding_input_snapshot(
      input_role=input_role,
      input_object_key=input_object_key,
      model_input_role=model_input_role,
      model_input_object_key=model_input_object_key,
      input_strategy=input_strategy,
      request_settings=request_settings,
    )
    input_snapshot_hash = video_understanding_input_snapshot_hash(input_snapshot)
    cache_key = video_understanding_cache_key(
      asset_id=asset_id,
      media_hash=media_hash,
      model_name=model_name,
      prompt_version=prompt_version,
      schema_version=schema_version,
      input_snapshot_hash=input_snapshot_hash,
    )
    cur.execute(
      """
      SELECT
        result.result_id::text AS result_id,
        result.result_json,
        result.cache_key
      FROM ads.marketing_content_asset_video_understanding_results result
      JOIN ads.marketing_content_asset_video_understanding_jobs job
        ON job.asset_id = result.asset_id
       AND job.media_hash = result.media_hash
       AND job.model_name = result.model_name
       AND job.prompt_version = result.prompt_version
       AND job.analysis_schema_version = result.analysis_schema_version
       AND job.cache_key = result.cache_key
       AND job.status = 'succeeded'
      WHERE result.cache_key = %s
      ORDER BY result.updated_at DESC
      LIMIT 1
      """,
      (cache_key,),
    )
    row = cur.fetchone()
  if not row:
    return None

  result_json = row.get("result_json") if isinstance(row, Mapping) else None
  if isinstance(result_json, str):
    result_json = json.loads(result_json)
  if not isinstance(result_json, Mapping):
    return None
  analysis = result_json.get("analysis")
  if not isinstance(analysis, dict):
    return None
  analysis = normalize_content_asset_analysis_contract(analysis)
  usage = result_json.get("usage")
  raw_response = {
    "id": str(result_json.get("responseId") or row.get("result_id") or ""),
    "usage": usage if isinstance(usage, dict) else {},
    "cached": True,
    "cache_key": row.get("cache_key"),
  }
  output_text = str(result_json.get("outputText") or json.dumps(analysis, ensure_ascii=False))
  return ArkAnalysisResult(
    text=output_text,
    analysis=analysis,
    raw_response=raw_response,
    request_settings=request_settings,
  )


def persist_video_understanding_cache(
  cur: psycopg2.extensions.cursor,
  *,
  job: dict[str, Any],
  analysis_object_id: str | None,
  result: Any,
  model_name: str,
  request_settings: dict[str, Any],
  input_role: str,
  input_object_key: str,
  model_input_role: str,
  model_input_object_key: str,
  input_strategy: str,
) -> bool:
  cur.execute(
    """
    SELECT
      to_regclass('ads.marketing_content_asset_video_understanding_jobs') IS NOT NULL AS jobs_exists,
      to_regclass('ads.marketing_content_asset_video_understanding_results') IS NOT NULL AS results_exists,
      NOT EXISTS (
        SELECT 1
        FROM (
          VALUES
            ('marketing_content_asset_video_understanding_jobs', 'input_snapshot_hash'),
            ('marketing_content_asset_video_understanding_jobs', 'cache_key'),
            ('marketing_content_asset_video_understanding_results', 'input_snapshot_hash'),
            ('marketing_content_asset_video_understanding_results', 'cache_key'),
            ('marketing_content_asset_video_understanding_results', 'result_json')
        ) AS required(table_name, column_name)
        WHERE NOT EXISTS (
          SELECT 1
          FROM information_schema.columns column_info
          WHERE column_info.table_schema = 'ads'
            AND column_info.table_name = required.table_name
            AND column_info.column_name = required.column_name
        )
      ) AS required_columns_exist
    """
  )
  jobs_exists, results_exists, required_columns_exist = cur.fetchone() or (False, False, False)
  if not jobs_exists or not results_exists or not required_columns_exist:
    return False

  asset_id = str(job["asset_id"])
  job_id = str(job["job_id"])
  schema_version = analysis_schema_version(request_settings)
  prompt_version = analysis_prompt_version_from_settings(request_settings, schema_version)
  media_hash = video_understanding_media_hash(job, model_input_object_key)
  input_snapshot = video_understanding_input_snapshot(
    input_role=input_role,
    input_object_key=input_object_key,
    model_input_role=model_input_role,
    model_input_object_key=model_input_object_key,
    input_strategy=input_strategy,
    request_settings=request_settings,
  )
  input_snapshot_hash = video_understanding_input_snapshot_hash(input_snapshot)
  cache_key = video_understanding_cache_key(
    asset_id=asset_id,
    media_hash=media_hash,
    model_name=model_name,
    prompt_version=prompt_version,
    schema_version=schema_version,
    input_snapshot_hash=input_snapshot_hash,
  )
  result_id = str(uuid.uuid5(uuid.NAMESPACE_URL, cache_key))
  result_json = json_safe({
    "analysis": result.analysis,
    "outputText": result.text,
    "usage": result.usage,
    "responseId": result.response_id,
    "inputSnapshot": input_snapshot,
  })
  confidence = _optional_float(result.analysis.get("confidence") if isinstance(result.analysis, dict) else None)

  cur.execute(
    """
    INSERT INTO ads.marketing_content_asset_video_understanding_jobs (
      job_id,
      asset_id,
      object_id,
      media_hash,
      storage_key,
      model_name,
      prompt_version,
      analysis_schema_version,
      input_snapshot_hash,
      cache_key,
      status, started_at, finished_at, updated_at
    ) VALUES (
      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'succeeded',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (
      asset_id,
      media_hash,
      model_name,
      prompt_version,
      analysis_schema_version
    ) DO UPDATE SET
      job_id = EXCLUDED.job_id,
      object_id = EXCLUDED.object_id,
      storage_key = EXCLUDED.storage_key,
      input_snapshot_hash = EXCLUDED.input_snapshot_hash,
      cache_key = EXCLUDED.cache_key,
      status = 'succeeded',
      error_message = NULL,
      finished_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    """,
    (
      job_id,
      asset_id,
      analysis_object_id,
      media_hash,
      model_input_object_key,
      model_name,
      prompt_version,
      schema_version,
      input_snapshot_hash,
      cache_key,
    ),
  )
  cur.execute(
    """
    INSERT INTO ads.marketing_content_asset_video_understanding_results (
      result_id,
      asset_id,
      object_id,
      media_hash,
      model_name,
      prompt_version,
      analysis_schema_version,
      input_snapshot_hash,
      cache_key,
      result_json,
      confidence,
      updated_at
    ) VALUES (
      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, CURRENT_TIMESTAMP
    )
    ON CONFLICT (
      asset_id,
      media_hash,
      model_name,
      prompt_version,
      analysis_schema_version,
      input_snapshot_hash
    ) DO UPDATE SET
      object_id = EXCLUDED.object_id,
      cache_key = EXCLUDED.cache_key,
      result_json = EXCLUDED.result_json,
      confidence = EXCLUDED.confidence,
      updated_at = CURRENT_TIMESTAMP
    """,
    (
      result_id,
      asset_id,
      analysis_object_id,
      media_hash,
      model_name,
      prompt_version,
      schema_version,
      input_snapshot_hash,
      cache_key,
      json.dumps(result_json, ensure_ascii=False),
      confidence,
    ),
  )
  return True


def persist_video_understanding_failure(
  cur: psycopg2.extensions.cursor,
  *,
  job: dict[str, Any],
  model_name: str,
  analysis_schema_version: str,
  prompt_version: str,
  status: str,
  error_message: str,
) -> bool:
  cur.execute(
    """
    SELECT
      to_regclass('ads.marketing_content_asset_video_understanding_jobs') IS NOT NULL AS jobs_exists
    """
  )
  if not _cursor_bool(cur.fetchone(), "jobs_exists"):
    return False

  if status not in {"pending", "failed", "skipped"}:
    raise ValueError(f"unsupported video understanding failure status: {status}")

  asset_id = str(job["asset_id"])
  job_id = str(job["job_id"])
  request_settings = {
    "analysis_schema_version": analysis_schema_version,
    "prompt_version": prompt_version,
  }
  schema_version = (
    str(analysis_schema_version or "").strip()
    or DEFAULT_CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION
  )
  normalized_prompt_version = analysis_prompt_version_from_settings(request_settings, schema_version)
  storage_key = _failure_storage_key(job)
  media_hash = video_understanding_media_hash(job, storage_key)
  cache_key = video_understanding_cache_key(
    asset_id=asset_id,
    media_hash=media_hash,
    model_name=model_name,
    prompt_version=normalized_prompt_version,
    schema_version=schema_version,
  )
  terminal_status = status in {"failed", "skipped"}
  cur.execute(
    """
    INSERT INTO ads.marketing_content_asset_video_understanding_jobs (
      job_id,
      asset_id,
      object_id,
      media_hash,
      storage_key,
      model_name,
      prompt_version,
      analysis_schema_version,
      cache_key,
      status,
      error_message,
      started_at,
      finished_at,
      updated_at
    ) VALUES (
      %s, %s, NULL, %s, %s, %s, %s, %s, %s, %s, %s,
      CURRENT_TIMESTAMP,
      CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE NULL END,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (
      asset_id,
      media_hash,
      model_name,
      prompt_version,
      analysis_schema_version
    ) DO UPDATE SET
      job_id = EXCLUDED.job_id,
      storage_key = EXCLUDED.storage_key,
      cache_key = EXCLUDED.cache_key,
      status = EXCLUDED.status,
      error_message = EXCLUDED.error_message,
      finished_at = EXCLUDED.finished_at,
      updated_at = CURRENT_TIMESTAMP
    """,
    (
      job_id,
      asset_id,
      media_hash,
      storage_key,
      model_name,
      normalized_prompt_version,
      schema_version,
      cache_key,
      status,
      error_message[:1000],
      terminal_status,
    ),
  )
  return True


def _failure_storage_key(job: Mapping[str, Any]) -> str:
  for key in ("input_object_key", "raw_object_key", "preview_object_key"):
    value = str(job.get(key) or "").strip()
    if value:
      return value
  return ""


def _cursor_bool(row: Any, key: str, index: int = 0) -> bool:
  if isinstance(row, Mapping):
    return bool(row.get(key))
  if isinstance(row, (tuple, list)) and len(row) > index:
    return bool(row[index])
  return False


def _optional_float(value: Any) -> float | None:
  if value is None:
    return None
  try:
    return float(value)
  except (TypeError, ValueError):
    return None
