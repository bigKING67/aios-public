from __future__ import annotations

import calendar
import hashlib
import json
import os
import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Mapping

import psycopg2
import psycopg2.extras

from .models import VideoProbe
from .yuntu_archive_models import (
  ARCHIVE_ACTOR,
  ARCHIVE_EXTERNAL_PLATFORM,
  ARCHIVE_SOURCE_KIND,
  YuntuArchiveRecord,
  stable_uuid,
)


@dataclass(frozen=True)
class ArchiveUpsertResult:
  archive_id: uuid.UUID
  archive_status: str
  asset_id: uuid.UUID | None = None


@dataclass(frozen=True)
class ClaimRecord:
  archive_id: uuid.UUID
  source_system: str
  source_task_name: str
  date_label: str
  source_rank: int
  source_page_number: int | None
  source_item_index: int | None
  source_page_url: str
  source_video_id: str
  source_material_id: str
  aweme_id: str
  item_id: str
  group_id: str
  video_title: str
  cdn_url: str
  cdn_evidence: dict[str, Any]
  row_payload: dict[str, Any]
  attempts: int

  @classmethod
  def from_row(cls, row: Mapping[str, Any]) -> "ClaimRecord":
    return cls(
      archive_id=uuid.UUID(str(row["archive_id"])),
      source_system=str(row.get("source_system") or ""),
      source_task_name=str(row.get("source_task_name") or ""),
      date_label=str(row.get("date_label") or ""),
      source_rank=int(row.get("source_rank") or 0),
      source_page_number=row.get("source_page_number"),
      source_item_index=row.get("source_item_index"),
      source_page_url=str(row.get("source_page_url") or ""),
      source_video_id=str(row.get("source_video_id") or ""),
      source_material_id=str(row.get("source_material_id") or ""),
      aweme_id=str(row.get("aweme_id") or ""),
      item_id=str(row.get("item_id") or ""),
      group_id=str(row.get("group_id") or ""),
      video_title=str(row.get("video_title") or ""),
      cdn_url=str(row.get("cdn_url") or ""),
      cdn_evidence=dict(row.get("cdn_evidence") or {}),
      row_payload=dict(row.get("row_payload") or {}),
      attempts=int(row.get("attempts") or 0),
    )

  @property
  def source_record_key(self) -> str:
    return f"{self.source_system}:{self.source_task_name}:{self.date_label}:{self.source_rank}"

  @property
  def external_url(self) -> str:
    identifier = self.aweme_id or self.item_id
    return f"https://www.douyin.com/video/{identifier}" if identifier else ""


YUNTU_BRAND_SCOPE_NAME = "个护清洁（日化）8品牌"
YUNTU_BRAND_SCOPE_LABEL = "卡诗|欧莱雅PRO|韩束|OKCS|EHD|Spes|馥绿德雅|Off&relax"
YUNTU_BRAND_SCOPE_HASH = hashlib.sha256(YUNTU_BRAND_SCOPE_LABEL.encode("utf-8")).hexdigest()[:24]


def _clean_text(value: Any) -> str:
  return " ".join(str(value or "").split()).strip()


def _row_text(row_payload: Mapping[str, Any], *keys: str) -> str:
  for key in keys:
    value = _clean_text(row_payload.get(key))
    if value:
      return value
  return ""


def _month_bounds(date_label: str) -> tuple[date, date]:
  parts = _clean_text(date_label).split("-")
  if len(parts) < 2:
    raise ValueError(f"date_label must be YYYY-MM, got {date_label!r}")
  year = int(parts[0])
  month = int(parts[1])
  last_day = calendar.monthrange(year, month)[1]
  return date(year, month, 1), date(year, month, last_day)


def _parse_rate(value: Any) -> Decimal | None:
  text = _clean_text(value).replace(",", "")
  if not text:
    return None
  is_percent = text.endswith("%")
  if is_percent:
    text = text[:-1].strip()
  try:
    number = Decimal(text)
  except (InvalidOperation, ValueError):
    return None
  if is_percent:
    return number / Decimal("100")
  return number


def _classify_video_type(source_task_name: str, row_payload: Mapping[str, Any]) -> tuple[str, str, str, str]:
  haystack = " ".join([
    _clean_text(source_task_name),
    _row_text(row_payload, "任务"),
  ])
  if "直播引流" in haystack or "引流短视频" in haystack or "live_lead" in haystack:
    return ("qianchuan_live", "千川直播", "live_lead_short_video", "直播引流短视频")
  if "带货" in haystack or "短视频图文" in haystack or "goods_video" in haystack:
    return ("qianchuan_short_video", "千川短视频", "goods_short_video", "带货短视频")
  return ("unknown", "未知", "unknown", "未知")


def _business_record_id(record_key: str) -> uuid.UUID:
  return stable_uuid(f"qianchuan-short-video-material:{record_key}")


def _douyin_video_url(aweme_id: str, item_id: str) -> str:
  identifier = _clean_text(aweme_id or item_id)
  return f"https://www.douyin.com/video/{identifier}" if identifier else ""


def _tos_env(name: str, default: str = "") -> str:
  return _clean_text(os.getenv(name) or default)


