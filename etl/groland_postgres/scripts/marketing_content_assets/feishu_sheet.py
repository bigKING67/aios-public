from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import requests

from .models import (
  DEFAULT_SHEET_NAMES,
  DEFAULT_SOURCE_URL,
  DEFAULT_SPREADSHEET_TOKEN,
  FeishuAttachment,
  FeishuSheetRef,
  SourceCandidate,
  URL_PATTERN,
  VIDEO_EXTENSIONS,
  classify_external_url,
  fallback_video_title,
  infer_platform,
  is_low_quality_title,
  split_tags,
)


class FeishuApiError(RuntimeError):
  pass


def _env_int(name: str, default: int) -> int:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    return max(1, int(raw))
  except ValueError as error:
    raise FeishuApiError(f"{name} 必须是正整数") from error


def _column_name(index: int) -> str:
  if index <= 0:
    return "ZZ"
  value = ""
  while index:
    index, remainder = divmod(index - 1, 26)
    value = chr(ord("A") + remainder) + value
  return value


class FeishuClient:
  def __init__(self, app_id: str, app_secret: str, base_url: str = "https://open.feishu.cn/open-apis"):
    self.app_id = app_id
    self.app_secret = app_secret
    self.base_url = base_url.rstrip("/")
    self.session = requests.Session()
    self._tenant_access_token: Optional[str] = None

  @classmethod
  def from_env(cls) -> "FeishuClient":
    app_id = (os.getenv("FEISHU_APP_ID") or os.getenv("LARK_APP_ID") or "").strip()
    app_secret = (os.getenv("FEISHU_APP_SECRET") or os.getenv("LARK_APP_SECRET") or "").strip()
    auth_mode = (os.getenv("CONTENT_ASSET_FEISHU_AUTH_MODE") or "auto").strip().lower()
    if auth_mode in {"auto", "lark_cli", "lark-cli"} and (not app_id or not app_secret):
      if shutil.which("lark-cli"):
        return LarkCliFeishuClient()
      if auth_mode in {"lark_cli", "lark-cli"}:
        raise FeishuApiError("CONTENT_ASSET_FEISHU_AUTH_MODE=lark_cli 但未找到 lark-cli")
    if not app_id or not app_secret:
      raise FeishuApiError("缺少 FEISHU_APP_ID/FEISHU_APP_SECRET，且没有可用 lark-cli，无法读取飞书表格附件")
    base_url = (os.getenv("FEISHU_BASE_URL") or "https://open.feishu.cn/open-apis").strip()
    return cls(app_id=app_id, app_secret=app_secret, base_url=base_url)

  @property
  def tenant_access_token(self) -> str:
    if self._tenant_access_token:
      return self._tenant_access_token
    response = self.session.post(
      f"{self.base_url}/auth/v3/tenant_access_token/internal",
      json={"app_id": self.app_id, "app_secret": self.app_secret},
      timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
      raise FeishuApiError(f"获取 tenant_access_token 失败: {payload.get('msg')}")
    token = payload.get("tenant_access_token")
    if not token:
      raise FeishuApiError("tenant_access_token 为空")
    self._tenant_access_token = token
    return token

  def _headers(self) -> Dict[str, str]:
    return {"Authorization": f"Bearer {self.tenant_access_token}"}

  def get_sheet_values(self, spreadsheet_token: str, sheet_id: str, range_ref: str = "A1:ZZ5000") -> List[List[Any]]:
    if range_ref == "A1:ZZ5000":
      return self._get_sheet_values_chunked(spreadsheet_token, sheet_id)
    return self._get_sheet_values_once(spreadsheet_token, sheet_id, range_ref)

  def _get_sheet_values_chunked(self, spreadsheet_token: str, sheet_id: str) -> List[List[Any]]:
    chunk_size = _env_int("CONTENT_ASSET_FEISHU_READ_CHUNK_SIZE", 25)
    max_rows = _env_int("CONTENT_ASSET_FEISHU_MAX_ROWS", 5000)
    last_column = (os.getenv("CONTENT_ASSET_FEISHU_READ_LAST_COLUMN") or "ZZ").strip() or "ZZ"
    rows: List[List[Any]] = []
    empty_chunks = 0
    for start in range(1, max_rows + 1, chunk_size):
      end = min(max_rows, start + chunk_size - 1)
      chunk = self._get_sheet_values_once(spreadsheet_token, sheet_id, f"A{start}:{last_column}{end}")
      if not chunk:
        empty_chunks += 1
        if rows and empty_chunks >= 3:
          break
        continue
      empty_chunks = 0
      rows.extend(chunk)
    return rows

  def _get_sheet_values_once(self, spreadsheet_token: str, sheet_id: str, range_ref: str) -> List[List[Any]]:
    url = f"{self.base_url}/sheets/v2/spreadsheets/{spreadsheet_token}/values/{sheet_id}!{range_ref}"
    response = self.session.get(
      url,
      headers=self._headers(),
      params={"valueRenderOption": "FormattedValue", "dateTimeRenderOption": "FormattedString"},
      timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
      raise FeishuApiError(f"读取飞书表格失败 sheet={sheet_id}: {payload.get('msg')}")
    values = payload.get("data", {}).get("valueRange", {}).get("values", [])
    if not isinstance(values, list):
      raise FeishuApiError(f"飞书表格返回 values 非数组 sheet={sheet_id}")
    return [row if isinstance(row, list) else [] for row in values]


class LarkCliFeishuClient:
  def __init__(self, identity: str = "user"):
    self.identity = (os.getenv("CONTENT_ASSET_LARK_CLI_AS") or identity).strip() or "user"

  def get_sheet_values(self, spreadsheet_token: str, sheet_id: str, range_ref: str = "A1:ZZ5000") -> List[List[Any]]:
    if range_ref != "A1:ZZ5000":
      return self._read_range(spreadsheet_token, sheet_id, range_ref)

    row_count, column_count = self._sheet_dimensions(spreadsheet_token, sheet_id)
    chunk_size = _env_int("CONTENT_ASSET_FEISHU_READ_CHUNK_SIZE", 25)
    max_rows = min(row_count or _env_int("CONTENT_ASSET_FEISHU_MAX_ROWS", 5000), _env_int("CONTENT_ASSET_FEISHU_MAX_ROWS", 5000))
    last_column = (os.getenv("CONTENT_ASSET_FEISHU_READ_LAST_COLUMN") or _column_name(column_count)).strip() or "ZZ"
    rows: List[List[Any]] = []
    for start in range(1, max_rows + 1, chunk_size):
      end = min(max_rows, start + chunk_size - 1)
      rows.extend(self._read_range(spreadsheet_token, sheet_id, f"A{start}:{last_column}{end}"))
    return rows

  def download_file(self, file_token: str, target_path) -> None:
    target_path = Path(target_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    payload = self._run_json([
      "docs",
      "+media-download",
      "--as",
      self.identity,
      "--token",
      file_token,
      "--type",
      "media",
      "--output",
      f"./{target_path.name}",
      "--overwrite",
    ], cwd=target_path.parent)
    saved_path = ((payload.get("data") or {}).get("saved_path") or "").strip()
    if not target_path.exists() and saved_path:
      downloaded_path = Path(saved_path)
      if downloaded_path.exists():
        downloaded_path.replace(target_path)

  def _sheet_dimensions(self, spreadsheet_token: str, sheet_id: str) -> tuple[int, int]:
    payload = self._run_json([
      "sheets",
      "+info",
      "--as",
      self.identity,
      "--spreadsheet-token",
      spreadsheet_token,
    ])
    sheets = (((payload.get("data") or {}).get("sheets") or {}).get("sheets") or [])
    for sheet in sheets:
      if sheet.get("sheet_id") == sheet_id:
        grid = sheet.get("grid_properties") or {}
        return int(grid.get("row_count") or 5000), int(grid.get("column_count") or 702)
    return _env_int("CONTENT_ASSET_FEISHU_MAX_ROWS", 5000), 702

  def _read_range(self, spreadsheet_token: str, sheet_id: str, range_ref: str) -> List[List[Any]]:
    payload = self._run_json([
      "sheets",
      "+read",
      "--as",
      self.identity,
      "--spreadsheet-token",
      spreadsheet_token,
      "--sheet-id",
      sheet_id,
      "--range",
      range_ref,
      "--value-render-option",
      "FormattedValue",
    ])
    data = payload.get("data") or payload
    value_range = data.get("valueRange") or data.get("value_range") or {}
    values = value_range.get("values") or data.get("values") or []
    return [row if isinstance(row, list) else [] for row in values]

  def _run_json(self, args: Sequence[str], cwd: Any = None) -> Dict[str, Any]:
    result = subprocess.run(
      ["lark-cli", *args],
      check=False,
      text=True,
      stdout=subprocess.PIPE,
      stderr=subprocess.STDOUT,
      cwd=cwd,
    )
    if result.returncode != 0:
      raise FeishuApiError(f"lark-cli 执行失败: {' '.join(args[:2])}; {result.stdout[:800]}")
    raw_output = result.stdout.strip()
    json_start = raw_output.find("{")
    if json_start > 0:
      raw_output = raw_output[json_start:]
    try:
      payload = json.loads(raw_output)
    except ValueError as error:
      raise FeishuApiError(f"lark-cli 返回非 JSON: {result.stdout[:800]}") from error
    if payload.get("ok") is False:
      raise FeishuApiError(f"lark-cli 返回失败: {payload.get('error')}")
    return payload


def resolve_sheet_refs(sheet_ids: Sequence[str], spreadsheet_token: str = DEFAULT_SPREADSHEET_TOKEN) -> List[FeishuSheetRef]:
  return [
    FeishuSheetRef(
      spreadsheet_token=spreadsheet_token,
      sheet_id=sheet_id,
      sheet_name=DEFAULT_SHEET_NAMES.get(sheet_id, sheet_id),
    )
    for sheet_id in sheet_ids
  ]


def parse_candidates_from_rows(
  rows: Sequence[Sequence[Any]],
  sheet_ref: FeishuSheetRef,
  source_url: str = DEFAULT_SOURCE_URL,
) -> List[SourceCandidate]:
  if not rows:
    return []
  headers = [_cell_text(cell).strip() for cell in rows[0]]
  candidates: List[SourceCandidate] = []
  for zero_index, row in enumerate(rows[1:], start=2):
    if not _row_has_content(row):
      continue
    row_context = _extract_row_context(headers, row, sheet_ref.sheet_name)
    attachments = list(_iter_video_attachments(row))
    external_urls = _extract_external_urls(row)
    row_tags = row_context.get("tags", [])
    tags_source = "feishu_row" if row_tags else "empty"
    for attachment in attachments:
      title, title_source = _resolve_candidate_title(row_context, attachment, sheet_ref.sheet_name, zero_index)
      candidates.append(
        SourceCandidate(
          title=title,
          source_kind="feishu_attachment",
          sheet_id=sheet_ref.sheet_id,
          sheet_name=sheet_ref.sheet_name,
          row_index=zero_index,
          title_source=title_source,
          platform=row_context.get("platform", ""),
          product_name=row_context.get("product_name", ""),
          creator_name=row_context.get("creator_name", ""),
          owner_name=row_context.get("owner_name", ""),
          tags=row_tags,
          tags_source=tags_source,
          notes=row_context.get("notes", ""),
          source_url=source_url,
          attachment=attachment,
          source_record_id=f"{sheet_ref.sheet_id}:{zero_index}:{attachment.file_token}",
        )
      )
    for url in external_urls:
      source_kind = classify_external_url(url)
      row_title = row_context.get("title", "")
      candidates.append(
        SourceCandidate(
          title=row_title or fallback_video_title(sheet_ref.sheet_name, zero_index, external_only=True),
          source_kind=source_kind,
          sheet_id=sheet_ref.sheet_id,
          sheet_name=sheet_ref.sheet_name,
          row_index=zero_index,
          title_source="feishu_row" if row_title else "row_fallback",
          platform=row_context.get("platform", ""),
          product_name=row_context.get("product_name", ""),
          creator_name=row_context.get("creator_name", ""),
          owner_name=row_context.get("owner_name", ""),
          tags=row_tags,
          tags_source=tags_source,
          notes=row_context.get("notes", ""),
          source_url=source_url,
          external_url=url,
          external_platform=source_kind,
          source_record_id=f"{sheet_ref.sheet_id}:{zero_index}:{url}",
        )
      )
  return candidates


def _resolve_candidate_title(
  row_context: Dict[str, Any],
  attachment: FeishuAttachment,
  sheet_name: str,
  row_index: int,
) -> tuple[str, str]:
  row_title = str(row_context.get("title") or "").strip()
  if row_title:
    return row_title, "feishu_row"
  attachment_name = str(attachment.name or "").strip()
  if attachment_name and attachment_name != attachment.file_token and not is_low_quality_title(attachment_name):
    return attachment_name, "file_name"
  return fallback_video_title(sheet_name, row_index), "row_fallback"


def _row_has_content(row: Sequence[Any]) -> bool:
  return any(_cell_text(cell).strip() or list(_iter_video_attachments([cell])) for cell in row)


def _extract_row_context(headers: Sequence[str], row: Sequence[Any], sheet_name: str) -> Dict[str, Any]:
  raw_values = {
    headers[index]: _cell_text(row[index]).strip()
    for index in range(min(len(headers), len(row)))
    if headers[index]
  }
  title = _pick_by_keywords(raw_values, ("标题", "名称", "素材", "视频", "内容"))
  platform = _pick_by_keywords(raw_values, ("平台", "渠道", "投放"))
  product = _pick_by_keywords(raw_values, ("产品", "SKU", "商品", "品类"))
  creator = _pick_by_keywords(raw_values, ("达人", "账号", "作者", "昵称", "KOC"))
  owner = _pick_by_keywords(raw_values, ("负责人", "上传人", "BD", "归属"))
  tag_text = _pick_by_keywords(raw_values, ("标签", "卖点", "类型", "场景"))
  notes = _pick_by_keywords(raw_values, ("备注", "说明", "复盘", "反馈"))
  joined_text = " ".join(value for value in raw_values.values() if value)
  return {
    "title": title,
    "platform": infer_platform(joined_text, platform or infer_platform(sheet_name)),
    "product_name": product,
    "creator_name": creator,
    "owner_name": owner,
    "tags": split_tags(tag_text),
    "notes": notes,
  }


def _pick_by_keywords(values: Dict[str, str], keywords: Iterable[str]) -> str:
  for header, value in values.items():
    if value and any(keyword.lower() in header.lower() for keyword in keywords):
      return value
  return ""


def _cell_text(cell: Any) -> str:
  if cell is None:
    return ""
  if isinstance(cell, str):
    return cell
  if isinstance(cell, (int, float, bool)):
    return str(cell)
  if isinstance(cell, list):
    return " ".join(_cell_text(item) for item in cell)
  if isinstance(cell, dict):
    for key in ("text", "name", "title", "url", "link"):
      value = cell.get(key)
      if isinstance(value, str) and value.strip():
        return value.strip()
    return " ".join(_cell_text(value) for value in cell.values())
  return str(cell)


def _extract_external_urls(row: Sequence[Any]) -> List[str]:
  urls: List[str] = []
  for cell in row:
    urls.extend(URL_PATTERN.findall(_cell_text(cell)))
  deduped: List[str] = []
  seen = set()
  for url in urls:
    if url in seen:
      continue
    seen.add(url)
    deduped.append(url)
  return deduped


def _iter_video_attachments(value: Any) -> Iterable[FeishuAttachment]:
  if isinstance(value, list):
    for item in value:
      yield from _iter_video_attachments(item)
    return
  if not isinstance(value, dict):
    return

  token = _first_string(value, ("file_token", "fileToken", "token", "tmp_url_token"))
  name = _first_string(value, ("name", "file_name", "filename", "title"))
  mime_type = _first_string(value, ("mime_type", "mimeType", "type"))
  size = _first_int(value, ("size", "file_size", "fileSize"))
  if token and _looks_like_video(name, mime_type):
    yield FeishuAttachment(
      file_token=token,
      name=name,
      mime_type=mime_type,
      size=size,
      raw=value,
    )

  for child_value in value.values():
    if child_value is not value:
      yield from _iter_video_attachments(child_value)


def _first_string(value: Dict[str, Any], keys: Sequence[str]) -> str:
  for key in keys:
    candidate = value.get(key)
    if isinstance(candidate, str) and candidate.strip():
      return candidate.strip()
  return ""


def _first_int(value: Dict[str, Any], keys: Sequence[str]) -> Optional[int]:
  for key in keys:
    candidate = value.get(key)
    try:
      if candidate is not None and str(candidate).strip():
        return int(candidate)
    except (TypeError, ValueError):
      continue
  return None


def _looks_like_video(name: str, mime_type: str) -> bool:
  if mime_type.lower().startswith("video/"):
    return True
  lowered_name = name.lower()
  return any(lowered_name.endswith(ext) for ext in VIDEO_EXTENSIONS)
