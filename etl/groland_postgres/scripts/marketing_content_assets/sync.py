from __future__ import annotations

import argparse
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic
from typing import Iterable, List, Sequence

from .feishu_drive import FeishuDriveClient
from .feishu_sheet import FeishuClient, parse_candidates_from_rows, resolve_sheet_refs
from .models import (
  DEFAULT_SHEET_IDS,
  DEFAULT_SOURCE_URL,
  DEFAULT_SPREADSHEET_TOKEN,
  ImportStats,
  SourceCandidate,
  UploadedObjects,
)
from .repository import (
  connect_pg,
  create_import_run,
  finish_import_run,
  is_candidate_recorded,
  upsert_external_asset,
  upsert_uploaded_asset,
)
from .tos_storage import (
  TosStorageClient,
  TosStorageConfig,
  build_object_key,
  guess_video_mime,
  sha256_file,
)
from .video_processing import process_video
from .video_processing import probe_video


VALID_MODES = {"dry-run", "sample-upload", "full-upload"}
VALID_DERIVATIVES_MODES = {"full", "raw-only"}


def run_content_asset_sync(
  mode: str,
  limit: int = 0,
  sheet_ids: Sequence[str] | None = None,
  source_url: str = DEFAULT_SOURCE_URL,
  spreadsheet_token: str = DEFAULT_SPREADSHEET_TOKEN,
  derivatives_mode: str = "full",
) -> dict:
  if mode not in VALID_MODES:
    raise ValueError(f"mode 必须是 {sorted(VALID_MODES)}")
  if derivatives_mode not in VALID_DERIVATIVES_MODES:
    raise ValueError(f"derivatives_mode 必须是 {sorted(VALID_DERIVATIVES_MODES)}")
  normalized_mode = mode.replace("-", "_")
  selected_sheet_ids = list(sheet_ids or DEFAULT_SHEET_IDS)
  run_id = uuid.uuid4()
  stats = ImportStats()
  _log(f"run_start mode={normalized_mode} derivatives={derivatives_mode} run_id={run_id}")

  with connect_pg() as conn:
    create_import_run(conn, run_id, normalized_mode, source_url, spreadsheet_token, selected_sheet_ids)

  try:
    _log(f"load_candidates_start sheets={','.join(selected_sheet_ids)}")
    candidates = _load_candidates(spreadsheet_token, selected_sheet_ids, source_url)
    _log(f"load_candidates_done candidates={len(candidates)}")
    stats.total_rows = _count_unique_rows(candidates)
    stats.attachment_count = sum(1 for candidate in candidates if candidate.attachment)
    selected_candidates = candidates[:limit] if limit and limit > 0 else candidates
    if mode == "dry-run":
      payload = {
        **stats.to_payload(),
        "runId": str(run_id),
        "mode": normalized_mode,
        "derivativesMode": derivatives_mode,
        "candidateCount": len(candidates),
        "selectedCount": len(selected_candidates),
        "sampleCandidates": [_candidate_preview(candidate) for candidate in selected_candidates[:20]],
      }
      with connect_pg() as conn:
        finish_import_run(conn, run_id, "succeeded", payload)
      return payload

    if mode == "sample-upload" and not limit:
      selected_candidates = candidates[:3]

    tos_client = TosStorageClient(TosStorageConfig.from_env())
    feishu_client = FeishuClient.from_env()
    drive_client = FeishuDriveClient(feishu_client)
    with tempfile.TemporaryDirectory(prefix="content-assets-") as temp_dir:
      temp_root = Path(temp_dir)
      for index, candidate in enumerate(selected_candidates, start=1):
        try:
          _log_candidate_start(index, len(selected_candidates), candidate)
          if _candidate_already_recorded(candidate, derivatives_mode):
            stats.skipped_count += 1
            _log(f"[{index}/{len(selected_candidates)}] skip_already_recorded row={candidate.sheet_id}:{candidate.row_index}")
            continue
          if candidate.external_only:
            _record_external_candidate(candidate)
            stats.external_only_count += 1
            _log(f"[{index}/{len(selected_candidates)}] external_recorded row={candidate.sheet_id}:{candidate.row_index}")
            continue
          _ingest_attachment_candidate(drive_client, tos_client, candidate, temp_root, derivatives_mode, index, len(selected_candidates))
          stats.uploaded_count += 1
          _log(f"[{index}/{len(selected_candidates)}] candidate_done row={candidate.sheet_id}:{candidate.row_index}")
        except Exception as error:  # noqa: BLE001 - worker needs per-row isolation
          stats.failed_count += 1
          stats.sample_errors.append(f"row={candidate.sheet_id}:{candidate.row_index} {type(error).__name__}: {error}")
          _log(f"[{index}/{len(selected_candidates)}] candidate_failed row={candidate.sheet_id}:{candidate.row_index} error={type(error).__name__}: {error}")
    payload = {
      **stats.to_payload(),
      "runId": str(run_id),
      "mode": normalized_mode,
      "derivativesMode": derivatives_mode,
      "selectedCount": len(selected_candidates),
    }
    with connect_pg() as conn:
      finish_import_run(conn, run_id, "succeeded" if stats.failed_count == 0 else "failed", payload)
    return payload
  except Exception as error:
    payload = {**stats.to_payload(), "runId": str(run_id), "mode": normalized_mode, "derivativesMode": derivatives_mode}
    try:
      with connect_pg() as conn:
        finish_import_run(conn, run_id, "failed", payload, error_message=str(error))
    except Exception:
      pass
    raise


