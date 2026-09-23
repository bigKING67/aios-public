from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from manage_prefect_deployments import DEFAULT_MANIFEST, active_entries, load_manifest  # noqa: E402
from prefect_control_plane_watchdog import (  # noqa: E402
  Issue,
  ManifestError,
  _fingerprint,
  _read_flow_run_deployment_ids,
  apply_notification_policy,
  evaluate_snapshot,
)


NOW = datetime(2026, 8, 6, 8, 0, tzinfo=timezone.utc)


class PrefectControlPlaneWatchdogTest(unittest.TestCase):
  def setUp(self) -> None:
    self.manifest = load_manifest(DEFAULT_MANIFEST)
    self.entries = active_entries(self.manifest)
    self.live = {}
    completed = {}
    future = {}
    for index, entry in enumerate(self.entries, start=1):
      identity = (entry["flow_name"], entry["deployment_name"])
      deployment_id = f"deployment-{index}"
      self.live[identity] = {"id": deployment_id}
      success_slo = entry["watchdog"].get("success_slo_minutes")
      if success_slo is not None:
        completed.setdefault(int(success_slo), set()).add(deployment_id)
      horizon = entry["watchdog"].get("future_run_lookahead_minutes")
      if horizon is not None:
        future.setdefault(int(horizon), set()).add(deployment_id)
    self.completed = completed
    self.due = {minutes: set(ids) for minutes, ids in completed.items()}
    self.future = future

  def test_healthy_snapshot_and_each_decisive_failure(self) -> None:
    healthy = evaluate_snapshot(
      entries=self.entries,
      live_by_identity=self.live,
      pool={"type": "process", "is_paused": False},
      workers=[{"status": "ONLINE"}],
      completed_by_slo=self.completed,
      due_by_slo=self.due,
      future_by_horizon=self.future,
      expected_pool_type="process",
    )
    self.assertEqual(healthy, [])

    first = next(entry for entry in self.entries if entry["watchdog"].get("success_slo_minutes") is not None)
    first_id = self.live[(first["flow_name"], first["deployment_name"])]["id"]
    missing_completed = {minutes: set(ids) for minutes, ids in self.completed.items()}
    missing_completed[int(first["watchdog"]["success_slo_minutes"])].remove(first_id)
    issues = evaluate_snapshot(
      entries=self.entries,
      live_by_identity=self.live,
      pool={"type": "docker", "is_paused": True},
      workers=[{"status": "OFFLINE"}],
      completed_by_slo=missing_completed,
      due_by_slo=self.due,
      future_by_horizon={},
      expected_pool_type="process",
    )
    codes = {issue.code for issue in issues}
    self.assertIn("work_pool_type", codes)
    self.assertIn("work_pool_paused", codes)
    self.assertIn("worker_offline", codes)
    self.assertIn("recent_success_missing", codes)
    self.assertIn("future_run_missing", codes)

  def test_success_slo_waits_until_the_first_run_is_due(self) -> None:
    first = next(entry for entry in self.entries if entry["watchdog"].get("success_slo_minutes") is not None)
    first_id = self.live[(first["flow_name"], first["deployment_name"])]["id"]
    success_slo = int(first["watchdog"]["success_slo_minutes"])
    completed = {minutes: set(ids) for minutes, ids in self.completed.items()}
    completed[success_slo].remove(first_id)
    due = {minutes: set(ids) for minutes, ids in self.due.items()}
    due[success_slo].remove(first_id)

    issues = evaluate_snapshot(
      entries=self.entries,
      live_by_identity=self.live,
      pool={"type": "process", "is_paused": False},
      workers=[{"status": "ONLINE"}],
      completed_by_slo=completed,
      due_by_slo=due,
      future_by_horizon=self.future,
      expected_pool_type="process",
    )

    rendered = f"{first['flow_name']}/{first['deployment_name']}"
    self.assertNotIn(rendered, {issue.identity for issue in issues})

  def test_dormant_business_does_not_require_fresh_runs_but_worker_is_monitored(self) -> None:
    dormant = [entry for entry in self.entries if not entry["schedule"]["active"] and not any(entry["watchdog"].values())]
    self.assertTrue(any(entry["deployment_name"] == "ads-01-overview-daily-inc" for entry in dormant))
    issues = evaluate_snapshot(
      entries=dormant,
      live_by_identity=self.live,
      pool={"type": "process", "is_paused": False},
      workers=[{"status": "OFFLINE"}],
      completed_by_slo={},
      due_by_slo={},
      future_by_horizon={},
      expected_pool_type="process",
    )
    self.assertEqual([issue.code for issue in issues], ["worker_offline"])

  def test_notification_dedup_reminder_and_recovery(self) -> None:
    notifications: list[str] = []

    def notify(title: str, details: list[str]) -> bool:
      del details
      notifications.append(title)
      return True

    issues = [Issue("worker_offline", "control-plane", "no ONLINE Worker heartbeat")]
    first, first_notified, first_error = apply_notification_policy(
      issues=issues,
      previous={"status": "healthy"},
      now=NOW,
      reminder_minutes=60,
      notify=notify,
    )
    repeated, repeated_notified, repeated_error = apply_notification_policy(
      issues=issues,
      previous=first,
      now=NOW + timedelta(minutes=30),
      reminder_minutes=60,
      notify=notify,
    )
    reminded, reminder_notified, reminder_error = apply_notification_policy(
      issues=issues,
      previous=repeated,
      now=NOW + timedelta(minutes=61),
      reminder_minutes=60,
      notify=notify,
    )
    recovered, recovery_notified, recovery_error = apply_notification_policy(
      issues=[],
      previous=reminded,
      now=NOW + timedelta(minutes=62),
      reminder_minutes=60,
      notify=notify,
    )

    self.assertTrue(first_notified)
    self.assertIsNone(first_error)
    self.assertFalse(repeated_notified)
    self.assertIsNone(repeated_error)
    self.assertTrue(reminder_notified)
    self.assertIsNone(reminder_error)
    self.assertTrue(recovery_notified)
    self.assertIsNone(recovery_error)
    self.assertEqual(recovered["status"], "healthy")
    self.assertEqual(len(notifications), 3)

  def test_partial_recovery_and_known_issue_reappearance_do_not_realert(self) -> None:
    notifications: list[str] = []

    def notify(title: str, details: list[str]) -> bool:
      del details
      notifications.append(title)
      return True

    issue_a = Issue("a", "deployment-a", "failed")
    issue_b = Issue("b", "deployment-b", "failed")
    issue_c = Issue("c", "deployment-c", "failed")
    initial, initial_notified, _ = apply_notification_policy(
      issues=[issue_a, issue_b],
      previous={"status": "healthy"},
      now=NOW,
      reminder_minutes=60,
      notify=notify,
    )
    partial, partial_notified, _ = apply_notification_policy(
      issues=[issue_a],
      previous=initial,
      now=NOW + timedelta(minutes=5),
      reminder_minutes=60,
      notify=notify,
    )
    changed, changed_notified, _ = apply_notification_policy(
      issues=[issue_c],
      previous=partial,
      now=NOW + timedelta(minutes=10),
      reminder_minutes=60,
      notify=notify,
    )
    reappeared, reappeared_notified, _ = apply_notification_policy(
      issues=[issue_a, issue_b],
      previous=changed,
      now=NOW + timedelta(minutes=15),
      reminder_minutes=60,
      notify=notify,
    )

    self.assertTrue(initial_notified)
    self.assertFalse(partial_notified)
    self.assertTrue(changed_notified)
    self.assertFalse(reappeared_notified)
    self.assertEqual(reappeared["last_notification_kind"], "new_issue")
    self.assertEqual(len(notifications), 2)

  def test_issue_fingerprint_is_order_independent(self) -> None:
    issue_a = Issue("a", "deployment-a", "failed")
    issue_b = Issue("b", "deployment-b", "failed")
    self.assertEqual(_fingerprint([issue_a, issue_b]), _fingerprint([issue_b, issue_a]))

  def test_schema_v1_fault_state_migrates_without_replaying_known_issues(self) -> None:
    issue = Issue("a", "deployment-a", "failed")
    state, notified, error = apply_notification_policy(
      issues=[issue],
      previous={
        "schema_version": 1,
        "status": "fault",
        "fingerprint": _fingerprint([issue]),
        "last_checked_at": "2026-08-06T07:55:00Z",
        "last_notified_at": "2026-08-06T07:55:00Z",
        "issues": [{"code": issue.code, "identity": issue.identity, "detail": issue.detail}],
      },
      now=NOW,
      reminder_minutes=60,
      notify=lambda _title, _details: True,
    )

    self.assertFalse(notified)
    self.assertIsNone(error)
    self.assertEqual(state["schema_version"], 2)
    self.assertEqual(len(state["known_issue_fingerprints"]), 1)

  def test_notification_failure_is_not_silently_accepted(self) -> None:
    state, notified, error = apply_notification_policy(
      issues=[Issue("api_down", "control-plane", "unreachable")],
      previous={"status": "healthy"},
      now=NOW,
      reminder_minutes=60,
      notify=lambda _title, _details: False,
    )

    self.assertEqual(state["status"], "fault")
    self.assertIsNone(state["last_notified_at"])
    self.assertFalse(notified)
    self.assertEqual(error, "watchdog notification was skipped or failed")

    retried, retry_notified, retry_error = apply_notification_policy(
      issues=[Issue("api_down", "control-plane", "unreachable")],
      previous=state,
      now=NOW + timedelta(minutes=5),
      reminder_minutes=60,
      notify=lambda _title, _details: True,
    )
    self.assertTrue(retry_notified)
    self.assertIsNone(retry_error)
    self.assertEqual(retried["last_notified_at"], "2026-08-06T08:05:00Z")

  def test_failed_new_issue_notification_retries_on_the_next_check(self) -> None:
    issue_a = Issue("a", "deployment-a", "failed")
    issue_b = Issue("b", "deployment-b", "failed")
    initial, _, _ = apply_notification_policy(
      issues=[issue_a],
      previous={"status": "healthy"},
      now=NOW,
      reminder_minutes=60,
      notify=lambda _title, _details: True,
    )
    failed, failed_notified, failed_error = apply_notification_policy(
      issues=[issue_a, issue_b],
      previous=initial,
      now=NOW + timedelta(minutes=5),
      reminder_minutes=60,
      notify=lambda _title, _details: False,
    )
    retried, retry_notified, retry_error = apply_notification_policy(
      issues=[issue_a, issue_b],
      previous=failed,
      now=NOW + timedelta(minutes=10),
      reminder_minutes=60,
      notify=lambda _title, _details: True,
    )

    self.assertFalse(failed_notified)
    self.assertEqual(failed_error, "watchdog notification was skipped or failed")
    self.assertTrue(retry_notified)
    self.assertIsNone(retry_error)
    self.assertEqual(retried["last_notification_kind"], "new_issue")

  def test_flow_run_lookup_paginates_before_evaluating_deployment_coverage(self) -> None:
    class PaginatedClient:
      def __init__(self):
        self.offsets: list[int] = []

      def request(self, method: str, path: str, body: dict | None = None):
        if method != "POST" or path != "/flow_runs/filter" or body is None:
          raise AssertionError("unexpected flow-run pagination request")
        self.offsets.append(body["offset"])
        rows = [
          {"deployment_id": f"deployment-{index}"}
          for index in range(201)
        ]
        offset = body["offset"]
        return rows[offset:offset + body["limit"]]

    client = PaginatedClient()
    observed = _read_flow_run_deployment_ids(
      client,
      deployment_ids=["deployment-0", "deployment-200"],
      state_type="COMPLETED",
      time_field="end_time",
      after=NOW - timedelta(minutes=60),
    )
    self.assertIn("deployment-0", observed)
    self.assertIn("deployment-200", observed)
    self.assertEqual(client.offsets, [0, 200])

  def test_due_run_lookup_has_a_bounded_time_filter_without_a_state_filter(self) -> None:
    class DueRunClient:
      def __init__(self):
        self.body: dict | None = None

      def request(self, method: str, path: str, body: dict | None = None):
        if method != "POST" or path != "/flow_runs/filter" or body is None:
          raise AssertionError("unexpected due-run request")
        self.body = body
        return []

    client = DueRunClient()
    observed = _read_flow_run_deployment_ids(
      client,
      deployment_ids=["deployment-1"],
      state_type=None,
      time_field="expected_start_time",
      after=NOW - timedelta(minutes=60),
      before=NOW,
    )

    self.assertEqual(observed, set())
    assert client.body is not None
    flow_runs = client.body["flow_runs"]
    self.assertNotIn("state", flow_runs)
    self.assertEqual(flow_runs["expected_start_time"]["before_"], "2026-08-06T08:00:00Z")

  def test_failed_recovery_remains_fault_for_next_timer_retry(self) -> None:
    previous = {
      "schema_version": 1,
      "status": "fault",
      "fingerprint": "abc",
      "last_checked_at": "2026-08-06T07:55:00Z",
      "last_notified_at": "2026-08-06T07:55:00Z",
      "issues": [{"code": "api_down", "identity": "control-plane", "detail": "down"}],
    }
    state, notified, error = apply_notification_policy(
      issues=[],
      previous=previous,
      now=NOW,
      reminder_minutes=60,
      notify=lambda _title, _details: False,
    )

    self.assertEqual(state["status"], "fault")
    self.assertTrue(state["recovery_pending"])
    self.assertFalse(notified)
    self.assertEqual(error, "watchdog recovery notification was skipped or failed")


if __name__ == "__main__":
  unittest.main()
