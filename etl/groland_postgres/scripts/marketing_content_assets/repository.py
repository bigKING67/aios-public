from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, Iterable, Iterator, Optional

import psycopg2
import psycopg2.extras

from .models import SourceCandidate, UploadedObjects, VideoProbe


def open_pg_connection(**options) -> psycopg2.extensions.connection:
  """Open one connection; its caller owns closing it. Options never include logged credentials."""
  dsn = (os.getenv("DATABASE_URL") or "").replace("postgresql+asyncpg://", "postgresql://")
  if dsn:
    return psycopg2.connect(dsn, **options)
  return psycopg2.connect(
      host=os.getenv("PGHOST", "127.0.0.1"),
      port=int(os.getenv("PGPORT", "5432")),
      user=os.getenv("PGUSER", "postgres"),
      password=os.getenv("PGPASSWORD", ""),
      dbname=os.getenv("PGDATABASE", "groland"),
      **options,
    )


@contextmanager
def connect_pg() -> Iterator[psycopg2.extensions.connection]:
  conn = open_pg_connection()
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