def _candidate_already_recorded(candidate: SourceCandidate, derivatives_mode: str) -> bool:
  with connect_pg() as conn:
    return is_candidate_recorded(conn, candidate, require_derivatives=derivatives_mode == "full")


def _record_external_candidate(candidate: SourceCandidate) -> None:
  with connect_pg() as conn:
    upsert_external_asset(conn, candidate)


def _record_uploaded_candidate(candidate: SourceCandidate, objects: UploadedObjects, probe) -> None:
  with connect_pg() as conn:
    upsert_uploaded_asset(conn, candidate, objects, probe)


def _load_candidates(
  spreadsheet_token: str,
  sheet_ids: Sequence[str],
  source_url: str,
) -> List[SourceCandidate]:
  client = FeishuClient.from_env()
  candidates: List[SourceCandidate] = []
  for sheet_ref in resolve_sheet_refs(sheet_ids, spreadsheet_token):
    rows = client.get_sheet_values(sheet_ref.spreadsheet_token, sheet_ref.sheet_id)
    candidates.extend(parse_candidates_from_rows(rows, sheet_ref, source_url=source_url))
  return candidates


def _ingest_attachment_candidate(
  drive_client: FeishuDriveClient,
  tos_client: TosStorageClient,
  candidate: SourceCandidate,
  temp_root: Path,
  derivatives_mode: str,
  index: int,
  total: int,
) -> None:
  if not candidate.attachment:
    _record_external_candidate(candidate)
    return
  raw_name = candidate.attachment.name or f"{candidate.attachment.file_token}.mp4"
  raw_path = temp_root / "raw" / raw_name
  processed = None
  try:
    step_start = monotonic()
    _log(f"[{index}/{total}] download_start token={candidate.attachment.file_token[:8]} size={_format_bytes(candidate.attachment.size)}")
    drive_client.download_file(candidate.attachment.file_token, raw_path)
    _log(f"[{index}/{total}] download_done elapsed={_elapsed(step_start)} bytes={raw_path.stat().st_size}")
    step_start = monotonic()
    raw_sha256 = sha256_file(raw_path)
    _log(f"[{index}/{total}] sha256_done elapsed={_elapsed(step_start)} sha256={raw_sha256[:12]}")
    asset_id = candidate.make_asset_id(raw_sha256)
    ext = raw_path.suffix.lower() or ".mp4"
    now = datetime.now(timezone.utc)
    raw_key = build_object_key("raw", str(asset_id), raw_sha256, ext, now=now)
    preview_key = None
    cover_key = None
    preview_size = None
    if derivatives_mode == "full":
      step_start = monotonic()
      _log(f"[{index}/{total}] derivatives_start")
      processed = process_video(raw_path, temp_root / "processed", str(asset_id))
      preview_sha = sha256_file(processed.preview_path)
      cover_sha = sha256_file(processed.cover_path)
      preview_key = build_object_key("preview", str(asset_id), preview_sha, ".mp4", now=now)
      cover_key = build_object_key("cover", str(asset_id), cover_sha, ".webp", now=now)
      preview_size = processed.preview_path.stat().st_size
      probe = processed.probe
      _log(f"[{index}/{total}] derivatives_done elapsed={_elapsed(step_start)} preview_bytes={preview_size}")
    else:
      step_start = monotonic()
      _log(f"[{index}/{total}] probe_start")
      probe = probe_video(raw_path)
      _log(f"[{index}/{total}] probe_done elapsed={_elapsed(step_start)} duration={probe.duration_seconds} width={probe.width} height={probe.height}")
    step_start = monotonic()
    _log(f"[{index}/{total}] upload_raw_start key={raw_key}")
    tos_client.upload_file(raw_key, raw_path, guess_video_mime(raw_path))
    _log(f"[{index}/{total}] upload_raw_done elapsed={_elapsed(step_start)}")
    if processed and preview_key and cover_key:
      step_start = monotonic()
      _log(f"[{index}/{total}] upload_preview_start key={preview_key}")
      tos_client.upload_file(preview_key, processed.preview_path, "video/mp4")
      _log(f"[{index}/{total}] upload_preview_done elapsed={_elapsed(step_start)}")
      step_start = monotonic()
      _log(f"[{index}/{total}] upload_cover_start key={cover_key}")
      tos_client.upload_file(cover_key, processed.cover_path, "image/webp")
      _log(f"[{index}/{total}] upload_cover_done elapsed={_elapsed(step_start)}")
    objects = UploadedObjects(
      bucket=tos_client.config.bucket,
      raw_object_key=raw_key,
      preview_object_key=preview_key,
      cover_object_key=cover_key,
      raw_sha256=raw_sha256,
      file_ext=ext,
      mime_type=guess_video_mime(raw_path),
      file_size_bytes=raw_path.stat().st_size,
      preview_size_bytes=preview_size,
    )
    step_start = monotonic()
    _record_uploaded_candidate(candidate, objects, probe)
    _log(f"[{index}/{total}] db_done elapsed={_elapsed(step_start)} asset_id={asset_id}")
  finally:
    for path in (
      raw_path,
      processed.preview_path if processed else None,
      processed.cover_path if processed else None,
    ):
      if path and path.exists():
        path.unlink()


