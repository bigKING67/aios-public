from __future__ import annotations

import json
import math
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

import psycopg2
import psycopg2.extras
import requests

from marketing_content_assets.asr_client import (
  ArkVideoTranscriptClient,
  TranscriptConfig,
  TranscriptError,
)
from marketing_content_assets.ark_responses import (
  DEFAULT_ARK_CONTENT_ANALYSIS_MODEL,
  DEFAULT_ARK_RESPONSES_BASE_URL,
  ArkResponsesError,
  extract_output_text,
)
from marketing_content_assets.repository import connect_pg
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig, sha256_file
from marketing_content_assets.video_processing import (
  VideoProcessingError,
  build_analysis_proxy_video,
  extract_analysis_frames,
  probe_video,
)
from marketing_content_assets.worker_runtime import env_int, json_safe, load_env_file
from live_center_analysis.json_parser import parse_live_analysis_json as _parse_live_analysis_json


DEFAULT_PROMPT_VERSION = "v4.4-coverage-aware-review"
DEFAULT_ANALYSIS_PROFILE = "auto"
SUPPORTED_ANALYSIS_PROFILES = {"auto", "l1_text", "l2_multimodal"}
DEFAULT_ASR_PROMPT_MAX_CHARS_PER_INPUT = 1200
DEFAULT_ASR_PROMPT_MAX_SEGMENTS_PER_INPUT = 16
OPERATOR_SCORECARD_DIMENSIONS = ("话术", "商品", "福利", "CTA", "互动", "画面")
PROTECTED_QUOTE_FIELDS = {"quote", "scriptQuote", "scriptText", "transcriptText"}
MAIN_REVIEW_FIELDS = (
  "summary",
  "primaryDecision",
  "executiveReview",
  "momentReviews",
  "scriptReview",
  "conversionDiagnosis",
  "operatorScorecard",
  "actionPlan",
  "reviewTasks",
)
REQUIRED_ANALYSIS_V4_COLUMNS = (
  "analysis_profile",
  "provider",
  "prompt_version",
  "input_snapshot",
  "progress_percent",
  "processing_stage",
  "output_object_key",
  "response_id",
  "usage_json",
)


@dataclass(frozen=True)
class LiveCenterAnalysisConfig:
  api_key: str
  base_url: str
  model: str
  prompt_version: str
  timeout_seconds: int
  max_output_tokens: int
  temperature: float
  thinking_type: str
  reasoning_effort: str
  store_response: bool
  json_schema_strict: bool
  signed_url_ttl_seconds: int
  max_segments: int
  max_video_bytes: int
  proxy_target_bytes: int
  max_proxy_slice_seconds: int
  max_proxy_slices_per_segment: int
  frame_count_per_segment: int
  asr_mode: str
  asr_max_output_tokens: int
  asr_video_fps: float
  asr_prompt_max_chars_per_input: int
  asr_prompt_max_segments_per_input: int
  retry_without_video_on_token_limit: bool
  max_minute_metrics: int
  video_fps: float

  @classmethod
  def from_env(cls) -> "LiveCenterAnalysisConfig":
    api_key = (
      os.getenv("ARK_API_KEY")
      or os.getenv("VOLCENGINE_ARK_API_KEY")
      or os.getenv("ARK_ACCESS_TOKEN")
      or ""
    ).strip()
    if not api_key:
      raise ArkResponsesError("缺少 ARK_API_KEY，无法调用火山方舟 Responses API")

    return cls(
      api_key=api_key,
      base_url=(os.getenv("ARK_RESPONSES_BASE_URL") or DEFAULT_ARK_RESPONSES_BASE_URL).strip(),
      model=(
        os.getenv("DOUYIN_LIVE_ANALYSIS_MODEL")
        or os.getenv("ARK_CONTENT_ANALYSIS_MODEL")
        or DEFAULT_ARK_CONTENT_ANALYSIS_MODEL
      ).strip(),
      prompt_version=(os.getenv("DOUYIN_LIVE_ANALYSIS_PROMPT_VERSION") or DEFAULT_PROMPT_VERSION).strip(),
      timeout_seconds=env_int("ARK_RESPONSES_TIMEOUT_SECONDS", 300),
      max_output_tokens=env_int("DOUYIN_LIVE_ANALYSIS_MAX_OUTPUT_TOKENS", 20000),
      temperature=_env_float("ARK_TEMPERATURE", 0.2),
      thinking_type=_env_choice("DOUYIN_LIVE_ANALYSIS_THINKING_TYPE", "enabled", {"enabled", "disabled", "auto"}),
      reasoning_effort=_env_choice("DOUYIN_LIVE_ANALYSIS_REASONING_EFFORT", "high", {"", "minimal", "low", "medium", "high"}),
      store_response=_env_bool("ARK_STORE_RESPONSE", False),
      json_schema_strict=_env_bool("DOUYIN_LIVE_ANALYSIS_JSON_SCHEMA_STRICT", True),
      signed_url_ttl_seconds=env_int("DOUYIN_LIVE_ANALYSIS_SIGNED_URL_TTL_SECONDS", 1800),
      max_segments=env_int("DOUYIN_LIVE_ANALYSIS_MAX_SEGMENTS", 6),
      max_video_bytes=env_int("DOUYIN_LIVE_ANALYSIS_MAX_VIDEO_BYTES", 50 * 1024 * 1024),
      proxy_target_bytes=env_int("DOUYIN_LIVE_ANALYSIS_PROXY_TARGET_BYTES", 45 * 1024 * 1024),
      max_proxy_slice_seconds=env_int("DOUYIN_LIVE_ANALYSIS_MAX_PROXY_SLICE_SECONDS", 180),
      max_proxy_slices_per_segment=env_int("DOUYIN_LIVE_ANALYSIS_MAX_PROXY_SLICES_PER_SEGMENT", 4),
      frame_count_per_segment=env_int("DOUYIN_LIVE_ANALYSIS_FRAME_COUNT_PER_SEGMENT", 3),
      asr_mode=_env_choice("DOUYIN_LIVE_ANALYSIS_ASR_MODE", "best_effort", {"disabled", "best_effort", "required"}),
      asr_max_output_tokens=env_int("DOUYIN_LIVE_ANALYSIS_ASR_MAX_OUTPUT_TOKENS", 12000),
      asr_video_fps=_env_float("DOUYIN_LIVE_ANALYSIS_ASR_VIDEO_FPS", 0.2),
      asr_prompt_max_chars_per_input=env_int(
        "DOUYIN_LIVE_ANALYSIS_ASR_PROMPT_MAX_CHARS_PER_INPUT",
        DEFAULT_ASR_PROMPT_MAX_CHARS_PER_INPUT,
      ),
      asr_prompt_max_segments_per_input=env_int(
        "DOUYIN_LIVE_ANALYSIS_ASR_PROMPT_MAX_SEGMENTS_PER_INPUT",
        DEFAULT_ASR_PROMPT_MAX_SEGMENTS_PER_INPUT,
      ),
      retry_without_video_on_token_limit=_env_bool(
        "DOUYIN_LIVE_ANALYSIS_RETRY_WITHOUT_VIDEO_ON_TOKEN_LIMIT",
        True,
      ),
      max_minute_metrics=env_int("DOUYIN_LIVE_ANALYSIS_MAX_MINUTE_METRICS", 360),
      video_fps=_env_float("DOUYIN_LIVE_ANALYSIS_VIDEO_FPS", 0.2),
    )


def process_douyin_live_center_analysis_jobs(limit: int = 10, temp_root: Optional[Path] = None) -> Dict[str, int]:
  stats = {
    "claimed": 0,
    "succeeded": 0,
    "failed": 0,
    "empty": 0,
  }
  config: Optional[LiveCenterAnalysisConfig] = None
  storage: Optional[TosStorageClient] = None
  client: Optional[ArkLiveRecordingClient] = None
  asr_client: Optional[ArkVideoTranscriptClient] = None

  with connect_pg() as conn:
    _ensure_analysis_v4_schema(conn)

  with tempfile.TemporaryDirectory(prefix="live-center-analysis-", dir=str(temp_root) if temp_root else None) as tmp_dir:
    work_root = Path(tmp_dir)
    for _ in range(max(1, limit)):
      with connect_pg() as conn:
        job = _claim_next_analysis_job(conn)
      if job is None:
        stats["empty"] += 1
        break

      stats["claimed"] += 1
      try:
        if config is None:
          config = LiveCenterAnalysisConfig.from_env()
        if storage is None:
          storage = TosStorageClient(TosStorageConfig.from_env())
        if client is None:
          client = ArkLiveRecordingClient(config)
        if config.asr_mode != "disabled" and asr_client is None:
          asr_client = ArkVideoTranscriptClient(_live_transcript_config(config))
        _process_analysis_job(
          job=job,
          storage=storage,
          client=client,
          asr_client=asr_client,
          config=config,
          work_dir=work_root / str(job["analysis_id"]),
        )
      except Exception as error:  # noqa: BLE001 - worker must persist real job failures.
        with connect_pg() as conn:
          _fail_analysis_job(
            conn,
            job["analysis_id"],
            str(error),
            provider="ark",
            model=config.model if config is not None else _fallback_model_for_failed_claim(job),
          )
        stats["failed"] += 1
      else:
        stats["succeeded"] += 1

  return stats


def recover_douyin_live_center_analysis_job(analysis_id: str) -> Dict[str, int]:
  stats = {
    "claimed": 0,
    "succeeded": 0,
    "failed": 0,
    "empty": 0,
  }
  config: Optional[LiveCenterAnalysisConfig] = None

  with connect_pg() as conn:
    _ensure_analysis_v4_schema(conn)
    job = _claim_recoverable_analysis_job(conn, analysis_id)
  if job is None:
    stats["empty"] = 1
    return stats

  stats["claimed"] = 1
  try:
    config = LiveCenterAnalysisConfig.from_env()
    client = ArkLiveRecordingClient(config)
    _recover_analysis_job_from_snapshot(job=job, client=client, config=config)
  except Exception as error:  # noqa: BLE001 - recovery must persist real job failures.
    with connect_pg() as conn:
      _fail_analysis_job(
        conn,
        job["analysis_id"],
        str(error),
        provider="ark",
        model=config.model if config is not None else _fallback_model_for_failed_claim(job),
      )
    stats["failed"] = 1
  else:
    stats["succeeded"] = 1
  return stats


def inspect_queued_analysis_jobs(limit: int = 10) -> Dict[str, Any]:
  with connect_pg() as conn:
    missing_columns = _missing_analysis_v4_columns(conn)
    if missing_columns:
      return {
        "dryRun": True,
        "schemaReady": False,
        "missingColumns": missing_columns,
        "message": "请先执行 20260702_1200__add_douyin_live_center_analysis_v4.sql 后再启动 V4 worker。",
      }
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
      cur.execute(
        """
        SELECT
          analysis_id,
          session_key,
          recording_id,
          status,
          model,
          analysis_profile,
          prompt_version,
          created_at
        FROM ads.douyin_live_session_analysis
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT %s
        """,
        (max(1, int(limit)),),
      )
      rows = list(cur.fetchall())
  return {
    "dryRun": True,
    "schemaReady": True,
    "candidateCount": len(rows),
    "sampleAnalysisIds": [str(row["analysis_id"]) for row in rows[:10]],
  }


def _ensure_analysis_v4_schema(conn: psycopg2.extensions.connection) -> None:
  missing_columns = _missing_analysis_v4_columns(conn)
  if missing_columns:
    raise RuntimeError(
      "直播录屏 AI 分析 V4 migration 未应用，缺少字段: "
      + ", ".join(missing_columns)
      + "；请先执行 20260702_1200__add_douyin_live_center_analysis_v4.sql"
    )


def _missing_analysis_v4_columns(conn: psycopg2.extensions.connection) -> List[str]:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'ads'
        AND table_name = 'douyin_live_session_analysis'
        AND column_name = ANY(%s)
      """,
      (list(REQUIRED_ANALYSIS_V4_COLUMNS),),
    )
    existing = {str(row["column_name"]) for row in cur.fetchall()}
  return [column for column in REQUIRED_ANALYSIS_V4_COLUMNS if column not in existing]


def _claim_next_analysis_job(conn: psycopg2.extensions.connection) -> Optional[Dict[str, Any]]:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      WITH candidate AS (
        SELECT analysis_id
        FROM ads.douyin_live_session_analysis
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ads.douyin_live_session_analysis analysis
      SET
        status = 'running',
        started_at = COALESCE(analysis.started_at, CURRENT_TIMESTAMP),
        progress_percent = 10,
        processing_stage = 'claimed',
        error_message = NULL
      FROM candidate
      WHERE analysis.analysis_id = candidate.analysis_id
      RETURNING
        analysis.analysis_id,
        analysis.session_key,
        analysis.recording_id,
        analysis.model,
        analysis.analysis_profile,
        analysis.prompt_version,
        analysis.created_at
      """,
    )
    row = cur.fetchone()
  conn.commit()
  return dict(row) if row else None


