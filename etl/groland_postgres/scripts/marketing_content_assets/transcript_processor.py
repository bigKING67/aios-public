from __future__ import annotations

import hashlib
import json
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Literal, Optional, cast

import psycopg2
import psycopg2.extras

from .asr_client import (
  ArkVideoTranscriptClient,
  TranscriptConfig,
  TranscriptResult,
  transcript_excerpt,
  word_count,
)
from .repository import connect_pg
from .tos_storage import TosStorageClient, TosStorageConfig, build_object_key
from .worker_runtime import classify_processing_error as _classify_processing_error
from .worker_runtime import decimal_or_none as _decimal_or_none
from .worker_runtime import env_int as _env_int
from .worker_runtime import job_metadata as _job_metadata
from .worker_runtime import json_safe as _json_safe
from .worker_runtime import load_env_file
from .worker_runtime import update_processing_job_stage as _update_processing_job_stage
from .worker_video_input import InputRole, prepare_video_model_input


TranscriptSource = Literal["raw", "preview", "auto"]


def enqueue_transcript_jobs(
  limit: int = 0,
  force: bool = False,
  dry_run: bool = False,
  source: TranscriptSource = "auto",
  asset_id: str = "",
) -> Dict[str, Any]:
  source = _normalize_transcript_source(source)
  asset_id = (asset_id or "").strip()
  with connect_pg() as conn:
    candidates = _query_transcript_candidates(conn, limit=limit, force=force, source=source, asset_id=asset_id)
    if dry_run:
      return {
        "candidateCount": len(candidates),
        "enqueued": 0,
        "dryRun": True,
        "source": source,
        "assetId": asset_id or None,
        "sampleAssetIds": [str(row["asset_id"]) for row in candidates[:10]],
      }
    enqueued = _insert_transcript_jobs(conn, candidates, source=source, force=force)
  return {
    "candidateCount": len(candidates),
    "enqueued": enqueued,
    "dryRun": False,
    "source": source,
    "assetId": asset_id or None,
  }