def _probe_payload(probe: VideoProbe) -> dict[str, Any]:
  return {
    "durationSeconds": probe.duration_seconds,
    "width": probe.width,
    "height": probe.height,
  }


def _upsert_qianchuan_short_video_row(
  cur: psycopg2.extensions.cursor,
  record: YuntuArchiveRecord,
  *,
  archive_id: uuid.UUID,
  archive_status: str,
  asset_id: uuid.UUID | None = None,
) -> None:
  row_payload = record.row_payload
  stat_month, date_end = _month_bounds(record.date_label)
  qianchuan_scene, qianchuan_scene_name, video_type, video_type_name = _classify_video_type(
    record.source_task_name,
    row_payload,
  )
  raw_completion_rate = _row_text(row_payload, "完播率")
  raw_ctr = _row_text(row_payload, "CTR")
  raw_cvr = _row_text(row_payload, "CVR")
  raw_3s_rate = _row_text(row_payload, "3S播放率", "3S完播率", "3秒播放率", "3秒完播率")
  raw_5s_rate = _row_text(row_payload, "5S播放率", "5S完播率", "5秒播放率", "5秒完播率")
  raw_interaction_rate = _row_text(row_payload, "互动率")
  raw_pvr = _row_text(row_payload, "PVR")
  cur.execute(
    """
    INSERT INTO ods.douyin_qianchuan_industry_brand_short_video_material_raw AS current_record (
      record_id, archive_id, source_system, source_task_name, scrape_run_id,
      date_label, stat_month, date_start, date_end, industry_name,
      brand_scope_name, brand_scope_hash, qianchuan_scene, qianchuan_scene_name,
      video_type, video_type_name, source_rank, source_page_number, source_item_index,
      source_page_url, video_title, related_product, core_audience, marketing_selling_point,
      first_publish_date_text, raw_exposure_count, raw_completion_rate, raw_ctr,
      raw_cvr, raw_3s_completion_rate, raw_5s_completion_rate, raw_interaction_rate,
      raw_pvr, completion_rate, ctr, cvr, play_3s_rate, play_5s_rate,
      interaction_rate, pvr, source_video_id, source_material_id, aweme_id,
      item_id, group_id, douyin_video_url, cdn_url, cdn_status, cdn_missing_reason,
      batch_id, mapping_confidence, archive_status, asset_id, row_payload,
      cdn_evidence, request_payload
    ) VALUES (
      %s, %s, %s, %s, NULLIF(%s, ''),
      %s, %s, %s, %s, %s,
      %s, %s, %s, %s,
      %s, %s, %s, %s, %s,
      NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''),
      NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''),
      NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''),
      NULLIF(%s, ''), %s, %s, %s, %s, %s,
      %s, %s, NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''),
      NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''),
      NULLIF(%s, ''), NULLIF(%s, ''), %s, %s, %s::jsonb,
      %s::jsonb, %s::jsonb
    )
    ON CONFLICT (record_id) DO UPDATE SET
      archive_id = EXCLUDED.archive_id,
      scrape_run_id = COALESCE(EXCLUDED.scrape_run_id, current_record.scrape_run_id),
      date_label = EXCLUDED.date_label,
      stat_month = EXCLUDED.stat_month,
      date_start = EXCLUDED.date_start,
      date_end = EXCLUDED.date_end,
      industry_name = EXCLUDED.industry_name,
      brand_scope_name = EXCLUDED.brand_scope_name,
      brand_scope_hash = EXCLUDED.brand_scope_hash,
      qianchuan_scene = EXCLUDED.qianchuan_scene,
      qianchuan_scene_name = EXCLUDED.qianchuan_scene_name,
      video_type = EXCLUDED.video_type,
      video_type_name = EXCLUDED.video_type_name,
      source_page_number = EXCLUDED.source_page_number,
      source_item_index = EXCLUDED.source_item_index,
      source_page_url = EXCLUDED.source_page_url,
      video_title = EXCLUDED.video_title,
      related_product = EXCLUDED.related_product,
      core_audience = EXCLUDED.core_audience,
      marketing_selling_point = EXCLUDED.marketing_selling_point,
      first_publish_date_text = EXCLUDED.first_publish_date_text,
      raw_exposure_count = EXCLUDED.raw_exposure_count,
      raw_completion_rate = EXCLUDED.raw_completion_rate,
      raw_ctr = EXCLUDED.raw_ctr,
      raw_cvr = EXCLUDED.raw_cvr,
      raw_3s_completion_rate = EXCLUDED.raw_3s_completion_rate,
      raw_5s_completion_rate = EXCLUDED.raw_5s_completion_rate,
      raw_interaction_rate = EXCLUDED.raw_interaction_rate,
      raw_pvr = EXCLUDED.raw_pvr,
      completion_rate = EXCLUDED.completion_rate,
      ctr = EXCLUDED.ctr,
      cvr = EXCLUDED.cvr,
      play_3s_rate = EXCLUDED.play_3s_rate,
      play_5s_rate = EXCLUDED.play_5s_rate,
      interaction_rate = EXCLUDED.interaction_rate,
      pvr = EXCLUDED.pvr,
      source_video_id = EXCLUDED.source_video_id,
      source_material_id = EXCLUDED.source_material_id,
      aweme_id = EXCLUDED.aweme_id,
      item_id = EXCLUDED.item_id,
      group_id = EXCLUDED.group_id,
      douyin_video_url = EXCLUDED.douyin_video_url,
      cdn_url = EXCLUDED.cdn_url,
      cdn_status = EXCLUDED.cdn_status,
      cdn_missing_reason = EXCLUDED.cdn_missing_reason,
      batch_id = EXCLUDED.batch_id,
      mapping_confidence = EXCLUDED.mapping_confidence,
      archive_status = CASE
        WHEN current_record.archive_status = 'succeeded' THEN current_record.archive_status
        ELSE EXCLUDED.archive_status
      END,
      asset_id = COALESCE(current_record.asset_id, EXCLUDED.asset_id),
      row_payload = EXCLUDED.row_payload,
      cdn_evidence = EXCLUDED.cdn_evidence,
      request_payload = EXCLUDED.request_payload
    """,
    (
      str(_business_record_id(record.source_record_key)),
      str(archive_id),
      record.source_system,
      record.source_task_name,
      _row_text(record.request_payload, "scrapeRunId", "runId"),
      record.date_label,
      stat_month,
      stat_month,
      date_end,
      "个护清洁（日化）",
      YUNTU_BRAND_SCOPE_NAME,
      YUNTU_BRAND_SCOPE_HASH,
      qianchuan_scene,
      qianchuan_scene_name,
      video_type,
      video_type_name,
      record.source_rank,
      record.source_page_number,
      record.source_item_index,
      record.source_page_url,
      record.video_title,
      _row_text(row_payload, "关联商品"),
      _row_text(row_payload, "核心人群"),
      _row_text(row_payload, "营销卖点"),
      _row_text(row_payload, "首投日期"),
      _row_text(row_payload, "曝光量"),
      raw_completion_rate,
      raw_ctr,
      raw_cvr,
      raw_3s_rate,
      raw_5s_rate,
      raw_interaction_rate,
      raw_pvr,
      _parse_rate(raw_completion_rate),
      _parse_rate(raw_ctr),
      _parse_rate(raw_cvr),
      _parse_rate(raw_3s_rate),
      _parse_rate(raw_5s_rate),
      _parse_rate(raw_interaction_rate),
      _parse_rate(raw_pvr),
      record.source_video_id,
      record.source_material_id,
      record.aweme_id,
      record.item_id,
      record.group_id,
      _douyin_video_url(record.aweme_id, record.item_id),
      record.cdn_url,
      record.cdn_status,
      record.cdn_missing_reason,
      record.batch_id,
      record.mapping_confidence,
      archive_status,
      str(asset_id) if asset_id else None,
      json.dumps(record.row_payload, ensure_ascii=False),
      json.dumps(record.cdn_evidence, ensure_ascii=False),
      json.dumps(record.request_payload, ensure_ascii=False),
    ),
  )


