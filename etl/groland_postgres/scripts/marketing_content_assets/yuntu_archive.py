from __future__ import annotations

import argparse
import json
import os
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .models import VideoProbe
from .repository import connect_pg
from .video_processing import VideoProcessingError, probe_video, process_video
from .yuntu_archive_models import archive_records_from_page_batch, stable_uuid
from .yuntu_archive_repository import (
  ClaimRecord,
  claim_next_archive_record,
  count_archive_statuses,
  find_asset_by_sha256,
  mark_archive_failed,
  mark_archive_success,
  requeue_failed,
  upsert_archive_record,
  upsert_archived_asset,
  upsert_archived_asset_derivatives,
)


@dataclass(frozen=True)
class ArchiveProcessResult:
  processed: bool
  archive_id: uuid.UUID | None = None
  asset_id: uuid.UUID | None = None
  raw_sha256: str = ""
  raw_object_key: str = ""
  status: str = "idle"
  error: str = ""

  def to_dict(self) -> dict[str, Any]:
    return {
      "processed": self.processed,
      "archiveId": str(self.archive_id) if self.archive_id else "",
      "assetId": str(self.asset_id) if self.asset_id else "",
      "rawSha256": self.raw_sha256,
      "rawObjectKey": self.raw_object_key,
      "status": self.status,
      "error": self.error,
    }


