from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch

import yaml


ETL_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ETL_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import prefect_daily_business_brief as brief_flow  # noqa: E402
from daily_business_brief.models import DeliveryMode  # noqa: E402


@dataclass(frozen=True)
class FakeResult:
  status: str = "preview_ready"
  target_date: date = date(2026, 8, 24)
  delivery_mode: DeliveryMode = DeliveryMode.PREVIEW
  platform_count: int = 5
  card_sha256: str = "a" * 64
  delivery_id: None = None
  attempt_count: int = 0

  def to_dict(self):
    return {"status": self.status, "targetDate": self.target_date.isoformat()}


def _flow_function(flow_or_function):
  return getattr(flow_or_function, "fn", flow_or_function)


def test_prefect_flow_passes_guarded_parameters_to_service() -> None:
  service = Mock()
  service.run.return_value = FakeResult()
  with (
    patch.object(brief_flow, "get_run_logger", return_value=Mock()),
    patch.object(brief_flow, "resolve_brief_config", return_value=Mock()),
    patch.object(brief_flow, "PostgresBriefRepository", return_value=Mock()),
    patch.object(brief_flow, "FeishuWebhookSender", return_value=Mock()),
    patch.object(brief_flow, "DailyBusinessBriefService", return_value=service),
  ):
    result = _flow_function(brief_flow.daily_business_brief_flow)(
      target_date="2026-08-24",
      delivery_mode="preview",
      production_confirmed=False,
    )

  assert result == {"status": "preview_ready", "targetDate": "2026-08-24"}
  service.run.assert_called_once()
  kwargs = service.run.call_args.kwargs
  assert kwargs["target_date"] == date(2026, 8, 24)
  assert kwargs["delivery_mode"] is DeliveryMode.PREVIEW
  assert kwargs["production_confirmed"] is False


def test_manifest_tracks_scheduleless_readiness_trigger_and_single_concurrency() -> None:
  manifest = yaml.safe_load(
    (ETL_ROOT / "prefect-deployments.yaml").read_text(encoding="utf-8")
  )
  entry = next(
    item
    for item in manifest["deployments"]
    if item["deployment_name"] == "daily-business-brief"
  )

  assert entry["flow_name"] == "daily-business-brief-flow"
  assert entry["parameters"] == [
    "delivery_mode",
    "production_confirmed",
    "target_date",
  ]
  assert entry["schedule"] == {
    "kind": "cron",
    "source_env": "DAILY_BRIEF_CRON",
    "adapter_env": "CRON",
    "default": "5 11 * * *",
    "enabled_env": "DAILY_BRIEF_SCHEDULE_ENABLED",
    "enabled_default": False,
    "clean_count": 0,
    "legacy_count": 0,
    "active": False,
  }
  assert entry["concurrency"]["default"] == 1
  assert entry["watchdog"] == {"success_slo_minutes": 1800}

  overview_entry = next(
    item
    for item in manifest["deployments"]
    if item["deployment_name"] == "ads-01-overview-daily-inc"
  )
  assert overview_entry["parameters"] == [
    "fallback_window_days",
    "init_watermark_only",
    "trigger_daily_brief",
  ]


def _write_prefect_probe(path: Path, marker: Path) -> Path:
  path.write_text(
    "#!/usr/bin/env bash\n"
    f"printf '%s\\n' '---CALL---' \"$@\" >> {marker!s}\n",
    encoding="utf-8",
  )
  path.chmod(0o755)
  return path


def test_deploy_adapter_registers_preview_defaults_and_clears_schedules(
  tmp_path: Path,
) -> None:
  marker = tmp_path / "prefect-calls.log"
  probe = _write_prefect_probe(tmp_path / "prefect", marker)
  environment = os.environ.copy()
  environment.update({
    "PREFECT_BIN": str(probe),
    "PREFECT_HOME": str(tmp_path / "prefect-home"),
    "SCHEDULE_ENABLED": "false",
    "UV_BIN": str(tmp_path / "missing-uv"),
  })
  result = subprocess.run(
    ["bash", str(SCRIPTS / "deploy_prefect_daily_business_brief.sh")],
    check=False,
    capture_output=True,
    env=environment,
    text=True,
  )
  calls = marker.read_text(encoding="utf-8")

  assert result.returncode == 0, result.stderr
  assert "deploy" in calls
  assert "delivery_mode=preview" in calls
  assert "production_confirmed=false" in calls
  assert "--cron" not in calls
  assert "schedule\nclear" in calls
  assert "--accept-yes" in calls
  assert "scheduleless" in result.stdout


