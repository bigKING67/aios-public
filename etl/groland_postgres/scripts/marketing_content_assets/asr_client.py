from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, List

import requests


DEFAULT_ARK_RESPONSES_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/responses"
DEFAULT_TRANSCRIPT_MODEL = "doubao-seed-2-0-lite-260428"


class TranscriptError(RuntimeError):
  pass


@dataclass(frozen=True)
class TranscriptConfig:
  provider: str
  api_key: str
  base_url: str
  model: str
  timeout_seconds: int
  max_output_tokens: int
  fps: float
  temperature: float
  store_response: bool
  json_schema_strict: bool

  @classmethod
  def from_env(cls) -> "TranscriptConfig":
    provider = (os.getenv("CONTENT_ASSET_TRANSCRIPT_PROVIDER") or "ark_video").strip().lower()
    if provider != "ark_video":
      raise TranscriptError("CONTENT_ASSET_TRANSCRIPT_PROVIDER 当前支持 ark_video")
    api_key = (
      os.getenv("ARK_API_KEY")
      or os.getenv("VOLCENGINE_ARK_API_KEY")
      or os.getenv("ARK_ACCESS_TOKEN")
      or ""
    ).strip()
    if not api_key:
      raise TranscriptError("缺少 ARK_API_KEY，无法生成视频脚本/SRT")
    return cls(
      provider=provider,
      api_key=api_key,
      base_url=(os.getenv("ARK_RESPONSES_BASE_URL") or DEFAULT_ARK_RESPONSES_BASE_URL).strip(),
      model=(
        os.getenv("CONTENT_ASSET_TRANSCRIPT_MODEL")
        or os.getenv("ARK_CONTENT_ANALYSIS_MODEL")
        or DEFAULT_TRANSCRIPT_MODEL
      ).strip(),
      timeout_seconds=_env_int("CONTENT_ASSET_TRANSCRIPT_TIMEOUT_SECONDS", 300),
      max_output_tokens=_env_int("CONTENT_ASSET_TRANSCRIPT_MAX_OUTPUT_TOKENS", 12000),
      fps=_env_float("CONTENT_ASSET_TRANSCRIPT_VIDEO_FPS", 0.2),
      temperature=_env_float("CONTENT_ASSET_TRANSCRIPT_TEMPERATURE", 0.0),
      store_response=_env_bool("CONTENT_ASSET_TRANSCRIPT_STORE_RESPONSE", False),
      json_schema_strict=_env_bool("CONTENT_ASSET_TRANSCRIPT_JSON_SCHEMA_STRICT", True),
    )

  def request_settings(self) -> Dict[str, Any]:
    return {
      "provider": self.provider,
      "max_output_tokens": self.max_output_tokens,
      "fps": self.fps,
      "temperature": self.temperature,
      "store_response": self.store_response,
      "json_schema_strict": self.json_schema_strict,
    }


@dataclass(frozen=True)
class TranscriptResult:
  provider: str
  model: str
  language: str
  transcript_text: str
  script_text: str
  srt_text: str
  segments: List[Dict[str, Any]]
  confidence: float | None
  raw_response: Dict[str, Any]
  request_settings: Dict[str, Any]

  @property
  def response_id(self) -> str:
    return str(self.raw_response.get("id") or "")

  @property
  def usage(self) -> Dict[str, Any]:
    usage = self.raw_response.get("usage")
    return usage if isinstance(usage, dict) else {}


