from __future__ import annotations

import hashlib
import json
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Mapping, Optional

import psycopg2
import psycopg2.extras

from .ark_responses import (
  ArkAnalysisResult,
  ArkResponsesClient,
  ArkResponsesConfig,
  normalize_content_asset_analysis_contract,
  normalized_score,
  normalized_suggested_tags,
  normalized_suggested_title,
  normalized_summary,
  DEFAULT_ARK_CONTENT_ANALYSIS_MODEL,
  DEFAULT_CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION,
  DEFAULT_CONTENT_ASSET_FUSION_ANALYSIS_PROMPT_VERSION,
  DEFAULT_CONTENT_ASSET_VIDEO_UNDERSTANDING_PROMPT_VERSION,
)
from .analysis_runtime_policy import (
  AnalysisSource,
  analysis_model_stage_label,
  analysis_profile_from_job,
  analysis_source_from_job,
  default_analysis_profile,
  normalize_analysis_profile,
  normalize_analysis_source,
  resolve_analysis_input,
)
from .performance_diagnostics import build_performance_diagnosis
from .repository import connect_pg
from .tos_storage import TosStorageClient, TosStorageConfig, build_object_key
from .video_understanding_cache import (
  analysis_prompt_version_from_settings as _analysis_prompt_version_from_settings,
  analysis_schema_version as _analysis_schema_version,
  load_cached_video_understanding_result as _load_cached_video_understanding_result,
  persist_video_understanding_cache as _persist_video_understanding_cache,
  persist_video_understanding_failure as _persist_video_understanding_failure,
  video_understanding_cache_key as _video_understanding_cache_key,
  video_understanding_input_snapshot as _video_understanding_input_snapshot,
  video_understanding_input_snapshot_hash as _video_understanding_input_snapshot_hash,
  video_understanding_media_hash as _video_understanding_media_hash,
)
from .worker_runtime import classify_processing_error as _classify_processing_error
from .worker_runtime import env_int as _env_int
from .worker_runtime import json_safe as _json_safe
from .worker_runtime import load_env_file
from .worker_runtime import update_processing_job_stage as _update_processing_job_stage
from .worker_video_input import prepare_video_model_input


LOW_QUALITY_METADATA_LABELS = (
  "纯种草",
  "种草",
  "机制",
  "半机制",
  "混剪",
  "纯机制",
  "投流视频",
  "广告素材",
  "素材",
  "视频",
)
PRODUCT_CARD_ACCEPTANCE_SOURCE = "ods.douyin_trade_sale_card_detail_raw"
PRODUCT_CARD_ACCEPTANCE_ADS_SOURCE = "ads.douyin_trade_sale_card_detail"
PRODUCT_CARD_ACCEPTANCE_BRIDGE_SOURCE = "ads.douyin_shortvideo_detail"
PRODUCT_CARD_ACCEPTANCE_SOURCE_GRAIN = "shop_id + stat_date + product_id + source_level1"
PRODUCT_CARD_ACCEPTANCE_REQUIRED_BRIDGE = "trusted material_id -> product_id"
PRODUCT_CARD_ACCEPTANCE_ALLOWED_BRIDGE_STATUSES = (
  "matched",
  "matched_title_date",
  "matched_title_date_amount_order",
)
VIDEO_UNDERSTANDING_CACHE_HYDRATION_OPERATION = "hydrate_video_understanding_cache"


def enqueue_analysis_jobs(
  limit: int = 0,
  force: bool = False,
  dry_run: bool = False,
  source: AnalysisSource = "preview",
  profile: str = "",
  asset_id: str = "",
) -> Dict[str, Any]:
  source = normalize_analysis_source(source)
  profile = normalize_analysis_profile(profile) if profile else ""
  asset_id = (asset_id or "").strip()
  with connect_pg() as conn:
    candidates = _query_analysis_candidates(conn, limit=limit, force=force, source=source, asset_id=asset_id)
    if dry_run:
      return {
        "candidateCount": len(candidates),
        "enqueued": 0,
        "dryRun": True,
        "source": source,
        "profile": profile or None,
        "assetId": asset_id or None,
        "sampleAssetIds": [str(row["asset_id"]) for row in candidates[:10]],
      }
    enqueued = _insert_analysis_jobs(conn, candidates, source=source, profile=profile, force=force)
  return {
    "candidateCount": len(candidates),
    "enqueued": enqueued,
    "dryRun": False,
    "source": source,
    "profile": profile or None,
    "assetId": asset_id or None,
  }


def process_content_asset_analysis_jobs(limit: int = 10, temp_root: Optional[Path] = None) -> Dict[str, int]:
  stats = {
    "claimed": 0,
    "succeeded": 0,
    "failed": 0,
    "empty": 0,
  }
  storage = TosStorageClient(TosStorageConfig.from_env())
  client: ArkResponsesClient | None = None
  signed_url_ttl = _env_int("CONTENT_ASSET_AI_SIGNED_URL_TTL_SECONDS", 1800)
  url_max_bytes = _env_int("CONTENT_ASSET_AI_URL_MAX_BYTES", 50_000_000)
  proxy_target_bytes = _env_int("CONTENT_ASSET_AI_PROXY_TARGET_BYTES", 45_000_000)

  with tempfile.TemporaryDirectory(prefix="content-assets-analysis-", dir=str(temp_root) if temp_root else None) as tmp_dir:
    work_root = Path(tmp_dir)
    for _ in range(max(1, limit)):
      with connect_pg() as conn:
        job = _claim_next_analysis_job(conn)
      if job is None:
        stats["empty"] += 1
        break
      stats["claimed"] += 1
      try:
        if not _is_video_understanding_cache_hydration_job(job) and client is None:
          client = ArkResponsesClient(ArkResponsesConfig.from_env())
        _process_analysis_job(
          storage=storage,
          client=client,
          job=job,
          work_dir=work_root / str(job["asset_id"]),
          signed_url_ttl=signed_url_ttl,
          url_max_bytes=url_max_bytes,
          proxy_target_bytes=proxy_target_bytes,
        )
      except Exception as error:  # noqa: BLE001 - worker 必须把真实失败写回队列表
        with connect_pg() as conn:
          _fail_analysis_job(
            conn,
            job,
            str(error),
            model_name=client.config.model if client else DEFAULT_ARK_CONTENT_ANALYSIS_MODEL,
            analysis_schema_version=(
              client.config.analysis_schema_version
              if client
              else DEFAULT_CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION
            ),
            prompt_version=(
              client.config.fusion_analysis_prompt_version
              if client
              else DEFAULT_CONTENT_ASSET_FUSION_ANALYSIS_PROMPT_VERSION
            ),
          )
        stats["failed"] += 1
      else:
        stats["succeeded"] += 1
  return stats


def _query_analysis_candidates(
  conn: psycopg2.extensions.connection,
  *,
  limit: int,
  force: bool,
  source: AnalysisSource,
  asset_id: str = "",
) -> list[dict[str, Any]]:
  limit_clause = f"LIMIT {max(1, int(limit))}" if limit and limit > 0 else ""
  asset_filter = "AND asset.asset_id = %(asset_id)s::uuid" if asset_id else ""
  if force:
    analysis_filter = ""
  elif source == "auto":
    analysis_filter = f"""
        AND (
          asset.ai_summary IS NULL
          OR asset.analysis_object_key IS NULL
          OR {_missing_ai_metadata_sql()}
        )
    """
  else:
    analysis_filter = f"""
        AND (
          asset.analysis_object_key IS NULL
          OR asset.ai_analysis_source IS DISTINCT FROM %(source)s
          OR {_missing_ai_metadata_sql()}
        )
    """
  availability_filter = {
    "preview": "AND asset.preview_object_key IS NOT NULL",
    "raw": "AND asset.raw_object_key IS NOT NULL",
    "auto": "AND asset.raw_object_key IS NOT NULL",
  }[source]
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      f"""
      SELECT
        asset.asset_id,
        asset.raw_object_key,
        asset.preview_object_key
      FROM ads.marketing_content_assets asset
      WHERE asset.is_deleted = FALSE
        AND asset.external_only = FALSE
        {asset_filter}
        {availability_filter}
        {analysis_filter}
        AND NOT EXISTS (
          SELECT 1
          FROM ads.marketing_content_asset_processing_jobs job
          WHERE job.asset_id = asset.asset_id
            AND job.job_type = 'analysis'
            AND job.status IN ('queued', 'running')
        )
      ORDER BY
        CASE WHEN asset.preview_object_key IS NOT NULL THEN 0 ELSE 1 END,
        asset.updated_at DESC
      {limit_clause}
      """,
      {"source": source, "asset_id": asset_id},
    )
    return list(cur.fetchall())


def _missing_ai_metadata_sql() -> str:
  low_quality_labels = _low_quality_metadata_labels_sql()
  return f"""
          NULLIF(asset.ai_suggested_title, '') IS NULL
          OR COALESCE(CARDINALITY(asset.ai_suggested_tags), 0) = 0
          OR asset.title_source IN ('unknown', 'token_fallback', 'row_fallback')
          OR asset.tags_source IN ('empty', 'unknown')
          OR (
            asset.title_source NOT IN ('manual', 'upload', 'file_name')
            AND asset.title IN ({low_quality_labels})
          )
          OR (
            asset.tags_source IN ('empty', 'unknown', 'feishu_row', 'ai_generated')
            AND COALESCE(CARDINALITY(asset.tags), 0) > 0
            AND asset.tags <@ ARRAY[{low_quality_labels}]::text[]
          )
  """.strip()


def _insert_analysis_jobs(
  conn: psycopg2.extensions.connection,
  candidates: list[dict[str, Any]],
  *,
  source: AnalysisSource,
  profile: str,
  force: bool,
) -> int:
  count = 0
  with conn.cursor() as cur:
    for row in candidates:
      input_key, input_role = resolve_analysis_input(row, source)
      cur.execute(
        """
        INSERT INTO ads.marketing_content_asset_processing_jobs (
          job_id,
          asset_id,
          job_type,
          status,
          input_object_key,
          metadata
        ) VALUES (%s, %s, 'analysis', 'queued', %s, %s::jsonb)
        """,
        (
          str(uuid.uuid4()),
          str(row["asset_id"]),
          input_key,
          json.dumps({
            "created_by": "analysis_enqueue",
            "analysis_source": source,
            "input_role": input_role,
            "analysis_profile": profile or default_analysis_profile(input_role),
            "force": force,
          }, ensure_ascii=False),
        ),
      )
      count += 1
  conn.commit()
  return count