def _update_qianchuan_short_video_archive_success(
  cur: psycopg2.extensions.cursor,
  claim: ClaimRecord,
  *,
  asset_id: uuid.UUID,
  bucket: str,
  raw_object_key: str,
  raw_sha256: str,
  file_ext: str,
  mime_type: str,
  file_size_bytes: int,
  probe: VideoProbe,
) -> None:
  cur.execute(
    """
    UPDATE ods.douyin_qianchuan_industry_brand_short_video_material_raw
    SET archive_status = 'succeeded',
        archive_error = NULL,
        asset_id = %s,
        tos_bucket = %s,
        tos_object_key = %s,
        tos_region = NULLIF(%s, ''),
        tos_endpoint = NULLIF(%s, ''),
        raw_sha256 = %s,
        file_ext = %s,
        mime_type = %s,
        file_size_bytes = %s,
        duration_seconds = %s,
        width = %s,
        height = %s,
        ffprobe_payload = %s::jsonb,
        archived_at = CURRENT_TIMESTAMP,
        failed_at = NULL
    WHERE archive_id = %s
    """,
    (
      str(asset_id),
      bucket,
      raw_object_key,
      _tos_env("TOS_REGION", "cn-shanghai"),
      _tos_env("TOS_ENDPOINT", "https://tos-s3-cn-shanghai.volces.com"),
      raw_sha256,
      file_ext,
      mime_type,
      file_size_bytes,
      probe.duration_seconds,
      probe.width,
      probe.height,
      json.dumps(_probe_payload(probe), ensure_ascii=False),
      str(claim.archive_id),
    ),
  )


def _update_qianchuan_short_video_archive_failed(
  cur: psycopg2.extensions.cursor,
  archive_id: uuid.UUID,
  error_message: str,
) -> None:
  cur.execute(
    """
    UPDATE ods.douyin_qianchuan_industry_brand_short_video_material_raw
    SET archive_status = 'failed',
        archive_error = %s,
        failed_at = CURRENT_TIMESTAMP
    WHERE archive_id = %s
      AND archive_status <> 'succeeded'
    """,
    (error_message[:1000], str(archive_id)),
  )


