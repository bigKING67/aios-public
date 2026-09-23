from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from sample_inventory.import_legacy import (  # noqa: E402
  WRITE_ACK,
  validate_apply_guard,
)
from sample_inventory.legacy_database import import_plan_in_transaction  # noqa: E402
from sample_inventory.legacy_model import (  # noqa: E402
  LegacyValidationError,
  load_legacy_import_plan,
)


def write_fixture(tmp_path: Path, payload: dict[str, object]) -> tuple[Path, str]:
  path = tmp_path / "data.json"
  body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
  path.write_bytes(body)
  return path, hashlib.sha256(body).hexdigest()


def valid_payload() -> dict[str, object]:
  return {
    "nextId": 9,
    "samples": [
      {
        "id": 1,
        "code": "S-1",
        "name": "Synthetic sample",
        "model": "M1",
        "category": "genuine",
        "location": "",
        "remark": "",
        "quantity": 7,
      },
      {
        "id": "中文-2",
        "code": "中文编码",
        "name": "Zero sample",
        "model": "",
        "category": "genuine",
        "location": "",
        "remark": "",
        "quantity": 0,
      },
    ],
    "inboundLogs": [
      {
        "id": 3,
        "sampleId": 1,
        "sampleCode": "S-1",
        "sampleName": "Synthetic sample",
        "qty": 4,
        "tracking": "",
        "operator": "Synthetic operator",
        "remark": "",
        "createdAt": "2026-07-01 10:20",
      }
    ],
    "outboundRequests": [
      {
        "id": 4,
        "sampleId": 1,
        "sampleCode": "S-1",
        "sampleName": "Synthetic sample",
        "qty": 2,
        "applicant": "Synthetic applicant",
        "department": "Synthetic department",
        "purpose": "Synthetic purpose",
        "receiver": "",
        "address": "",
        "tracking": "",
        "status": "sampled",
        "createdAt": "2026-07-02 11:30",
      },
      {
        "id": 5,
        "sampleId": "中文-2",
        "sampleCode": "中文编码",
        "sampleName": "Zero sample",
        "qty": 1,
        "applicant": "Synthetic applicant",
        "department": "Synthetic department",
        "purpose": "Synthetic purpose",
        "receiver": "",
        "address": "",
        "tracking": "",
        "status": "rejected",
        "createdAt": "2026-07-02 12:30",
      },
    ],
  }


def test_load_plan_uses_snapshot_balance_without_replaying_history(tmp_path: Path) -> None:
  path, digest = write_fixture(tmp_path, valid_payload())

  plan = load_legacy_import_plan(path, digest)

  assert plan.summary == {
    "sourceSha256": digest,
    "samples": 2,
    "inbounds": 1,
    "outbounds": 2,
    "sampled": 1,
    "rejected": 1,
    "available": 7,
    "reserved": 0,
    "onHand": 7,
    "orphans": 0,
  }
  assert plan.samples[1].code == "中文编码"
  assert plan.outbounds[0].requested_at.utcoffset() is not None


def test_load_plan_rejects_hash_drift_before_parsing(tmp_path: Path) -> None:
  path, _ = write_fixture(tmp_path, valid_payload())

  with pytest.raises(LegacyValidationError, match="SHA-256 mismatch"):
    load_legacy_import_plan(path, "0" * 64)


def test_load_plan_rejects_orphan_and_code_mismatch(tmp_path: Path) -> None:
  payload = valid_payload()
  payload["outboundRequests"][0]["sampleId"] = 999  # type: ignore[index]
  path, digest = write_fixture(tmp_path, payload)

  with pytest.raises(LegacyValidationError, match="unknown sample"):
    load_legacy_import_plan(path, digest)


def test_baseline_import_rejects_approved_status_without_catch_up_scope(tmp_path: Path) -> None:
  payload = valid_payload()
  payload["outboundRequests"][0]["status"] = "approved"  # type: ignore[index]
  path, digest = write_fixture(tmp_path, payload)

  with pytest.raises(LegacyValidationError, match="status is unsupported: approved"):
    load_legacy_import_plan(path, digest)


def test_apply_guard_fails_before_database_driver_use(monkeypatch: pytest.MonkeyPatch) -> None:
  args = argparse.Namespace(
    confirm_import=False,
    expected_git_sha="git-sha",
    expected_db_name="groland",
  )
  monkeypatch.delenv("AIOS_SAMPLE_INVENTORY_IMPORT_WRITE_ACK", raising=False)
  monkeypatch.delenv("DATABASE_URL", raising=False)

  with pytest.raises(LegacyValidationError, match="confirm-import"):
    validate_apply_guard(args, actual_git_sha="git-sha")


def test_apply_guard_requires_ack_git_and_database_pin(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  args = argparse.Namespace(
    confirm_import=True,
    expected_git_sha="git-sha",
    expected_db_name="groland",
  )
  monkeypatch.setenv("AIOS_SAMPLE_INVENTORY_IMPORT_WRITE_ACK", WRITE_ACK)
  monkeypatch.setenv("DATABASE_URL", "postgresql://redacted.invalid/groland")

  assert validate_apply_guard(args, actual_git_sha="git-sha").endswith("/groland")

  args.expected_git_sha = "stale-sha"
  with pytest.raises(LegacyValidationError, match="Git SHA mismatch"):
    validate_apply_guard(args, actual_git_sha="git-sha")


def test_import_rejects_duplicate_source_batch_before_writes(tmp_path: Path) -> None:
  path, digest = write_fixture(tmp_path, valid_payload())
  plan = load_legacy_import_plan(path, digest)

  class DuplicateBatchCursor:
    def __init__(self) -> None:
      self.execute_calls: list[tuple[object, object]] = []

    def execute(self, query: object, params: object) -> None:
      self.execute_calls.append((query, params))

    def fetchone(self) -> tuple[int]:
      return (73,)

  cursor = DuplicateBatchCursor()
  with pytest.raises(LegacyValidationError, match="already imported in batch 73"):
    import_plan_in_transaction(
      cursor,
      plan=plan,
      source_git_sha="git-sha",
      cutover_at=datetime.fromisoformat("2026-07-26T00:00:00+08:00"),
    )

  assert len(cursor.execute_calls) == 1
