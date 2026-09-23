from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_SOURCE_URL = "https://example.invalid/feishu-source?sheet=sheet001"
DEFAULT_SPREADSHEET_TOKEN = ""
DEFAULT_SHEET_NAMES = {
  "sheet001": "Example sheet",
}
DEFAULT_SHEET_IDS = tuple(DEFAULT_SHEET_NAMES.keys())

VIDEO_EXTENSIONS = {
  ".mp4",
  ".mov",
  ".m4v",
  ".avi",
  ".mkv",
  ".webm",
}

URL_PATTERN = re.compile(r"https?://[^\s\"'<>）)]+")
TOKEN_LIKE_TITLE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,}$")
DEFAULT_UNTITLED_TITLES = {"", "未命名素材", "未命名视频"}


@dataclass(frozen=True)
class FeishuSheetRef:
  spreadsheet_token: str
  sheet_id: str
  sheet_name: str


@dataclass
class FeishuAttachment:
  file_token: str
  name: str
  mime_type: str = ""
  size: Optional[int] = None
  cell_ref: str = ""
  raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SourceCandidate:
  title: str
  source_kind: str
  sheet_id: str
  sheet_name: str
  row_index: int
  title_source: str = "unknown"
  platform: str = ""
  product_name: str = ""
  creator_name: str = ""
  owner_name: str = ""
  tags: List[str] = field(default_factory=list)
  tags_source: str = "empty"
  notes: str = ""
  source_url: str = DEFAULT_SOURCE_URL
  attachment: Optional[FeishuAttachment] = None
  external_url: str = ""
  external_platform: str = ""
  source_record_id: str = ""

  @property
  def external_only(self) -> bool:
    return self.attachment is None

  def stable_identity(self, content_sha256: str = "") -> str:
    if content_sha256:
      return f"sha256:{content_sha256}"
    if self.attachment:
      return f"feishu:{self.attachment.file_token}:{self.sheet_id}:{self.row_index}"
    return f"{self.source_kind}:{self.external_url}:{self.sheet_id}:{self.row_index}"

  def make_asset_id(self, content_sha256: str = "") -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, self.stable_identity(content_sha256))


@dataclass
class VideoProbe:
  duration_seconds: Optional[float] = None
  width: Optional[int] = None
  height: Optional[int] = None


@dataclass
class ProcessedVideo:
  preview_path: Path
  cover_path: Path
  probe: VideoProbe


@dataclass
class UploadedObjects:
  bucket: str
  raw_object_key: str
  preview_object_key: Optional[str]
  cover_object_key: Optional[str]
  raw_sha256: str
  file_ext: str
  mime_type: str
  file_size_bytes: int
  preview_size_bytes: Optional[int] = None


@dataclass
class ProcessingJob:
  job_id: uuid.UUID
  asset_id: uuid.UUID
  job_type: str
  input_object_key: str
  output_object_key: str
  attempts: int
  max_attempts: int


@dataclass
class ProcessingBatch:
  asset_id: uuid.UUID
  bucket: str
  raw_object_key: str
  raw_sha256: str = ""
  file_ext: str = ""
  mime_type: str = ""
  file_size_bytes: Optional[int] = None
  jobs: List[ProcessingJob] = field(default_factory=list)


@dataclass
class ImportStats:
  total_rows: int = 0
  attachment_count: int = 0
  uploaded_count: int = 0
  external_only_count: int = 0
  skipped_count: int = 0
  failed_count: int = 0
  sample_errors: List[str] = field(default_factory=list)

  def to_payload(self) -> Dict[str, Any]:
    return {
      "totalRows": self.total_rows,
      "attachmentCount": self.attachment_count,
      "uploadedCount": self.uploaded_count,
      "externalOnlyCount": self.external_only_count,
      "skippedCount": self.skipped_count,
      "failedCount": self.failed_count,
      "sampleErrors": self.sample_errors[:10],
    }


def utc_now() -> datetime:
  return datetime.now(timezone.utc)


def normalize_tag(value: str) -> str:
  return re.sub(r"\s+", " ", value.strip())


def split_tags(value: str) -> List[str]:
  if not value:
    return []
  parts = re.split(r"[,，/、;；\n]+", value)
  return [tag for tag in (normalize_tag(part) for part in parts) if tag]


def is_low_quality_title(value: str) -> bool:
  title = normalize_tag(value or "")
  if title in DEFAULT_UNTITLED_TITLES:
    return True
  if "/" in title and len(title) > 24:
    return True
  if TOKEN_LIKE_TITLE_PATTERN.match(title) and not re.search(r"[\u4e00-\u9fff\s]", title):
    return True
  lowered = title.lower()
  return bool(re.match(r"^(vid|img|dsc|mov|screenrecording|screen recording)[_-]?\d{4,}", lowered))


def fallback_video_title(sheet_name: str, row_index: int, external_only: bool = False) -> str:
  suffix = "外部素材" if external_only else "视频"
  return f"{sheet_name} 第{row_index}行{suffix}"


def classify_external_url(url: str) -> str:
  normalized = url.lower()
  if "pan.baidu.com" in normalized or "baidu.com/s/" in normalized:
    return "baidu_netdisk"
  if "douyin.com" in normalized:
    return "douyin_link"
  if "feishu.cn" in normalized or "larksuite.com" in normalized:
    return "feishu_link"
  return "other"


def infer_platform(text: str, fallback: str = "") -> str:
  source = f"{text} {fallback}".lower()
  if "小红书" in source or "xhs" in source:
    return "小红书"
  if "抖音" in source or "douyin" in source:
    return "抖音"
  if "千川" in source:
    return "千川"
  return fallback