def upsert_archive_record(conn: psycopg2.extensions.connection, record: YuntuArchiveRecord) -> ArchiveUpsertResult:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      INSERT INTO ods.external_video_archive_raw AS current_record (
        archive_id, source_system, source_task_name, date_label, source_rank,
        source_page_number, source_item_index, source_page_url, source_video_id,
        source_material_id, aweme_id, item_id, group_id, video_title, cdn_url,
        cdn_status, cdn_missing_reason, batch_id, mapping_confidence,
        row_payload, cdn_evidence, request_payload, archive_status
      ) VALUES (
        %s, %s, %s, %s, %s,
        %s, %s, NULLIF(%s, ''), NULLIF(%s, ''),
        NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''),
        NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''),
        %s::jsonb, %s::jsonb, %s::jsonb, %s
      )
      ON CONFLICT (source_system, source_task_name, date_label, source_rank) DO UPDATE SET
        source_page_number = EXCLUDED.source_page_number,
        source_item_index = EXCLUDED.source_item_index,
        source_page_url = EXCLUDED.source_page_url,
        source_video_id = EXCLUDED.source_video_id,
        source_material_id = EXCLUDED.source_material_id,
        aweme_id = EXCLUDED.aweme_id,
        item_id = EXCLUDED.item_id,
        group_id = EXCLUDED.group_id,
        video_title = EXCLUDED.video_title,
        cdn_url = EXCLUDED.cdn_url,
        cdn_status = EXCLUDED.cdn_status,
        cdn_missing_reason = EXCLUDED.cdn_missing_reason,
        batch_id = EXCLUDED.batch_id,
        mapping_confidence = EXCLUDED.mapping_confidence,
        row_payload = EXCLUDED.row_payload,
        cdn_evidence = EXCLUDED.cdn_evidence,
        request_payload = EXCLUDED.request_payload,
        archive_status = CASE
          WHEN current_record.archive_status = 'succeeded' THEN current_record.archive_status
          WHEN current_record.archive_status = 'running' AND EXCLUDED.archive_status = 'queued' THEN current_record.archive_status
          WHEN EXCLUDED.archive_status = 'skipped' THEN 'skipped'
          ELSE 'queued'
        END,
        queued_at = CASE
          WHEN current_record.archive_status = 'succeeded' THEN current_record.queued_at
          WHEN current_record.archive_status = 'running' AND EXCLUDED.archive_status = 'queued' THEN current_record.queued_at
          WHEN EXCLUDED.archive_status = 'skipped' THEN current_record.queued_at
          ELSE CURRENT_TIMESTAMP
        END,
        last_error = CASE
          WHEN current_record.archive_status = 'succeeded' THEN current_record.last_error
          ELSE NULL
        END
      RETURNING archive_id, archive_status, asset_id
      """,
      (
        str(record.archive_id),
        record.source_system,
        record.source_task_name,
        record.date_label,
        record.source_rank,
        record.source_page_number,
        record.source_item_index,
        record.source_page_url,
        record.source_video_id,
        record.source_material_id,
        record.aweme_id,
        record.item_id,
        record.group_id,
        record.video_title,
        record.cdn_url,
        record.cdn_status,
        record.cdn_missing_reason,
        record.batch_id,
        record.mapping_confidence,
        json.dumps(record.row_payload, ensure_ascii=False),
        json.dumps(record.cdn_evidence, ensure_ascii=False),
        json.dumps(record.request_payload, ensure_ascii=False),
        record.initial_archive_status,
      ),
    )
    row = cur.fetchone()
    archive_id = uuid.UUID(str(row["archive_id"]))
    asset_id = uuid.UUID(str(row["asset_id"])) if row.get("asset_id") else None
    _upsert_qianchuan_short_video_row(
      cur,
      record,
      archive_id=archive_id,
      archive_status=str(row["archive_status"] or ""),
      asset_id=asset_id,
    )
  conn.commit()
  return ArchiveUpsertResult(
    archive_id=archive_id,
    archive_status=str(row["archive_status"] or ""),
    asset_id=asset_id,
  )


def claim_next_archive_record(conn: psycopg2.extensions.connection) -> ClaimRecord | None:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      WITH next_record AS (
        SELECT archive_id
        FROM ods.external_video_archive_raw
        WHERE archive_status = 'queued'
          AND NULLIF(cdn_url, '') IS NOT NULL
        ORDER BY queued_at ASC, first_seen_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ods.external_video_archive_raw raw
      SET archive_status = 'running',
          attempts = attempts + 1,
          started_at = CURRENT_TIMESTAMP,
          failed_at = NULL,
          last_error = NULL
      FROM next_record
      WHERE raw.archive_id = next_record.archive_id
      RETURNING raw.*
      """
    )
    row = cur.fetchone()
  conn.commit()
  return ClaimRecord.from_row(row) if row else None


