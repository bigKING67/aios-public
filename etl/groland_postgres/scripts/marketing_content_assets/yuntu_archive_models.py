from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Mapping


SOURCE_SYSTEM = "yuntu"
ARCHIVE_SOURCE_KIND = "other"
ARCHIVE_EXTERNAL_PLATFORM = "qianchuan"
ARCHIVE_ACTOR = "yuntu-archive-helper"


def stable_uuid(name: str) -> uuid.UUID:
  return uuid.uuid5(uuid.NAMESPACE_URL, name)


def clean_text(value: Any) -> str:
  return re.sub(r"\s+", " ", str(value or "")).strip()


def int_or_none(value: Any) -> int | None:
  text = clean_text(value)
  if not text:
    return None
  try:
    return int(float(text))
  except (TypeError, ValueError):
    return None


def explicit_external_id(record: Mapping[str, Any], row: Mapping[str, Any], *keys: str) -> str:
  for key in keys:
    value = clean_text(record.get(key) or row.get(key))
    if value:
      return value
  external_ids = record.get("externalIds")
  if isinstance(external_ids, Mapping):
    for key in keys:
      value = clean_text(external_ids.get(key))
      if value:
        return value
  return ""


def douyin_video_url(aweme_id: str, item_id: str = "") -> str:
  identifier = clean_text(aweme_id or item_id)
  if not identifier:
    return ""
  return f"https://www.douyin.com/video/{identifier}"


@dataclass(frozen=True)
class YuntuArchiveRecord:
  source_system: str
  source_task_name: str
  date_label: str
  source_rank: int
  source_page_number: int | None = None
  source_item_index: int | None = None
  source_page_url: str = ""
  source_video_id: str = ""
  source_material_id: str = ""
  aweme_id: str = ""
  item_id: str = ""
  group_id: str = ""
  video_title: str = ""
  cdn_url: str = ""
  cdn_status: str = ""
  cdn_missing_reason: str = ""
  batch_id: str = ""
  mapping_confidence: str = ""
  row_payload: dict[str, Any] = field(default_factory=dict)
  cdn_evidence: dict[str, Any] = field(default_factory=dict)
  request_payload: dict[str, Any] = field(default_factory=dict)

  @property
  def archive_id(self) -> uuid.UUID:
    return stable_uuid(
      "external-video-archive:"
      f"{self.source_system}:{self.source_task_name}:{self.date_label}:{self.source_rank}"
    )

  @property
  def source_record_key(self) -> str:
    return f"{self.source_system}:{self.source_task_name}:{self.date_label}:{self.source_rank}"

  @property
  def should_download(self) -> bool:
    return bool(self.cdn_url)

  @property
  def initial_archive_status(self) -> str:
    return "queued" if self.should_download else "skipped"

  @property
  def external_url(self) -> str:
    return douyin_video_url(self.aweme_id, self.item_id)


def archive_records_from_page_batch(payload: Mapping[str, Any]) -> list[YuntuArchiveRecord]:
  source_system = clean_text(payload.get("sourceSystem")) or SOURCE_SYSTEM
  source_task_name = clean_text(payload.get("outputBaseName") or payload.get("sourceTaskName") or payload.get("taskName"))
  date_label = clean_text(payload.get("dateLabel"))
  page_url = clean_text(payload.get("pageUrl"))
  page_number = int_or_none(payload.get("pageNumber"))
  records = payload.get("records") or []
  output: list[YuntuArchiveRecord] = []
  if not source_task_name:
    raise ValueError("archive batch missing sourceTaskName/taskName")
  if not date_label:
    raise ValueError("archive batch missing dateLabel")
  if not isinstance(records, list):
    raise ValueError("archive batch records must be a list")

  for index, raw_record in enumerate(records):
    if not isinstance(raw_record, Mapping):
      raise ValueError(f"archive record at index {index} is not an object")
    row_payload = raw_record.get("rowPayload") if isinstance(raw_record.get("rowPayload"), Mapping) else {}
    evidence = raw_record.get("cdnEvidence") if isinstance(raw_record.get("cdnEvidence"), Mapping) else {}
    source_rank = int_or_none(raw_record.get("rank") or row_payload.get("排名"))
    if source_rank is None:
      raise ValueError(f"archive record at index {index} missing rank")
    video_id = clean_text(raw_record.get("videoId") or row_payload.get("视频ID"))
    material_id = clean_text(raw_record.get("materialId") or row_payload.get("_素材ID"))
    aweme_id = explicit_external_id(raw_record, row_payload, "awemeId", "aweme_id")
    item_id = explicit_external_id(raw_record, row_payload, "itemId", "item_id")
    group_id = explicit_external_id(raw_record, row_payload, "groupId", "group_id")
    cdn_url = clean_text(raw_record.get("cdnUrl") or row_payload.get("CDN直链"))
    cdn_missing_reason = clean_text(raw_record.get("cdnMissingReason") or row_payload.get("CDN缺失原因"))
    cdn_status = clean_text(raw_record.get("cdnStatus") or row_payload.get("CDN状态"))
    if not cdn_status:
      cdn_status = "ok" if cdn_url else ("missing_with_reason" if cdn_missing_reason else "missing")
    output.append(YuntuArchiveRecord(
      source_system=source_system,
      source_task_name=source_task_name,
      date_label=date_label,
      source_rank=source_rank,
      source_page_number=int_or_none(raw_record.get("pageNumber")) or page_number,
      source_item_index=int_or_none(raw_record.get("itemIndex")) or (index + 1),
      source_page_url=page_url,
      source_video_id=video_id,
      source_material_id=material_id,
      aweme_id=aweme_id,
      item_id=item_id,
      group_id=group_id,
      video_title=clean_text(raw_record.get("title") or row_payload.get("视频内容")),
      cdn_url=cdn_url,
      cdn_status=cdn_status,
      cdn_missing_reason=cdn_missing_reason,
      batch_id=clean_text(raw_record.get("batchId") or evidence.get("batchId")),
      mapping_confidence=clean_text(raw_record.get("mappingConfidence") or evidence.get("mappingConfidence")),
      row_payload=dict(row_payload),
      cdn_evidence=dict(evidence),
      request_payload=dict(payload),
    ))
  return output
