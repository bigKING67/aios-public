from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from sample_inventory.legacy_delta import (  # noqa: E402
  build_legacy_catch_up_plan,
  validate_catch_up_cutover,
)
from sample_inventory.legacy_model import (  # noqa: E402
  LegacyValidationError,
  SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
  load_legacy_import_plan,
)


def write_fixture(tmp_path: Path, name: str, payload: dict[str, object]) -> tuple[Path, str]:
  path = tmp_path / name
  body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
  path.write_bytes(body)
  return path, hashlib.sha256(body).hexdigest()


def baseline_payload() -> dict[str, object]:
  return {
    "samples": [
      {
        "id": 1,
        "code": "S-1",
        "name": "Synthetic sample",
        "model": "M1",
        "category": "fixture",
        "location": "",
        "remark": "",
        "quantity": 7,
      }
    ],
    "inboundLogs": [
      {
        "id": 2,
        "sampleId": 1,
        "sampleCode": "S-1",
        "sampleName": "Synthetic sample",
        "qty": 2,
        "tracking": "",
        "operator": "Fixture operator",
        "remark": "",
        "createdAt": "2026-07-20 10:00",
      }
    ],
    "outboundRequests": [
      {
        "id": 3,
        "sampleId": 1,
        "sampleCode": "S-1",
        "sampleName": "Synthetic sample",
        "qty": 1,
        "applicant": "Fixture applicant",
        "department": "Fixture department",
        "purpose": "Fixture purpose",
        "receiver": "",
        "address": "",
        "tracking": "",
        "status": "sampled",
        "createdAt": "2026-07-20 11:00",
      }
    ],
  }


def final_payload() -> dict[str, object]:
  payload = baseline_payload()
  payload["samples"][0]["quantity"] = 14  # type: ignore[index]
  payload["inboundLogs"].append(  # type: ignore[union-attr]
    {
      "id": 4,
      "sampleId": 1,
      "sampleCode": "S-1",
      "sampleName": "Synthetic sample",
      "qty": 9,
      "tracking": "",
      "operator": "Fixture operator",
      "remark": "",
      "createdAt": "2026-07-27 09:00",
    }
  )
  payload["outboundRequests"].extend(  # type: ignore[union-attr]
    [
      {
        "id": 5,
        "sampleId": 1,
        "sampleCode": "S-1",
        "sampleName": "Synthetic sample",
        "qty": 2,
        "applicant": "Fixture applicant",
        "department": "Fixture department",
        "purpose": "Fixture purpose",
        "receiver": "",
        "address": "",
        "tracking": "",
        "status": "sampled",
        "createdAt": "2026-07-27 10:00",
      },
      {
        "id": 6,
        "sampleId": 1,
        "sampleCode": "S-1",
        "sampleName": "Synthetic sample",
        "qty": 1,
        "applicant": "Fixture applicant",
        "department": "Fixture department",
        "purpose": "Fixture purpose",
        "receiver": "",
        "address": "",
        "tracking": "",
        "status": "rejected",
        "createdAt": "2026-07-27 11:00",
      },
      {
        "id": 7,
        "sampleId": 1,
        "sampleCode": "S-1",
        "sampleName": "Synthetic sample",
        "qty": 3,
        "applicant": "Fixture applicant",
        "department": "Fixture department",
        "purpose": "Fixture purpose",
        "receiver": "",
        "address": "",
        "tracking": "",
        "status": "approved",
        "createdAt": "2026-07-27 11:30",
      },
    ]
  )
  return payload


def load_pair(tmp_path: Path):
  baseline_path, baseline_sha = write_fixture(tmp_path, "baseline.json", baseline_payload())
  final_path, final_sha = write_fixture(tmp_path, "final.json", final_payload())
  return (
    load_legacy_import_plan(baseline_path, baseline_sha),
    load_legacy_import_plan(
      final_path,
      final_sha,
      supported_outbound_statuses=SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
    ),
  )


def test_delta_reconciles_only_new_records_without_replaying_opening_balance(tmp_path: Path) -> None:
  baseline, final = load_pair(tmp_path)

  plan = build_legacy_catch_up_plan(baseline, final)

  assert plan.summary == {
    "baselineSourceSha256": baseline.source_sha256,
    "sourceSha256": final.source_sha256,
    "samples": 1,
    "changedSampleBalances": 1,
    "newInboundRecords": 1,
    "newInboundUnits": 9,
    "newOutboundRequests": 3,
    "newSampledOutbounds": 1,
    "newApprovedOutbounds": 1,
    "newRejectedOutbounds": 1,
    "newSampledOutboundUnits": 2,
    "newApprovedOutboundUnits": 3,
    "netOnHandDelta": 7,
    "netReservedDelta": 0,
    "netAvailableDelta": 7,
    "finalOnHand": 14,
    "finalReserved": 0,
    "finalAvailable": 14,
  }
  assert plan.sample_deltas[0].baseline_quantity == 7
  assert plan.sample_deltas[0].net_quantity == 7
  assert plan.sample_deltas[0].net_on_hand_quantity == 7
  assert plan.sample_deltas[0].net_reserved_quantity == 0