def process_content_asset_transcript_jobs(limit: int = 10, temp_root: Optional[Path] = None) -> Dict[str, int]:
  stats = {
    "claimed": 0,
    "succeeded": 0,
    "failed": 0,
    "empty": 0,
  }
  storage = TosStorageClient(TosStorageConfig.from_env())
  client = ArkVideoTranscriptClient(TranscriptConfig.from_env())
  signed_url_ttl = _env_int("CONTENT_ASSET_TRANSCRIPT_SIGNED_URL_TTL_SECONDS", 3600)
  url_max_bytes = _env_int("CONTENT_ASSET_TRANSCRIPT_URL_MAX_BYTES", 50_000_000)
  proxy_target_bytes = _env_int("CONTENT_ASSET_TRANSCRIPT_PROXY_TARGET_BYTES", 45_000_000)

  with tempfile.TemporaryDirectory(prefix="content-assets-transcript-", dir=str(temp_root) if temp_root else None) as tmp_dir:
    work_root = Path(tmp_dir)
    for _ in range(max(1, limit)):
      with connect_pg() as conn:
        job = _claim_next_transcript_job(conn)
      if job is None:
        stats["empty"] += 1
        break
      stats["claimed"] += 1
      try:
        _process_transcript_job(
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
          _fail_transcript_job(conn, job, str(error))
        stats["failed"] += 1
      else:
        stats["succeeded"] += 1
  return stats


def _query_transcript_candidates(
  conn: psycopg2.extensions.connection,
  *,
  limit: int,
  force: bool,
  source: TranscriptSource,
  asset_id: str = "",
) -> list[dict[str, Any]]:
  limit_clause = f"LIMIT {max(1, int(limit))}" if limit and limit > 0 else ""
  asset_filter = "AND asset.asset_id = %(asset_id)s::uuid" if asset_id else ""
  existing_filter = "" if force else "AND asset.transcript_object_key IS NULL"
  availability_filter = {
    "raw": "AND asset.raw_object_key IS NOT NULL",
    "preview": "AND asset.preview_object_key IS NOT NULL",
    "auto": "AND (asset.raw_object_key IS NOT NULL OR asset.preview_object_key IS NOT NULL)",
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
        {existing_filter}
        AND NOT EXISTS (
          SELECT 1
          FROM ads.marketing_content_asset_processing_jobs job
          WHERE job.asset_id = asset.asset_id
            AND job.job_type = 'transcript'
            AND job.status IN ('queued', 'running')
        )
      ORDER BY
        CASE WHEN asset.raw_object_key IS NOT NULL THEN 0 ELSE 1 END,
        asset.updated_at DESC
      {limit_clause}
      """,
      {"asset_id": asset_id},
    )
    return list(cur.fetchall())


def _insert_transcript_jobs(
  conn: psycopg2.extensions.connection,
  candidates: list[dict[str, Any]],
  *,
  source: TranscriptSource,
  force: bool,
) -> int:
  count = 0
  with conn.cursor() as cur:
    for row in candidates:
      input_key, input_role = _resolve_transcript_input(row, source)
      cur.execute(
        """
        INSERT INTO ads.marketing_content_asset_processing_jobs (
          job_id,
          asset_id,
          job_type,
          status,
          input_object_key,
          metadata
        ) VALUES (%s, %s, 'transcript', 'queued', %s, %s::jsonb)
        """,
        (
          str(uuid.uuid4()),
          str(row["asset_id"]),
          input_key,
          json.dumps({
            "created_by": "transcript_enqueue",
            "transcript_source": source,
            "input_role": input_role,
            "force": force,
          }, ensure_ascii=False),
        ),
      )
      count += 1
  conn.commit()
  return count


def _claim_next_transcript_job(conn: psycopg2.extensions.connection) -> Optional[dict[str, Any]]:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      WITH next_job AS (
        SELECT job.job_id
        FROM ads.marketing_content_asset_processing_jobs job
        JOIN ads.marketing_content_assets asset ON asset.asset_id = job.asset_id
        WHERE job.status = 'queued'
          AND job.attempts < job.max_attempts
          AND job.job_type = 'transcript'
          AND asset.is_deleted = FALSE
          AND asset.external_only = FALSE
          AND (asset.raw_object_key IS NOT NULL OR asset.preview_object_key IS NOT NULL)
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
        asset.bucket,
        asset.raw_object_key,
        asset.preview_object_key,
        asset.file_ext,
        asset.mime_type,
        asset.duration_seconds,
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
        asset.platform,
        asset.product_name,
        asset.creator_name,
        asset.owner_name,
        asset.tags,
        asset.notes
      FROM claimed
      JOIN ads.marketing_content_assets asset ON asset.asset_id = claimed.asset_id
      """
    )
    row = cur.fetchone()
  conn.commit()
  return dict(row) if row else None


def _process_transcript_job(
  *,
  storage: TosStorageClient,
  client: ArkVideoTranscriptClient,
  job: dict[str, Any],
  work_dir: Path,
  signed_url_ttl: int,
  url_max_bytes: int,
  proxy_target_bytes: int,
) -> None:
  transcript_source = _transcript_source_from_job(job)
  input_object_key, input_role = _resolve_transcript_input(job, transcript_source)
  update_stage = _stage_updater(job)
  update_stage("preparing_input", "准备脚本输入", 14, {"inputRole": input_role})
  video_input = prepare_video_model_input(
    storage=storage,
    job=job,
    work_dir=work_dir,
    input_role=input_role,
    input_object_key=input_object_key,
    signed_url_ttl=signed_url_ttl,
    url_max_bytes=url_max_bytes,
    proxy_target_bytes=proxy_target_bytes,
    proxy_created_by="content-assets-transcript-worker",
    on_stage=update_stage,
  )
  update_stage(
    "calling_model",
    "调用模型生成脚本",
    58,
    {"model": client.config.model, "modelInputRole": video_input["model_input_role"]},
  )
  result = client.transcribe_video(
    video_input["video_url"],
    asset_context=_asset_context(
      job,
      input_role=input_role,
      input_object_key=input_object_key,
      model_input_role=str(video_input["model_input_role"]),
      model_input_object_key=str(video_input["model_input_object_key"]),
    ),
  )
  update_stage("parsing_result", "解析脚本结果", 80, {"responseId": result.response_id})
  if not result.script_text:
    raise RuntimeError("视频脚本结果缺少 script_text")
  if not result.srt_text:
    raise RuntimeError("视频脚本结果缺少可生成 SRT 的 segments")

  transcript_doc = {
    "provider": result.provider,
    "model": result.model,
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
    "language": result.language,
    "transcriptText": result.transcript_text,
    "scriptText": result.script_text,
    "srtText": result.srt_text,
    "segments": result.segments,
    "confidence": result.confidence,
    "usage": result.usage,
    "responseId": result.response_id,
  }
  transcript_bytes = json.dumps(transcript_doc, ensure_ascii=False, indent=2).encode("utf-8")
  transcript_sha256 = hashlib.sha256(transcript_bytes).hexdigest()
  transcript_key = build_object_key("transcript", str(job["asset_id"]), transcript_sha256, ".json")
  work_dir.mkdir(parents=True, exist_ok=True)
  transcript_path = work_dir / "transcript.json"
  transcript_path.write_bytes(transcript_bytes)
  update_stage("uploading_result", "上传脚本结果", 88, {"transcriptSizeBytes": len(transcript_bytes)})
  storage.upload_file(transcript_key, transcript_path, "application/json")

  update_stage("writing_result", "写回脚本结果", 95, {"transcriptObjectKey": transcript_key})
  with connect_pg() as conn:
    _complete_transcript_job(
      conn,
      job=job,
      transcript_key=transcript_key,
      transcript_size_bytes=len(transcript_bytes),
      transcript_sha256=transcript_sha256,
      result=result,
      input_role=input_role,
      input_object_key=input_object_key,
      model_input_role=str(video_input["model_input_role"]),
      model_input_object_key=str(video_input["model_input_object_key"]),
      input_strategy=str(video_input["strategy"]),
    )


def _stage_updater(job: dict[str, Any]) -> Callable[[str, str, int, dict[str, Any] | None], None]:
  def update(stage: str, label: str, progress_percent: int, extra: dict[str, Any] | None = None) -> None:
    with connect_pg() as conn:
      _update_processing_job_stage(conn, job["job_id"], stage, label, progress_percent, extra)

  return update


def _complete_transcript_job(
  conn: psycopg2.extensions.connection,
  *,
  job: dict[str, Any],
  transcript_key: str,
  transcript_size_bytes: int,
  transcript_sha256: str,
  result: TranscriptResult,
  input_role: str,
  input_object_key: str,
  model_input_role: str,
  model_input_object_key: str,
  input_strategy: str,
) -> None:
  asset_id = str(job["asset_id"])
  job_id = str(job["job_id"])
  object_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"content-asset-object:{asset_id}:transcript:{transcript_key}"))
  transcript_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"content-asset-transcript:{asset_id}:{transcript_key}"))
  metadata = {
    "provider": result.provider,
    "model": result.model,
    "response_id": result.response_id,
    "usage": result.usage,
    "request_settings": result.request_settings,
    "input_role": input_role,
    "input_object_key": input_object_key,
    "model_input_role": model_input_role,
    "model_input_object_key": model_input_object_key,
    "input_strategy": input_strategy,
    "processing_stage": "completed",
    "processing_stage_label": "已写回脚本结果",
    "processing_progress_percent": 100,
    "processing_stage_updated_at": datetime.now(timezone.utc).isoformat(),
  }
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_objects
      SET status = 'deleted'
      WHERE asset_id = %s
        AND object_role = 'transcript'
        AND object_key <> %s
        AND status = 'active'
      """,
      (asset_id, transcript_key),
    )
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
        %s, %s, 'transcript', 'tos', %s, %s,
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
        transcript_key,
        transcript_size_bytes,
        transcript_sha256,
        json.dumps(metadata, ensure_ascii=False),
      ),
    )
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_transcripts
      SET status = 'superseded',
          updated_at = CURRENT_TIMESTAMP
      WHERE asset_id = %s
        AND status = 'active'
        AND transcript_object_key <> %s
      """,
      (asset_id, transcript_key),
    )
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_transcripts (
        transcript_id,
        asset_id,
        source_object_key,
        transcript_object_key,
        provider,
        model,
        language,
        status,
        transcript_text,
        script_text,
        srt_text,
        segments,
        duration_seconds,
        word_count,
        confidence,
        metadata
      ) VALUES (
        %s, %s, %s, %s, %s, %s, %s, 'active',
        %s, %s, %s, %s::jsonb, %s, %s, %s, %s::jsonb
      )
      ON CONFLICT (transcript_id) DO UPDATE SET
        source_object_key = EXCLUDED.source_object_key,
        transcript_object_key = EXCLUDED.transcript_object_key,
        provider = EXCLUDED.provider,
        model = EXCLUDED.model,
        language = EXCLUDED.language,
        status = 'active',
        transcript_text = EXCLUDED.transcript_text,
        script_text = EXCLUDED.script_text,
        srt_text = EXCLUDED.srt_text,
        segments = EXCLUDED.segments,
        duration_seconds = EXCLUDED.duration_seconds,
        word_count = EXCLUDED.word_count,
        confidence = EXCLUDED.confidence,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
      """,
      (
        transcript_id,
        asset_id,
        input_object_key,
        transcript_key,
        result.provider,
        result.model,
        result.language,
        result.transcript_text,
        result.script_text,
        result.srt_text,
        json.dumps(result.segments, ensure_ascii=False),
        _decimal_or_none(job.get("duration_seconds")),
        word_count(result.script_text),
        result.confidence,
        json.dumps(metadata, ensure_ascii=False),
      ),
    )
    cur.execute(
      """
      UPDATE ads.marketing_content_assets
      SET transcript_object_key = %s,
          transcript_source = %s,
          transcript_model = %s,
          transcribed_at = CURRENT_TIMESTAMP,
          script_excerpt = %s
      WHERE asset_id = %s
        AND is_deleted = FALSE
      """,
      (transcript_key, input_role, result.model, transcript_excerpt(result.script_text), asset_id),
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
      (transcript_key, json.dumps(metadata, ensure_ascii=False), job_id),
    )
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
      VALUES (%s, 'transcript_completed', 'content-assets-worker', '已生成视频脚本与 SRT 字幕', %s::jsonb)
      """,
      (
        asset_id,
        json.dumps({
          "jobId": job_id,
          "transcriptObjectKey": transcript_key,
          "provider": result.provider,
          "model": result.model,
          "inputRole": input_role,
          "modelInputRole": model_input_role,
          "wordCount": word_count(result.script_text),
        }, ensure_ascii=False),
      ),
    )
  conn.commit()


