from __future__ import annotations

import json
import re
from typing import Any, Dict

from marketing_content_assets.ark_responses import ArkResponsesError, parse_analysis_json


def parse_live_analysis_json(text: str) -> Dict[str, Any]:
  """Parse the model response with bounded repairs for common JSON drift."""
  try:
    return parse_analysis_json(text)
  except ArkResponsesError as original_error:
    raw = _extract_first_json_object(text)
    if not raw:
      raise original_error
    stripped = _strip_trailing_json_commas(raw)
    candidates = [raw, stripped, _insert_missing_json_commas(stripped)]
    for candidate in candidates:
      try:
        value = json.loads(candidate, strict=False)
      except json.JSONDecodeError:
        continue
      if isinstance(value, dict):
        return value
      raise ArkResponsesError("Ark 分析结果 JSON 顶层必须是对象") from original_error
    raise _live_json_parse_error(raw, original_error)


def _extract_first_json_object(text: str) -> str:
  raw = text.strip()
  if raw.startswith("```"):
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
  start = raw.find("{")
  if start < 0:
    return ""
  depth = 0
  in_string = False
  escaped = False
  for index in range(start, len(raw)):
    char = raw[index]
    if in_string:
      if escaped:
        escaped = False
      elif char == "\\":
        escaped = True
      elif char == '"':
        in_string = False
      continue
    if char == '"':
      in_string = True
    elif char == "{":
      depth += 1
    elif char == "}":
      depth -= 1
      if depth == 0:
        return raw[start : index + 1]
  end = raw.rfind("}")
  if end > start:
    return raw[start : end + 1]
  return raw[start:]


def _strip_trailing_json_commas(raw: str) -> str:
  return re.sub(r",\s*([}\]])", r"\1", raw)


def _insert_missing_json_commas(raw: str) -> str:
  repaired = re.sub(
    r'("|\d|\}|\])\s*\n(\s*"[\w-]{1,80}"\s*:)',
    r"\1,\n\2",
    raw,
  )
  repaired = re.sub(
    r"\b(true|false|null)\s*\n(\s*\"[\w-]{1,80}\"\s*:)",
    r"\1,\n\2",
    repaired,
  )
  repaired = re.sub(
    r"(\}|\])\s*\n(\s*\{)",
    r"\1,\n\2",
    repaired,
  )
  return repaired


def _live_json_parse_error(raw: str, original_error: ArkResponsesError) -> ArkResponsesError:
  try:
    json.loads(_insert_missing_json_commas(_strip_trailing_json_commas(raw)), strict=False)
  except json.JSONDecodeError as error:
    start = max(0, error.pos - 240)
    end = min(len(raw), error.pos + 240)
    around = raw[start:end].replace("\n", "\\n")
    return ArkResponsesError(
      f"Ark 分析结果不是合法 JSON: {str(original_error)[:400]}；"
      f"decode_error=line {error.lineno}, column {error.colno}, pos {error.pos}; around={around}"
    )
  return original_error
