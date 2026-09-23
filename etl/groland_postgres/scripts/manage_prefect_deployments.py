#!/usr/bin/env python3
"""Validate, deploy, and compare the governed Prefect deployment manifest."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import yaml


SCRIPT_DIR = Path(__file__).resolve().parent
ETL_ROOT = SCRIPT_DIR.parent
DEFAULT_MANIFEST = ETL_ROOT / "prefect-deployments.yaml"
API_PAGE_SIZE = 200
MAX_API_PAGES = 100
IDENTIFIER_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
ALLOWED_STATES = {"active", "retired"}
ALLOWED_LEGACY_STATES = {"paused", "unpaused_inactive"}
MANIFEST_KEYS = {"schema_version", "defaults", "deployments"}
DEFAULT_KEYS = {"work_pool", "timezone_env", "timezone"}
ACTIVE_ENTRY_KEYS = {
  "flow_name",
  "deployment_name",
  "state",
  "deploy_script",
  "deploy_group",
  "deploy_order",
  "work_pool",
  "schedule",
  "parameters",
  "concurrency",
  "watchdog",
}
RETIRED_ENTRY_KEYS = {"flow_name", "deployment_name", "state", "legacy_state"}
SCHEDULE_KEYS = {
  "kind",
  "source_env",
  "adapter_env",
  "default",
  "enabled_env",
  "enabled_default",
  "clean_count",
  "legacy_count",
  "active",
}
CONCURRENCY_KEYS = {"source_env", "adapter_env", "default"}
WATCHDOG_KEYS = {"success_slo_minutes", "future_run_lookahead_minutes"}
SECRET_LITERAL_PATTERN = re.compile(
  r"(?:[a-z][a-z0-9+.-]*://[^/@\s:]+:[^/@\s]+@|-----BEGIN [A-Z ]+PRIVATE KEY-----)",
  re.IGNORECASE,
)


class ManifestError(RuntimeError):
  """Raised when deployment authority or live state violates its contract."""


def _require_mapping(value: Any, label: str) -> dict[str, Any]:
  if not isinstance(value, dict):
    raise ManifestError(f"{label} must be a mapping")
  return value


def _require_string(value: Any, label: str) -> str:
  if not isinstance(value, str) or not value.strip():
    raise ManifestError(f"{label} must be a non-empty string")
  return value.strip()


def _resolved_env(name: str | None, default: Any) -> Any:
  if name:
    value = os.getenv(name)
    if value is not None and value != "":
      return value
  return default


def _parse_bool(value: Any, label: str) -> bool:
  if isinstance(value, bool):
    return value
  normalized = str(value).strip().lower()
  if normalized in {"1", "true", "yes", "on"}:
    return True
  if normalized in {"0", "false", "no", "off"}:
    return False
  raise ManifestError(f"{label} must be a boolean")


def _parse_non_negative_int(value: Any, label: str) -> int:
  try:
    parsed = int(value)
  except (TypeError, ValueError) as error:
    raise ManifestError(f"{label} must be an integer") from error
  if parsed < 0:
    raise ManifestError(f"{label} must be non-negative")
  return parsed


def _reject_unknown_keys(value: dict[str, Any], allowed: set[str], label: str) -> None:
  unknown = sorted(set(value) - allowed)
  if unknown:
    raise ManifestError(f"{label} contains unsupported keys: {', '.join(unknown)}")


def _reject_secret_literals(value: Any, label: str = "manifest") -> None:
  if isinstance(value, str) and SECRET_LITERAL_PATTERN.search(value):
    raise ManifestError(f"{label} contains an embedded credential or private key")
  if isinstance(value, dict):
    for key, nested in value.items():
      _reject_secret_literals(nested, f"{label}.{key}")
  elif isinstance(value, list):
    for index, nested in enumerate(value):
      _reject_secret_literals(nested, f"{label}[{index}]")


def load_manifest(path: Path = DEFAULT_MANIFEST) -> dict[str, Any]:
  try:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
  except (OSError, yaml.YAMLError) as error:
    raise ManifestError(f"failed to load manifest {path}: {error}") from error
  manifest = _require_mapping(raw, "manifest")
  validate_manifest(manifest, path=path)
  return manifest


def validate_manifest(manifest: dict[str, Any], *, path: Path = DEFAULT_MANIFEST) -> None:
  _reject_unknown_keys(manifest, MANIFEST_KEYS, "manifest")
  _reject_secret_literals(manifest)
  if manifest.get("schema_version") != 1:
    raise ManifestError("manifest schema_version must be 1")
  defaults = _require_mapping(manifest.get("defaults"), "defaults")
  _reject_unknown_keys(defaults, DEFAULT_KEYS, "defaults")
  _require_string(defaults.get("work_pool"), "defaults.work_pool")
  _require_string(defaults.get("timezone"), "defaults.timezone")
  deployments = manifest.get("deployments")
  if not isinstance(deployments, list) or not deployments:
    raise ManifestError("manifest deployments must be a non-empty list")

  identities: set[tuple[str, str]] = set()
  active_count = 0
  retired_count = 0
  for index, raw in enumerate(deployments):
    entry = _require_mapping(raw, f"deployments[{index}]")
    flow_name = _require_string(entry.get("flow_name"), f"deployments[{index}].flow_name")
    deployment_name = _require_string(
      entry.get("deployment_name"), f"deployments[{index}].deployment_name"
    )
    identity = (flow_name, deployment_name)
    if identity in identities:
      raise ManifestError(f"duplicate deployment identity: {flow_name}/{deployment_name}")
    identities.add(identity)

    state = entry.get("state")
    if state not in ALLOWED_STATES:
      raise ManifestError(f"invalid state for {flow_name}/{deployment_name}: {state}")
    if state == "retired":
      _reject_unknown_keys(entry, RETIRED_ENTRY_KEYS, f"deployments[{index}]")
      retired_count += 1
      if entry.get("legacy_state") not in ALLOWED_LEGACY_STATES:
        raise ManifestError(f"retired deployment lacks legacy_state: {flow_name}/{deployment_name}")
      if entry.get("deploy_script") or entry.get("deploy_group"):
        raise ManifestError(f"retired deployment remains deployable: {flow_name}/{deployment_name}")
      continue

    active_count += 1
    _reject_unknown_keys(entry, ACTIVE_ENTRY_KEYS, f"deployments[{index}]")
    script = _require_string(entry.get("deploy_script"), f"{flow_name}/{deployment_name}.deploy_script")
    script_path = (path.parent / script).resolve()
    if path.parent.resolve() not in script_path.parents or not script_path.is_file():
      raise ManifestError(f"active deployment script is missing or outside ETL root: {script}")
    _require_string(entry.get("deploy_group"), f"{flow_name}/{deployment_name}.deploy_group")
    _parse_non_negative_int(entry.get("deploy_order"), f"{flow_name}/{deployment_name}.deploy_order")

    schedule = _require_mapping(entry.get("schedule"), f"{flow_name}/{deployment_name}.schedule")
    _reject_unknown_keys(schedule, SCHEDULE_KEYS, f"{flow_name}/{deployment_name}.schedule")
    if schedule.get("kind") != "cron":
      raise ManifestError(f"unsupported schedule kind for {flow_name}/{deployment_name}")
    _require_string(schedule.get("source_env"), f"{flow_name}/{deployment_name}.schedule.source_env")
    _require_string(schedule.get("adapter_env"), f"{flow_name}/{deployment_name}.schedule.adapter_env")
    _require_string(schedule.get("default"), f"{flow_name}/{deployment_name}.schedule.default")
    for mode in ("clean_count", "legacy_count"):
      _parse_non_negative_int(schedule.get(mode), f"{flow_name}/{deployment_name}.schedule.{mode}")
    _parse_bool(schedule.get("active"), f"{flow_name}/{deployment_name}.schedule.active")

    parameters = entry.get("parameters")
    if not isinstance(parameters, list) or any(
      not isinstance(name, str) or not IDENTIFIER_PATTERN.fullmatch(name)
      for name in parameters
    ):
      raise ManifestError(f"invalid parameter contract for {flow_name}/{deployment_name}")
    if len(parameters) != len(set(parameters)):
      raise ManifestError(f"duplicate parameter key for {flow_name}/{deployment_name}")

    concurrency = _require_mapping(
      entry.get("concurrency"), f"{flow_name}/{deployment_name}.concurrency"
    )
    _reject_unknown_keys(concurrency, CONCURRENCY_KEYS, f"{flow_name}/{deployment_name}.concurrency")
    _require_string(concurrency.get("source_env"), f"{flow_name}/{deployment_name}.concurrency.source_env")
    _require_string(concurrency.get("adapter_env"), f"{flow_name}/{deployment_name}.concurrency.adapter_env")
    _parse_non_negative_int(concurrency.get("default"), f"{flow_name}/{deployment_name}.concurrency.default")

    watchdog = _require_mapping(entry.get("watchdog"), f"{flow_name}/{deployment_name}.watchdog")
    _reject_unknown_keys(watchdog, WATCHDOG_KEYS, f"{flow_name}/{deployment_name}.watchdog")
    for field in ("success_slo_minutes", "future_run_lookahead_minutes"):
      value = watchdog.get(field)
      if value is not None and _parse_non_negative_int(value, f"{flow_name}/{deployment_name}.watchdog.{field}") == 0:
        raise ManifestError(f"{flow_name}/{deployment_name}.watchdog.{field} must be positive or null")

  if active_count != 30 or retired_count != 27:
    raise ManifestError(
      f"reviewed deployment inventory drifted: active={active_count}, retired={retired_count}"
    )


def active_entries(manifest: dict[str, Any], group: str | None = None) -> list[dict[str, Any]]:
  entries = [entry for entry in manifest["deployments"] if entry["state"] == "active"]
  if group:
    entries = [entry for entry in entries if entry["deploy_group"] == group]
  return sorted(entries, key=lambda entry: (entry["deploy_order"], entry["deploy_script"]))


def _deployment_environment(entries: list[dict[str, Any]], defaults: dict[str, Any]) -> dict[str, str]:
  environment = os.environ.copy()
  environment.setdefault("WORK_POOL_NAME", str(defaults["work_pool"]))
  environment.setdefault("TIMEZONE", str(defaults["timezone"]))

  assigned: dict[str, str] = {}
  for entry in entries:
    schedule = entry["schedule"]
    schedule_value = str(_resolved_env(schedule["source_env"], schedule["default"]))
    concurrency = entry["concurrency"]
    concurrency_value = str(_resolved_env(concurrency["source_env"], concurrency["default"]))
    for adapter_env, value in (
      (schedule["adapter_env"], schedule_value),
      (concurrency["adapter_env"], concurrency_value),
    ):
      previous = assigned.get(adapter_env)
      if previous is not None and previous != value:
        raise ManifestError(
          f"one deploy script requires conflicting values for {adapter_env}: {previous!r} != {value!r}"
        )
      assigned[adapter_env] = value
    if schedule.get("enabled_env"):
      enabled_value = _parse_bool(
        _resolved_env(schedule["enabled_env"], schedule.get("enabled_default", False)),
        schedule["enabled_env"],
      )
      assigned[schedule["enabled_env"]] = "true" if enabled_value else "false"

  environment.update(assigned)
  return environment


def deploy_active(manifest: dict[str, Any], *, group: str | None, dry_run: bool) -> None:
  entries = active_entries(manifest, group)
  if not entries:
    raise ManifestError(f"no active deployments found for group {group!r}")
  by_script: dict[str, list[dict[str, Any]]] = defaultdict(list)
  for entry in entries:
    by_script[entry["deploy_script"]].append(entry)

  ordered_scripts = sorted(
    by_script,
    key=lambda script: min(entry["deploy_order"] for entry in by_script[script]),
  )
  for script in ordered_scripts:
    script_entries = by_script[script]
    names = ", ".join(entry["deployment_name"] for entry in script_entries)
    if all(
      entry["schedule"]["active"] is False
      and not entry["schedule"].get("enabled_env")
      and all(value is None for value in entry["watchdog"].values())
      for entry in script_entries
    ):
      # These registrations remain available for history/manual use. Running
      # their legacy CLI adapters would silently create active schedules again.
      # Missing registrations still fail verify-live; bootstrap is explicit.
      print(f"preserve dormant adapter: {script} [{names}]")
      continue
    print(f"deploy adapter: {script} [{names}]")
    if dry_run:
      continue
    environment = _deployment_environment(script_entries, manifest["defaults"])
    subprocess.run(
      ["bash", str((ETL_ROOT / script).resolve())],
      cwd=ETL_ROOT,
      env=environment,
      check=True,
    )


class PrefectApiClient:
  def __init__(self, api_url: str, *, timeout_seconds: int = 30):
    self.api_url = api_url.rstrip("/")
    self.timeout_seconds = timeout_seconds
    self.headers = {"Accept": "application/json", "Content-Type": "application/json"}
    auth_mode = os.getenv("DATAOPS_PREFECT_AUTH_MODE", "").strip().lower()
    if not auth_mode:
      auth_mode = "bearer" if os.getenv("DATAOPS_PREFECT_API_KEY") else "none"
    if auth_mode == "bearer":
      token = os.getenv("DATAOPS_PREFECT_API_KEY", "")
      if not token:
        raise ManifestError("bearer Prefect auth requires DATAOPS_PREFECT_API_KEY")
      self.headers["Authorization"] = f"Bearer {token}"
    elif auth_mode == "basic":
      username = os.getenv("DATAOPS_PREFECT_BASIC_AUTH_USERNAME", "")
      password = os.getenv("DATAOPS_PREFECT_BASIC_AUTH_PASSWORD", "")
      if not username or not password:
        raise ManifestError("basic Prefect auth requires username and password")
      encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
      self.headers["Authorization"] = f"Basic {encoded}"
    elif auth_mode != "none":
      raise ManifestError(f"unsupported Prefect auth mode: {auth_mode}")

  def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    request = Request(
      f"{self.api_url}/{path.lstrip('/')}",
      data=None if body is None else json.dumps(body).encode("utf-8"),
      headers=self.headers,
      method=method,
    )
    try:
      with urlopen(request, timeout=self.timeout_seconds) as response:
        payload = response.read()
    except (HTTPError, URLError, TimeoutError) as error:
      raise ManifestError(f"Prefect API request failed: {method} {path}: {error}") from error
    if not payload:
      return None
    try:
      return json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
      raise ManifestError(
        f"Prefect API returned invalid JSON: {method} {path}"
      ) from error


def fetch_filter_pages(
  client: PrefectApiClient,
  path: str,
  body: dict[str, Any] | None = None,
  *,
  page_size: int = API_PAGE_SIZE,
  max_pages: int = MAX_API_PAGES,
) -> list[dict[str, Any]]:
  if page_size <= 0 or max_pages <= 0:
    raise ManifestError("Prefect API pagination limits must be positive")
  rows: list[dict[str, Any]] = []
  base_body = dict(body or {})
  for page in range(max_pages):
    request_body = {
      **base_body,
      "limit": page_size,
      "offset": page * page_size,
    }
    payload = client.request("POST", path, request_body)
    if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
      raise ManifestError(f"Prefect API returned an invalid list response: POST {path}")
    rows.extend(payload)
    if len(payload) < page_size:
      return rows
  raise ManifestError(
    f"Prefect API pagination exceeded {max_pages} pages for POST {path}"
  )


def fetch_live_deployments(client: PrefectApiClient) -> list[dict[str, Any]]:
  flows = fetch_filter_pages(client, "/flows/filter")
  flow_names: dict[str, str] = {}
  for flow in flows:
    flow_id = flow.get("id")
    flow_name = flow.get("name")
    if not isinstance(flow_id, str) or not isinstance(flow_name, str) or not flow_name:
      raise ManifestError("Prefect API returned an invalid flow identity")
    flow_names[flow_id] = flow_name
  deployments = fetch_filter_pages(client, "/deployments/filter")
  for deployment in deployments:
    flow_id = deployment.get("flow_id")
    deployment_name = deployment.get("name")
    if (not isinstance(flow_id, str) or flow_id not in flow_names
      or not isinstance(deployment_name, str) or not deployment_name):
      raise ManifestError("Prefect API returned an invalid deployment identity")
    deployment["flow_name"] = flow_names[flow_id]
  return deployments


def _expected_schedule(entry: dict[str, Any], manifest: dict[str, Any]) -> tuple[str, str, bool]:
  schedule = entry["schedule"]
  cron = str(_resolved_env(schedule["source_env"], schedule["default"]))
  timezone_env = manifest["defaults"].get("timezone_env")
  timezone = str(_resolved_env(timezone_env, manifest["defaults"]["timezone"]))
  active = _parse_bool(schedule["active"], "schedule.active")
  return cron, timezone, active


def verify_live(manifest: dict[str, Any], client: PrefectApiClient, *, mode: str) -> dict[str, int]:
  if mode not in {"legacy", "clean"}:
    raise ManifestError("live verification mode must be legacy or clean")
  observed = {
    (item["flow_name"], item["name"]): item
    for item in fetch_live_deployments(client)
  }
  expected = {
    (entry["flow_name"], entry["deployment_name"]): entry
    for entry in manifest["deployments"]
  }
  unknown = sorted(set(observed) - set(expected))
  if unknown:
    rendered = ", ".join(f"{flow}/{name}" for flow, name in unknown)
    raise ManifestError(f"live Prefect contains manifest-external deployments: {rendered}")

  active_verified = 0
  retired_present = 0
  for identity, entry in expected.items():
    item = observed.get(identity)
    rendered = f"{identity[0]}/{identity[1]}"
    if entry["state"] == "retired":
      if item is None:
        continue
      retired_present += 1
      if mode == "clean":
        raise ManifestError(f"retired deployment exists in clean control plane: {rendered}")
      legacy_state = entry["legacy_state"]
      if legacy_state == "paused" and item.get("paused") is not True:
        raise ManifestError(f"legacy deployment is not paused: {rendered}")
      if legacy_state == "unpaused_inactive":
        if item.get("paused") is True or any(schedule.get("active") for schedule in item.get("schedules") or []):
          raise ManifestError(f"legacy unpaused tombstone has an active schedule: {rendered}")
      continue

    if item is None:
      raise ManifestError(f"active deployment is missing: {rendered}")
    if item.get("paused") is True:
      raise ManifestError(f"active deployment is paused: {rendered}")
    expected_pool = entry.get("work_pool", manifest["defaults"]["work_pool"])
    if item.get("work_pool_name") != expected_pool:
      raise ManifestError(f"work pool drift for {rendered}")
    if set((item.get("parameters") or {}).keys()) != set(entry["parameters"]):
      raise ManifestError(f"parameter contract drift for {rendered}")

    schedules = item.get("schedules") or []
    schedule_count = entry["schedule"][f"{mode}_count"]
    if len(schedules) != schedule_count:
      raise ManifestError(
        f"schedule count drift for {rendered}: expected {schedule_count}, found {len(schedules)}"
      )
    if schedules:
      cron, timezone, active = _expected_schedule(entry, manifest)
      schedule = schedules[0]
      schedule_contract = schedule.get("schedule") or {}
      if schedule_contract.get("cron") != cron or schedule_contract.get("timezone") != timezone:
        raise ManifestError(f"schedule contract drift for {rendered}")
      if bool(schedule.get("active")) != active:
        raise ManifestError(f"schedule active-state drift for {rendered}")

    concurrency = entry["concurrency"]
    expected_limit = _parse_non_negative_int(
      _resolved_env(concurrency["source_env"], concurrency["default"]),
      f"{rendered}.concurrency",
    )
    global_limit = item.get("global_concurrency_limit")
    observed_limit = int(global_limit["limit"]) if global_limit else 0
    if observed_limit != expected_limit:
      raise ManifestError(
        f"concurrency contract drift for {rendered}: expected {expected_limit}, found {observed_limit}"
      )
    active_verified += 1

  return {
    "active_verified": active_verified,
    "retired_present": retired_present,
    "live_total": len(observed),
  }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
  subparsers = parser.add_subparsers(dest="command", required=True)
  subparsers.add_parser("validate")
  deploy_parser = subparsers.add_parser("deploy")
  deploy_parser.add_argument("target", choices=("active", "group"))
  deploy_parser.add_argument("group", nargs="?")
  deploy_parser.add_argument("--dry-run", action="store_true")
  verify_parser = subparsers.add_parser("verify-live")
  verify_parser.add_argument("--mode", choices=("legacy", "clean"), required=True)
  verify_parser.add_argument(
    "--api-url",
    default=os.getenv("PREFECT_API_URL") or os.getenv("DATAOPS_PREFECT_API_URL"),
  )
  return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
  args = parse_args(argv)
  try:
    manifest = load_manifest(args.manifest)
    if args.command == "validate":
      active = sum(entry["state"] == "active" for entry in manifest["deployments"])
      retired = sum(entry["state"] == "retired" for entry in manifest["deployments"])
      print(f"Prefect deployment manifest: PASS active={active} retired={retired}")
    elif args.command == "deploy":
      if args.target == "group" and not args.group:
        raise ManifestError("deploy group requires a group name")
      if args.target == "active" and args.group:
        raise ManifestError("deploy active does not accept a group name")
      deploy_active(
        manifest,
        group=args.group if args.target == "group" else None,
        dry_run=args.dry_run,
      )
    elif args.command == "verify-live":
      if not args.api_url:
        raise ManifestError("verify-live requires --api-url or PREFECT_API_URL")
      result = verify_live(manifest, PrefectApiClient(args.api_url), mode=args.mode)
      print("Prefect live manifest verification: PASS " + " ".join(
        f"{key}={value}" for key, value in sorted(result.items())
      ))
  except (ManifestError, subprocess.CalledProcessError) as error:
    print(f"Prefect deployment manifest error: {error}", file=sys.stderr)
    return 1
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
