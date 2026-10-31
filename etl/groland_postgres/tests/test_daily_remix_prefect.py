"""Exercise deployment defaults with a fake CLI; never contact Prefect."""
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import Mock, patch

import yaml

ETL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_ROOT / "scripts"))
import prefect_daily_remix as module  # noqa: E402


def test_flow_delegates_to_disabled_by_default_service():
    with patch.object(module, "execute", return_value={"status": "disabled"}) as execute, patch.object(module, "get_run_logger", return_value=Mock()):
        assert module.daily_remix_flow.fn() == {"status": "disabled"}
        execute.assert_called_once()


def test_manifest_has_1000_schedule_disabled_and_single_concurrency():
    manifest = yaml.safe_load((ETL_ROOT / "prefect-deployments.yaml").read_text())
    entry = next(e for e in manifest["deployments"] if e["deployment_name"] == "daily-remix")
    assert entry["schedule"]["default"] == "0 10 * * *"
    assert entry["schedule"]["active"] is False
    assert entry["schedule"]["enabled_default"] is False
    assert entry["concurrency"]["default"] == 1


def test_deploy_adapter_only_enables_schedule_with_explicit_flag(tmp_path):
    marker = tmp_path / "calls.txt"
    probe = tmp_path / "prefect"
    probe.write_text('#!/bin/sh\nprintf "%s\\n" "$@" >> "$DAILY_PROBE_LOG"\n')
    probe.chmod(0o755)
    environment = {**os.environ, "PREFECT_BIN": str(probe), "DAILY_PROBE_LOG": str(marker),
                   "PREFECT_HOME": str(tmp_path / "home"), "UV_BIN": str(tmp_path / "missing"),
                   "CONCURRENCY_LIMIT": "1", "CRON": "0 10 * * *", "TIMEZONE": "Asia/Shanghai"}
    for enabled in ["false", "true"]:
        marker.write_text("")
        result = subprocess.run(["bash", str(ETL_ROOT / "scripts/deploy_prefect_daily_remix.sh")],
                                env={**environment, "SCHEDULE_ENABLED": enabled}, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        calls = marker.read_text()
        assert "--concurrency-limit\n1" in calls
        assert ("--cron\n0 10 * * *" in calls) == (enabled == "true")
        assert ("schedule\nclear" in calls) == (enabled == "false")
    marker.write_text("")
    result = subprocess.run(["bash", str(ETL_ROOT / "scripts/deploy_prefect_daily_remix.sh")],
                            env={**environment, "CONCURRENCY_LIMIT": "2"}, capture_output=True)
    assert result.returncode == 2
    assert marker.read_text() == ""
