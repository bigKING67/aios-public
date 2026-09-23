from __future__ import annotations

import argparse
import json
import os
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic
from typing import Any

import psycopg2.extras

from .repository import connect_pg
from .tos_storage import TosStorageClient, TosStorageConfig, build_object_key, sha256_file
from .video_processing import process_video
from .yuntu_archive_repository import upsert_archived_asset_derivatives


DEFAULT_SOURCE_TASK_NAMES = (
  "yuntu_goods_video_202605",
  "yuntu_live_lead_video_202605",
)


@dataclass(frozen=True)
class BackfillCandidate:
  asset_id: uuid.UUID
  bucket: str
  raw_object_key: str
  raw_sha256: str
  file_ext: str
  source_task_names: tuple[str, ...]
  source_rank: int | None
  video_title: str

  @classmethod
  def from_row(cls, row: dict[str, Any]) -> "BackfillCandidate":
    source_task_names = row.get("source_task_names") or []
    return cls(
      asset_id=uuid.UUID(str(row["asset_id"])),
      bucket=str(row.get("bucket") or "aios-content-assets"),
      raw_object_key=str(row.get("raw_object_key") or ""),
      raw_sha256=str(row.get("raw_sha256") or ""),
      file_ext=str(row.get("file_ext") or ""),
      source_task_names=tuple(str(value) for value in source_task_names if value),
      source_rank=row.get("source_rank"),
      video_title=str(row.get("video_title") or ""),
    )


@dataclass(frozen=True)
class BackfillResult:
  asset_id: uuid.UUID
  status: str
  source_task_names: tuple[str, ...]
  preview_object_key: str = ""
  cover_object_key: str = ""
  elapsed_seconds: float = 0
  error: str = ""

  def to_dict(self) -> dict[str, Any]:
    return {
      "assetId": str(self.asset_id),
      "status": self.status,
      "sourceTaskNames": list(self.source_task_names),
      "previewObjectKey": self.preview_object_key,
      "coverObjectKey": self.cover_object_key,
      "elapsedSeconds": round(self.elapsed_seconds, 2),
      "error": self.error,
    }


