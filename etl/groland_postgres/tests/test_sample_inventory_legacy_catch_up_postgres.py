from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from sample_inventory.legacy_catch_up_database import (  # noqa: E402
  CATCH_UP_SOURCE_KIND,
  import_chained_catch_up_in_transaction,
  import_catch_up_in_transaction,
  verify_chained_catch_up_database_state,
  verify_catch_up_database_state,
)
from sample_inventory.catch_up_legacy import (  # noqa: E402
  ChainedCatchUpPlans,
  database_identity_sha256,
  main as catch_up_main,
  verify_chained_catch_up_database,
  verify_catch_up_database,
)
from sample_inventory.legacy_database import import_plan_in_transaction  # noqa: E402
from sample_inventory.legacy_delta import build_legacy_catch_up_plan  # noqa: E402
from sample_inventory.legacy_model import (  # noqa: E402
  SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
  load_legacy_import_plan,
)


DATABASE_URL = os.environ.get("SAMPLE_INVENTORY_CATCH_UP_TEST_DATABASE_URL")
MANUAL_RESERVATION_MIGRATION_SQL = (
  Path(__file__).resolve().parents[3]
  / "sql/migrations/016_sample_inventory_manual_reservation_semantics.sql"
).read_text(encoding="utf-8")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="requires disposable sample inventory PostgreSQL")


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


def second_final_payload() -> dict[str, object]:
  payload = final_payload()
  payload["samples"][0]["quantity"] = 10  # type: ignore[index]
  payload["outboundRequests"].append(  # type: ignore[union-attr]
    {
      "id": 8,
      "sampleId": 1,
      "sampleCode": "S-1",
      "sampleName": "Synthetic sample",
      "qty": 4,
      "applicant": "Fixture applicant",
      "department": "Fixture department",
      "purpose": "Fixture purpose",
      "receiver": "",
      "address": "",
      "tracking": "",
      "status": "sampled",
      "createdAt": "2026-07-27 12:00",
    }
  )
  return payload


def counts(cursor) -> tuple[int, int, int, int, int, int, int]:
  cursor.execute(
    """
    SELECT
      (SELECT on_hand_quantity FROM sample_inventory.samples WHERE legacy_id = '1'),
      (SELECT reserved_quantity FROM sample_inventory.samples WHERE legacy_id = '1'),
      (SELECT COUNT(*) FROM sample_inventory.inbound_records),
      (SELECT COUNT(*) FROM sample_inventory.outbound_requests),
      (SELECT COUNT(*) FROM sample_inventory.inventory_movements),
      (SELECT COUNT(*) FROM sample_inventory.business_events),
      (SELECT COUNT(*) FROM sample_inventory.import_batches)
    """
  )
  return tuple(int(value) for value in cursor.fetchone())


def insert_zero_net_overlay(cursor) -> None:
  cursor.execute(
    """
    INSERT INTO sample_inventory.samples (
      sample_code,
      sample_name,
      on_hand_quantity,
      reserved_quantity,
      version,
      created_by,
      updated_by,
      archived_at,
      archived_by
    )
    VALUES ('SMOKE-FIXTURE', 'Synthetic smoke sample', 0, 0, 4, 'fixture', 'fixture', NOW(), 'fixture')
    RETURNING id
    """
  )
  sample_id = int(cursor.fetchone()[0])
  cursor.execute(
    """
    INSERT INTO sample_inventory.inbound_records (
      sample_id,
      quantity,
      occurred_at,
      version,
      source_kind,
      source_record_id,
      created_by,
      voided_at,
      voided_by,
      void_reason
    )
    VALUES (%s, 2, NOW(), 2, 'fixture_smoke', 'fixture-inbound', 'fixture', NOW(), 'fixture', 'fixture')
    RETURNING id
    """,
    (sample_id,),
  )
  inbound_id = int(cursor.fetchone()[0])
  cursor.execute(
    """
    INSERT INTO sample_inventory.inventory_movements (
      sample_id,
      movement_type,
      on_hand_delta,
      reserved_delta,
      resulting_on_hand_quantity,
      resulting_reserved_quantity,
      source_type,
      source_id,
      actor_user_id
    )
    VALUES
      (%s, 'fixture_smoke_inbound', 2, 0, 2, 0, 'fixture_smoke', %s, 'fixture'),
      (%s, 'fixture_smoke_void', -2, 0, 0, 0, 'fixture_smoke', %s, 'fixture')
    """,
    (sample_id, str(inbound_id), sample_id, str(inbound_id)),
  )
  cursor.execute(
    """
    INSERT INTO sample_inventory.business_events (
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      actor_user_id
    )
    VALUES
      ('sample', %s, 'fixture.smoke.archived', '{}'::JSONB, 'fixture'),
      ('inbound_record', %s, 'fixture.smoke.voided', '{}'::JSONB, 'fixture')
    """,
    (str(sample_id), str(inbound_id)),
  )