def _claim_next_analysis_job(conn: psycopg2.extensions.connection) -> Optional[dict[str, Any]]:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      WITH next_job AS (
        SELECT job.job_id
        FROM ads.marketing_content_asset_processing_jobs job
        JOIN ads.marketing_content_assets asset ON asset.asset_id = job.asset_id
        WHERE job.status = 'queued'
          AND job.attempts < job.max_attempts
          AND job.job_type = 'analysis'
          AND asset.is_deleted = FALSE
          AND asset.external_only = FALSE
          AND (
            asset.raw_object_key IS NOT NULL
            OR job.metadata->>'operation' = 'hydrate_video_understanding_cache'
          )
        ORDER BY job.queued_at ASC, job.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      ),
      claimed AS (
        UPDATE ads.marketing_content_asset_processing_jobs job
        SET status = 'running',
            attempts = attempts + 1,
            started_at = CURRENT_TIMESTAMP,
            finished_at = NULL,
            error_message = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'processing_stage', 'claimed',
              'processing_stage_label', 'worker 已领取',
              'processing_progress_percent', 12,
              'processing_stage_updated_at', CURRENT_TIMESTAMP::TEXT
            )
        FROM next_job
        WHERE job.job_id = next_job.job_id
        RETURNING
          job.job_id,
          job.asset_id,
          job.input_object_key,
          job.metadata,
          job.attempts,
          job.max_attempts
      )
      SELECT
        claimed.*,
        asset.title,
        asset.title_source,
        asset.bucket,
        asset.raw_object_key,
        asset.preview_object_key,
        asset.analysis_object_key,
        asset.ai_analysis_model,
        asset.raw_sha256,
        asset.file_ext,
        asset.mime_type,
        asset.duration_seconds,
        asset.width,
        asset.height,
        asset.file_size_bytes,
        asset.preview_size_bytes,
        (
          SELECT object_key
          FROM ads.marketing_content_asset_objects object
          WHERE object.asset_id = asset.asset_id
            AND object.object_role = 'analysis_proxy'
            AND object.status = 'active'
          ORDER BY object.created_at DESC
          LIMIT 1
        ) AS analysis_proxy_object_key,
        (
          SELECT jsonb_build_object(
            'scriptText', LEFT(transcript.script_text, 6000),
            'transcriptText', LEFT(transcript.transcript_text, 6000),
            'srtText', LEFT(transcript.srt_text, 6000),
            'segments', transcript.segments
          )
          FROM ads.marketing_content_asset_transcripts transcript
          WHERE transcript.asset_id = asset.asset_id
            AND transcript.status = 'active'
          ORDER BY transcript.created_at DESC
          LIMIT 1
        ) AS transcript_context,
        asset.platform,
        asset.product_name,
        asset.creator_name,
        asset.owner_name,
        asset.tags,
        asset.tags_source,
        asset.notes,
        asset.lifecycle_status,
        (
          SELECT object.object_id::text
          FROM ads.marketing_content_asset_objects object
          WHERE object.asset_id = asset.asset_id
            AND object.object_role = 'analysis'
            AND object.object_key = asset.analysis_object_key
            AND object.status = 'active'
          ORDER BY object.updated_at DESC, object.created_at DESC
          LIMIT 1
        ) AS analysis_object_id
      FROM claimed
      JOIN ads.marketing_content_assets asset ON asset.asset_id = claimed.asset_id
      """
    )
    row = cur.fetchone()
  conn.commit()
  return dict(row) if row else None


def _process_analysis_job(
  *,
  storage: TosStorageClient,
  client: ArkResponsesClient | None,
  job: dict[str, Any],
  work_dir: Path,
  signed_url_ttl: int,
  url_max_bytes: int,
  proxy_target_bytes: int,
) -> None:
  if _is_video_understanding_cache_hydration_job(job):
    _process_video_understanding_cache_hydration_job(
      storage=storage,
      job=job,
      work_dir=work_dir,
    )
    return

  if client is None:
    raise RuntimeError("普通 AI 分析任务缺少 Ark client")

  analysis_source = analysis_source_from_job(job)
  input_object_key, input_role = resolve_analysis_input(job, analysis_source)
  analysis_profile = analysis_profile_from_job(job, input_role)
  update_stage = _stage_updater(job)
  update_stage(
    "preparing_input",
    "准备分析输入",
    14,
    {"analysisProfile": analysis_profile, "inputRole": input_role},
  )
  video_input = prepare_video_model_input(
    storage=storage,
    job=job,
    work_dir=work_dir,
    input_role=input_role,
    input_object_key=input_object_key,
    signed_url_ttl=signed_url_ttl,
    url_max_bytes=url_max_bytes,
    proxy_target_bytes=proxy_target_bytes,
    proxy_created_by="content-assets-analysis-worker",
    on_stage=update_stage,
  )
  request_settings = _analysis_request_settings(client.config, analysis_profile)
  cached_result = None
  with connect_pg() as conn:
    cached_result = _load_cached_video_understanding_result(
      conn,
      job=job,
      model_name=client.config.model,
      request_settings=request_settings,
      input_role=input_role,
      input_object_key=input_object_key,
      model_input_role=str(video_input["model_input_role"]),
      model_input_object_key=str(video_input["model_input_object_key"]),
      input_strategy=str(video_input["strategy"]),
    )

  if cached_result is not None:
    result = cached_result
    update_stage(
      "model_cache_hit",
      "命中视频理解缓存",
      70,
      {
        "analysisProfile": analysis_profile,
        "model": client.config.model,
        "responseId": result.response_id,
        "cacheHit": True,
      },
    )
  else:
    update_stage(
      "calling_model",
      analysis_model_stage_label(analysis_profile),
      52,
      {
        "analysisProfile": analysis_profile,
        "model": client.config.model,
        "modelInputRole": video_input["model_input_role"],
      },
    )
    result = client.analyze_video(
      video_input["video_url"],
      asset_context=_asset_context(
        job,
        input_role=input_role,
        input_object_key=input_object_key,
        model_input_role=str(video_input["model_input_role"]),
        model_input_object_key=str(video_input["model_input_object_key"]),
        analysis_profile=analysis_profile,
      ),
      analysis_profile=analysis_profile,
    )

  update_stage(
    "parsing_result",
    "解析缓存分析结果" if cached_result is not None else "解析分析结果",
    78,
    {
      "analysisProfile": analysis_profile,
      "responseId": result.response_id,
      "cacheHit": cached_result is not None,
    },
  )
  summary = normalized_summary(result.analysis)
  score = normalized_score(result.analysis)
  suggested_title = normalized_suggested_title(result.analysis)
  suggested_tags = normalized_suggested_tags(result.analysis)
  if not summary:
    raise RuntimeError("Ark 分析结果缺少 summary")

  analysis_doc = {
    "provider": "ark",
    "model": client.config.model,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "assetId": str(job["asset_id"]),
    "input": {
      "objectRole": input_role,
      "objectKey": input_object_key,
      "modelInputRole": video_input["model_input_role"],
      "modelInputObjectKey": video_input["model_input_object_key"],
      "strategy": video_input["strategy"],
      "sourceSizeBytes": video_input["source_size_bytes"],
      "urlMaxBytes": url_max_bytes,
    },
    "requestSettings": result.request_settings,
    "analysis": result.analysis,
    "outputText": result.text,
    "usage": result.usage,
    "responseId": result.response_id,
  }
  analysis_bytes = json.dumps(analysis_doc, ensure_ascii=False, indent=2).encode("utf-8")
  analysis_sha256 = hashlib.sha256(analysis_bytes).hexdigest()
  analysis_key = build_object_key("analysis", str(job["asset_id"]), analysis_sha256, ".json")
  work_dir.mkdir(parents=True, exist_ok=True)
  analysis_path = work_dir / "analysis.json"
  analysis_path.write_bytes(analysis_bytes)
  update_stage("uploading_result", "上传分析结果", 88, {"analysisSizeBytes": len(analysis_bytes)})
  storage.upload_file(analysis_key, analysis_path, "application/json")

  update_stage("writing_result", "写回分析结果", 95, {"analysisObjectKey": analysis_key})
  with connect_pg() as conn:
    _complete_analysis_job(
      conn,
      job=job,
      analysis_key=analysis_key,
      analysis_size_bytes=len(analysis_bytes),
      analysis_sha256=analysis_sha256,
      summary=summary,
      score=score,
      suggested_title=suggested_title,
      suggested_tags=suggested_tags,
      result=result,
      model_name=client.config.model,
      request_settings=result.request_settings,
      input_role=input_role,
      input_object_key=input_object_key,
      model_input_role=str(video_input["model_input_role"]),
      model_input_object_key=str(video_input["model_input_object_key"]),
      input_strategy=str(video_input["strategy"]),
    )


def _is_video_understanding_cache_hydration_job(job: Mapping[str, Any]) -> bool:
  metadata = _mapping_value(job.get("metadata"))
  return str(metadata.get("operation") or "").strip() == VIDEO_UNDERSTANDING_CACHE_HYDRATION_OPERATION


def _process_video_understanding_cache_hydration_job(
  *,
  storage: TosStorageClient,
  job: dict[str, Any],
  work_dir: Path,
) -> None:
  metadata = _mapping_value(job.get("metadata"))
  artifact_object_key = str(
    metadata.get("analysis_artifact_object_key")
    or job.get("analysis_object_key")
    or job.get("input_object_key")
    or ""
  ).strip()
  if not artifact_object_key:
    raise RuntimeError("结构化视频理解回填缺少 analysis artifact object key")

  update_stage = _stage_updater(job)
  update_stage(
    "downloading_analysis_artifact",
    "下载已有 AI 分析结果",
    35,
    {"modelCallExpected": False},
  )
  work_dir.mkdir(parents=True, exist_ok=True)
  artifact_path = work_dir / "analysis-artifact.json"
  storage.download_file(artifact_object_key, artifact_path)
  try:
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
  except (OSError, UnicodeError, json.JSONDecodeError) as error:
    raise RuntimeError(f"已有 AI 分析结果文件不是合法 JSON: {error}") from error
  if not isinstance(artifact, Mapping):
    raise RuntimeError("已有 AI 分析结果文件缺少 JSON object")

  raw_analysis = artifact.get("analysis")
  if not isinstance(raw_analysis, dict):
    raise RuntimeError("已有 AI 分析结果文件缺少 analysis object")
  analysis = normalize_content_asset_analysis_contract(raw_analysis)
  video_understanding = analysis.get("video_understanding")
  if not isinstance(video_understanding, dict) or not video_understanding:
    raise RuntimeError("已有 AI 分析结果缺少结构化 video_understanding")

  artifact_request_settings = artifact.get("requestSettings")
  if isinstance(artifact_request_settings, Mapping):
    request_settings = dict(artifact_request_settings)
  else:
    request_settings = {}
  schema_version = str(
    request_settings.get("analysis_schema_version")
    or analysis.get("analysis_schema_version")
    or DEFAULT_CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION
  )
  fusion_prompt_version = str(
    request_settings.get("fusion_analysis_prompt_version")
    or DEFAULT_CONTENT_ASSET_FUSION_ANALYSIS_PROMPT_VERSION
  )
  request_settings.setdefault(
    "analysis_schema_version",
    schema_version,
  )
  request_settings.setdefault("analysis_profile", "preview_fast")
  request_settings.setdefault(
    "video_understanding_prompt_version",
    DEFAULT_CONTENT_ASSET_VIDEO_UNDERSTANDING_PROMPT_VERSION,
  )
  request_settings.setdefault("fusion_analysis_prompt_version", fusion_prompt_version)
  request_settings.setdefault(
    "prompt_version",
    f"content_asset_analysis:{fusion_prompt_version}:schema:{schema_version}",
  )

  usage = artifact.get("usage")
  result = ArkAnalysisResult(
    text=str(artifact.get("outputText") or json.dumps(analysis, ensure_ascii=False)),
    analysis=analysis,
    raw_response={
      "id": str(artifact.get("responseId") or ""),
      "usage": dict(usage) if isinstance(usage, Mapping) else {},
      "hydrated_from_artifact": True,
    },
    request_settings=request_settings,
  )
  artifact_input = _mapping_value(artifact.get("input"))
  input_object_key = str(
    artifact_input.get("objectKey")
    or artifact_input.get("object_key")
    or job.get("preview_object_key")
    or job.get("raw_object_key")
    or artifact_object_key
  )
  model_input_object_key = str(
    artifact_input.get("modelInputObjectKey")
    or artifact_input.get("model_input_object_key")
    or input_object_key
  )
  model_name = str(
    artifact.get("model")
    or job.get("ai_analysis_model")
    or DEFAULT_ARK_CONTENT_ANALYSIS_MODEL
  ).strip()

  update_stage(
    "writing_structured_cache",
    "写回结构化视频理解",
    82,
    {"modelCallPerformed": False},
  )
  with connect_pg() as conn:
    _complete_analysis_cache_hydration_job(
      conn,
      job=job,
      result=result,
      model_name=model_name,
      request_settings=request_settings,
      analysis_artifact_object_key=artifact_object_key,
      input_role=str(
        artifact_input.get("objectRole")
        or artifact_input.get("object_role")
        or "preview"
      ),
      input_object_key=input_object_key,
      model_input_role=str(
        artifact_input.get("modelInputRole")
        or artifact_input.get("model_input_role")
        or artifact_input.get("objectRole")
        or "preview"
      ),
      model_input_object_key=model_input_object_key,
      input_strategy=str(artifact_input.get("strategy") or "artifact_hydration"),
    )


def _complete_analysis_cache_hydration_job(
  conn: psycopg2.extensions.connection,
  *,
  job: dict[str, Any],
  result: ArkAnalysisResult,
  model_name: str,
  request_settings: dict[str, Any],
  analysis_artifact_object_key: str,
  input_role: str,
  input_object_key: str,
  model_input_role: str,
  model_input_object_key: str,
  input_strategy: str,
) -> None:
  metadata = {
    "operation": VIDEO_UNDERSTANDING_CACHE_HYDRATION_OPERATION,
    "model_call_expected": False,
    "model_call_performed": False,
    "video_understanding_cache_persisted": True,
    "video_understanding_storage_ready": True,
    "processing_stage": "completed",
    "processing_stage_label": "结构化视频理解已回填",
    "processing_progress_percent": 100,
    "processing_stage_updated_at": datetime.now(timezone.utc).isoformat(),
  }
  with conn.cursor() as cur:
    persisted = _persist_video_understanding_cache(
      cur,
      job=job,
      analysis_object_id=job.get("analysis_object_id"),
      result=result,
      model_name=model_name,
      request_settings=request_settings,
      input_role=input_role,
      input_object_key=input_object_key,
      model_input_role=model_input_role,
      model_input_object_key=model_input_object_key,
      input_strategy=input_strategy,
    )
    if not persisted:
      raise RuntimeError("结构化视频理解存储未就绪，无法完成 artifact hydration")

    cur.execute(
      """
      UPDATE ads.marketing_content_asset_processing_jobs
      SET status = 'succeeded',
          output_object_key = %s,
          finished_at = CURRENT_TIMESTAMP,
          error_message = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
      WHERE job_id = %s
      """,
      (
        analysis_artifact_object_key,
        json.dumps(metadata, ensure_ascii=False),
        str(job["job_id"]),
      ),
    )
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
      VALUES (%s, 'analysis_cache_hydration_completed', 'content-assets-worker',
              '结构化视频理解回填完成', %s::jsonb)
      """,
      (
        str(job["asset_id"]),
        json.dumps({
          "jobId": str(job["job_id"]),
          "operation": VIDEO_UNDERSTANDING_CACHE_HYDRATION_OPERATION,
          "modelCallPerformed": False,
          "analysisSchemaVersion": _analysis_schema_version(request_settings),
        }, ensure_ascii=False),
      ),
    )
  conn.commit()


