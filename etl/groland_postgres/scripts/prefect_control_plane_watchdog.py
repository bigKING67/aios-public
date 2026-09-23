#!/usr/bin/env python3
"""Independent Prefect API, Worker, schedule, and success-SLO watchdog."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

from manage_prefect_deployments import (
  DEFAULT_MANIFEST,
  ManifestError,
  PrefectApiClient,
  active_entries,
  fetch_filter_pages,
  fetch_live_deployments,
  load_manifest,
  verify_live,
)
from prefect_ops_utils import send_feishu_notification


DEFAULT_STATE_PATH = Path("/var/lib/aios-prefect/watchdog/state.json")


@dataclass(frozen=True, order=True)
class Issue:
  code: str
  identity: str
  detail: str


def _utc_now() -> datetime:
  return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
  return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _fingerprint(issues: list[Issue]) -> str:
  canonical = "\n".join(f"{item.code}\0{item.identity}\0{item.detail}" for item in sorted(issues))
  return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _issue_fingerprint(issue: Issue) -> str:
  canonical = f"{issue.code}\0{issue.identity}\0{issue.detail}"
  return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _known_issue_fingerprints(previous: dict[str, Any]) -> set[str]:
  stored = previous.get("known_issue_fingerprints")
  if isinstance(stored, list) and all(isinstance(item, str) for item in stored):
    return set(stored)

  # Schema v1 stored only the last snapshot. Treat those issues as already
  # notified so a deployment does not replay the same incident immediately.
  known: set[str] = set()
  for raw_issue in previous.get("issues") or []:
    if not isinstance(raw_issue, dict):
      continue
    code = raw_issue.get("code")
    identity = raw_issue.get("identity")
    detail = raw_issue.get("detail")
    if all(isinstance(value, str) for value in (code, identity, detail)):
      known.add(_issue_fingerprint(Issue(code, identity, detail)))
  return known


def _read_state(path: Path) -> dict[str, Any]:
  try:
    payload = json.loads(path.read_text(encoding="utf-8"))
  except FileNotFoundError:
    return {"status": "unknown"}
  except (OSError, json.JSONDecodeError) as error:
    raise ManifestError(f"failed to read watchdog state {path}: {error}") from error
  if not isinstance(payload, dict):
    raise ManifestError(f"watchdog state {path} is not a JSON object")
  return payload


def _write_state(path: Path, state: dict[str, Any]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  descriptor, temporary_name = tempfile.mkstemp(
    prefix=f".{path.name}.",
    suffix=".tmp",
    dir=path.parent,
    text=True,
  )
  temporary = Path(temporary_name)
  try:
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
      json.dump(state, handle, ensure_ascii=True, indent=2, sort_keys=True)
      handle.write("\n")
      handle.flush()
      os.fsync(handle.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
  finally:
    if temporary.exists():
      temporary.unlink()


def _group_entries_by_minutes(
  entries: list[dict[str, Any]],
  field: str,
) -> dict[int, list[dict[str, Any]]]:
  grouped: dict[int, list[dict[str, Any]]] = {}
  for entry in entries:
    minutes = entry["watchdog"].get(field)
    if minutes is None:
      continue
    grouped.setdefault(int(minutes), []).append(entry)
  return grouped


def _read_flow_run_deployment_ids(
  client: PrefectApiClient,
  *,
  deployment_ids: list[str],
  state_type: str | None,
  time_field: str,
  after: datetime,
  before: datetime | None = None,
) -> set[str]:
  time_filter: dict[str, str] = {"after_": _iso(after)}
  if before is not None:
    time_filter["before_"] = _iso(before)
  flow_run_filter: dict[str, Any] = {
    "deployment_id": {"any_": deployment_ids},
    time_field: time_filter,
  }
  if state_type is not None:
    flow_run_filter["state"] = {"type": {"any_": [state_type]}}
  runs = fetch_filter_pages(client, "/flow_runs/filter", {
    "flow_runs": flow_run_filter,
    "sort": "END_TIME_DESC" if time_field == "end_time" else "EXPECTED_START_TIME_ASC",
  })
  return {
    str(run["deployment_id"])
    for run in runs
    if run.get("deployment_id") is not None
  }


def evaluate_snapshot(
  *,
  entries: list[dict[str, Any]],
  live_by_identity: dict[tuple[str, str], dict[str, Any]],
  pool: dict[str, Any] | None,
  workers: list[dict[str, Any]],
  completed_by_slo: dict[int, set[str]],
  due_by_slo: dict[int, set[str]],
  future_by_horizon: dict[int, set[str]],
  expected_pool_type: str,
) -> list[Issue]:
  issues: list[Issue] = []
  if not isinstance(pool, dict):
    issues.append(Issue("work_pool_missing", "control-plane", "configured work pool is missing"))
  else:
    if pool.get("type") != expected_pool_type:
      issues.append(Issue("work_pool_type", "control-plane", "configured work pool type drifted"))
    if pool.get("is_paused") is True:
      issues.append(Issue("work_pool_paused", "control-plane", "configured work pool is paused"))
  if not any(worker.get("status") == "ONLINE" for worker in workers):
    issues.append(Issue("worker_offline", "control-plane", "no ONLINE Worker heartbeat"))

  for entry in entries:
    identity = (entry["flow_name"], entry["deployment_name"])
    rendered = f"{identity[0]}/{identity[1]}"
    live = live_by_identity.get(identity)
    if live is None:
      continue
    deployment_id = str(live["id"])
    success_slo = entry["watchdog"].get("success_slo_minutes")
    if (
      success_slo is not None
      and deployment_id in due_by_slo.get(int(success_slo), set())
      and deployment_id not in completed_by_slo.get(int(success_slo), set())
    ):
      issues.append(Issue(
        "recent_success_missing",
        rendered,
        f"no COMPLETED run within {int(success_slo)} minutes",
      ))
    horizon = entry["watchdog"].get("future_run_lookahead_minutes")
    if horizon is not None and deployment_id not in future_by_horizon.get(int(horizon), set()):
      issues.append(Issue(
        "future_run_missing",
        rendered,
        f"no future SCHEDULED run within {int(horizon)} minutes",
      ))
  return sorted(issues)


def collect_issues(
  manifest: dict[str, Any],
  client: PrefectApiClient,
  *,
  mode: str,
  expected_pool_type: str,
  now: datetime,
) -> list[Issue]:
  health = client.request("GET", "/health")
  if health is not True:
    raise ManifestError("Prefect health endpoint did not return true")
  try:
    verify_live(manifest, client, mode=mode)
  except ManifestError as error:
    return [Issue("manifest_drift", "control-plane", str(error))]

  entries = active_entries(manifest)
  live = fetch_live_deployments(client)
  live_by_identity = {
    (item["flow_name"], item["name"]): item
    for item in live
  }
  expected_pool = manifest["defaults"]["work_pool"]
  pool = client.request("GET", f"/work_pools/{quote(expected_pool, safe='')}")
  workers = fetch_filter_pages(
    client,
    f"/work_pools/{quote(expected_pool, safe='')}/workers/filter",
  )

  completed_by_slo: dict[int, set[str]] = {}
  due_by_slo: dict[int, set[str]] = {}
  for minutes, grouped in _group_entries_by_minutes(entries, "success_slo_minutes").items():
    ids = [
      str(live_by_identity[(entry["flow_name"], entry["deployment_name"])]["id"])
      for entry in grouped
    ]
    completed_by_slo[minutes] = _read_flow_run_deployment_ids(
      client,
      deployment_ids=ids,
      state_type="COMPLETED",
      time_field="end_time",
      after=now - timedelta(minutes=minutes),
    )
    due_by_slo[minutes] = _read_flow_run_deployment_ids(
      client,
      deployment_ids=ids,
      state_type=None,
      time_field="expected_start_time",
      after=now - timedelta(minutes=minutes),
      before=now,
    )

  future_by_horizon: dict[int, set[str]] = {}
  for minutes, grouped in _group_entries_by_minutes(entries, "future_run_lookahead_minutes").items():
    ids = [
      str(live_by_identity[(entry["flow_name"], entry["deployment_name"])]["id"])
      for entry in grouped
    ]
    future_by_horizon[minutes] = _read_flow_run_deployment_ids(
      client,
      deployment_ids=ids,
      state_type="SCHEDULED",
      time_field="expected_start_time",
      after=now,
      before=now + timedelta(minutes=minutes),
    )

  return evaluate_snapshot(
    entries=entries,
    live_by_identity=live_by_identity,
    pool=pool,
    workers=workers,
    completed_by_slo=completed_by_slo,
    due_by_slo=due_by_slo,
    future_by_horizon=future_by_horizon,
    expected_pool_type=expected_pool_type,
  )


def apply_notification_policy(
  *,
  issues: list[Issue],
  previous: dict[str, Any],
  now: datetime,
  reminder_minutes: int,
  notify: Callable[[str, list[str]], bool],
) -> tuple[dict[str, Any], bool, str | None]:
  if reminder_minutes <= 0:
    raise ManifestError("watchdog reminder interval must be positive")
  if issues:
    fingerprint = _fingerprint(issues)
    current_issue_fingerprints = {_issue_fingerprint(issue) for issue in issues}
    previous_fault = previous.get("status") == "fault"
    known_issue_fingerprints = _known_issue_fingerprints(previous) if previous_fault else set()
    new_issue_fingerprints = current_issue_fingerprints - known_issue_fingerprints
    previous_notified = previous.get("last_notified_at")
    last_notified = None
    if isinstance(previous_notified, str):
      try:
        last_notified = datetime.fromisoformat(previous_notified.replace("Z", "+00:00"))
      except ValueError:
        last_notified = None
    notification_kind = None
    if not previous_fault or last_notified is None:
      notification_kind = "initial"
    elif new_issue_fingerprints:
      notification_kind = "new_issue"
    elif now - last_notified >= timedelta(minutes=reminder_minutes):
      notification_kind = "reminder"
    state = {
      "schema_version": 2,
      "status": "fault",
      "fingerprint": fingerprint,
      "last_checked_at": _iso(now),
      "last_notified_at": previous.get("last_notified_at"),
      "last_notification_kind": previous.get("last_notification_kind"),
      "known_issue_fingerprints": sorted(known_issue_fingerprints),
      "issues": [asdict(item) for item in issues],
    }
    notified = False
    if notification_kind is not None:
      try:
        notified = notify(
          "AIOS Prefect control plane unhealthy",
          [f"{item.code}: {item.identity}: {item.detail}" for item in issues],
        )
      except Exception:
        notified = False
      if not notified:
        return state, False, "watchdog notification was skipped or failed"
      state["last_notified_at"] = _iso(now)
      state["last_notification_kind"] = notification_kind
      state["known_issue_fingerprints"] = sorted(
        known_issue_fingerprints | current_issue_fingerprints
      )
    return state, notified, None

  if previous.get("status") == "fault":
    try:
      recovered = notify(
        "AIOS Prefect control plane recovered",
        ["All watchdog checks passed."],
      )
    except Exception:
      recovered = False
    if not recovered:
      retry_state = dict(previous)
      retry_state.update({
        "schema_version": 2,
        "last_checked_at": _iso(now),
        "recovery_pending": True,
      })
      return retry_state, False, "watchdog recovery notification was skipped or failed"
    return {
      "schema_version": 2,
      "status": "healthy",
      "fingerprint": None,
      "last_checked_at": _iso(now),
      "last_notified_at": _iso(now),
      "last_notification_kind": "recovery",
      "known_issue_fingerprints": [],
      "issues": [],
    }, True, None
  return {
    "schema_version": 2,
    "status": "healthy",
    "fingerprint": None,
    "last_checked_at": _iso(now),
    "last_notified_at": previous.get("last_notified_at"),
    "last_notification_kind": previous.get("last_notification_kind"),
    "known_issue_fingerprints": [],
    "issues": [],
  }, False, None


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
  parser.add_argument("--api-url", default=os.getenv("PREFECT_API_URL") or os.getenv("DATAOPS_PREFECT_API_URL"))
  parser.add_argument("--mode", choices=("legacy", "clean"), default=os.getenv("PREFECT_WATCHDOG_CONTROL_PLANE_MODE", "legacy"))
  parser.add_argument("--pool-type", default=os.getenv("PREFECT_WORK_POOL_TYPE", "process"))
  parser.add_argument("--state-path", type=Path, default=Path(os.getenv("PREFECT_WATCHDOG_STATE_PATH", str(DEFAULT_STATE_PATH))))
  parser.add_argument("--reminder-minutes", type=int, default=int(os.getenv("PREFECT_WATCHDOG_REMINDER_MINUTES", "1440")))
  parser.add_argument(
    "--check-only",
    action="store_true",
    help="Run read-only checks without reading/writing state or sending notifications.",
  )
  return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
  args = parse_args(argv)
  if not args.api_url:
    print("Prefect watchdog: FAIL missing Prefect API URL", file=sys.stderr)
    return 2
  now = _utc_now()
  try:
    manifest = load_manifest(args.manifest)
    try:
      issues = collect_issues(
        manifest,
        PrefectApiClient(args.api_url, timeout_seconds=10),
        mode=args.mode,
        expected_pool_type=args.pool_type,
        now=now,
      )
    except ManifestError as error:
      issues = [Issue("api_or_collection_failure", "control-plane", str(error))]

    if args.check_only:
      for issue in issues:
        print(f"Prefect watchdog issue: {issue.code} {issue.identity} {issue.detail}", file=sys.stderr)
      if issues:
        print(f"Prefect watchdog check-only: FAIL issues={len(issues)}", file=sys.stderr)
        return 1
      print("Prefect watchdog check-only: PASS")
      return 0

    previous = _read_state(args.state_path)

    def notify(title: str, detail_lines: list[str]) -> bool:
      return send_feishu_notification(
        title=title,
        table_name="prefect-control-plane",
        action="external-watchdog",
        status="failed" if issues else "recovered",
        reason=detail_lines[0] if detail_lines else "",
        detail_lines=detail_lines,
        raise_on_error=True,
      )

    state, notified, notification_error = apply_notification_policy(
      issues=issues,
      previous=previous,
      now=now,
      reminder_minutes=args.reminder_minutes,
      notify=notify,
    )
    _write_state(args.state_path, state)
    if notification_error:
      raise ManifestError(notification_error)
    if issues:
      for issue in issues:
        print(f"Prefect watchdog issue: {issue.code} {issue.identity} {issue.detail}", file=sys.stderr)
      print(f"Prefect watchdog: FAIL issues={len(issues)} notified={str(notified).lower()}", file=sys.stderr)
      return 1
    print(f"Prefect watchdog: PASS notified={str(notified).lower()}")
    return 0
  except Exception as error:
    print(f"Prefect watchdog: ERROR {error}", file=sys.stderr)
    return 2


if __name__ == "__main__":
  raise SystemExit(main())