def insert_closed_legacy_outbound_overlay(cursor) -> None:
  cursor.execute(
    "SELECT id, sample_code, on_hand_quantity FROM sample_inventory.samples WHERE legacy_id = '1'"
  )
  sample_id, sample_code, on_hand = cursor.fetchone()
  sample_id = int(sample_id)
  on_hand = int(on_hand)
  cursor.execute(
    """
    INSERT INTO sample_inventory.outbound_requests (
      sample_id,
      quantity,
      applicant,
      department,
      purpose,
      status,
      requested_at,
      approved_at,
      approved_by,
      sampled_at,
      sampled_by,
      time_quality,
      version,
      created_by,
      updated_by,
      archived_at,
      archived_by
    )
    VALUES (%s, 1, 'Fixture applicant', 'Fixture department', 'Fixture purpose',
            'sampled', NOW(), NOW(), 'fixture', NOW(), 'fixture', 'known', 4,
            'fixture', 'fixture', NOW(), 'fixture')
    RETURNING id
    """,
    (sample_id,),
  )
  sampled_id = int(cursor.fetchone()[0])
  cursor.execute(
    """
    INSERT INTO sample_inventory.outbound_requests (
      sample_id,
      quantity,
      applicant,
      department,
      purpose,
      status,
      requested_at,
      rejected_at,
      rejected_by,
      time_quality,
      version,
      created_by,
      updated_by,
      archived_at,
      archived_by
    )
    VALUES (%s, 1, 'Fixture applicant', 'Fixture department', 'Fixture purpose',
            'rejected', NOW(), NOW(), 'fixture', 'known', 3,
            'fixture', 'fixture', NOW(), 'fixture')
    RETURNING id
    """,
    (sample_id,),
  )
  rejected_id = int(cursor.fetchone()[0])

  movement_rows = (
    ("outbound_approved_to_sampled", -1, 0, on_hand - 1, 0),
    ("outbound_archived_compensation", 1, 0, on_hand, 0),
  )
  for movement_type, on_hand_delta, reserved_delta, resulting_on_hand, resulting_reserved in movement_rows:
    cursor.execute(
      """
      INSERT INTO sample_inventory.inventory_movements (
        sample_id,
        movement_type,
        on_hand_delta,
        reserved_delta,
        resulting_on_hand_quantity,
        resulting_reserved_quantity,
        source_type,
        source_id,
        actor_user_id,
        metadata
      )
      VALUES (%s, %s, %s, %s, %s, %s, 'outbound_request', %s, 'fixture', '{}'::JSONB)
      """,
      (
        sample_id,
        movement_type,
        on_hand_delta,
        reserved_delta,
        resulting_on_hand,
        resulting_reserved,
        str(sampled_id),
      ),
    )
  cursor.execute(
    "UPDATE sample_inventory.samples SET version = version + 2, updated_by = 'fixture' WHERE id = %s",
    (sample_id,),
  )

  event_rows = [
    ("outbound_request", sampled_id, "outbound.created", {}),
    ("outbound_request", sampled_id, "outbound.transitioned", {}),
    ("outbound_request", sampled_id, "outbound.transitioned", {}),
    ("outbound_request", sampled_id, "outbound.archived", {}),
    ("outbound_request", rejected_id, "outbound.created", {}),
    ("outbound_request", rejected_id, "outbound.transitioned", {}),
    ("outbound_request", rejected_id, "outbound.archived", {}),
    ("sample", sample_id, "sample.outbound_requested", {"requestId": sampled_id, "sampleId": sample_id}),
    ("sample", sample_id, "sample.outbound_requested", {"requestId": rejected_id, "sampleId": sample_id}),
  ]
  event_rows.extend(
    (
      "sample",
      sample_id,
      "inventory.movement.recorded",
      {
        "sampleId": sample_id,
        "sampleCode": sample_code,
        "sourceType": "outbound_request",
        "sourceId": str(sampled_id),
      },
    )
    for _ in movement_rows
  )
  for aggregate_type, aggregate_id, event_type, payload in event_rows:
    cursor.execute(
      """
      INSERT INTO sample_inventory.business_events (
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        actor_user_id
      )
      VALUES (%s, %s, %s, %s::JSONB, 'fixture')
      """,
      (aggregate_type, str(aggregate_id), event_type, json.dumps(payload)),
    )

  mutations = [
    (
      "outbound.create_batch",
      "fixture-create-batch",
      "1" * 64,
      {"items": [{"id": sampled_id}, {"id": rejected_id}]},
    ),
    ("outbound.transition", "fixture-transition-sampled-1", "2" * 64, {"id": sampled_id}),
    ("outbound.transition", "fixture-transition-sampled-2", "3" * 64, {"id": sampled_id}),
    ("outbound.transition", "fixture-transition-rejected", "4" * 64, {"id": rejected_id}),
    (
      "outbound.archive_batch",
      "fixture-archive-batch",
      "5" * 64,
      {"items": [{"id": sampled_id}, {"id": rejected_id}]},
    ),
  ]
  for operation, submission_key, request_sha, response in mutations:
    cursor.execute(
      """
      INSERT INTO sample_inventory.mutation_requests (
        operation,
        submission_key,
        request_sha256,
        actor_user_id,
        response_payload,
        completed_at
      )
      VALUES (%s, %s, %s, 'fixture', %s::JSONB, NOW())
      """,
      (operation, submission_key, request_sha, json.dumps(response)),
    )


