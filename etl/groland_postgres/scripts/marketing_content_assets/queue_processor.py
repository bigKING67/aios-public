from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Dict, Optional

from .models import ProcessingBatch
from .repository import (
  claim_next_processing_batch,
  complete_processing_batch,
  connect_pg,
  fail_processing_batch,
)
from .tos_storage import TosStorageClient, TosStorageConfig, sha256_file
from .video_processing import process_video
from .worker_runtime import update_processing_job_stage


def process_content_asset_jobs(limit: int = 10, temp_root: Optional[Path] = None) -> Dict[str, int]:
  stats = {
    "claimed": 0,
    "succeeded": 0,
    "failed": 0,
    "empty": 0,
  }
  storage = TosStorageClient(TosStorageConfig.from_env())
  with tempfile.TemporaryDirectory(prefix="content-assets-jobs-", dir=str(temp_root) if temp_root else None) as tmp_dir:
    work_root = Path(tmp_dir)
    for _ in range(max(1, limit)):
      with connect_pg() as conn:
        batch = claim_next_processing_batch(conn)
      if batch is None:
        stats["empty"] += 1
        break
      stats["claimed"] += len(batch.jobs)
      try:
        _process_batch(storage, batch, work_root / str(batch.asset_id))
      except Exception as error:  # noqa: BLE001 - worker 必须把真实失败写回队列表
        with connect_pg() as conn:
          fail_processing_batch(conn, batch, str(error))
        stats["failed"] += len(batch.jobs)
      else:
        stats["succeeded"] += len(batch.jobs)
  return stats


def _process_batch(storage: TosStorageClient, batch: ProcessingBatch, work_dir: Path) -> None:
  if not batch.raw_object_key:
    raise RuntimeError(f"asset_id={batch.asset_id} 缺少 raw_object_key")
  work_dir.mkdir(parents=True, exist_ok=True)
  raw_ext = _normalize_ext(batch.file_ext) or _normalize_ext(Path(batch.raw_object_key).suffix) or ".mp4"
  raw_path = work_dir / f"raw{raw_ext}"
  _update_batch_stage(batch, "downloading_raw", "下载源视频", 20)
  storage.download_file(batch.raw_object_key, raw_path)
  _update_batch_stage(batch, "validating_raw", "校验源视频", 32)
  raw_sha256 = sha256_file(raw_path)
  raw_size_bytes = raw_path.stat().st_size

  _update_batch_stage(batch, "building_derivatives", "生成预览和封面", 45)
  processed = process_video(raw_path, work_dir, str(batch.asset_id))
  preview_key = _output_key_for(batch, "preview")
  cover_key = _output_key_for(batch, "cover")
  requested_types = {job.job_type for job in batch.jobs}
  if "preview" in requested_types and not preview_key:
    raise RuntimeError(f"asset_id={batch.asset_id} preview job 缺少 output_object_key")
  if "cover" in requested_types and not cover_key:
    raise RuntimeError(f"asset_id={batch.asset_id} cover job 缺少 output_object_key")

  _update_batch_stage(batch, "uploading_outputs", "上传衍生文件", 76)
  if preview_key:
    storage.upload_file(preview_key, processed.preview_path, "video/mp4")
  if cover_key:
    storage.upload_file(cover_key, processed.cover_path, "image/webp")

  _update_batch_stage(batch, "writing_results", "写入处理结果", 92)
  with connect_pg() as conn:
    complete_processing_batch(
      conn,
      batch,
      processed.probe,
      raw_sha256,
      raw_size_bytes,
      preview_key,
      processed.preview_path.stat().st_size if preview_key else None,
      cover_key,
      processed.cover_path.stat().st_size if cover_key else None,
    )


def _output_key_for(batch: ProcessingBatch, job_type: str) -> Optional[str]:
  for job in batch.jobs:
    if job.job_type == job_type and job.output_object_key:
      return job.output_object_key
  return None


def _update_batch_stage(batch: ProcessingBatch, stage: str, label: str, progress_percent: int) -> None:
  with connect_pg() as conn:
    for job in batch.jobs:
      update_processing_job_stage(
        conn,
        job.job_id,
        stage,
        label,
        progress_percent,
        {"asset_id": batch.asset_id, "job_type": job.job_type},
      )


def _normalize_ext(value: str) -> str:
  normalized = (value or "").strip().lower()
  if not normalized:
    return ""
  return normalized if normalized.startswith(".") else f".{normalized}"
