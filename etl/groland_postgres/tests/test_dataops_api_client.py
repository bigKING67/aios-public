from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

import pytest


ETL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_ROOT / "scripts"))

import dataops_api_client as client  # noqa: E402
import prefect_dataops_notification_trace_slo_scan as slo_scan  # noqa: E402


def test_client_normalizes_bases_token_and_invalid_timeout() -> None:
  with patch.dict(
    os.environ,
    {
      "DATAOPS_API_BASE": "http://aios.internal/v1/dataops/",
      "AUTH_API_BASE": "http://aios.internal/v1/",
      "DATAOPS_HTTP_TIMEOUT_SEC": "invalid",
    },
    clear=True,
  ):
    assert client.normalize_access_token(" Bearer token-value ") == "token-value"
    assert client.resolve_dataops_api_base() == "http://aios.internal/v1/dataops"
    assert client.resolve_auth_api_base() == "http://aios.internal/v1"
    assert client.resolve_http_timeout_seconds() == 20


def test_slo_scan_preserves_its_existing_user_agent_on_shared_client() -> None:
  with patch.object(
    slo_scan,
    "http_post_json",
    return_value=(200, {"ok": True}, ""),
  ) as http_post_json:
    result = slo_scan._http_post_json(
      "http://aios.internal/v1/dataops/runtime/notification-trace/scan",
      {"dryRun": True},
      headers={"Authorization": "Bearer guarded-token"},
      timeout_seconds=17,
    )

  assert result == (200, {"ok": True}, "")
  http_post_json.assert_called_once_with(
    "http://aios.internal/v1/dataops/runtime/notification-trace/scan",
    {"dryRun": True},
    headers={"Authorization": "Bearer guarded-token"},
    timeout_seconds=17,
    user_agent="AIOS-Prefect-Scan/1.0",
  )


def test_http_post_json_does_not_retry_ambiguous_connection_failure() -> None:
  with patch.object(
    client,
    "urlopen",
    side_effect=URLError("connection closed"),
  ) as urlopen:
    with pytest.raises(RuntimeError, match="HTTP request failed"):
      client.http_post_json(
        "http://aios.internal/v1/dataops/actions",
        {"action": "trigger_pipeline"},
        timeout_seconds=7,
      )

  assert urlopen.call_count == 1