def test_deploy_adapter_rejects_any_fixed_schedule(
  tmp_path: Path,
) -> None:
  environment = os.environ.copy()
  environment.update({
    "PREFECT_HOME": str(tmp_path / "prefect-home"),
    "SCHEDULE_ENABLED": "true",
    "DELIVERY_MODE": "production",
    "PRODUCTION_CONFIRMED": "true",
  })
  result = subprocess.run(
    ["bash", str(SCRIPTS / "deploy_prefect_daily_business_brief.sh")],
    check=False,
    capture_output=True,
    env=environment,
    text=True,
  )

  assert result.returncode == 2
  assert "Fixed daily brief schedules are retired" in result.stderr


def test_overview_deploy_adapter_keeps_readiness_trigger_disabled_by_default(
  tmp_path: Path,
) -> None:
  marker = tmp_path / "prefect-calls.log"
  probe = _write_prefect_probe(tmp_path / "prefect", marker)
  environment = os.environ.copy()
  environment.update({
    "PREFECT_BIN": str(probe),
    "PREFECT_HOME": str(tmp_path / "prefect-home"),
    "RUN_OVERVIEW_SCHEMA_PRECHECK": "false",
    "TRIGGER_DAILY_BRIEF": "false",
    "UV_BIN": str(tmp_path / "missing-uv"),
  })
  result = subprocess.run(
    ["bash", str(SCRIPTS / "deploy_prefect_incremental_all_trade_overview.sh")],
    check=False,
    capture_output=True,
    env=environment,
    text=True,
  )
  calls = marker.read_text(encoding="utf-8")

  assert result.returncode == 0, result.stderr
  assert "trigger_daily_brief=false" in calls
  assert "readiness trigger: false" in result.stdout


def test_overview_deploy_adapter_can_explicitly_enable_readiness_trigger(
  tmp_path: Path,
) -> None:
  marker = tmp_path / "prefect-calls.log"
  probe = _write_prefect_probe(tmp_path / "prefect", marker)
  environment = os.environ.copy()
  environment.update({
    "PREFECT_BIN": str(probe),
    "PREFECT_HOME": str(tmp_path / "prefect-home"),
    "RUN_OVERVIEW_SCHEMA_PRECHECK": "false",
    "DAILY_BRIEF_READINESS_TRIGGER_ENABLED": "true",
    "UV_BIN": str(tmp_path / "missing-uv"),
  })
  environment.pop("TRIGGER_DAILY_BRIEF", None)
  result = subprocess.run(
    ["bash", str(SCRIPTS / "deploy_prefect_incremental_all_trade_overview.sh")],
    check=False,
    capture_output=True,
    env=environment,
    text=True,
  )
  calls = marker.read_text(encoding="utf-8")

  assert result.returncode == 0, result.stderr
  assert "trigger_daily_brief=true" in calls
  assert "readiness trigger: true" in result.stdout


def test_vps_wrapper_exposes_scoped_ads_overview_deploy_target() -> None:
  source = (
    ETL_ROOT.parents[1] / "scripts" / "ops" / "deploy-prefect-vps.sh"
  ).read_text(encoding="utf-8")

  assert "deploy ads-overview" in source
  assert 'ads-overview)' in source
  assert (
    'deploy_script="etl/groland_postgres/scripts/'
    'deploy_prefect_incremental_all_trade_overview.sh"'
  ) in source
  assert (
    "/deployments/name/incremental-refresh-ads-all-trade-overview-flow/"
    "ads-01-overview-daily-inc"
  ) in source
