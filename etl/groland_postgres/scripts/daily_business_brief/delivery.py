from __future__ import annotations

import json
import re
from typing import Any, Callable, Mapping

import requests

from .models import DeliveryOutcome, DeliveryStatus


URL_PATTERN = re.compile(r"https?://[^\s\]>)\"']+", re.IGNORECASE)
MAX_ERROR_CODE_LENGTH = 80
MAX_ERROR_DETAIL_LENGTH = 500


def sanitize_error(value: Any, *, max_length: int = MAX_ERROR_DETAIL_LENGTH) -> str:
  text = " ".join(str(value or "").split())
  redacted = URL_PATTERN.sub("[redacted-url]", text)
  return redacted[:max_length]


class FeishuWebhookSender:
  def __init__(
    self,
    *,
    timeout_seconds: float = 10.0,
    post: Callable[..., Any] = requests.post,
  ):
    self.timeout_seconds = timeout_seconds
    self._post = post

  def send(self, webhook_url: str, card: Mapping[str, Any]) -> DeliveryOutcome:
    try:
      response = self._post(
        webhook_url,
        json=card,
        timeout=self.timeout_seconds,
      )
    except requests.RequestException as error:
      return DeliveryOutcome(
        status=DeliveryStatus.UNCERTAIN,
        error_code=error.__class__.__name__[:MAX_ERROR_CODE_LENGTH],
        error_detail=sanitize_error(error),
      )
    except Exception as error:
      return DeliveryOutcome(
        status=DeliveryStatus.UNCERTAIN,
        error_code="unexpected_request_error",
        error_detail=sanitize_error(error),
      )

    status_code = int(getattr(response, "status_code", 0) or 0)
    if status_code <= 0 or status_code >= 500:
      return DeliveryOutcome(
        status=DeliveryStatus.UNCERTAIN,
        error_code=f"http_{status_code}"[:MAX_ERROR_CODE_LENGTH],
        error_detail=sanitize_error(getattr(response, "text", "")),
      )
    if status_code < 200 or status_code >= 300:
      return DeliveryOutcome(
        status=DeliveryStatus.FAILED,
        error_code=f"http_{status_code}"[:MAX_ERROR_CODE_LENGTH],
        error_detail=sanitize_error(getattr(response, "text", "")),
      )

    try:
      payload = response.json()
    except (ValueError, json.JSONDecodeError) as error:
      return DeliveryOutcome(
        status=DeliveryStatus.UNCERTAIN,
        error_code="invalid_success_response",
        error_detail=sanitize_error(error),
      )

    if not isinstance(payload, Mapping):
      return DeliveryOutcome(
        status=DeliveryStatus.UNCERTAIN,
        error_code="invalid_success_response",
        error_detail="webhook response body was not an object",
      )

    code = payload.get("code")
    if code is None:
      code = payload.get("StatusCode", payload.get("status_code"))
    if code in (0, "0"):
      return DeliveryOutcome(status=DeliveryStatus.SENT)

    detail = payload.get("msg")
    if detail is None:
      detail = payload.get("StatusMessage", payload.get("message", payload))
    return DeliveryOutcome(
      status=DeliveryStatus.FAILED,
      error_code=sanitize_error(code, max_length=MAX_ERROR_CODE_LENGTH) or "feishu_error",
      error_detail=sanitize_error(detail),
    )
