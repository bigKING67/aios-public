from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, Iterable, Iterator, Optional

import psycopg2
import psycopg2.extras

from .models import ProcessingBatch, ProcessingJob, SourceCandidate, UploadedObjects, VideoProbe
from .worker_runtime import classify_processing_error


@contextmanager
def connect_pg() -> Iterator[psycopg2.extensions.connection]:
  dsn = (os.getenv("DATABASE_URL") or "").replace("postgresql+asyncpg://", "postgresql://")
  if dsn:
    conn = psycopg2.connect(dsn)
  else:
    conn = psycopg2.connect(
      host=os.getenv("PGHOST", "127.0.0.1"),
      port=int(os.getenv("PGPORT", "5432")),
      user=os.getenv("PGUSER", "postgres"),
      password=os.getenv("PGPASSWORD", ""),
      dbname=os.getenv("PGDATABASE", "groland"),
    )
  try:
    yield conn
  finally:
    conn.close()


def _as_uuid(value: Any) -> uuid.UUID:
  if isinstance(value, uuid.UUID):
    return value
  return uuid.UUID(str(value))


def create_import_run(
  conn: psycopg2.extensions.connection,
  run_id: uuid.UUID,
  mode: str,
  source_url: str,
  spreadsheet_token: str,
  sheet_ids: Iterable[str],
  requested_by: str = "content-assets-worker",
) -> None:
  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_import_runs (
        run_id, mode, status, source_url, spreadsheet_token, sheet_ids, requested_by, started_at
      ) VALUES (%s, %s, 'running', %s, %s, %s, %s, CURRENT_TIMESTAMP)
      ON CONFLICT (run_id) DO UPDATE SET
        mode = EXCLUDED.mode,
        status = EXCLUDED.status,
        source_url = EXCLUDED.source_url,
        spreadsheet_token = EXCLUDED.spreadsheet_token,
        sheet_ids = EXCLUDED.sheet_ids,
        requested_by = EXCLUDED.requested_by,
        started_at = EXCLUDED.started_at
      """,
      (str(run_id), mode, source_url, spreadsheet_token, list(sheet_ids), requested_by),
    )
  conn.commit()


def finish_import_run(
  conn: psycopg2.extensions.connection,
  run_id: uuid.UUID,
  status: str,
  stats_payload: Dict[str, Any],
  error_message: str = "",
) -> None:
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_import_runs
      SET status = %s,
          dry_run_payload = %s::jsonb,
          total_rows = %s,
          attachment_count = %s,
          uploaded_count = %s,
          external_only_count = %s,
          skipped_count = %s,
          failed_count = %s,
          error_message = NULLIF(%s, ''),
          finished_at = CURRENT_TIMESTAMP
      WHERE run_id = %s
      """,
      (
        status,
        json.dumps(stats_payload, ensure_ascii=False),
        int(stats_payload.get("totalRows", 0)),
        int(stats_payload.get("attachmentCount", 0)),
        int(stats_payload.get("uploadedCount", 0)),
        int(stats_payload.get("externalOnlyCount", 0)),
        int(stats_payload.get("skippedCount", 0)),
        int(stats_payload.get("failedCount", 0)),
        error_message,
        str(run_id),
      ),
    )
  conn.commit()


