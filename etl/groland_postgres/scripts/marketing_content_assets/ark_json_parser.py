from __future__ import annotations

import json
import re
from typing import Any


def parse_analysis_json(
  text: str,
  error_type: type[RuntimeError],
) -> dict[str, Any]:
  raw = text.strip()
  if raw.startswith("```"):
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
  start = raw.find("{")
  end = raw.rfind("}")
  if start >= 0 and end > start:
    raw = raw[start : end + 1]
  value, error = _parse_json_object_candidate(raw)
  if value is None:
    repaired = _repair_analysis_json_text(raw)
    value, repaired_error = _parse_json_object_candidate(repaired)
    if value is None:
      raise error_type(f"Ark 分析结果不是合法 JSON: {text[:800]}") from (repaired_error or error)
  if not isinstance(value, dict):
    raise error_type("Ark 分析结果 JSON 顶层必须是对象")
  return value


def _parse_json_object_candidate(raw: str) -> tuple[Any | None, json.JSONDecodeError | None]:
  try:
    return json.loads(raw), None
  except json.JSONDecodeError as error:
    try:
      value, _ = json.JSONDecoder().raw_decode(raw)
      return value, None
    except json.JSONDecodeError:
      return None, error


def _repair_analysis_json_text(raw: str) -> str:
  repaired = _drop_unmatched_json_closers(raw)
  repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
  return repaired


def _drop_unmatched_json_closers(raw: str) -> str:
  stack: list[str] = []
  output: list[str] = []
  in_string = False
  escaped = False
  last_content_index = max((index for index, char in enumerate(raw) if not char.isspace()), default=-1)
  opening = {"{": "}", "[": "]"}
  closing = {"}": "{", "]": "["}

  for index, char in enumerate(raw):
    if in_string:
      if escaped:
        output.append(char)
        escaped = False
      elif char == "\\":
        output.append(char)
        escaped = True
      elif char == '"':
        output.append(char)
        in_string = False
      elif char == "\n":
        output.append("\\n")
      elif char == "\r":
        output.append("\\r")
      elif char == "\t":
        output.append("\\t")
      elif ord(char) < 32:
        output.append(f"\\u{ord(char):04x}")
      else:
        output.append(char)
      continue

    if char == '"':
      in_string = True
      output.append(char)
      continue
    if char in opening:
      stack.append(char)
      output.append(char)
      continue
    if char in closing:
      if stack and stack[-1] == closing[char]:
        if stack == ["{"] and index < last_content_index:
          continue
        stack.pop()
        output.append(char)
      continue
    output.append(char)

  if in_string:
    if escaped:
      output.append("\\")
    output.append('"')
  while stack:
    output.append(opening[stack.pop()])
  return "".join(output)
