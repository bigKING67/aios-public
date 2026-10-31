"""Processing batch lifecycle for content asset derivative jobs: claim, complete, fail.

Split from repository.py; asset, source and event writes stay there.
"""
from __future__ import annotations

from typing import Optional

import psycopg2
import psycopg2.extras

from .models import ProcessingBatch, ProcessingJob, VideoProbe
from .repository import _as_uuid, _insert_event, _upsert_asset_object
from .worker_runtime import classify_processing_error


def claim_next_processing_batch(
  conn: psycopg2.extensions.connection,
  claim_after: Optional[int] = None,
) -> Optional[ProcessingBatch]:
  """`claim_after` (seconds): only jobs queued at least that long (fallback instance)."""
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      WITH next_asset AS (
        SELECT asset_id
        FROM ads.marketing_content_asset_processing_jobs
        WHERE status = 'queued'
          AND attempts < max_attempts
          AND job_type IN ('preview', 'cover')
          AND (%s::INTEGER IS NULL OR queued_at < NOW() - make_interval(secs => %s::INTEGER))
        ORDER BY queued_at ASC, created_at ASC
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
            metadata = (
              COALESCE(metadata, '{}'::jsonb)
                - 'processing_error_category'
                - 'processing_error_label'
                - 'processing_error_helper'
            ) || jsonb_build_object(
              'processing_stage', 'claimed',
              'processing_stage_label', 'worker 已领取',
              'processing_progress_percent', 12,
              'processing_stage_updated_at', CURRENT_TIMESTAMP::TEXT
            )
        FROM next_asset
        WHERE job.asset_id = next_asset.asset_id
          AND job.status = 'queued'
          AND job.attempts < job.max_attempts
          AND job.job_type IN ('preview', 'cover')
        RETURNING
          job.job_id,
          job.asset_id,
          job.job_type,
          job.input_object_key,
          job.output_object_key,
          job.attempts,
          job.max_attempts
      )
      SELECT
        claimed.*,
        asset.bucket,
        asset.raw_object_key,
        asset.raw_sha256,
        asset.file_ext,
        asset.mime_type,
        asset.file_size_bytes
      FROM claimed
      JOIN ads.marketing_content_assets asset ON asset.asset_id = claimed.asset_id
      WHERE asset.is_deleted = FALSE
      ORDER BY claimed.job_type
      """,
      (claim_after, claim_after),
    )
    rows = cur.fetchall()
  conn.commit()
  if not rows:
    return None

  first = rows[0]
  jobs = [
    ProcessingJob(
      job_id=_as_uuid(row["job_id"]),
      asset_id=_as_uuid(row["asset_id"]),
      job_type=str(row["job_type"] or ""),
      input_object_key=str(row["input_object_key"] or first["raw_object_key"] or ""),
      output_object_key=str(row["output_object_key"] or ""),
      attempts=int(row["attempts"] or 0),
      max_attempts=int(row["max_attempts"] or 0),
    )
    for row in rows
  ]
  return ProcessingBatch(
    asset_id=_as_uuid(first["asset_id"]),
    bucket=str(first["bucket"] or "aios-content-assets"),
    raw_object_key=str(first["raw_object_key"] or ""),
    raw_sha256=str(first["raw_sha256"] or ""),
    file_ext=str(first["file_ext"] or ""),
    mime_type=str(first["mime_type"] or ""),
    file_size_bytes=first["file_size_bytes"],
    jobs=jobs,
  )


def complete_processing_batch(
  conn: psycopg2.extensions.connection,
  batch: ProcessingBatch,
  probe: VideoProbe,
  raw_sha256: str,
  raw_size_bytes: int,
  preview_object_key: Optional[str],
  preview_size_bytes: Optional[int],
  cover_object_key: Optional[str],
  cover_size_bytes: Optional[int],
) -> None:
  job_ids = [str(job.job_id) for job in batch.jobs]
  with conn.cursor() as cur:
    if preview_object_key:
      _upsert_asset_object(
        cur,
        batch.asset_id,
        "preview",
        batch.bucket,
        preview_object_key,
        "video/mp4",
        ".mp4",
        preview_size_bytes,
        "",
        probe,
      )
    if cover_object_key:
      _upsert_asset_object(
        cur,
        batch.asset_id,
        "cover",
        batch.bucket,
        cover_object_key,
        "image/webp",
        ".webp",
        cover_size_bytes,
        "",
        VideoProbe(),
      )
    cur.execute(
      """
      UPDATE ads.marketing_content_assets
      SET
        asset_status = CASE
          WHEN COALESCE(%s, preview_object_key) IS NOT NULL
           AND COALESCE(%s, cover_object_key) IS NOT NULL
            THEN 'ready'
          ELSE asset_status
        END,
        lifecycle_status = CASE
          WHEN COALESCE(%s, preview_object_key) IS NOT NULL
           AND COALESCE(%s, cover_object_key) IS NOT NULL
           AND lifecycle_status = 'draft'
            THEN 'waiting_analysis'
          ELSE lifecycle_status
        END,
        preview_object_key = COALESCE(%s, preview_object_key),
        cover_object_key = COALESCE(%s, cover_object_key),
        raw_sha256 = COALESCE(NULLIF(raw_sha256, ''), NULLIF(%s, '')),
        duration_seconds = COALESCE(%s, duration_seconds),
        width = COALESCE(%s, width),
        height = COALESCE(%s, height),
        file_size_bytes = COALESCE(%s, file_size_bytes),
        preview_size_bytes = COALESCE(%s, preview_size_bytes),
        uploaded_at = COALESCE(uploaded_at, CURRENT_TIMESTAMP)
      WHERE asset_id = %s
        AND is_deleted = FALSE
      """,
      (
        preview_object_key,
        cover_object_key,
        preview_object_key,
        cover_object_key,
        preview_object_key,
        cover_object_key,
        raw_sha256,
        probe.duration_seconds,
        probe.width,
        probe.height,
        raw_size_bytes,
        preview_size_bytes,
        str(batch.asset_id),
      ),
    )
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_processing_jobs
      SET status = 'succeeded',
          output_object_key = CASE
            WHEN job_type = 'preview' THEN COALESCE(%s, output_object_key)
            WHEN job_type = 'cover' THEN COALESCE(%s, output_object_key)
            ELSE output_object_key
          END,
          finished_at = CURRENT_TIMESTAMP,
          error_message = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'processing_stage', 'completed',
            'processing_stage_label', '已完成',
            'processing_progress_percent', 100,
            'processing_stage_updated_at', CURRENT_TIMESTAMP::TEXT
          )
      WHERE job_id = ANY(%s::uuid[])
      """,
      (preview_object_key, cover_object_key, job_ids),
    )
    _insert_event(cur, batch.asset_id, "processing_completed", "已生成 preview / cover 衍生素材", {
      "previewObjectKey": preview_object_key,
      "coverObjectKey": cover_object_key,
      "jobIds": job_ids,
    })
  conn.commit()