class ArkVideoTranscriptClient:
  def __init__(self, config: TranscriptConfig):
    self.config = config
    self.session = requests.Session()

  def transcribe_video(self, video_url: str, *, asset_context: Dict[str, Any]) -> TranscriptResult:
    prompt = build_transcript_prompt(asset_context)
    payload: Dict[str, Any] = {
      "model": self.config.model,
      "input": [
        {
          "role": "user",
          "content": [
            {
              "type": "input_video",
              "video_url": video_url,
              "fps": _bounded_fps(self.config.fps),
            },
            {"type": "input_text", "text": prompt},
          ],
        }
      ],
      "max_output_tokens": self.config.max_output_tokens,
      "thinking": {"type": "disabled"},
      "temperature": self.config.temperature,
      "store": self.config.store_response,
    }
    if self.config.json_schema_strict:
      payload["text"] = {
        "format": {
          "type": "json_schema",
          "name": "content_asset_video_transcript",
          "strict": True,
          "schema": transcript_json_schema(),
        }
      }
    response = self._post(payload)
    output_text = extract_output_text(response)
    parsed = parse_transcript_json(output_text)
    segments = normalize_segments(
      parsed.get("segments"),
      duration_seconds=asset_context.get("durationSeconds"),
    )
    transcript_text = normalize_text(parsed.get("transcript_text")) or segments_to_text(segments)
    script_text = normalize_script_text(parsed.get("script_text"), transcript_text, segments)
    srt_text = segments_to_srt(segments)
    confidence = normalize_confidence(parsed.get("confidence"))
    return TranscriptResult(
      provider="ark_video",
      model=self.config.model,
      language=normalize_text(parsed.get("language")) or "zh",
      transcript_text=transcript_text,
      script_text=script_text,
      srt_text=srt_text,
      segments=segments,
      confidence=confidence,
      raw_response=response,
      request_settings=self.config.request_settings(),
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
      raise TranscriptError(
        f"Ark 视频脚本生成失败 HTTP {response.status_code}: {_redact_sensitive(response.text)[:800]}"
      )
    try:
      payload = response.json()
    except json.JSONDecodeError as error:
      raise TranscriptError(f"Ark 视频脚本返回非 JSON: {_redact_sensitive(response.text)[:800]}") from error
    if not isinstance(payload, dict):
      raise TranscriptError("Ark 视频脚本返回结构不是对象")
    return payload


def build_transcript_prompt(asset_context: Dict[str, Any]) -> str:
  context_json = json.dumps(asset_context, ensure_ascii=False, indent=2)
  return f"""你是 Groland 内容素材中台的视频口播脚本转写助手。请专注识别视频中的中文口播、可见字幕和屏幕文字，输出可入库的结构化 JSON。

业务档案：
{context_json}

要求：
1. transcript_text 保留尽可能完整的原始口播/字幕内容，补必要标点，不要主观改写。
2. script_text 是纯脚本文案：去掉明显口水词、按自然段换行，但不能改变原意、不能编造视频中没有的卖点。
3. segments 必须按时间顺序输出，start_ms/end_ms 使用毫秒整数；例如 2 秒写 2000、5 秒写 5000，禁止把秒数 2/5 直接填进 *_ms。
4. 不要输出 Markdown，不要代码块，只返回合法 JSON 对象。
5. srt_text 不需要输出，系统会根据 segments 生成 SRT 字幕格式文本。
"""


def transcript_json_schema() -> Dict[str, Any]:
  return {
    "type": "object",
    "additionalProperties": False,
    "required": ["language", "transcript_text", "script_text", "segments", "confidence"],
    "properties": {
      "language": {"type": "string"},
      "transcript_text": {"type": "string"},
      "script_text": {"type": "string"},
      "segments": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": False,
          "required": ["index", "start_ms", "end_ms", "text", "confidence"],
          "properties": {
            "index": {"type": "integer"},
            "start_ms": {"type": "integer"},
            "end_ms": {"type": "integer"},
            "text": {"type": "string"},
            "confidence": {"type": "number"},
          },
        },
      },
      "confidence": {"type": "number"},
    },
  }


def extract_output_text(payload: Dict[str, Any]) -> str:
  direct = payload.get("output_text")
  if isinstance(direct, str) and direct.strip():
    return direct.strip()
  parts: List[str] = []

  def visit(value: Any) -> None:
    if isinstance(value, dict):
      item_type = str(value.get("type") or "")
      text = value.get("text")
      if item_type in {"output_text", "text"} and isinstance(text, str):
        parts.append(text)
        return
      for child in value.values():
        visit(child)
    elif isinstance(value, list):
      for item in value:
        visit(item)

  visit(payload.get("output"))
  text = "\n".join(part.strip() for part in parts if part.strip()).strip()
  if not text:
    raise TranscriptError("Ark 视频脚本返回中未找到 output_text")
  return text


