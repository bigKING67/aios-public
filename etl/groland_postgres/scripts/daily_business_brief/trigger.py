from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict

from dataops_api_client import (
  http_post_json,
  normalize_access_token,
  resolve_auth_api_base,
  resolve_dataops_api_base,
  resolve_http_timeout_seconds,
)


@dataclass(frozen=True)
class DailyBriefTriggerResult:
  status: str
  flow_run_id: str = ""
  flow_run_name: str = ""
  message: str = ""

  def to_dict(self) -> Dict[str, str]:
    return {
      "status": self.status,
      "flowRunId": self.flow_run_id,
      "flowRunName": self.flow_run_name,
      "message": self.message,
    }


def _response_message(body: Dict[str, Any], raw_text: str) -> str:
  message = str(body.get("message") or "").strip()
  if message:
    return message[:500]
  return raw_text.strip()[:500]


def resolve_daily_brief_trigger_token() -> str:
  direct_token = normalize_access_token((os.getenv("DATAOPS_SCAN_TOKEN") or "").strip())
  if direct_token:
    return direct_token

  username = (os.getenv("DATAOPS_SCAN_USERNAME") or "").strip()
  password = (os.getenv("DATAOPS_SCAN_PASSWORD") or "").strip()
  if not username or not password:
    raise RuntimeError(
      "Missing DataOps automation credentials. Provide DATAOPS_SCAN_TOKEN or "
      "DATAOPS_SCAN_USERNAME + DATAOPS_SCAN_PASSWORD."
    )

  status_code, body, raw_text = http_post_json(
    f"{resolve_auth_api_base()}/auth/login",
    {"username": username, "password": password},
    timeout_seconds=resolve_http_timeout_seconds(),
    user_agent="AIOS-Prefect-Daily-Brief/1.0",
  )
  if status_code != 200:
    raise RuntimeError(
      "DataOps automation login failed "
      f"with status={status_code}, message={_response_message(body, raw_text)}"
    )

  access_token = normalize_access_token(str(body.get("access_token") or ""))
  if not access_token:
    raise RuntimeError("DataOps automation login response missing access_token")
  return access_token


def request_daily_brief_trigger(
  *,
  target_date: date,
  access_token: str | None = None,
) -> DailyBriefTriggerResult:
  normalized_token = normalize_access_token(access_token or "")
  if not normalized_token:
    normalized_token = resolve_daily_brief_trigger_token()

  status_code, body, raw_text = http_post_json(
    f"{resolve_dataops_api_base()}/actions",
    {
      "action": "trigger_pipeline",
      "pipelineId": "daily_business_brief",
      "batchExecution": False,
      "parameters": {
        "target_date": target_date.isoformat(),
        "delivery_mode": "production",
        "production_confirmed": True,
      },
    },
    headers={"Authorization": f"Bearer {normalized_token}"},
    timeout_seconds=resolve_http_timeout_seconds(),
    user_agent="AIOS-Prefect-Daily-Brief/1.0",
  )

  message = _response_message(body, raw_text)
  if status_code == 409:
    return DailyBriefTriggerResult(status="deduplicated", message=message)
  if status_code != 200 or body.get("success") is not True:
    raise RuntimeError(
      "Daily brief DataOps trigger failed "
      f"with status={status_code}, message={message or 'empty response'}"
    )

  flow_run_id = str(body.get("flowRunId") or "").strip()
  flow_run_name = str(body.get("flowRunName") or "").strip()
  if not flow_run_id and not flow_run_name:
    raise RuntimeError("Daily brief DataOps trigger response omitted flow run identity")
  return DailyBriefTriggerResult(
    status="created",
    flow_run_id=flow_run_id,
    flow_run_name=flow_run_name,
    message=message,
  )