class YuntuArchiveProcessor:
  def __init__(
    self,
    *,
    temp_root: Path | None = None,
    keep_failed: bool = False,
    download_timeout_seconds: int = 90,
    user_agent: str | None = None,
  ) -> None:
    self.temp_root = temp_root
    self.keep_failed = keep_failed
    self.download_timeout_seconds = download_timeout_seconds
    self.user_agent = user_agent or os.getenv("YUNTU_ARCHIVE_USER_AGENT") or "yuntu-cdn-archiver/1.0"

  def enqueue_page_batch(self, payload: Mapping[str, Any]) -> dict[str, Any]:
    records = archive_records_from_page_batch(payload)
    result = {
      "accepted": len(records),
      "queued": 0,
      "skipped": 0,
      "alreadySucceeded": 0,
      "records": [],
    }
    with connect_pg() as conn:
      for record in records:
        upserted = upsert_archive_record(conn, record)
        if upserted.archive_status == "queued":
          result["queued"] += 1
        elif upserted.archive_status == "skipped":
          result["skipped"] += 1
        elif upserted.archive_status == "succeeded":
          result["alreadySucceeded"] += 1
        result["records"].append({
          "rank": record.source_rank,
          "archiveId": str(upserted.archive_id),
          "status": upserted.archive_status,
          "assetId": str(upserted.asset_id) if upserted.asset_id else "",
        })
      statuses = count_archive_statuses(conn)
    result["statusCounts"] = statuses
    result["pendingCount"] = statuses.get("queued", 0) + statuses.get("running", 0)
    return result

  def process_one(self) -> ArchiveProcessResult:
    try:
      with connect_pg() as conn:
        claim = claim_next_archive_record(conn)
    except Exception as error:  # noqa: BLE001 - transient PG issues should not kill workers
      error_message = f"{type(error).__name__}: {error}"
      _log(f"archive_claim_failed {error_message}")
      return ArchiveProcessResult(processed=False, status="claim_failed", error=error_message)
    if not claim:
      return ArchiveProcessResult(processed=False, status="idle")

    try:
      return self._process_claim(claim)
    except Exception as error:  # noqa: BLE001 - isolate per source record
      error_message = f"{type(error).__name__}: {error}"
      try:
        with connect_pg() as conn:
          mark_archive_failed(conn, claim.archive_id, error_message)
      except Exception:
        pass
      return ArchiveProcessResult(processed=True, archive_id=claim.archive_id, status="failed", error=error_message)

  def process_until_idle(self, *, max_records: int = 0) -> dict[str, Any]:
    processed = 0
    failed = 0
    succeeded = 0
    results: list[dict[str, Any]] = []
    while max_records <= 0 or processed < max_records:
      result = self.process_one()
      if not result.processed:
        break
      processed += 1
      if result.status == "succeeded":
        succeeded += 1
      elif result.status == "failed":
        failed += 1
      if len(results) < 20:
        results.append(result.to_dict())
    with connect_pg() as conn:
      statuses = count_archive_statuses(conn)
    return {
      "processed": processed,
      "succeeded": succeeded,
      "failed": failed,
      "sampleResults": results,
      "statusCounts": statuses,
      "pendingCount": statuses.get("queued", 0) + statuses.get("running", 0),
    }

  def _process_claim(self, claim: ClaimRecord) -> ArchiveProcessResult:
    from .tos_storage import TosStorageClient, TosStorageConfig, build_object_key, guess_video_mime, sha256_file

    started = monotonic()
    tos_client = TosStorageClient(TosStorageConfig.from_env())
    temp_base = self.temp_root
    with tempfile.TemporaryDirectory(prefix="yuntu-archive-", dir=str(temp_base) if temp_base else None) as temp_dir:
      temp_path = Path(temp_dir)
      raw_path = temp_path / f"{claim.archive_id}.mp4"
      part_path = temp_path / f"{claim.archive_id}.mp4.part"
      try:
        self.download_cdn(claim.cdn_url, part_path, referer=claim.source_page_url)
        part_path.rename(raw_path)
        raw_sha256 = sha256_file(raw_path)
        raw_size = raw_path.stat().st_size
        probe = self._probe_or_empty(raw_path)
        ext = raw_path.suffix.lower() or ".mp4"
        mime_type = guess_video_mime(raw_path)

        with connect_pg() as conn:
          existing = find_asset_by_sha256(conn, raw_sha256)
        if existing:
          asset_id = uuid.UUID(str(existing["asset_id"]))
          raw_object_key = str(existing.get("raw_object_key") or "")
          bucket = str(existing.get("bucket") or tos_client.config.bucket)
          if not raw_object_key:
            raw_object_key = build_object_key("raw", str(asset_id), raw_sha256, ext, now=datetime.now(timezone.utc))
            tos_client.upload_file(raw_object_key, raw_path, mime_type)
        else:
          asset_id = stable_uuid(f"sha256:{raw_sha256}")
          raw_object_key = build_object_key("raw", str(asset_id), raw_sha256, ext, now=datetime.now(timezone.utc))
          bucket = tos_client.config.bucket
          tos_client.upload_file(raw_object_key, raw_path, mime_type)

        with connect_pg() as conn:
          upsert_archived_asset(
            conn,
            claim,
            asset_id=asset_id,
            bucket=bucket,
            raw_object_key=raw_object_key,
            raw_sha256=raw_sha256,
            file_ext=ext,
            mime_type=mime_type,
            file_size_bytes=raw_size,
            probe=probe,
          )

        processed = process_video(raw_path, temp_path / "processed", str(asset_id))
        preview_sha256 = sha256_file(processed.preview_path)
        cover_sha256 = sha256_file(processed.cover_path)
        derivative_now = datetime.now(timezone.utc)
        preview_object_key = build_object_key("preview", str(asset_id), preview_sha256, ".mp4", now=derivative_now)
        cover_object_key = build_object_key("cover", str(asset_id), cover_sha256, ".webp", now=derivative_now)
        tos_client.upload_file(preview_object_key, processed.preview_path, "video/mp4")
        tos_client.upload_file(cover_object_key, processed.cover_path, "image/webp")

        with connect_pg() as conn:
          upsert_archived_asset_derivatives(
            conn,
            asset_id=asset_id,
            bucket=bucket,
            preview_object_key=preview_object_key,
            preview_size_bytes=processed.preview_path.stat().st_size,
            preview_sha256=preview_sha256,
            cover_object_key=cover_object_key,
            cover_size_bytes=processed.cover_path.stat().st_size,
            cover_sha256=cover_sha256,
            probe=processed.probe,
            metadata={
              "sourceSystem": claim.source_system,
              "sourceTaskName": claim.source_task_name,
              "dateLabel": claim.date_label,
              "sourceRank": claim.source_rank,
              "sourceRecordKey": claim.source_record_key,
              "rawObjectKey": raw_object_key,
            },
          )
          mark_archive_success(
            conn,
            claim,
            asset_id=asset_id,
            bucket=bucket,
            raw_object_key=raw_object_key,
            raw_sha256=raw_sha256,
            file_ext=ext,
            mime_type=mime_type,
            file_size_bytes=raw_size,
            probe=processed.probe,
          )
        _log(
          "archive_done "
          f"archive_id={claim.archive_id} rank={claim.source_rank} asset_id={asset_id} "
          f"sha256={raw_sha256[:12]} elapsed={_elapsed(started)}"
        )
        return ArchiveProcessResult(
          processed=True,
          archive_id=claim.archive_id,
          asset_id=asset_id,
          raw_sha256=raw_sha256,
          raw_object_key=raw_object_key,
          status="succeeded",
        )
      finally:
        if not self.keep_failed:
          for path in (part_path, raw_path):
            if path.exists():
              path.unlink()

  def download_cdn(self, url: str, target_path: Path, *, referer: str = "") -> None:
    if not url:
      raise ValueError("empty CDN url")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    headers = {
      "User-Agent": self.user_agent,
      "Accept": "video/*,*/*;q=0.8",
    }
    if referer:
      headers["Referer"] = referer
    request = Request(url, headers=headers)
    try:
      response = urlopen(request, timeout=self.download_timeout_seconds)
    except HTTPError as error:
      body = error.read(240).decode("utf-8", errors="replace")
      raise RuntimeError(f"CDN 下载失败 HTTP {error.code}: {body}") from error
    except URLError as error:
      raise RuntimeError(f"CDN 下载失败: {error.reason}") from error

    with response:
      status = getattr(response, "status", 200)
      if status != 200:
        body = response.read(240).decode("utf-8", errors="replace")
        raise RuntimeError(f"CDN 下载失败 HTTP {status}: {body}")
      with target_path.open("wb") as file_obj:
        while True:
          chunk = response.read(1024 * 1024)
          if not chunk:
            break
          if chunk:
            file_obj.write(chunk)
    if target_path.stat().st_size <= 0:
      raise RuntimeError("CDN 下载结果为空文件")

  def _probe_or_empty(self, path: Path) -> VideoProbe:
    try:
      return probe_video(path)
    except (VideoProcessingError, FileNotFoundError):
      return VideoProbe()