def claim_next_processing_batch(
  conn: psycopg2.extensions.connection,
) -> Optional[ProcessingBatch]:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      WITH next_asset AS (
        SELECT asset_id
        FROM ads.marketing_content_asset_processing_jobs
        WHERE status = 'queued'
          AND attempts < max_attempts
          AND job_type IN ('preview', 'cover')
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
      """
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
    bucket=str(first["bucket"] or "content-video-prod"),
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


def is_candidate_recorded(
  conn: psycopg2.extensions.connection,
  candidate: SourceCandidate,
  require_derivatives: bool = False,
) -> bool:
  with conn.cursor() as cur:
    if candidate.attachment:
      cur.execute(
        """
        SELECT a.raw_object_key, a.preview_object_key, a.cover_object_key
        FROM ads.marketing_content_asset_sources s
        JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id
        WHERE s.source_kind = 'feishu_attachment'
          AND s.feishu_file_token = %s
          AND s.feishu_sheet_id = %s
          AND s.feishu_row_index = %s
          AND s.external_status = 'ingested'
          AND a.is_deleted = FALSE
        LIMIT 1
        """,
        (candidate.attachment.file_token, candidate.sheet_id, candidate.row_index),
      )
      row = cur.fetchone()
      if not row:
        return False
      raw_key, preview_key, cover_key = row
      if require_derivatives:
        return bool(raw_key and preview_key and cover_key)
      return bool(raw_key)
    else:
      cur.execute(
        """
        SELECT 1
        FROM ads.marketing_content_asset_sources
        WHERE source_kind = %s
          AND feishu_sheet_id = %s
          AND feishu_row_index = %s
          AND source_url = %s
        LIMIT 1
        """,
        (
          candidate.source_kind,
          candidate.sheet_id,
          candidate.row_index,
          candidate.external_url or candidate.source_url,
        ),
      )
      return cur.fetchone() is not None


def upsert_external_asset(
  conn: psycopg2.extensions.connection,
  candidate: SourceCandidate,
) -> uuid.UUID:
  asset_id = candidate.make_asset_id()
  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO ads.marketing_content_assets AS current_asset (
        asset_id, title, title_source, asset_type, asset_status, profile_status, lifecycle_status, source_type, source_platform,
        source_url, source_record_id, source_sheet_id, source_sheet_name, source_row_index,
        external_only, platform, product_name, creator_name, owner_name, tags, tags_source, notes
      ) VALUES (
        %s, %s, %s, 'video', 'external_only', 'incomplete', 'draft', 'feishu_bootstrap', %s,
        %s, %s, %s, %s, %s,
        TRUE, NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), %s, %s, NULLIF(%s, '')
      )
      ON CONFLICT (asset_id) DO UPDATE SET
        title = CASE WHEN current_asset.title_source = 'manual' THEN current_asset.title ELSE EXCLUDED.title END,
        title_source = CASE WHEN current_asset.title_source = 'manual' THEN current_asset.title_source ELSE EXCLUDED.title_source END,
        source_url = EXCLUDED.source_url,
        source_record_id = EXCLUDED.source_record_id,
        source_sheet_id = EXCLUDED.source_sheet_id,
        source_sheet_name = EXCLUDED.source_sheet_name,
        source_row_index = EXCLUDED.source_row_index,
        platform = EXCLUDED.platform,
        product_name = EXCLUDED.product_name,
        creator_name = EXCLUDED.creator_name,
        owner_name = EXCLUDED.owner_name,
        tags = CASE WHEN current_asset.tags_source = 'manual' THEN current_asset.tags ELSE EXCLUDED.tags END,
        tags_source = CASE WHEN current_asset.tags_source = 'manual' THEN current_asset.tags_source ELSE EXCLUDED.tags_source END,
        notes = EXCLUDED.notes,
        external_only = TRUE,
        asset_status = 'external_only'
      """,
      (
        str(asset_id),
        candidate.title,
        candidate.title_source,
        candidate.external_platform,
        candidate.external_url or candidate.source_url,
        candidate.source_record_id,
        candidate.sheet_id,
        candidate.sheet_name,
        candidate.row_index,
        candidate.platform,
        candidate.product_name,
        candidate.creator_name,
        candidate.owner_name,
        candidate.tags,
        candidate.tags_source,
        candidate.notes,
      ),
    )
    _insert_source(cur, asset_id, candidate, external_status="pending_manual_upload")
    _insert_event(cur, asset_id, "external_source_recorded", "记录外部素材链接，等待人工补传", {
      "sourceKind": candidate.source_kind,
      "externalUrl": candidate.external_url,
    })
  conn.commit()
  return asset_id