def parse_transcript_json(text: str) -> Dict[str, Any]:
  raw = text.strip()
  if raw.startswith("```"):
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
  start = raw.find("{")
  end = raw.rfind("}")
  if start >= 0 and end > start:
    raw = raw[start : end + 1]
  try:
    value = json.loads(raw)
  except json.JSONDecodeError as error:
    raise TranscriptError(f"Ark 视频脚本不是合法 JSON: {text[:800]}") from error
  if not isinstance(value, dict):
    raise TranscriptError("Ark 视频脚本 JSON 顶层必须是对象")
  return value


def normalize_segments(value: Any, *, duration_seconds: Any = None) -> List[Dict[str, Any]]:
  if not isinstance(value, list):
    return []
  time_scale = infer_segment_time_scale(value, duration_seconds=duration_seconds)
  normalized: List[Dict[str, Any]] = []
  last_end = 0
  for position, item in enumerate(value, start=1):
    if not isinstance(item, dict):
      continue
    text = normalize_text(item.get("text"))
    if not text:
      continue
    start_ms = normalize_segment_ms(item.get("start_ms"), last_end, time_scale)
    end_ms = normalize_segment_ms(item.get("end_ms"), start_ms + 1000, time_scale)
    if end_ms <= start_ms:
      end_ms = start_ms + 1000
    confidence = normalize_confidence(item.get("confidence"))
    segment = {
      "index": normalize_int(item.get("index"), position),
      "start_ms": start_ms,
      "end_ms": end_ms,
      "text": text,
      "confidence": confidence if confidence is not None else 0.0,
    }
    normalized.append(segment)
    last_end = end_ms
  return normalized


def infer_segment_time_scale(value: Any, *, duration_seconds: Any = None) -> int:
  """当模型把秒值填进 start_ms/end_ms 时返回 1000。"""
  if not isinstance(value, list):
    return 1
  raw_values: List[float] = []
  raw_durations: List[float] = []
  for item in value:
    if not isinstance(item, dict):
      continue
    start = parse_number(item.get("start_ms"))
    end = parse_number(item.get("end_ms"))
    if start is not None and start >= 0:
      raw_values.append(start)
    if end is not None and end >= 0:
      raw_values.append(end)
    if start is not None and end is not None and end > start:
      raw_durations.append(end - start)
  if not raw_values:
    return 1

  max_value = max(raw_values)
  if max_value <= 0:
    return 1

  duration = parse_positive_number(duration_seconds)
  median_duration = median_positive(raw_durations)
  if duration is not None:
    duration_limit = max(duration * 1.25, duration + 2.0)
    if max_value <= duration_limit:
      if median_duration is None and max_value <= 600:
        return 1000
      if median_duration is not None and 0.25 <= median_duration <= 120:
        return 1000
      if max_value <= 600 and max_value >= max(1.0, duration * 0.5):
        return 1000

  if max_value <= 600 and median_duration is not None and 0.25 <= median_duration <= 30:
    return 1000
  return 1


def normalize_text(value: Any) -> str:
  if not isinstance(value, str):
    return ""
  return re.sub(r"[ \t]+", " ", value).strip()


def normalize_script_text(value: Any, transcript_text: str, segments: List[Dict[str, Any]]) -> str:
  script = normalize_text(value)
  if script:
    return script
  if transcript_text:
    return transcript_text
  return segments_to_text(segments)


def segments_to_text(segments: List[Dict[str, Any]]) -> str:
  return "\n".join(str(segment.get("text") or "").strip() for segment in segments if segment.get("text")).strip()