def dry_run_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
  records = archive_records_from_page_batch(payload)
  return {
    "accepted": len(records),
    "queued": sum(1 for record in records if record.should_download),
    "skipped": sum(1 for record in records if not record.should_download),
    "sampleRecords": [
      {
        "rank": record.source_rank,
        "title": record.video_title,
        "videoId": record.source_video_id,
        "materialId": record.source_material_id,
        "hasCdn": bool(record.cdn_url),
        "mappingConfidence": record.mapping_confidence,
        "hasExplicitDouyinId": bool(record.aweme_id or record.item_id or record.group_id),
      }
      for record in records[:20]
    ],
  }


def _load_payload_records(path: Path) -> list[Mapping[str, Any]]:
  payload = json.loads(path.read_text(encoding="utf-8"))
  if "records" in payload and "sourceTaskName" in payload:
    return [payload]

  task_name = str(
    payload.get("outputBaseName")
    or ((payload.get("schema") or {}).get("outputBaseName"))
    or payload.get("taskName")
    or ((payload.get("schema") or {}).get("taskName"))
    or ""
  )
  date_label = str((payload.get("schema") or {}).get("dateLabel") or payload.get("dateLabel") or "")
  page_url = str(payload.get("pageUrl") or "")
  cdn = payload.get("cdn") or {}
  cdns = cdn.get("cdns") or {}
  evidence = cdn.get("rankToCdnEvidence") or {}
  rows = payload.get("rows") or ((payload.get("meta") or {}).get("data") or [])
  grouped: dict[int, list[dict[str, Any]]] = {}
  for row in rows:
    rank = str(row.get("排名") or "")
    page_number = int(row.get("_采集页") or 0)
    item = {
      "rank": rank,
      "pageNumber": page_number or None,
      "itemIndex": ((int(rank) - 1) % 5 + 1) if rank.isdigit() else None,
      "title": row.get("视频内容") or "",
      "videoId": row.get("视频ID") or (cdn.get("rankToVideoId") or {}).get(rank) or "",
      "materialId": row.get("_素材ID") or "",
      "cdnUrl": row.get("CDN直链") or cdns.get(rank) or "",
      "cdnStatus": row.get("CDN状态") or "",
      "cdnMissingReason": row.get("CDN缺失原因") or "",
      "cdnEvidence": evidence.get(rank) or {},
      "rowPayload": row,
    }
    grouped.setdefault(page_number or 0, []).append(item)
  return [
    {
      "sourceSystem": "yuntu",
      "sourceTaskName": task_name,
      "dateLabel": date_label,
      "outputBaseName": task_name,
      "pageUrl": page_url,
      "pageNumber": page_number or None,
      "records": records,
    }
    for page_number, records in sorted(grouped.items())
  ]