def _claim_recoverable_analysis_job(
  conn: psycopg2.extensions.connection,
  analysis_id: str,
) -> Optional[Dict[str, Any]]:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      WITH candidate AS (
        SELECT analysis_id
        FROM ads.douyin_live_session_analysis
        WHERE analysis_id = %s::uuid
          AND status = 'running'
          AND input_snapshot IS NOT NULL
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ads.douyin_live_session_analysis analysis
      SET
        progress_percent = GREATEST(COALESCE(analysis.progress_percent, 0), 65),
        processing_stage = 'text_only_recovery_claimed',
        error_message = NULL
      FROM candidate
      WHERE analysis.analysis_id = candidate.analysis_id
      RETURNING
        analysis.analysis_id,
        analysis.session_key,
        analysis.recording_id,
        analysis.model,
        analysis.analysis_profile,
        analysis.prompt_version,
        analysis.input_snapshot,
        analysis.created_at
      """,
      (analysis_id,),
    )
    row = cur.fetchone()
  conn.commit()
  return dict(row) if row else None


def _process_analysis_job(
  *,
  job: Mapping[str, Any],
  storage: TosStorageClient,
  client: "ArkLiveRecordingClient",
  asr_client: Optional[ArkVideoTranscriptClient],
  config: LiveCenterAnalysisConfig,
  work_dir: Path,
) -> None:
  analysis_id = job["analysis_id"]
  session_key = str(job["session_key"])
  analysis_profile = _normalize_analysis_profile(job.get("analysis_profile"))
  prompt_version = str(job.get("prompt_version") or config.prompt_version or DEFAULT_PROMPT_VERSION)

  with connect_pg() as conn:
    _update_analysis_job_stage(conn, analysis_id, "loading_context", 20)
    context = _load_analysis_context(
      conn,
      session_key=session_key,
      recording_id=str(job["recording_id"]) if job.get("recording_id") else "",
      max_minute_metrics=config.max_minute_metrics,
    )

  segments = context["recording"]["segments"]
  if not segments:
    raise RuntimeError("该分析任务没有可用的 uploaded 录屏分段")

  selected_segments = _select_candidate_segments(
    segments,
    max_segments=config.max_segments,
    minute_metrics=context.get("minuteMetrics") or [],
  )
  derived_inputs = _prepare_multimodal_inputs(
    storage=storage,
    asr_client=asr_client,
    segments=selected_segments,
    context=context,
    config=config,
    analysis_id=str(analysis_id),
    work_dir=work_dir,
  )
  if analysis_profile != "l1_text" and not derived_inputs["videos"]:
    raise RuntimeError("没有可供模型读取的录屏视频输入，不能执行多模态分析")
  main_request = _main_analysis_request_snapshot(
    derived_inputs,
    include_video_inputs=analysis_profile != "l1_text",
    request_mode="video_frame_asr" if analysis_profile != "l1_text" else "text_only",
  )
  derived_inputs["samplingPlan"] = _build_sampling_plan(
    context,
    selected_segments=selected_segments,
    derived_inputs=derived_inputs,
    main_request=main_request,
  )
  _attach_derived_inputs_to_context(context, derived_inputs, config, main_request=main_request)

  input_snapshot = _build_input_snapshot(
    context,
    analysis_profile=analysis_profile,
    prompt_version=prompt_version,
    model=_resolve_requested_model(job.get("model"), config.model),
    signed_url_ttl_seconds=config.signed_url_ttl_seconds,
    selected_segment_count=len(selected_segments),
    derived_inputs=derived_inputs,
    max_video_bytes=config.max_video_bytes,
  )
  with connect_pg() as conn:
    _update_analysis_job_stage(conn, analysis_id, "calling_model", 55, input_snapshot=input_snapshot)

  try:
    result = client.analyze_recording(
      context=context,
      derived_inputs=derived_inputs,
      analysis_profile=analysis_profile,
      prompt_version=prompt_version,
      requested_model=job.get("model"),
      include_video_inputs=analysis_profile != "l1_text",
    )
  except ArkResponsesError as error:
    if not _should_retry_without_video_inputs(error, derived_inputs, analysis_profile, config):
      raise
    main_request = _main_analysis_request_snapshot(
      derived_inputs,
      include_video_inputs=False,
      request_mode="frame_asr_retry_after_token_limit",
      reason="multimodal_token_limit",
    )
    _attach_derived_inputs_to_context(context, derived_inputs, config, main_request=main_request)
    input_snapshot = _build_input_snapshot(
      context,
      analysis_profile=analysis_profile,
      prompt_version=prompt_version,
      model=_resolve_requested_model(job.get("model"), config.model),
      signed_url_ttl_seconds=config.signed_url_ttl_seconds,
      selected_segment_count=len(selected_segments),
      derived_inputs=derived_inputs,
      max_video_bytes=config.max_video_bytes,
    )
    with connect_pg() as conn:
      _update_analysis_job_stage(
        conn,
        analysis_id,
        "retry_without_video_inputs",
        65,
        input_snapshot=input_snapshot,
      )
    result = client.analyze_recording(
      context=context,
      derived_inputs=derived_inputs,
      analysis_profile=analysis_profile,
      prompt_version=prompt_version,
      requested_model=job.get("model"),
      include_video_inputs=False,
    )
  analysis_json = _normalize_live_analysis_output(
    result.analysis,
    context=context,
    output_text=result.text,
    provider="ark",
    model=result.model,
    prompt_version=prompt_version,
    response_id=result.response_id,
    usage=result.usage,
  )

  with connect_pg() as conn:
    _complete_analysis_job(
      conn,
      analysis_id,
      analysis_json=analysis_json,
      input_snapshot=input_snapshot,
      provider="ark",
      model=result.model,
      response_id=result.response_id,
      usage=result.usage,
      prompt_version=prompt_version,
      analysis_profile=analysis_profile,
    )


def _recover_analysis_job_from_snapshot(
  *,
  job: Mapping[str, Any],
  client: "ArkLiveRecordingClient",
  config: LiveCenterAnalysisConfig,
) -> None:
  analysis_id = job["analysis_id"]
  session_key = str(job["session_key"])
  prompt_version = str(job.get("prompt_version") or config.prompt_version or DEFAULT_PROMPT_VERSION)
  stored_analysis_profile = _normalize_analysis_profile(job.get("analysis_profile"))
  input_snapshot = _as_json_mapping(job.get("input_snapshot"))
  derived_inputs = _as_json_mapping(input_snapshot.get("derivedInputs"))
  if not derived_inputs:
    raise RuntimeError("该 running 分析任务没有可复用的 input_snapshot.derivedInputs")

  with connect_pg() as conn:
    _update_analysis_job_stage(conn, analysis_id, "text_only_recovery_loading_context", 68)
    context = _load_analysis_context(
      conn,
      session_key=session_key,
      recording_id=str(job["recording_id"]) if job.get("recording_id") else "",
      max_minute_metrics=config.max_minute_metrics,
    )

  main_request = _main_analysis_request_snapshot(
    derived_inputs,
    include_video_inputs=False,
    request_mode="text_only_recovery_after_worker_interrupt",
    reason="reuse_input_snapshot_derived_inputs",
  )
  derived_inputs.setdefault("samplingPlan", _build_sampling_plan(
    context,
    selected_segments=context.get("recording", {}).get("segments") if isinstance(context.get("recording"), dict) else [],
    derived_inputs=derived_inputs,
    main_request=main_request,
  ))
  _attach_derived_inputs_to_context(context, derived_inputs, config, main_request=main_request)
  recovery_snapshot = _build_input_snapshot(
    context,
    analysis_profile=stored_analysis_profile,
    prompt_version=prompt_version,
    model=_resolve_requested_model(job.get("model"), config.model),
    signed_url_ttl_seconds=config.signed_url_ttl_seconds,
    selected_segment_count=int(input_snapshot.get("selectedSegmentCount") or 0),
    derived_inputs=derived_inputs,
    max_video_bytes=config.max_video_bytes,
  )
  recovery_snapshot["recoveredFrom"] = {
    "analysisId": str(analysis_id),
    "previousProcessingStage": input_snapshot.get("processingStage") or input_snapshot.get("processing_stage"),
    "reason": "worker_interrupted_after_input_snapshot",
  }

  with connect_pg() as conn:
    _update_analysis_job_stage(
      conn,
      analysis_id,
      "text_only_recovery_calling_model",
      75,
      input_snapshot=recovery_snapshot,
    )
  result = client.analyze_recording(
    context=context,
    derived_inputs=derived_inputs,
    analysis_profile="l1_text",
    prompt_version=prompt_version,
    requested_model=job.get("model"),
    include_video_inputs=False,
  )
  analysis_json = _normalize_live_analysis_output(
    result.analysis,
    context=context,
    output_text=result.text,
    provider="ark",
    model=result.model,
    prompt_version=prompt_version,
    response_id=result.response_id,
    usage=result.usage,
  )

  with connect_pg() as conn:
    _complete_analysis_job(
      conn,
      analysis_id,
      analysis_json=analysis_json,
      input_snapshot=recovery_snapshot,
      provider="ark",
      model=result.model,
      response_id=result.response_id,
      usage=result.usage,
      prompt_version=prompt_version,
      analysis_profile=stored_analysis_profile,
    )


def _as_json_mapping(value: Any) -> Dict[str, Any]:
  if isinstance(value, dict):
    return dict(value)
  if isinstance(value, str):
    try:
      parsed = json.loads(value)
    except json.JSONDecodeError:
      return {}
    if isinstance(parsed, dict):
      return parsed
  return {}


def _load_analysis_context(
  conn: psycopg2.extensions.connection,
  *,
  session_key: str,
  recording_id: str,
  max_minute_metrics: int,
) -> Dict[str, Any]:
  session = _load_session(conn, session_key)
  minute_metrics = _load_minute_metrics(conn, session_key, max_minute_metrics)
  recording = _load_recording(conn, session_key=session_key, recording_id=recording_id)
  recording = _enrich_recording_time_anchors(recording, session)
  return {
    "session": session,
    "minuteMetrics": minute_metrics,
    "recording": recording,
  }


def _enrich_recording_time_anchors(
  recording: Mapping[str, Any],
  session: Mapping[str, Any],
) -> Dict[str, Any]:
  enriched = dict(recording or {})
  segments = [
    dict(segment)
    for segment in enriched.get("segments", [])
    if isinstance(segment, dict)
  ]
  live_start_time = session.get("liveStartTime") if isinstance(session, dict) else None
  cursor: Optional[float] = 0.0
  enriched_segments: List[Dict[str, Any]] = []
  for display_index, segment in enumerate(sorted(
    segments,
    key=lambda item: (
      _optional_int(item.get("segmentIndex")) is None,
      _optional_int(item.get("segmentIndex")) or 0,
    ),
  ), start=1):
    segment["displaySegmentIndex"] = _optional_int(segment.get("displaySegmentIndex")) or display_index
    start = _float_or_none(segment.get("startOffsetSeconds"))
    end = _float_or_none(segment.get("endOffsetSeconds"))
    duration = _float_or_none(segment.get("durationSeconds"))
    if start is None and cursor is not None:
      start = cursor
    if end is None and start is not None and duration is not None:
      end = start + duration
    if duration is None and start is not None and end is not None:
      duration = max(0.0, end - start)
      segment["durationSeconds"] = duration

    if start is not None:
      segment["startOffsetSeconds"] = start
    if end is not None:
      segment["endOffsetSeconds"] = end
    segment["liveStartTime"] = live_start_time
    segment["timeAnchor"] = _build_time_anchor(
      live_start_time=live_start_time,
      offset_start_seconds=start,
      offset_end_seconds=end,
      segment_index=_optional_int(segment.get("segmentIndex")),
      display_segment_index=_optional_int(segment.get("displaySegmentIndex")),
    )
    if segment["timeAnchor"].get("displayTimeRange"):
      segment["displayTimeRange"] = segment["timeAnchor"]["displayTimeRange"]
    enriched_segments.append(segment)

    if end is not None:
      cursor = end
    elif duration is None:
      cursor = None

  enriched["segments"] = enriched_segments
  return enriched


def _select_candidate_segments(
  segments: List[Dict[str, Any]],
  *,
  max_segments: int,
  minute_metrics: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
  max_selected = max(1, int(max_segments))
  sorted_segments = sorted(
    [segment for segment in segments if isinstance(segment, dict)],
    key=lambda segment: (
      _optional_int(segment.get("segmentIndex")) is None,
      _optional_int(segment.get("segmentIndex")) or 0,
    ),
  )
  if len(sorted_segments) <= max_selected:
    return sorted_segments
  if not [item for item in (minute_metrics or []) if isinstance(item, dict)]:
    return sorted_segments[:max_selected]

  selected: List[Dict[str, Any]] = []

  def append_segment(segment: Optional[Dict[str, Any]]) -> None:
    if not isinstance(segment, dict):
      return
    segment_index = _optional_int(segment.get("segmentIndex"))
    if any(_optional_int(existing.get("segmentIndex")) == segment_index for existing in selected):
      return
    if len(selected) < max_selected:
      selected.append(segment)

  append_segment(sorted_segments[0])

  peak_offset = _peak_order_minute_offset(minute_metrics or [])
  if peak_offset is not None:
    append_segment(_find_segment_covering_minute(sorted_segments, peak_offset))

  first_order_offset = _first_order_minute_offset(minute_metrics or [])
  if first_order_offset is not None:
    append_segment(_find_segment_covering_minute(sorted_segments, first_order_offset))

  append_segment(sorted_segments[-1])

  for segment in sorted_segments:
    if len(selected) >= max_selected:
      break
    append_segment(segment)

  return sorted(
    selected,
    key=lambda segment: (
      _optional_int(segment.get("segmentIndex")) is None,
      _optional_int(segment.get("segmentIndex")) or 0,
    ),
  )


def _peak_order_minute_offset(minute_metrics: List[Dict[str, Any]]) -> Optional[int]:
  valid_metrics = [item for item in minute_metrics if isinstance(item, dict)]
  if not valid_metrics:
    return None
  peak = max(valid_metrics, key=lambda item: int(item.get("orderCount") or 0))
  if int(peak.get("orderCount") or 0) <= 0:
    return None
  return _optional_int(peak.get("minuteOffset"))


def _first_order_minute_offset(minute_metrics: List[Dict[str, Any]]) -> Optional[int]:
  valid_metrics = sorted(
    [item for item in minute_metrics if isinstance(item, dict) and int(item.get("orderCount") or 0) > 0],
    key=lambda item: _optional_int(item.get("minuteOffset")) or 0,
  )
  if not valid_metrics:
    return None
  return _optional_int(valid_metrics[0].get("minuteOffset"))


def _find_segment_covering_minute(
  segments: List[Dict[str, Any]],
  minute_offset: int,
) -> Optional[Dict[str, Any]]:
  target_seconds = max(0, int(minute_offset)) * 60
  for segment in segments:
    start = _float_or_none(segment.get("startOffsetSeconds"))
    end = _float_or_none(segment.get("endOffsetSeconds"))
    if start is None or end is None:
      continue
    if start <= target_seconds <= end:
      return segment
  return None


def _prepare_multimodal_inputs(
  *,
  storage: TosStorageClient,
  asr_client: Optional[ArkVideoTranscriptClient],
  segments: List[Dict[str, Any]],
  context: Mapping[str, Any],
  config: LiveCenterAnalysisConfig,
  analysis_id: str,
  work_dir: Path,
) -> Dict[str, Any]:
  videos: List[Dict[str, Any]] = []
  frames: List[Dict[str, Any]] = []
  transcripts: List[Dict[str, Any]] = []
  skipped: List[Dict[str, Any]] = []
  for segment in segments:
    prepared = _prepare_segment_video_inputs(
      storage=storage,
      segment=segment,
      context=context,
      config=config,
      analysis_id=analysis_id,
      work_dir=work_dir / f"segment-{_segment_index_for_path(segment):03d}",
    )
    videos.extend(prepared["videos"])
    frames.extend(prepared["frames"])
    skipped.extend(prepared["skipped"])

  if config.asr_mode != "disabled" and videos:
    if asr_client is None:
      skip_reason = {
        "reason": "asr_client_not_available",
        "asrMode": config.asr_mode,
      }
      skipped.append(skip_reason)
      if config.asr_mode == "required":
        raise TranscriptError("直播录屏 ASR 失败: asr_client_not_available")
    else:
      transcripts = _transcribe_video_inputs(
        asr_client=asr_client,
        videos=videos,
        context=context,
        config=config,
      )
  return {
    "videos": videos,
    "frames": frames,
    "asrTranscripts": transcripts,
    "skipped": skipped,
  }


def _prepare_segment_video_inputs(
  *,
  storage: TosStorageClient,
  segment: Mapping[str, Any],
  context: Mapping[str, Any],
  config: LiveCenterAnalysisConfig,
  analysis_id: str,
  work_dir: Path,
) -> Dict[str, List[Dict[str, Any]]]:
  object_key = str(segment.get("rawObjectKey") or "").strip()
  if not object_key:
    return {
      "videos": [],
      "frames": [],
      "skipped": [_segment_skip(segment, "missing_raw_object_key")],
    }

  file_size = _optional_int(segment.get("fileSizeBytes"))
  if file_size is None or file_size <= max(0, int(config.max_video_bytes)):
    return {
      "videos": [_direct_video_input(storage, segment, object_key, config)],
      "frames": [],
      "skipped": [],
    }

  work_dir.mkdir(parents=True, exist_ok=True)
  source_path = work_dir / f"source{_segment_file_ext(segment)}"
  storage.download_file(object_key, source_path)
  probe = probe_video(source_path)
  duration_seconds = probe.duration_seconds or _float_or_none(segment.get("durationSeconds"))
  frames = _prepare_segment_frame_inputs(
    storage=storage,
    segment=segment,
    context=context,
    source_path=source_path,
    duration_seconds=duration_seconds,
    config=config,
    analysis_id=analysis_id,
    work_dir=work_dir,
  )

  should_slice = bool(
    duration_seconds
    and config.max_proxy_slice_seconds > 0
    and duration_seconds > config.max_proxy_slice_seconds
  )
  try:
    if should_slice:
      videos = _build_proxy_slice_inputs(
        storage=storage,
        segment=segment,
        context=context,
        source_path=source_path,
        duration_seconds=duration_seconds,
        config=config,
        analysis_id=analysis_id,
        work_dir=work_dir,
      )
    else:
      videos = [_build_single_proxy_video_input(
        storage=storage,
        segment=segment,
        source_path=source_path,
        config=config,
        analysis_id=analysis_id,
        work_dir=work_dir,
      )]
  except VideoProcessingError:
    if should_slice:
      raise
    videos = _build_proxy_slice_inputs(
      storage=storage,
      segment=segment,
      context=context,
      source_path=source_path,
      duration_seconds=duration_seconds,
      config=config,
      analysis_id=analysis_id,
      work_dir=work_dir,
    )
  return {
    "videos": videos,
    "frames": frames,
    "skipped": [],
  }


def _direct_video_input(
  storage: TosStorageClient,
  segment: Mapping[str, Any],
  object_key: str,
  config: LiveCenterAnalysisConfig,
) -> Dict[str, Any]:
  mime_type = _segment_mime_type(segment)
  return {
    **_base_segment_input(segment),
    "modelInputRole": "raw",
    "modelObjectKey": object_key,
    "modelSizeBytes": _optional_int(segment.get("fileSizeBytes")),
    "strategy": "direct_signed_url",
    "url": storage.presign_get_url(
      object_key,
      ttl_seconds=config.signed_url_ttl_seconds,
      response_content_type=mime_type,
    ),
    "mimeType": mime_type,
  }


def _build_single_proxy_video_input(
  *,
  storage: TosStorageClient,
  segment: Mapping[str, Any],
  source_path: Path,
  config: LiveCenterAnalysisConfig,
  analysis_id: str,
  work_dir: Path,
) -> Dict[str, Any]:
  proxy_path = build_analysis_proxy_video(
    source_path,
    work_dir / "proxy",
    f"segment-{_segment_index_for_path(segment):03d}",
    target_size_bytes=config.proxy_target_bytes,
  )
  object_key = _upload_live_analysis_artifact(
    storage=storage,
    path=proxy_path,
    content_type="video/mp4",
    analysis_id=analysis_id,
    segment=segment,
    kind="analysis-proxy",
    ext=".mp4",
  )
  return {
    **_base_segment_input(segment),
    "modelInputRole": "analysis_proxy",
    "modelObjectKey": object_key,
    "modelSizeBytes": proxy_path.stat().st_size,
    "strategy": "transcoded_proxy_signed_url",
    "url": storage.presign_get_url(
      object_key,
      ttl_seconds=config.signed_url_ttl_seconds,
      response_content_type="video/mp4",
    ),
    "mimeType": "video/mp4",
  }


def _build_proxy_slice_inputs(
  *,
  storage: TosStorageClient,
  segment: Mapping[str, Any],
  context: Mapping[str, Any],
  source_path: Path,
  duration_seconds: Optional[float],
  config: LiveCenterAnalysisConfig,
  analysis_id: str,
  work_dir: Path,
) -> List[Dict[str, Any]]:
  windows = _metric_led_segment_slice_windows(
    segment=segment,
    context=context,
    duration_seconds=duration_seconds,
    max_slice_seconds=config.max_proxy_slice_seconds,
    max_slices=config.max_proxy_slices_per_segment,
  )
  if not windows:
    return [_build_single_proxy_video_input(
      storage=storage,
      segment=segment,
      source_path=source_path,
      config=config,
      analysis_id=analysis_id,
      work_dir=work_dir,
    )]

  videos: List[Dict[str, Any]] = []
  for slice_index, window in enumerate(windows, start=1):
    start_seconds = window["startSeconds"]
    duration = window["durationSeconds"]
    slice_time_anchor = _segment_time_anchor(
      segment,
      slice_start_seconds=start_seconds,
      slice_end_seconds=start_seconds + duration,
      slice_index=slice_index,
    )
    proxy_path = build_analysis_proxy_video(
      source_path,
      work_dir / "slices",
      f"segment-{_segment_index_for_path(segment):03d}-slice-{slice_index:02d}",
      target_size_bytes=config.proxy_target_bytes,
      start_seconds=start_seconds,
      duration_seconds=duration,
    )
    object_key = _upload_live_analysis_artifact(
      storage=storage,
      path=proxy_path,
      content_type="video/mp4",
      analysis_id=analysis_id,
      segment=segment,
      kind=f"analysis-slice-{slice_index:02d}",
      ext=".mp4",
    )
    videos.append({
      **_base_segment_input(segment),
      "modelInputRole": "analysis_proxy_slice",
      "modelObjectKey": object_key,
      "modelSizeBytes": proxy_path.stat().st_size,
      "strategy": "transcoded_slice_signed_url",
      "sliceReason": window.get("sliceReason") or "fallback_even_coverage",
      "eventWindow": json_safe(window.get("eventWindow")) if window.get("eventWindow") else None,
      "sliceIndex": slice_index,
      "sliceStartSeconds": start_seconds,
      "sliceDurationSeconds": duration,
      "sliceEndSeconds": start_seconds + duration,
      "offsetStartSeconds": slice_time_anchor.get("offsetStartSeconds"),
      "offsetEndSeconds": slice_time_anchor.get("offsetEndSeconds"),
      "timeAnchor": slice_time_anchor,
      "displayTimeRange": slice_time_anchor.get("displayTimeRange"),
      "url": storage.presign_get_url(
        object_key,
        ttl_seconds=config.signed_url_ttl_seconds,
        response_content_type="video/mp4",
      ),
      "mimeType": "video/mp4",
    })
  return videos


def _prepare_segment_frame_inputs(
  *,
  storage: TosStorageClient,
  segment: Mapping[str, Any],
  context: Mapping[str, Any],
  source_path: Path,
  duration_seconds: Optional[float],
  config: LiveCenterAnalysisConfig,
  analysis_id: str,
  work_dir: Path,
) -> List[Dict[str, Any]]:
  frame_count = max(0, int(config.frame_count_per_segment))
  if frame_count <= 0:
    return []
  timestamp_items = _metric_led_frame_timestamps(
    segment=segment,
    context=context,
    duration_seconds=duration_seconds,
    frame_count=frame_count,
  )
  if not timestamp_items:
    return []
  timestamps = [item["timestampSeconds"] for item in timestamp_items]
  frame_paths = extract_analysis_frames(
    source_path,
    work_dir / "frames",
    f"segment-{_segment_index_for_path(segment):03d}",
    timestamps_seconds=timestamps,
  )
  frame_inputs: List[Dict[str, Any]] = []
  for index, frame_path in enumerate(frame_paths, start=1):
    timestamp_item = timestamp_items[index - 1] if index <= len(timestamp_items) else {}
    timestamp_seconds = timestamp_item.get("timestampSeconds")
    frame_time_anchor = _segment_time_anchor(
      segment,
      timestamp_seconds=timestamp_seconds,
    )
    object_key = _upload_live_analysis_artifact(
      storage=storage,
      path=frame_path,
      content_type="image/jpeg",
      analysis_id=analysis_id,
      segment=segment,
      kind=f"frame-{index:02d}",
      ext=".jpg",
    )
    frame_inputs.append({
      **_base_segment_input(segment),
      "frameIndex": index,
      "timestampSeconds": timestamp_seconds,
      "timestampReason": timestamp_item.get("timestampReason") or "fallback_even_frame",
      "eventWindow": json_safe(timestamp_item.get("eventWindow")) if timestamp_item.get("eventWindow") else None,
      "offsetStartSeconds": frame_time_anchor.get("offsetStartSeconds"),
      "offsetEndSeconds": frame_time_anchor.get("offsetEndSeconds"),
      "timeAnchor": frame_time_anchor,
      "displayTimeRange": frame_time_anchor.get("displayTimeRange"),
      "modelInputRole": "frame",
      "modelObjectKey": object_key,
      "modelSizeBytes": frame_path.stat().st_size,
      "strategy": "extracted_frame_signed_url",
      "url": storage.presign_get_url(
        object_key,
        ttl_seconds=config.signed_url_ttl_seconds,
        response_content_type="image/jpeg",
      ),
      "mimeType": "image/jpeg",
    })
  return frame_inputs


def _transcribe_video_inputs(
  *,
  asr_client: ArkVideoTranscriptClient,
  videos: List[Dict[str, Any]],
  context: Mapping[str, Any],
  config: LiveCenterAnalysisConfig,
) -> List[Dict[str, Any]]:
  transcripts: List[Dict[str, Any]] = []
  prompt_max_chars = max(0, int(config.asr_prompt_max_chars_per_input))
  prompt_max_segments = max(0, int(config.asr_prompt_max_segments_per_input))
  for video in videos:
    try:
      result = asr_client.transcribe_video(
        str(video["url"]),
        asset_context=_asr_asset_context(context, video),
      )
    except Exception as error:  # noqa: BLE001 - ASR can be best-effort but must be visible.
      failure = {
        **_redact_model_input(video),
        "status": "failed",
        "error": _redact_sensitive(str(error), config.api_key)[:600],
      }
      transcripts.append(failure)
      if config.asr_mode == "required":
        raise TranscriptError(f"直播录屏 ASR 失败: {failure['error']}") from error
      continue
    transcripts.append({
      **_redact_model_input(video),
      "status": "succeeded",
      "provider": result.provider,
      "model": result.model,
      "language": result.language,
      "confidence": result.confidence,
      "transcriptText": _truncate_text(result.transcript_text, prompt_max_chars),
      "scriptText": _truncate_text(result.script_text, prompt_max_chars),
      "segments": _truncate_transcript_segments(
        result.segments,
        max_segments=prompt_max_segments,
        max_chars_per_segment=max(120, prompt_max_chars // max(1, prompt_max_segments or 1)),
      ),
      "responseId": result.response_id,
      "usage": json_safe(result.usage),
    })
  return transcripts


def _live_transcript_config(config: LiveCenterAnalysisConfig) -> TranscriptConfig:
  return TranscriptConfig(
    provider="ark_video",
    api_key=config.api_key,
    base_url=config.base_url,
    model=(
      os.getenv("DOUYIN_LIVE_ANALYSIS_ASR_MODEL")
      or os.getenv("CONTENT_ASSET_TRANSCRIPT_MODEL")
      or config.model
    ).strip(),
    timeout_seconds=env_int("DOUYIN_LIVE_ANALYSIS_ASR_TIMEOUT_SECONDS", config.timeout_seconds),
    max_output_tokens=config.asr_max_output_tokens,
    fps=config.asr_video_fps,
    temperature=_env_float("DOUYIN_LIVE_ANALYSIS_ASR_TEMPERATURE", 0.0),
    store_response=config.store_response,
    json_schema_strict=_env_bool("DOUYIN_LIVE_ANALYSIS_ASR_JSON_SCHEMA_STRICT", True),
  )


def _asr_asset_context(context: Mapping[str, Any], video: Mapping[str, Any]) -> Dict[str, Any]:
  session = context.get("session") if isinstance(context.get("session"), dict) else {}
  return json_safe({
    "source": "douyin_live_center_recording",
    "session": {
      "sessionId": session.get("sessionId"),
      "anchorNickname": session.get("anchorNickname"),
      "liveStartTime": session.get("liveStartTime"),
      "liveEndTime": session.get("liveEndTime"),
    },
    "segment": _redact_model_input(video),
    "durationSeconds": video.get("sliceDurationSeconds") or video.get("durationSeconds"),
  })


def _upload_live_analysis_artifact(
  *,
  storage: TosStorageClient,
  path: Path,
  content_type: str,
  analysis_id: str,
  segment: Mapping[str, Any],
  kind: str,
  ext: str,
) -> str:
  digest = sha256_file(path)
  now = datetime.now(timezone.utc)
  segment_index = _segment_index_for_path(segment)
  normalized_ext = ext if ext.startswith(".") else f".{ext}"
  object_key = (
    f"live-recordings/analysis/{now:%Y}/{now:%m}/{analysis_id}/"
    f"segment-{segment_index:03d}/{kind}-{digest}{normalized_ext.lower()}"
  )
  storage.upload_file(object_key, path, content_type)
  return object_key


def _derived_input_prompt_snapshot(
  derived_inputs: Mapping[str, Any],
  config: LiveCenterAnalysisConfig,
  *,
  main_request: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
  videos = _redact_model_inputs(derived_inputs.get("videos"))
  frames = _redact_model_inputs(derived_inputs.get("frames"))
  transcripts = json_safe(derived_inputs.get("asrTranscripts") or [])
  skipped = json_safe(derived_inputs.get("skipped") or [])
  return {
    "maxSegments": config.max_segments,
    "directVideoMaxBytes": config.max_video_bytes,
    "proxyTargetBytes": config.proxy_target_bytes,
    "maxProxySliceSeconds": config.max_proxy_slice_seconds,
    "maxProxySlicesPerSegment": config.max_proxy_slices_per_segment,
    "frameCountPerSegment": config.frame_count_per_segment,
    "asrMode": config.asr_mode,
    "videoCount": len(videos),
    "frameCount": len(frames),
    "asrTranscriptCount": len([item for item in transcripts if isinstance(item, dict) and item.get("status") == "succeeded"]),
    "selectedSegmentIndexes": sorted({
      item.get("segmentIndex")
      for item in videos
      if isinstance(item, dict) and item.get("segmentIndex") is not None
    }),
    "videos": videos,
    "frames": frames,
    "asrTranscripts": transcripts,
    "skipped": skipped,
    "samplingPlan": json_safe(derived_inputs.get("samplingPlan") or {}),
    "mainAnalysisRequest": json_safe(dict(main_request or {})),
  }


def _main_analysis_request_snapshot(
  derived_inputs: Mapping[str, Any],
  *,
  include_video_inputs: bool,
  request_mode: str,
  reason: Optional[str] = None,
) -> Dict[str, Any]:
  videos = _redact_model_inputs(derived_inputs.get("videos"))
  frames = _redact_model_inputs(derived_inputs.get("frames"))
  transcripts = json_safe(derived_inputs.get("asrTranscripts") or [])
  snapshot: Dict[str, Any] = {
    "requestMode": request_mode,
    "includeVideoInputs": bool(include_video_inputs),
    "includeFrameInputs": True,
    "videoInputCount": len(videos) if include_video_inputs else 0,
    "availableVideoInputCount": len(videos),
    "frameInputCount": len(frames),
    "asrTranscriptCount": len([
      item for item in transcripts
      if isinstance(item, dict) and item.get("status") == "succeeded"
    ]),
    "selectedSegmentIndexes": _selected_segment_indexes(videos or frames or transcripts),
  }
  if reason:
    snapshot["reason"] = reason
  return snapshot


def _build_sampling_plan(
  context: Mapping[str, Any],
  *,
  selected_segments: Any,
  derived_inputs: Mapping[str, Any],
  main_request: Mapping[str, Any],
) -> Dict[str, Any]:
  minute_metrics = context.get("minuteMetrics") if isinstance(context.get("minuteMetrics"), list) else []
  selected_indexes = [
    _optional_int(segment.get("segmentIndex"))
    for segment in selected_segments
    if isinstance(segment, dict) and _optional_int(segment.get("segmentIndex")) is not None
  ]
  valid_metrics = [item for item in minute_metrics if isinstance(item, dict)]
  metric_offsets = [
    _optional_int(item.get("minuteOffset"))
    for item in valid_metrics
    if _optional_int(item.get("minuteOffset")) is not None
  ]
  total_minutes = max(metric_offsets) + 1 if metric_offsets else len(valid_metrics)
  order_minutes = [item for item in valid_metrics if int(item.get("orderCount") or 0) > 0]
  selected_index_set = {index for index in selected_indexes if index is not None}
  windows: List[Dict[str, Any]] = []
  for event_window in _build_metric_event_windows(context):
    window = {
      key: json_safe(value)
      for key, value in event_window.items()
      if not key.startswith("_")
    }
    if selected_index_set:
      window["segmentIndexes"] = [
        index for index in (window.get("segmentIndexes") or [])
        if index in selected_index_set
      ]
    window.update(_event_window_input_coverage(event_window, derived_inputs))
    windows.append(window)

  return {
    "strategy": "metric_led_event_slicing" if total_minutes else "segment_order_fallback",
    "selectedSegmentIndexes": selected_indexes,
    "selectedWindows": windows[:8],
    "coverageSummary": _derive_evidence_coverage(
      context,
      derived_inputs=derived_inputs,
      main_request=main_request,
    ),
    "notes": (
      "按开场、首单、成交峰值、收尾和长空窗优先采样；当前缺失商品卡/OCR/弹幕时，"
      "对应结论只能作为复核项。"
    ),
    "orderMinuteCount": len(order_minutes),
  }


def _event_window_input_coverage(
  event_window: Mapping[str, Any],
  derived_inputs: Mapping[str, Any],
) -> Dict[str, Any]:
  window_start = _float_or_none(event_window.get("offsetStartSeconds"))
  window_end = _float_or_none(event_window.get("offsetEndSeconds"))
  if window_start is None or window_end is None:
    return {
      "selectedInputRoles": [],
      "sliceIndexes": [],
      "frameIndexes": [],
    }

  segment_indexes: List[int] = []
  slice_indexes: List[int] = []
  frame_indexes: List[int] = []
  selected_roles: List[str] = []

  for source_key, source_role in (
    ("videos", "video"),
    ("frames", "frame"),
    ("asrTranscripts", "asr"),
  ):
    values = derived_inputs.get(source_key)
    if not isinstance(values, list):
      continue
    for item in values:
      if not isinstance(item, dict):
        continue
      if source_role == "asr" and item.get("status") != "succeeded":
        continue
      item_start, item_end = _input_offset_bounds(item)
      if item_start is None:
        continue
      if not _input_overlaps_offset_window(item_start, item_end, window_start, window_end):
        continue
      role = str(item.get("modelInputRole") or source_role)
      if source_role == "asr":
        role = f"asr:{role}"
      selected_roles.append(role)
      segment_index = _optional_int(item.get("segmentIndex"))
      slice_index = _optional_int(item.get("sliceIndex"))
      frame_index = _optional_int(item.get("frameIndex"))
      if segment_index is not None:
        segment_indexes.append(segment_index)
      if slice_index is not None:
        slice_indexes.append(slice_index)
      if frame_index is not None:
        frame_indexes.append(frame_index)

  return {
    "selectedInputRoles": sorted(set(selected_roles)),
    "selectedSegmentIndexes": sorted(set(segment_indexes)),
    "sliceIndexes": sorted(set(slice_indexes)),
    "frameIndexes": sorted(set(frame_indexes)),
  }


def _input_offset_bounds(item: Mapping[str, Any]) -> tuple[Optional[float], Optional[float]]:
  start = _float_or_none(item.get("offsetStartSeconds"))
  end = _float_or_none(item.get("offsetEndSeconds"))
  if start is None and isinstance(item.get("timeAnchor"), dict):
    start = _float_or_none(item["timeAnchor"].get("offsetStartSeconds"))
  if end is None and isinstance(item.get("timeAnchor"), dict):
    end = _float_or_none(item["timeAnchor"].get("offsetEndSeconds"))
  if end is None:
    end = start
  return start, end


def _input_overlaps_offset_window(
  item_start: float,
  item_end: Optional[float],
  window_start: float,
  window_end: float,
) -> bool:
  end = item_start if item_end is None else item_end
  if end <= item_start:
    return window_start <= item_start < window_end
  return _offset_windows_overlap(item_start, end, window_start, window_end)


def _format_minute_window_label(start_offset: int, end_offset: int) -> str:
  start = max(1, int(start_offset) + 1)
  end = max(start, int(end_offset) + 1)
  return f"第 {start}-{end} 分钟"


def _segment_overlaps_minute_window(
  context: Mapping[str, Any],
  segment_index: int,
  start_minute: int,
  end_minute: int,
) -> bool:
  segment = _find_segment_by_index(context, segment_index)
  if not segment:
    return False
  start = _float_or_none(segment.get("startOffsetSeconds"))
  end = _float_or_none(segment.get("endOffsetSeconds"))
  if start is None or end is None:
    return False
  return start <= end_minute * 60 and end >= start_minute * 60


def _attach_derived_inputs_to_context(
  context: Mapping[str, Any],
  derived_inputs: Mapping[str, Any],
  config: LiveCenterAnalysisConfig,
  *,
  main_request: Mapping[str, Any],
) -> None:
  if not isinstance(context, dict):
    return
  prompt_snapshot = _derived_input_prompt_snapshot(
    derived_inputs,
    config,
    main_request=main_request,
  )
  context["derivedInputs"] = prompt_snapshot
  recording = context.get("recording")
  if isinstance(recording, dict):
    recording["videoInput"] = {
      "selectedSegmentIndexes": prompt_snapshot.get("selectedSegmentIndexes") or [],
      "videoCount": prompt_snapshot.get("videoCount") or 0,
      "frameCount": prompt_snapshot.get("frameCount") or 0,
      "asrTranscriptCount": prompt_snapshot.get("asrTranscriptCount") or 0,
      "mainAnalysisRequest": json_safe(dict(main_request)),
      "samplingPlan": json_safe(prompt_snapshot.get("samplingPlan") or {}),
    }


def _should_retry_without_video_inputs(
  error: ArkResponsesError,
  derived_inputs: Mapping[str, Any],
  analysis_profile: str,
  config: LiveCenterAnalysisConfig,
) -> bool:
  if not config.retry_without_video_on_token_limit:
    return False
  if analysis_profile == "l1_text":
    return False
  if not (derived_inputs.get("videos") or []):
    return False
  message = str(error).lower()
  token_limit_markers = (
    "max message tokens",
    "total tokens",
    "token limit",
    "tokens of multi-modal",
    "context length",
    "input is too long",
    "exceed max",
  )
  return any(marker in message for marker in token_limit_markers)


def _redact_model_inputs(value: Any) -> List[Dict[str, Any]]:
  if not isinstance(value, list):
    return []
  return [_redact_model_input(item) for item in value if isinstance(item, dict)]


def _selected_segment_indexes(items: Any) -> List[Any]:
  if not isinstance(items, list):
    return []
  indexes = {
    item.get("segmentIndex")
    for item in items
    if isinstance(item, dict) and item.get("segmentIndex") is not None
  }
  return sorted(indexes)


def _redact_model_input(item: Mapping[str, Any]) -> Dict[str, Any]:
  return {
    key: json_safe(value)
    for key, value in item.items()
    if key != "url"
  }


def _metric_led_segment_slice_windows(
  *,
  segment: Mapping[str, Any],
  context: Mapping[str, Any],
  duration_seconds: Optional[float],
  max_slice_seconds: int,
  max_slices: int,
) -> List[Dict[str, Any]]:
  fallback_windows = [
    {
      **window,
      "sliceReason": "fallback_even_coverage",
    }
    for window in _segment_slice_windows(
      duration_seconds=duration_seconds,
      max_slice_seconds=max_slice_seconds,
      max_slices=max_slices,
    )
  ]
  if not duration_seconds or duration_seconds <= 0:
    return []

  max_selected = max(1, int(max_slices))
  slice_seconds = max(1.0, min(float(max_slice_seconds), float(duration_seconds)))
  segment_start, segment_end = _segment_offset_bounds(segment, duration_seconds=duration_seconds)
  if segment_start is None or segment_end is None:
    return fallback_windows

  selected: List[Dict[str, Any]] = []
  event_windows = _build_metric_event_windows(context)
  for event_window in event_windows:
    window_start = _float_or_none(event_window.get("offsetStartSeconds"))
    window_end = _float_or_none(event_window.get("offsetEndSeconds"))
    if window_start is None or window_end is None:
      continue
    overlap_start = max(segment_start, window_start)
    overlap_end = min(segment_end, window_end)
    if overlap_end <= overlap_start:
      continue
    if overlap_start <= segment_start + 0.001:
      start = 0.0
    elif overlap_end >= segment_end - 0.001:
      start = max(0.0, float(duration_seconds) - slice_seconds)
    else:
      center_local = ((overlap_start + overlap_end) / 2.0) - segment_start
      start = _clamp_slice_start(
        center_local - (slice_seconds / 2.0),
        duration_seconds=float(duration_seconds),
        slice_seconds=slice_seconds,
      )
    window = {
      "startSeconds": round(start, 3),
      "durationSeconds": round(max(0.001, min(slice_seconds, float(duration_seconds) - start)), 3),
      "sliceReason": event_window.get("reason") or "metric_event_window",
      "eventWindow": _event_window_for_input(event_window, overlap_start, overlap_end),
      "_priority": event_window.get("_priority") or 999,
    }
    _append_slice_window_deduped(selected, window, max_slice_seconds=max_slice_seconds)
    if len(selected) >= max_selected:
      break

  for fallback_window in fallback_windows:
    if len(selected) >= max_selected:
      break
    _append_slice_window_deduped(selected, fallback_window, max_slice_seconds=max_slice_seconds)

  if not selected:
    return fallback_windows
  return [
    {key: value for key, value in window.items() if key != "_priority"}
    for window in sorted(selected[:max_selected], key=lambda item: item["startSeconds"])
  ]


def _metric_led_frame_timestamps(
  *,
  segment: Mapping[str, Any],
  context: Mapping[str, Any],
  duration_seconds: Optional[float],
  frame_count: int,
) -> List[Dict[str, Any]]:
  if not duration_seconds or duration_seconds <= 0 or frame_count <= 0:
    return []

  max_selected = max(0, int(frame_count))
  segment_start, segment_end = _segment_offset_bounds(segment, duration_seconds=duration_seconds)
  selected: List[Dict[str, Any]] = []
  if segment_start is not None and segment_end is not None:
    for event_window in _build_metric_event_windows(context):
      window_start = _float_or_none(event_window.get("offsetStartSeconds"))
      window_end = _float_or_none(event_window.get("offsetEndSeconds"))
      if window_start is None or window_end is None:
        continue
      overlap_start = max(segment_start, window_start)
      overlap_end = min(segment_end, window_end)
      if overlap_end <= overlap_start:
        continue
      timestamp = round(min(
        max(0.0, ((overlap_start + overlap_end) / 2.0) - segment_start),
        max(0.0, float(duration_seconds) - 0.05),
      ), 3)
      _append_frame_timestamp_deduped(selected, {
        "timestampSeconds": timestamp,
        "timestampReason": event_window.get("reason") or "metric_event_window",
        "eventWindow": _event_window_for_input(event_window, overlap_start, overlap_end),
        "_priority": event_window.get("_priority") or 999,
      })
      if len(selected) >= max_selected:
        break

  for timestamp in _frame_timestamps(duration_seconds, frame_count):
    if len(selected) >= max_selected:
      break
    _append_frame_timestamp_deduped(selected, {
      "timestampSeconds": timestamp,
      "timestampReason": "fallback_even_frame",
    })

  return [
    {key: value for key, value in item.items() if key != "_priority"}
    for item in sorted(selected[:max_selected], key=lambda value: value["timestampSeconds"])
  ]


def _build_metric_event_windows(context: Mapping[str, Any]) -> List[Dict[str, Any]]:
  minute_metrics = context.get("minuteMetrics") if isinstance(context.get("minuteMetrics"), list) else []
  valid_metrics = [
    item for item in minute_metrics
    if isinstance(item, dict) and _optional_int(item.get("minuteOffset")) is not None
  ]
  if not valid_metrics:
    return []
  max_minute_offset = max(_optional_int(item.get("minuteOffset")) or 0 for item in valid_metrics)
  total_minutes = max(1, max_minute_offset + 1)
  first_order_offset = _first_order_minute_offset(valid_metrics)
  peak_offset = _peak_order_minute_offset(valid_metrics)
  windows: List[Dict[str, Any]] = []

  def add_window(
    reason: str,
    priority: int,
    start_minute: int,
    end_minute_exclusive: int,
    expected: List[str],
  ) -> None:
    start = max(0, int(start_minute))
    end_exclusive = max(start + 1, min(total_minutes, int(end_minute_exclusive)))
    offset_start_seconds = float(start * 60)
    offset_end_seconds = float(end_exclusive * 60)
    existing = next(
      (
        item for item in windows
        if item.get("minuteStartOffset") == start
        and item.get("minuteEndOffsetExclusive") == end_exclusive
      ),
      None,
    )
    if existing:
      existing_reasons = existing.setdefault("reasons", [existing.get("reason")])
      if reason not in existing_reasons:
        existing_reasons.append(reason)
      existing["reason"] = "+".join([item for item in existing_reasons if item])
      existing["expectedEvidence"] = sorted(set((existing.get("expectedEvidence") or []) + expected))
      existing["_priority"] = min(int(existing.get("_priority") or priority), priority)
      return
    segment_indexes = _segment_indexes_for_offset_window(context, offset_start_seconds, offset_end_seconds)
    windows.append({
      "_priority": priority,
      "reason": reason,
      "reasons": [reason],
      "minuteStartOffset": start,
      "minuteEndOffsetExclusive": end_exclusive,
      "minuteRange": _format_minute_window_label(start, end_exclusive - 1),
      "offsetStartSeconds": offset_start_seconds,
      "offsetEndSeconds": offset_end_seconds,
      "expectedEvidence": expected,
      "segmentIndexes": segment_indexes,
    })

  add_window("opening_cold_start", 10, 0, min(total_minutes, 5), ["asr", "frame", "metric"])
  if first_order_offset is not None:
    add_window("first_order_window", 20, first_order_offset - 3, first_order_offset + 4, ["asr", "metric"])
  if peak_offset is not None:
    add_window("peak_order_window", 30, peak_offset - 3, peak_offset + 4, ["asr", "frame", "metric"])
  add_window("closing_window", 40, max(0, total_minutes - 5), total_minutes, ["asr", "frame", "metric"])

  return sorted(windows, key=lambda item: int(item.get("_priority") or 999))


def _segment_indexes_for_offset_window(
  context: Mapping[str, Any],
  offset_start_seconds: float,
  offset_end_seconds: float,
) -> List[int]:
  recording = context.get("recording") if isinstance(context.get("recording"), dict) else {}
  segments = recording.get("segments") if isinstance(recording.get("segments"), list) else []
  indexes: List[int] = []
  for segment in segments:
    if not isinstance(segment, dict):
      continue
    if not _is_playable_recording_segment(segment):
      continue
    segment_start, segment_end = _segment_offset_bounds(segment)
    segment_index = _optional_int(segment.get("segmentIndex"))
    if (
      segment_index is not None
      and segment_start is not None
      and segment_end is not None
      and _offset_windows_overlap(segment_start, segment_end, offset_start_seconds, offset_end_seconds)
    ):
      indexes.append(segment_index)
  return sorted(set(indexes))


def _event_window_for_input(
  event_window: Mapping[str, Any],
  overlap_start_seconds: float,
  overlap_end_seconds: float,
) -> Dict[str, Any]:
  return {
    "reason": event_window.get("reason"),
    "reasons": json_safe(event_window.get("reasons") or [event_window.get("reason")]),
    "minuteRange": event_window.get("minuteRange"),
    "minuteStartOffset": event_window.get("minuteStartOffset"),
    "minuteEndOffsetExclusive": event_window.get("minuteEndOffsetExclusive"),
    "offsetStartSeconds": event_window.get("offsetStartSeconds"),
    "offsetEndSeconds": event_window.get("offsetEndSeconds"),
    "overlapOffsetStartSeconds": round(float(overlap_start_seconds), 3),
    "overlapOffsetEndSeconds": round(float(overlap_end_seconds), 3),
    "expectedEvidence": json_safe(event_window.get("expectedEvidence") or []),
    "segmentIndexes": json_safe(event_window.get("segmentIndexes") or []),
  }


def _segment_offset_bounds(
  segment: Mapping[str, Any],
  *,
  duration_seconds: Optional[float] = None,
) -> tuple[Optional[float], Optional[float]]:
  start = _float_or_none(segment.get("startOffsetSeconds"))
  end = _float_or_none(segment.get("endOffsetSeconds"))
  duration = _float_or_none(segment.get("durationSeconds")) or _float_or_none(duration_seconds)
  if start is None and isinstance(segment.get("timeAnchor"), dict):
    start = _float_or_none(segment["timeAnchor"].get("offsetStartSeconds"))
  if end is None and isinstance(segment.get("timeAnchor"), dict):
    end = _float_or_none(segment["timeAnchor"].get("offsetEndSeconds"))
  if end is None and start is not None and duration is not None:
    end = start + duration
  return start, end


def _offset_windows_overlap(
  left_start: float,
  left_end: float,
  right_start: float,
  right_end: float,
) -> bool:
  return left_start < right_end and left_end > right_start


def _clamp_slice_start(
  start_seconds: float,
  *,
  duration_seconds: float,
  slice_seconds: float,
) -> float:
  max_start = max(0.0, duration_seconds - slice_seconds)
  return max(0.0, min(float(start_seconds), max_start))


def _append_slice_window_deduped(
  windows: List[Dict[str, Any]],
  candidate: Dict[str, Any],
  *,
  max_slice_seconds: int,
) -> None:
  candidate_start = float(candidate.get("startSeconds") or 0.0)
  threshold = max(1.0, min(30.0, float(max_slice_seconds) * 0.25))
  for existing in windows:
    existing_start = float(existing.get("startSeconds") or 0.0)
    if abs(existing_start - candidate_start) <= threshold:
      _merge_input_window_reason(existing, candidate)
      return
  windows.append(candidate)


def _append_frame_timestamp_deduped(
  timestamps: List[Dict[str, Any]],
  candidate: Dict[str, Any],
) -> None:
  candidate_timestamp = float(candidate.get("timestampSeconds") or 0.0)
  for existing in timestamps:
    existing_timestamp = float(existing.get("timestampSeconds") or 0.0)
    if abs(existing_timestamp - candidate_timestamp) <= 1.0:
      _merge_input_window_reason(existing, candidate)
      return
  timestamps.append(candidate)


def _merge_input_window_reason(existing: Dict[str, Any], candidate: Mapping[str, Any]) -> None:
  existing_priority = int(existing.get("_priority") or 999)
  candidate_priority = int(candidate.get("_priority") or 999)
  if candidate_priority < existing_priority:
    existing.update(candidate)
    return
  existing_reason = str(existing.get("sliceReason") or existing.get("timestampReason") or "")
  candidate_reason = str(candidate.get("sliceReason") or candidate.get("timestampReason") or "")
  if candidate_reason and candidate_reason not in existing_reason:
    merged_reason = "+".join([item for item in [existing_reason, candidate_reason] if item])
    if "sliceReason" in existing:
      existing["sliceReason"] = merged_reason
    if "timestampReason" in existing:
      existing["timestampReason"] = merged_reason


def _segment_slice_windows(
  *,
  duration_seconds: Optional[float],
  max_slice_seconds: int,
  max_slices: int,
) -> List[Dict[str, float]]:
  if not duration_seconds or duration_seconds <= 0:
    return []
  slice_seconds = max(1, int(max_slice_seconds))
  max_slices = max(1, int(max_slices))
  required_slices = int((duration_seconds + slice_seconds - 0.001) // slice_seconds)
  selected_slices = max(1, min(required_slices, max_slices))
  if selected_slices >= required_slices:
    starts = [float(index * slice_seconds) for index in range(required_slices)]
  elif selected_slices == 1:
    starts = [0.0]
  else:
    max_start = max(0.0, float(duration_seconds) - slice_seconds)
    step = max_start / (selected_slices - 1)
    starts = [round(index * step, 3) for index in range(selected_slices)]
  return [
    {
      "startSeconds": start,
      "durationSeconds": max(0.001, min(float(slice_seconds), float(duration_seconds) - start)),
    }
    for start in starts
    if start < float(duration_seconds)
  ]


def _frame_timestamps(duration_seconds: Optional[float], frame_count: int) -> List[float]:
  if not duration_seconds or duration_seconds <= 0 or frame_count <= 0:
    return []
  safe_duration = max(0.1, float(duration_seconds))
  return [
    round(min(safe_duration - 0.05, safe_duration * (index + 1) / (frame_count + 1)), 3)
    for index in range(frame_count)
  ]


def _build_time_anchor(
  *,
  live_start_time: Any,
  offset_start_seconds: Optional[float],
  offset_end_seconds: Optional[float],
  segment_index: Optional[int] = None,
  display_segment_index: Optional[int] = None,
  slice_index: Optional[int] = None,
) -> Dict[str, Any]:
  offset_range = _format_offset_range(offset_start_seconds, offset_end_seconds)
  minute_range = _format_minute_range(offset_start_seconds, offset_end_seconds)
  clock_start = _offset_to_clock(live_start_time, offset_start_seconds)
  clock_end = _offset_to_clock(live_start_time, offset_end_seconds)
  clock_range = _format_clock_range(clock_start, clock_end)
  segment_label = _format_segment_label(display_segment_index or segment_index, slice_index)
  display_parts = [
    clock_range or offset_range,
    minute_range,
    segment_label,
  ]
  return {
    "offsetStartSeconds": offset_start_seconds,
    "offsetEndSeconds": offset_end_seconds,
    "offsetRange": offset_range,
    "clockStartTime": clock_start.isoformat() if clock_start else None,
    "clockEndTime": clock_end.isoformat() if clock_end else None,
    "clockTimeRange": clock_range,
    "minuteRangeLabel": minute_range,
    "segmentLabel": segment_label,
    "segmentIndex": segment_index,
    "displaySegmentIndex": display_segment_index,
    "sliceIndex": slice_index,
    "displayTimeRange": "｜".join([part for part in display_parts if part]),
  }


def _segment_time_anchor(
  segment: Mapping[str, Any],
  *,
  slice_start_seconds: Optional[float] = None,
  slice_end_seconds: Optional[float] = None,
  timestamp_seconds: Optional[float] = None,
  slice_index: Optional[int] = None,
) -> Dict[str, Any]:
  base_start = _float_or_none(segment.get("startOffsetSeconds"))
  base_end = _float_or_none(segment.get("endOffsetSeconds"))
  duration = _float_or_none(segment.get("durationSeconds"))
  if base_start is None and isinstance(segment.get("timeAnchor"), dict):
    base_start = _float_or_none(segment["timeAnchor"].get("offsetStartSeconds"))
  if base_end is None and isinstance(segment.get("timeAnchor"), dict):
    base_end = _float_or_none(segment["timeAnchor"].get("offsetEndSeconds"))

  if timestamp_seconds is not None:
    start = (base_start or 0.0) + float(timestamp_seconds)
    end = start
  elif slice_start_seconds is not None:
    start = (base_start or 0.0) + float(slice_start_seconds)
    end = (base_start or 0.0) + float(slice_end_seconds) if slice_end_seconds is not None else None
  else:
    start = base_start
    end = base_end
    if start is not None and end is None and duration is not None:
      end = start + duration

  return _build_time_anchor(
    live_start_time=segment.get("liveStartTime"),
    offset_start_seconds=start,
    offset_end_seconds=end,
    segment_index=_optional_int(segment.get("segmentIndex")),
    display_segment_index=_optional_int(segment.get("displaySegmentIndex")),
    slice_index=slice_index,
  )


def _format_offset_range(start: Optional[float], end: Optional[float]) -> str:
  if start is None and end is None:
    return ""
  if start is not None and end is not None:
    return f"{_format_hhmmss(start)}-{_format_hhmmss(end)}"
  if start is not None:
    return f"{_format_hhmmss(start)} 起"
  return f"至 {_format_hhmmss(end or 0)}"


def _format_minute_range(start: Optional[float], end: Optional[float]) -> str:
  if start is None and end is None:
    return ""
  start_value = max(0.0, float(start or 0.0))
  end_value = max(start_value, float(end if end is not None else start_value))
  start_minute = int(start_value // 60) + 1
  end_minute = max(start_minute, int((end_value + 59.999) // 60))
  if start_minute == end_minute:
    return f"第 {start_minute} 分钟"
  return f"第 {start_minute}-{end_minute} 分钟"


def _format_segment_label(segment_index: Optional[int], slice_index: Optional[int]) -> str:
  if segment_index and slice_index:
    return f"录屏 #{segment_index} / slice {slice_index}"
  if segment_index:
    return f"录屏 #{segment_index}"
  if slice_index:
    return f"slice {slice_index}"
  return ""


def _offset_to_clock(live_start_time: Any, offset_seconds: Optional[float]) -> Optional[datetime]:
  if offset_seconds is None:
    return None
  live_start = _parse_live_datetime(live_start_time)
  if live_start is None:
    return None
  return live_start + timedelta(seconds=float(offset_seconds))


def _parse_live_datetime(value: Any) -> Optional[datetime]:
  if value is None:
    return None
  if isinstance(value, datetime):
    return value
  text = str(value).strip()
  if not text:
    return None
  try:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))
  except ValueError:
    return None


def _format_clock_range(start: Optional[datetime], end: Optional[datetime]) -> str:
  if start is None and end is None:
    return ""
  if start is not None and end is not None:
    if start.date() == end.date():
      return f"{start:%H:%M:%S}-{end:%H:%M:%S}"
    return f"{start:%m-%d %H:%M:%S}-{end:%m-%d %H:%M:%S}"
  if start is not None:
    return f"{start:%H:%M:%S} 起"
  return f"至 {end:%H:%M:%S}"


def _base_segment_input(segment: Mapping[str, Any]) -> Dict[str, Any]:
  time_anchor = _segment_time_anchor(segment)
  return {
    "segmentIndex": segment.get("segmentIndex"),
    "segmentId": segment.get("segmentId"),
    "fileName": segment.get("fileName"),
    "sourceObjectKey": segment.get("rawObjectKey"),
    "sourceSizeBytes": _optional_int(segment.get("fileSizeBytes")),
    "durationSeconds": _float_or_none(segment.get("durationSeconds")),
    "startOffsetSeconds": _float_or_none(segment.get("startOffsetSeconds")),
    "endOffsetSeconds": _float_or_none(segment.get("endOffsetSeconds")),
    "timeAnchor": time_anchor,
    "displayTimeRange": time_anchor.get("displayTimeRange"),
  }


def _segment_skip(segment: Mapping[str, Any], reason: str) -> Dict[str, Any]:
  return {
    **_base_segment_input(segment),
    "reason": reason,
  }


def _segment_index_for_path(segment: Mapping[str, Any]) -> int:
  value = _optional_int(segment.get("segmentIndex"))
  return value if value is not None and value > 0 else 0


def _segment_file_ext(segment: Mapping[str, Any]) -> str:
  value = str(segment.get("fileExt") or "").strip()
  if not value:
    file_name = str(segment.get("fileName") or "")
    value = Path(file_name).suffix
  if not value:
    value = ".mp4"
  return value if value.startswith(".") else f".{value}"


def _segment_mime_type(segment: Mapping[str, Any]) -> str:
  mime_type = str(segment.get("mimeType") or "").strip()
  return mime_type if mime_type.startswith("video/") else "video/mp4"


def _truncate_text(value: Any, max_chars: int) -> str:
  text = str(value or "")
  if max_chars <= 0:
    return ""
  if len(text) <= max_chars:
    return text
  return text[:max_chars] + "..."


def _truncate_transcript_segments(
  value: Any,
  *,
  max_segments: int,
  max_chars_per_segment: int,
) -> List[Dict[str, Any]]:
  if not isinstance(value, list) or max_segments <= 0:
    return []
  truncated: List[Dict[str, Any]] = []
  for item in value[:max_segments]:
    if not isinstance(item, dict):
      continue
    row: Dict[str, Any] = {}
    for key, raw_value in item.items():
      if isinstance(raw_value, str):
        row[key] = _truncate_text(raw_value, max_chars_per_segment)
      else:
        row[key] = json_safe(raw_value)
    truncated.append(row)
  return truncated


def _optional_int(value: Any) -> Optional[int]:
  if value is None:
    return None
  try:
    return int(value)
  except (TypeError, ValueError):
    return None


def _load_session(conn: psycopg2.extensions.connection, session_key: str) -> Dict[str, Any]:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      SELECT *
      FROM (
        SELECT DISTINCT ON (session_id)
          md5(
            COALESCE(NULLIF(BTRIM(d.shop_id), ''), '')
            || '|'
            || COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '')
            || '|'
            || (
              CASE
                WHEN d.live_end_time IS NOT NULL AND d.live_end_time > d.live_start_time
                  THEN DATE_TRUNC('minute', d.live_end_time)
                ELSE DATE_TRUNC('minute', d.live_start_time)
              END
            )::TEXT
          ) AS session_id,
          COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
          COALESCE(NULLIF(BTRIM(d.shop_name), ''), '') AS shop_name,
          COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
          COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '') AS anchor_nickname,
          NULLIF(BTRIM(COALESCE(d.anchor_avatar, '')), '') AS anchor_avatar,
          d.live_start_time,
          d.live_end_time,
          COALESCE(d.live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
          COALESCE(d.live_order_count, 0)::BIGINT AS live_order_count,
          COALESCE(d.live_gmv, 0)::DOUBLE PRECISION AS live_gmv,
          COALESCE(d.live_user_pay_amount, 0)::DOUBLE PRECISION AS live_user_pay_amount,
          d.source_updated_at,
          d.updated_at
        FROM ads.douyin_live_detail d
        WHERE d.live_start_time IS NOT NULL
          AND NULLIF(BTRIM(COALESCE(d.anchor_douyin_id, '')), '') IS NOT NULL
          AND COALESCE(d.is_self_live, FALSE) IS TRUE
          AND LOWER(COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '')) LIKE %s
        ORDER BY session_id, source_updated_at DESC NULLS LAST, updated_at DESC NULLS LAST, live_start_time DESC
      ) source
      WHERE session_id = %s
      """,
      ("groland%", session_key),
    )
    row = cur.fetchone()
  if not row:
    raise RuntimeError("分析任务关联的直播场次不存在")
  return _session_row_to_contract(row)


