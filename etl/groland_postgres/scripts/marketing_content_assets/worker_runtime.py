from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any


def load_env_file(path: Path) -> None:
  if not path.exists():
    return
  for raw_line in path.read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    key, value = line.split("=", 1)
    key = key.strip()
    value = value.strip().strip('"').strip("'")
    if key and key not in os.environ:
      os.environ[key] = value


def env_int(name: str, default: int) -> int:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    return int(raw)
  except ValueError as error:
    raise RuntimeError(f"{name} 必须是整数") from error


def job_metadata(job: dict[str, Any]) -> dict[str, Any]:
  metadata = job.get("metadata")
  return metadata if isinstance(metadata, dict) else {}


def update_processing_job_stage(
  conn: Any,
  job_id: Any,
  stage: str,
  label: str,
  progress_percent: int,
  extra: dict[str, Any] | None = None,
) -> None:
  progress_percent = max(0, min(100, int(progress_percent)))
  payload = json.dumps(json_safe(extra or {}), ensure_ascii=False)
  with conn.cursor() as cur:
    cur.execute(
      """
      UPDATE ads.marketing_content_asset_processing_jobs
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'processing_stage', %s,
            'processing_stage_label', %s,
            'processing_progress_percent', %s,
            'processing_stage_updated_at', CURRENT_TIMESTAMP::TEXT,
            'processing_stage_extra', %s::jsonb
          )
      WHERE job_id = %s
      """,
      (stage, label, progress_percent, payload, str(job_id)),
    )
  conn.commit()


def classify_processing_error(error_message: str) -> dict[str, str]:
  text = error_message or ""
  lower = text.lower()
  if "analysis_proxy 仍超过目标大小" in text:
    return {
      "category": "video_too_large",
      "label": "视频过长或体积过大",
      "helper": "建议换成正常短视频素材；长宣传片可不做 AI 分析或脚本抽取。",
    }
  if "setlimitexceeded" in lower or "http 429" in lower or "rate limit" in lower:
    return {
      "category": "model_rate_limited",
      "label": "模型服务限流",
      "helper": "稍后重试；若持续出现，需要检查 Ark 调用额度或并发。",
    }
  if (
    "accountoverdueerror" in lower
    or "safe experience mode" in lower
    or "overdue balance" in lower
    or "model service has been paused" in lower
  ):
    return {
      "category": "model_quota_blocked",
      "label": "模型服务额度不可用",
      "helper": "需要处理 Ark 账户额度或安全体验模式限制后再重试。",
    }
  if "不是合法 json" in text or "invalid json" in lower or "缺少 summary" in text or "缺少 script_text" in text:
    return {
      "category": "model_output_invalid",
      "label": "模型结果格式异常",
      "helper": "可重试；若同一素材反复失败，需要检查提示词或模型输出约束。",
    }
  if "视频处理失败" in text or "ffmpeg" in lower or "ffprobe" in lower:
    return {
      "category": "video_processing_failed",
      "label": "视频处理失败",
      "helper": "请确认视频文件可读、编码正常，必要时重新上传源视频。",
    }
  return {
    "category": "unknown",
    "label": "处理失败",
    "helper": "查看技术错误后重试；若反复失败再交给技术排查。",
  }


def decimal_or_none(value: Any) -> Decimal | None:
  if value is None:
    return None
  try:
    return Decimal(str(value))
  except Exception:  # noqa: BLE001
    return None


def json_safe(value: Any) -> Any:
  if isinstance(value, uuid.UUID):
    return str(value)
  if isinstance(value, Decimal):
    return float(value)
  if isinstance(value, datetime):
    return value.isoformat()
  if isinstance(value, dict):
    return {str(key): json_safe(child) for key, child in value.items()}
  if isinstance(value, list):
    return [json_safe(item) for item in value]
  return value