def count_archive_statuses(conn: psycopg2.extensions.connection) -> dict[str, int]:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      SELECT archive_status, COUNT(*) AS count
      FROM ods.external_video_archive_raw
      GROUP BY archive_status
      """
    )
    rows = cur.fetchall()
  return {str(row["archive_status"]): int(row["count"] or 0) for row in rows}


def requeue_failed(conn: psycopg2.extensions.connection, limit: int = 0) -> int:
  with conn.cursor() as cur:
    cur.execute(
      """
      WITH failed AS (
        SELECT archive_id
        FROM ods.external_video_archive_raw
        WHERE archive_status = 'failed'
          AND NULLIF(cdn_url, '') IS NOT NULL
        ORDER BY failed_at ASC NULLS FIRST, updated_at ASC
        LIMIT CASE WHEN %s > 0 THEN %s ELSE 2147483647 END
      )
      UPDATE ods.external_video_archive_raw raw
      SET archive_status = 'queued',
          queued_at = CURRENT_TIMESTAMP,
          last_error = NULL
      FROM failed
      WHERE raw.archive_id = failed.archive_id
      """,
      (limit, limit),
    )
    count = cur.rowcount
  conn.commit()
  return int(count or 0)


def mark_archive_success(
  conn: psycopg2.extensions.connection,
  claim: ClaimRecord,
  *,
  asset_id: uuid.UUID,
  bucket: str,
  raw_object_key: str,
  raw_sha256: str,
  file_ext: str,
  mime_type: str,
  file_size_bytes: int,
  probe: VideoProbe,
) -> None:
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE ods.external_video_archive_raw
      SET archive_status = 'succeeded',
          asset_id = %s,
          bucket = %s,
          raw_object_key = %s,
          raw_sha256 = %s,
          file_ext = %s,
          mime_type = %s,
          file_size_bytes = %s,
          duration_seconds = %s,
          width = %s,
          height = %s,
          archived_at = CURRENT_TIMESTAMP,
          failed_at = NULL,
          last_error = NULL
      WHERE archive_id = %s
      """,
      (
        str(asset_id),
        bucket,
        raw_object_key,
        raw_sha256,
        file_ext,
        mime_type,
        file_size_bytes,
        probe.duration_seconds,
        probe.width,
        probe.height,
        str(claim.archive_id),
      ),
    )
    _update_qianchuan_short_video_archive_success(
      cur,
      claim,
      asset_id=asset_id,
      bucket=bucket,
      raw_object_key=raw_object_key,
      raw_sha256=raw_sha256,
      file_ext=file_ext,
      mime_type=mime_type,
      file_size_bytes=file_size_bytes,
      probe=probe,
    )
  conn.commit()


def mark_archive_failed(conn: psycopg2.extensions.connection, archive_id: uuid.UUID, error_message: str) -> None:
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE ods.external_video_archive_raw
      SET archive_status = 'failed',
          failed_at = CURRENT_TIMESTAMP,
          last_error = %s
      WHERE archive_id = %s
      """,
      (error_message[:1000], str(archive_id)),
    )
    _update_qianchuan_short_video_archive_failed(cur, archive_id, error_message)
  conn.commit()


def find_asset_by_sha256(conn: psycopg2.extensions.connection, raw_sha256: str) -> dict[str, Any] | None:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      SELECT asset_id, bucket, raw_object_key, raw_sha256, file_ext, mime_type, file_size_bytes
      FROM ads.marketing_content_assets
      WHERE raw_sha256 = %s
        AND is_deleted = FALSE
      ORDER BY uploaded_at DESC NULLS LAST, created_at ASC
      LIMIT 1
      """,
      (raw_sha256,),
    )
    row = cur.fetchone()
  return dict(row) if row else None