def insert_closed_legacy_inbound_overlay(cursor) -> None:
  cursor.execute(
    "SELECT id, sample_code, on_hand_quantity, reserved_quantity FROM sample_inventory.samples WHERE legacy_id = '1'"
  )
  sample_id, sample_code, on_hand, reserved = cursor.fetchone()
  sample_id = int(sample_id)
  on_hand = int(on_hand)
  reserved = int(reserved)
  cursor.execute(
    """
    INSERT INTO sample_inventory.inbound_records (
      sample_id,
      quantity,
      occurred_at,
      time_quality,
      version,
      created_by,
      voided_at,
      voided_by,
      void_reason
    )
    VALUES (%s, 1, NOW(), 'known', 2, 'fixture', NOW(), 'fixture', 'fixture')
    RETURNING id
    """,
    (sample_id,),
  )
  inbound_id = int(cursor.fetchone()[0])
  movement_rows = (
    ("inbound_received", 1, on_hand + 1),
    ("inbound_voided", -1, on_hand),
  )
  movement_ids: list[int] = []
  for movement_type, on_hand_delta, resulting_on_hand in movement_rows:
    cursor.execute(
      """
      INSERT INTO sample_inventory.inventory_movements (
        sample_id,
        movement_type,
        on_hand_delta,
        reserved_delta,
        resulting_on_hand_quantity,
        resulting_reserved_quantity,
        source_type,
        source_id,
        actor_user_id
      )
      VALUES (%s, %s, %s, 0, %s, %s, 'inbound_record', %s, 'fixture')
      RETURNING id
      """,
      (sample_id, movement_type, on_hand_delta, resulting_on_hand, reserved, str(inbound_id)),
    )
    movement_ids.append(int(cursor.fetchone()[0]))
  cursor.execute(
    "UPDATE sample_inventory.samples SET version = version + 2, updated_by = 'fixture' WHERE id = %s",
    (sample_id,),
  )
  event_rows = [
    ("inbound_record", inbound_id, "inbound.created", {}),
    ("inbound_record", inbound_id, "inbound.voided", {}),
    *(
      (
        "sample",
        sample_id,
        "inventory.movement.recorded",
        {"movementId": movement_id, "sourceType": "inbound_record", "sourceId": str(inbound_id)},
      )
      for movement_id in movement_ids
    ),
  ]
  for aggregate_type, aggregate_id, event_type, payload in event_rows:
    cursor.execute(
      """
      INSERT INTO sample_inventory.business_events (
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        actor_user_id
      )
      VALUES (%s, %s, %s, %s::JSONB, 'fixture')
      """,
      (aggregate_type, str(aggregate_id), event_type, json.dumps(payload)),
    )
  for index, operation in enumerate(("inbound.create", "inbound.void"), start=6):
    cursor.execute(
      """
      INSERT INTO sample_inventory.mutation_requests (
        operation,
        submission_key,
        request_sha256,
        actor_user_id,
        response_payload,
        completed_at
      )
      VALUES (%s, %s, %s, 'fixture', %s::JSONB, NOW())
      """,
      (operation, f"fixture-{operation}", str(index) * 64, json.dumps({"id": inbound_id})),
    )