def _count_unique_rows(candidates: Iterable[SourceCandidate]) -> int:
  return len({(candidate.sheet_id, candidate.row_index) for candidate in candidates})


def _candidate_preview(candidate: SourceCandidate) -> dict:
  return {
    "title": candidate.title,
    "sourceKind": candidate.source_kind,
    "sheetId": candidate.sheet_id,
    "sheetName": candidate.sheet_name,
    "rowIndex": candidate.row_index,
    "platform": candidate.platform,
    "productName": candidate.product_name,
    "creatorName": candidate.creator_name,
    "externalOnly": candidate.external_only,
    "externalUrl": candidate.external_url,
    "attachmentName": candidate.attachment.name if candidate.attachment else "",
    "attachmentToken": candidate.attachment.file_token if candidate.attachment else "",
  }


def _log(message: str) -> None:
  timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
  print(f"[content-assets-sync] {timestamp} {message}", flush=True)


def _log_candidate_start(index: int, total: int, candidate: SourceCandidate) -> None:
  if candidate.attachment:
    size = _format_bytes(candidate.attachment.size)
    source = f"attachment token={candidate.attachment.file_token[:8]} size={size}"
  else:
    source = f"external url={(candidate.external_url or candidate.source_url)[:96]}"
  title = candidate.title.replace("\n", " ")[:120]
  _log(f"[{index}/{total}] candidate_start row={candidate.sheet_id}:{candidate.row_index} {source} title={title}")


def _elapsed(start: float) -> str:
  return f"{monotonic() - start:.1f}s"


def _format_bytes(value: int | None) -> str:
  if not value:
    return "unknown"
  units = ("B", "KB", "MB", "GB")
  size = float(value)
  for unit in units:
    if size < 1024 or unit == units[-1]:
      return f"{size:.1f}{unit}"
    size /= 1024
  return f"{value}B"


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Sync Feishu video materials into Groland content assets.")
  parser.add_argument("--mode", choices=sorted(VALID_MODES), default=os.getenv("CONTENT_ASSET_SYNC_MODE", "dry-run"))
  parser.add_argument("--limit", type=int, default=int(os.getenv("CONTENT_ASSET_SYNC_LIMIT", "0") or "0"))
  parser.add_argument("--sheet-id", action="append", dest="sheet_ids", help="Limit to one or more Feishu sheet IDs.")
  parser.add_argument("--source-url", default=os.getenv("CONTENT_ASSET_FEISHU_SOURCE_URL", DEFAULT_SOURCE_URL))
  parser.add_argument("--spreadsheet-token", default=os.getenv("CONTENT_ASSET_FEISHU_SPREADSHEET_TOKEN", DEFAULT_SPREADSHEET_TOKEN))
  parser.add_argument("--derivatives", choices=sorted(VALID_DERIVATIVES_MODES), default=os.getenv("CONTENT_ASSET_DERIVATIVES_MODE", "full"))
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  result = run_content_asset_sync(
    mode=args.mode,
    limit=args.limit,
    sheet_ids=args.sheet_ids,
    source_url=args.source_url,
    spreadsheet_token=args.spreadsheet_token,
    derivatives_mode=args.derivatives,
  )
  print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
