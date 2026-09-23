from __future__ import annotations

import copy
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from manage_prefect_deployments import (  # noqa: E402
  DEFAULT_MANIFEST,
  ManifestError,
  _deployment_environment,
  active_entries,
  deploy_active,
  fetch_filter_pages,
  fetch_live_deployments,
  load_manifest,
  validate_manifest,
  verify_live,
)


class FakePrefectClient:
  def __init__(self, manifest: dict, *, mode: str):
    self.flows = []
    self.deployments = []
    flow_ids: dict[str, str] = {}
    for entry in manifest["deployments"]:
      if entry["state"] == "retired" and mode == "clean":
        continue
      flow_name = entry["flow_name"]
      flow_id = flow_ids.setdefault(flow_name, f"flow-{len(flow_ids) + 1}")
      schedule_count = 0
      schedules = []
      if entry["state"] == "active":
        schedule_count = entry["schedule"][f"{mode}_count"]
        for _ in range(schedule_count):
          schedules.append({
            "active": entry["schedule"]["active"],
            "schedule": {
              "cron": entry["schedule"]["default"],
              "timezone": manifest["defaults"]["timezone"],
            },
          })
        concurrency = int(entry["concurrency"]["default"])
        global_limit = {"limit": concurrency} if concurrency else None
        paused = False
        parameters = {name: None for name in entry["parameters"]}
        work_pool = manifest["defaults"]["work_pool"]
      else:
        paused = entry["legacy_state"] == "paused"
        schedules = [{
          "active": False if entry["legacy_state"] == "unpaused_inactive" else True,
          "schedule": {"cron": "0 * * * *", "timezone": "Asia/Shanghai"},
        }]
        global_limit = None
        parameters = {}
        work_pool = manifest["defaults"]["work_pool"]
      self.deployments.append({
        "flow_id": flow_id,
        "name": entry["deployment_name"],
        "paused": paused,
        "parameters": parameters,
        "schedules": schedules,
        "work_pool_name": work_pool,
        "global_concurrency_limit": global_limit,
      })
    self.flows = [{"id": value, "name": key} for key, value in flow_ids.items()]

  def request(self, method: str, path: str, body: dict | None = None):
    del method, body
    if path == "/flows/filter":
      return copy.deepcopy(self.flows)
    if path == "/deployments/filter":
      return copy.deepcopy(self.deployments)
    raise AssertionError(f"unexpected request: {path}")