def upsert_archived_asset(
  conn: psycopg2.extensions.connection,
  claim: ClaimRecord,
  *,
  asset_id: uuid.UUID,
  bucket: str,
  raw_object_key: str,
  raw_sha256: str,
  file_ext: str,
  mime_type: str,
  file_size_bytes: int,
  probe: VideoProbe,
) -> None:
  title = claim.video_title or f"{claim.source_task_name} rank {claim.source_rank}"
  tags = ["yuntu", "qianchuan", claim.date_label, claim.source_task_name]
  metadata = {
    "sourceSystem": claim.source_system,
    "sourceTaskName": claim.source_task_name,
    "dateLabel": claim.date_label,
    "sourceRank": claim.source_rank,
    "sourcePageNumber": claim.source_page_number,
    "sourceItemIndex": claim.source_item_index,
    "sourceVideoId": claim.source_video_id,
    "sourceMaterialId": claim.source_material_id,
    "cdnEvidence": claim.cdn_evidence,
    "rowPayload": claim.row_payload,
    "sourceRecordKey": claim.source_record_key,
  }
  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO ads.marketing_content_assets AS current_asset (
        asset_id, title, title_source, asset_type, asset_status, profile_status, lifecycle_status,
        source_type, source_platform, source_url, source_record_id, source_sheet_id,
        source_sheet_name, source_row_index, external_only, bucket, raw_object_key,
        raw_sha256, file_ext, mime_type, duration_seconds, width, height,
        file_size_bytes, platform, tags, tags_source, notes, uploaded_by, uploaded_at
      ) VALUES (
        %s, %s, 'row_fallback', 'video', 'pending_processing', 'basic_complete', 'waiting_analysis',
        'yuntu_archive', 'qianchuan', NULLIF(%s, ''), %s, 'yuntu_archive',
        %s, %s, FALSE, %s, %s,
        %s, %s, %s, %s, %s, %s,
        %s, 'qianchuan', %s, 'mixed', %s, %s, CURRENT_TIMESTAMP
      )
      ON CONFLICT (asset_id) DO UPDATE SET
        title = CASE WHEN current_asset.title_source = 'manual' THEN current_asset.title ELSE EXCLUDED.title END,
        title_source = CASE WHEN current_asset.title_source = 'manual' THEN current_asset.title_source ELSE EXCLUDED.title_source END,
        asset_status = CASE WHEN current_asset.asset_status = 'ready' THEN current_asset.asset_status ELSE EXCLUDED.asset_status END,
        profile_status = CASE WHEN current_asset.profile_status = 'verified' THEN current_asset.profile_status ELSE EXCLUDED.profile_status END,
        lifecycle_status = CASE WHEN current_asset.lifecycle_status <> 'draft' THEN current_asset.lifecycle_status ELSE EXCLUDED.lifecycle_status END,
        source_type = EXCLUDED.source_type,
        source_platform = EXCLUDED.source_platform,
        source_url = COALESCE(NULLIF(current_asset.source_url, ''), EXCLUDED.source_url),
        source_record_id = EXCLUDED.source_record_id,
        source_sheet_id = EXCLUDED.source_sheet_id,
        source_sheet_name = EXCLUDED.source_sheet_name,
        source_row_index = EXCLUDED.source_row_index,
        external_only = FALSE,
        bucket = EXCLUDED.bucket,
        raw_object_key = EXCLUDED.raw_object_key,
        raw_sha256 = EXCLUDED.raw_sha256,
        file_ext = EXCLUDED.file_ext,
        mime_type = EXCLUDED.mime_type,
        duration_seconds = EXCLUDED.duration_seconds,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        file_size_bytes = EXCLUDED.file_size_bytes,
        platform = EXCLUDED.platform,
        tags = CASE
          WHEN current_asset.tags_source = 'manual' THEN current_asset.tags
          ELSE ARRAY(
            SELECT DISTINCT tag
            FROM unnest(COALESCE(current_asset.tags, '{}'::TEXT[]) || EXCLUDED.tags) AS tag
            WHERE NULLIF(BTRIM(tag), '') IS NOT NULL
          )
        END,
        tags_source = CASE WHEN current_asset.tags_source = 'manual' THEN current_asset.tags_source ELSE EXCLUDED.tags_source END,
        notes = COALESCE(NULLIF(current_asset.notes, ''), EXCLUDED.notes),
        uploaded_at = COALESCE(current_asset.uploaded_at, CURRENT_TIMESTAMP)
      """,
      (
        str(asset_id),
        title,
        claim.external_url or claim.source_page_url,
        claim.source_record_key,
        claim.source_task_name,
        claim.source_rank,
        bucket,
        raw_object_key,
        raw_sha256,
        file_ext,
        mime_type,
        probe.duration_seconds,
        probe.width,
        probe.height,
        file_size_bytes,
        tags,
        json.dumps(metadata, ensure_ascii=False),
        ARCHIVE_ACTOR,
      ),
    )
    _upsert_raw_object(cur, asset_id, bucket, raw_object_key, mime_type, file_ext, file_size_bytes, raw_sha256, probe, metadata)
    _upsert_archive_source(cur, asset_id, claim, metadata)
    platform_video_id = _upsert_platform_video(cur, asset_id, claim, metadata)
    _upsert_ad_material(cur, asset_id, platform_video_id, claim, metadata)
    _insert_event(cur, asset_id, "external_video_archived", "云图 CDN 视频已归档到 TOS raw 对象", metadata)
  conn.commit()


def upsert_archived_asset_derivatives(
  conn: psycopg2.extensions.connection,
  *,
  asset_id: uuid.UUID,
  bucket: str,
  preview_object_key: str,
  preview_size_bytes: int | None,
  preview_sha256: str = "",
  cover_object_key: str,
  cover_size_bytes: int | None,
  cover_sha256: str = "",
  probe: VideoProbe,
  metadata: Mapping[str, Any],
) -> None:
  payload = {
    **dict(metadata),
    "previewObjectKey": preview_object_key,
    "coverObjectKey": cover_object_key,
    "previewSizeBytes": preview_size_bytes,
    "coverSizeBytes": cover_size_bytes,
  }
  with conn.cursor() as cur:
    if preview_object_key:
      _upsert_asset_object(
        cur,
        asset_id,
        "preview",
        bucket,
        preview_object_key,
        "video/mp4",
        ".mp4",
        preview_size_bytes,
        preview_sha256,
        probe,
        payload,
      )
    if cover_object_key:
      _upsert_asset_object(
        cur,
        asset_id,
        "cover",
        bucket,
        cover_object_key,
        "image/webp",
        ".webp",
        cover_size_bytes,
        cover_sha256,
        VideoProbe(),
        payload,
      )
    cur.execute(
      """
      UPDATE ads.marketing_content_assets
      SET asset_status = CASE
            WHEN raw_object_key IS NOT NULL
             AND COALESCE(%s, preview_object_key) IS NOT NULL
             AND COALESCE(%s, cover_object_key) IS NOT NULL
              THEN 'ready'
            ELSE asset_status
          END,
          lifecycle_status = CASE
            WHEN raw_object_key IS NOT NULL
             AND COALESCE(%s, preview_object_key) IS NOT NULL
             AND COALESCE(%s, cover_object_key) IS NOT NULL
             AND lifecycle_status = 'draft'
              THEN 'waiting_analysis'
            ELSE lifecycle_status
          END,
          preview_object_key = COALESCE(%s, preview_object_key),
          cover_object_key = COALESCE(%s, cover_object_key),
          preview_size_bytes = COALESCE(%s, preview_size_bytes),
          duration_seconds = COALESCE(%s, duration_seconds),
          width = COALESCE(%s, width),
          height = COALESCE(%s, height),
          uploaded_at = COALESCE(uploaded_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
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
        preview_size_bytes,
        probe.duration_seconds,
        probe.width,
        probe.height,
        str(asset_id),
      ),
    )
    _insert_event(
      cur,
      asset_id,
      "yuntu_derivatives_generated",
      "云图归档素材已生成 preview / cover",
      payload,
    )
  conn.commit()