def _load_minute_metrics(
  conn: psycopg2.extensions.connection,
  session_key: str,
  max_minute_metrics: int,
) -> List[Dict[str, Any]]:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      SELECT
        live_minute_time,
        minute_offset,
        order_count::BIGINT AS order_count,
        match_status,
        match_reason
      FROM ads.douyin_live_session_minute_metrics
      WHERE session_key = %s
      ORDER BY live_minute_time ASC, source_row_id ASC
      LIMIT %s
      """,
      (session_key, max(1, int(max_minute_metrics))),
    )
    rows = list(cur.fetchall())
  return [_minute_row_to_contract(row) for row in rows]


def _load_recording(
  conn: psycopg2.extensions.connection,
  *,
  session_key: str,
  recording_id: str,
) -> Dict[str, Any]:
  if recording_id:
    recording_filter = "r.recording_id = %(recording_id)s::uuid"
  else:
    recording_filter = "r.session_key = %(session_key)s AND r.status = 'active'"

  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      f"""
      SELECT
        r.recording_id,
        r.session_key,
        r.status,
        r.created_at,
        r.updated_at
      FROM ads.douyin_live_session_recordings r
      WHERE {recording_filter}
      ORDER BY r.updated_at DESC
      LIMIT 1
      """,
      {"recording_id": recording_id or None, "session_key": session_key},
    )
    recording = cur.fetchone()
    if not recording:
      raise RuntimeError("分析任务关联的录屏集合不存在")
    cur.execute(
      """
      SELECT
        segment_id,
        recording_id,
        segment_index,
        bucket,
        raw_object_key,
        preview_object_key,
        file_name,
        mime_type,
        file_ext,
        file_size_bytes,
        sha256,
        duration_seconds::DOUBLE PRECISION AS duration_seconds,
        start_offset_seconds::DOUBLE PRECISION AS start_offset_seconds,
        end_offset_seconds::DOUBLE PRECISION AS end_offset_seconds,
        upload_status,
        processing_status,
        uploaded_by_user_id,
        uploaded_at,
        created_at,
        updated_at
      FROM ads.douyin_live_session_recording_segments
      WHERE recording_id = %s
        AND upload_status = 'uploaded'
      ORDER BY segment_index ASC, created_at ASC
      """,
      (str(recording["recording_id"]),),
    )
    segments = list(cur.fetchall())

  return {
    "recordingId": str(recording["recording_id"]),
    "sessionId": str(recording["session_key"]),
    "status": str(recording["status"]),
    "createdAt": _isoformat(recording.get("created_at")),
    "updatedAt": _isoformat(recording.get("updated_at")),
    "segments": [
      _segment_row_to_contract(row, display_segment_index=index)
      for index, row in enumerate(segments, start=1)
    ],
  }


class ArkLiveRecordingClient:
  def __init__(self, config: LiveCenterAnalysisConfig):
    self.config = config
    self.session = requests.Session()

  def analyze_recording(
    self,
    *,
    context: Mapping[str, Any],
    derived_inputs: Mapping[str, Any],
    analysis_profile: str,
    prompt_version: str,
    requested_model: Any,
    include_video_inputs: bool = True,
  ) -> "LiveAnalysisResult":
    model = _resolve_requested_model(requested_model, self.config.model)
    prompt = _build_live_recording_prompt(context, prompt_version=prompt_version)
    content: List[Dict[str, Any]] = []
    if analysis_profile != "l1_text":
      if include_video_inputs:
        for segment in derived_inputs.get("videos") or []:
          content.append({
            "type": "input_video",
            "video_url": segment["url"],
            "fps": max(0.2, min(5.0, self.config.video_fps)),
          })
      for frame in derived_inputs.get("frames") or []:
        content.append({
          "type": "input_image",
          "image_url": frame["url"],
        })
    content.append({"type": "input_text", "text": prompt})

    payload: Dict[str, Any] = {
      "model": model,
      "input": [{"role": "user", "content": content}],
      "max_output_tokens": self.config.max_output_tokens,
      "thinking": {"type": self.config.thinking_type},
      "temperature": self.config.temperature,
      "store": self.config.store_response,
    }
    if self.config.reasoning_effort and self.config.thinking_type != "disabled":
      payload["reasoning"] = {"effort": self.config.reasoning_effort}
    if self.config.json_schema_strict:
      payload["text"] = {
        "format": {
          "type": "json_schema",
          "name": "douyin_live_recording_analysis_v4",
          "strict": True,
          "schema": live_recording_analysis_json_schema(),
        }
      }

    response = self._post(payload)
    output_text = extract_output_text(response)
    analysis = _parse_live_analysis_json(output_text)
    return LiveAnalysisResult(
      text=output_text,
      analysis=analysis,
      raw_response=response,
      model=model,
    )

  def _post(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    response = self.session.post(
      self.config.base_url,
      headers={
        "Authorization": f"Bearer {self.config.api_key}",
        "Content-Type": "application/json",
      },
      data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
      timeout=self.config.timeout_seconds,
    )
    if response.status_code >= 400:
      raise ArkResponsesError(
        f"Ark Responses API 调用失败 HTTP {response.status_code}: {_redact_sensitive(response.text, self.config.api_key)[:800]}"
      )
    try:
      payload = response.json()
    except json.JSONDecodeError as error:
      raise ArkResponsesError(
        f"Ark Responses API 返回非 JSON: {_redact_sensitive(response.text, self.config.api_key)[:800]}"
      ) from error
    if not isinstance(payload, dict):
      raise ArkResponsesError("Ark Responses API 返回结构不是对象")
    return payload


@dataclass(frozen=True)
class LiveAnalysisResult:
  text: str
  analysis: Dict[str, Any]
  raw_response: Dict[str, Any]
  model: str

  @property
  def usage(self) -> Dict[str, Any]:
    usage = self.raw_response.get("usage")
    return usage if isinstance(usage, dict) else {}

  @property
  def response_id(self) -> str:
    return str(self.raw_response.get("id") or "")


def _build_live_recording_prompt(context: Mapping[str, Any], *, prompt_version: str) -> str:
  derived_inputs = context.get("derivedInputs") if isinstance(context.get("derivedInputs"), dict) else {}
  asr_available = any(
    isinstance(item, dict) and item.get("status") == "succeeded"
    for item in (derived_inputs.get("asrTranscripts") or [])
  )
  frame_available = bool(derived_inputs.get("frames"))
  prompt_context = {
    "session": context.get("session") or {},
    "minuteMetrics": context.get("minuteMetrics") or [],
    "recording": _recording_prompt_snapshot(context.get("recording") or {}),
    "derivedInputs": json_safe(derived_inputs),
    "evidenceSourceAvailability": {
      "asr": "available_from_asr_transcripts" if asr_available else "not_available_in_current_worker",
      "frame": "available_from_extracted_frames" if frame_available else "not_available_in_current_worker",
      "comments": "not_available_in_current_worker",
      "product_card": "not_available_in_current_worker",
      "metric": "available_from_minute_metrics",
      "recording_segment": "available_from_uploaded_or_transcoded_video_segments",
    },
  }
  context_json = json.dumps(json_safe(prompt_context), ensure_ascii=False, indent=2)
  return f"""你是 Groland 抖音直播录屏 AI 分析 V4 的资深抖音直播运营复盘负责人，不是泛化摘要助手。