def test_approved_status_does_not_change_manual_reservation_balance(tmp_path: Path) -> None:
  final = baseline_payload()
  final["inboundLogs"].append(  # type: ignore[union-attr]
    {
      "id": 4,
      "sampleId": 1,
      "sampleCode": "S-1",
      "sampleName": "Synthetic sample",
      "qty": 3,
      "tracking": "",
      "operator": "Fixture operator",
      "remark": "",
      "createdAt": "2026-07-27 09:00",
    }
  )
  final["outboundRequests"].append(  # type: ignore[union-attr]
    {
      "id": 5,
      "sampleId": 1,
      "sampleCode": "S-1",
      "sampleName": "Synthetic sample",
      "qty": 3,
      "applicant": "Fixture applicant",
      "department": "Fixture department",
      "purpose": "Fixture purpose",
      "receiver": "",
      "address": "",
      "tracking": "",
      "status": "approved",
      "createdAt": "2026-07-27 10:00",
    }
  )
  final["samples"][0]["quantity"] = 10  # type: ignore[index]
  baseline_path, baseline_sha = write_fixture(tmp_path, "baseline.json", baseline_payload())
  final_path, final_sha = write_fixture(tmp_path, "final.json", final)

  plan = build_legacy_catch_up_plan(
    load_legacy_import_plan(baseline_path, baseline_sha),
    load_legacy_import_plan(
      final_path,
      final_sha,
      supported_outbound_statuses=SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
    ),
  )

  assert plan.summary["changedSampleBalances"] == 1
  assert plan.summary["netAvailableDelta"] == 3
  assert plan.summary["netOnHandDelta"] == 3
  assert plan.summary["netReservedDelta"] == 0


@pytest.mark.parametrize("mutation", ["remove", "change"])
def test_delta_rejects_removed_or_changed_baseline_history(tmp_path: Path, mutation: str) -> None:
  final = final_payload()
  if mutation == "remove":
    final["outboundRequests"].pop(0)  # type: ignore[union-attr]
  else:
    final["outboundRequests"][0]["qty"] = 2  # type: ignore[index]
  baseline_path, baseline_sha = write_fixture(tmp_path, "baseline.json", baseline_payload())
  final_path, final_sha = write_fixture(tmp_path, "final.json", final)

  with pytest.raises(LegacyValidationError, match="baseline outbound"):
    build_legacy_catch_up_plan(
      load_legacy_import_plan(baseline_path, baseline_sha),
      load_legacy_import_plan(
        final_path,
        final_sha,
        supported_outbound_statuses=SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
      ),
    )


def test_delta_rejects_unexplained_sample_balance_or_master_data_change(tmp_path: Path) -> None:
  baseline, _ = load_pair(tmp_path)
  invalid = final_payload()
  invalid["samples"][0]["quantity"] = 15  # type: ignore[index]
  invalid_path, invalid_sha = write_fixture(tmp_path, "invalid-balance.json", invalid)
  with pytest.raises(LegacyValidationError, match="balances do not reconcile"):
    build_legacy_catch_up_plan(
      baseline,
      load_legacy_import_plan(
        invalid_path,
        invalid_sha,
        supported_outbound_statuses=SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
      ),
    )

  invalid = final_payload()
  invalid["samples"][0]["name"] = "Changed sample"  # type: ignore[index]
  invalid_path, invalid_sha = write_fixture(tmp_path, "invalid-master.json", invalid)
  with pytest.raises(LegacyValidationError, match="master-data drift"):
    build_legacy_catch_up_plan(
      baseline,
      load_legacy_import_plan(
        invalid_path,
        invalid_sha,
        supported_outbound_statuses=SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
      ),
    )


def test_delta_rejects_cutover_before_latest_source_record(tmp_path: Path) -> None:
  baseline, final = load_pair(tmp_path)
  plan = build_legacy_catch_up_plan(baseline, final)

  with pytest.raises(LegacyValidationError, match="cutover-at precedes"):
    validate_catch_up_cutover(plan, datetime.fromisoformat("2026-07-27T10:30:00+08:00"))

  validate_catch_up_cutover(plan, datetime.fromisoformat("2026-07-27T12:00:00+08:00"))