def _log(message: str) -> None:
  timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
  print(f"[yuntu-archive] {timestamp} {message}", flush=True)


def _elapsed(started: float) -> str:
  return f"{monotonic() - started:.2f}s"


def main() -> int:
  parser = argparse.ArgumentParser(description="Archive Yuntu CDN videos into local AIOS TOS/ODS/ADS.")
  parser.add_argument("--payload", type=Path, help="Yuntu payload JSON or page-batch JSON")
  parser.add_argument("--mode", choices=["dry-run", "enqueue", "full-upload", "retry-failed", "status"], default="dry-run")
  parser.add_argument("--limit", type=int, default=0)
  parser.add_argument("--concurrency", type=int, default=int(os.getenv("YUNTU_ARCHIVE_CONCURRENCY", "3")))
  parser.add_argument("--keep-failed", action="store_true")
  args = parser.parse_args()

  processor = YuntuArchiveProcessor(keep_failed=args.keep_failed)
  if args.mode == "status":
    with connect_pg() as conn:
      statuses = count_archive_statuses(conn)
    print(json.dumps({"statusCounts": statuses, "pendingCount": statuses.get("queued", 0) + statuses.get("running", 0)}, ensure_ascii=False, indent=2))
    return 0
  if args.mode == "retry-failed":
    with connect_pg() as conn:
      count = requeue_failed(conn, limit=args.limit)
    print(json.dumps({"requeued": count}, ensure_ascii=False, indent=2))
    return 0
  if not args.payload:
    parser.error("--payload is required unless --mode status/retry-failed")

  batches = _load_payload_records(args.payload)
  if args.mode == "dry-run":
    sample = [dry_run_payload(batch) for batch in batches[:5]]
    print(json.dumps({"batches": len(batches), "sample": sample}, ensure_ascii=False, indent=2))
    return 0

  accepted = queued = skipped = already = 0
  for batch in batches:
    result = processor.enqueue_page_batch(batch)
    accepted += int(result.get("accepted") or 0)
    queued += int(result.get("queued") or 0)
    skipped += int(result.get("skipped") or 0)
    already += int(result.get("alreadySucceeded") or 0)
  enqueue_result = {"accepted": accepted, "queued": queued, "skipped": skipped, "alreadySucceeded": already}
  if args.mode == "enqueue":
    print(json.dumps(enqueue_result, ensure_ascii=False, indent=2))
    return 0

  workers = max(1, args.concurrency)
  max_records = args.limit if args.limit > 0 else queued
  per_worker_limit = max(1, int(max_records / workers) + 1) if max_records else 0
  results = []
  with ThreadPoolExecutor(max_workers=workers) as pool:
    futures = [pool.submit(YuntuArchiveProcessor(keep_failed=args.keep_failed).process_until_idle, max_records=per_worker_limit) for _ in range(workers)]
    for future in as_completed(futures):
      results.append(future.result())
  print(json.dumps({"enqueue": enqueue_result, "workers": workers, "results": results}, ensure_ascii=False, indent=2))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