目标：基于直播录屏、场次信息和分钟成交指标，输出可直接写入 `ads.douyin_live_session_analysis.analysis_json` 的结构化 JSON。

V4 原则：
- Transcript-first：如果 derivedInputs.asrTranscripts 有 succeeded 项，优先以其中 transcriptText / scriptText 作为口播证据；如果 ASR 不可用或失败，不要声称已有逐字稿，并写入 reviewTasks。
- Evidence-driven：所有经营结论必须引用 evidenceLedger 中的 evidenceId；缺证据的判断只能进入 reviewTasks，不进入 primaryDecision。
- Multimodal-on-demand：如果本次输入包含视频或抽帧，请结合画面/声音/帧图；如果不能可靠识别，明确证据不足。
- Human review loop：把需要人工复核的片段、指标异常、缺失证据写入 reviewTasks。
- Coverage-aware：必须读取 derivedInputs.samplingPlan / mainAnalysisRequest / evidenceCoverage；采样 ASR 只能说“采样口播显示”，不能写“全程话术”；少量画面只能说“画面证据提示/需复核”，不能写“全程画面/商品卡确定如何”。
- 安全边界：不要输出 signed URL、密钥、请求头或任何临时鉴权参数。
- 运营复盘可用性：先下经营结论，再列关键证据；每条建议要落到主播/场控/投放/运营/复盘的具体动作。
- 时间锚点：优先使用输入中的 timeAnchor.displayTimeRange / clockTimeRange / minuteRangeLabel；不要只写“片段 1”，必须让运营知道对应直播时间。
- 录屏定位：timeAnchor 必须尽量保留 raw segmentIndex，并额外写 displaySegmentIndex 作为运营可见“录屏 #N”；如果只有 offsetStartSeconds/offsetEndSeconds，要根据 recording.segments 的 start/end/duration 推断 segmentIndex，不要输出“录屏待定位”。
- 话术边界：scriptReview/speechScript 里的主播原话、scriptQuote、quote 只能来自 transcriptText / scriptText，不要编造或润色成不存在的话。
- 证据闭合：所有 evidenceIds 必须能在 evidenceLedger 中找到同名 evidenceId；如果证据缺失，只能创建 reviewTasks 或 review 类型 evidence，不能让引用悬空。
- 信息去重：不要把同一句话复制到 summary、executiveReview、momentReviews、operatorScorecard、actionPlan、reviewTasks。不同字段要承担不同任务：首屏给结论，momentReviews 讲时间点证据，scriptReview 只点评原话，scorecard 只按维度评分，actionPlan 只写可执行动作，reviewTasks 只写缺证据/待人工复核。
- 输出克制：momentReviews 只保留 3-6 个最关键时间点，scriptReview 只保留 3-6 条最有代表性的原话，actionPlan 只保留 3-5 条互不重复动作；证据不足时合并成一个复核任务，不要为每个维度写同一句“待复核”。
- 长度硬约束：整份 JSON 控制在 9000 中文字以内；除主播原话外，单个字符串字段尽量不超过 90 个中文字符；rewriteSuggestion/action/reason 可以到 120 个中文字符，但不要写长段落。
- 资深运营复盘写法：先判断“为什么没有/为什么能转化”，再解释话术、商品、福利、CTA、互动、画面哪个环节最影响成交；不要把“ASR 成功几段、抽帧几张、录屏段数”写成主结论。
- 主路径不要写处理覆盖度：录屏段数、ASR 成功数、抽帧数、分钟指标数、缺失证据数只能进入 metrics/recording/input/analysisSelfEval 或 reviewTasks，不能作为 summary、executiveReview、momentReviews、operatorScorecard、actionPlan 的标题/结论。
- 每个主结论都要回答“这会如何影响成交”和“下一场具体怎么改”，不要只说“建议优化节奏/加强互动/继续观察”。
- 话术点评必须是“原话 -> 意图 -> 问题 -> 改写方向”，不要只摘录 ASR；改写方向要像能直接交给主播/场控执行的话。
- actionPlan 必须包含 ownerRole 和 due，due 使用“下一场开播前 / 本场复盘前 / 本周复盘前”这类运营节奏，不要写空泛期限。
- expectedImpact 只写改善方向和下一场观察指标；没有 baseline 或实验数据时不要编造 20%/30%/60% 这类具体百分比。
- operatorScorecard 必须且只输出 6 个维度，顺序固定为：话术、商品、福利、CTA、互动、画面。

业务输入：
{context_json}

只返回一个合法 JSON 对象，不要 Markdown，不要代码块，不要解释。字段使用 camelCase，必须包含：
{{
  "summary": "120 字以内中文摘要",
  "executiveReview": {{
    "verdict": "optimize",
    "oneSentenceConclusion": "一句话经营结论",
    "whyNow": "为什么此刻应该这么判断",
    "confidence": 0.0,
    "evidenceIds": ["metric:minute:all", "asr:1"]
  }},
  "primaryDecision": {{
    "decision": "optimize",
    "reason": "为什么",
    "evidenceIds": ["metric:minute:1", "segment:1"],
    "confidence": 0.0
  }},
  "momentReviews": [
    {{
      "timeAnchor": {{
        "displayTimeRange": "20:13:24-20:16:24｜第 14-16 分钟｜录屏 #2",
        "offsetRange": "00:13:24-00:16:24",
        "clockTimeRange": "20:13:24-20:16:24",
        "minuteRangeLabel": "第 14-16 分钟",
        "segmentLabel": "录屏 #2",
        "segmentIndex": 2,
        "displaySegmentIndex": 2,
        "sliceIndex": null
      }},
      "title": "关键经营片段标题",
      "whatHappened": "发生了什么",
      "operatorRead": "资深运营判断",
      "scriptQuote": "主播原话摘录；只能来自 ASR",
      "metricSignal": "分钟成交/峰值/空窗等指标信号",
      "visualSignal": "画面/商品/货架承接信号；不足则写证据不足",
      "recommendedAction": "这一片段对应的可执行优化动作",
      "evidenceIds": ["asr:1", "metric:minute:all"],
      "confidence": 0.0
    }}
  ],
  "timeline": [
    {{
      "timeRange": "00:00:00-00:03:00 或 minuteOffset 范围",
      "title": "片段标题",
      "observation": "观察",
      "businessMeaning": "经营含义",
      "evidenceIds": ["segment:1"],
      "confidence": 0.0
    }}
  ],
  "evidenceLedger": [
    {{
      "evidenceId": "segment:1",
      "type": "recording_segment/metric/asr/frame/comment/product_card/review",
      "source": "录屏分段或分钟指标来源",
      "timeRange": "可为空",
      "timeAnchor": {{
        "displayTimeRange": "20:13:24-20:16:24｜第 14-16 分钟｜录屏 #2",
        "offsetRange": "00:13:24-00:16:24",
        "clockTimeRange": "20:13:24-20:16:24",
        "minuteRangeLabel": "第 14-16 分钟",
        "segmentLabel": "录屏 #2",
        "segmentIndex": 2,
        "sliceIndex": null
      }},
      "content": "证据内容",
      "supports": "支撑什么结论",
      "confidence": 0.0
    }}
  ],
  "speechScript": [
    {{
      "timeRange": "20:13:24-20:16:24｜第 14-16 分钟｜录屏 #2",
      "segmentIndex": 1,
      "scriptText": "主播原话或 ASR 整理话术；只能来自 transcriptText / scriptText，不要编造",
      "transcriptText": "ASR 原始转写摘录",
      "speakerIntent": "这段话术在推动什么：讲痛点/讲功效/讲价格/催单/答疑/转场/其他",
      "sellingPoint": "对应卖点、价格、福利或商品承接；没有就写证据不足",
      "riskFlags": ["重复催单但缺少利益点", "价格表达不清"],
      "evidenceIds": ["asr:1"],
      "confidence": 0.0
    }}
  ],
  "scriptReview": [
    {{
      "timeAnchor": {{
        "displayTimeRange": "20:13:24-20:16:24｜第 14-16 分钟｜录屏 #2",
        "offsetRange": "00:13:24-00:16:24",
        "clockTimeRange": "20:13:24-20:16:24",
        "minuteRangeLabel": "第 14-16 分钟",
        "segmentLabel": "录屏 #2",
        "segmentIndex": 2,
        "sliceIndex": null
      }},
      "quote": "主播原话摘录；只能来自 ASR",
      "intent": "讲痛点/讲功效/讲价格/信任背书/催单/答疑/转场/其他",
      "operatorComment": "资深运营点评",
      "rewriteSuggestion": "可直接给主播使用的改写方向",
      "riskFlags": ["利益点不清晰"],
      "evidenceIds": ["asr:1"],
      "confidence": 0.0
    }}
  ],
  "conversionDiagnosis": {{
    "verdict": "optimize",
    "mainIssue": "一句话指出最影响成交的环节",
    "metricSignal": "成交分钟、总订单、峰值或长时间空窗如何支撑判断",
    "talkScriptSignal": "话术如何支撑或削弱转化：痛点、利益点、价格锚点、信任背书、CTA",
    "visualSignal": "画面/抽帧/商品卡承接证据；不足时明确缺口",
    "evidenceIds": ["metric:minute:all", "asr:1"],
    "confidence": 0.0
  }},
  "operatorScorecard": [
    {{
      "dimension": "话术",
      "score": 0,
      "status": "watch",
      "diagnosis": "该维度运营判断",
      "fix": "该维度优先改法",
      "evidenceIds": ["asr:1"]
    }}
  ],
  "actionPlan": [
    {{
      "priority": "high",
      "ownerRole": "主播",
      "due": "下一场开播前",
      "action": "可执行动作，不要写泛泛建议",
      "reason": "为什么现在做这件事",
      "expectedImpact": "预期改善成交、停留、点击或复核效率的方向",
      "evidenceIds": ["asr:1", "metric:minute:all"]
    }}
  ],
  "reviewTasks": [
    {{
      "taskId": "review:1",
      "priority": "high",
      "title": "复核事项",
      "reason": "为什么需要人工复核",
      "evidenceIds": ["segment:1"]
    }}
  ],
  "analysisSelfEval": {{
    "confidence": 0.0,
    "claimScope": "sampled_asr_plus_full_minute_metrics / asr_plus_minute_metrics / minute_metrics_only",
    "evidenceCoverage": {{
      "minuteMetricCount": 0,
      "recordingSegmentCount": 0,
      "selectedSegmentCount": 0,
      "asrTranscriptCount": 0,
      "frameInputCount": 0,
      "videoInputCount": 0,
      "availableVideoInputCount": 0,
      "commentsAvailable": false,
      "productCardAvailable": false,
      "ocrAvailable": false,
      "finalRequestMode": "video_frame_asr",
      "videoUsedInFinalRequest": false,
      "sampledAsr": true
    }},
    "missingEvidence": ["asr", "ocr", "comments"],
    "riskFlags": ["证据不足时说明"],
    "requiresHumanReview": true,
    "needsMultimodal": true,
    "notes": "自评说明"
  }},
  "metrics": {{
    "minuteMetricCount": 0,
    "recordingSegmentCount": 0,
    "peakMinuteOffset": null,
    "peakMinuteOrderCount": null
  }},
  "recording": {{
    "recordingId": "录屏集合 ID",
    "segmentCount": 0,
    "analyzedSegmentCount": 0
  }},
  "input": {{
    "promptVersion": "{prompt_version}",
    "evidenceSources": ["recording_segment", "metric"]
  }}
}}
"""


def live_recording_analysis_json_schema() -> Dict[str, Any]:
  string_value = {"type": "string", "maxLength": 600}
  long_text_value = {"type": "string", "maxLength": 2000}
  time_anchor = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "displayTimeRange",
      "offsetRange",
      "clockTimeRange",
      "minuteRangeLabel",
      "segmentLabel",
      "segmentIndex",
      "displaySegmentIndex",
      "sliceIndex",
    ],
    "properties": {
      "displayTimeRange": {"type": "string", "maxLength": 160},
      "offsetRange": {"type": "string", "maxLength": 80},
      "clockTimeRange": {"type": "string", "maxLength": 80},
      "minuteRangeLabel": {"type": "string", "maxLength": 80},
      "segmentLabel": {"type": "string", "maxLength": 80},
      "segmentIndex": {"type": ["integer", "null"]},
      "displaySegmentIndex": {"type": ["integer", "null"]},
      "sliceIndex": {"type": ["integer", "null"]},
    },
  }
  evidence_refs = {
    "type": "array",
    "items": {"type": "string", "maxLength": 100},
    "maxItems": 20,
  }
  risk_flags = {
    "type": "array",
    "items": {"type": "string", "maxLength": 200},
    "maxItems": 12,
  }
  evidence_coverage = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "minuteMetricCount",
      "recordingSegmentCount",
      "selectedSegmentCount",
      "asrTranscriptCount",
      "frameInputCount",
      "videoInputCount",
      "availableVideoInputCount",
      "commentsAvailable",
      "productCardAvailable",
      "ocrAvailable",
      "finalRequestMode",
      "videoUsedInFinalRequest",
      "sampledAsr",
    ],
    "properties": {
      "minuteMetricCount": {"type": "integer"},
      "recordingSegmentCount": {"type": "integer"},
      "selectedSegmentCount": {"type": "integer"},
      "asrTranscriptCount": {"type": "integer"},
      "frameInputCount": {"type": "integer"},
      "videoInputCount": {"type": "integer"},
      "availableVideoInputCount": {"type": "integer"},
      "commentsAvailable": {"type": "boolean"},
      "productCardAvailable": {"type": "boolean"},
      "ocrAvailable": {"type": "boolean"},
      "finalRequestMode": {"type": "string", "maxLength": 120},
      "videoUsedInFinalRequest": {"type": "boolean"},
      "sampledAsr": {"type": "boolean"},
    },
  }
  timeline_item = {
    "type": "object",
    "additionalProperties": False,
    "required": ["timeRange", "title", "observation", "businessMeaning", "evidenceIds", "confidence"],
    "properties": {
      "timeRange": {"type": "string", "maxLength": 80},
      "title": {"type": "string", "maxLength": 120},
      "observation": string_value,
      "businessMeaning": string_value,
      "evidenceIds": evidence_refs,
      "confidence": {"type": "number"},
    },
  }
  evidence_item = {
    "type": "object",
    "additionalProperties": False,
    "required": ["evidenceId", "type", "source", "timeRange", "timeAnchor", "content", "supports", "confidence"],
    "properties": {
      "evidenceId": {"type": "string", "maxLength": 100},
      "type": {"type": "string", "maxLength": 80},
      "source": {"type": "string", "maxLength": 160},
      "timeRange": {"type": "string", "maxLength": 80},
      "timeAnchor": time_anchor,
      "content": string_value,
      "supports": string_value,
      "confidence": {"type": "number"},
    },
  }
  speech_script_item = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "timeRange",
      "segmentIndex",
      "scriptText",
      "transcriptText",
      "speakerIntent",
      "sellingPoint",
      "riskFlags",
      "evidenceIds",
      "confidence",
    ],
    "properties": {
      "timeRange": {"type": "string", "maxLength": 80},
      "segmentIndex": {"type": ["integer", "null"]},
      "scriptText": long_text_value,
      "transcriptText": long_text_value,
      "speakerIntent": string_value,
      "sellingPoint": string_value,
      "riskFlags": risk_flags,
      "evidenceIds": evidence_refs,
      "confidence": {"type": "number"},
    },
  }
  action_plan_item = {
    "type": "object",
    "additionalProperties": False,
    "required": ["priority", "ownerRole", "due", "action", "reason", "expectedImpact", "evidenceIds"],
    "properties": {
      "priority": {"type": "string", "enum": ["high", "medium", "low"]},
      "ownerRole": {"type": "string", "maxLength": 80},
      "due": {"type": "string", "maxLength": 80},
      "action": string_value,
      "reason": string_value,
      "expectedImpact": string_value,
      "evidenceIds": evidence_refs,
    },
  }
  review_task_item = {
    "type": "object",
    "additionalProperties": False,
    "required": ["taskId", "priority", "title", "reason", "evidenceIds"],
    "properties": {
      "taskId": {"type": "string", "maxLength": 100},
      "priority": {"type": "string", "enum": ["high", "medium", "low"]},
      "title": {"type": "string", "maxLength": 160},
      "reason": string_value,
      "evidenceIds": evidence_refs,
    },
  }
  moment_review_item = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "timeAnchor",
      "title",
      "whatHappened",
      "operatorRead",
      "scriptQuote",
      "metricSignal",
      "visualSignal",
      "recommendedAction",
      "evidenceIds",
      "confidence",
    ],
    "properties": {
      "timeAnchor": time_anchor,
      "title": {"type": "string", "maxLength": 160},
      "whatHappened": string_value,
      "operatorRead": string_value,
      "scriptQuote": long_text_value,
      "metricSignal": string_value,
      "visualSignal": string_value,
      "recommendedAction": string_value,
      "evidenceIds": evidence_refs,
      "confidence": {"type": "number"},
    },
  }
  script_review_item = {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "timeAnchor",
      "quote",
      "intent",
      "operatorComment",
      "rewriteSuggestion",
      "riskFlags",
      "evidenceIds",
      "confidence",
    ],
    "properties": {
      "timeAnchor": time_anchor,
      "quote": long_text_value,
      "intent": string_value,
      "operatorComment": string_value,
      "rewriteSuggestion": string_value,
      "riskFlags": risk_flags,
      "evidenceIds": evidence_refs,
      "confidence": {"type": "number"},
    },
  }
  scorecard_item = {
    "type": "object",
    "additionalProperties": False,
    "required": ["dimension", "score", "status", "diagnosis", "fix", "evidenceIds"],
    "properties": {
      "dimension": {"type": "string", "enum": list(OPERATOR_SCORECARD_DIMENSIONS)},
      "score": {"type": "integer"},
      "status": {"type": "string", "enum": ["good", "watch", "weak", "insufficient"]},
      "diagnosis": string_value,
      "fix": string_value,
      "evidenceIds": evidence_refs,
    },
  }
  return {
    "type": "object",
    "additionalProperties": False,
    "required": [
      "summary",
      "executiveReview",
      "primaryDecision",
      "momentReviews",
      "timeline",
      "evidenceLedger",
      "speechScript",
      "scriptReview",
      "conversionDiagnosis",
      "operatorScorecard",
      "actionPlan",
      "reviewTasks",
      "analysisSelfEval",
      "metrics",
      "recording",
      "input",
    ],
    "properties": {
      "summary": string_value,
      "executiveReview": {
        "type": "object",
        "additionalProperties": False,
        "required": ["verdict", "oneSentenceConclusion", "whyNow", "confidence", "evidenceIds"],
        "properties": {
          "verdict": {"type": "string", "enum": ["scale", "observe", "optimize", "review", "insufficient"]},
          "oneSentenceConclusion": string_value,
          "whyNow": string_value,
          "confidence": {"type": "number"},
          "evidenceIds": evidence_refs,
        },
      },
      "primaryDecision": {
        "type": "object",
        "additionalProperties": False,
        "required": ["decision", "reason", "evidenceIds", "confidence"],
        "properties": {
          "decision": {"type": "string"},
          "reason": string_value,
          "evidenceIds": evidence_refs,
          "confidence": {"type": "number"},
        },
      },
      "timeline": {
        "type": "array",
        "items": timeline_item,
        "maxItems": 12,
      },
      "momentReviews": {
        "type": "array",
        "items": moment_review_item,
        "maxItems": 6,
      },
      "evidenceLedger": {
        "type": "array",
        "items": evidence_item,
        "maxItems": 80,
      },
      "speechScript": {
        "type": "array",
        "items": speech_script_item,
        "maxItems": 12,
      },
      "scriptReview": {
        "type": "array",
        "items": script_review_item,
        "maxItems": 6,
      },
      "conversionDiagnosis": {
        "type": "object",
        "additionalProperties": False,
        "required": [
          "verdict",
          "mainIssue",
          "metricSignal",
          "talkScriptSignal",
          "visualSignal",
          "evidenceIds",
          "confidence",
        ],
        "properties": {
          "verdict": {"type": "string", "maxLength": 80},
          "mainIssue": string_value,
          "metricSignal": string_value,
          "talkScriptSignal": string_value,
          "visualSignal": string_value,
          "evidenceIds": evidence_refs,
          "confidence": {"type": "number"},
        },
      },
      "operatorScorecard": {
        "type": "array",
        "items": scorecard_item,
        "minItems": len(OPERATOR_SCORECARD_DIMENSIONS),
        "maxItems": len(OPERATOR_SCORECARD_DIMENSIONS),
      },
      "actionPlan": {
        "type": "array",
        "items": action_plan_item,
        "maxItems": 5,
      },
      "reviewTasks": {
        "type": "array",
        "items": review_task_item,
        "maxItems": 20,
      },
      "analysisSelfEval": {
        "type": "object",
        "additionalProperties": False,
        "required": [
          "confidence",
          "claimScope",
          "evidenceCoverage",
          "missingEvidence",
          "riskFlags",
          "requiresHumanReview",
          "needsMultimodal",
          "notes",
        ],
        "properties": {
          "confidence": {"type": "number"},
          "claimScope": {"type": "string", "maxLength": 120},
          "evidenceCoverage": evidence_coverage,
          "missingEvidence": {"type": "array", "items": {"type": "string", "maxLength": 80}, "maxItems": 20},
          "riskFlags": {"type": "array", "items": {"type": "string", "maxLength": 200}, "maxItems": 20},
          "requiresHumanReview": {"type": "boolean"},
          "needsMultimodal": {"type": "boolean"},
          "notes": string_value,
        },
      },
      "metrics": {
        "type": "object",
        "additionalProperties": False,
        "required": ["minuteMetricCount", "recordingSegmentCount", "peakMinuteOffset", "peakMinuteOrderCount"],
        "properties": {
          "minuteMetricCount": {"type": "integer"},
          "recordingSegmentCount": {"type": "integer"},
          "peakMinuteOffset": {"type": ["integer", "null"]},
          "peakMinuteOrderCount": {"type": ["integer", "null"]},
        },
      },
      "recording": {
        "type": "object",
        "additionalProperties": False,
        "required": ["recordingId", "segmentCount", "analyzedSegmentCount"],
        "properties": {
          "recordingId": {"type": "string", "maxLength": 100},
          "segmentCount": {"type": "integer"},
          "analyzedSegmentCount": {"type": "integer"},
        },
      },
      "input": {
        "type": "object",
        "additionalProperties": False,
        "required": ["promptVersion", "evidenceSources"],
        "properties": {
          "promptVersion": {"type": "string", "maxLength": 40},
          "evidenceSources": {"type": "array", "items": {"type": "string", "maxLength": 80}, "maxItems": 20},
        },
      },
    },
  }


def _normalize_live_analysis_output(
  analysis: Dict[str, Any],
  *,
  context: Mapping[str, Any],
  output_text: str,
  provider: str,
  model: str,
  prompt_version: str,
  response_id: str,
  usage: Mapping[str, Any],
) -> Dict[str, Any]:
  if not isinstance(analysis.get("summary"), str) or not analysis["summary"].strip():
    raise ArkResponsesError("Ark 分析结果缺少 summary")

  if "primaryDecision" not in analysis and "primary_decision" in analysis:
    analysis["primaryDecision"] = analysis["primary_decision"]
  if "executiveReview" not in analysis and "executive_review" in analysis:
    analysis["executiveReview"] = analysis["executive_review"]
  if "momentReviews" not in analysis and "moment_reviews" in analysis:
    analysis["momentReviews"] = analysis["moment_reviews"]
  if "evidenceLedger" not in analysis and "evidence_ledger" in analysis:
    analysis["evidenceLedger"] = analysis["evidence_ledger"]
  if "speechScript" not in analysis and "speech_script" in analysis:
    analysis["speechScript"] = analysis["speech_script"]
  if "scriptReview" not in analysis and "script_review" in analysis:
    analysis["scriptReview"] = analysis["script_review"]
  if "conversionDiagnosis" not in analysis and "conversion_diagnosis" in analysis:
    analysis["conversionDiagnosis"] = analysis["conversion_diagnosis"]
  if "operatorScorecard" not in analysis and "operator_scorecard" in analysis:
    analysis["operatorScorecard"] = analysis["operator_scorecard"]
  if "actionPlan" not in analysis and "action_plan" in analysis:
    analysis["actionPlan"] = analysis["action_plan"]
  if "reviewTasks" not in analysis and "review_tasks" in analysis:
    analysis["reviewTasks"] = analysis["review_tasks"]
  if "analysisSelfEval" not in analysis and "analysis_self_eval" in analysis:
    analysis["analysisSelfEval"] = analysis["analysis_self_eval"]

  if not isinstance(analysis.get("evidenceLedger"), list):
    raise ArkResponsesError("Ark 分析结果缺少 evidenceLedger")
  analysis["evidenceLedger"] = _normalize_evidence_ledger_time_anchors(
    analysis["evidenceLedger"],
    context,
  )

  now = datetime.now(timezone.utc).isoformat()
  analysis["provider"] = provider
  analysis["model"] = model
  analysis["promptVersion"] = prompt_version
  analysis["generatedAt"] = now
  analysis["responseId"] = response_id
  analysis["usage"] = json_safe(dict(usage))
  analysis["outputText"] = output_text[:4000]
  analysis.setdefault("timeline", [])
  if not isinstance(analysis.get("executiveReview"), dict):
    analysis["executiveReview"] = _derive_executive_review(context, analysis)
  if not _has_analysis_items(analysis.get("momentReviews")):
    analysis["momentReviews"] = _derive_moment_reviews(context, analysis)
  else:
    analysis["momentReviews"] = _normalize_moment_review_items(analysis["momentReviews"], context)
  analysis["reviewTasks"] = _normalize_review_tasks(analysis.get("reviewTasks"), context, analysis)
  if not _has_analysis_items(analysis.get("speechScript")):
    analysis["speechScript"] = _derive_speech_script(context)
  if not _has_analysis_items(analysis.get("scriptReview")):
    analysis["scriptReview"] = _derive_script_review(context, analysis)
  analysis["scriptReview"] = _normalize_script_review_items(analysis.get("scriptReview"), context)
  if not isinstance(analysis.get("conversionDiagnosis"), dict):
    analysis["conversionDiagnosis"] = _derive_conversion_diagnosis(context, analysis)
  analysis["operatorScorecard"] = _complete_operator_scorecard(context, analysis)
  if not _has_analysis_items(analysis.get("actionPlan")):
    analysis["actionPlan"] = _derive_action_plan(context, analysis)
  else:
    analysis["actionPlan"] = _merge_action_plan_items(
      _normalize_action_plan_items(analysis["actionPlan"]),
      _derive_action_plan(context, analysis),
      min_items=3,
    )
  analysis["summary"] = _normalize_operator_review_summary(analysis.get("summary"), analysis)
  analysis.setdefault("metrics", _derive_metrics_summary(context))
  analysis.setdefault("recording", _derive_recording_summary(context))
  analysis.setdefault("input", {
    "promptVersion": prompt_version,
    "evidenceSources": ["recording_segment", "metric"],
  })
  if isinstance(analysis.get("input"), dict):
    derived_inputs = _context_derived_inputs(context)
    if derived_inputs.get("samplingPlan"):
      analysis["input"].setdefault("samplingPlan", json_safe(derived_inputs.get("samplingPlan")))
  _normalize_action_impacts(analysis)
  _apply_coverage_aware_language(analysis, context)
  analysis["analysisSelfEval"] = _normalize_analysis_self_eval(
    analysis.get("analysisSelfEval"),
    context,
    analysis,
  )
  _ensure_evidence_ledger_closure(analysis, context)
  _deduplicate_live_analysis_sections(analysis)
  _polish_operator_review_language(analysis)
  analysis["analysisQualityGate"] = _build_analysis_quality_gate(analysis, context)
  return json_safe(analysis)


def _has_analysis_items(value: Any) -> bool:
  if not isinstance(value, list):
    return False
  for item in value:
    if isinstance(item, dict):
      if any(str(raw_value or "").strip() for raw_value in item.values() if not isinstance(raw_value, (dict, list))):
        return True
    elif str(item or "").strip():
      return True
  return False


def _normalize_operator_review_summary(value: Any, analysis: Mapping[str, Any]) -> str:
  summary = str(value or "").strip()
  if summary and not _is_processing_coverage_text(summary):
    return summary[:600]
  diagnosis = analysis.get("conversionDiagnosis") if isinstance(analysis.get("conversionDiagnosis"), dict) else {}
  for candidate in (
    diagnosis.get("mainIssue"),
    diagnosis.get("talkScriptSignal"),
    diagnosis.get("metricSignal"),
  ):
    text = str(candidate or "").strip()
    if text and not _is_processing_coverage_text(text):
      return text[:600]
  executive = analysis.get("executiveReview") if isinstance(analysis.get("executiveReview"), dict) else {}
  conclusion = str(executive.get("oneSentenceConclusion") or executive.get("whyNow") or "").strip()
  if conclusion and not _is_processing_coverage_text(conclusion):
    return conclusion[:600]
  return "本场复盘优先判断话术、商品承接、福利表达、CTA、互动和画面是否共同推动成交；证据不足项已放入人工复核任务。"


def _is_processing_coverage_text(value: Any) -> bool:
  text = re.sub(r"\s+", "", str(value or ""))
  if not text:
    return False
  coverage_hits = sum(
    1
    for token in ("ASR成功", "ASR转写", "抽帧", "录屏段数", "分钟指标", "缺失证据", "segment", "slice")
    if token.lower() in text.lower()
  )
  business_hits = sum(
    1
    for token in ("成交", "转化", "话术", "商品", "福利", "CTA", "互动", "画面", "下单", "运营")
    if token in text
  )
  return coverage_hits >= 2 and business_hits <= 1


def _normalize_review_tasks(value: Any, context: Mapping[str, Any], analysis: Mapping[str, Any]) -> List[Dict[str, Any]]:
  normalized: List[Dict[str, Any]] = []
  if isinstance(value, list):
    for index, task in enumerate(value[:20], start=1):
      if not isinstance(task, dict):
        continue
      title = str(task.get("title") or task.get("task") or task.get("name") or f"复核任务 {index}").strip()
      reason = str(task.get("reason") or task.get("detail") or task.get("description") or "需要人工复核后再进入经营结论。").strip()
      if not title and not reason:
        continue
      _append_unique_review_task(normalized, {
        "taskId": str(task.get("taskId") or task.get("task_id") or f"review:{index}")[:100],
        "priority": _normalize_priority(task.get("priority")),
        "title": title[:160],
        "reason": reason[:600],
        "evidenceIds": _normalize_evidence_refs(task.get("evidenceIds") or task.get("evidence_ids"))[:20],
      })

  metrics = _derive_metrics_summary(context)
  derived_inputs = context.get("derivedInputs") if isinstance(context.get("derivedInputs"), dict) else {}
  metric_refs = ["metric:minute:all"] if metrics.get("minuteMetricCount") else []
  asr_refs = _successful_asr_evidence_refs(context, limit=2)
  frame_count = int(derived_inputs.get("frameCount") or 0) if isinstance(derived_inputs, dict) else 0
  video_count = int(derived_inputs.get("videoCount") or 0) if isinstance(derived_inputs, dict) else 0

  if not asr_refs:
    _append_unique_review_task(normalized, {
      "taskId": "review:asr",
      "priority": "high",
      "title": "补齐主播话术底稿",
      "reason": "当前没有可靠 ASR 原话，不能直接判断话术是否支撑转化；需先转写或人工复核关键录屏时间段。",
      "evidenceIds": metric_refs,
    })
  if not frame_count and not video_count:
    _append_unique_review_task(normalized, {
      "taskId": "review:visual",
      "priority": "medium",
      "title": "复核商品卡与画面承接",
      "reason": "当前缺少可用画面证据，商品展示、价格贴片、主播手持和口播同步性只能作为复核项，不能写成确定结论。",
      "evidenceIds": asr_refs or metric_refs,
    })
  if not metrics.get("minuteMetricCount"):
    _append_unique_review_task(normalized, {
      "taskId": "review:metric",
      "priority": "medium",
      "title": "补齐分钟成交指标",
      "reason": "没有分钟级成交响应时，无法判断某段话术或 CTA 后 1-3 分钟是否带来订单。",
      "evidenceIds": asr_refs,
    })

  if not normalized and _is_processing_coverage_text(analysis.get("summary")):
    _append_unique_review_task(normalized, {
      "taskId": "review:operator-read",
      "priority": "medium",
      "title": "把处理覆盖度改写为经营判断",
      "reason": "当前内容更像处理流水账，需要人工确认成交瓶颈、话术问题和下一场动作。",
      "evidenceIds": metric_refs or asr_refs,
    })
  return normalized[:20]


def _append_unique_review_task(tasks: List[Dict[str, Any]], task: Dict[str, Any]) -> None:
  key = _normalize_dedup_text(f"{task.get('title') or ''} {task.get('reason') or ''}")
  if not key:
    return
  existing_keys = {
    _normalize_dedup_text(f"{existing.get('title') or ''} {existing.get('reason') or ''}")
    for existing in tasks
  }
  if key not in existing_keys:
    tasks.append(task)


def _complete_operator_scorecard(context: Mapping[str, Any], analysis: Mapping[str, Any]) -> List[Dict[str, Any]]:
  defaults = _derive_operator_scorecard(context, analysis)
  source = analysis.get("operatorScorecard") if isinstance(analysis.get("operatorScorecard"), list) else []
  source_by_dimension: Dict[str, Dict[str, Any]] = {}
  for item in source:
    if not isinstance(item, dict):
      continue
    dimension = _canonical_scorecard_dimension(item.get("dimension"))
    if not dimension or dimension in source_by_dimension:
      continue
    source_by_dimension[dimension] = item

  completed: List[Dict[str, Any]] = []
  for default_item in defaults:
    dimension = str(default_item.get("dimension") or "")
    source_item = source_by_dimension.get(dimension)
    if not source_item:
      completed.append(default_item)
      continue
    completed.append({
      "dimension": dimension,
      "score": _bounded_score(source_item.get("score"), default=_bounded_score(default_item.get("score"), default=50)),
      "status": _normalize_scorecard_status(source_item.get("status"), default=str(default_item.get("status") or "watch")),
      "diagnosis": str(source_item.get("diagnosis") or source_item.get("comment") or default_item.get("diagnosis") or "")[:600],
      "fix": str(source_item.get("fix") or source_item.get("recommendation") or default_item.get("fix") or "")[:600],
      "evidenceIds": (
        _normalize_evidence_refs(source_item.get("evidenceIds") or source_item.get("evidence_ids"))
        or _normalize_evidence_refs(default_item.get("evidenceIds"))
      )[:20],
    })
  return completed


def _canonical_scorecard_dimension(value: Any) -> str:
  text = str(value or "").strip()
  if not text:
    return ""
  if "话术" in text or "脚本" in text or "口播" in text:
    return "话术"
  if "商品" in text or "货品" in text or "卖点" in text:
    return "商品"
  if "福利" in text or "价格" in text or "赠品" in text or "优惠" in text:
    return "福利"
  if "CTA" in text.upper() or "逼单" in text or "催单" in text or "下单" in text or "点击" in text:
    return "CTA"
  if "互动" in text or "答疑" in text or "弹幕" in text or "评论" in text:
    return "互动"
  if "画面" in text or "视觉" in text or "货架" in text or "商品卡" in text or "展示" in text:
    return "画面"
  return text if text in OPERATOR_SCORECARD_DIMENSIONS else ""


def _normalize_scorecard_status(value: Any, *, default: str) -> str:
  normalized = str(value or "").strip().lower()
  if normalized in {"good", "watch", "weak", "insufficient"}:
    return normalized
  return default if default in {"good", "watch", "weak", "insufficient"} else "watch"


def _bounded_score(value: Any, *, default: int) -> int:
  try:
    score = int(round(float(value)))
  except (TypeError, ValueError):
    return default
  return max(0, min(100, score))


def _normalize_action_plan_items(value: Any) -> List[Dict[str, Any]]:
  if not isinstance(value, list):
    return []
  normalized: List[Dict[str, Any]] = []
  for item in value:
    if not isinstance(item, dict):
      continue
    priority = _normalize_priority(item.get("priority"))
    owner_role = str(item.get("ownerRole") or item.get("owner_role") or item.get("owner") or "运营复盘")[:80]
    normalized.append({
      **item,
      "priority": priority,
      "ownerRole": owner_role,
      "due": str(item.get("due") or item.get("dueAt") or item.get("deadline") or _default_action_due(priority, owner_role))[:80],
      "evidenceIds": _normalize_evidence_refs(item.get("evidenceIds") or item.get("evidence_ids"))[:20],
    })
  return normalized[:5]


def _merge_action_plan_items(
  primary_items: List[Dict[str, Any]],
  fallback_items: List[Dict[str, Any]],
  *,
  min_items: int,
) -> List[Dict[str, Any]]:
  merged: List[Dict[str, Any]] = []
  for item in primary_items:
    if isinstance(item, dict):
      _append_unique_action(merged, item)
  for item in fallback_items:
    if len(merged) >= 5:
      break
    if len(merged) >= min_items:
      break
    if isinstance(item, dict):
      _append_unique_action(merged, item)
  return _normalize_action_plan_items(merged)


def _default_action_due(priority: Any, owner_role: Any = "") -> str:
  normalized_priority = _normalize_priority(priority)
  role_text = str(owner_role or "")
  if normalized_priority == "high" or any(token in role_text for token in ("主播", "场控")):
    return "下一场开播前"
  if "复盘" in role_text:
    return "本场复盘前"
  return "本周复盘前"


def _deduplicate_live_analysis_sections(analysis: Dict[str, Any]) -> None:
  analysis["momentReviews"] = _deduplicate_analysis_items(
    analysis.get("momentReviews"),
    key_fields=("title", "whatHappened", "operatorRead", "recommendedAction"),
  )
  analysis["scriptReview"] = _deduplicate_analysis_items(
    analysis.get("scriptReview"),
    key_fields=("quote", "intent", "operatorComment", "rewriteSuggestion"),
  )
  analysis["actionPlan"] = _deduplicate_analysis_items(
    analysis.get("actionPlan"),
    key_fields=("action", "reason", "expectedImpact"),
  )
  analysis["reviewTasks"] = _deduplicate_analysis_items(
    analysis.get("reviewTasks"),
    key_fields=("title", "reason", "detail", "description"),
  )
  analysis["evidenceLedger"] = _deduplicate_analysis_items(
    analysis.get("evidenceLedger"),
    key_fields=("evidenceId", "content", "supports"),
  )


def _normalize_action_impacts(analysis: Dict[str, Any]) -> None:
  action_plan = analysis.get("actionPlan")
  if not isinstance(action_plan, list):
    return
  for item in action_plan:
    if not isinstance(item, dict):
      continue
    item["expectedImpact"] = _normalize_expected_impact(item.get("expectedImpact"))


def _normalize_expected_impact(value: Any) -> str:
  text = str(value or "").strip()
  if not text:
    return "预期改善成交、停留或点击表现，具体幅度用下一场复盘数据验证。"
  if _contains_unsupported_percentage(text):
    return "预期改善成交、停留或点击表现，具体幅度用下一场复盘数据验证。"
  return text[:600]


def _contains_unsupported_percentage(value: str) -> bool:
  return bool(re.search(r"\d+(?:\.\d+)?\s*%|百分之\s*\d+", value))


def _apply_coverage_aware_language(analysis: Dict[str, Any], context: Mapping[str, Any]) -> None:
  coverage = _derive_evidence_coverage(context)
  if not coverage.get("sampledAsr"):
    return
  for key in MAIN_REVIEW_FIELDS:
    if key in analysis:
      analysis[key] = _coverage_aware_value(analysis[key], field_name=key)


def _coverage_aware_value(value: Any, *, field_name: str = "") -> Any:
  if field_name in PROTECTED_QUOTE_FIELDS:
    return value
  if isinstance(value, str):
    return _coverage_aware_text(value)
  if isinstance(value, list):
    return [_coverage_aware_value(item, field_name=field_name) for item in value]
  if isinstance(value, dict):
    return {key: _coverage_aware_value(child, field_name=key) for key, child in value.items()}
  return value


def _coverage_aware_text(value: str) -> str:
  text = value
  replacements = (
    ("全程高度重复", "采样口播片段显示话术高度重复"),
    ("全程重复", "采样口播片段显示重复"),
    ("全程仅", "采样口播片段仅"),
    ("全程没有", "采样口播片段未看到"),
    ("全程无", "采样口播片段未看到"),
  )
  for old, new in replacements:
    text = text.replace(old, new)
  text = re.sub(r"\d+(?:\.\d+)?\s*%以上内容重复", "多数采样口播内容重复", text)
  text = re.sub(r"\d+(?:\.\d+)?\s*%内容重复", "多数采样口播内容重复", text)
  return text


def _polish_operator_review_language(analysis: Dict[str, Any]) -> None:
  for key in (
    "summary",
    "primaryDecision",
    "executiveReview",
    "momentReviews",
    "scriptReview",
    "conversionDiagnosis",
    "operatorScorecard",
    "actionPlan",
    "reviewTasks",
  ):
    if key in analysis:
      analysis[key] = _polish_operator_review_value(analysis[key], field_name=key)


def _polish_operator_review_value(value: Any, *, field_name: str = "") -> Any:
  if field_name in PROTECTED_QUOTE_FIELDS:
    return value
  if isinstance(value, str):
    return _polish_operator_review_text(value)
  if isinstance(value, list):
    return [_polish_operator_review_value(item, field_name=field_name) for item in value]
  if isinstance(value, dict):
    return {key: _polish_operator_review_value(child, field_name=key) for key, child in value.items()}
  return value


def _polish_operator_review_text(value: str) -> str:
  text = value
  replacements = (
    ("分钟指标显示", "成交曲线显示"),
    ("分钟指标", "成交曲线"),
    ("ASR转写", "口播转写"),
    ("ASR 转写", "口播转写"),
    ("ASR", "口播"),
    ("录屏段数", "录屏材料"),
    ("抽帧", "画面证据"),
    ("处理链路", "证据链路"),
  )
  for old, new in replacements:
    text = text.replace(old, new)
  return text


def _deduplicate_analysis_items(value: Any, *, key_fields: tuple[str, ...]) -> List[Any]:
  if not isinstance(value, list):
    return []
  seen: set[str] = set()
  deduplicated: List[Any] = []
  for item in value:
    key = _analysis_item_dedup_key(item, key_fields=key_fields)
    if key and key in seen:
      continue
    if key:
      seen.add(key)
    deduplicated.append(item)
  return deduplicated


def _analysis_item_dedup_key(item: Any, *, key_fields: tuple[str, ...]) -> str:
  if not isinstance(item, dict):
    return _normalize_dedup_text(str(item or ""))
  parts = [
    _normalize_dedup_text(str(item.get(field) or ""))
    for field in key_fields
    if item.get(field) is not None
  ]
  compact_parts = [part for part in parts if part]
  if not compact_parts:
    return ""
  return "::".join(compact_parts)[:360]


def _normalize_dedup_text(value: str) -> str:
  return re.sub(r"[\s。；;,.，、:：]+", "", value).lower()


def _complete_analysis_job(
  conn: psycopg2.extensions.connection,
  analysis_id: Any,
  *,
  analysis_json: Mapping[str, Any],
  input_snapshot: Mapping[str, Any],
  provider: str,
  model: str,
  response_id: str,
  usage: Mapping[str, Any],
  prompt_version: str,
  analysis_profile: str,
) -> None:
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE ads.douyin_live_session_analysis
      SET
        status = 'succeeded',
        model = %s,
        analysis_profile = %s,
        provider = %s,
        prompt_version = %s,
        input_snapshot = %s::jsonb,
        progress_percent = 100,
        processing_stage = 'completed',
        response_id = NULLIF(%s, ''),
        usage_json = %s::jsonb,
        analysis_json = %s::jsonb,
        error_message = NULL,
        completed_at = CURRENT_TIMESTAMP
      WHERE analysis_id = %s
      """,
      (
        model,
        analysis_profile,
        provider,
        prompt_version,
        json.dumps(json_safe(input_snapshot), ensure_ascii=False),
        response_id,
        json.dumps(json_safe(dict(usage)), ensure_ascii=False),
        json.dumps(json_safe(dict(analysis_json)), ensure_ascii=False),
        str(analysis_id),
      ),
    )
  conn.commit()