def fail_processing_batch(
  conn: psycopg2.extensions.connection,
  batch: ProcessingBatch,
  error_message: str,
) -> None:
  job_ids = [str(job.job_id) for job in batch.jobs]
  error_message = error_message[:1000]
  error_info = classify_processing_error(error_message)
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
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'processing_stage', CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
            'processing_stage_label', CASE WHEN attempts >= max_attempts THEN '处理失败' ELSE '等待重试' END,
            'processing_progress_percent', CASE WHEN attempts >= max_attempts THEN 0 ELSE 5 END,
            'processing_stage_updated_at', CURRENT_TIMESTAMP::TEXT,
            'processing_error_category', %s,
            'processing_error_label', %s,
            'processing_error_helper', %s
          )
      WHERE job_id = ANY(%s::uuid[])
      """,
      (
        error_message,
        error_info["category"],
        error_info["label"],
        error_info["helper"],
        job_ids,
      ),
    )
    cur.execute(
      """
      UPDATE ads.marketing_content_assets
      SET asset_status = 'failed'
      WHERE asset_id = %s
        AND is_deleted = FALSE
        AND EXISTS (
          SELECT 1
          FROM ads.marketing_content_asset_processing_jobs job
          WHERE job.asset_id = ads.marketing_content_assets.asset_id
            AND job.status = 'failed'
        )
      """,
      (str(batch.asset_id),),
    )
    _insert_event(cur, batch.asset_id, "processing_failed", "视频衍生素材处理失败", {
      "error": error_message,
      "jobIds": job_ids,
    })
  conn.commit()