def _fail_transcript_job(
  conn: psycopg2.extensions.connection,
  job: dict[str, Any],
  error_message: str,
) -> None:
  error_message = error_message[:1000]
  attempts = _int_job_value(job, "attempts", 0)
  max_attempts = _int_job_value(job, "max_attempts", 1)
  will_fail = attempts >= max_attempts
  error_info = _classify_processing_error(error_message)
  failure_metadata = {
    "processing_stage": "failed" if will_fail else "retry_queued",
    "processing_stage_label": error_info["label"] if will_fail else f"{error_info['label']}，等待重试",
    "processing_progress_percent": 0 if will_fail else 5,
    "processing_stage_updated_at": datetime.now(timezone.utc).isoformat(),
    "processing_error_category": error_info["category"],
    "processing_error_label": error_info["label"],
    "processing_error_helper": error_info["helper"],
  }
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_processing_jobs
      SET status = CASE
            WHEN attempts >= max_attempts THEN 'failed'
            ELSE 'queued'
          END,
          error_message = %s,
          finished_at = CASE
            WHEN attempts >= max_attempts THEN CURRENT_TIMESTAMP
            ELSE NULL
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
      WHERE job_id = %s
      """,
      (
        error_message,
        json.dumps(failure_metadata, ensure_ascii=False),
        str(job["job_id"]),
      ),
    )
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
      VALUES (%s, 'transcript_failed', 'content-assets-worker', '视频脚本/SRT 生成失败', %s::jsonb)
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


def _int_job_value(job: dict[str, Any], key: str, default: int) -> int:
  try:
    return int(job.get(key) or default)
  except (TypeError, ValueError):
    return default


def _asset_context(
  job: dict[str, Any],
  *,
  input_role: str,
  input_object_key: str,
  model_input_role: str,
  model_input_object_key: str,
) -> Dict[str, Any]:
  return _json_safe({
    "assetId": job.get("asset_id"),
    "title": job.get("title"),
    "platform": job.get("platform"),
    "productName": job.get("product_name"),
    "creatorName": job.get("creator_name"),
    "ownerName": job.get("owner_name"),
    "tags": job.get("tags") or [],
    "notes": job.get("notes"),
    "durationSeconds": job.get("duration_seconds"),
    "inputRole": input_role,
    "inputObjectKey": input_object_key,
    "modelInputRole": model_input_role,
    "modelInputObjectKey": model_input_object_key,
  })


def _normalize_transcript_source(source: str) -> TranscriptSource:
  normalized = (source or "auto").strip().lower()
  if normalized not in {"raw", "preview", "auto"}:
    raise ValueError("transcript source must be one of: raw, preview, auto")
  return cast(TranscriptSource, normalized)


def _transcript_source_from_job(job: dict[str, Any]) -> TranscriptSource:
  metadata = _job_metadata(job)
  source = str(metadata.get("transcript_source") or metadata.get("preferred_input") or "").strip().lower()
  if source in {"raw", "preview", "auto"}:
    return cast(TranscriptSource, source)
  input_object_key = str(job.get("input_object_key") or "")
  if input_object_key:
    if input_object_key == str(job.get("raw_object_key") or ""):
      return "raw"
    if input_object_key == str(job.get("preview_object_key") or ""):
      return "preview"
  return "auto"


def _resolve_transcript_input(row: dict[str, Any], source: TranscriptSource) -> tuple[str, InputRole]:
  raw_object_key = str(row.get("raw_object_key") or "").strip()
  preview_object_key = str(row.get("preview_object_key") or "").strip()
  if source == "raw":
    if not raw_object_key:
      raise RuntimeError(f"asset_id={row.get('asset_id')} 缺少 raw_object_key，无法生成脚本")
    return raw_object_key, "raw"
  if source == "preview":
    if not preview_object_key:
      raise RuntimeError(f"asset_id={row.get('asset_id')} 缺少 preview_object_key，无法生成脚本")
    return preview_object_key, "preview"
  if raw_object_key:
    return raw_object_key, "raw"
  if preview_object_key:
    return preview_object_key, "preview"
  raise RuntimeError(f"asset_id={row.get('asset_id')} 缺少可转写的视频对象")