def list_candidates(
  *,
  source_task_names: tuple[str, ...],
  limit: int,
  include_existing: bool,
) -> list[BackfillCandidate]:
  with connect_pg() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      SELECT
        a.asset_id,
        a.bucket,
        a.raw_object_key,
        a.raw_sha256,
        a.file_ext,
        ARRAY_AGG(DISTINCT row.source_task_name ORDER BY row.source_task_name) AS source_task_names,
        MIN(row.source_rank) AS source_rank,
        MIN(NULLIF(row.video_title, '')) AS video_title
      FROM ods.douyin_qianchuan_industry_brand_short_video_material_raw row
      JOIN ads.marketing_content_assets a ON a.asset_id = row.asset_id
      WHERE row.source_task_name = ANY(%s)
        AND row.asset_id IS NOT NULL
        AND a.is_deleted = FALSE
        AND a.external_only = FALSE
        AND NULLIF(a.raw_object_key, '') IS NOT NULL
        AND (
          %s
          OR a.preview_object_key IS NULL
          OR a.cover_object_key IS NULL
        )
      GROUP BY
        a.asset_id, a.bucket, a.raw_object_key, a.raw_sha256, a.file_ext
      ORDER BY MIN(row.source_task_name), MIN(row.source_rank), a.asset_id
      LIMIT CASE WHEN %s > 0 THEN %s ELSE 2147483647 END
      """,
      (list(source_task_names), include_existing, limit, limit),
    )
    rows = cur.fetchall()
  return [BackfillCandidate.from_row(dict(row)) for row in rows]


def process_candidate(
  candidate: BackfillCandidate,
  *,
  config: TosStorageConfig,
  temp_root: Path | None,
  run_id: uuid.UUID,
) -> BackfillResult:
  started = monotonic()
  storage = _storage_for_bucket(config, candidate.bucket)
  ext = _normalize_ext(candidate.file_ext or Path(candidate.raw_object_key).suffix or ".mp4")
  try:
    with tempfile.TemporaryDirectory(prefix="yuntu-derivatives-", dir=str(temp_root) if temp_root else None) as temp_dir:
      temp_path = Path(temp_dir)
      raw_path = temp_path / f"{candidate.asset_id}{ext}"
      storage.download_file(candidate.raw_object_key, raw_path)
      downloaded_sha256 = sha256_file(raw_path)
      if candidate.raw_sha256 and downloaded_sha256 != candidate.raw_sha256:
        raise RuntimeError(
          "raw sha256 mismatch "
          f"asset_id={candidate.asset_id} expected={candidate.raw_sha256[:12]} got={downloaded_sha256[:12]}"
        )

      processed = process_video(raw_path, temp_path / "processed", str(candidate.asset_id))
      preview_sha256 = sha256_file(processed.preview_path)
      cover_sha256 = sha256_file(processed.cover_path)
      now = datetime.now(timezone.utc)
      preview_object_key = build_object_key("preview", str(candidate.asset_id), preview_sha256, ".mp4", now=now)
      cover_object_key = build_object_key("cover", str(candidate.asset_id), cover_sha256, ".webp", now=now)
      storage.upload_file(preview_object_key, processed.preview_path, "video/mp4")
      storage.upload_file(cover_object_key, processed.cover_path, "image/webp")

      metadata = {
        "sourceSystem": "yuntu",
        "sourceTaskNames": list(candidate.source_task_names),
        "sourceRank": candidate.source_rank,
        "videoTitle": candidate.video_title,
        "rawObjectKey": candidate.raw_object_key,
        "rawSha256": downloaded_sha256,
        "backfillKind": "yuntu_preview_cover_backfill",
        "backfillRunId": str(run_id),
      }
      with connect_pg() as conn:
        upsert_archived_asset_derivatives(
          conn,
          asset_id=candidate.asset_id,
          bucket=candidate.bucket,
          preview_object_key=preview_object_key,
          preview_size_bytes=processed.preview_path.stat().st_size,
          preview_sha256=preview_sha256,
          cover_object_key=cover_object_key,
          cover_size_bytes=processed.cover_path.stat().st_size,
          cover_sha256=cover_sha256,
          probe=processed.probe,
          metadata=metadata,
        )
      return BackfillResult(
        asset_id=candidate.asset_id,
        status="succeeded",
        source_task_names=candidate.source_task_names,
        preview_object_key=preview_object_key,
        cover_object_key=cover_object_key,
        elapsed_seconds=monotonic() - started,
      )
  except Exception as error:  # noqa: BLE001 - keep batch running and report per-asset failures
    return BackfillResult(
      asset_id=candidate.asset_id,
      status="failed",
      source_task_names=candidate.source_task_names,
      elapsed_seconds=monotonic() - started,
      error=f"{type(error).__name__}: {error}"[:1000],
    )


def _storage_for_bucket(config: TosStorageConfig, bucket: str) -> TosStorageClient:
  if not bucket or bucket == config.bucket:
    return TosStorageClient(config)
  return TosStorageClient(replace(config, bucket=bucket))


def _normalize_ext(value: str) -> str:
  text = value.strip().lower() or ".mp4"
  return text if text.startswith(".") else f".{text}"


def _log(message: str) -> None:
  timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
  print(f"[yuntu-derivatives-backfill] {timestamp} {message}", flush=True)


def main() -> int:
  parser = argparse.ArgumentParser(description="Backfill preview/cover derivatives for archived Yuntu videos.")
  parser.add_argument("--source-task-name", action="append", dest="source_task_names")
  parser.add_argument("--limit", type=int, default=0)
  parser.add_argument("--workers", type=int, default=int(os.getenv("YUNTU_DERIVATIVES_BACKFILL_WORKERS", "2")))
  parser.add_argument("--temp-root", type=Path)
  parser.add_argument("--dry-run", action="store_true")
  parser.add_argument("--include-existing", action="store_true", help="Regenerate derivatives even when preview/cover already exist.")
  args = parser.parse_args()

  source_task_names = tuple(args.source_task_names or DEFAULT_SOURCE_TASK_NAMES)
  candidates = list_candidates(
    source_task_names=source_task_names,
    limit=args.limit,
    include_existing=args.include_existing,
  )
  run_id = uuid.uuid4()
  summary = {
    "runId": str(run_id),
    "sourceTaskNames": list(source_task_names),
    "candidateCount": len(candidates),
    "limit": args.limit,
    "includeExisting": args.include_existing,
  }
  if args.dry_run:
    print(json.dumps({
      **summary,
      "sampleCandidates": [
        {
          "assetId": str(candidate.asset_id),
          "sourceTaskNames": list(candidate.source_task_names),
          "sourceRank": candidate.source_rank,
          "rawObjectKey": candidate.raw_object_key,
        }
        for candidate in candidates[:20]
      ],
    }, ensure_ascii=False, indent=2))
    return 0

  if not candidates:
    print(json.dumps({**summary, "succeeded": 0, "failed": 0}, ensure_ascii=False, indent=2))
    return 0

  config = TosStorageConfig.from_env()
  workers = max(1, int(args.workers or 1))
  _log(f"start run_id={run_id} candidates={len(candidates)} workers={workers}")
  succeeded = 0
  failed = 0
  sample_errors: list[dict[str, Any]] = []
  with ThreadPoolExecutor(max_workers=workers) as pool:
    futures = [
      pool.submit(process_candidate, candidate, config=config, temp_root=args.temp_root, run_id=run_id)
      for candidate in candidates
    ]
    total = len(futures)
    for index, future in enumerate(as_completed(futures), start=1):
      result = future.result()
      if result.status == "succeeded":
        succeeded += 1
        _log(f"done {index}/{total} asset_id={result.asset_id} elapsed={result.elapsed_seconds:.2f}s")
      else:
        failed += 1
        if len(sample_errors) < 20:
          sample_errors.append(result.to_dict())
        _log(f"failed {index}/{total} asset_id={result.asset_id} error={result.error}")

  print(json.dumps({
    **summary,
    "workers": workers,
    "succeeded": succeeded,
    "failed": failed,
    "sampleErrors": sample_errors,
  }, ensure_ascii=False, indent=2))
  return 1 if failed else 0


if __name__ == "__main__":
  raise SystemExit(main())