def _fail_analysis_job(
  conn: psycopg2.extensions.connection,
  analysis_id: Any,
  error_message: str,
  *,
  provider: str,
  model: str,
) -> None:
  bounded_error = (error_message or "unknown error")[:1200]
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE ads.douyin_live_session_analysis
      SET
        status = 'failed',
        provider = COALESCE(provider, %s),
        model = COALESCE(model, %s),
        processing_stage = 'failed',
        error_message = %s,
        completed_at = CURRENT_TIMESTAMP
      WHERE analysis_id = %s
      """,
      (provider, model, bounded_error, str(analysis_id)),
    )
  conn.commit()


def _update_analysis_job_stage(
  conn: psycopg2.extensions.connection,
  analysis_id: Any,
  stage: str,
  progress_percent: int,
  *,
  input_snapshot: Optional[Mapping[str, Any]] = None,
) -> None:
  progress_percent = max(0, min(100, int(progress_percent)))
  if input_snapshot is None:
    with conn.cursor() as cur:
      cur.execute(
        """
        UPDATE ads.douyin_live_session_analysis
        SET
          processing_stage = %s,
          progress_percent = %s
        WHERE analysis_id = %s
        """,
        (stage, progress_percent, str(analysis_id)),
      )
  else:
    with conn.cursor() as cur:
      cur.execute(
        """
        UPDATE ads.douyin_live_session_analysis
        SET
          processing_stage = %s,
          progress_percent = %s,
          input_snapshot = %s::jsonb
        WHERE analysis_id = %s
        """,
        (
          stage,
          progress_percent,
          json.dumps(json_safe(dict(input_snapshot)), ensure_ascii=False),
          str(analysis_id),
        ),
      )
  conn.commit()


def _build_input_snapshot(
  context: Mapping[str, Any],
  *,
  analysis_profile: str,
  prompt_version: str,
  model: str,
  signed_url_ttl_seconds: int,
  selected_segment_count: int,
  derived_inputs: Mapping[str, Any],
  max_video_bytes: int,
) -> Dict[str, Any]:
  recording = context.get("recording") or {}
  segments = recording.get("segments") if isinstance(recording, dict) else []
  minute_metrics = context.get("minuteMetrics") or []
  derived_snapshot = _redacted_derived_input_snapshot(derived_inputs)
  context_derived_inputs = context.get("derivedInputs") if isinstance(context.get("derivedInputs"), dict) else {}
  main_request = context_derived_inputs.get("mainAnalysisRequest") if isinstance(context_derived_inputs, dict) else {}
  derived_snapshot["mainAnalysisRequest"] = json_safe(dict(main_request or {}))
  return {
    "analysisProfile": analysis_profile,
    "promptVersion": prompt_version,
    "model": model,
    "signedUrlTtlSeconds": signed_url_ttl_seconds,
    "sessionId": (context.get("session") or {}).get("sessionId"),
    "session": _session_prompt_snapshot(context.get("session") if isinstance(context.get("session"), dict) else {}),
    "recordingId": recording.get("recordingId") if isinstance(recording, dict) else None,
    "recording": _recording_prompt_snapshot(recording) if isinstance(recording, dict) else {},
    "segmentCount": len(segments) if isinstance(segments, list) else 0,
    "selectedSegmentCount": selected_segment_count,
    "videoInputCount": len(derived_snapshot["videos"]),
    "frameInputCount": len(derived_snapshot["frames"]),
    "asrTranscriptCount": len([
      item for item in derived_snapshot["asrTranscripts"]
      if isinstance(item, dict) and item.get("status") == "succeeded"
    ]),
    "skippedVideoSegmentCount": len(derived_snapshot["skipped"]),
    "derivedInputs": derived_snapshot,
    "maxVideoBytes": max_video_bytes,
    "minuteMetricCount": len(minute_metrics) if isinstance(minute_metrics, list) else 0,
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "signedUrlsPersisted": False,
  }


def _session_prompt_snapshot(session: Mapping[str, Any]) -> Dict[str, Any]:
  return {
    "sessionId": session.get("sessionId"),
    "shopId": session.get("shopId"),
    "shopName": session.get("shopName"),
    "anchorDouyinId": session.get("anchorDouyinId"),
    "anchorNickname": session.get("anchorNickname"),
    "liveStartTime": session.get("liveStartTime"),
    "liveEndTime": session.get("liveEndTime"),
  }


def _redacted_derived_input_snapshot(derived_inputs: Mapping[str, Any]) -> Dict[str, Any]:
  return {
    "videos": _redact_model_inputs(derived_inputs.get("videos")),
    "frames": _redact_model_inputs(derived_inputs.get("frames")),
    "asrTranscripts": json_safe(derived_inputs.get("asrTranscripts") or []),
    "skipped": json_safe(derived_inputs.get("skipped") or []),
    "samplingPlan": json_safe(derived_inputs.get("samplingPlan") or {}),
  }


def _recording_prompt_snapshot(recording: Mapping[str, Any]) -> Dict[str, Any]:
  segments = recording.get("segments") if isinstance(recording, dict) else []
  return {
    "recordingId": recording.get("recordingId"),
    "sessionId": recording.get("sessionId"),
    "status": recording.get("status"),
    "segmentCount": len(segments) if isinstance(segments, list) else 0,
    "videoInput": recording.get("videoInput") if isinstance(recording.get("videoInput"), dict) else {},
    "segments": [
      {
        "segmentId": segment.get("segmentId"),
        "segmentIndex": segment.get("segmentIndex"),
        "displaySegmentIndex": segment.get("displaySegmentIndex"),
        "fileName": segment.get("fileName"),
        "mimeType": segment.get("mimeType"),
        "fileSizeBytes": segment.get("fileSizeBytes"),
        "durationSeconds": segment.get("durationSeconds"),
        "startOffsetSeconds": segment.get("startOffsetSeconds"),
        "endOffsetSeconds": segment.get("endOffsetSeconds"),
        "uploadStatus": segment.get("uploadStatus"),
        "processingStatus": segment.get("processingStatus"),
        "timeAnchor": segment.get("timeAnchor"),
        "displayTimeRange": segment.get("displayTimeRange"),
      }
      for segment in segments[:20]
      if isinstance(segment, dict)
    ],
  }


def _derive_metrics_summary(context: Mapping[str, Any]) -> Dict[str, Any]:
  minute_metrics = context.get("minuteMetrics") or []
  recording = context.get("recording") or {}
  segments = recording.get("segments") if isinstance(recording, dict) else []
  peak = None
  if isinstance(minute_metrics, list) and minute_metrics:
    peak = max(minute_metrics, key=lambda row: int(row.get("orderCount") or 0))
  return {
    "minuteMetricCount": len(minute_metrics) if isinstance(minute_metrics, list) else 0,
    "recordingSegmentCount": len(segments) if isinstance(segments, list) else 0,
    "peakMinuteOffset": peak.get("minuteOffset") if isinstance(peak, dict) else None,
    "peakMinuteOrderCount": peak.get("orderCount") if isinstance(peak, dict) else None,
  }


def _derive_recording_summary(context: Mapping[str, Any]) -> Dict[str, Any]:
  recording = context.get("recording") or {}
  segments = recording.get("segments") if isinstance(recording, dict) else []
  video_input = recording.get("videoInput") if isinstance(recording, dict) else {}
  selected_segment_indexes = (
    video_input.get("selectedSegmentIndexes")
    if isinstance(video_input, dict) and isinstance(video_input.get("selectedSegmentIndexes"), list)
    else []
  )
  return {
    "recordingId": recording.get("recordingId") if isinstance(recording, dict) else None,
    "segmentCount": len(segments) if isinstance(segments, list) else 0,
    "analyzedSegmentCount": len(selected_segment_indexes) or min(
      len(segments) if isinstance(segments, list) else 0,
      env_int("DOUYIN_LIVE_ANALYSIS_MAX_SEGMENTS", 6),
    ),
  }


def _context_derived_inputs(context: Mapping[str, Any]) -> Dict[str, Any]:
  derived_inputs = context.get("derivedInputs") if isinstance(context.get("derivedInputs"), dict) else {}
  return dict(derived_inputs) if isinstance(derived_inputs, dict) else {}


def _derive_evidence_coverage(
  context: Mapping[str, Any],
  *,
  derived_inputs: Optional[Mapping[str, Any]] = None,
  main_request: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
  inputs = dict(derived_inputs or _context_derived_inputs(context))
  request = dict(main_request or inputs.get("mainAnalysisRequest") or {})
  metrics = _derive_metrics_summary(context)
  asr_count = len([
    item for item in inputs.get("asrTranscripts") or []
    if isinstance(item, dict) and item.get("status") == "succeeded"
  ])
  frame_count = len([item for item in inputs.get("frames") or [] if isinstance(item, dict)])
  video_count = len([item for item in inputs.get("videos") or [] if isinstance(item, dict)])
  available_video_count = int(request.get("availableVideoInputCount") or video_count or 0)
  included_video_count = int(request.get("videoInputCount") or (video_count if request.get("includeVideoInputs") else 0) or 0)
  minute_count = int(metrics.get("minuteMetricCount") or 0)
  segment_count = int(metrics.get("recordingSegmentCount") or 0)
  selected_segment_indexes = request.get("selectedSegmentIndexes") or inputs.get("selectedSegmentIndexes") or []
  if not isinstance(selected_segment_indexes, list):
    selected_segment_indexes = []
  sampled_asr = bool(asr_count and minute_count and asr_count < max(1, minute_count // 4))
  return {
    "minuteMetricCount": minute_count,
    "recordingSegmentCount": segment_count,
    "selectedSegmentCount": len(selected_segment_indexes) or segment_count,
    "asrTranscriptCount": asr_count,
    "frameInputCount": frame_count,
    "videoInputCount": included_video_count,
    "availableVideoInputCount": available_video_count,
    "commentsAvailable": False,
    "productCardAvailable": False,
    "ocrAvailable": False,
    "finalRequestMode": str(request.get("requestMode") or ""),
    "videoUsedInFinalRequest": bool(request.get("includeVideoInputs")) and included_video_count > 0,
    "sampledAsr": sampled_asr,
  }


def _derive_claim_scope(coverage: Mapping[str, Any]) -> str:
  if coverage.get("sampledAsr"):
    return "sampled_asr_plus_full_minute_metrics"
  if int(coverage.get("asrTranscriptCount") or 0) > 0:
    return "asr_plus_minute_metrics"
  return "minute_metrics_only"


def _derive_missing_evidence(coverage: Mapping[str, Any]) -> List[str]:
  missing: List[str] = []
  if int(coverage.get("asrTranscriptCount") or 0) <= 0:
    missing.append("asr")
  elif coverage.get("sampledAsr"):
    missing.append("full_asr")
  if int(coverage.get("frameInputCount") or 0) <= 0 and int(coverage.get("videoInputCount") or 0) <= 0:
    missing.append("visual")
  if not coverage.get("commentsAvailable"):
    missing.append("comments")
  if not coverage.get("productCardAvailable"):
    missing.append("product_card")
  if not coverage.get("ocrAvailable"):
    missing.append("ocr")
  return missing


def _derive_self_eval_risk_flags(coverage: Mapping[str, Any]) -> List[str]:
  flags: List[str] = []
  if coverage.get("sampledAsr"):
    flags.append("ASR 仅覆盖采样片段，不能把口播判断写成全场绝对结论。")
  if int(coverage.get("frameInputCount") or 0) <= 0 and int(coverage.get("videoInputCount") or 0) <= 0:
    flags.append("缺少可用画面证据，商品卡、贴片和主播展示只能进入人工复核。")
  elif not coverage.get("videoUsedInFinalRequest") and int(coverage.get("availableVideoInputCount") or 0) > 0:
    flags.append("最终主分析未使用视频输入，画面结论需要 L2 或人工复核确认。")
  if not coverage.get("productCardAvailable") or not coverage.get("ocrAvailable"):
    flags.append("商品卡、OCR 或价格承接证据未接入，价格/货架结论需限制口径。")
  return flags


def _normalize_analysis_self_eval(
  value: Any,
  context: Mapping[str, Any],
  analysis: Mapping[str, Any],
) -> Dict[str, Any]:
  source = value if isinstance(value, dict) else {}
  coverage = _derive_evidence_coverage(context)
  missing = _dedupe_preserve_order(
    _normalize_string_list(source.get("missingEvidence") or source.get("missing_evidence"))
    + _derive_missing_evidence(coverage)
  )
  risk_flags = _dedupe_preserve_order(
    _normalize_string_list(source.get("riskFlags") or source.get("risk_flags"))
    + _derive_self_eval_risk_flags(coverage)
  )
  review_tasks = analysis.get("reviewTasks") if isinstance(analysis.get("reviewTasks"), list) else []
  needs_multimodal = bool(
    source.get("needsMultimodal")
    or source.get("needs_multimodal")
    or (
      int(coverage.get("availableVideoInputCount") or 0) > 0
      and not coverage.get("videoUsedInFinalRequest")
    )
    or "visual" in missing
    or "ocr" in missing
    or "product_card" in missing
  )
  requires_human_review = bool(
    source.get("requiresHumanReview")
    or source.get("requires_human_review")
    or review_tasks
    or risk_flags
  )
  confidence = _bounded_confidence(source.get("confidence"), default=0.55)
  if risk_flags:
    confidence = min(confidence, 0.78)
  notes = str(source.get("notes") or "").strip()
  if not notes:
    notes = "本次可作为 L1 经营复盘；缺失或低覆盖证据必须通过 L2 多模态或人工复核补齐。"
  return {
    **source,
    "confidence": confidence,
    "claimScope": _derive_claim_scope(coverage),
    "evidenceCoverage": coverage,
    "missingEvidence": missing[:20],
    "riskFlags": risk_flags[:20],
    "requiresHumanReview": requires_human_review,
    "needsMultimodal": needs_multimodal,
    "notes": notes[:600],
  }


def _normalize_string_list(value: Any) -> List[str]:
  if isinstance(value, list):
    return [str(item).strip() for item in value if str(item or "").strip()]
  if isinstance(value, str) and value.strip():
    return [value.strip()]
  return []


def _dedupe_preserve_order(values: List[str]) -> List[str]:
  seen: set[str] = set()
  result: List[str] = []
  for value in values:
    key = value.lower()
    if key in seen:
      continue
    seen.add(key)
    result.append(value)
  return result


def _normalize_evidence_ledger_time_anchors(
  evidence_items: Any,
  context: Mapping[str, Any],
) -> List[Dict[str, Any]]:
  if not isinstance(evidence_items, list):
    return []
  default_anchor = _default_time_anchor(context)
  normalized: List[Dict[str, Any]] = []
  for index, item in enumerate(evidence_items, start=1):
    if not isinstance(item, dict):
      normalized.append({
        "evidenceId": f"evidence:{index}",
        "type": "review",
        "source": "模型证据",
        "timeRange": default_anchor.get("displayTimeRange") or "",
        "timeAnchor": default_anchor,
        "content": str(item or "")[:600],
        "supports": "模型返回的非结构化证据。",
        "confidence": 0.3,
      })
      continue
    updated = dict(item)
    anchor = updated.get("timeAnchor") if isinstance(updated.get("timeAnchor"), dict) else None
    if anchor is None:
      anchor = _time_anchor_from_any(updated, context)
    else:
      anchor = _normalize_time_anchor(_merge_time_anchor_parent_fields(anchor, updated), context)
    updated["timeAnchor"] = anchor
    if not str(updated.get("timeRange") or "").strip() or _is_unlocatable_time_anchor_text(updated.get("timeRange")):
      updated["timeRange"] = anchor.get("displayTimeRange") or anchor.get("offsetRange") or ""
    updated.setdefault("evidenceId", f"evidence:{index}")
    updated.setdefault("type", "review")
    updated.setdefault("source", "模型证据")
    updated.setdefault("content", "")
    updated.setdefault("supports", "")
    updated.setdefault("confidence", 0.3)
    normalized.append(updated)
  return normalized


def _ensure_evidence_ledger_closure(analysis: Dict[str, Any], context: Mapping[str, Any]) -> None:
  ledger = analysis.get("evidenceLedger") if isinstance(analysis.get("evidenceLedger"), list) else []
  ledger_by_id: Dict[str, Dict[str, Any]] = {
    str(item.get("evidenceId")): item
    for item in ledger
    if isinstance(item, dict) and str(item.get("evidenceId") or "").strip()
  }

  def add_evidence(evidence: Dict[str, Any]) -> None:
    evidence_id = str(evidence.get("evidenceId") or "").strip()
    if not evidence_id or evidence_id in ledger_by_id:
      return
    ledger_by_id[evidence_id] = evidence
    ledger.append(evidence)

  metrics = _derive_metrics_summary(context)
  if metrics.get("minuteMetricCount"):
    add_evidence(_metric_summary_evidence(context))

  for index, transcript in enumerate(_successful_asr_transcripts(context), start=1):
    add_evidence(_asr_summary_evidence(context, transcript, index))

  derived_inputs = _context_derived_inputs(context)
  frames = [item for item in derived_inputs.get("frames") or [] if isinstance(item, dict)]
  if frames:
    add_evidence(_frame_summary_evidence(context, frames))
    for index, frame in enumerate(frames, start=1):
      add_evidence(_single_frame_evidence(context, frame, index))

  for segment in _context_segments(context):
    add_evidence(_segment_summary_evidence(context, segment))

  for evidence_id in _collect_referenced_evidence_ids(analysis):
    if evidence_id not in ledger_by_id:
      add_evidence(_placeholder_review_evidence(context, evidence_id))

  analysis["evidenceLedger"] = ledger


def _build_analysis_quality_gate(analysis: Mapping[str, Any], context: Mapping[str, Any]) -> Dict[str, Any]:
  health = _analysis_quality_evidence_health(analysis, context)
  blocking_issues: List[Dict[str, Any]] = []
  warnings: List[Dict[str, Any]] = []

  def block(code: str, title: str, detail: str, section: str) -> None:
    blocking_issues.append(_analysis_quality_issue(code, title, detail, section, severity="blocking"))

  def warn(code: str, title: str, detail: str, section: str) -> None:
    warnings.append(_analysis_quality_issue(code, title, detail, section, severity="warning"))

  if int(health.get("ledgerEvidenceCount") or 0) <= 0:
    block(
      "missing_evidence_ledger",
      "缺少可复核证据台账",
      "当前结果没有形成证据台账，运营无法追溯主要结论的依据。",
      "evidenceLedger",
    )
  elif int(health.get("unresolvedEvidenceCount") or 0) > 0:
    block(
      "unresolved_evidence_refs",
      "存在待补证据引用",
      "部分结论引用了占位或未展开证据，定稿前需要补齐原始依据。",
      "evidenceLedger",
    )

  if not isinstance(analysis.get("executiveReview"), dict):
    block(
      "missing_executive_review",
      "缺少首屏经营判断",
      "结果没有形成可直接复盘的一句话判断和判断依据。",
      "executiveReview",
    )

  if int(health.get("scorecardDimensionCount") or 0) < len(OPERATOR_SCORECARD_DIMENSIONS):
    block(
      "incomplete_operator_scorecard",
      "六维运营评分不完整",
      "话术、商品、福利、CTA、互动、画面六个维度必须完整，才能进入最终复盘。",
      "operatorScorecard",
    )

  if int(health.get("actionItemCount") or 0) <= 0:
    block(
      "missing_action_plan",
      "缺少下一场动作",
      "结果没有给出主播、场控、运营或复盘负责人可执行的行动项。",
      "actionPlan",
    )
  elif int(health.get("actionItemCount") or 0) < 3:
    warn(
      "thin_action_plan",
      "行动项数量偏少",
      "建议保留 3-5 条互不重复动作，覆盖话术、承接、CTA 或复核流程。",
      "actionPlan",
    )

  incomplete_actions = _analysis_quality_incomplete_action_count(analysis.get("actionPlan"))
  if incomplete_actions > 0:
    warn(
      "incomplete_action_plan_fields",
      "行动项字段不完整",
      f"{incomplete_actions} 条行动项缺少负责人、期限、原因、预期影响或证据引用。",
      "actionPlan",
    )

  if int(health.get("metricEvidenceCount") or 0) <= 0:
    warn(
      "missing_metric_evidence",
      "缺少成交曲线证据",
      "没有分钟成交指标支撑时，话术与成交响应之间的判断只能作为复核线索。",
      "evidenceLedger",
    )

  if int(health.get("asrEvidenceCount") or 0) <= 0:
    warn(
      "missing_asr_evidence",
      "缺少口播底稿证据",
      "没有 ASR 或人工话术底稿时，话术点评不能直接作为最终结论。",
      "scriptReview",
    )

  if int(health.get("visualEvidenceCount") or 0) <= 0:
    warn(
      "missing_visual_evidence",
      "缺少画面证据",
      "商品卡、贴片、主播展示和画面承接仍需人工或多模态复核。",
      "evidenceLedger",
    )

  moment_count = len(analysis.get("momentReviews") or []) if isinstance(analysis.get("momentReviews"), list) else 0
  if moment_count > 0 and int(health.get("momentWithTimeAnchorCount") or 0) < moment_count:
    warn(
      "missing_time_anchors",
      "部分关键片段无法定位",
      "时间复盘中的部分片段缺少直播时间或录屏位置，影响运营回看效率。",
      "momentReviews",
    )

  script_review_count = len(analysis.get("scriptReview") or []) if isinstance(analysis.get("scriptReview"), list) else 0
  if script_review_count > 0 and int(health.get("scriptReviewWithQuoteCount") or 0) < script_review_count:
    warn(
      "missing_script_quotes",
      "部分话术点评缺少原话",
      "话术复盘应保留主播原话，并用 ASR 证据支撑点评和改写方向。",
      "scriptReview",
    )

  if _analysis_quality_has_unsupported_action_percentage(analysis.get("actionPlan")):
    warn(
      "unsupported_expected_impact",
      "预期影响含未验证百分比",
      "未通过对照或历史基线验证前，不应把具体百分比作为行动项预期收益。",
      "actionPlan",
    )

  self_eval = analysis.get("analysisSelfEval") if isinstance(analysis.get("analysisSelfEval"), dict) else {}
  coverage = self_eval.get("evidenceCoverage") if isinstance(self_eval.get("evidenceCoverage"), dict) else _derive_evidence_coverage(context)
  if coverage.get("sampledAsr"):
    warn(
      "sampled_asr_scope",
      "口播只覆盖采样片段",
      "话术判断只能代表采样窗口，不能写成全场绝对结论。",
      "analysisSelfEval",
    )
  if self_eval.get("requiresHumanReview"):
    warn(
      "human_review_required",
      "模型自评要求人工复核",
      "模型已经标记需要运营人工复核，建议先处理复核事项再定稿。",
      "analysisSelfEval",
    )
  if self_eval.get("needsMultimodal") and int(health.get("visualEvidenceCount") or 0) <= 0:
    warn(
      "multimodal_review_required",
      "画面/商品承接需要复核",
      "当前证据不足以完全确认画面、商品卡、价格贴片或展示动作。",
      "analysisSelfEval",
    )

  review_task_count = len(analysis.get("reviewTasks") or []) if isinstance(analysis.get("reviewTasks"), list) else 0
  if review_task_count > 0:
    warn(
      "open_review_tasks",
      "仍有待复核事项",
      f"结果中还有 {review_task_count} 个复核任务，建议运营处理后再沉淀最终复盘。",
      "reviewTasks",
    )

  blocking_issues = _deduplicate_analysis_quality_issues(blocking_issues)[:8]
  warnings = _deduplicate_analysis_quality_issues(warnings)[:10]
  score = _analysis_quality_score(blocking_issues, warnings, health)
  grade = _analysis_quality_grade(score, blocking_issues, warnings, self_eval)
  safe_to_use = grade == "ready"

  return {
    "score": score,
    "grade": grade,
    "status": grade,
    "safeToUseAsFinalReview": safe_to_use,
    "summary": _analysis_quality_summary(grade, score, blocking_issues, warnings),
    "blockingIssues": blocking_issues,
    "warnings": warnings,
    "evidenceHealth": health,
    "checkedAt": datetime.now(timezone.utc).isoformat(),
  }


def _analysis_quality_issue(
  code: str,
  title: str,
  detail: str,
  section: str,
  *,
  severity: str,
) -> Dict[str, Any]:
  return {
    "code": code,
    "title": title,
    "detail": detail[:600],
    "section": section,
    "severity": severity,
  }


def _analysis_quality_evidence_health(analysis: Mapping[str, Any], context: Mapping[str, Any]) -> Dict[str, int]:
  ledger = analysis.get("evidenceLedger") if isinstance(analysis.get("evidenceLedger"), list) else []
  ledger_items = [item for item in ledger if isinstance(item, dict)]
  ledger_ids = {
    str(item.get("evidenceId") or "").strip()
    for item in ledger_items
    if str(item.get("evidenceId") or "").strip()
  }
  referenced_ids = set(_collect_referenced_evidence_ids(analysis))
  unresolved_ids = {evidence_id for evidence_id in referenced_ids if evidence_id not in ledger_ids}
  placeholder_ids = {
    str(item.get("evidenceId") or "").strip()
    for item in ledger_items
    if _is_placeholder_review_evidence(item)
  }

  moment_reviews = analysis.get("momentReviews") if isinstance(analysis.get("momentReviews"), list) else []
  script_reviews = analysis.get("scriptReview") if isinstance(analysis.get("scriptReview"), list) else []
  scorecard = analysis.get("operatorScorecard") if isinstance(analysis.get("operatorScorecard"), list) else []
  action_plan = analysis.get("actionPlan") if isinstance(analysis.get("actionPlan"), list) else []

  scorecard_dimensions = {
    _canonical_scorecard_dimension(item.get("dimension"))
    for item in scorecard
    if isinstance(item, dict)
  }
  scorecard_dimensions.discard("")

  return {
    "referencedEvidenceCount": len(referenced_ids),
    "ledgerEvidenceCount": len(ledger_items),
    "unresolvedEvidenceCount": len(unresolved_ids | placeholder_ids),
    "asrEvidenceCount": sum(1 for item in ledger_items if _analysis_quality_evidence_type(item, "asr")),
    "metricEvidenceCount": sum(1 for item in ledger_items if _analysis_quality_evidence_type(item, "metric")),
    "visualEvidenceCount": sum(1 for item in ledger_items if _analysis_quality_evidence_type(item, "visual")),
    "reviewEvidenceCount": sum(1 for item in ledger_items if _analysis_quality_evidence_type(item, "review")),
    "momentWithTimeAnchorCount": sum(1 for item in moment_reviews if isinstance(item, dict) and _analysis_quality_has_time_anchor(item)),
    "scriptReviewWithQuoteCount": sum(1 for item in script_reviews if isinstance(item, dict) and _analysis_quality_script_review_has_quote(item)),
    "scorecardDimensionCount": len(scorecard_dimensions),
    "actionItemCount": len([item for item in action_plan if isinstance(item, dict)]),
  }


def _is_placeholder_review_evidence(item: Mapping[str, Any]) -> bool:
  source = str(item.get("source") or "")
  content = str(item.get("content") or "")
  confidence = _bounded_confidence(item.get("confidence"), default=1.0)
  return (
    "证据闭合占位" in source
    or "原始证据未在返回结果中展开" in content
    or (
      str(item.get("type") or "").lower() == "review"
      and confidence <= 0.25
      and "占位" in source + content
    )
  )


def _analysis_quality_evidence_type(item: Mapping[str, Any], expected: str) -> bool:
  evidence_id = str(item.get("evidenceId") or "").lower()
  evidence_type = str(item.get("type") or "").lower()
  source = str(item.get("source") or "").lower()
  haystack = f"{evidence_id} {evidence_type} {source}"
  if expected == "asr":
    return any(token in haystack for token in ("asr", "speech", "transcript", "口播", "转写"))
  if expected == "metric":
    return any(token in haystack for token in ("metric", "minute", "成交", "分钟"))
  if expected == "visual":
    return any(token in haystack for token in ("frame", "visual", "video", "画面", "抽帧", "视频"))
  if expected == "review":
    return evidence_type == "review" or "review" in evidence_id or "复核" in str(item.get("supports") or "")
  return False


def _analysis_quality_has_time_anchor(item: Mapping[str, Any]) -> bool:
  anchor = item.get("timeAnchor") if isinstance(item.get("timeAnchor"), dict) else {}
  if isinstance(anchor, dict):
    for key in ("displayTimeRange", "clockTimeRange", "offsetRange", "minuteRangeLabel", "segmentLabel"):
      if str(anchor.get(key) or "").strip():
        return True
  return bool(str(item.get("timeRange") or "").strip())


def _analysis_quality_script_review_has_quote(item: Mapping[str, Any]) -> bool:
  quote = str(item.get("quote") or item.get("scriptQuote") or "").strip()
  if not quote:
    return False
  refs = _normalize_evidence_refs(item.get("evidenceIds") or item.get("evidence_ids"))
  return not refs or any(ref.startswith("asr:") for ref in refs)


def _analysis_quality_incomplete_action_count(value: Any) -> int:
  if not isinstance(value, list):
    return 0
  required = ("ownerRole", "due", "action", "reason", "expectedImpact")
  count = 0
  for item in value:
    if not isinstance(item, dict):
      continue
    missing_required = any(not str(item.get(key) or "").strip() for key in required)
    missing_refs = not _normalize_evidence_refs(item.get("evidenceIds") or item.get("evidence_ids"))
    if missing_required or missing_refs:
      count += 1
  return count


def _analysis_quality_has_unsupported_action_percentage(value: Any) -> bool:
  if not isinstance(value, list):
    return False
  for item in value:
    if isinstance(item, dict) and _contains_unsupported_percentage(str(item.get("expectedImpact") or "")):
      return True
  return False


def _deduplicate_analysis_quality_issues(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
  seen: set[str] = set()
  result: List[Dict[str, Any]] = []
  for item in items:
    key = str(item.get("code") or item.get("title") or "").strip()
    if not key or key in seen:
      continue
    seen.add(key)
    result.append(item)
  return result


def _analysis_quality_score(
  blocking_issues: List[Mapping[str, Any]],
  warnings: List[Mapping[str, Any]],
  health: Mapping[str, Any],
) -> int:
  score = 100
  score -= len(blocking_issues) * 24
  score -= len(warnings) * 6
  unresolved = int(health.get("unresolvedEvidenceCount") or 0)
  if unresolved > 0:
    score -= min(20, unresolved * 5)
  if int(health.get("scorecardDimensionCount") or 0) < len(OPERATOR_SCORECARD_DIMENSIONS):
    score -= 10
  if int(health.get("actionItemCount") or 0) < 3:
    score -= 5
  if blocking_issues:
    score = min(score, 64)
  return max(0, min(100, int(round(score))))


def _analysis_quality_grade(
  score: int,
  blocking_issues: List[Mapping[str, Any]],
  warnings: List[Mapping[str, Any]],
  self_eval: Mapping[str, Any],
) -> str:
  _ = self_eval
  if blocking_issues or score < 60:
    return "blocked"
  if score >= 85 and len(warnings) <= 1:
    return "ready"
  return "review_required"


def _analysis_quality_summary(
  grade: str,
  score: int,
  blocking_issues: List[Mapping[str, Any]],
  warnings: List[Mapping[str, Any]],
) -> str:
  if grade == "ready":
    return f"质量门评分 {score} 分，证据闭合度较好，可作为本场运营复盘初稿进入定稿。"
  if grade == "blocked":
    return (
      f"质量门评分 {score} 分，发现 {len(blocking_issues)} 个阻断问题；"
      "定稿前需要先补齐证据或结构化复盘内容。"
    )
  return (
    f"质量门评分 {score} 分，未发现硬阻断但还有 {len(warnings)} 个复核提醒；"
    "建议运营抽查证据后再作为最终复盘。"
  )


def _metric_summary_evidence(context: Mapping[str, Any]) -> Dict[str, Any]:
  anchor = _default_time_anchor(context)
  return {
    "evidenceId": "metric:minute:all",
    "type": "metric",
    "source": "全量分钟成交指标",
    "timeRange": anchor.get("displayTimeRange") or "",
    "timeAnchor": anchor,
    "content": _metric_signal_summary(context),
    "supports": "支撑成交峰值、空窗分钟和 CTA 后订单响应判断。",
    "confidence": 0.95,
  }


def _asr_summary_evidence(context: Mapping[str, Any], transcript: Mapping[str, Any], index: int) -> Dict[str, Any]:
  anchor = _time_anchor_from_any(transcript, context)
  return {
    "evidenceId": f"asr:{index}",
    "type": "asr",
    "source": f"口播转写 #{index}",
    "timeRange": anchor.get("displayTimeRange") or _format_input_time_range(transcript),
    "timeAnchor": anchor,
    "content": _short_script_quote(transcript.get("scriptText") or transcript.get("transcriptText") or "", 360),
    "supports": "支撑话术、CTA、福利表达和主播改写建议。",
    "confidence": _bounded_confidence(transcript.get("confidence"), default=0.6),
  }


def _frame_summary_evidence(context: Mapping[str, Any], frames: List[Dict[str, Any]]) -> Dict[str, Any]:
  anchor = _time_anchor_from_any(frames[0], context) if frames else _default_time_anchor(context)
  return {
    "evidenceId": "frame:all",
    "type": "frame",
    "source": "采样画面证据",
    "timeRange": anchor.get("displayTimeRange") or "",
    "timeAnchor": anchor,
    "content": f"本次共有 {len(frames)} 张采样画面证据；不足以单独代表全场画面承接。",
    "supports": "支撑画面/商品卡/贴片相关复核任务，而非全场绝对结论。",
    "confidence": 0.55,
  }


def _single_frame_evidence(context: Mapping[str, Any], frame: Mapping[str, Any], index: int) -> Dict[str, Any]:
  anchor = _time_anchor_from_any(frame, context)
  return {
    "evidenceId": f"frame:{index}",
    "type": "frame",
    "source": f"采样画面 #{index}",
    "timeRange": anchor.get("displayTimeRange") or _format_input_time_range(frame),
    "timeAnchor": anchor,
    "content": "采样画面证据，需结合人工或 L2 视觉识别确认商品卡、贴片和主播展示。",
    "supports": "支撑画面承接复核。",
    "confidence": 0.55,
  }


def _segment_summary_evidence(context: Mapping[str, Any], segment: Mapping[str, Any]) -> Dict[str, Any]:
  segment_index = _optional_int(segment.get("segmentIndex")) or 0
  anchor = _segment_time_anchor(segment)
  return {
    "evidenceId": f"segment:{segment_index}",
    "type": "recording_segment",
    "source": f"录屏 #{segment.get('displaySegmentIndex') or segment_index}",
    "timeRange": anchor.get("displayTimeRange") or "",
    "timeAnchor": anchor,
    "content": "已上传录屏分段，可用于回放定位与人工复核。",
    "supports": "支撑时间锚点和回放定位。",
    "confidence": 0.7,
  }


def _placeholder_review_evidence(context: Mapping[str, Any], evidence_id: str) -> Dict[str, Any]:
  anchor = _default_time_anchor(context)
  return {
    "evidenceId": evidence_id,
    "type": "review",
    "source": "证据闭合占位",
    "timeRange": anchor.get("displayTimeRange") or "",
    "timeAnchor": anchor,
    "content": "模型引用了该 evidenceId，但原始证据未在返回结果中展开；需人工复核后采信。",
    "supports": "保证结果中的 evidenceIds 可追溯，不让引用悬空。",
    "confidence": 0.25,
  }


def _context_segments(context: Mapping[str, Any]) -> List[Dict[str, Any]]:
  recording = context.get("recording") if isinstance(context.get("recording"), dict) else {}
  segments = recording.get("segments") if isinstance(recording, dict) else []
  return [segment for segment in segments if isinstance(segment, dict)]


def _collect_referenced_evidence_ids(value: Any) -> List[str]:
  refs: List[str] = []
  if isinstance(value, dict):
    for key, child in value.items():
      if key in {"evidenceIds", "evidence_ids"}:
        refs.extend(_normalize_evidence_refs(child))
      else:
        refs.extend(_collect_referenced_evidence_ids(child))
  elif isinstance(value, list):
    for item in value:
      refs.extend(_collect_referenced_evidence_ids(item))
  return _dedupe_preserve_order(refs)


def _derive_executive_review(context: Mapping[str, Any], analysis: Mapping[str, Any]) -> Dict[str, Any]:
  primary_decision = analysis.get("primaryDecision") if isinstance(analysis.get("primaryDecision"), dict) else {}
  summary = str(analysis.get("summary") or "").strip()
  decision = str(primary_decision.get("decision") or "review").strip() or "review"
  if decision not in {"scale", "observe", "optimize", "review", "insufficient"}:
    decision = "review"
  evidence_refs = _normalize_evidence_refs(primary_decision.get("evidenceIds") or primary_decision.get("evidence_ids"))
  if not evidence_refs:
    evidence_refs = ["metric:minute:all"]
  reason = str(primary_decision.get("reason") or primary_decision.get("rationale") or summary or "需要结合录屏话术、分钟指标和画面证据复盘。")
  return {
    "verdict": decision,
    "oneSentenceConclusion": (summary or reason)[:600],
    "whyNow": reason[:600],
    "confidence": _bounded_confidence(primary_decision.get("confidence"), default=0.35),
    "evidenceIds": evidence_refs[:20],
  }


def _derive_moment_reviews(context: Mapping[str, Any], analysis: Mapping[str, Any]) -> List[Dict[str, Any]]:
  timeline = analysis.get("timeline") if isinstance(analysis.get("timeline"), list) else []
  moments: List[Dict[str, Any]] = []
  metric_signal = _metric_signal_summary(context)
  for index, item in enumerate(timeline[:6], start=1):
    if not isinstance(item, dict):
      continue
    anchor = _time_anchor_from_any(item, context)
    evidence_ids = _normalize_evidence_refs(item.get("evidenceIds") or item.get("evidence_ids"))
    quote = _short_script_quote(item.get("scriptQuote") or item.get("quote") or "")
    moments.append({
      "timeAnchor": anchor,
      "title": str(item.get("title") or item.get("event") or f"关键片段 {index}")[:160],
      "whatHappened": str(item.get("observation") or item.get("detail") or item.get("content") or "该时间点需要结合原话、商品卡和成交响应确认发生了什么。")[:600],
      "operatorRead": str(item.get("businessMeaning") or item.get("business_meaning") or "需结合成交分钟和话术结构复核该片段经营意义。")[:600],
      "scriptQuote": quote,
      "metricSignal": str(item.get("metricSignal") or item.get("metric_signal") or metric_signal)[:600],
      "visualSignal": str(item.get("visualSignal") or item.get("visual_signal") or "画面/商品承接证据不足。")[:600],
      "recommendedAction": str(item.get("recommendedAction") or item.get("action") or "复核该时间点的话术、商品卡和成交峰值关系。")[:600],
      "evidenceIds": evidence_ids[:20],
      "confidence": _bounded_confidence(item.get("confidence"), default=0.35),
    })
  if moments:
    return moments

  for index, transcript in enumerate(_successful_asr_transcripts(context)[:6], start=1):
    anchor = _time_anchor_from_any(transcript, context)
    quote = _short_script_quote(transcript.get("scriptText") or transcript.get("transcriptText") or "")
    if not quote:
      continue
    intent = _infer_script_intent(quote)
    moments.append({
      "timeAnchor": anchor,
      "title": f"{intent}片段 {index}",
      "whatHappened": f"主播在该时段口播：{quote}",
      "operatorRead": _script_operator_comment(intent, quote, context),
      "scriptQuote": quote,
      "metricSignal": metric_signal,
      "visualSignal": "需结合录屏画面/商品卡承接人工复核。",
      "recommendedAction": _script_rewrite_suggestion(intent, quote),
      "evidenceIds": [f"asr:{index}"],
      "confidence": _bounded_confidence(transcript.get("confidence"), default=0.55),
    })
  return moments[:6]


def _normalize_moment_review_items(value: Any, context: Mapping[str, Any]) -> List[Dict[str, Any]]:
  if not isinstance(value, list):
    return []
  metric_signal = _metric_signal_summary(context)
  normalized: List[Dict[str, Any]] = []
  for index, raw_item in enumerate(value[:8], start=1):
    if not isinstance(raw_item, dict):
      continue
    anchor = _time_anchor_from_any(raw_item, context)
    title = str(raw_item.get("title") or raw_item.get("event") or raw_item.get("moment") or f"关键片段 {index}").strip()
    what_happened = str(
      raw_item.get("whatHappened")
      or raw_item.get("what_happened")
      or raw_item.get("observation")
      or raw_item.get("detail")
      or raw_item.get("content")
      or "该时间点需要结合原话、商品卡和成交响应确认发生了什么。"
    ).strip()
    operator_read = str(
      raw_item.get("operatorRead")
      or raw_item.get("operator_read")
      or raw_item.get("businessMeaning")
      or raw_item.get("business_meaning")
      or raw_item.get("analysis")
      or "需结合成交分钟和话术结构复核该片段经营意义。"
    ).strip()
    normalized.append({
      **raw_item,
      "timeAnchor": anchor,
      "title": title[:160],
      "whatHappened": what_happened[:600],
      "operatorRead": operator_read[:600],
      "scriptQuote": _short_script_quote(raw_item.get("scriptQuote") or raw_item.get("script_quote") or raw_item.get("quote") or ""),
      "metricSignal": str(raw_item.get("metricSignal") or raw_item.get("metric_signal") or metric_signal)[:600],
      "visualSignal": str(raw_item.get("visualSignal") or raw_item.get("visual_signal") or "画面/商品承接证据不足。")[:600],
      "recommendedAction": str(raw_item.get("recommendedAction") or raw_item.get("recommended_action") or raw_item.get("action") or "复核该时间点的话术、商品卡和成交峰值关系。")[:600],
      "evidenceIds": _normalize_evidence_refs(raw_item.get("evidenceIds") or raw_item.get("evidence_ids"))[:20],
      "confidence": _bounded_confidence(raw_item.get("confidence"), default=0.35),
    })
  return normalized[:6]


def _derive_speech_script(context: Mapping[str, Any]) -> List[Dict[str, Any]]:
  derived_inputs = context.get("derivedInputs") if isinstance(context.get("derivedInputs"), dict) else {}
  transcripts = derived_inputs.get("asrTranscripts") if isinstance(derived_inputs, dict) else []
  if not isinstance(transcripts, list):
    return []

  items: List[Dict[str, Any]] = []
  for index, transcript in enumerate(transcripts, start=1):
    if not isinstance(transcript, dict) or transcript.get("status") != "succeeded":
      continue
    script_text = _truncate_text(
      transcript.get("scriptText") or transcript.get("transcriptText") or "",
      1800,
    )
    transcript_text = _truncate_text(
      transcript.get("transcriptText") or transcript.get("scriptText") or "",
      1800,
    )
    if not script_text and not transcript_text:
      continue
    evidence_id = f"asr:{index}"
    intent = _infer_script_intent(script_text or transcript_text)
    anchor = _time_anchor_from_any(transcript, context)
    items.append({
      "timeRange": anchor.get("displayTimeRange") or _format_input_time_range(transcript),
      "segmentIndex": _optional_int(transcript.get("segmentIndex")),
      "scriptText": script_text,
      "transcriptText": transcript_text,
      "speakerIntent": intent,
      "sellingPoint": _infer_selling_point(script_text or transcript_text),
      "riskFlags": _script_risk_flags(intent, script_text or transcript_text),
      "evidenceIds": [evidence_id],
      "confidence": _bounded_confidence(transcript.get("confidence"), default=0.6),
    })
  return items[:12]


def _derive_script_review(context: Mapping[str, Any], analysis: Mapping[str, Any]) -> List[Dict[str, Any]]:
  speech_script = analysis.get("speechScript") if isinstance(analysis.get("speechScript"), list) else _derive_speech_script(context)
  reviews: List[Dict[str, Any]] = []
  for index, item in enumerate(speech_script[:24], start=1):
    if not isinstance(item, dict):
      continue
    quote = _short_script_quote(item.get("scriptText") or item.get("transcriptText") or item.get("quote") or "")
    if not quote:
      continue
    intent = str(item.get("speakerIntent") or item.get("intent") or "").strip() or _infer_script_intent(quote)
    reviews.append({
      "timeAnchor": _time_anchor_from_any(item, context),
      "quote": quote,
      "intent": intent[:600],
      "operatorComment": _script_operator_comment(intent, quote, context),
      "rewriteSuggestion": _script_rewrite_suggestion(intent, quote),
      "riskFlags": item.get("riskFlags") if isinstance(item.get("riskFlags"), list) else _script_risk_flags(intent, quote),
      "evidenceIds": _normalize_evidence_refs(item.get("evidenceIds") or item.get("evidence_ids") or [f"asr:{index}"])[:20],
      "confidence": _bounded_confidence(item.get("confidence"), default=0.5),
    })
  return reviews[:6]


def _normalize_script_review_items(value: Any, context: Mapping[str, Any]) -> List[Dict[str, Any]]:
  if not isinstance(value, list):
    return []
  items: List[Dict[str, Any]] = []
  for index, raw_item in enumerate(value, start=1):
    if not isinstance(raw_item, dict):
      continue
    quote = _short_script_quote(raw_item.get("quote") or raw_item.get("scriptQuote") or raw_item.get("script_quote") or "")
    if not quote:
      continue
    intent = str(raw_item.get("intent") or raw_item.get("speakerIntent") or "").strip() or _infer_script_intent(quote)
    operator_comment = str(raw_item.get("operatorComment") or raw_item.get("operator_comment") or "").strip()
    if not operator_comment:
      operator_comment = _script_operator_comment(intent, quote, context)
    issue = str(raw_item.get("issue") or raw_item.get("problem") or raw_item.get("risk") or "").strip()
    if not issue:
      issue = _script_issue(intent, quote, operator_comment)
    rewrite = str(raw_item.get("rewriteSuggestion") or raw_item.get("rewrite_suggestion") or "").strip()
    if not rewrite:
      rewrite = _script_rewrite_suggestion(intent, quote)
    items.append({
      "timeAnchor": _time_anchor_from_any(raw_item, context),
      "quote": quote,
      "intent": intent[:600],
      "issue": issue[:600],
      "operatorComment": operator_comment[:800],
      "rewriteSuggestion": rewrite[:800],
      "riskFlags": raw_item.get("riskFlags") if isinstance(raw_item.get("riskFlags"), list) else _script_risk_flags(intent, quote),
      "evidenceIds": _normalize_evidence_refs(raw_item.get("evidenceIds") or raw_item.get("evidence_ids") or [f"asr:{index}"])[:20],
      "confidence": _bounded_confidence(raw_item.get("confidence"), default=0.5),
    })
  return items[:6]


def _script_issue(intent: str, quote: str, operator_comment: str) -> str:
  text = f"{intent} {quote} {operator_comment}"
  if any(token in text for token in ("十一点", "下班前", "几小时", "很久")):
    return "福利截止时间过长，缺少让用户马上拍下的即时紧迫感。"
  if not any(token in text for token in ("下单", "拍", "点", "小黄车", "商品卡", "链接")):
    return "讲了利益点但没有马上接下单路径，用户听完仍不知道此刻该做什么。"
  if any(token in text for token in ("180", "一百八", "拍一发二", "加送", "赠")) and not any(token in text for token in ("限", "库存", "最后", "倒计时")):
    return "福利力度有了，但稀缺性和截止动作不足，难以形成当场转化压力。"
  return "话术没有把痛点、利益点、紧迫感和下单动作连成一个成交闭环。"


def _derive_operator_scorecard(context: Mapping[str, Any], analysis: Mapping[str, Any]) -> List[Dict[str, Any]]:
  diagnosis = analysis.get("conversionDiagnosis") if isinstance(analysis.get("conversionDiagnosis"), dict) else {}
  evidence_ids = _normalize_evidence_refs(diagnosis.get("evidenceIds") or diagnosis.get("evidence_ids"))
  if not evidence_ids:
    evidence_ids = ["metric:minute:all"]
  metric_signal = str(diagnosis.get("metricSignal") or diagnosis.get("metric_signal") or "").strip()
  talk_signal = str(diagnosis.get("talkScriptSignal") or diagnosis.get("talk_script_signal") or "").strip()
  visual_signal = str(diagnosis.get("visualSignal") or diagnosis.get("visual_signal") or "").strip()
  asr_count = len(_successful_asr_transcripts(context))
  derived_inputs = context.get("derivedInputs") if isinstance(context.get("derivedInputs"), dict) else {}
  frame_count = int(derived_inputs.get("frameCount") or 0) if isinstance(derived_inputs, dict) else 0
  minute_count = int(_derive_metrics_summary(context).get("minuteMetricCount") or 0)
  total_orders = _metric_total_orders(context)
  asr_refs = _successful_asr_evidence_refs(context, limit=2)
  metric_refs = ["metric:minute:all"] if minute_count else []
  frame_refs = ["frame:1"] if frame_count else []
  script_stats = _script_signal_stats(context)

  def score_for(
    *,
    needs_asr: bool = False,
    needs_frame: bool = False,
    needs_metric: bool = False,
    has_signal: bool = False,
    risk_penalty: int = 0,
  ) -> tuple[int, str]:
    if needs_asr and not asr_count:
      return 35, "insufficient"
    if needs_frame and not frame_count:
      return 40, "insufficient"
    if needs_metric and not minute_count:
      return 45, "insufficient"
    score = 58 if asr_count else 52
    if has_signal:
      score += 12
    else:
      score -= 8
    if total_orders == 0 and needs_metric:
      score -= 10
    score -= min(max(0, risk_penalty), 18)
    status = "good" if score >= 75 else "watch" if score >= 58 else "weak"
    return max(0, min(100, score)), status

  script_score, script_status = score_for(needs_asr=True, has_signal=bool(script_stats["has_structured_selling"]), risk_penalty=int(script_stats["risk_count"]) * 3)
  product_score, product_status = score_for(needs_asr=True, has_signal=bool(script_stats["has_product"]))
  benefit_score, benefit_status = score_for(needs_asr=True, has_signal=bool(script_stats["has_benefit"]))
  cta_score, cta_status = score_for(needs_asr=True, needs_metric=True, has_signal=bool(script_stats["has_cta"]), risk_penalty=4 if total_orders == 0 else 0)
  interact_score, interact_status = score_for(needs_asr=True, has_signal=bool(script_stats["has_interaction"]))
  visual_score, visual_status = score_for(needs_frame=True, has_signal=bool(frame_count or visual_signal))

  return [
    {
      "dimension": "话术",
      "score": script_score,
      "status": script_status,
      "diagnosis": (talk_signal or "已捕获 ASR 时，需要判断开场、转场、催单是否按“痛点-卖点-福利-CTA”推进；ASR 不足时先补证据。")[:600],
      "fix": "给主播重排一版 60-90 秒循环话术：痛点切入、核心卖点、价格福利、信任背书、明确 CTA 分开讲。",
      "evidenceIds": (asr_refs or evidence_ids)[:20],
    },
    {
      "dimension": "商品",
      "score": product_score,
      "status": product_status,
      "diagnosis": "需确认话术是否把主推商品、适用人群、使用场景和商品卡承接讲清楚，而不是只重复泛化卖点。",
      "fix": "把主推商品的适用人群、使用场景、商品卡点击口令写进主播脚本，并要求场控在讲到卖点时同步切品。",
      "evidenceIds": (asr_refs or evidence_ids)[:20],
    },
    {
      "dimension": "福利",
      "score": benefit_score,
      "status": benefit_status,
      "diagnosis": "检查价格锚点、赠品、限时利益是否被讲成一句用户能复述的利益，而不是零散喊优惠。",
      "fix": "把原价、到手价、赠品、限时规则合成一句固定话术，并在每轮转化节点重复一次。",
      "evidenceIds": (asr_refs or evidence_ids)[:20],
    },
    {
      "dimension": "CTA",
      "score": cta_score,
      "status": cta_status,
      "diagnosis": (metric_signal or _metric_signal_summary(context))[:600],
      "fix": "在成交低谷后的 30-60 秒补明确 CTA：点商品卡、拍几号链接、现在下单获得什么；并复盘 CTA 后 1-3 分钟成交变化。",
      "evidenceIds": (asr_refs + metric_refs or evidence_ids)[:20],
    },
    {
      "dimension": "互动",
      "score": interact_score,
      "status": interact_status,
      "diagnosis": "需判断主播是否回应用户阻碍成交的问题；当前弹幕/评论未进入主证据链时，至少要从 ASR 中标注答疑话术。",
      "fix": "沉淀场控答疑卡：适用肤质、使用方法、价格规则、售后承诺；主播每轮催单前先解决一个购买疑虑。",
      "evidenceIds": (asr_refs or evidence_ids)[:20],
    },
    {
      "dimension": "画面",
      "score": visual_score,
      "status": visual_status,
      "diagnosis": (visual_signal or "画面证据不足时不能判断商品展示、价格贴片、商品卡和口播是否同步。")[:600],
      "fix": "用关键画面证据复核主播手持、商品卡、价格贴片是否跟口播同步；不同步则给场控增加切品/贴片提醒。",
      "evidenceIds": (frame_refs + asr_refs or evidence_ids)[:20],
    },
  ]


def _derive_conversion_diagnosis(context: Mapping[str, Any], analysis: Mapping[str, Any]) -> Dict[str, Any]:
  primary_decision = analysis.get("primaryDecision") if isinstance(analysis.get("primaryDecision"), dict) else {}
  derived_inputs = context.get("derivedInputs") if isinstance(context.get("derivedInputs"), dict) else {}
  metric_signal = (
    _metric_signal_summary(context)
  )
  asr_count = int(derived_inputs.get("asrTranscriptCount") or 0)
  frame_count = int(derived_inputs.get("frameCount") or 0)
  talk_script_signal = (
    "已有可复核主播原话，需按痛点、利益点、价格锚点、信任背书和 CTA 拆解是否推动成交。"
    if asr_count
    else "当前缺少可靠主播原话，不能直接判断话术问题；需先补 ASR 或人工复核。"
  )
  visual_signal = (
    "已有画面/视频证据，需复核主播展示、商品卡、价格贴片和口播是否同步。"
    if frame_count or int(derived_inputs.get("videoCount") or 0)
    else "当前缺少可用画面证据，商品展示和货架承接只能进入复核任务。"
  )
  evidence_refs = _normalize_evidence_refs(primary_decision.get("evidenceIds") or primary_decision.get("evidence_ids"))
  if not evidence_refs and derived_inputs.get("asrTranscriptCount"):
    evidence_refs = ["asr:1"]
  return {
    "verdict": str(primary_decision.get("decision") or "review"),
    "mainIssue": str(
      primary_decision.get("reason")
      or _infer_primary_operating_issue(context)
    )[:600],
    "metricSignal": metric_signal,
    "talkScriptSignal": talk_script_signal,
    "visualSignal": visual_signal,
    "evidenceIds": evidence_refs[:20],
    "confidence": _bounded_confidence(primary_decision.get("confidence"), default=0.35),
  }


def _derive_action_plan(context: Mapping[str, Any], analysis: Mapping[str, Any]) -> List[Dict[str, Any]]:
  review_tasks = analysis.get("reviewTasks") if isinstance(analysis.get("reviewTasks"), list) else []
  actions: List[Dict[str, Any]] = []
  for index, task in enumerate(review_tasks[:2], start=1):
    if not isinstance(task, dict):
      continue
    _append_unique_action(actions, {
      "priority": _normalize_priority(task.get("priority")),
      "ownerRole": str(task.get("owner") or task.get("role") or "运营复盘")[:80],
      "due": _default_action_due(task.get("priority"), task.get("owner") or task.get("role") or "运营复盘"),
      "action": str(task.get("title") or task.get("task") or f"复核任务 {index}")[:600],
      "reason": str(task.get("reason") or task.get("detail") or task.get("description") or "模型要求人工复核。")[:600],
      "expectedImpact": "补齐证据后再决定脚本改写、商品承接或投放节奏调整。",
      "evidenceIds": _normalize_evidence_refs(task.get("evidenceIds") or task.get("evidence_ids"))[:20],
    })

  metrics = _derive_metrics_summary(context)
  asr_refs = _successful_asr_evidence_refs(context, limit=2)
  metric_refs = ["metric:minute:all"] if metrics.get("minuteMetricCount") else []
  if not asr_refs:
    _append_unique_action(actions, {
      "priority": "high",
      "ownerRole": "运营复盘",
      "due": "本场复盘前",
      "action": "先补齐或人工复核 ASR 话术底稿，再判断主播话术是否支撑成交。",
      "reason": "没有可靠主播原话时，不能编造话术问题，也不能直接给主播改写脚本。",
      "expectedImpact": "把分析从画面/指标台账推进到可复盘的话术证据链。",
      "evidenceIds": metric_refs,
    })
  _append_unique_action(actions, {
    "priority": "high",
    "ownerRole": "主播",
    "due": "下一场开播前",
    "action": "重写一版主推品循环话术：痛点、核心卖点、价格福利、信任背书、明确 CTA 分段讲。",
    "reason": f"当前需要把成交低谷和主播话术连起来复盘；已有 {metrics.get('minuteMetricCount')} 个分钟指标可用于定位 CTA 后的订单响应。",
    "expectedImpact": "让主播每一轮口播都能推动点击/下单，而不是只做信息介绍。",
    "evidenceIds": (asr_refs + metric_refs)[:20],
  })
  _append_unique_action(actions, {
    "priority": "high",
    "ownerRole": "场控",
    "due": "下一场开播前",
    "action": "按成交峰值和空窗分钟设置提醒：低谷后 30-60 秒切回商品卡并提示主播补 CTA。",
    "reason": _metric_signal_summary(context),
    "expectedImpact": "把成交低谷从事后发现变成场中节奏干预点。",
    "evidenceIds": metric_refs,
  })
  _append_unique_action(actions, {
    "priority": "medium",
    "ownerRole": "运营复盘",
    "due": "本场复盘前",
    "action": "逐条标注“原话 -> 意图 -> 是否有订单响应”，沉淀下场可复用和必须替换的话术。",
    "reason": "资深复盘需要把话术节点和成交分钟联动，不只看 ASR 摘录。",
    "expectedImpact": "形成主播脚本迭代素材，减少下场继续重复低效表达。",
    "evidenceIds": (asr_refs + metric_refs)[:20],
  })
  return _normalize_action_plan_items(actions)


def _append_unique_action(actions: List[Dict[str, Any]], action: Dict[str, Any]) -> None:
  key = _normalize_dedup_text(
    " ".join([
      str(action.get("ownerRole") or ""),
      str(action.get("action") or ""),
      str(action.get("reason") or ""),
    ])
  )
  if not key:
    return
  existing_keys = {
    _normalize_dedup_text(
      " ".join([
        str(existing.get("ownerRole") or ""),
        str(existing.get("action") or ""),
        str(existing.get("reason") or ""),
      ])
    )
    for existing in actions
  }
  if key not in existing_keys:
    actions.append(action)


def _infer_primary_operating_issue(context: Mapping[str, Any]) -> str:
  stats = _script_signal_stats(context)
  total_orders = _metric_total_orders(context)
  if not stats["has_asr"]:
    return "当前首要问题是缺少可核验主播原话，无法判断成交低谷到底来自话术、商品承接还是 CTA，需要先补齐 ASR 后再定脚本动作。"
  if total_orders <= 0:
    if not stats["has_cta"]:
      return "本场未捕获成交，且现有 ASR 未看到明确下单动作，优先排查主播是否把商品利益点讲完后没有把用户推到商品卡。"
    return "本场未捕获成交，需重点复核 CTA 前是否已讲清购买理由、价格福利和信任背书，而不是只催单。"
  if not stats["has_benefit"]:
    return "已有成交但福利/价格锚点不够清晰，下一场应优先把到手价、赠品和限时规则讲成用户能复述的一句话。"
  if not stats["has_product"]:
    return "已有成交信号但商品适用人群和场景表达不足，下一场应把主推品卖点和商品卡承接前置。"
  return "当前复盘重点是复制成交峰值前后的话术结构，并把低谷分钟缺失的利益点和 CTA 补齐。"


def _script_signal_stats(context: Mapping[str, Any]) -> Dict[str, Any]:
  transcripts = _successful_asr_transcripts(context)
  text = " ".join(
    str(item.get("scriptText") or item.get("transcriptText") or "")
    for item in transcripts
    if isinstance(item, dict)
  )
  intents = [_infer_script_intent(text)] if text else []
  risks: List[str] = []
  if text:
    for intent in intents:
      risks.extend(_script_risk_flags(intent, text))
  return {
    "has_asr": bool(transcripts),
    "has_cta": _contains_any(text, ("下单", "拍下", "点链接", "点商品", "商品卡", "加购", "点击")),
    "has_benefit": _contains_any(text, ("优惠", "福利", "赠", "到手", "券", "价格", "元", "立减", "满减")),
    "has_product": _contains_any(text, ("功效", "效果", "成分", "修护", "保湿", "敏感", "抗老", "控油", "提亮", "适合", "肤质")),
    "has_trust": _contains_any(text, ("正品", "品牌", "保证", "售后", "放心", "口碑", "回购")),
    "has_interaction": _contains_any(text, ("怎么用", "适合", "肤质", "可以用", "能不能", "问题", "问", "宝宝")),
    "has_structured_selling": _contains_any(text, ("痛点", "适合", "功效", "到手", "下单", "商品卡", "放心")),
    "risk_count": len(set(risks)),
  }


def _contains_any(text: Any, tokens: tuple[str, ...]) -> bool:
  value = str(text or "")
  return any(token in value for token in tokens)


def _metric_total_orders(context: Mapping[str, Any]) -> int:
  minute_metrics = context.get("minuteMetrics") or []
  if not isinstance(minute_metrics, list):
    return 0
  total = 0
  for item in minute_metrics:
    if isinstance(item, dict):
      total += int(item.get("orderCount") or 0)
  return total


def _metric_signal_summary(context: Mapping[str, Any]) -> str:
  minute_metrics = context.get("minuteMetrics") or []
  if not isinstance(minute_metrics, list) or not minute_metrics:
    return "当前缺少分钟成交指标，无法判断话术节点后的订单响应。"
  valid_metrics = [item for item in minute_metrics if isinstance(item, dict)]
  if not valid_metrics:
    return "当前分钟成交指标不可用，无法判断话术节点后的订单响应。"
  total_orders = sum(int(item.get("orderCount") or 0) for item in valid_metrics)
  order_minutes = [item for item in valid_metrics if int(item.get("orderCount") or 0) > 0]
  peak = max(valid_metrics, key=lambda item: int(item.get("orderCount") or 0))
  peak_offset = _optional_int(peak.get("minuteOffset"))
  peak_orders = int(peak.get("orderCount") or 0)
  peak_label = _format_metric_minute_label(peak_offset)
  empty_minutes = len(valid_metrics) - len(order_minutes)
  if total_orders <= 0:
    return f"本次分钟成交未捕获订单，连续 {len(valid_metrics)} 个分钟点没有成交响应，优先复核话术是否缺少购买理由、福利锚点和明确 CTA。"
  return (
    f"本次合计 {total_orders} 单，成交集中在 {len(order_minutes)} 个分钟点，"
    f"仍有 {empty_minutes} 个空窗分钟；峰值出现在{peak_label}，该分钟 {peak_orders} 单。复盘应对比峰值前后的话术/CTA，并把低谷分钟缺失动作补上。"
  )


def _format_metric_minute_label(minute_offset: Optional[int]) -> str:
  if minute_offset is None:
    return "未知分钟"
  return f"第 {max(1, int(minute_offset) + 1)} 分钟"


def _successful_asr_evidence_refs(context: Mapping[str, Any], *, limit: int = 3) -> List[str]:
  return [
    f"asr:{index}"
    for index, _transcript in enumerate(_successful_asr_transcripts(context)[:max(0, limit)], start=1)
  ]


def _short_script_quote(value: Any, max_chars: int = 220) -> str:
  text = re.sub(r"\s+", " ", str(value or "")).strip()
  if not text:
    return ""
  if len(text) <= max_chars:
    return text
  boundary = max(text.rfind("。", 0, max_chars), text.rfind("！", 0, max_chars), text.rfind("？", 0, max_chars))
  if boundary >= 40:
    return text[:boundary + 1]
  return text[:max_chars].rstrip() + "..."


def _infer_script_intent(text: Any) -> str:
  normalized = str(text or "")
  if any(token in normalized for token in ("下单", "拍下", "点链接", "点商品", "商品卡", "赶紧", "马上", "最后", "库存")):
    return "催单 CTA"
  if any(token in normalized for token in ("优惠", "福利", "赠", "到手", "券", "价格", "便宜", "立减", "满减")):
    return "讲福利价格"
  if any(token in normalized for token in ("功效", "效果", "成分", "修护", "保湿", "敏感", "抗老", "控油", "提亮")):
    return "讲功效卖点"
  if any(token in normalized for token in ("怎么用", "适合", "肤质", "可以用", "能不能", "问题", "问")):
    return "互动答疑"
  if any(token in normalized for token in ("正品", "品牌", "保证", "售后", "放心", "口碑", "回购")):
    return "信任背书"
  if any(token in normalized for token in ("首先", "接下来", "然后", "我们来看", "再看")):
    return "转场讲解"
  return "讲解铺垫"


def _infer_selling_point(text: Any) -> str:
  normalized = str(text or "")
  if any(token in normalized for token in ("优惠", "福利", "赠", "到手", "券", "价格")):
    return "价格/福利利益点"
  if any(token in normalized for token in ("功效", "效果", "成分", "修护", "保湿", "敏感", "抗老", "控油", "提亮")):
    return "功效/适用场景卖点"
  if any(token in normalized for token in ("正品", "售后", "放心", "回购", "品牌")):
    return "信任背书卖点"
  return "卖点需要复盘标注"


def _script_risk_flags(intent: Any, text: Any) -> List[str]:
  normalized_intent = str(intent or "")
  normalized_text = str(text or "")
  flags: List[str] = []
  if not any(token in normalized_text for token in ("下单", "拍", "点", "链接", "商品卡", "加购")):
    flags.append("缺少明确 CTA")
  if not any(token in normalized_text for token in ("优惠", "福利", "赠", "到手", "券", "价格", "元")):
    flags.append("价格/福利锚点不清晰")
  if "催单" in normalized_intent and not any(token in normalized_text for token in ("为什么", "因为", "适合", "解决", "效果")):
    flags.append("催单前缺少购买理由")
  return flags[:4]


def _script_operator_comment(intent: Any, quote: Any, context: Mapping[str, Any]) -> str:
  intent_text = str(intent or "话术").strip()
  risks = _script_risk_flags(intent_text, quote)
  risk_text = "、".join(risks) if risks else "需要继续确认话术后 1-3 分钟订单响应"
  metric_hint = "该句后 1-3 分钟没有订单时，要优先补购买理由和商品卡动作。"
  if _metric_total_orders(context) > 0:
    metric_hint = "复盘时对齐该句后 1-3 分钟订单变化，判断它能否复制到成交低谷。"
  return f"这段属于{intent_text}，运营上要看它是否把购买理由和下一步动作讲完整；当前重点风险：{risk_text}。{metric_hint}"


def _script_rewrite_suggestion(intent: Any, quote: Any) -> str:
  intent_text = str(intent or "")
  if "催单" in intent_text or "CTA" in intent_text:
    return "改成“谁适合 + 现在拍哪一个链接 + 到手福利 + 错过损失”的一句完整 CTA，避免只催用户下单。"
  if "福利" in intent_text or "价格" in intent_text:
    return "把原价、到手价、赠品和限时条件合成一句可复述话术，再补一句“现在点商品卡拍几号”。"
  if "功效" in intent_text or "卖点" in intent_text:
    return "按“用户痛点 -> 成分/功效 -> 使用场景 -> 价格福利 -> CTA”重写，减少只讲产品好处不推动成交。"
  if "互动" in intent_text or "答疑" in intent_text:
    return "先复述用户疑虑，再给明确答案、适用边界和商品卡动作，避免答完问题但没有转化指令。"
  if "信任" in intent_text:
    return "把品牌/正品/售后背书后接上价格福利和下单动作，让信任背书服务成交。"
  return "补齐痛点、利益点、价格福利和明确 CTA，形成主播可直接复述的 30 秒转化话术。"


def _successful_asr_transcripts(context: Mapping[str, Any]) -> List[Dict[str, Any]]:
  derived_inputs = context.get("derivedInputs") if isinstance(context.get("derivedInputs"), dict) else {}
  transcripts = derived_inputs.get("asrTranscripts") if isinstance(derived_inputs, dict) else []
  if not isinstance(transcripts, list):
    return []
  return [
    transcript
    for transcript in transcripts
    if isinstance(transcript, dict) and transcript.get("status") == "succeeded"
  ]


def _time_anchor_from_any(value: Mapping[str, Any], context: Mapping[str, Any]) -> Dict[str, Any]:
  anchor = value.get("timeAnchor")
  if isinstance(anchor, dict):
    return _normalize_time_anchor(_merge_time_anchor_parent_fields(anchor, value), context)

  segment_index = _optional_int(value.get("segmentIndex") or value.get("segment_index"))
  display_segment_index = _optional_int(value.get("displaySegmentIndex") or value.get("display_segment_index"))
  slice_index = _optional_int(value.get("sliceIndex") or value.get("slice_index"))
  start = _float_or_none(value.get("offsetStartSeconds") if value.get("offsetStartSeconds") is not None else value.get("offset_start_seconds"))
  end = _float_or_none(value.get("offsetEndSeconds") if value.get("offsetEndSeconds") is not None else value.get("offset_end_seconds"))
  has_offset = start is not None or end is not None
  has_segment_reference = segment_index is not None or display_segment_index is not None
  has_segment_context = bool(_context_segments(context))
  segment = _find_segment_by_index(context, segment_index) or _find_segment_by_display_index(context, display_segment_index)
  offset_segment = _find_segment_by_offset(context, _time_anchor_probe_offset(start, end)) if has_offset else None
  if offset_segment is not None:
    segment = offset_segment
    segment_index = _optional_int(segment.get("segmentIndex"))
    display_segment_index = _optional_int(segment.get("displaySegmentIndex"))
  elif segment is None and has_offset and has_segment_context:
    segment_index = None
    display_segment_index = None
  if segment:
    if segment_index is None:
      segment_index = _optional_int(segment.get("segmentIndex"))
    if display_segment_index is None:
      display_segment_index = _optional_int(segment.get("displaySegmentIndex"))
    if has_offset:
      return _build_time_anchor(
        live_start_time=segment.get("liveStartTime") or _context_live_start_time(context),
        offset_start_seconds=start,
        offset_end_seconds=end,
        segment_index=segment_index,
        display_segment_index=display_segment_index,
        slice_index=slice_index,
      )
    if value.get("sliceStartSeconds") is not None or value.get("sliceEndSeconds") is not None:
      return _segment_time_anchor(
        segment,
        slice_start_seconds=_float_or_none(value.get("sliceStartSeconds")),
        slice_end_seconds=_float_or_none(value.get("sliceEndSeconds")),
        slice_index=slice_index,
      )
    return _segment_time_anchor(segment, slice_index=slice_index)

  if has_offset:
    return _build_time_anchor(
      live_start_time=_context_live_start_time(context),
      offset_start_seconds=start,
      offset_end_seconds=end,
      segment_index=segment_index,
      display_segment_index=display_segment_index,
      slice_index=slice_index,
    )
  if has_segment_reference and has_segment_context:
    return _build_time_anchor(
      live_start_time=_context_live_start_time(context),
      offset_start_seconds=None,
      offset_end_seconds=None,
      slice_index=slice_index,
    )
  return _default_time_anchor(context)


def _merge_time_anchor_parent_fields(anchor: Mapping[str, Any], parent: Mapping[str, Any]) -> Dict[str, Any]:
  merged = dict(anchor)
  for target_key, aliases in (
    ("segmentIndex", ("segmentIndex", "segment_index", "segment")),
    ("displaySegmentIndex", ("displaySegmentIndex", "display_segment_index")),
    ("sliceIndex", ("sliceIndex", "slice_index", "slice")),
    ("offsetStartSeconds", ("offsetStartSeconds", "offset_start_seconds", "startOffsetSeconds", "start_offset_seconds")),
    ("offsetEndSeconds", ("offsetEndSeconds", "offset_end_seconds", "endOffsetSeconds", "end_offset_seconds")),
    ("displayTimeRange", ("displayTimeRange", "display_time_range", "timeRange", "time_range")),
    ("clockTimeRange", ("clockTimeRange", "clock_time_range", "clockRange", "clock_range")),
    ("minuteRangeLabel", ("minuteRangeLabel", "minute_range_label", "minuteRange", "minute_range")),
    ("segmentLabel", ("segmentLabel", "segment_label", "recordingLabel", "recording_label")),
  ):
    current = merged.get(target_key)
    if current is not None and str(current).strip():
      continue
    for alias in aliases:
      parent_value = parent.get(alias)
      if parent_value is not None and str(parent_value).strip():
        merged[target_key] = parent_value
        break
  return merged


def _normalize_time_anchor(anchor: Mapping[str, Any], context: Mapping[str, Any]) -> Dict[str, Any]:
  start = _float_or_none(anchor.get("offsetStartSeconds") if anchor.get("offsetStartSeconds") is not None else anchor.get("offset_start_seconds"))
  end = _float_or_none(anchor.get("offsetEndSeconds") if anchor.get("offsetEndSeconds") is not None else anchor.get("offset_end_seconds"))
  segment_index = _optional_int(anchor.get("segmentIndex") if anchor.get("segmentIndex") is not None else anchor.get("segment_index"))
  display_segment_index = _optional_int(anchor.get("displaySegmentIndex") if anchor.get("displaySegmentIndex") is not None else anchor.get("display_segment_index"))
  slice_index = _optional_int(anchor.get("sliceIndex") if anchor.get("sliceIndex") is not None else anchor.get("slice_index"))
  has_offset = start is not None or end is not None
  has_segment_reference = segment_index is not None or display_segment_index is not None
  has_segment_context = bool(_context_segments(context))
  segment = _find_segment_by_index(context, segment_index) or _find_segment_by_display_index(context, display_segment_index)
  offset_segment = _find_segment_by_offset(context, _time_anchor_probe_offset(start, end)) if has_offset else None
  if offset_segment is not None:
    segment = offset_segment
    segment_index = _optional_int(segment.get("segmentIndex"))
    display_segment_index = _optional_int(segment.get("displaySegmentIndex"))
  elif segment is None and has_offset and has_segment_context:
    segment_index = None
    display_segment_index = None
  if segment is not None and segment_index is None:
    segment_index = _optional_int(segment.get("segmentIndex"))
  if segment is not None and display_segment_index is None:
    display_segment_index = _optional_int(segment.get("displaySegmentIndex"))
  if has_offset:
    rebuilt = _build_time_anchor(
      live_start_time=_context_live_start_time(context),
      offset_start_seconds=start,
      offset_end_seconds=end,
      segment_index=segment_index,
      display_segment_index=display_segment_index,
      slice_index=slice_index,
    )
  elif segment is not None:
    rebuilt = _segment_time_anchor(segment, slice_index=slice_index)
  elif has_segment_reference and has_segment_context:
    rebuilt = _build_time_anchor(
      live_start_time=_context_live_start_time(context),
      offset_start_seconds=None,
      offset_end_seconds=None,
      slice_index=slice_index,
    )
  else:
    rebuilt = _default_time_anchor(context)
  for key in ("displayTimeRange", "offsetRange", "clockTimeRange", "minuteRangeLabel", "segmentLabel"):
    text = str(anchor.get(key) or "").strip()
    if _should_preserve_model_time_anchor_text(
      key,
      text,
      rebuilt,
      has_offset=has_offset,
      has_segment=rebuilt.get("segmentIndex") is not None or rebuilt.get("displaySegmentIndex") is not None,
    ):
      rebuilt[key] = text
  return rebuilt


def _default_time_anchor(context: Mapping[str, Any]) -> Dict[str, Any]:
  recording = context.get("recording") if isinstance(context.get("recording"), dict) else {}
  segments = recording.get("segments") if isinstance(recording, dict) else []
  if isinstance(segments, list) and segments:
    first_segment = next(
      (
        segment for segment in segments
        if isinstance(segment, dict) and _is_playable_recording_segment(segment)
      ),
      None,
    )
    if first_segment:
      return _segment_time_anchor(first_segment)
  return _build_time_anchor(
    live_start_time=_context_live_start_time(context),
    offset_start_seconds=None,
    offset_end_seconds=None,
  )


def _find_segment_by_index(context: Mapping[str, Any], segment_index: Optional[int]) -> Optional[Dict[str, Any]]:
  if segment_index is None:
    return None
  recording = context.get("recording") if isinstance(context.get("recording"), dict) else {}
  segments = recording.get("segments") if isinstance(recording, dict) else []
  if not isinstance(segments, list):
    return None
  matches = [
    segment
    for segment in segments
    if isinstance(segment, dict) and _optional_int(segment.get("segmentIndex")) == segment_index
  ]
  return next((segment for segment in matches if _is_playable_recording_segment(segment)), None)


def _find_segment_by_display_index(context: Mapping[str, Any], display_segment_index: Optional[int]) -> Optional[Dict[str, Any]]:
  if display_segment_index is None:
    return None
  recording = context.get("recording") if isinstance(context.get("recording"), dict) else {}
  segments = recording.get("segments") if isinstance(recording, dict) else []
  if not isinstance(segments, list):
    return None
  matches = [
    segment
    for segment in segments
    if isinstance(segment, dict) and _optional_int(segment.get("displaySegmentIndex")) == display_segment_index
  ]
  return next((segment for segment in matches if _is_playable_recording_segment(segment)), None)


def _should_preserve_model_time_anchor_text(
  key: str,
  text: str,
  rebuilt: Mapping[str, Any],
  *,
  has_offset: bool,
  has_segment: bool,
) -> bool:
  if not text or _is_unlocatable_time_anchor_text(text):
    return False
  if key in {"displayTimeRange", "segmentLabel"} and _contains_segment_label_text(text) and not has_segment:
    return False
  if key == "segmentLabel" and has_segment and str(rebuilt.get("segmentLabel") or "").strip():
    return False
  if has_offset and str(rebuilt.get(key) or "").strip():
    if key == "displayTimeRange" and not _is_generic_time_anchor_text(text):
      return True
    return False
  if (
    key == "displayTimeRange"
    and has_segment
    and str(rebuilt.get("displayTimeRange") or "").strip()
    and _is_generic_time_anchor_text(text)
  ):
    return False
  return True


def _contains_segment_label_text(value: Any) -> bool:
  normalized = str(value or "").strip()
  if not normalized:
    return False
  return bool(re.search(r"(?:录屏\s*#|recording\s*#|segment\s*:?\s*\d+)", normalized, re.IGNORECASE))


def _is_unlocatable_time_anchor_text(value: Any) -> bool:
  normalized = str(value or "").strip()
  if not normalized:
    return False
  return bool(re.search(r"(?:待定位|unknown|pending|to\s*be\s*located|待确认|未定位)", normalized, re.IGNORECASE))


def _is_generic_time_anchor_text(value: Any) -> bool:
  normalized = str(value or "").strip()
  if not normalized:
    return False
  return bool(
    re.search(r"minute\s*offset|minuteOffset|minute_offset|分钟偏移", normalized, re.IGNORECASE)
    or re.fullmatch(r"第\s*\d+(?:\s*(?:-|–|—|~|至|到)\s*\d+)?\s*分钟", normalized)
    or re.fullmatch(r"\d+(?:\.\d+)?\s*(?:-|–|—|~|至|到)\s*\d+(?:\.\d+)?\s*(?:分钟|min|m)?", normalized, re.IGNORECASE)
    or re.fullmatch(r"\d+(?:\.\d+)?\s*(?:分钟|min|m)", normalized, re.IGNORECASE)
  )


def _time_anchor_probe_offset(start: Optional[float], end: Optional[float]) -> Optional[float]:
  if start is not None and math.isfinite(float(start)):
    return start
  if end is not None and math.isfinite(float(end)):
    return max(0.0, float(end) - 0.001)
  return None


def _find_segment_by_offset(context: Mapping[str, Any], offset_seconds: Optional[float]) -> Optional[Dict[str, Any]]:
  if offset_seconds is None or not math.isfinite(float(offset_seconds)):
    return None

  candidates: List[Dict[str, Any]] = []
  for segment in _context_segments(context):
    if not _is_playable_recording_segment(segment):
      continue
    start = _float_or_none(segment.get("startOffsetSeconds"))
    end = _float_or_none(segment.get("endOffsetSeconds"))
    duration = _float_or_none(segment.get("durationSeconds"))
    segment_anchor = segment.get("timeAnchor") if isinstance(segment.get("timeAnchor"), dict) else {}
    if start is None and isinstance(segment_anchor, dict):
      start = _float_or_none(segment_anchor.get("offsetStartSeconds"))
    if end is None and isinstance(segment_anchor, dict):
      end = _float_or_none(segment_anchor.get("offsetEndSeconds"))
    if end is None and start is not None and duration is not None:
      end = start + duration
    if start is None or end is None:
      continue
    candidates.append({**segment, "_anchorStart": start, "_anchorEnd": end})

  sorted_candidates = sorted(
    candidates,
    key=lambda item: (
      _optional_int(item.get("segmentIndex")) is None,
      _optional_int(item.get("segmentIndex")) or 0,
      float(item.get("_anchorStart") or 0),
    ),
  )
  for segment in sorted_candidates:
    start = float(segment["_anchorStart"])
    end = float(segment["_anchorEnd"])
    if start <= float(offset_seconds) < end:
      return {key: value for key, value in segment.items() if key not in {"_anchorStart", "_anchorEnd"}}

  if sorted_candidates:
    last_segment = sorted_candidates[-1]
    if math.isclose(float(offset_seconds), float(last_segment["_anchorEnd"]), abs_tol=0.001):
      return {key: value for key, value in last_segment.items() if key not in {"_anchorStart", "_anchorEnd"}}
  return None


def _is_playable_recording_segment(segment: Mapping[str, Any]) -> bool:
  upload_status = str(segment.get("uploadStatus") or segment.get("upload_status") or "").strip().lower()
  processing_status = str(segment.get("processingStatus") or segment.get("processing_status") or "").strip().lower()
  return upload_status == "uploaded" and processing_status not in {"deleted", "skipped"}


def _context_live_start_time(context: Mapping[str, Any]) -> Any:
  session = context.get("session") if isinstance(context.get("session"), dict) else {}
  return session.get("liveStartTime") if isinstance(session, dict) else None


def _format_input_time_range(item: Mapping[str, Any]) -> str:
  time_anchor = item.get("timeAnchor")
  if isinstance(time_anchor, dict):
    for key in ("displayTimeRange", "clockTimeRange", "offsetRange", "minuteRangeLabel", "segmentLabel"):
      text = str(time_anchor.get(key) or "").strip()
      if text:
        return text
  start_source = item.get("offsetStartSeconds")
  end_source = item.get("offsetEndSeconds")
  if start_source is None:
    start_source = item.get("sliceStartSeconds") if item.get("sliceStartSeconds") is not None else item.get("startOffsetSeconds")
  if end_source is None:
    end_source = item.get("sliceEndSeconds") if item.get("sliceEndSeconds") is not None else item.get("endOffsetSeconds")
  duration_source = item.get("sliceDurationSeconds") if item.get("sliceDurationSeconds") is not None else item.get("durationSeconds")
  start = _float_or_none(start_source)
  end = _float_or_none(end_source)
  duration = _float_or_none(duration_source)
  if start is not None and end is None and duration is not None:
    end = start + duration
  if start is not None and end is not None:
    return f"{_format_hhmmss(start)}-{_format_hhmmss(end)}"
  segment_index = item.get("segmentIndex")
  slice_index = item.get("sliceIndex")
  if segment_index is not None and slice_index is not None:
    return f"segment:{segment_index}/slice:{slice_index}"
  if segment_index is not None:
    return f"segment:{segment_index}"
  return ""


def _format_hhmmss(seconds: float) -> str:
  total_seconds = max(0, int(round(seconds)))
  hours = total_seconds // 3600
  minutes = (total_seconds % 3600) // 60
  remaining_seconds = total_seconds % 60
  return f"{hours:02d}:{minutes:02d}:{remaining_seconds:02d}"


def _bounded_confidence(value: Any, *, default: float) -> float:
  try:
    numeric = float(value)
  except (TypeError, ValueError):
    return default
  if numeric > 1:
    numeric = numeric / 100
  return max(0.0, min(1.0, numeric))


def _normalize_evidence_refs(value: Any) -> List[str]:
  if isinstance(value, list):
    return [str(item)[:100] for item in value if str(item or "").strip()]
  if isinstance(value, str) and value.strip():
    return [value.strip()[:100]]
  return []


def _normalize_priority(value: Any) -> str:
  normalized = str(value or "").strip().lower()
  return normalized if normalized in {"high", "medium", "low"} else "medium"


def _session_row_to_contract(row: Mapping[str, Any]) -> Dict[str, Any]:
  return {
    "sessionId": str(row.get("session_id") or ""),
    "shopId": str(row.get("shop_id") or ""),
    "shopName": str(row.get("shop_name") or ""),
    "anchorDouyinId": str(row.get("anchor_douyin_id") or ""),
    "anchorNickname": str(row.get("anchor_nickname") or ""),
    "anchorAvatar": row.get("anchor_avatar"),
    "liveStartTime": _isoformat(row.get("live_start_time")),
    "liveEndTime": _isoformat(row.get("live_end_time")),
    "liveDurationMinutes": int(row.get("live_duration_minutes") or 0),
    "liveOrderCount": int(row.get("live_order_count") or 0),
    "liveGmv": float(row.get("live_gmv") or 0),
    "liveUserPayAmount": float(row.get("live_user_pay_amount") or 0),
  }


def _minute_row_to_contract(row: Mapping[str, Any]) -> Dict[str, Any]:
  return {
    "liveMinuteTime": _isoformat(row.get("live_minute_time")),
    "minuteOffset": int(row.get("minute_offset") or 0),
    "orderCount": int(row.get("order_count") or 0),
    "matchStatus": str(row.get("match_status") or ""),
    "matchReason": row.get("match_reason"),
  }


def _segment_row_to_contract(row: Mapping[str, Any], *, display_segment_index: Optional[int] = None) -> Dict[str, Any]:
  return {
    "segmentId": str(row.get("segment_id") or ""),
    "recordingId": str(row.get("recording_id") or ""),
    "segmentIndex": int(row.get("segment_index") or 0),
    "displaySegmentIndex": display_segment_index,
    "bucket": str(row.get("bucket") or ""),
    "rawObjectKey": str(row.get("raw_object_key") or ""),
    "previewObjectKey": row.get("preview_object_key"),
    "fileName": str(row.get("file_name") or ""),
    "mimeType": row.get("mime_type"),
    "fileExt": row.get("file_ext"),
    "fileSizeBytes": row.get("file_size_bytes"),
    "sha256": row.get("sha256"),
    "durationSeconds": _float_or_none(row.get("duration_seconds")),
    "startOffsetSeconds": _float_or_none(row.get("start_offset_seconds")),
    "endOffsetSeconds": _float_or_none(row.get("end_offset_seconds")),
    "uploadStatus": str(row.get("upload_status") or ""),
    "processingStatus": str(row.get("processing_status") or ""),
    "uploadedAt": _isoformat(row.get("uploaded_at")),
  }


def _normalize_analysis_profile(value: Any) -> str:
  normalized = str(value or DEFAULT_ANALYSIS_PROFILE).strip().lower()
  if normalized not in SUPPORTED_ANALYSIS_PROFILES:
    return DEFAULT_ANALYSIS_PROFILE
  return normalized


def _resolve_requested_model(value: Any, default_model: str) -> str:
  requested = str(value or "").strip()
  if not requested or requested == "douyin-live-recording-v4":
    return default_model
  return requested


def _fallback_model_for_failed_claim(job: Mapping[str, Any]) -> str:
  requested = str(job.get("model") or "").strip()
  if requested and requested != "douyin-live-recording-v4":
    return requested
  return (
    os.getenv("DOUYIN_LIVE_ANALYSIS_MODEL")
    or os.getenv("ARK_CONTENT_ANALYSIS_MODEL")
    or DEFAULT_ARK_CONTENT_ANALYSIS_MODEL
  ).strip()


def _isoformat(value: Any) -> Optional[str]:
  if value is None:
    return None
  if isinstance(value, datetime):
    return value.isoformat()
  return str(value)


def _float_or_none(value: Any) -> Optional[float]:
  if value is None:
    return None
  try:
    return float(value)
  except (TypeError, ValueError):
    return None


def _env_bool(name: str, default: bool) -> bool:
  raw = (os.getenv(name) or "").strip().lower()
  if not raw:
    return default
  return raw in {"1", "true", "yes", "y", "on"}


def _env_float(name: str, default: float) -> float:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    return float(raw)
  except ValueError as error:
    raise RuntimeError(f"{name} 必须是数字") from error


def _env_choice(name: str, default: str, choices: set[str]) -> str:
  raw = (os.getenv(name) or default).strip()
  if raw not in choices:
    raise RuntimeError(f"{name} 必须是以下取值之一: {', '.join(sorted(choices))}")
  return raw


def _redact_sensitive(text: str, api_key: str) -> str:
  redacted = text or ""
  if api_key:
    redacted = redacted.replace(api_key, "***")
  redacted = re.sub(r"(X-Amz-Credential=)[^&\"'\s]+", r"\1<redacted>", redacted)
  redacted = re.sub(r"(X-Amz-Signature=)[^&\"'\s]+", r"\1<redacted>", redacted)
  redacted = re.sub(r"(X-Amz-Security-Token=)[^&\"'\s]+", r"\1<redacted>", redacted)
  redacted = re.sub(r"(Bearer\s+)[A-Za-z0-9._\-]+", r"\1<redacted>", redacted)
  return redacted