def insert_zero_net_imported_outbound_overlay(cursor) -> None:
  cursor.execute(
    """
    SELECT outbound.id, outbound.sample_id, outbound.quantity,
           sample.on_hand_quantity, sample.reserved_quantity
    FROM sample_inventory.outbound_requests AS outbound
    JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
    WHERE outbound.source_kind = %s AND outbound.source_record_id = '5'
    """,
    (CATCH_UP_SOURCE_KIND,),
  )
  outbound_id, sample_id, quantity, on_hand, reserved = (int(value) for value in cursor.fetchone())
  movement_rows = (
    ("outbound_sampled_to_approved", quantity, 0, on_hand + quantity, reserved),
    ("outbound_approved_to_sampled", -quantity, 0, on_hand, reserved),
  )
  movement_ids: list[int] = []
  for movement_type, on_hand_delta, reserved_delta, resulting_on_hand, resulting_reserved in movement_rows:
    cursor.execute(
      """
      INSERT INTO sample_inventory.inventory_movements (
        sample_id,
        movement_type,
        on_hand_delta,
        reserved_delta,
        resulting_on_hand_quantity,
        resulting_reserved_quantity,
        source_type,
        source_id,
        actor_user_id
      )
      VALUES (%s, %s, %s, %s, %s, %s, 'outbound_request', %s, 'fixture')
      RETURNING id
      """,
      (
        sample_id,
        movement_type,
        on_hand_delta,
        reserved_delta,
        resulting_on_hand,
        resulting_reserved,
        str(outbound_id),
      ),
    )
    movement_ids.append(int(cursor.fetchone()[0]))
  cursor.execute(
    "UPDATE sample_inventory.samples SET version = version + 2, updated_by = 'fixture' WHERE id = %s",
    (sample_id,),
  )
  cursor.execute(
    "UPDATE sample_inventory.outbound_requests SET version = version + 6, updated_by = 'fixture' WHERE id = %s",
    (outbound_id,),
  )
  for event_type in (*("outbound.transitioned" for _ in range(4)), "outbound.updated", "outbound.updated"):
    cursor.execute(
      """
      INSERT INTO sample_inventory.business_events (
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        actor_user_id
      )
      VALUES ('outbound_request', %s, %s, '{}'::JSONB, 'fixture')
      """,
      (str(outbound_id), event_type),
    )
  for movement_id in movement_ids:
    cursor.execute(
      """
      INSERT INTO sample_inventory.business_events (
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        actor_user_id
      )
      VALUES ('sample', %s, 'inventory.movement.recorded', %s::JSONB, 'fixture')
      """,
      (
        str(sample_id),
        json.dumps({
          "movementId": movement_id,
          "sourceType": "outbound_request",
          "sourceId": str(outbound_id),
        }),
      ),
    )
  mutations = (
    ("outbound.transition", {"id": outbound_id}),
    ("outbound.transition_batch", {"items": [{"id": outbound_id}]}),
    ("outbound.transition_batch", {"items": [{"id": outbound_id}]}),
    ("outbound.transition", {"id": outbound_id}),
    ("outbound.edit_batch", {"items": [{"id": outbound_id}]}),
    ("outbound.edit_batch", {"items": [{"id": outbound_id}]}),
  )
  for index, (operation, response) in enumerate(mutations, start=8):
    cursor.execute(
      """
      INSERT INTO sample_inventory.mutation_requests (
        operation,
        submission_key,
        request_sha256,
        actor_user_id,
        response_payload,
        completed_at
      )
      VALUES (%s, %s, %s, 'fixture', %s::JSONB, NOW())
      """,
      (operation, f"fixture-imported-{index}", format(index, "x") * 64, json.dumps(response)),
    )