def segments_to_srt(segments: List[Dict[str, Any]]) -> str:
  blocks: List[str] = []
  for position, segment in enumerate(segments, start=1):
    text = str(segment.get("text") or "").strip()
    if not text:
      continue
    start_ms = normalize_ms(segment.get("start_ms"), 0)
    end_ms = normalize_ms(segment.get("end_ms"), start_ms + 1000)
    if end_ms <= start_ms:
      end_ms = start_ms + 1000
    blocks.append(f"{position}\n{format_srt_timestamp(start_ms)} --> {format_srt_timestamp(end_ms)}\n{text}")
  return "\n\n".join(blocks)


def format_srt_timestamp(total_ms: int) -> str:
  total_ms = max(0, int(total_ms))
  milliseconds = total_ms % 1000
  total_seconds = total_ms // 1000
  seconds = total_seconds % 60
  total_minutes = total_seconds // 60
  minutes = total_minutes % 60
  hours = total_minutes // 60
  return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def normalize_int(value: Any, default: int) -> int:
  number = parse_number(value)
  if number is None:
    return default
  return int(number)


def normalize_ms(value: Any, default: int) -> int:
  return normalize_segment_ms(value, default, 1)


def normalize_segment_ms(value: Any, default: int, time_scale: int) -> int:
  number = parse_number(value)
  if number is None:
    return max(0, int(default))
  return max(0, int(round(number * time_scale)))


def parse_number(value: Any) -> float | None:
  if isinstance(value, bool):
    return None
  if isinstance(value, (int, float, Decimal)):
    number = float(value)
  elif isinstance(value, str):
    raw = value.strip().replace(",", "")
    if not raw:
      return None
    try:
      number = float(raw)
    except ValueError:
      return None
  else:
    return None
  if not math.isfinite(number):
    return None
  return number


def parse_positive_number(value: Any) -> float | None:
  number = parse_number(value)
  if number is None or number <= 0:
    return None
  return number


def median_positive(values: List[float]) -> float | None:
  positive_values = sorted(value for value in values if value > 0)
  if not positive_values:
    return None
  midpoint = len(positive_values) // 2
  if len(positive_values) % 2 == 1:
    return positive_values[midpoint]
  return (positive_values[midpoint - 1] + positive_values[midpoint]) / 2


def normalize_confidence(value: Any) -> float | None:
  try:
    score = float(value)
  except (TypeError, ValueError):
    return None
  return max(0.0, min(1.0, score))


def transcript_excerpt(script_text: str, limit: int = 240) -> str:
  value = re.sub(r"\s+", " ", script_text).strip()
  return value[:limit]


def word_count(text: str) -> int:
  compact = re.sub(r"\s+", "", text)
  return len(compact)


def _env_int(name: str, default: int) -> int:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    return int(raw)
  except ValueError as error:
    raise TranscriptError(f"{name} 必须是整数") from error


def _env_float(name: str, default: float) -> float:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    return float(raw)
  except ValueError as error:
    raise TranscriptError(f"{name} 必须是数字") from error


def _env_bool(name: str, default: bool) -> bool:
  raw = (os.getenv(name) or "").strip().lower()
  if not raw:
    return default
  if raw in {"1", "true", "yes", "y", "on"}:
    return True
  if raw in {"0", "false", "no", "n", "off"}:
    return False
  raise TranscriptError(f"{name} 必须是布尔值")


def _bounded_fps(value: float) -> float:
  if value < 0.2 or value > 5:
    raise TranscriptError("脚本抽取视频 fps 必须在 0.2 到 5 之间")
  return value


def _redact_sensitive(value: str) -> str:
  redacted = re.sub(r"(X-Amz-Credential=)[^&\"'\\s]+", r"\1<redacted>", value)
  redacted = re.sub(r"(X-Amz-Signature=)[^&\"'\\s]+", r"\1<redacted>", redacted)
  redacted = re.sub(r"(X-Amz-Security-Token=)[^&\"'\\s]+", r"\1<redacted>", redacted)
  redacted = re.sub(r"(Bearer\\s+)[A-Za-z0-9._\\-]+", r"\1<redacted>", redacted)
  return redacted