def _upsert_raw_object(
  cur: psycopg2.extensions.cursor,
  asset_id: uuid.UUID,
  bucket: str,
  object_key: str,
  content_type: str,
  file_ext: str,
  size_bytes: int,
  sha256: str,
  probe: VideoProbe,
  metadata: Mapping[str, Any],
) -> None:
  object_id = stable_uuid(f"content-asset-object:{asset_id}:raw:{object_key}")
  cur.execute(
    """
    INSERT INTO ads.marketing_content_asset_objects (
      object_id, asset_id, object_role, storage_provider, bucket, object_key,
      content_type, file_ext, size_bytes, sha256, width, height, duration_seconds,
      status, metadata
    ) VALUES (
      %s, %s, 'raw', 'tos', %s, %s,
      NULLIF(%s, ''), NULLIF(%s, ''), %s, NULLIF(%s, ''), %s, %s, %s,
      'active', %s::jsonb
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
      status = 'active',
      metadata = EXCLUDED.metadata
    """,
    (
      str(object_id),
      str(asset_id),
      bucket,
      object_key,
      content_type,
      file_ext,
      size_bytes,
      sha256,
      probe.width,
      probe.height,
      probe.duration_seconds,
      json.dumps(dict(metadata), ensure_ascii=False),
    ),
  )


def _upsert_asset_object(
  cur: psycopg2.extensions.cursor,
  asset_id: uuid.UUID,
  object_role: str,
  bucket: str,
  object_key: str,
  content_type: str,
  file_ext: str,
  size_bytes: int | None,
  sha256: str,
  probe: VideoProbe,
  metadata: Mapping[str, Any],
) -> None:
  object_id = stable_uuid(f"content-asset-object:{asset_id}:{object_role}:{object_key}")
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
      content_type, file_ext, size_bytes, sha256, width, height, duration_seconds,
      status, metadata
    ) VALUES (
      %s, %s, %s, 'tos', %s, %s,
      NULLIF(%s, ''), NULLIF(%s, ''), %s, NULLIF(%s, ''), %s, %s, %s,
      'active', %s::jsonb
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
      status = 'active',
      metadata = EXCLUDED.metadata
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
      json.dumps(dict(metadata), ensure_ascii=False),
    ),
  )


