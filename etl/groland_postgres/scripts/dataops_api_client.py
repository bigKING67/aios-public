from __future__ import annotations

import json
import os
from typing import Any, Dict, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def normalize_access_token(raw_token: str) -> str:
  normalized = raw_token.strip()
  if normalized.lower().startswith("bearer "):
    normalized = normalized[7:].strip()
  return normalized


def resolve_dataops_api_base() -> str:
  explicit = (os.getenv("DATAOPS_API_BASE") or "").strip()
  if explicit:
    return explicit.rstrip("/")
  return "http://127.0.0.1:8000/v1/dataops"


def resolve_auth_api_base() -> str:
  raw_base = os.getenv("AUTH_API_BASE") or "http://127.0.0.1:8000/v1"
  return raw_base.strip().rstrip("/")


def resolve_http_timeout_seconds() -> int:
  raw = (os.getenv("DATAOPS_HTTP_TIMEOUT_SEC") or "20").strip()
  try:
    parsed = int(raw)
  except ValueError:
    return 20
  return parsed if parsed > 0 else 20


def http_post_json(
  url: str,
  payload: Dict[str, Any],
  headers: Dict[str, str] | None = None,
  timeout_seconds: int = 20,
  user_agent: str = "AIOS-Prefect-Automation/1.0",
) -> Tuple[int, Dict[str, Any], str]:
  request_headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json",
    "User-Agent": user_agent,
  }
  if headers:
    request_headers.update(headers)

  request = Request(
    url,
    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    headers=request_headers,
    method="POST",
  )

  try:
    with urlopen(request, timeout=timeout_seconds) as response:
      status_code = int(getattr(response, "status", 200) or 200)
      body_text = response.read().decode("utf-8")
  except HTTPError as error:
    status_code = int(getattr(error, "code", 500) or 500)
    body_text = error.read().decode("utf-8", errors="replace")
  except URLError as error:
    raise RuntimeError(f"HTTP request failed: {error}") from error

  parsed_body: Dict[str, Any] = {}
  if body_text.strip():
    try:
      maybe_obj = json.loads(body_text)
      if isinstance(maybe_obj, dict):
        parsed_body = maybe_obj
    except json.JSONDecodeError:
      parsed_body = {}

  return status_code, parsed_body, body_text