def test_catch_up_is_atomic_reconciled_and_exactly_replayable(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
  capsys: pytest.CaptureFixture[str],
) -> None:
  import psycopg2

  baseline_path, baseline_sha = write_fixture(tmp_path, "baseline.json", baseline_payload())
  final_path, final_sha = write_fixture(tmp_path, "final.json", final_payload())
  second_final_path, second_final_sha = write_fixture(
    tmp_path,
    "second-final.json",
    second_final_payload(),
  )
  baseline = load_legacy_import_plan(baseline_path, baseline_sha)
  final = load_legacy_import_plan(
    final_path,
    final_sha,
    supported_outbound_statuses=SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
  )
  plan = build_legacy_catch_up_plan(baseline, final)
  second_final = load_legacy_import_plan(
    second_final_path,
    second_final_sha,
    supported_outbound_statuses=SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
  )
  chained_plans = ChainedCatchUpPlans(
    parent_cumulative=plan,
    cumulative=build_legacy_catch_up_plan(baseline, second_final),
    stage=build_legacy_catch_up_plan(final, second_final),
    expected_parent_batch_id=3,
  )
  cutover_at = datetime.fromisoformat("2026-07-27T12:00:00+08:00")

  connection = psycopg2.connect(DATABASE_URL)
  try:
    with connection.cursor() as cursor:
      baseline_batch_id = import_plan_in_transaction(
        cursor,
        plan=baseline,
        source_git_sha="fixture-git-sha",
        cutover_at=datetime.fromisoformat("2026-07-22T14:00:00+08:00"),
      )
    connection.commit()
    assert baseline_batch_id == 1

    with connection.cursor() as cursor:
      _, _, empty_overlay = verify_catch_up_database_state(
        cursor,
        plan=plan,
        expected_baseline_batch_id=baseline_batch_id,
        expected_overlay_sha256=None,
        lock_rows=False,
      )
      _, _, repeated_empty_overlay = verify_catch_up_database_state(
        cursor,
        plan=plan,
        expected_baseline_batch_id=baseline_batch_id,
        expected_overlay_sha256=empty_overlay.sha256,
        lock_rows=False,
      )
    connection.rollback()
    assert empty_overlay.summary == {
      "sha256": empty_overlay.sha256,
      "samples": 0,
      "inbounds": 0,
      "outbounds": 0,
      "movements": 0,
      "events": 0,
      "mutations": 0,
    }
    assert repeated_empty_overlay.sha256 == empty_overlay.sha256

    with connection.cursor() as cursor:
      cursor.execute("ALTER TABLE sample_inventory.inventory_movements DISABLE TRIGGER USER")
      cursor.execute(
        """
        UPDATE sample_inventory.inventory_movements
        SET metadata = '{}'::JSONB
        WHERE import_batch_id = %s
        """,
        (baseline_batch_id,),
      )
      cursor.execute("ALTER TABLE sample_inventory.inventory_movements ENABLE TRIGGER USER")
      with pytest.raises(Exception, match="movement baseline"):
        verify_catch_up_database_state(
          cursor,
          plan=plan,
          expected_baseline_batch_id=baseline_batch_id,
          expected_overlay_sha256=empty_overlay.sha256,
          lock_rows=False,
        )
    connection.rollback()

    with connection.cursor() as cursor:
      cursor.execute("ALTER TABLE sample_inventory.business_events DISABLE TRIGGER USER")
      cursor.execute(
        """
        UPDATE sample_inventory.business_events
        SET event_type = 'fixture.corrupt'
        WHERE id = (
          SELECT MIN(id)
          FROM sample_inventory.business_events
          WHERE import_batch_id = %s
        )
        """,
        (baseline_batch_id,),
      )
      cursor.execute("ALTER TABLE sample_inventory.business_events ENABLE TRIGGER USER")
      with pytest.raises(Exception, match="event baseline"):
        verify_catch_up_database_state(
          cursor,
          plan=plan,
          expected_baseline_batch_id=baseline_batch_id,
          expected_overlay_sha256=empty_overlay.sha256,
          lock_rows=False,
        )
    connection.rollback()

    with connection.cursor() as cursor:
      insert_zero_net_overlay(cursor)
    connection.commit()

    with connection.cursor() as cursor:
      _, _, overlay = verify_catch_up_database_state(
        cursor,
        plan=plan,
        expected_baseline_batch_id=baseline_batch_id,
        expected_overlay_sha256=None,
        lock_rows=False,
      )
    connection.rollback()
    assert overlay.summary == {
      "sha256": overlay.sha256,
      "samples": 1,
      "inbounds": 1,
      "outbounds": 0,
      "movements": 2,
      "events": 2,
      "mutations": 0,
    }

    with connection.cursor() as cursor:
      cursor.execute(
        "UPDATE sample_inventory.samples SET on_hand_quantity = 1 WHERE sample_code = 'SMOKE-FIXTURE'"
      )
      with pytest.raises(Exception, match="active or has stock"):
        verify_catch_up_database_state(
          cursor,
          plan=plan,
          expected_baseline_batch_id=baseline_batch_id,
          expected_overlay_sha256=overlay.sha256,
          lock_rows=False,
        )
    connection.rollback()

    with connection.cursor() as cursor:
      cursor.execute(
        """
        INSERT INTO sample_inventory.outbound_requests (
          sample_id,
          quantity,
          applicant,
          department,
          purpose,
          status,
          source_kind,
          source_record_id,
          created_by,
          updated_by
        )
        SELECT id, 1, 'Fixture applicant', 'Fixture department', 'Fixture purpose',
               'pending', 'fixture_smoke', 'fixture-outbound', 'fixture', 'fixture'
        FROM sample_inventory.samples
        WHERE sample_code = 'SMOKE-FIXTURE'
        """
      )
      with pytest.raises(Exception, match="contains an outbound request"):
        verify_catch_up_database_state(
          cursor,
          plan=plan,
          expected_baseline_batch_id=baseline_batch_id,
          expected_overlay_sha256=overlay.sha256,
          lock_rows=False,
        )
    connection.rollback()

    with connection.cursor() as cursor:
      with pytest.raises(Exception, match="overlay SHA-256"):
        import_catch_up_in_transaction(
          cursor,
          plan=plan,
          source_git_sha="fixture-git-sha",
          cutover_at=cutover_at,
          expected_baseline_batch_id=baseline_batch_id,
          expected_overlay_sha256="0" * 64,
        )
    connection.rollback()

    with connection.cursor() as cursor:
      insert_closed_legacy_outbound_overlay(cursor)
    connection.commit()
    with connection.cursor() as cursor:
      _, _, overlay = verify_catch_up_database_state(
        cursor,
        plan=plan,
        expected_baseline_batch_id=baseline_batch_id,
        expected_overlay_sha256=None,
        lock_rows=False,
      )
    connection.rollback()
    assert overlay.summary == {
      "sha256": overlay.sha256,
      "samples": 1,
      "inbounds": 1,
      "outbounds": 2,
      "movements": 4,
      "events": 13,
      "mutations": 5,
    }
    assert overlay.legacy_sample_version_offsets == {"1": 2}

    with connection.cursor() as cursor:
      cursor.execute(
        """
        UPDATE sample_inventory.outbound_requests
        SET archived_at = NULL, archived_by = NULL
        WHERE source_kind IS NULL
        """
      )
      with pytest.raises(Exception, match="active or unsupported"):
        verify_catch_up_database_state(
          cursor,
          plan=plan,
          expected_baseline_batch_id=baseline_batch_id,
          expected_overlay_sha256=overlay.sha256,
          lock_rows=False,
        )
    connection.rollback()

    with connection.cursor() as cursor:
      cursor.execute(
        """
        UPDATE sample_inventory.mutation_requests
        SET response_payload = jsonb_set(response_payload, '{id}', '999999'::JSONB)
        WHERE operation = 'outbound.transition'
          AND id = (SELECT MIN(id) FROM sample_inventory.mutation_requests WHERE operation = 'outbound.transition')
        """
      )
      with pytest.raises(Exception, match="references another record"):
        verify_catch_up_database_state(
          cursor,
          plan=plan,
          expected_baseline_batch_id=baseline_batch_id,
          expected_overlay_sha256=overlay.sha256,
          lock_rows=False,
        )
    connection.rollback()

    with connection.cursor() as cursor:
      cursor.execute(
        """
        CREATE OR REPLACE FUNCTION sample_inventory.fixture_fail_catch_up()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF NEW.source_kind = 'legacy_sample_management_json_v1_catch_up'
             AND NEW.source_record_id = '5' THEN
            RAISE EXCEPTION 'fixture catch-up failure';
          END IF;
          RETURN NEW;
        END;
        $$
        """
      )
      cursor.execute(
        """
        CREATE TRIGGER trg_fixture_fail_catch_up
        BEFORE INSERT ON sample_inventory.outbound_requests
        FOR EACH ROW EXECUTE FUNCTION sample_inventory.fixture_fail_catch_up()
        """
      )
    connection.commit()

    with pytest.raises(Exception, match="fixture catch-up failure"):
      with connection.cursor() as cursor:
        import_catch_up_in_transaction(
          cursor,
          plan=plan,
          source_git_sha="fixture-git-sha",
          cutover_at=cutover_at,
          expected_baseline_batch_id=baseline_batch_id,
          expected_overlay_sha256=overlay.sha256,
        )
    connection.rollback()
    with connection.cursor() as cursor:
      assert counts(cursor) == (7, 0, 2, 3, 5, 16, 1)
      cursor.execute("SELECT COUNT(*) FROM sample_inventory.import_batches WHERE source_kind = %s", (CATCH_UP_SOURCE_KIND,))
      assert int(cursor.fetchone()[0]) == 0
      cursor.execute("DROP TRIGGER trg_fixture_fail_catch_up ON sample_inventory.outbound_requests")
      cursor.execute("DROP FUNCTION sample_inventory.fixture_fail_catch_up()")
    connection.commit()

    with connection.cursor() as cursor:
      applied = import_catch_up_in_transaction(
        cursor,
        plan=plan,
        source_git_sha="fixture-git-sha",
        cutover_at=cutover_at,
        expected_baseline_batch_id=baseline_batch_id,
        expected_overlay_sha256=overlay.sha256,
      )
    connection.commit()
    assert applied.status == "applied"
    assert applied.import_batch_id == 3
    with connection.cursor() as cursor:
      assert counts(cursor) == (14, 0, 3, 6, 7, 22, 2)
      cursor.execute(
        """
        SELECT status, approved_at, time_quality
        FROM sample_inventory.outbound_requests
        WHERE source_kind = %s AND source_record_id = '7'
        """,
        (CATCH_UP_SOURCE_KIND,),
      )
      assert cursor.fetchone() == ("approved", None, "legacy_request_only")
      cursor.execute(
        "SELECT COUNT(*) FROM sample_inventory.inventory_movements WHERE source_type = %s AND source_id = '7'",
        (CATCH_UP_SOURCE_KIND,),
      )
      assert int(cursor.fetchone()[0]) == 0

    with connection.cursor() as cursor:
      replay = import_catch_up_in_transaction(
        cursor,
        plan=plan,
        source_git_sha="fixture-git-sha",
        cutover_at=cutover_at,
        expected_baseline_batch_id=baseline_batch_id,
        expected_overlay_sha256=overlay.sha256,
      )
    connection.commit()
    assert replay.status == "already_applied"
    assert replay.import_batch_id == applied.import_batch_id
    with connection.cursor() as cursor:
      assert counts(cursor) == (14, 0, 3, 6, 7, 22, 2)

      cursor.execute(
        """
        SELECT
          current_database(),
          COALESCE(inet_server_addr()::TEXT, 'local'),
          COALESCE(inet_server_port()::TEXT, 'local')
        """
      )
      database_name, server_address, server_port = (str(value) for value in cursor.fetchone())
    connection.rollback()
    readonly_verification = verify_catch_up_database(
      database_url=str(DATABASE_URL),
      expected_database_name=database_name,
      expected_database_identity_sha256=database_identity_sha256(
        database_name,
        server_address,
        server_port,
      ),
      expected_baseline_batch_id=baseline_batch_id,
      plan=plan,
    )
    assert readonly_verification["status"] == "already_applied"
    assert readonly_verification["overlay"] == overlay.summary
    assert readonly_verification["policy"] == {
      "databaseWrites": False,
      "transactionIdAssigned": False,
      "rolledBack": True,
      "businessRowsEmitted": False,
    }

    monkeypatch.setenv("DATABASE_URL", str(DATABASE_URL))
    monkeypatch.setenv("AIOS_SAMPLE_INVENTORY_CATCH_UP_ALLOW_LIVE_READONLY", "1")
    assert catch_up_main([
      "--baseline-input",
      str(baseline_path),
      "--expected-baseline-sha256",
      baseline_sha,
      "--input",
      str(final_path),
      "--expected-sha256",
      final_sha,
      "--cutover-at",
      cutover_at.isoformat(),
      "--verify-database",
      "--expected-db-name",
      database_name,
      "--expected-db-identity-sha256",
      readonly_verification["databaseIdentitySha256"],
      "--expected-baseline-batch-id",
      str(baseline_batch_id),
    ]) == 0
    cli_verification = json.loads(capsys.readouterr().out)
    assert cli_verification["mode"] == "verify-database"
    assert cli_verification["status"] == "already_applied"
    assert cli_verification["overlay"] == overlay.summary
    assert cli_verification["policy"] == readonly_verification["policy"]

    with connection.cursor() as cursor:
      insert_closed_legacy_inbound_overlay(cursor)
      insert_zero_net_imported_outbound_overlay(cursor)
    connection.commit()

    with connection.cursor() as cursor:
      _, existing_batch_id, chained_overlay = verify_chained_catch_up_database_state(
        cursor,
        parent_cumulative_plan=chained_plans.parent_cumulative,
        cumulative_plan=chained_plans.cumulative,
        stage_plan=chained_plans.stage,
        expected_baseline_batch_id=baseline_batch_id,
        expected_parent_batch_id=applied.import_batch_id,
        expected_overlay_sha256=None,
        lock_rows=False,
      )
    connection.rollback()
    assert existing_batch_id is None
    assert chained_overlay.summary == {
      "sha256": chained_overlay.sha256,
      "samples": 1,
      "inbounds": 2,
      "outbounds": 3,
      "movements": 8,
      "events": 25,
      "mutations": 13,
    }

    with connection.cursor() as cursor:
      chained_applied = import_chained_catch_up_in_transaction(
        cursor,
        parent_cumulative_plan=chained_plans.parent_cumulative,
        cumulative_plan=chained_plans.cumulative,
        stage_plan=chained_plans.stage,
        source_git_sha="fixture-git-sha",
        cutover_at=datetime.fromisoformat("2026-07-27T12:30:00+08:00"),
        expected_baseline_batch_id=baseline_batch_id,
        expected_parent_batch_id=applied.import_batch_id,
        expected_overlay_sha256=chained_overlay.sha256,
      )
    connection.commit()
    assert chained_applied.status == "applied"
    assert chained_applied.import_batch_id == 4
    with connection.cursor() as cursor:
      assert counts(cursor) == (10, 0, 4, 7, 12, 36, 3)

    with connection.cursor() as cursor:
      chained_replay = import_chained_catch_up_in_transaction(
        cursor,
        parent_cumulative_plan=chained_plans.parent_cumulative,
        cumulative_plan=chained_plans.cumulative,
        stage_plan=chained_plans.stage,
        source_git_sha="fixture-git-sha",
        cutover_at=datetime.fromisoformat("2026-07-27T12:30:00+08:00"),
        expected_baseline_batch_id=baseline_batch_id,
        expected_parent_batch_id=applied.import_batch_id,
        expected_overlay_sha256=chained_overlay.sha256,
      )
    connection.commit()
    assert chained_replay.status == "already_applied"
    assert chained_replay.import_batch_id == chained_applied.import_batch_id
    with connection.cursor() as cursor:
      assert counts(cursor) == (10, 0, 4, 7, 12, 36, 3)

    chained_readonly = verify_chained_catch_up_database(
      database_url=str(DATABASE_URL),
      expected_database_name=database_name,
      expected_database_identity_sha256=readonly_verification["databaseIdentitySha256"],
      expected_baseline_batch_id=baseline_batch_id,
      plans=ChainedCatchUpPlans(
        parent_cumulative=chained_plans.parent_cumulative,
        cumulative=chained_plans.cumulative,
        stage=chained_plans.stage,
        expected_parent_batch_id=applied.import_batch_id,
      ),
    )
    assert chained_readonly["status"] == "already_applied"
    assert chained_readonly["parentImportBatchId"] == applied.import_batch_id
    assert chained_readonly["overlay"] == chained_overlay.summary

    assert catch_up_main([
      "--baseline-input",
      str(baseline_path),
      "--expected-baseline-sha256",
      baseline_sha,
      "--parent-input",
      str(final_path),
      "--expected-parent-sha256",
      final_sha,
      "--expected-parent-batch-id",
      str(applied.import_batch_id),
      "--input",
      str(second_final_path),
      "--expected-sha256",
      second_final_sha,
      "--cutover-at",
      "2026-07-27T12:30:00+08:00",
      "--verify-database",
      "--expected-db-name",
      database_name,
      "--expected-db-identity-sha256",
      readonly_verification["databaseIdentitySha256"],
      "--expected-baseline-batch-id",
      str(baseline_batch_id),
    ]) == 0
    chained_cli_verification = json.loads(capsys.readouterr().out)
    assert chained_cli_verification["status"] == "already_applied"
    assert chained_cli_verification["newOutboundRequests"] == 1
    assert chained_cli_verification["finalAvailable"] == 10
    assert chained_cli_verification["finalReserved"] == 0
    assert chained_cli_verification["finalOnHand"] == 10
    assert chained_cli_verification["cumulative"]["newOutboundRequests"] == 4

    with connection.cursor() as cursor:
      cursor.execute(
        """
        UPDATE sample_inventory.samples
        SET reserved_quantity = 3
        WHERE legacy_source = %s AND legacy_id = '1'
        """,
        ("legacy_sample_management_json_v1",),
      )
      cursor.execute(MANUAL_RESERVATION_MIGRATION_SQL)
    connection.commit()

    with connection.cursor() as cursor:
      _, migrated_batch_id, migrated_overlay = verify_chained_catch_up_database_state(
        cursor,
        parent_cumulative_plan=chained_plans.parent_cumulative,
        cumulative_plan=chained_plans.cumulative,
        stage_plan=chained_plans.stage,
        expected_baseline_batch_id=baseline_batch_id,
        expected_parent_batch_id=applied.import_batch_id,
        expected_overlay_sha256=None,
        lock_rows=False,
      )
    connection.rollback()
    assert migrated_batch_id == chained_applied.import_batch_id
    assert migrated_overlay.legacy_sample_version_offsets["1"] == (
      chained_overlay.legacy_sample_version_offsets["1"] + 1
    )
    assert migrated_overlay.movements == chained_overlay.movements + 1
    assert migrated_overlay.events == chained_overlay.events + 1
  finally:
    connection.close()