def _stage_updater(job: dict[str, Any]) -> Callable[[str, str, int, dict[str, Any] | None], None]:
  def update(stage: str, label: str, progress_percent: int, extra: dict[str, Any] | None = None) -> None:
    with connect_pg() as conn:
      _update_processing_job_stage(conn, job["job_id"], stage, label, progress_percent, extra)

  return update


def _complete_analysis_job(
  conn: psycopg2.extensions.connection,
  *,
  job: dict[str, Any],
  analysis_key: str,
  analysis_size_bytes: int,
  analysis_sha256: str,
  summary: str,
  score: Optional[float],
  suggested_title: str,
  suggested_tags: list[str],
  result: Any,
  model_name: str,
  request_settings: dict[str, Any],
  input_role: str,
  input_object_key: str,
  model_input_role: str,
  model_input_object_key: str,
  input_strategy: str,
) -> None:
  asset_id = str(job["asset_id"])
  job_id = str(job["job_id"])
  object_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"content-asset-object:{asset_id}:analysis:{analysis_key}"))
  diagnosis_metadata = _analysis_diagnosis_metadata(result.analysis)
  if (
    "analysis_schema_version" not in diagnosis_metadata
    and request_settings.get("analysis_schema_version")
  ):
    diagnosis_metadata["analysis_schema_version"] = request_settings.get("analysis_schema_version")
  metadata = {
    "provider": "ark",
    "model": model_name,
    "response_id": result.response_id,
    "usage": result.usage,
    "analysis_profile": request_settings.get("analysis_profile"),
    "request_settings": request_settings,
    "input_role": input_role,
    "input_object_key": input_object_key,
    "model_input_role": model_input_role,
    "model_input_object_key": model_input_object_key,
    "input_strategy": input_strategy,
    "suggested_title": suggested_title,
    "suggested_tags": suggested_tags,
    "processing_stage": "completed",
    "processing_stage_label": "已写回分析结果",
    "processing_progress_percent": 100,
    "processing_stage_updated_at": datetime.now(timezone.utc).isoformat(),
  }
  metadata.update(diagnosis_metadata)
  with conn.cursor() as cur:
    low_quality_labels = _low_quality_metadata_labels_sql()
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_objects (
        object_id,
        asset_id,
        object_role,
        storage_provider,
        bucket,
        object_key,
        content_type,
        file_ext,
        size_bytes,
        sha256,
        status,
        metadata
      ) VALUES (
        %s, %s, 'analysis', 'tos', %s, %s,
        'application/json', '.json', %s, %s, 'active', %s::jsonb
      )
      ON CONFLICT (object_id) DO UPDATE SET
        bucket = EXCLUDED.bucket,
        object_key = EXCLUDED.object_key,
        content_type = EXCLUDED.content_type,
        file_ext = EXCLUDED.file_ext,
        size_bytes = EXCLUDED.size_bytes,
        sha256 = EXCLUDED.sha256,
        status = 'active',
        metadata = EXCLUDED.metadata
      """,
      (
        object_id,
        asset_id,
        job.get("bucket") or "content-video-prod",
        analysis_key,
        analysis_size_bytes,
        analysis_sha256,
        json.dumps(metadata, ensure_ascii=False),
      ),
    )
    video_understanding_cache_persisted = _persist_video_understanding_cache(
      cur,
      job=job,
      analysis_object_id=object_id,
      result=result,
      model_name=model_name,
      request_settings=request_settings,
      input_role=input_role,
      input_object_key=input_object_key,
      model_input_role=model_input_role,
      model_input_object_key=model_input_object_key,
      input_strategy=input_strategy,
    )
    metadata["video_understanding_cache_persisted"] = video_understanding_cache_persisted
    metadata["video_understanding_storage_ready"] = video_understanding_cache_persisted
    cur.execute(
      f"""
      UPDATE ads.marketing_content_assets
      SET ai_summary = %s,
          ai_score = %s,
          analysis_object_key = %s,
          ai_analysis_source = %s,
          ai_analysis_model = %s,
          ai_analyzed_at = CURRENT_TIMESTAMP,
          ai_suggested_title = NULLIF(%s, ''),
          ai_suggested_tags = %s::text[],
          ai_metadata_generated_at = CURRENT_TIMESTAMP,
          title = CASE
            WHEN NULLIF(%s, '') IS NOT NULL
              AND (
                title_source IN ('unknown', 'token_fallback', 'row_fallback', 'ai_generated')
                OR title IN ('未命名素材', '未命名视频')
                OR (title ~ '^[A-Za-z0-9_-]{16,}$' AND title !~ '[[:space:]]')
                OR (
                  title_source NOT IN ('manual', 'upload', 'file_name')
                  AND title IN ({low_quality_labels})
                )
              )
              THEN %s
            ELSE title
          END,
          title_source = CASE
            WHEN NULLIF(%s, '') IS NOT NULL
              AND (
                title_source IN ('unknown', 'token_fallback', 'row_fallback', 'ai_generated')
                OR title IN ('未命名素材', '未命名视频')
                OR (title ~ '^[A-Za-z0-9_-]{16,}$' AND title !~ '[[:space:]]')
                OR (
                  title_source NOT IN ('manual', 'upload', 'file_name')
                  AND title IN ({low_quality_labels})
                )
              )
              THEN 'ai_generated'
            ELSE title_source
          END,
          tags = CASE
            WHEN (CARDINALITY(tags) = 0 OR tags_source = 'ai_generated')
              AND CARDINALITY(%s::text[]) > 0 THEN %s::text[]
            WHEN tags_source IN ('empty', 'unknown', 'feishu_row')
              AND tags <@ ARRAY[{low_quality_labels}]::text[]
              AND CARDINALITY(%s::text[]) > 0 THEN %s::text[]
            ELSE tags
          END,
          tags_source = CASE
            WHEN (CARDINALITY(tags) = 0 OR tags_source = 'ai_generated')
              AND CARDINALITY(%s::text[]) > 0 THEN 'ai_generated'
            WHEN tags_source IN ('empty', 'unknown', 'feishu_row')
              AND tags <@ ARRAY[{low_quality_labels}]::text[]
              AND CARDINALITY(%s::text[]) > 0 THEN 'ai_generated'
            ELSE tags_source
          END,
          lifecycle_status = CASE
            WHEN lifecycle_status = 'waiting_analysis' THEN 'testable'
            ELSE lifecycle_status
          END
      WHERE asset_id = %s
        AND is_deleted = FALSE
      """,
      (
        summary,
        score,
        analysis_key,
        input_role,
        model_name,
        suggested_title,
        suggested_tags,
        suggested_title,
        suggested_title,
        suggested_title,
        suggested_tags,
        suggested_tags,
        suggested_tags,
        suggested_tags,
        suggested_tags,
        suggested_tags,
        asset_id,
      ),
    )
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_processing_jobs
      SET status = 'succeeded',
          output_object_key = %s,
          finished_at = CURRENT_TIMESTAMP,
          error_message = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
      WHERE job_id = %s
      """,
      (
        analysis_key,
        json.dumps(metadata, ensure_ascii=False),
        job_id,
      ),
    )
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
      VALUES (%s, 'analysis_completed', 'content-assets-worker', 'AI 已完成视频素材分析', %s::jsonb)
      """,
      (
        asset_id,
        json.dumps({
          "jobId": job_id,
          "analysisObjectKey": analysis_key,
          "summary": summary,
          "score": score,
          "provider": "ark",
          "inputRole": input_role,
          "modelInputRole": model_input_role,
          "analysisProfile": request_settings.get("analysis_profile"),
        }, ensure_ascii=False),
      ),
    )
  conn.commit()


def _analysis_diagnosis_metadata(analysis: Any) -> dict[str, Any]:
  if not isinstance(analysis, Mapping):
    return {}

  fusion = _mapping_value(_read_first(analysis, "fusion_diagnosis", "fusionDiagnosis"))
  performance = _mapping_value(_read_first(analysis, "performance_diagnosis", "performanceDiagnosis"))
  content = _mapping_value(_read_first(analysis, "content_diagnosis", "contentDiagnosis"))
  scores = _mapping_value(_read_first(analysis, "scores"))
  live_attribution = (
    _mapping_value(_read_first(analysis, "live_acceptance_attribution", "liveAcceptanceAttribution"))
    or _mapping_value(_read_first(fusion, "live_acceptance_attribution", "liveAcceptanceAttribution"))
    or _mapping_value(_read_first(performance, "live_acceptance_attribution", "liveAcceptanceAttribution"))
  )

  metadata: dict[str, Any] = {}
  _put_non_empty(metadata, "analysis_schema_version", _read_first(analysis, "analysis_schema_version", "analysisSchemaVersion"))
  _put_non_empty(metadata, "diagnosis_mode", _read_first(analysis, "diagnosis_mode", "diagnosisMode"))
  _put_non_empty(metadata, "delivery_mode", _read_first(analysis, "delivery_mode", "deliveryMode"))
  _put_non_empty(metadata, "objective", _read_first(analysis, "objective"))
  _put_non_empty(metadata, "primary_problem_stage", _read_first(fusion, "primary_problem_stage", "primaryProblemStage"))
  _put_non_empty(metadata, "final_root_cause_owner", _read_first(fusion, "final_root_cause_owner", "finalRootCauseOwner"))
  contract_validation = _mapping_value(
    _read_first(analysis, "fusion_contract_validation", "fusionContractValidation")
  )
  _put_non_empty(metadata, "fusion_contract_status", _read_first(contract_validation, "status"))
  _put_non_empty(metadata, "fusion_contract_error_count", _list_length(_read_first(contract_validation, "errors")))
  _put_non_empty(metadata, "fusion_contract_warning_count", _list_length(_read_first(contract_validation, "warnings")))

  fusion_confidence = _optional_float_value(
    _read_first(fusion, "confidence", "fusion_confidence", "fusionConfidence")
    if fusion
    else _read_first(scores, "confidence")
  )
  if fusion_confidence is None:
    fusion_confidence = _optional_float_value(_read_first(scores, "confidence"))
  if fusion_confidence is None:
    fusion_confidence = _optional_float_value(_read_first(analysis, "confidence"))
  if fusion_confidence is not None:
    metadata["fusion_confidence"] = fusion_confidence

  diagnosis_mode = str(metadata.get("diagnosis_mode") or "").strip()
  metadata["has_video_understanding"] = bool(
    content
    or _has_non_empty_list(_read_first(analysis, "timeline"))
    or _read_first(analysis, "first_3s_assessment", "first3sAssessment")
    or _read_first(analysis, "platform_fit", "platformFit")
  )
  metadata["has_performance_snapshot"] = bool(
    performance
    or diagnosis_mode in ("data_content_fusion", "data_only")
  )
  metadata["has_live_acceptance"] = _has_live_acceptance(live_attribution, analysis, performance)
  return metadata


def _mapping_value(value: Any) -> Mapping[str, Any]:
  return value if isinstance(value, Mapping) else {}


def _read_first(source: Mapping[str, Any], *keys: str) -> Any:
  for key in keys:
    if key in source:
      return source.get(key)
  return None


def _put_non_empty(target: dict[str, Any], key: str, value: Any) -> None:
  if isinstance(value, str):
    stripped = value.strip()
    if stripped:
      target[key] = stripped
    return
  if value is not None:
    target[key] = value


def _has_non_empty_list(value: Any) -> bool:
  return isinstance(value, list) and len(value) > 0


def _list_length(value: Any) -> Optional[int]:
  return len(value) if isinstance(value, list) else None


def _has_live_acceptance(
  live_attribution: Mapping[str, Any],
  analysis: Mapping[str, Any],
  performance: Mapping[str, Any],
) -> bool:
  status = str(
    _read_first(analysis, "live_acceptance_status", "liveAcceptanceStatus")
    or _read_first(performance, "live_acceptance_status", "liveAcceptanceStatus")
    or ""
  ).strip().lower()
  if status and status not in ("missing", "missing_live_acceptance", "insufficient", "unknown", "none"):
    return True

  confidence = str(_read_first(live_attribution, "confidence") or "").strip().lower()
  level = str(_read_first(live_attribution, "level", "attribution_level", "attributionLevel") or "").strip()
  if level and confidence not in ("", "low", "missing", "insufficient", "unknown", "none"):
    return True
  return False


def _analysis_request_settings(config: ArkResponsesConfig, analysis_profile: str) -> dict[str, Any]:
  profile = config.analysis_profile(analysis_profile)
  prompt_version = f"content_asset_analysis:{config.fusion_analysis_prompt_version}:schema:{config.analysis_schema_version}"
  return {
    **profile.request_settings(),
    "model": config.model,
    "analysis_schema_version": config.analysis_schema_version,
    "video_understanding_prompt_version": config.video_understanding_prompt_version,
    "fusion_analysis_prompt_version": config.fusion_analysis_prompt_version,
    "prompt_version": prompt_version,
  }


def _optional_float_value(value: Any) -> Optional[float]:
  if value is None:
    return None
  try:
    return float(value)
  except (TypeError, ValueError):
    return None


def _fail_analysis_job(
  conn: psycopg2.extensions.connection,
  job: dict[str, Any],
  error_message: str,
  *,
  model_name: str = DEFAULT_ARK_CONTENT_ANALYSIS_MODEL,
  analysis_schema_version: str = DEFAULT_CONTENT_ASSET_ANALYSIS_SCHEMA_VERSION,
  prompt_version: str = DEFAULT_CONTENT_ASSET_FUSION_ANALYSIS_PROMPT_VERSION,
) -> None:
  error_message = error_message[:1000]
  non_retryable = _is_non_retryable_analysis_error(error_message)
  attempts = _int_job_value(job, "attempts", 0)
  max_attempts = _int_job_value(job, "max_attempts", 1)
  will_fail = non_retryable or attempts >= max_attempts
  error_info = _classify_processing_error(error_message)
  video_understanding_status = _video_understanding_failure_status(
    error_message,
    error_info["category"],
    will_fail,
  )
  failure_metadata = {
    "processing_stage": "failed" if will_fail else "retry_queued",
    "processing_stage_label": error_info["label"] if will_fail else f"{error_info['label']}，等待重试",
    "processing_progress_percent": 0 if will_fail else 5,
    "processing_stage_updated_at": datetime.now(timezone.utc).isoformat(),
    "processing_error_category": error_info["category"],
    "processing_error_label": error_info["label"],
    "processing_error_helper": error_info["helper"],
    "video_understanding_job_status": video_understanding_status,
  }
  with conn.cursor() as cur:
    try:
      cur.execute("SAVEPOINT video_understanding_failure_lifecycle")
      failure_metadata["video_understanding_job_recorded"] = _persist_video_understanding_failure(
        cur,
        job=job,
        model_name=model_name,
        analysis_schema_version=analysis_schema_version,
        prompt_version=prompt_version,
        status=video_understanding_status,
        error_message=error_message,
      )
      cur.execute("RELEASE SAVEPOINT video_understanding_failure_lifecycle")
    except Exception as video_error:  # noqa: BLE001 - 不让补充生命周期行遮蔽主失败写回
      cur.execute("ROLLBACK TO SAVEPOINT video_understanding_failure_lifecycle")
      cur.execute("RELEASE SAVEPOINT video_understanding_failure_lifecycle")
      failure_metadata["video_understanding_job_recorded"] = False
      failure_metadata["video_understanding_job_record_error"] = str(video_error)[:500]
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_processing_jobs
      SET status = CASE
            WHEN %s THEN 'failed'
            WHEN attempts >= max_attempts THEN 'failed'
            ELSE 'queued'
          END,
          error_message = %s,
          finished_at = CASE
            WHEN %s THEN CURRENT_TIMESTAMP
            WHEN attempts >= max_attempts THEN CURRENT_TIMESTAMP
            ELSE NULL
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
      WHERE job_id = %s
      """,
      (
        non_retryable,
        error_message,
        non_retryable,
        json.dumps(failure_metadata, ensure_ascii=False),
        str(job["job_id"]),
      ),
    )
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
      VALUES (%s, 'analysis_failed', 'content-assets-worker', 'AI 视频素材分析失败', %s::jsonb)
      """,
      (
        str(job["asset_id"]),
        json.dumps({
          "jobId": str(job["job_id"]),
          "error": error_message,
          "errorCategory": error_info["category"],
          "errorLabel": error_info["label"],
          "willRetry": not will_fail,
        }, ensure_ascii=False),
      ),
    )
  conn.commit()


def _video_understanding_failure_status(
  error_message: str,
  error_category: str,
  will_fail: bool,
) -> str:
  if not will_fail:
    return "pending"
  text = error_message.lower()
  if (
    error_category == "video_skipped"
    or "缺少可分析的视频对象" in error_message
    or "缺少 raw_object_key" in error_message
    or "缺少 preview_object_key" in error_message
    or "missing video" in text
    or "no analyzable video" in text
  ):
    return "skipped"
  return "failed"


def _int_job_value(job: dict[str, Any], key: str, default: int) -> int:
  try:
    return int(job.get(key) or default)
  except (TypeError, ValueError):
    return default


def _low_quality_metadata_labels_sql() -> str:
  return ", ".join(f"'{label}'" for label in LOW_QUALITY_METADATA_LABELS)


def _is_non_retryable_analysis_error(error_message: str) -> bool:
  # 方舟安全体验额度触顶后服务会暂停，重复重试只会烧掉队列 attempts。
  retry_blockers = (
    "AccountOverdueError",
    "SetLimitExceeded",
    "Safe Experience Mode",
    "overdue balance",
    "model service has been paused",
  )
  return any(marker in error_message for marker in retry_blockers)


def _asset_context(
  job: dict[str, Any],
  *,
  input_role: str,
  input_object_key: str,
  model_input_role: str,
  model_input_object_key: str,
  analysis_profile: str,
) -> Dict[str, Any]:
  performance_snapshot = _load_performance_snapshot_context(str(job.get("asset_id") or ""))
  product_card_acceptance = _product_card_acceptance_context(performance_snapshot)
  performance_diagnosis = _build_performance_diagnosis_context(
    performance_snapshot,
    product_card_acceptance=product_card_acceptance,
  )
  constraints = _qianchuan_fusion_constraints(performance_snapshot)
  return _json_safe({
    "assetId": job.get("asset_id"),
    "title": job.get("title"),
    "titleSource": job.get("title_source"),
    "platform": job.get("platform"),
    "productName": job.get("product_name"),
    "creatorName": job.get("creator_name"),
    "ownerName": job.get("owner_name"),
    "tags": job.get("tags") or [],
    "tagsSource": job.get("tags_source"),
    "notes": job.get("notes"),
    "durationSeconds": job.get("duration_seconds"),
    "width": job.get("width"),
    "height": job.get("height"),
    "fileSizeBytes": job.get("file_size_bytes"),
    "previewSizeBytes": job.get("preview_size_bytes"),
    "inputRole": input_role,
    "inputObjectKey": input_object_key,
    "modelInputRole": model_input_role,
    "modelInputObjectKey": model_input_object_key,
    "analysisProfile": analysis_profile,
    "transcript": job.get("transcript_context"),
    "performanceSnapshot": performance_snapshot,
    "performanceDiagnosis": performance_diagnosis,
    "productCardAcceptance": product_card_acceptance,
    "constraints": constraints,
  })


def _product_card_acceptance_base() -> dict[str, Any]:
  return {
    "level": "missing_card_acceptance",
    "confidence": "low",
    "source": PRODUCT_CARD_ACCEPTANCE_SOURCE,
    "adsSource": PRODUCT_CARD_ACCEPTANCE_ADS_SOURCE,
    "sourceGrain": PRODUCT_CARD_ACCEPTANCE_SOURCE_GRAIN,
    "qianchuanSource": "ods.douyin_qianchuan_shortvideo_raw",
    "qianchuanGrain": "material_id + stat_date",
    "requiredBridge": PRODUCT_CARD_ACCEPTANCE_REQUIRED_BRIDGE,
    "bridgeSource": PRODUCT_CARD_ACCEPTANCE_BRIDGE_SOURCE,
    "joinKeysWhenBridgeReady": ["product_id", "stat_date window", "source_level1"],
    "limitation": "商品卡承接不是 material_id 直连；缺可信 product_id、日期窗口和 source_level1 对齐时，不能归因到单 material_id 的商品卡 GMV。",
  }


def _product_card_acceptance_context(snapshot: dict[str, Any] | None) -> dict[str, Any]:
  base = _product_card_acceptance_base()
  if not isinstance(snapshot, dict):
    return {
      **base,
      "reason": "missing_performance_snapshot",
      "isApplicable": False,
      "productMaterialIds": [],
    }

  embedded_context = snapshot.get("productCardAcceptance")
  if isinstance(embedded_context, dict):
    return {
      **base,
      **embedded_context,
      "source": embedded_context.get("source") or base["source"],
      "adsSource": embedded_context.get("adsSource") or base["adsSource"],
      "sourceGrain": embedded_context.get("sourceGrain") or base["sourceGrain"],
      "qianchuanSource": embedded_context.get("qianchuanSource") or base["qianchuanSource"],
      "qianchuanGrain": embedded_context.get("qianchuanGrain") or base["qianchuanGrain"],
      "requiredBridge": embedded_context.get("requiredBridge") or base["requiredBridge"],
      "bridgeSource": embedded_context.get("bridgeSource") or base["bridgeSource"],
      "joinKeysWhenBridgeReady": embedded_context.get("joinKeysWhenBridgeReady") or base["joinKeysWhenBridgeReady"],
      "limitation": embedded_context.get("limitation") or base["limitation"],
    }

  product_materials = [
    material
    for material in snapshot.get("materials") or []
    if isinstance(material, dict) and str(material.get("objective") or "") == "product_all_domain_shortvideo"
  ]
  material_ids = [
    str(material.get("materialId"))
    for material in product_materials
    if material.get("materialId") is not None
  ]
  first_dates = [
    str(material.get("firstStatDate"))
    for material in product_materials
    if material.get("firstStatDate")
  ]
  last_dates = [
    str(material.get("lastStatDate"))
    for material in product_materials
    if material.get("lastStatDate")
  ]
  if not product_materials:
    return {
      **base,
      "reason": "no_product_material",
      "isApplicable": False,
      "productMaterialIds": [],
    }

  return {
    **base,
    "reason": "missing_trusted_material_product_bridge",
    "isApplicable": True,
    "productMaterialIds": material_ids,
    "dateWindow": {
      "firstStatDate": min(first_dates) if first_dates else None,
      "lastStatDate": max(last_dates) if last_dates else None,
    },
  }


def _qianchuan_fusion_constraints(snapshot: dict[str, Any] | None) -> dict[str, Any]:
  objectives: list[str] = []
  if isinstance(snapshot, dict):
    for material in snapshot.get("materials") or []:
      if not isinstance(material, dict):
        continue
      objective = str(material.get("objective") or "").strip()
      if objective and objective not in objectives:
        objectives.append(objective)
  return {
    "delivery_mode": "qianchuan_all_domain",
    "objective": objectives[0] if len(objectives) == 1 else "mixed" if objectives else "unknown",
    "objectives": objectives,
    "boost_metrics_policy": "boost metrics are explanatory only; do not add boost_* or legacy_boost_* into overall_* metrics",
    "live_acceptance_policy": "douyin_trade_sale_live_raw is account-date live-room acceptance environment, not material-level exact attribution",
    "product_card_acceptance_policy": "douyin_qianchuan_shortvideo_raw has no product-card source_level1/card_* fields; use ods.douyin_trade_sale_card_detail_raw only after trusted material_id -> product_id bridge, product_id/date-window/source_level1 alignment; otherwise output missing_card_acceptance and never claim exact single-material card GMV",
  }


def _load_performance_snapshot_context(asset_id: str) -> dict[str, Any] | None:
  if not asset_id:
    return None
  with connect_pg() as conn:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
      cur.execute(
        """
        SELECT
          to_regclass('dws.marketing_content_qianchuan_material_summary') IS NOT NULL AS summary_exists,
          to_regclass('dws.marketing_content_qianchuan_live_room_acceptance_di') IS NOT NULL AS acceptance_exists
        """
      )
      presence = cur.fetchone() or {}
      if not presence.get("summary_exists"):
        return None
      sql = _performance_snapshot_sql(include_acceptance=bool(presence.get("acceptance_exists")))
      cur.execute(sql, {"asset_id": asset_id})
      rows = list(cur.fetchall())
      benchmark_contexts = _load_performance_benchmark_contexts(cur, rows)
  if not rows:
    return None

  materials: list[dict[str, Any]] = []
  quality_flags: list[str] = []
  latest_stat_date = ""
  totals = {
    "materialCount": 0,
    "productMaterialCount": 0,
    "liveMaterialCount": 0,
    "totalImpressions": 0,
    "totalClicks": 0,
    "totalCost": 0.0,
    "totalOrders": 0,
    "totalGmv": 0.0,
    "totalNetGmv": 0.0,
    "totalNetOrders": 0,
  }

  for row in rows:
    objective = str(row.get("objective") or "")
    last_stat_date = str(row.get("last_stat_date") or "")
    latest_stat_date = max(latest_stat_date, last_stat_date)
    material = {
      "materialId": row.get("material_id"),
      "objective": objective,
      "sourceTable": row.get("source_table"),
      "materialVideoName": row.get("material_video_name"),
      "liveRoomName": row.get("live_room_name"),
      "douyinAccountDisplayId": row.get("douyin_account_display_id"),
      "firstStatDate": row.get("first_stat_date"),
      "lastStatDate": last_stat_date or None,
      "activeDays": _as_int(row.get("active_days")),
      "totalImpressions": _as_int(row.get("total_impressions")),
      "totalClicks": _as_int(row.get("total_clicks")),
      "totalCost": _as_float(row.get("total_cost")),
      "totalOrders": _as_int(row.get("total_orders")),
      "totalGmv": _as_float(row.get("total_gmv")),
      "totalNetGmv": _as_float(row.get("total_net_gmv")),
      "totalNetOrders": _as_int(row.get("total_net_orders")),
      "ctr": _optional_float(row.get("ctr")),
      "cvr": _optional_float(row.get("cvr")),
      "payRoi": _optional_float(row.get("pay_roi")),
      "netGmvRoi": _optional_float(row.get("net_gmv_roi")),
      "orderCost": _optional_float(row.get("order_cost")),
      "netOrderCost": _optional_float(row.get("net_order_cost")),
      "refundRate1h": _optional_float(row.get("refund_rate_1h")),
      "netGmvSettlementRate": _optional_float(row.get("net_gmv_settlement_rate")),
      "videoPlayCount": _optional_int(row.get("video_play_count")),
      "videoCompletePlayRate": _optional_float(row.get("video_complete_play_rate")),
      "avgWatchDuration": _optional_float(row.get("avg_watch_duration")),
      "playRate5s": _optional_float(row.get("play_rate_5s")),
      "playRate10s": _optional_float(row.get("play_rate_10s")),
      "dataQualityStatus": str(row.get("data_quality_status") or "unknown"),
      "sampleQualityStatus": str(row.get("sample_quality_status") or "unknown"),
      "latestLiveAcceptanceStatus": row.get("latest_live_acceptance_status"),
      "liveAcceptance": row.get("live_acceptance"),
      "benchmarkContext": benchmark_contexts.get(str(row.get("material_id") or "")),
    }
    materials.append(material)
    totals["materialCount"] += 1
    if objective == "product_all_domain_shortvideo":
      totals["productMaterialCount"] += 1
    if objective == "live_all_domain_shortvideo":
      totals["liveMaterialCount"] += 1
    totals["totalImpressions"] += material["totalImpressions"]
    totals["totalClicks"] += material["totalClicks"]
    totals["totalCost"] += material["totalCost"]
    totals["totalOrders"] += material["totalOrders"]
    totals["totalGmv"] += material["totalGmv"]
    totals["totalNetGmv"] += material["totalNetGmv"]
    totals["totalNetOrders"] += material["totalNetOrders"]
    _append_quality_flag(quality_flags, material["dataQualityStatus"])
    _append_quality_flag(quality_flags, material["sampleQualityStatus"])
    if objective == "live_all_domain_shortvideo" and material.get("latestLiveAcceptanceStatus") == "missing":
      _append_quality_flag(quality_flags, "missing_live_acceptance")

  total_cost = float(totals["totalCost"] or 0)
  totals["ctr"] = _safe_ratio(float(totals["totalClicks"]), float(totals["totalImpressions"]))
  totals["cvr"] = _safe_ratio(float(totals["totalOrders"]), float(totals["totalClicks"]))
  totals["payRoi"] = _safe_ratio(float(totals["totalGmv"]), total_cost)
  totals["netGmvRoi"] = _safe_ratio(float(totals["totalNetGmv"]), total_cost)
  product_card_acceptance = _load_product_card_acceptance_context(cur, materials)

  return {
    "deliveryMode": "qianchuan_all_domain",
    "hasQianchuanPerformance": True,
    "latestStatDate": latest_stat_date or None,
    "totals": totals,
    "qualityFlags": quality_flags,
    "materials": materials,
    "productCardAcceptance": product_card_acceptance,
  }


def _load_product_card_acceptance_context(
  cur: psycopg2.extensions.cursor,
  materials: list[dict[str, Any]],
) -> dict[str, Any]:
  base = _product_card_acceptance_base()
  product_materials = [
    material
    for material in materials
    if str(material.get("objective") or "") == "product_all_domain_shortvideo"
       and material.get("materialId")
  ]
  material_ids = [str(material.get("materialId")) for material in product_materials]
  first_dates = [str(material.get("firstStatDate")) for material in product_materials if material.get("firstStatDate")]
  last_dates = [str(material.get("lastStatDate")) for material in product_materials if material.get("lastStatDate")]
  date_window = {
    "firstStatDate": min(first_dates) if first_dates else None,
    "lastStatDate": max(last_dates) if last_dates else None,
  }
  if not product_materials:
    return {
      **base,
      "reason": "no_product_material",
      "isApplicable": False,
      "productMaterialIds": [],
    }

  cur.execute(
    """
    SELECT
      to_regclass('ads.douyin_shortvideo_detail') IS NOT NULL AS bridge_exists,
      to_regclass('ads.douyin_trade_sale_card_detail') IS NOT NULL AS card_ads_exists,
      to_regclass('ods.douyin_trade_sale_card_detail_raw') IS NOT NULL AS card_raw_exists
    """
  )
  presence = cur.fetchone() or {}
  if not presence.get("bridge_exists") or not presence.get("card_ads_exists"):
    return {
      **base,
      "reason": "missing_required_tables",
      "isApplicable": True,
      "productMaterialIds": material_ids,
      "dateWindow": date_window,
      "requiredTables": [
        PRODUCT_CARD_ACCEPTANCE_BRIDGE_SOURCE,
        PRODUCT_CARD_ACCEPTANCE_ADS_SOURCE,
      ],
      "tablePresence": dict(presence),
    }

  material_inputs = [
    {
      "material_id": str(material.get("materialId") or ""),
      "first_stat_date": str(material.get("firstStatDate") or ""),
      "last_stat_date": str(material.get("lastStatDate") or material.get("firstStatDate") or ""),
    }
    for material in product_materials
    if material.get("materialId")
  ]
  try:
    cur.execute(
      """
      WITH input_materials AS (
        SELECT
          NULLIF(BTRIM(input.material_id), '') AS material_id,
          NULLIF(BTRIM(input.first_stat_date), '')::DATE AS first_stat_date,
          NULLIF(BTRIM(input.last_stat_date), '')::DATE AS last_stat_date
        FROM jsonb_to_recordset(%(materials)s::JSONB) AS input(
          material_id TEXT,
          first_stat_date TEXT,
          last_stat_date TEXT
        )
        WHERE NULLIF(BTRIM(input.material_id), '') IS NOT NULL
      ),
      bridge_rows AS (
        SELECT
          input.material_id,
          NULLIF(BTRIM(detail.product_id), '') AS product_id,
          detail.stat_date,
          NULLIF(BTRIM(detail.shop_id), '') AS shop_id,
          NULLIF(BTRIM(detail.shop_name), '') AS shop_name,
          NULLIF(BTRIM(detail.video_id), '') AS video_id,
          NULLIF(BTRIM(detail.video_title), '') AS video_title,
          detail.mapping_status,
          detail.qianchuan_match_status,
          detail.qianchuan_metric_attributed
        FROM input_materials input
        JOIN ads.douyin_shortvideo_detail detail
          ON input.material_id = ANY(detail.qianchuan_material_ids)
         AND detail.stat_date BETWEEN COALESCE(input.first_stat_date, DATE '1900-01-01')
                                  AND COALESCE(input.last_stat_date, DATE '2999-12-31')
        WHERE detail.detail_grain = 'trade_video_day'
          AND detail.qianchuan_metric_attributed = TRUE
          AND NULLIF(BTRIM(detail.product_id), '') IS NOT NULL
      ),
      material_stats AS (
        SELECT
          material_id,
          COUNT(*)::INTEGER AS bridge_day_count,
          COUNT(DISTINCT product_id)::INTEGER AS product_count,
          MIN(stat_date) AS first_bridge_date,
          MAX(stat_date) AS last_bridge_date,
          ARRAY_AGG(DISTINCT product_id ORDER BY product_id) AS product_ids,
          ARRAY_AGG(DISTINCT qianchuan_match_status ORDER BY qianchuan_match_status) AS match_statuses
        FROM bridge_rows
        GROUP BY material_id
      ),
      same_day_card AS (
        SELECT
          bridge.material_id,
          bridge.product_id,
          bridge.stat_date,
          card.source_level1,
          card."投广时段" AS ad_time_segment,
          card."一级渠道" AS channel_l1,
          card."二级渠道" AS channel_l2,
          card."售卖类型" AS sale_type,
          card.card_exposure_user_count,
          card.card_click_user_count,
          card.card_buyer_count,
          card.card_cart_user_count,
          card.card_favorite_user_count,
          card.card_bounce_user_count,
          card.card_user_pay_amount,
          card.card_order_count
        FROM bridge_rows bridge
        JOIN ads.douyin_trade_sale_card_detail card
          ON card.product_id = bridge.product_id
         AND card.stat_date = bridge.stat_date
      ),
      range_card AS (
        SELECT DISTINCT
          bridge.material_id,
          bridge.product_id,
          card.stat_date,
          card.source_level1
        FROM bridge_rows bridge
        JOIN ads.douyin_trade_sale_card_detail card
          ON card.product_id = bridge.product_id
         AND card.stat_date BETWEEN (
              SELECT MIN(stat_date) FROM bridge_rows scoped WHERE scoped.material_id = bridge.material_id
            ) AND (
              SELECT MAX(stat_date) FROM bridge_rows scoped WHERE scoped.material_id = bridge.material_id
            )
      ),
      totals AS (
        SELECT
          (SELECT COUNT(*)::INTEGER FROM material_stats) AS bridge_material_count,
          (SELECT COUNT(*)::INTEGER FROM material_stats WHERE product_count = 1) AS one_product_material_count,
          (SELECT COUNT(*)::INTEGER FROM material_stats WHERE product_count > 1) AS multi_product_material_count,
          (SELECT COALESCE(SUM(bridge_day_count), 0)::INTEGER FROM material_stats) AS bridge_day_count,
          (SELECT COUNT(DISTINCT product_id)::INTEGER FROM bridge_rows) AS product_count,
          (SELECT COUNT(DISTINCT material_id)::INTEGER FROM bridge_rows WHERE qianchuan_match_status = 'matched') AS direct_match_material_count,
          (SELECT COUNT(DISTINCT material_id)::INTEGER FROM bridge_rows WHERE qianchuan_match_status <> 'matched') AS non_direct_match_material_count,
          (SELECT ARRAY_AGG(DISTINCT qianchuan_match_status ORDER BY qianchuan_match_status) FROM bridge_rows) AS match_statuses,
          (SELECT COUNT(DISTINCT (material_id, product_id, stat_date))::INTEGER FROM same_day_card) AS same_day_aligned_day_count,
          (SELECT COUNT(DISTINCT material_id)::INTEGER FROM same_day_card) AS same_day_aligned_material_count,
          (SELECT COUNT(DISTINCT product_id)::INTEGER FROM same_day_card) AS same_day_aligned_product_count,
          (SELECT COUNT(DISTINCT (material_id, product_id, stat_date))::INTEGER FROM range_card) AS range_aligned_day_count,
          (SELECT COUNT(DISTINCT material_id)::INTEGER FROM range_card) AS range_aligned_material_count,
          (SELECT COALESCE(SUM(card_exposure_user_count), 0)::BIGINT FROM same_day_card) AS card_exposure_user_count,
          (SELECT COALESCE(SUM(card_click_user_count), 0)::BIGINT FROM same_day_card) AS card_click_user_count,
          (SELECT COALESCE(SUM(card_buyer_count), 0)::BIGINT FROM same_day_card) AS card_buyer_count,
          (SELECT COALESCE(SUM(card_cart_user_count), 0)::BIGINT FROM same_day_card) AS card_cart_user_count,
          (SELECT COALESCE(SUM(card_favorite_user_count), 0)::BIGINT FROM same_day_card) AS card_favorite_user_count,
          (SELECT COALESCE(SUM(card_bounce_user_count), 0)::BIGINT FROM same_day_card) AS card_bounce_user_count,
          (SELECT COALESCE(SUM(card_user_pay_amount), 0)::NUMERIC FROM same_day_card) AS card_user_pay_amount,
          (SELECT COALESCE(SUM(card_order_count), 0)::BIGINT FROM same_day_card) AS card_order_count,
          (SELECT MIN(stat_date) FROM bridge_rows) AS first_bridge_date,
          (SELECT MAX(stat_date) FROM bridge_rows) AS last_bridge_date
      ),
      source_breakdown AS (
        SELECT
          source_level1,
          ad_time_segment,
          channel_l1,
          channel_l2,
          sale_type,
          COUNT(*)::INTEGER AS row_count,
          COUNT(DISTINCT material_id)::INTEGER AS material_count,
          COUNT(DISTINCT product_id)::INTEGER AS product_count,
          COALESCE(SUM(card_exposure_user_count), 0)::BIGINT AS card_exposure_user_count,
          COALESCE(SUM(card_click_user_count), 0)::BIGINT AS card_click_user_count,
          COALESCE(SUM(card_buyer_count), 0)::BIGINT AS card_buyer_count,
          COALESCE(SUM(card_user_pay_amount), 0)::NUMERIC AS card_user_pay_amount,
          COALESCE(SUM(card_order_count), 0)::BIGINT AS card_order_count
        FROM same_day_card
        GROUP BY source_level1, ad_time_segment, channel_l1, channel_l2, sale_type
        ORDER BY row_count DESC, card_user_pay_amount DESC
        LIMIT 12
      ),
      material_mappings AS (
        SELECT
          material_id,
          product_ids,
          product_count,
          bridge_day_count,
          first_bridge_date,
          last_bridge_date,
          match_statuses
        FROM material_stats
        ORDER BY bridge_day_count DESC, material_id
        LIMIT 20
      )
      SELECT jsonb_build_object(
        'bridge', (
          SELECT jsonb_build_object(
            'source', %(bridge_source)s,
            'bridgeGrain', 'material_id + stat_date + product_id from ads.douyin_shortvideo_detail',
            'materialCount', COALESCE(bridge_material_count, 0),
            'oneProductMaterialCount', COALESCE(one_product_material_count, 0),
            'multiProductMaterialCount', COALESCE(multi_product_material_count, 0),
            'productCount', COALESCE(product_count, 0),
            'bridgeDayCount', COALESCE(bridge_day_count, 0),
            'directMatchMaterialCount', COALESCE(direct_match_material_count, 0),
            'nonDirectMatchMaterialCount', COALESCE(non_direct_match_material_count, 0),
            'matchStatuses', COALESCE(match_statuses, ARRAY[]::TEXT[]),
            'firstBridgeDate', first_bridge_date::TEXT,
            'lastBridgeDate', last_bridge_date::TEXT
          )
          FROM totals
        ),
        'metrics', (
          SELECT jsonb_build_object(
            'sameDayAlignedDayCount', COALESCE(same_day_aligned_day_count, 0),
            'sameDayAlignedMaterialCount', COALESCE(same_day_aligned_material_count, 0),
            'sameDayAlignedProductCount', COALESCE(same_day_aligned_product_count, 0),
            'rangeAlignedDayCount', COALESCE(range_aligned_day_count, 0),
            'rangeAlignedMaterialCount', COALESCE(range_aligned_material_count, 0),
            'cardExposureUserCount', COALESCE(card_exposure_user_count, 0),
            'cardClickUserCount', COALESCE(card_click_user_count, 0),
            'cardBuyerCount', COALESCE(card_buyer_count, 0),
            'cardCartUserCount', COALESCE(card_cart_user_count, 0),
            'cardFavoriteUserCount', COALESCE(card_favorite_user_count, 0),
            'cardBounceUserCount', COALESCE(card_bounce_user_count, 0),
            'cardUserPayAmount', COALESCE(card_user_pay_amount, 0),
            'cardOrderCount', COALESCE(card_order_count, 0)
          )
          FROM totals
        ),
        'sourceBreakdown', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'sourceLevel1', source_level1,
                'adTimeSegment', ad_time_segment,
                'channelL1', channel_l1,
                'channelL2', channel_l2,
                'saleType', sale_type,
                'rowCount', row_count,
                'materialCount', material_count,
                'productCount', product_count,
                'cardExposureUserCount', card_exposure_user_count,
                'cardClickUserCount', card_click_user_count,
                'cardBuyerCount', card_buyer_count,
                'cardUserPayAmount', card_user_pay_amount,
                'cardOrderCount', card_order_count
              )
            )
            FROM source_breakdown
          ),
          '[]'::JSONB
        ),
        'materialMappings', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'materialId', material_id,
                'productIds', product_ids,
                'productCount', product_count,
                'bridgeDayCount', bridge_day_count,
                'firstBridgeDate', first_bridge_date::TEXT,
                'lastBridgeDate', last_bridge_date::TEXT,
                'matchStatuses', match_statuses
              )
            )
            FROM material_mappings
          ),
          '[]'::JSONB
        )
      ) AS context
      """,
      {
        "materials": json.dumps(material_inputs, ensure_ascii=False),
        "bridge_source": PRODUCT_CARD_ACCEPTANCE_BRIDGE_SOURCE,
      },
    )
    row = cur.fetchone() or {}
  except Exception as error:  # noqa: BLE001 - 承接上下文失败不能中断视频分析主链路
    return {
      **base,
      "reason": "product_card_acceptance_lookup_failed",
      "isApplicable": True,
      "productMaterialIds": material_ids,
      "dateWindow": date_window,
      "lookupError": error.__class__.__name__,
    }

  context = row.get("context") if isinstance(row, Mapping) else None
  if not isinstance(context, dict):
    return {
      **base,
      "reason": "missing_product_card_acceptance_query_result",
      "isApplicable": True,
      "productMaterialIds": material_ids,
      "dateWindow": date_window,
    }

  bridge = context.get("bridge") if isinstance(context.get("bridge"), dict) else {}
  metrics = context.get("metrics") if isinstance(context.get("metrics"), dict) else {}
  bridge_material_count = _as_int(bridge.get("materialCount"))
  multi_product_material_count = _as_int(bridge.get("multiProductMaterialCount"))
  same_day_aligned_day_count = _as_int(metrics.get("sameDayAlignedDayCount"))
  range_aligned_day_count = _as_int(metrics.get("rangeAlignedDayCount"))
  match_statuses = [
    str(status)
    for status in bridge.get("matchStatuses") or []
    if str(status).strip()
  ]
  has_only_allowed_bridge_statuses = all(
    status in PRODUCT_CARD_ACCEPTANCE_ALLOWED_BRIDGE_STATUSES
    for status in match_statuses
  )
  if bridge_material_count <= 0:
    level = "missing_card_acceptance"
    confidence = "low"
    reason = "missing_material_product_bridge_candidate"
  elif multi_product_material_count > 0:
    level = "missing_card_acceptance"
    confidence = "low"
    reason = "ambiguous_material_product_bridge"
  elif same_day_aligned_day_count > 0:
    level = "product_day_aligned"
    confidence = "high" if _as_int(bridge.get("directMatchMaterialCount")) == bridge_material_count else "medium"
    reason = "product_id_stat_date_source_level1_aligned"
  elif range_aligned_day_count > 0:
    level = "product_range_aligned"
    confidence = "medium" if has_only_allowed_bridge_statuses else "low"
    reason = "product_id_date_window_source_level1_aligned"
  else:
    level = "missing_card_acceptance"
    confidence = "low"
    reason = "no_card_rows_for_bridged_products"
  if level != "missing_card_acceptance" and not has_only_allowed_bridge_statuses:
    confidence = "low"

  direct_match_material_count = _as_int(bridge.get("directMatchMaterialCount"))
  non_direct_match_material_count = _as_int(bridge.get("nonDirectMatchMaterialCount"))
  if bridge_material_count > 0 and direct_match_material_count == bridge_material_count:
    bridge_method = "direct_material_identity"
  elif non_direct_match_material_count > 0:
    bridge_method = "shortvideo_detail_title_date_product_context"
  else:
    bridge_method = "unknown"

  return {
    **base,
    "level": level,
    "attributionLevel": level,
    "confidence": confidence,
    "reason": reason,
    "isApplicable": True,
    "productMaterialIds": material_ids,
    "dateWindow": date_window,
    "bridge": {
      **bridge,
      "method": bridge_method,
      "confidenceRule": (
        "high only for direct active material identity; title/date bridge is medium context, not exact material GMV attribution"
      ),
    },
    "metrics": metrics,
    "sourceBreakdown": context.get("sourceBreakdown") or [],
    "materialMappings": context.get("materialMappings") or [],
    "limitation": (
      "商品卡承接来自 product_id + 日期 + source_level1 上下文；即使已通过 "
      "ads.douyin_shortvideo_detail 找到 material_id -> product_id 候选，也只能说明该素材对应商品在投放窗口内的商品卡承接表现，"
      "不能把商品卡点击、成交或 GMV 精确归因到单个 material_id。"
    ),
  }


def _load_performance_benchmark_contexts(
  cur: psycopg2.extensions.cursor,
  rows: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
  contexts: dict[str, dict[str, Any]] = {}
  if not rows:
    return contexts

  for row in rows:
    material_id = str(row.get("material_id") or "")
    objective = str(row.get("objective") or "")
    account_id = str(row.get("douyin_account_display_id") or "")
    last_stat_date = row.get("last_stat_date")
    if not material_id:
      continue
    if not objective or not last_stat_date:
      contexts[material_id] = _insufficient_benchmark_context(objective, "missing material objective or stat date")
      continue

    cur.execute(
      """
      WITH candidates AS (
        SELECT *
        FROM (
          VALUES
            ('same_objective_account_30d'::TEXT, 30::INTEGER, TRUE, 1),
            ('same_objective_global_30d'::TEXT, 30::INTEGER, FALSE, 2),
            ('same_objective_global_90d'::TEXT, 90::INTEGER, FALSE, 3)
        ) AS candidate(scope, window_days, same_account_only, rank)
      ),
      perf_samples AS (
        SELECT candidate.scope, candidate.window_days, candidate.rank, perf.*
        FROM candidates candidate
        JOIN dwd.marketing_content_qianchuan_material_performance_di perf
          ON perf.objective = %(objective)s
         AND perf.stat_date BETWEEN (
              %(last_stat_date)s::DATE - ((candidate.window_days - 1) * INTERVAL '1 day')
            ) AND %(last_stat_date)s::DATE
         AND (
              NOT candidate.same_account_only
              OR (
                NULLIF(%(account_id)s, '') IS NOT NULL
                AND perf.douyin_account_display_id = %(account_id)s
              )
            )
         AND perf.sample_quality_status = 'ok'
      ),
      perf_benchmark AS (
        SELECT
          scope,
          window_days,
          rank,
          COUNT(*)::INTEGER AS sample_count,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY overall_click_rate)
            FILTER (WHERE overall_click_rate IS NOT NULL) AS NUMERIC) AS ctr_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY overall_click_rate)
            FILTER (WHERE overall_click_rate IS NOT NULL) AS NUMERIC) AS ctr_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY overall_click_rate)
            FILTER (WHERE overall_click_rate IS NOT NULL) AS NUMERIC) AS ctr_p75,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY overall_conversion_rate)
            FILTER (WHERE overall_conversion_rate IS NOT NULL) AS NUMERIC) AS cvr_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY overall_conversion_rate)
            FILTER (WHERE overall_conversion_rate IS NOT NULL) AS NUMERIC) AS cvr_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY overall_conversion_rate)
            FILTER (WHERE overall_conversion_rate IS NOT NULL) AS NUMERIC) AS cvr_p75,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY overall_pay_roi)
            FILTER (WHERE overall_pay_roi IS NOT NULL) AS NUMERIC) AS pay_roi_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY overall_pay_roi)
            FILTER (WHERE overall_pay_roi IS NOT NULL) AS NUMERIC) AS pay_roi_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY overall_pay_roi)
            FILTER (WHERE overall_pay_roi IS NOT NULL) AS NUMERIC) AS pay_roi_p75,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY refund_rate_1h)
            FILTER (WHERE refund_rate_1h IS NOT NULL) AS NUMERIC) AS refund_rate_1h_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY refund_rate_1h)
            FILTER (WHERE refund_rate_1h IS NOT NULL) AS NUMERIC) AS refund_rate_1h_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY refund_rate_1h)
            FILTER (WHERE refund_rate_1h IS NOT NULL) AS NUMERIC) AS refund_rate_1h_p75,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY video_complete_play_rate)
            FILTER (WHERE video_complete_play_rate IS NOT NULL) AS NUMERIC) AS video_complete_play_rate_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY video_complete_play_rate)
            FILTER (WHERE video_complete_play_rate IS NOT NULL) AS NUMERIC) AS video_complete_play_rate_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY video_complete_play_rate)
            FILTER (WHERE video_complete_play_rate IS NOT NULL) AS NUMERIC) AS video_complete_play_rate_p75,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY play_rate_5s)
            FILTER (WHERE play_rate_5s IS NOT NULL) AS NUMERIC) AS play_rate_5s_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY play_rate_5s)
            FILTER (WHERE play_rate_5s IS NOT NULL) AS NUMERIC) AS play_rate_5s_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY play_rate_5s)
            FILTER (WHERE play_rate_5s IS NOT NULL) AS NUMERIC) AS play_rate_5s_p75,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY play_rate_10s)
            FILTER (WHERE play_rate_10s IS NOT NULL) AS NUMERIC) AS play_rate_10s_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY play_rate_10s)
            FILTER (WHERE play_rate_10s IS NOT NULL) AS NUMERIC) AS play_rate_10s_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY play_rate_10s)
            FILTER (WHERE play_rate_10s IS NOT NULL) AS NUMERIC) AS play_rate_10s_p75
        FROM perf_samples
        GROUP BY scope, window_days, rank
      ),
      acceptance_samples AS (
        SELECT candidate.scope, candidate.window_days, candidate.rank, acceptance.*
        FROM candidates candidate
        JOIN dws.marketing_content_qianchuan_live_room_acceptance_di acceptance
          ON %(objective)s = 'live_all_domain_shortvideo'
         AND acceptance.stat_date BETWEEN (
              %(last_stat_date)s::DATE - ((candidate.window_days - 1) * INTERVAL '1 day')
            ) AND %(last_stat_date)s::DATE
         AND (
              NOT candidate.same_account_only
              OR (
                NULLIF(%(account_id)s, '') IS NOT NULL
                AND acceptance.douyin_account_display_id = %(account_id)s
              )
            )
         AND acceptance.acceptance_quality_status = 'ok'
      ),
      acceptance_benchmark AS (
        SELECT
          scope,
          window_days,
          rank,
          COUNT(*)::INTEGER AS acceptance_sample_count,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY product_click_rate_user)
            FILTER (WHERE product_click_rate_user IS NOT NULL) AS NUMERIC) AS product_click_rate_user_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY product_click_rate_user)
            FILTER (WHERE product_click_rate_user IS NOT NULL) AS NUMERIC) AS product_click_rate_user_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY product_click_rate_user)
            FILTER (WHERE product_click_rate_user IS NOT NULL) AS NUMERIC) AS product_click_rate_user_p75,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY watch_to_pay_rate_user)
            FILTER (WHERE watch_to_pay_rate_user IS NOT NULL) AS NUMERIC) AS watch_to_pay_rate_user_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY watch_to_pay_rate_user)
            FILTER (WHERE watch_to_pay_rate_user IS NOT NULL) AS NUMERIC) AS watch_to_pay_rate_user_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY watch_to_pay_rate_user)
            FILTER (WHERE watch_to_pay_rate_user IS NOT NULL) AS NUMERIC) AS watch_to_pay_rate_user_p75,
          CAST(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY click_to_pay_rate_user)
            FILTER (WHERE click_to_pay_rate_user IS NOT NULL) AS NUMERIC) AS click_to_pay_rate_user_p25,
          CAST(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY click_to_pay_rate_user)
            FILTER (WHERE click_to_pay_rate_user IS NOT NULL) AS NUMERIC) AS click_to_pay_rate_user_p50,
          CAST(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY click_to_pay_rate_user)
            FILTER (WHERE click_to_pay_rate_user IS NOT NULL) AS NUMERIC) AS click_to_pay_rate_user_p75
        FROM acceptance_samples
        GROUP BY scope, window_days, rank
      )
      SELECT perf_benchmark.*, acceptance_benchmark.acceptance_sample_count,
             acceptance_benchmark.product_click_rate_user_p25,
             acceptance_benchmark.product_click_rate_user_p50,
             acceptance_benchmark.product_click_rate_user_p75,
             acceptance_benchmark.watch_to_pay_rate_user_p25,
             acceptance_benchmark.watch_to_pay_rate_user_p50,
             acceptance_benchmark.watch_to_pay_rate_user_p75,
             acceptance_benchmark.click_to_pay_rate_user_p25,
             acceptance_benchmark.click_to_pay_rate_user_p50,
             acceptance_benchmark.click_to_pay_rate_user_p75
      FROM perf_benchmark
      LEFT JOIN acceptance_benchmark USING (scope, window_days, rank)
      WHERE perf_benchmark.sample_count >= 5
      ORDER BY perf_benchmark.rank
      LIMIT 1
      """,
      {
        "objective": objective,
        "last_stat_date": last_stat_date,
        "account_id": account_id,
      },
    )
    benchmark = cur.fetchone()
    contexts[material_id] = (
      _benchmark_context_from_row(objective, benchmark)
      if benchmark
      else _insufficient_benchmark_context(objective, "dynamic benchmark sample_count < 5 after degradation")
    )
  return contexts


def _benchmark_context_from_row(objective: str, row: dict[str, Any]) -> dict[str, Any]:
  metrics = {
    "ctr": _benchmark_metric(row, "ctr"),
    "cvr": _benchmark_metric(row, "cvr"),
    "pay_roi": _benchmark_metric(row, "pay_roi"),
    "refund_rate_1h": _benchmark_metric(row, "refund_rate_1h"),
    "video_complete_play_rate": _benchmark_metric(row, "video_complete_play_rate"),
    "play_rate_5s": _benchmark_metric(row, "play_rate_5s"),
    "play_rate_10s": _benchmark_metric(row, "play_rate_10s"),
    "product_click_rate_user": _benchmark_metric(row, "product_click_rate_user"),
    "watch_to_pay_rate_user": _benchmark_metric(row, "watch_to_pay_rate_user"),
    "click_to_pay_rate_user": _benchmark_metric(row, "click_to_pay_rate_user"),
  }
  return {
    "objective": objective,
    "scope": row.get("scope"),
    "status": "live_benchmark",
    "window_days": _as_int(row.get("window_days")),
    "source": "dwd.marketing_content_qianchuan_material_performance_di + dws.marketing_content_qianchuan_live_room_acceptance_di dynamic percentiles",
    "sample_count": _as_int(row.get("sample_count")),
    "acceptance_sample_count": _as_int(row.get("acceptance_sample_count")),
    "minimum_sample_count": 5,
    "metrics": {key: value for key, value in metrics.items() if value},
    "note": "按同 objective + 同账号近30天 -> 同 objective 全账号近30天 -> 同 objective 全账号近90天降级。",
  }


def _benchmark_metric(row: dict[str, Any], prefix: str) -> dict[str, float] | None:
  values = {
    "p25": _optional_float(row.get(f"{prefix}_p25")),
    "p50": _optional_float(row.get(f"{prefix}_p50")),
    "p75": _optional_float(row.get(f"{prefix}_p75")),
  }
  compact = {key: value for key, value in values.items() if value is not None}
  return compact or None


def _insufficient_benchmark_context(objective: str, reason: str) -> dict[str, Any]:
  return {
    "objective": objective or "unknown",
    "scope": "insufficient_benchmark",
    "status": "insufficient_benchmark",
    "window_days": None,
    "source": "dwd.marketing_content_qianchuan_material_performance_di dynamic percentiles",
    "sample_count": 0,
    "minimum_sample_count": 5,
    "metrics": {},
    "note": reason,
  }


def _performance_snapshot_sql(*, include_acceptance: bool) -> str:
  summary_columns = """
        summary.material_id,
        summary.objective,
        summary.source_table,
        summary.material_video_name,
        summary.live_room_name,
        summary.douyin_account_display_id,
        summary.first_stat_date::TEXT AS first_stat_date,
        summary.last_stat_date::TEXT AS last_stat_date,
        summary.active_days,
        summary.total_impressions,
        summary.total_clicks,
        summary.total_cost,
        summary.total_orders,
        summary.total_gmv,
        summary.total_net_gmv,
        summary.total_net_orders,
        summary.ctr,
        summary.cvr,
        summary.pay_roi,
        summary.net_gmv_roi,
        summary.order_cost,
        summary.net_order_cost,
        summary.refund_rate_1h,
        summary.net_gmv_settlement_rate,
        summary.video_play_count,
        summary.video_complete_play_rate,
        summary.avg_watch_duration,
        summary.play_rate_5s,
        summary.play_rate_10s,
        summary.latest_live_acceptance_status,
        summary.data_quality_status,
        summary.sample_quality_status
  """
  if not include_acceptance:
    return f"""
      SELECT
{summary_columns},
        NULL::JSONB AS live_acceptance
      FROM dws.marketing_content_qianchuan_material_summary summary
      WHERE summary.asset_id = %(asset_id)s::uuid
      ORDER BY summary.last_stat_date DESC NULLS LAST, summary.total_cost DESC, summary.material_id
    """
  return f"""
    SELECT
{summary_columns},
      CASE
        WHEN acceptance.stat_date IS NULL THEN NULL
        ELSE jsonb_build_object(
          'statDate', acceptance.stat_date::TEXT,
          'douyinAccountDisplayId', acceptance.douyin_account_display_id,
          'anchorNickname', acceptance.anchor_nickname,
          'liveWatchUserCount', acceptance.live_watch_user_count,
          'liveProductClickUser', acceptance.live_product_click_user,
          'productClickRateUser', acceptance.product_click_rate_user,
          'watchToPayRateUser', acceptance.watch_to_pay_rate_user,
          'clickToPayRateUser', acceptance.click_to_pay_rate_user,
          'liveOrderCount', acceptance.live_order_count,
          'liveGmv', acceptance.live_gmv,
          'acceptanceQualityStatus', acceptance.acceptance_quality_status
        )
      END AS live_acceptance
    FROM dws.marketing_content_qianchuan_material_summary summary
    LEFT JOIN LATERAL (
      SELECT acceptance.*
      FROM dws.marketing_content_qianchuan_live_room_acceptance_di acceptance
      WHERE summary.objective = 'live_all_domain_shortvideo'
        AND acceptance.douyin_account_display_id = summary.douyin_account_display_id
        AND acceptance.stat_date BETWEEN summary.first_stat_date AND summary.last_stat_date
      ORDER BY acceptance.stat_date DESC
      LIMIT 1
    ) acceptance ON TRUE
    WHERE summary.asset_id = %(asset_id)s::uuid
    ORDER BY summary.last_stat_date DESC NULLS LAST, summary.total_cost DESC, summary.material_id
  """


def _build_performance_diagnosis_context(
  snapshot: dict[str, Any] | None,
  *,
  product_card_acceptance: Mapping[str, Any] | None = None,
) -> dict[str, Any] | None:
  if not snapshot:
    return None
  material_diagnoses = []
  for material in snapshot.get("materials") or []:
    if not isinstance(material, dict):
      continue
    diagnosis = build_performance_diagnosis(
      _diagnosis_metrics_from_material(material),
      live_acceptance=_diagnosis_live_acceptance(material.get("liveAcceptance")),
      product_card_acceptance=product_card_acceptance
      if str(material.get("objective") or "") == "product_all_domain_shortvideo"
      else None,
    )
    material_diagnoses.append({
      "materialId": material.get("materialId"),
      "objective": material.get("objective"),
      "diagnosis": diagnosis,
    })
  return {
    "deliveryMode": "qianchuan_all_domain",
    "materialDiagnoses": material_diagnoses,
  }


def _diagnosis_metrics_from_material(material: dict[str, Any]) -> dict[str, Any]:
  return {
    "objective": material.get("objective"),
    "total_impressions": material.get("totalImpressions"),
    "total_clicks": material.get("totalClicks"),
    "total_cost": material.get("totalCost"),
    "total_orders": material.get("totalOrders"),
    "ctr": material.get("ctr"),
    "cvr": material.get("cvr"),
    "pay_roi": material.get("payRoi"),
    "refund_rate_1h": material.get("refundRate1h"),
    "net_gmv_settlement_rate": material.get("netGmvSettlementRate"),
    "video_complete_play_rate": material.get("videoCompletePlayRate"),
    "play_rate_5s": material.get("playRate5s"),
    "play_rate_10s": material.get("playRate10s"),
    "benchmarkContext": material.get("benchmarkContext"),
  }


def _diagnosis_live_acceptance(value: Any) -> dict[str, Any] | None:
  if not isinstance(value, dict):
    return None
  return {
    "acceptance_quality_status": value.get("acceptanceQualityStatus"),
    "product_click_rate_user": value.get("productClickRateUser"),
    "watch_to_pay_rate_user": value.get("watchToPayRateUser"),
    "click_to_pay_rate_user": value.get("clickToPayRateUser"),
  }


def _append_quality_flag(flags: list[str], value: str) -> None:
  if not value or value == "ok" or value in flags:
    return
  flags.append(value)


def _optional_int(value: Any) -> int | None:
  return None if value is None else _as_int(value)


def _as_int(value: Any) -> int:
  if value is None:
    return 0
  try:
    return int(value)
  except (TypeError, ValueError):
    return 0


def _optional_float(value: Any) -> float | None:
  return None if value is None else _as_float(value)


def _as_float(value: Any) -> float:
  if value is None:
    return 0.0
  try:
    return float(value)
  except (TypeError, ValueError):
    return 0.0


def _safe_ratio(numerator: float, denominator: float) -> float | None:
  if denominator == 0:
    return None
  return numerator / denominator