def upsert_uploaded_asset(
  conn: psycopg2.extensions.connection,
  candidate: SourceCandidate,
  objects: UploadedObjects,
  probe: VideoProbe,
) -> uuid.UUID:
  asset_id = candidate.make_asset_id(objects.raw_sha256)
  asset_status = "ready" if objects.preview_object_key and objects.cover_object_key else "pending_processing"
  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO ads.marketing_content_assets AS current_asset (
        asset_id, title, title_source, asset_type, asset_status, profile_status, lifecycle_status, source_type, source_platform,
        source_url, source_record_id, source_sheet_id, source_sheet_name, source_row_index,
        external_only, bucket, raw_object_key, preview_object_key, cover_object_key,
        raw_sha256, file_ext, mime_type, duration_seconds, width, height,
        file_size_bytes, preview_size_bytes, platform, product_name, creator_name,
        owner_name, tags, tags_source, notes, uploaded_by, uploaded_at
      ) VALUES (
        %s, %s, %s, 'video', %s, 'basic_complete', 'waiting_analysis', 'feishu_bootstrap', 'feishu',
        %s, %s, %s, %s, %s,
        FALSE, %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s,
        %s, %s, NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''),
        NULLIF(%s, ''), %s, %s, NULLIF(%s, ''), 'content-assets-worker', CURRENT_TIMESTAMP
      )
      ON CONFLICT (asset_id) DO UPDATE SET
        title = CASE WHEN current_asset.title_source = 'manual' THEN current_asset.title ELSE EXCLUDED.title END,
        title_source = CASE WHEN current_asset.title_source = 'manual' THEN current_asset.title_source ELSE EXCLUDED.title_source END,
        asset_status = EXCLUDED.asset_status,
        lifecycle_status = EXCLUDED.lifecycle_status,
        bucket = EXCLUDED.bucket,
        raw_object_key = EXCLUDED.raw_object_key,
        preview_object_key = EXCLUDED.preview_object_key,
        cover_object_key = EXCLUDED.cover_object_key,
        raw_sha256 = EXCLUDED.raw_sha256,
        file_ext = EXCLUDED.file_ext,
        mime_type = EXCLUDED.mime_type,
        duration_seconds = EXCLUDED.duration_seconds,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        file_size_bytes = EXCLUDED.file_size_bytes,
        preview_size_bytes = EXCLUDED.preview_size_bytes,
        platform = EXCLUDED.platform,
        product_name = EXCLUDED.product_name,
        creator_name = EXCLUDED.creator_name,
        owner_name = EXCLUDED.owner_name,
        tags = CASE WHEN current_asset.tags_source = 'manual' THEN current_asset.tags ELSE EXCLUDED.tags END,
        tags_source = CASE WHEN current_asset.tags_source = 'manual' THEN current_asset.tags_source ELSE EXCLUDED.tags_source END,
        notes = EXCLUDED.notes,
        external_only = FALSE,
        uploaded_at = CURRENT_TIMESTAMP
      """,
      (
        str(asset_id),
        candidate.title,
        candidate.title_source,
        asset_status,
        candidate.source_url,
        candidate.source_record_id,
        candidate.sheet_id,
        candidate.sheet_name,
        candidate.row_index,
        objects.bucket,
        objects.raw_object_key,
        objects.preview_object_key,
        objects.cover_object_key,
        objects.raw_sha256,
        objects.file_ext,
        objects.mime_type,
        probe.duration_seconds,
        probe.width,
        probe.height,
        objects.file_size_bytes,
        objects.preview_size_bytes,
        candidate.platform,
        candidate.product_name,
        candidate.creator_name,
        candidate.owner_name,
        candidate.tags,
        candidate.tags_source,
        candidate.notes,
      ),
    )
    _upsert_asset_object(
      cur,
      asset_id,
      "raw",
      objects.bucket,
      objects.raw_object_key,
      objects.mime_type,
      objects.file_ext,
      objects.file_size_bytes,
      objects.raw_sha256,
      probe,
    )
    if objects.preview_object_key:
      _upsert_asset_object(
        cur,
        asset_id,
        "preview",
        objects.bucket,
        objects.preview_object_key,
        "video/mp4",
        ".mp4",
        objects.preview_size_bytes,
        "",
        probe,
      )
    if objects.cover_object_key:
      _upsert_asset_object(
        cur,
        asset_id,
        "cover",
        objects.bucket,
        objects.cover_object_key,
        "image/webp",
        ".webp",
        None,
        "",
        VideoProbe(),
      )
    _insert_source(cur, asset_id, candidate, external_status="ingested")
    message = "飞书视频附件已上传到 TOS 并生成预览资产" if asset_status == "ready" else "飞书视频附件原片已上传到 TOS，等待后台生成预览资产"
    _insert_event(cur, asset_id, "asset_ingested", message, {
      "bucket": objects.bucket,
      "rawObjectKey": objects.raw_object_key,
      "previewObjectKey": objects.preview_object_key,
      "coverObjectKey": objects.cover_object_key,
    })
  conn.commit()
  return asset_id


def _upsert_asset_object(
  cur: psycopg2.extensions.cursor,
  asset_id: uuid.UUID,
  object_role: str,
  bucket: str,
  object_key: str,
  content_type: str,
  file_ext: str,
  size_bytes: Optional[int],
  sha256: str,
  probe: VideoProbe,
) -> None:
  object_id = uuid.uuid5(uuid.NAMESPACE_URL, f"content-asset-object:{asset_id}:{object_role}:{object_key}")
  cur.execute(
    """
    UPDATE ads.marketing_content_asset_objects
    SET status = 'deleted'
    WHERE asset_id = %s
      AND object_role = %s
      AND object_key <> %s
      AND status = 'active'
    """,
    (str(asset_id), object_role, object_key),
  )
  cur.execute(
    """
    INSERT INTO ads.marketing_content_asset_objects (
      object_id, asset_id, object_role, storage_provider, bucket, object_key,
      content_type, file_ext, size_bytes, sha256, width, height, duration_seconds, status
    ) VALUES (
      %s, %s, %s, 'tos', %s, %s,
      NULLIF(%s, ''), NULLIF(%s, ''), %s, NULLIF(%s, ''), %s, %s, %s, 'active'
    )
    ON CONFLICT (object_id) DO UPDATE SET
      bucket = EXCLUDED.bucket,
      object_key = EXCLUDED.object_key,
      content_type = EXCLUDED.content_type,
      file_ext = EXCLUDED.file_ext,
      size_bytes = EXCLUDED.size_bytes,
      sha256 = EXCLUDED.sha256,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      duration_seconds = EXCLUDED.duration_seconds,
      status = 'active'
    """,
    (
      str(object_id),
      str(asset_id),
      object_role,
      bucket,
      object_key,
      content_type,
      file_ext,
      size_bytes,
      sha256,
      probe.width,
      probe.height,
      probe.duration_seconds,
    ),
  )


def _insert_source(
  cur: psycopg2.extensions.cursor,
  asset_id: uuid.UUID,
  candidate: SourceCandidate,
  external_status: str,
) -> None:
  attachment = candidate.attachment
  if attachment:
    cur.execute(
      """
      SELECT source_id
      FROM ads.marketing_content_asset_sources
      WHERE source_kind = 'feishu_attachment'
        AND feishu_file_token = %s
        AND feishu_sheet_id = %s
        AND feishu_row_index = %s
      ORDER BY source_id
      LIMIT 1
      """,
      (attachment.file_token, candidate.sheet_id, candidate.row_index),
    )
  else:
    cur.execute(
      """
      SELECT source_id
      FROM ads.marketing_content_asset_sources
      WHERE source_kind = %s
        AND feishu_sheet_id = %s
        AND feishu_row_index = %s
        AND source_url = %s
      ORDER BY source_id
      LIMIT 1
      """,
      (
        candidate.source_kind,
        candidate.sheet_id,
        candidate.row_index,
        candidate.external_url or candidate.source_url,
      ),
    )
  existing = cur.fetchone()
  if existing:
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_sources
      SET asset_id = %s,
          source_title = %s,
          external_status = %s,
          metadata = %s::jsonb
      WHERE source_id = %s
      """,
      (
        str(asset_id),
        candidate.title,
        external_status,
        json.dumps({
          "attachment": attachment.raw if attachment else None,
          "title_source": candidate.title_source,
          "tags_source": candidate.tags_source,
        }, ensure_ascii=False),
        existing[0],
      ),
    )
    return

  cur.execute(
    """
    INSERT INTO ads.marketing_content_asset_sources (
      asset_id, source_kind, source_url, source_title, feishu_file_token,
      feishu_spreadsheet_token, feishu_sheet_id, feishu_sheet_name, feishu_row_index,
      feishu_cell_ref, external_platform, external_status, metadata
    ) VALUES (
      %s, %s, %s, %s, %s,
      NULL, %s, %s, %s,
      %s, %s, %s, %s::jsonb
    )
    """,
    (
      str(asset_id),
      candidate.source_kind,
      candidate.external_url or candidate.source_url,
      candidate.title,
      attachment.file_token if attachment else None,
      candidate.sheet_id,
      candidate.sheet_name,
      candidate.row_index,
      attachment.cell_ref if attachment else None,
      candidate.external_platform or "feishu",
      external_status,
      json.dumps({
        "attachment": attachment.raw if attachment else None,
        "title_source": candidate.title_source,
        "tags_source": candidate.tags_source,
      }, ensure_ascii=False),
    ),
  )


def _insert_event(
  cur: psycopg2.extensions.cursor,
  asset_id: uuid.UUID,
  event_type: str,
  message: str,
  payload: Dict[str, Any],
) -> None:
  cur.execute(
    """
    INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
    VALUES (%s, %s, 'content-assets-worker', %s, %s::jsonb)
    """,
    (str(asset_id), event_type, message, json.dumps(payload, ensure_ascii=False)),
  )
