from __future__ import annotations

from typing import Any, Literal, cast

from .worker_runtime import job_metadata as _job_metadata
from .worker_video_input import InputRole


AnalysisSource = Literal["preview", "raw", "auto"]


def normalize_analysis_source(source: str) -> AnalysisSource:
  normalized = (source or "preview").strip().lower()
  if normalized not in {"preview", "raw", "auto"}:
    raise ValueError("analysis source must be one of: preview, raw, auto")
  return cast(AnalysisSource, normalized)


def analysis_source_from_job(job: dict[str, Any]) -> AnalysisSource:
  metadata = _job_metadata(job)
  raw_source = metadata.get("analysis_source") or metadata.get("preferred_input") or ""
  source = str(raw_source).strip().lower()
  if source in {"preview", "raw", "auto"}:
    return cast(AnalysisSource, source)

  # 兼容早期没有 metadata 的 analysis 队列：按当时写入的 input_object_key 解释。
  input_object_key = str(job.get("input_object_key") or "")
  if input_object_key:
    if input_object_key == str(job.get("raw_object_key") or ""):
      return "raw"
    if input_object_key == str(job.get("preview_object_key") or ""):
      return "preview"
  return "preview"


def analysis_profile_from_job(job: dict[str, Any], input_role: InputRole) -> str:
  metadata = _job_metadata(job)
  profile = str(metadata.get("analysis_profile") or "").strip().lower()
  if profile in {"preview_fast", "raw_deep", "action_detail"}:
    return profile
  return default_analysis_profile(input_role)


def normalize_analysis_profile(profile: str) -> str:
  normalized = (profile or "").strip().lower()
  if normalized not in {"preview_fast", "raw_deep", "action_detail"}:
    raise ValueError("analysis profile must be one of: preview_fast, raw_deep, action_detail")
  return normalized


def default_analysis_profile(input_role: str) -> str:
  if input_role == "raw":
    return "raw_deep"
  return "preview_fast"


def resolve_analysis_input(row: dict[str, Any], source: AnalysisSource) -> tuple[str, InputRole]:
  raw_object_key = str(row.get("raw_object_key") or "").strip()
  preview_object_key = str(row.get("preview_object_key") or "").strip()

  if source == "preview":
    if not preview_object_key:
      raise RuntimeError(f"asset_id={row.get('asset_id')} 缺少 preview_object_key，无法执行快速分析")
    return preview_object_key, "preview"
  if source == "raw":
    if not raw_object_key:
      raise RuntimeError(f"asset_id={row.get('asset_id')} 缺少 raw_object_key，无法执行原片完整分析")
    return raw_object_key, "raw"
  if preview_object_key:
    return preview_object_key, "preview"
  if raw_object_key:
    return raw_object_key, "raw"
  raise RuntimeError(f"asset_id={row.get('asset_id')} 缺少可分析的视频对象")


def analysis_model_stage_label(profile: str) -> str:
  labels = {
    "preview_fast": "快速分析视频",
    "raw_deep": "深度分析原片",
    "action_detail": "提取动作细节",
  }
  return labels.get(profile, "调用模型分析视频")
