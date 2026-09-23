from __future__ import annotations

import json
import mimetypes
import uuid
from pathlib import Path
from typing import Any, Callable, Literal, TypedDict

import psycopg2

from .repository import connect_pg
from .tos_storage import TosStorageClient, build_object_key, sha256_file
from .video_processing import build_analysis_proxy_video


InputRole = Literal["preview", "raw"]


class VideoModelInput(TypedDict):
  video_url: str
  model_input_role: str
  model_input_object_key: str
  strategy: str
  source_size_bytes: int | None


def prepare_video_model_input(
  *,
  storage: TosStorageClient,
  job: dict[str, Any],
  work_dir: Path,
  input_role: InputRole,
  input_object_key: str,
  signed_url_ttl: int,
  url_max_bytes: int,
  proxy_target_bytes: int,
  proxy_created_by: str,
  on_stage: Callable[[str, str, int, dict[str, Any] | None], None] | None = None,
) -> VideoModelInput:
  source_size_bytes = input_size_bytes(job, input_role)
  response_content_type = response_video_content_type(job, input_object_key)
  if source_size_bytes is None or source_size_bytes <= url_max_bytes:
    if on_stage:
      on_stage(
        "signed_url_ready",
        "已生成模型读取地址",
        32,
        {"inputRole": input_role, "sourceSizeBytes": source_size_bytes},
      )
    strategy = "signed_url"
    if response_content_type:
      strategy = "signed_url_content_type_override"
    return {
      "video_url": storage.presign_get_url(
        input_object_key,
        ttl_seconds=signed_url_ttl,
        response_content_type=response_content_type,
      ),
      "model_input_role": input_role,
      "model_input_object_key": input_object_key,
      "strategy": strategy,
      "source_size_bytes": source_size_bytes,
    }

  proxy_object_key = str(job.get("analysis_proxy_object_key") or "").strip()
  if not proxy_object_key:
    proxy_object_key = create_analysis_proxy(
      storage=storage,
      job=job,
      work_dir=work_dir,
      input_role=input_role,
      input_object_key=input_object_key,
      target_size_bytes=proxy_target_bytes,
      created_by=proxy_created_by,
      on_stage=on_stage,
    )
  elif on_stage:
    on_stage(
      "proxy_reused",
      "复用已生成的代理视频",
      34,
      {"inputRole": input_role, "proxyObjectKey": proxy_object_key},
    )
  return {
    "video_url": storage.presign_get_url(
      proxy_object_key,
      ttl_seconds=signed_url_ttl,
      response_content_type="video/mp4",
    ),
    "model_input_role": "analysis_proxy",
    "model_input_object_key": proxy_object_key,
    "strategy": "analysis_proxy_signed_url",
    "source_size_bytes": source_size_bytes,
  }


def response_video_content_type(job: dict[str, Any], object_key: str) -> str:
  mime_type = str(job.get("mime_type") or "").strip().lower()
  if mime_type.startswith("video/"):
    return mime_type
  guessed = mimetypes.guess_type(object_key)[0] or ""
  if guessed.startswith("video/"):
    return guessed
  return ""


def input_size_bytes(job: dict[str, Any], input_role: InputRole) -> int | None:
  value = job.get("preview_size_bytes") if input_role == "preview" else job.get("file_size_bytes")
  try:
    return int(value) if value is not None else None
  except (TypeError, ValueError):
    return None


def create_analysis_proxy(
  *,
  storage: TosStorageClient,
  job: dict[str, Any],
  work_dir: Path,
  input_role: InputRole,
  input_object_key: str,
  target_size_bytes: int,
  created_by: str,
  on_stage: Callable[[str, str, int, dict[str, Any] | None], None] | None = None,
) -> str:
  asset_id = str(job["asset_id"])
  file_ext = str(job.get("file_ext") or ".mp4")
  file_ext = file_ext if file_ext.startswith(".") else f".{file_ext}"
  work_dir.mkdir(parents=True, exist_ok=True)
  source_path = work_dir / f"source{file_ext.lower()}"
  proxy_dir = work_dir / "proxy"
  if on_stage:
    on_stage("downloading_source", "下载源视频", 18, {"inputRole": input_role})
  storage.download_file(input_object_key, source_path)
  if on_stage:
    on_stage(
      "building_proxy",
      "生成模型代理视频",
      28,
      {"inputRole": input_role, "targetSizeBytes": target_size_bytes},
    )
  proxy_path = build_analysis_proxy_video(
    source_path,
    proxy_dir,
    asset_id,
    target_size_bytes=target_size_bytes,
  )
  proxy_sha256 = sha256_file(proxy_path)
  proxy_object_key = build_object_key("analysis_proxy", asset_id, proxy_sha256, ".mp4")
  if on_stage:
    on_stage(
      "uploading_proxy",
      "上传代理视频",
      36,
      {"inputRole": input_role, "proxySizeBytes": proxy_path.stat().st_size},
    )
  storage.upload_file(proxy_object_key, proxy_path, "video/mp4")
  with connect_pg() as conn:
    upsert_analysis_proxy_object(
      conn,
      job=job,
      proxy_object_key=proxy_object_key,
      proxy_size_bytes=proxy_path.stat().st_size,
      proxy_sha256=proxy_sha256,
      input_role=input_role,
      input_object_key=input_object_key,
      target_size_bytes=target_size_bytes,
      created_by=created_by,
    )
  return proxy_object_key


def upsert_analysis_proxy_object(
  conn: psycopg2.extensions.connection,
  *,
  job: dict[str, Any],
  proxy_object_key: str,
  proxy_size_bytes: int,
  proxy_sha256: str,
  input_role: str,
  input_object_key: str,
  target_size_bytes: int,
  created_by: str,
) -> None:
  asset_id = str(job["asset_id"])
  object_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"content-asset-object:{asset_id}:analysis_proxy:{proxy_object_key}"))
  metadata = {
    "created_by": created_by,
    "source_role": input_role,
    "source_object_key": input_object_key,
    "target_size_bytes": target_size_bytes,
  }
  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_objects (
        object_id,
        asset_id,
        object_role,
        storage_provider,
        bucket,
        object_key,
        content_type,
        file_ext,
        size_bytes,
        sha256,
        status,
        metadata
      ) VALUES (
        %s, %s, 'analysis_proxy', 'tos', %s, %s,
        'video/mp4', '.mp4', %s, %s, 'active', %s::jsonb
      )
      ON CONFLICT (object_id) DO UPDATE SET
        bucket = EXCLUDED.bucket,
        object_key = EXCLUDED.object_key,
        content_type = EXCLUDED.content_type,
        file_ext = EXCLUDED.file_ext,
        size_bytes = EXCLUDED.size_bytes,
        sha256 = EXCLUDED.sha256,
        status = 'active',
        metadata = EXCLUDED.metadata
      """,
      (
        object_id,
        asset_id,
        job.get("bucket") or "content-video-prod",
        proxy_object_key,
        proxy_size_bytes,
        proxy_sha256,
        json.dumps(metadata, ensure_ascii=False),
      ),
    )
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
      VALUES (%s, 'analysis_proxy_created', 'content-assets-worker', '已生成 AI 分析代理视频', %s::jsonb)
      """,
      (
        asset_id,
        json.dumps({
          "analysisProxyObjectKey": proxy_object_key,
          "sourceRole": input_role,
          "sourceObjectKey": input_object_key,
          "sizeBytes": proxy_size_bytes,
        }, ensure_ascii=False),
      ),
    )
  conn.commit()
