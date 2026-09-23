from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest


ETL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_ROOT / "scripts"))

from daily_business_brief import trigger  # noqa: E402


def test_resolve_trigger_token_uses_existing_automation_token() -> None:
  with (
    patch.dict(
      os.environ,
      {"DATAOPS_SCAN_TOKEN": " Bearer current-token "},
      clear=True,
    ),
    patch.object(trigger, "http_post_json") as http_post_json,
  ):
    access_token = trigger.resolve_daily_brief_trigger_token()

  assert access_token == "current-token"
  http_post_json.assert_not_called()


def test_resolve_trigger_token_logs_in_with_existing_automation_identity() -> None:
  with (
    patch.dict(
      os.environ,
      {
        "DATAOPS_SCAN_USERNAME": "automation-user",
        "DATAOPS_SCAN_PASSWORD": "automation-password",
        "AUTH_API_BASE": "http://aios.internal/v1/",
      },
      clear=True,
    ),
    patch.object(
      trigger,
      "http_post_json",
      return_value=(200, {"access_token": "Bearer issued-token"}, ""),
    ) as http_post_json,
  ):
    access_token = trigger.resolve_daily_brief_trigger_token()

  assert access_token == "issued-token"
  http_post_json.assert_called_once_with(
    "http://aios.internal/v1/auth/login",
    {"username": "automation-user", "password": "automation-password"},
    timeout_seconds=20,
    user_agent="AIOS-Prefect-Daily-Brief/1.0",
  )


def test_resolve_trigger_token_rejects_missing_service_identity() -> None:
  with (
    patch.dict(os.environ, {}, clear=True),
    patch.object(trigger, "http_post_json") as http_post_json,
  ):
    with pytest.raises(RuntimeError, match="Missing DataOps automation credentials"):
      trigger.resolve_daily_brief_trigger_token()

  http_post_json.assert_not_called()


def test_request_trigger_posts_guarded_production_parameters_once() -> None:
  with (
    patch.dict(
      os.environ,
      {"DATAOPS_API_BASE": "http://aios.internal/v1/dataops/"},
      clear=True,
    ),
    patch.object(
      trigger,
      "http_post_json",
      return_value=(
        200,
        {
          "success": True,
          "flowRunId": "run-id",
          "flowRunName": "run-name",
          "message": "created",
        },
        "",
      ),
    ) as http_post_json,
  ):
    result = trigger.request_daily_brief_trigger(
      target_date=date(2026, 8, 30),
      access_token="Bearer guarded-token",
    )

  assert result.status == "created"
  assert result.flow_run_id == "run-id"
  http_post_json.assert_called_once_with(
    "http://aios.internal/v1/dataops/actions",
    {
      "action": "trigger_pipeline",
      "pipelineId": "daily_business_brief",
      "batchExecution": False,
      "parameters": {
        "target_date": "2026-08-30",
        "delivery_mode": "production",
        "production_confirmed": True,
      },
    },
    headers={"Authorization": "Bearer guarded-token"},
    timeout_seconds=20,
    user_agent="AIOS-Prefect-Daily-Brief/1.0",
  )


def test_request_trigger_treats_conflict_as_deduplicated() -> None:
  with patch.object(
    trigger,
    "http_post_json",
    return_value=(409, {"message": "already running"}, ""),
  ) as http_post_json:
    result = trigger.request_daily_brief_trigger(
      target_date=date(2026, 8, 30),
      access_token="guarded-token",
    )

  assert result.status == "deduplicated"
  assert result.message == "already running"
  assert http_post_json.call_count == 1


def test_request_trigger_fails_closed_on_unsuccessful_response() -> None:
  with patch.object(
    trigger,
    "http_post_json",
    return_value=(503, {"message": "temporarily unavailable"}, ""),
  ) as http_post_json:
    with pytest.raises(RuntimeError, match="status=503"):
      trigger.request_daily_brief_trigger(
        target_date=date(2026, 8, 30),
        access_token="guarded-token",
      )

  assert http_post_json.call_count == 1


def test_request_trigger_requires_flow_run_identity() -> None:
  with patch.object(
    trigger,
    "http_post_json",
    return_value=(200, {"success": True}, ""),
  ):
    with pytest.raises(RuntimeError, match="omitted flow run identity"):
      trigger.request_daily_brief_trigger(
        target_date=date(2026, 8, 30),
        access_token="guarded-token",
      )