def _upsert_archive_source(
  cur: psycopg2.extensions.cursor,
  asset_id: uuid.UUID,
  claim: ClaimRecord,
  metadata: Mapping[str, Any],
) -> None:
  cur.execute(
    """
    SELECT source_id
    FROM ads.marketing_content_asset_sources
    WHERE source_kind = %s
      AND metadata->>'sourceRecordKey' = %s
    ORDER BY source_id
    LIMIT 1
    """,
    (ARCHIVE_SOURCE_KIND, claim.source_record_key),
  )
  existing = cur.fetchone()
  params = (
    str(asset_id),
    claim.cdn_url or claim.source_page_url,
    claim.video_title,
    ARCHIVE_EXTERNAL_PLATFORM,
    "ingested",
    json.dumps(dict(metadata), ensure_ascii=False),
  )
  if existing:
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_sources
      SET asset_id = %s,
          source_url = %s,
          source_title = %s,
          external_platform = %s,
          external_status = %s,
          metadata = %s::jsonb
      WHERE source_id = %s
      """,
      (*params, existing[0]),
    )
    return
  cur.execute(
    """
    INSERT INTO ads.marketing_content_asset_sources (
      asset_id, source_kind, source_url, source_title, external_platform,
      external_status, metadata
    ) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
    """,
    (
      str(asset_id),
      ARCHIVE_SOURCE_KIND,
      claim.cdn_url or claim.source_page_url,
      claim.video_title,
      ARCHIVE_EXTERNAL_PLATFORM,
      "ingested",
      json.dumps(dict(metadata), ensure_ascii=False),
    ),
  )


def _upsert_platform_video(
  cur: psycopg2.extensions.cursor,
  asset_id: uuid.UUID,
  claim: ClaimRecord,
  metadata: Mapping[str, Any],
) -> uuid.UUID | None:
  if not (claim.aweme_id or claim.item_id or claim.group_id):
    return None
  cur.execute(
    """
    SELECT platform_video_id
    FROM ads.marketing_content_platform_videos
    WHERE platform = 'douyin'
      AND COALESCE(external_video_id, '') = COALESCE(NULLIF(%s, ''), COALESCE(external_video_id, ''))
      AND COALESCE(external_item_id, '') = COALESCE(NULLIF(%s, ''), COALESCE(external_item_id, ''))
      AND COALESCE(external_note_id, '') = COALESCE(NULLIF(%s, ''), COALESCE(external_note_id, ''))
      AND relation_status = 'active'
    ORDER BY created_at ASC
    LIMIT 1
    """,
    (claim.aweme_id, claim.item_id, claim.group_id),
  )
  existing = cur.fetchone()
  platform_video_id = uuid.UUID(str(existing[0])) if existing else stable_uuid(
    f"platform-video:douyin:{claim.aweme_id}:{claim.item_id}:{claim.group_id}"
  )
  cur.execute(
    """
    INSERT INTO ads.marketing_content_platform_videos (
      platform_video_id, asset_id, platform, external_video_id, external_item_id,
      external_note_id, external_url, publish_title, publish_cover_url,
      publish_status, relation_status, source, confidence, raw_payload
    ) VALUES (
      %s, %s, 'douyin', NULLIF(%s, ''), NULLIF(%s, ''),
      NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULL,
      'unknown', 'active', 'report_import', 0.9, %s::jsonb
    )
    ON CONFLICT (platform_video_id) DO UPDATE SET
      asset_id = EXCLUDED.asset_id,
      external_url = COALESCE(NULLIF(ads.marketing_content_platform_videos.external_url, ''), EXCLUDED.external_url),
      publish_title = COALESCE(NULLIF(ads.marketing_content_platform_videos.publish_title, ''), EXCLUDED.publish_title),
      source = EXCLUDED.source,
      confidence = GREATEST(COALESCE(ads.marketing_content_platform_videos.confidence, 0), EXCLUDED.confidence),
      raw_payload = EXCLUDED.raw_payload,
      relation_status = 'active'
    """,
    (
      str(platform_video_id),
      str(asset_id),
      claim.aweme_id,
      claim.item_id,
      claim.group_id,
      claim.external_url,
      claim.video_title,
      json.dumps(dict(metadata), ensure_ascii=False),
    ),
  )
  return platform_video_id


def _upsert_ad_material(
  cur: psycopg2.extensions.cursor,
  asset_id: uuid.UUID,
  platform_video_id: uuid.UUID | None,
  claim: ClaimRecord,
  metadata: Mapping[str, Any],
) -> None:
  if not claim.source_material_id:
    return
  cur.execute(
    """
    SELECT ad_material_id
    FROM ads.marketing_content_ad_materials
    WHERE ad_platform = 'qianchuan'
      AND COALESCE(account_id, '') = ''
      AND external_material_id = %s
      AND relation_status = 'active'
    ORDER BY created_at ASC
    LIMIT 1
    """,
    (claim.source_material_id,),
  )
  existing = cur.fetchone()
  ad_material_id = uuid.UUID(str(existing[0])) if existing else stable_uuid(f"qianchuan-material:{claim.source_material_id}")
  cur.execute(
    """
    INSERT INTO ads.marketing_content_ad_materials (
      ad_material_id, asset_id, platform_video_id, ad_platform, external_material_id,
      external_video_id, material_name, material_title, material_cover_url,
      material_status, first_seen_at, last_seen_at, relation_status, source,
      confidence, raw_payload
    ) VALUES (
      %s, %s, %s, 'qianchuan', %s,
      NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULL,
      'unknown', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'active', 'report_import',
      0.9, %s::jsonb
    )
    ON CONFLICT (ad_material_id) DO UPDATE SET
      asset_id = EXCLUDED.asset_id,
      platform_video_id = COALESCE(EXCLUDED.platform_video_id, ads.marketing_content_ad_materials.platform_video_id),
      external_video_id = COALESCE(NULLIF(ads.marketing_content_ad_materials.external_video_id, ''), EXCLUDED.external_video_id),
      material_name = COALESCE(NULLIF(ads.marketing_content_ad_materials.material_name, ''), EXCLUDED.material_name),
      material_title = COALESCE(NULLIF(ads.marketing_content_ad_materials.material_title, ''), EXCLUDED.material_title),
      last_seen_at = CURRENT_TIMESTAMP,
      source = EXCLUDED.source,
      confidence = GREATEST(COALESCE(ads.marketing_content_ad_materials.confidence, 0), EXCLUDED.confidence),
      raw_payload = EXCLUDED.raw_payload,
      relation_status = 'active'
    """,
    (
      str(ad_material_id),
      str(asset_id),
      str(platform_video_id) if platform_video_id else None,
      claim.source_material_id,
      claim.source_video_id,
      claim.video_title,
      claim.video_title,
      json.dumps(dict(metadata), ensure_ascii=False),
    ),
  )


def _insert_event(
  cur: psycopg2.extensions.cursor,
  asset_id: uuid.UUID,
  event_type: str,
  message: str,
  payload: Mapping[str, Any],
) -> None:
  cur.execute(
    """
    INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
    VALUES (%s, %s, %s, %s, %s::jsonb)
    """,
    (str(asset_id), event_type, ARCHIVE_ACTOR, message, json.dumps(dict(payload), ensure_ascii=False)),
  )