class PrefectDeploymentManifestTest(unittest.TestCase):
  def setUp(self) -> None:
    self.manifest = load_manifest(DEFAULT_MANIFEST)

  def test_deploy_preserves_dormant_business_schedules_and_keeps_other_adapters(self) -> None:
    with patch("manage_prefect_deployments.subprocess.run") as run:
      deploy_active(self.manifest, group=None, dry_run=False)
    scripts = {Path(call.args[0][1]).name for call in run.call_args_list}
    self.assertNotIn("deploy_prefect_incremental_all_trade_overview.sh", scripts)
    self.assertNotIn("deploy_prefect_dashboard_ads_freshness_check.sh", scripts)
    self.assertIn("deploy_prefect_process_marketing_content_asset_jobs.sh", scripts)
    self.assertIn("deploy_prefect_marketing_industry_articles.sh", scripts)
    self.assertIn("deploy_prefect_daily_business_brief.sh", scripts)
    self.assertIn("deploy_prefect_sync_marketing_content_assets.sh", scripts)

  def test_explicit_schedule_resume_restores_its_deploy_adapter(self) -> None:
    entry = next(e for e in active_entries(self.manifest) if e["deployment_name"] == "ads-01-overview-daily-inc")
    entry["schedule"]["active"] = True
    with patch("manage_prefect_deployments.subprocess.run") as run:
      deploy_active(self.manifest, group=None, dry_run=False)
    self.assertIn(
      "deploy_prefect_incremental_all_trade_overview.sh",
      {Path(call.args[0][1]).name for call in run.call_args_list},
    )

  def test_live_verifier_rejects_reenabled_dormant_schedule(self) -> None:
    client = FakePrefectClient(self.manifest, mode="clean")
    entry = next(e for e in client.deployments if e["name"] == "ads-01-overview-daily-inc")
    entry["schedules"][0]["active"] = True
    with self.assertRaisesRegex(ManifestError, "schedule active-state drift"):
      verify_live(self.manifest, client, mode="clean")

  def test_reviewed_inventory_and_scripts_are_complete(self) -> None:
    entries = active_entries(self.manifest)

    self.assertEqual(len(entries), 30)
    self.assertEqual(
      sum(entry["state"] == "retired" for entry in self.manifest["deployments"]),
      27,
    )
    self.assertEqual(len({entry["deploy_script"] for entry in entries}), 28)

    compatibility_wrapper = (
      DEFAULT_MANIFEST.parent / "scripts" / "deploy_prefect_dataops_hub_all.sh"
    ).read_text(encoding="utf-8")
    self.assertIn('manage_prefect_deployments.py" deploy active', compatibility_wrapper)
    self.assertNotIn("deploy_prefect_incremental_all_trade_overview.sh", compatibility_wrapper)
    self.assertNotIn("retire_prefect_deployment", compatibility_wrapper)

  def test_compatibility_wrapper_prefers_explicit_python_over_managed_runtime(self) -> None:
    with tempfile.TemporaryDirectory(prefix="prefect-deploy-wrapper-") as raw_temp:
      temp = Path(raw_temp)
      explicit_python = self._write_wrapper_probe(temp / "explicit-python")
      managed_python = self._write_wrapper_probe(temp / "managed-python")
      uv_bin = self._write_wrapper_probe(temp / "uv")

      lines = self._run_compatibility_wrapper(
        temp,
        PYTHON_BIN=str(explicit_python),
        PREFECT_MANAGED_PYTHON=str(managed_python),
        UV_BIN=str(uv_bin),
      )

    self.assertEqual(lines[0], str(explicit_python))
    self.assertTrue(lines[1].endswith("/scripts/manage_prefect_deployments.py"))
    self.assertEqual(lines[2:], ["deploy", "active", "--fixture-flag"])

  def test_compatibility_wrapper_uses_managed_runtime_without_uv(self) -> None:
    with tempfile.TemporaryDirectory(prefix="prefect-deploy-wrapper-") as raw_temp:
      temp = Path(raw_temp)
      managed_python = self._write_managed_python_probe(temp / "venv" / "bin" / "python")
      managed_prefect = self._write_wrapper_probe(temp / "venv" / "bin" / "prefect")
      uv_bin = self._write_wrapper_probe(temp / "uv")

      lines = self._run_compatibility_wrapper(
        temp,
        PREFECT_MANAGED_PYTHON=str(managed_python),
        PREFECT_MANAGED_BIN=str(managed_prefect),
        UV_BIN=str(uv_bin),
      )

    self.assertEqual(lines[0], str(managed_python))
    self.assertEqual(lines[1], str(managed_prefect))
    self.assertEqual(lines[2], str(temp / "prefect-home" / "logging.yml"))
    self.assertTrue(lines[3].endswith("/scripts/manage_prefect_deployments.py"))
    self.assertEqual(lines[4:], ["deploy", "active", "--fixture-flag"])

  def test_compatibility_wrapper_fails_closed_when_managed_cli_is_missing(self) -> None:
    with tempfile.TemporaryDirectory(prefix="prefect-deploy-wrapper-") as raw_temp:
      temp = Path(raw_temp)
      managed_python = self._write_wrapper_probe(temp / "venv" / "bin" / "python")

      result = self._run_compatibility_wrapper_process(
        temp,
        PREFECT_MANAGED_PYTHON=str(managed_python),
        PREFECT_MANAGED_BIN=str(temp / "venv" / "bin" / "prefect"),
        UV_BIN=str(temp / "missing-uv"),
      )

    self.assertNotEqual(result.returncode, 0)
    self.assertIn("Prefect managed CLI is missing or not executable", result.stderr)

  def test_compatibility_wrapper_fails_closed_for_broken_managed_runtime(self) -> None:
    with tempfile.TemporaryDirectory(prefix="prefect-deploy-wrapper-") as raw_temp:
      temp = Path(raw_temp)
      managed_python = temp / "managed-python"
      managed_python.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
      managed_python.chmod(0o644)
      uv_bin = self._write_wrapper_probe(temp / "uv")

      result = self._run_compatibility_wrapper_process(
        temp,
        PREFECT_MANAGED_PYTHON=str(managed_python),
        UV_BIN=str(uv_bin),
      )

    self.assertNotEqual(result.returncode, 0)
    self.assertIn("Prefect managed Python is present but not executable", result.stderr)

  def test_compatibility_wrapper_falls_back_to_uv_without_managed_runtime(self) -> None:
    with tempfile.TemporaryDirectory(prefix="prefect-deploy-wrapper-") as raw_temp:
      temp = Path(raw_temp)
      uv_bin = self._write_wrapper_probe(temp / "uv")

      lines = self._run_compatibility_wrapper(
        temp,
        PREFECT_MANAGED_PYTHON=str(temp / "missing-managed-python"),
        UV_BIN=str(uv_bin),
      )

    self.assertEqual(lines[0], str(uv_bin))
    self.assertEqual(lines[1:3], ["run", "--project"])
    self.assertEqual(Path(lines[3]), DEFAULT_MANIFEST.parent)
    self.assertEqual(lines[4:6], ["--frozen", "python"])
    self.assertTrue(lines[6].endswith("/scripts/manage_prefect_deployments.py"))
    self.assertEqual(lines[7:], ["deploy", "active", "--fixture-flag"])

  @staticmethod
  def _write_wrapper_probe(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
      '#!/usr/bin/env bash\nprintf \'%s\\n\' "$0" "$@" > "$DEPLOY_WRAPPER_MARKER"\n',
      encoding="utf-8",
    )
    path.chmod(0o755)
    return path

  @staticmethod
  def _write_managed_python_probe(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
      '#!/usr/bin/env bash\nprintf \'%s\\n\' "$0" "$PREFECT_BIN" '
      '"$PREFECT_LOGGING_SETTINGS_PATH" "$@" '
      '> "$DEPLOY_WRAPPER_MARKER"\n',
      encoding="utf-8",
    )
    path.chmod(0o755)
    return path

  def test_deploy_adapter_uses_managed_prefect_without_uv(self) -> None:
    helper = DEFAULT_MANIFEST.parent / "scripts" / "_prefect_deploy_env.sh"
    with tempfile.TemporaryDirectory(prefix="prefect-deploy-adapter-") as raw_temp:
      temp = Path(raw_temp)
      prefect_bin = self._write_prefect_adapter_probe(temp / "managed-prefect")
      marker = temp / "adapter-marker"
      environment = os.environ.copy()
      environment.pop("PREFECT_LOGGING_SETTINGS_PATH", None)
      environment.update({
        "ADAPTER_MARKER": str(marker),
        "DATAOPS_PREFECT_API_URL": "http://127.0.0.1:14200/api",
        "PREFECT_API_URL": "http://127.0.0.1:14200/api",
        "PREFECT_BIN": str(prefect_bin),
        "PREFECT_HOME": str(temp / "prefect-home"),
      })
      result = subprocess.run(
        [
          "bash",
          "-c",
          'source "$1"; prefect_uv_run "$2" deploy --name fixture',
          "fixture",
          str(helper),
          str(temp / "missing-uv"),
        ],
        check=False,
        capture_output=True,
        env=environment,
        text=True,
      )
      lines = marker.read_text(encoding="utf-8").splitlines()

    self.assertEqual(result.returncode, 0, result.stderr)
    self.assertEqual(
      lines,
      [
        "http://127.0.0.1:14200/api",
        "http://127.0.0.1:14200/api",
        str(temp / "prefect-home"),
        str(temp / "prefect-home" / "logging.yml"),
        "deploy",
        "--name",
        "fixture",
      ],
    )

  def test_deploy_adapter_rejects_non_executable_managed_prefect(self) -> None:
    helper = DEFAULT_MANIFEST.parent / "scripts" / "_prefect_deploy_env.sh"
    with tempfile.TemporaryDirectory(prefix="prefect-deploy-adapter-") as raw_temp:
      temp = Path(raw_temp)
      prefect_bin = temp / "managed-prefect"
      prefect_bin.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
      prefect_bin.chmod(0o644)
      environment = os.environ.copy()
      environment.pop("PREFECT_LOGGING_SETTINGS_PATH", None)
      environment.update({
        "PREFECT_API_URL": "http://127.0.0.1:14200/api",
        "PREFECT_BIN": str(prefect_bin),
        "PREFECT_HOME": str(temp / "prefect-home"),
      })
      result = subprocess.run(
        [
          "bash",
          "-c",
          'source "$1"; prefect_uv_run "$2" deploy --name fixture',
          "fixture",
          str(helper),
          str(temp / "missing-uv"),
        ],
        check=False,
        capture_output=True,
        env=environment,
        text=True,
      )

    self.assertEqual(result.returncode, 2)
    self.assertIn("PREFECT_BIN is not executable", result.stderr)

  @staticmethod
  def _write_prefect_adapter_probe(path: Path) -> Path:
    path.write_text(
      "#!/usr/bin/env bash\n"
      "printf '%s\\n' \"$PREFECT_API_URL\" \"$DATAOPS_PREFECT_API_URL\" "
      "\"$PREFECT_HOME\" \"$PREFECT_LOGGING_SETTINGS_PATH\" \"$@\" "
      "> \"$ADAPTER_MARKER\"\n",
      encoding="utf-8",
    )
    path.chmod(0o755)
    return path

  def _run_compatibility_wrapper(self, temp: Path, **overrides: str) -> list[str]:
    result = self._run_compatibility_wrapper_process(temp, **overrides)
    self.assertEqual(result.returncode, 0, result.stderr)
    return (temp / "wrapper-marker").read_text(encoding="utf-8").splitlines()

  @staticmethod
  def _run_compatibility_wrapper_process(
    temp: Path,
    **overrides: str,
  ) -> subprocess.CompletedProcess[str]:
    wrapper = DEFAULT_MANIFEST.parent / "scripts" / "deploy_prefect_dataops_hub_all.sh"
    environment = os.environ.copy()
    environment.pop("PYTHON_BIN", None)
    environment.pop("PREFECT_LOGGING_SETTINGS_PATH", None)
    environment.update({
      "DEPLOY_WRAPPER_MARKER": str(temp / "wrapper-marker"),
      "PREFECT_HOME": str(temp / "prefect-home"),
      **overrides,
    })
    return subprocess.run(
      ["bash", str(wrapper), "--fixture-flag"],
      check=False,
      capture_output=True,
      env=environment,
      text=True,
    )

  def test_rejects_duplicate_and_secret_literal(self) -> None:
    duplicate = copy.deepcopy(self.manifest)
    duplicate["deployments"].append(copy.deepcopy(duplicate["deployments"][0]))
    with self.assertRaisesRegex(ManifestError, "duplicate deployment identity"):
      validate_manifest(duplicate)

    secret = copy.deepcopy(self.manifest)
    secret["deployments"][0]["schedule"]["default"] = "postgresql://user:password@db/data"
    with self.assertRaisesRegex(ManifestError, "embedded credential"):
      validate_manifest(secret)

  def test_deploy_environment_resolves_source_contracts_without_secret_values(self) -> None:
    entry = next(
      item
      for item in active_entries(self.manifest)
      if item["deployment_name"] == "ads-01-overview-daily-inc"
    )
    with patch.dict(
      os.environ,
      {"ADS_OVERVIEW_CRON": "1 2 * * *", "COMMON_CONCURRENCY_LIMIT": "3"},
      clear=False,
    ):
      environment = _deployment_environment([entry], self.manifest["defaults"])

    self.assertEqual(environment["CRON"], "1 2 * * *")
    self.assertEqual(environment["CONCURRENCY_LIMIT"], "3")
    self.assertEqual(environment["WORK_POOL_NAME"], "default-agent-pool")

  def test_verifies_legacy_and_clean_control_planes(self) -> None:
    legacy = verify_live(
      self.manifest,
      FakePrefectClient(self.manifest, mode="legacy"),
      mode="legacy",
    )
    clean = verify_live(
      self.manifest,
      FakePrefectClient(self.manifest, mode="clean"),
      mode="clean",
    )

    self.assertEqual(legacy, {"active_verified": 30, "retired_present": 27, "live_total": 57})
    self.assertEqual(clean, {"active_verified": 30, "retired_present": 0, "live_total": 30})

  def test_rejects_unknown_live_deployment(self) -> None:
    client = FakePrefectClient(self.manifest, mode="clean")
    client.deployments.append({
      "flow_id": client.flows[0]["id"],
      "name": "unexpected-deployment",
      "paused": False,
    })

    with self.assertRaisesRegex(ManifestError, "manifest-external"):
      verify_live(self.manifest, client, mode="clean")

  def test_filter_pagination_reads_every_page_and_fails_closed_at_the_cap(self) -> None:
    class PaginatedClient:
      def __init__(self, rows):
        self.rows = rows
        self.offsets = []

      def request(self, method: str, path: str, body: dict | None = None):
        if method != "POST" or path != "/fixture/filter" or body is None:
          raise AssertionError("unexpected pagination request")
        offset = body["offset"]
        limit = body["limit"]
        self.offsets.append(offset)
        return copy.deepcopy(self.rows[offset:offset + limit])

    client = PaginatedClient([{"id": index} for index in range(5)])
    rows = fetch_filter_pages(client, "/fixture/filter", page_size=2, max_pages=4)
    self.assertEqual([row["id"] for row in rows], list(range(5)))
    self.assertEqual(client.offsets, [0, 2, 4])

    capped = PaginatedClient([{"id": index} for index in range(4)])
    with self.assertRaisesRegex(ManifestError, "pagination exceeded"):
      fetch_filter_pages(capped, "/fixture/filter", page_size=2, max_pages=2)

  def test_filter_pagination_rejects_non_list_responses(self) -> None:
    class InvalidClient:
      @staticmethod
      def request(method: str, path: str, body: dict | None = None):
        del method, path, body
        return {"unexpected": "mapping"}

    with self.assertRaisesRegex(ManifestError, "invalid list response"):
      fetch_filter_pages(InvalidClient(), "/fixture/filter")

  def test_live_inventory_rejects_incomplete_api_identities(self) -> None:
    class InvalidIdentityClient:
      @staticmethod
      def request(method: str, path: str, body: dict | None = None):
        del method, body
        if path == "/flows/filter":
          return [{"id": "flow-1"}]
        if path == "/deployments/filter":
          return []
        raise AssertionError(path)

    with self.assertRaisesRegex(ManifestError, "invalid flow identity"):
      fetch_live_deployments(InvalidIdentityClient())


if __name__ == "__main__":
  unittest.main()
