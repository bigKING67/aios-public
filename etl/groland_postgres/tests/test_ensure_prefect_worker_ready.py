from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from ensure_prefect_worker_ready import (  # noqa: E402
  ApiNotFound,
  ReadinessError,
  ensure_work_pool,
  wait_for_api,
)


class SequenceClient:
  def __init__(self, responses):
    self.responses = list(responses)

  def request(self, method: str, path: str):
    del method, path
    if not self.responses:
      raise AssertionError("no response left")
    response = self.responses.pop(0)
    if isinstance(response, Exception):
      raise response
    return response


class PrefectWorkerReadinessTest(unittest.TestCase):
  def test_waits_until_health_is_true(self) -> None:
    ticks = iter([0.0, 0.0, 1.0, 1.0])
    sleeps: list[float] = []

    wait_for_api(
      SequenceClient([ReadinessError("connection refused"), False, True]),
      timeout_seconds=10,
      poll_interval_seconds=1,
      monotonic=lambda: next(ticks),
      sleep=sleeps.append,
    )

    self.assertEqual(sleeps, [1, 1])

  def test_times_out_with_last_error(self) -> None:
    ticks = iter([0.0, 0.0, 2.0])
    with self.assertRaisesRegex(ReadinessError, "connection refused"):
      wait_for_api(
        SequenceClient([ReadinessError("connection refused"), ReadinessError("connection refused")]),
        timeout_seconds=2,
        poll_interval_seconds=1,
        monotonic=lambda: next(ticks),
        sleep=lambda _: None,
      )

  def test_creates_only_missing_pool_and_validates_type(self) -> None:
    created: list[bool] = []
    state = ensure_work_pool(
      SequenceClient([ApiNotFound("pool"), {"type": "process", "is_paused": False}]),
      pool_name="default-agent-pool",
      expected_type="process",
      create_pool=lambda: created.append(True),
    )

    self.assertEqual(state, "existing")
    self.assertEqual(created, [True])

  def test_rejects_wrong_type_and_paused_pool(self) -> None:
    with self.assertRaisesRegex(ReadinessError, "type mismatch"):
      ensure_work_pool(
        SequenceClient([{"type": "docker", "is_paused": False}]),
        pool_name="default-agent-pool",
        expected_type="process",
        create_pool=lambda: None,
      )
    with self.assertRaisesRegex(ReadinessError, "is paused"):
      ensure_work_pool(
        SequenceClient([{"type": "process", "is_paused": True}]),
        pool_name="default-agent-pool",
        expected_type="process",
        create_pool=lambda: None,
      )


if __name__ == "__main__":
  unittest.main()
