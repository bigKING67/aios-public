from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sample_inventory.legacy_database import (
  LEGACY_ACTOR,
  LEGACY_SOURCE_KIND,
  _insert_event,
)
from sample_inventory.legacy_delta import LegacyCatchUpPlan
from sample_inventory.legacy_model import LegacyValidationError
from sample_inventory.legacy_overlay_database import (
  CATCH_UP_SOURCE_KIND,
  LegacyOverlayAudit,
  inspect_allowed_smoke_overlay,
  validate_expected_overlay_sha256,
)


CATCH_UP_ACTOR = "legacy-catch-up"
CATCH_UP_ADVISORY_LOCK_KEY = 6742026072701


@dataclass(frozen=True)
class LegacyCatchUpResult:
  status: str
  import_batch_id: int
  overlay_sha256: str


def _json_object(value: object) -> dict[str, object]:
  if isinstance(value, dict):
    return value
  if isinstance(value, str):
    parsed = json.loads(value)
    if isinstance(parsed, dict):
      return parsed
  raise LegacyValidationError("catch-up import batch summary is invalid")


def _require_baseline_batch(
  cursor: Any,
  *,
  plan: LegacyCatchUpPlan,
  expected_baseline_batch_id: int,
) -> int:
  cursor.execute(
    """
    SELECT id, status, imported_counts
    FROM sample_inventory.import_batches
    WHERE source_kind = %s AND source_sha256 = %s
    """,
    (LEGACY_SOURCE_KIND, plan.baseline.source_sha256),
  )
  row = cursor.fetchone()
  if row is None or int(row[0]) != expected_baseline_batch_id or str(row[1]) != "succeeded":
    raise LegacyValidationError("database baseline import batch differs from the explicit pin")
  if _json_object(row[2]) != plan.baseline.summary:
    raise LegacyValidationError("database baseline import summary differs from the frozen baseline")
  return int(row[0])


def _verify_sample_state(
  cursor: Any,
  *,
  plan: LegacyCatchUpPlan,
  overlay: LegacyOverlayAudit,
  final: bool,
  lock_rows: bool,
) -> dict[str, int]:
  lock_clause = " FOR UPDATE" if lock_rows else ""
  cursor.execute(
    f"""
    SELECT
      id,
      legacy_source,
      legacy_id,
      sample_code,
      sample_name,
      model,
      category,
      location,
      remark,
      on_hand_quantity,
      reserved_quantity,
      version,
      archived_at
    FROM sample_inventory.samples
    WHERE legacy_source = %s
    ORDER BY id
    {lock_clause}
    """,
    (LEGACY_SOURCE_KIND,),
  )
  rows = cursor.fetchall()
  expected_samples = plan.final.samples if final else plan.baseline.samples
  if len(rows) != len(expected_samples):
    raise LegacyValidationError("database sample identity count differs from the frozen snapshot")
  expected_by_id = {sample.legacy_id: sample for sample in expected_samples}
  sample_deltas = {item.legacy_id: item for item in plan.sample_deltas}
  sample_ids: dict[str, int] = {}
  for row in rows:
    legacy_id = str(row[2])
    expected = expected_by_id.get(legacy_id)
    if expected is None:
      raise LegacyValidationError("database contains a sample outside the frozen identity set")
    expected_version = 1 + overlay.legacy_sample_version_offsets.get(legacy_id, 0)
    expected_on_hand = expected.quantity
    expected_reserved = 0
    if final:
      delta = sample_deltas.get(legacy_id)
      if delta is None:
        raise LegacyValidationError("final sample is missing its frozen balance delta")
      expected_version += sum(item.sample_legacy_id == legacy_id for item in plan.new_inbounds)
      expected_version += sum(
        item.sample_legacy_id == legacy_id and item.status == "sampled"
        for item in plan.new_outbounds
      )
    actual = (
      str(row[1]),
      str(row[2]),
      str(row[3]),
      str(row[4]),
      row[5],
      row[6],
      row[7],
      row[8],
      int(row[9]),
      int(row[10]),
      int(row[11]),
      row[12],
    )
    expected_row = (
      LEGACY_SOURCE_KIND,
      expected.legacy_id,
      expected.code,
      expected.name,
      expected.model,
      expected.category,
      expected.location,
      expected.remark,
      expected_on_hand,
      expected_reserved,
      expected_version,
      None,
    )
    if actual != expected_row:
      raise LegacyValidationError("database sample state differs from the frozen snapshot")
    sample_ids[legacy_id] = int(row[0])
  return sample_ids


def _verify_baseline_history(
  cursor: Any,
  *,
  plan: LegacyCatchUpPlan,
  baseline_batch_id: int,
  lock_rows: bool,
  sample_ids: dict[str, int],
) -> None:
  lock_clause = " FOR UPDATE" if lock_rows else ""
  cursor.execute(
    """
    SELECT source_file_name, cutover_at, imported_by, completed_at
    FROM sample_inventory.import_batches
    WHERE id = %s
    """,
    (baseline_batch_id,),
  )
  batch_row = cursor.fetchone()
  if batch_row is None or (
    str(batch_row[0]),
    str(batch_row[2]),
    batch_row[3] is not None,
  ) != (
    plan.baseline.source_path.name,
    LEGACY_ACTOR,
    True,
  ):
    raise LegacyValidationError("database baseline import batch metadata differs from the frozen baseline")
  baseline_cutover_at = batch_row[1]

  cursor.execute(
    f"""
    SELECT
      inbound.id,
      inbound.source_kind,
      inbound.source_record_id,
      sample.legacy_id,
      inbound.quantity,
      inbound.tracking_number,
      inbound.remark,
      inbound.operator_name,
      inbound.occurred_at,
      inbound.time_quality,
      inbound.version,
      inbound.voided_at
    FROM sample_inventory.inbound_records AS inbound
    JOIN sample_inventory.samples AS sample ON sample.id = inbound.sample_id
    WHERE inbound.source_kind = %s
    ORDER BY inbound.id
    {lock_clause}
    """,
    (LEGACY_SOURCE_KIND,),
  )
  rows = cursor.fetchall()
  expected = {item.legacy_id: item for item in plan.baseline.inbounds}
  if len(rows) != len(expected):
    raise LegacyValidationError("database inbound baseline count differs from the frozen baseline")
  inbound_ids: dict[str, int] = {}
  for row in rows:
    item = expected.get(str(row[2]))
    if item is None or (
      str(row[1]),
      str(row[3]),
      int(row[4]),
      row[5],
      row[6],
      row[7],
      row[8],
      str(row[9]),
      int(row[10]),
      row[11],
    ) != (
      LEGACY_SOURCE_KIND,
      item.sample_legacy_id,
      item.quantity,
      item.tracking_number,
      item.remark,
      item.operator_name,
      item.occurred_at,
      "legacy_local_minute",
      1,
      None,
    ):
      raise LegacyValidationError("database inbound history differs from the frozen baseline")
    inbound_ids[item.legacy_id] = int(row[0])

  cursor.execute(
    f"""
    SELECT
      outbound.id,
      outbound.source_kind,
      outbound.source_record_id,
      sample.legacy_id,
      outbound.quantity,
      outbound.applicant,
      outbound.department,
      outbound.purpose,
      outbound.receiver,
      outbound.shipping_address,
      outbound.tracking_number,
      outbound.status,
      outbound.requested_at,
      outbound.time_quality,
      outbound.version,
      outbound.archived_at
    FROM sample_inventory.outbound_requests AS outbound
    JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
    WHERE outbound.source_kind = %s
    ORDER BY outbound.id
    {lock_clause}
    """,
    (LEGACY_SOURCE_KIND,),
  )
  rows = cursor.fetchall()
  expected_outbounds = {item.legacy_id: item for item in plan.baseline.outbounds}
  if len(rows) != len(expected_outbounds):
    raise LegacyValidationError("database outbound baseline count differs from the frozen baseline")
  outbound_ids: dict[str, int] = {}
  for row in rows:
    item = expected_outbounds.get(str(row[2]))
    if item is None or (
      str(row[1]),
      str(row[3]),
      int(row[4]),
      row[5],
      row[6],
      row[7],
      row[8],
      row[9],
      row[10],
      str(row[11]),
      row[12],
      str(row[13]),
      int(row[14]),
      row[15],
    ) != (
      LEGACY_SOURCE_KIND,
      item.sample_legacy_id,
      item.quantity,
      item.applicant,
      item.department,
      item.purpose,
      item.receiver,
      item.shipping_address,
      item.tracking_number,
      item.status,
      item.requested_at,
      "legacy_request_only",
      1,
      None,
    ):
      raise LegacyValidationError("database outbound history differs from the frozen baseline")
    outbound_ids[item.legacy_id] = int(row[0])

  cursor.execute(
    f"""
    SELECT
      movement.id,
      sample.legacy_id,
      movement.movement_type,
      movement.on_hand_delta,
      movement.reserved_delta,
      movement.resulting_on_hand_quantity,
      movement.resulting_reserved_quantity,
      movement.source_type,
      movement.source_id,
      movement.occurred_at,
      movement.actor_user_id,
      movement.import_batch_id,
      movement.metadata
    FROM sample_inventory.inventory_movements AS movement
    JOIN sample_inventory.samples AS sample ON sample.id = movement.sample_id
    WHERE sample.legacy_source = %s
      AND movement.source_type = %s
    ORDER BY movement.id
    {lock_clause}
    """,
    (LEGACY_SOURCE_KIND, LEGACY_SOURCE_KIND),
  )
  movement_rows = cursor.fetchall()
  if len(movement_rows) != len(plan.baseline.samples):
    raise LegacyValidationError("database movement baseline differs from the frozen baseline")
  movement_ids: dict[str, int] = {}
  expected_samples = {item.legacy_id: item for item in plan.baseline.samples}
  for row in movement_rows:
    item = expected_samples.get(str(row[1]))
    if item is None or (
      str(row[2]),
      int(row[3]),
      int(row[4]),
      int(row[5]),
      int(row[6]),
      str(row[7]),
      str(row[8]),
      row[9],
      str(row[10]),
      int(row[11]),
      _json_object(row[12]),
    ) != (
      "legacy_cutover_opening",
      item.quantity,
      0,
      item.quantity,
      0,
      LEGACY_SOURCE_KIND,
      str(baseline_batch_id),
      baseline_cutover_at,
      LEGACY_ACTOR,
      baseline_batch_id,
      {"historyIncludedInAnalytics": False},
    ):
      raise LegacyValidationError("database movement baseline differs from the frozen baseline")
    movement_ids[item.legacy_id] = int(row[0])

  cursor.execute(
    f"""
    SELECT
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      occurred_at,
      actor_user_id,
      import_batch_id
    FROM sample_inventory.business_events
    WHERE import_batch_id = %s
    ORDER BY id
    {lock_clause}
    """,
    (baseline_batch_id,),
  )
  event_rows = cursor.fetchall()
  expected_events: dict[tuple[str, str, str], dict[str, object]] = {}
  for item in plan.baseline.samples:
    sample_id = sample_ids[item.legacy_id]
    expected_events[("sample", str(sample_id), "inventory.movement.recorded")] = {
      "movementId": movement_ids[item.legacy_id],
      "sampleId": sample_id,
      "sampleCode": item.code,
      "movementType": "legacy_cutover_opening",
      "onHandDelta": item.quantity,
      "reservedDelta": 0,
      "resultingOnHandQuantity": item.quantity,
      "resultingReservedQuantity": 0,
      "resultingAvailableQuantity": item.quantity,
      "sourceType": LEGACY_SOURCE_KIND,
      "sourceId": str(baseline_batch_id),
      "historyIncludedInAnalytics": False,
    }
  for item in plan.baseline.inbounds:
    inbound_id = inbound_ids[item.legacy_id]
    sample_id = sample_ids[item.sample_legacy_id]
    expected_events[("inbound_record", str(inbound_id), "inbound.legacy_imported")] = {
      "inboundId": inbound_id,
      "sampleId": sample_id,
      "sampleCode": item.sample_code,
      "quantity": item.quantity,
      "occurredAt": item.occurred_at.isoformat(),
      "timeQuality": "legacy_local_minute",
      "historyIncludedInStock": False,
    }
  for item in plan.baseline.outbounds:
    outbound_id = outbound_ids[item.legacy_id]
    sample_id = sample_ids[item.sample_legacy_id]
    expected_events[("outbound_request", str(outbound_id), "outbound.legacy_imported")] = {
      "requestId": outbound_id,
      "sampleId": sample_id,
      "sampleCode": item.sample_code,
      "fromStatus": None,
      "toStatus": item.status,
      "quantity": item.quantity,
      "department": item.department,
      "applicant": item.applicant,
      "requestedAt": item.requested_at.isoformat(),
      "approvedAt": None,
      "sampledAt": None,
      "rejectedAt": None,
      "timeQuality": "legacy_request_only",
      "historyIncludedInAnalytics": False,
    }
  if len(event_rows) != len(expected_events):
    raise LegacyValidationError("database event baseline differs from the frozen baseline")
  seen_events: set[tuple[str, str, str]] = set()
  for row in event_rows:
    event_key = (str(row[0]), str(row[1]), str(row[2]))
    if event_key in seen_events or (
      expected_events.get(event_key),
      row[4],
      str(row[5]),
      int(row[6]),
    ) != (
      _json_object(row[3]),
      baseline_cutover_at,
      LEGACY_ACTOR,
      baseline_batch_id,
    ):
      raise LegacyValidationError("database event baseline differs from the frozen baseline")
    seen_events.add(event_key)


def _verify_catch_up_history(cursor: Any, *, plan: LegacyCatchUpPlan, lock_rows: bool) -> None:
  lock_clause = " FOR UPDATE" if lock_rows else ""
  cursor.execute(
    f"""
    SELECT
      inbound.source_record_id,
      sample.legacy_id,
      inbound.quantity,
      inbound.tracking_number,
      inbound.remark,
      inbound.operator_name,
      inbound.occurred_at,
      inbound.time_quality,
      inbound.voided_at
    FROM sample_inventory.inbound_records AS inbound
    JOIN sample_inventory.samples AS sample ON sample.id = inbound.sample_id
    WHERE inbound.source_kind = %s
    ORDER BY inbound.id
    {lock_clause}
    """,
    (CATCH_UP_SOURCE_KIND,),
  )
  inbound_rows = list(cursor.fetchall())
  expected_inbounds = {item.legacy_id: item for item in plan.new_inbounds}
  if len(inbound_rows) != len(expected_inbounds):
    raise LegacyValidationError("database catch-up inbound history differs from the frozen snapshot")
  for row in inbound_rows:
    item = expected_inbounds.get(str(row[0]))
    if item is None or (
      str(row[1]),
      int(row[2]),
      row[3],
      row[4],
      row[5],
      row[6],
      str(row[7]),
      row[8],
    ) != (
      item.sample_legacy_id,
      item.quantity,
      item.tracking_number,
      item.remark,
      item.operator_name,
      item.occurred_at,
      "legacy_local_minute",
      None,
    ):
      raise LegacyValidationError("database catch-up inbound history differs from the frozen snapshot")

  cursor.execute(
    f"""
    SELECT
      outbound.source_record_id,
      sample.legacy_id,
      outbound.quantity,
      outbound.applicant,
      outbound.department,
      outbound.purpose,
      outbound.receiver,
      outbound.shipping_address,
      outbound.tracking_number,
      outbound.status,
      outbound.requested_at,
      outbound.time_quality,
      outbound.archived_at
    FROM sample_inventory.outbound_requests AS outbound
    JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
    WHERE outbound.source_kind = %s
    ORDER BY outbound.id
    {lock_clause}
    """,
    (CATCH_UP_SOURCE_KIND,),
  )
  outbound_rows = list(cursor.fetchall())
  expected_outbounds = {item.legacy_id: item for item in plan.new_outbounds}
  if len(outbound_rows) != len(expected_outbounds):
    raise LegacyValidationError("database catch-up outbound history differs from the frozen snapshot")
  for row in outbound_rows:
    item = expected_outbounds.get(str(row[0]))
    if item is None or (
      str(row[1]),
      int(row[2]),
      row[3],
      row[4],
      row[5],
      row[6],
      row[7],
      row[8],
      str(row[9]),
      row[10],
      str(row[11]),
      row[12],
    ) != (
      item.sample_legacy_id,
      item.quantity,
      item.applicant,
      item.department,
      item.purpose,
      item.receiver,
      item.shipping_address,
      item.tracking_number,
      item.status,
      item.requested_at,
      "legacy_request_only",
      None,
    ):
      raise LegacyValidationError("database catch-up outbound history differs from the frozen snapshot")


def _insert_movement(
  cursor: Any,
  *,
  batch_id: int,
  movement_type: str,
  occurred_at: datetime,
  on_hand_delta: int,
  reserved_delta: int,
  resulting_on_hand: int,
  resulting_reserved: int,
  sample_code: str,
  sample_id: int,
  source_id: str,
) -> None:
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
      occurred_at,
      actor_user_id,
      import_batch_id,
      metadata
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::JSONB)
    RETURNING id
    """,
    (
      sample_id,
      movement_type,
      on_hand_delta,
      reserved_delta,
      resulting_on_hand,
      resulting_reserved,
      CATCH_UP_SOURCE_KIND,
      source_id,
      occurred_at,
      CATCH_UP_ACTOR,
      batch_id,
      '{"historyIncludedInAnalytics":true}',
    ),
  )
  movement_id = int(cursor.fetchone()[0])
  _insert_event(
    cursor,
    aggregate_type="sample",
    aggregate_id=sample_id,
    event_type="inventory.movement.recorded",
    payload={
      "movementId": movement_id,
      "sampleId": sample_id,
      "sampleCode": sample_code,
      "movementType": movement_type,
      "onHandDelta": on_hand_delta,
      "reservedDelta": reserved_delta,
      "resultingOnHandQuantity": resulting_on_hand,
      "resultingReservedQuantity": resulting_reserved,
      "resultingAvailableQuantity": resulting_on_hand - resulting_reserved,
      "sourceType": CATCH_UP_SOURCE_KIND,
      "sourceId": source_id,
      "historyIncludedInAnalytics": True,
    },
    occurred_at=occurred_at,
    batch_id=batch_id,
    actor=CATCH_UP_ACTOR,
  )


def _apply_inbound(cursor: Any, *, item: Any, sample_id: int, batch_id: int) -> None:
  cursor.execute(
    """
    INSERT INTO sample_inventory.inbound_records (
      sample_id,
      quantity,
      tracking_number,
      remark,
      operator_name,
      occurred_at,
      time_quality,
      source_kind,
      source_record_id,
      created_by
    )
    VALUES (%s, %s, %s, %s, %s, %s, 'legacy_local_minute', %s, %s, %s)
    RETURNING id
    """,
    (
      sample_id,
      item.quantity,
      item.tracking_number,
      item.remark,
      item.operator_name,
      item.occurred_at,
      CATCH_UP_SOURCE_KIND,
      item.legacy_id,
      CATCH_UP_ACTOR,
    ),
  )
  inbound_id = int(cursor.fetchone()[0])
  cursor.execute(
    """
    UPDATE sample_inventory.samples
    SET
      on_hand_quantity = on_hand_quantity + %s,
      version = version + 1,
      updated_by = %s
    WHERE id = %s AND archived_at IS NULL
    RETURNING sample_code, on_hand_quantity, reserved_quantity
    """,
    (item.quantity, CATCH_UP_ACTOR, sample_id),
  )
  sample_row = cursor.fetchone()
  if sample_row is None:
    raise LegacyValidationError("catch-up inbound sample is unavailable")
  _insert_event(
    cursor,
    aggregate_type="inbound_record",
    aggregate_id=inbound_id,
    event_type="inbound.legacy_catch_up_imported",
    payload={
      "inboundId": inbound_id,
      "sampleId": sample_id,
      "sampleCode": str(sample_row[0]),
      "quantity": item.quantity,
      "occurredAt": item.occurred_at.isoformat(),
      "timeQuality": "legacy_local_minute",
      "historyIncludedInStock": True,
    },
    occurred_at=item.occurred_at,
    batch_id=batch_id,
    actor=CATCH_UP_ACTOR,
  )
  _insert_movement(
    cursor,
    batch_id=batch_id,
    movement_type="legacy_catch_up_inbound",
    occurred_at=item.occurred_at,
    on_hand_delta=item.quantity,
    reserved_delta=0,
    resulting_on_hand=int(sample_row[1]),
    resulting_reserved=int(sample_row[2]),
    sample_code=str(sample_row[0]),
    sample_id=sample_id,
    source_id=item.legacy_id,
  )


def _apply_outbound(cursor: Any, *, item: Any, sample_id: int, batch_id: int) -> None:
  cursor.execute(
    """
    INSERT INTO sample_inventory.outbound_requests (
      sample_id,
      quantity,
      applicant,
      department,
      purpose,
      receiver,
      shipping_address,
      tracking_number,
      status,
      requested_at,
      time_quality,
      source_kind,
      source_record_id,
      created_by,
      updated_by
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
      'legacy_request_only', %s, %s, %s, %s)
    RETURNING id
    """,
    (
      sample_id,
      item.quantity,
      item.applicant,
      item.department,
      item.purpose,
      item.receiver,
      item.shipping_address,
      item.tracking_number,
      item.status,
      item.requested_at,
      CATCH_UP_SOURCE_KIND,
      item.legacy_id,
      CATCH_UP_ACTOR,
      CATCH_UP_ACTOR,
    ),
  )
  request_id = int(cursor.fetchone()[0])
  _insert_event(
    cursor,
    aggregate_type="outbound_request",
    aggregate_id=request_id,
    event_type="outbound.legacy_catch_up_imported",
    payload={
      "requestId": request_id,
      "sampleId": sample_id,
      "sampleCode": item.sample_code,
      "fromStatus": None,
      "toStatus": item.status,
      "quantity": item.quantity,
      "department": item.department,
      "applicant": item.applicant,
      "requestedAt": item.requested_at.isoformat(),
      "approvedAt": None,
      "sampledAt": None,
      "rejectedAt": None,
      "timeQuality": "legacy_request_only",
      "historyIncludedInAnalytics": True,
    },
    occurred_at=item.requested_at,
    batch_id=batch_id,
    actor=CATCH_UP_ACTOR,
  )
  if item.status == "rejected":
    return
  if item.status == "approved":
    return
  cursor.execute(
    """
    UPDATE sample_inventory.samples
    SET
      on_hand_quantity = on_hand_quantity - %s,
      version = version + 1,
      updated_by = %s
    WHERE id = %s
      AND archived_at IS NULL
      AND available_quantity >= %s
    RETURNING sample_code, on_hand_quantity, reserved_quantity
    """,
    (item.quantity, CATCH_UP_ACTOR, sample_id, item.quantity),
  )
  sample_row = cursor.fetchone()
  if sample_row is None:
    raise LegacyValidationError("catch-up outbound sample has insufficient available quantity")
  _insert_movement(
    cursor,
    batch_id=batch_id,
    movement_type="legacy_catch_up_outbound_sampled",
    occurred_at=item.requested_at,
    on_hand_delta=-item.quantity,
    reserved_delta=0,
    resulting_on_hand=int(sample_row[1]),
    resulting_reserved=int(sample_row[2]),
    sample_code=str(sample_row[0]),
    sample_id=sample_id,
    source_id=item.legacy_id,
  )


def _verify_final_state(
  cursor: Any,
  *,
  plan: LegacyCatchUpPlan,
  baseline_batch_id: int,
  batch_id: int,
  catch_up_batch_ids: tuple[int, ...] | None = None,
  batch_event_plan: LegacyCatchUpPlan | None = None,
  verify_batch_events: bool = True,
  lock_rows: bool,
) -> None:
  allowed_catch_up_batch_ids = catch_up_batch_ids or (batch_id,)
  cursor.execute(
    "SELECT COUNT(*) FROM sample_inventory.inbound_records WHERE source_kind IN (%s, %s)",
    (LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND),
  )
  if int(cursor.fetchone()[0]) != len(plan.final.inbounds):
    raise LegacyValidationError("catch-up final inbound count does not reconcile")
  cursor.execute(
    "SELECT COUNT(*) FROM sample_inventory.outbound_requests WHERE source_kind IN (%s, %s)",
    (LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND),
  )
  if int(cursor.fetchone()[0]) != len(plan.final.outbounds):
    raise LegacyValidationError("catch-up final outbound count does not reconcile")

  expected_movements = len(plan.baseline.samples) + len(plan.new_inbounds) + sum(
    item.status == "sampled" for item in plan.new_outbounds
  )
  cursor.execute(
    "SELECT COUNT(*) FROM sample_inventory.inventory_movements WHERE source_type IN (%s, %s)",
    (LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND),
  )
  if int(cursor.fetchone()[0]) != expected_movements:
    raise LegacyValidationError("catch-up final movement count does not reconcile")
  cursor.execute(
    """
    SELECT sample.legacy_id, SUM(movement.on_hand_delta), SUM(movement.reserved_delta)
    FROM sample_inventory.inventory_movements AS movement
    JOIN sample_inventory.samples AS sample ON sample.id = movement.sample_id
    WHERE sample.legacy_source = %s
      AND movement.source_type IN (%s, %s)
    GROUP BY sample.legacy_id
    """,
    (LEGACY_SOURCE_KIND, LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND),
  )
  movement_totals = {str(row[0]): (int(row[1]), int(row[2])) for row in cursor.fetchall()}
  if any(
    movement_totals.get(sample.legacy_id)
    != (
      sample.quantity,
      0,
    )
    for sample in plan.final.samples
  ):
    raise LegacyValidationError("catch-up final movement totals do not match sample balances")

  expected_events = (
    len(plan.baseline.samples)
    + len(plan.baseline.inbounds)
    + len(plan.baseline.outbounds)
    + 2 * len(plan.new_inbounds)
    + len(plan.new_outbounds)
    + sum(item.status == "sampled" for item in plan.new_outbounds)
  )
  cursor.execute(
    "SELECT COUNT(*) FROM sample_inventory.business_events WHERE import_batch_id = ANY(%s)",
    ([baseline_batch_id, *allowed_catch_up_batch_ids],),
  )
  if int(cursor.fetchone()[0]) != expected_events:
    raise LegacyValidationError("catch-up final event count does not reconcile")
  if verify_batch_events:
    event_plan = batch_event_plan or plan
    cursor.execute(
      "SELECT COUNT(*) FROM sample_inventory.business_events WHERE import_batch_id = %s",
      (batch_id,),
    )
    expected_batch_events = 2 * len(event_plan.new_inbounds) + len(event_plan.new_outbounds) + sum(
      item.status == "sampled" for item in event_plan.new_outbounds
    )
    if int(cursor.fetchone()[0]) != expected_batch_events:
      raise LegacyValidationError("catch-up import batch event count does not reconcile")


def verify_catch_up_database_state(
  cursor: Any,
  *,
  plan: LegacyCatchUpPlan,
  expected_baseline_batch_id: int,
  expected_overlay_sha256: str | None,
  lock_rows: bool,
) -> tuple[int, int | None, LegacyOverlayAudit]:
  validate_expected_overlay_sha256(expected_overlay_sha256)
  baseline_batch_id = _require_baseline_batch(
    cursor,
    plan=plan,
    expected_baseline_batch_id=expected_baseline_batch_id,
  )
  cursor.execute(
    """
    SELECT id, status, imported_counts
    FROM sample_inventory.import_batches
    WHERE source_kind = %s AND source_sha256 = %s
    """,
    (CATCH_UP_SOURCE_KIND, plan.final.source_sha256),
  )
  existing = cursor.fetchone()
  catch_up_batch_id: int | None = None
  if existing is not None:
    if str(existing[1]) != "succeeded" or _json_object(existing[2]) != plan.summary:
      raise LegacyValidationError("existing catch-up import batch differs from the frozen plan")
    catch_up_batch_id = int(existing[0])

  overlay = inspect_allowed_smoke_overlay(
    cursor,
    baseline_batch_id=baseline_batch_id,
    catch_up_batch_ids=(catch_up_batch_id,) if catch_up_batch_id is not None else (),
    lock_rows=lock_rows,
  )
  if expected_overlay_sha256 is not None and overlay.sha256 != expected_overlay_sha256:
    raise LegacyValidationError("database smoke overlay SHA-256 differs from the explicit pin")

  sample_ids = _verify_sample_state(
    cursor,
    plan=plan,
    overlay=overlay,
    final=catch_up_batch_id is not None,
    lock_rows=lock_rows,
  )
  _verify_baseline_history(
    cursor,
    plan=plan,
    baseline_batch_id=baseline_batch_id,
    lock_rows=lock_rows,
    sample_ids=sample_ids,
  )
  if catch_up_batch_id is not None:
    _verify_catch_up_history(cursor, plan=plan, lock_rows=lock_rows)
    _verify_final_state(
      cursor,
      plan=plan,
      baseline_batch_id=baseline_batch_id,
      batch_id=catch_up_batch_id,
      lock_rows=lock_rows,
    )
  return baseline_batch_id, catch_up_batch_id, overlay


def _require_chained_catch_up_batches(
  cursor: Any,
  *,
  parent_cumulative_plan: LegacyCatchUpPlan,
  cumulative_plan: LegacyCatchUpPlan,
  stage_plan: LegacyCatchUpPlan,
  expected_parent_batch_id: int,
) -> tuple[tuple[int, ...], int | None]:
  if (
    parent_cumulative_plan.baseline.source_sha256 != cumulative_plan.baseline.source_sha256
    or parent_cumulative_plan.final.source_sha256 != stage_plan.baseline.source_sha256
    or cumulative_plan.final.source_sha256 != stage_plan.final.source_sha256
  ):
    raise LegacyValidationError("chained catch-up snapshots do not form one continuous history")

  cursor.execute(
    """
    SELECT id, source_sha256, status, imported_counts, completed_at
    FROM sample_inventory.import_batches
    WHERE source_kind = %s
    ORDER BY id
    """,
    (CATCH_UP_SOURCE_KIND,),
  )
  rows = list(cursor.fetchall())
  parent_index = next(
    (index for index, row in enumerate(rows) if int(row[0]) == expected_parent_batch_id),
    None,
  )
  if parent_index is None:
    raise LegacyValidationError("database parent catch-up batch differs from the explicit pin")

  parent = rows[parent_index]
  if (
    str(parent[1]) != parent_cumulative_plan.final.source_sha256
    or str(parent[2]) != "succeeded"
    or _json_object(parent[3]) != parent_cumulative_plan.summary
    or parent[4] is None
  ):
    raise LegacyValidationError("database parent catch-up batch differs from the frozen parent")

  for row in rows[:parent_index]:
    if str(row[2]) != "succeeded" or row[4] is None:
      raise LegacyValidationError("database contains an incomplete prior catch-up batch")

  later_rows = rows[parent_index + 1:]
  current_batch_id: int | None = None
  if later_rows:
    if len(later_rows) != 1:
      raise LegacyValidationError("database contains a catch-up batch after the explicit parent")
    current = later_rows[0]
    if (
      str(current[1]) != cumulative_plan.final.source_sha256
      or str(current[2]) != "succeeded"
      or _json_object(current[3]) != cumulative_plan.summary
      or current[4] is None
    ):
      raise LegacyValidationError("database contains a catch-up batch after the explicit parent")
    current_batch_id = int(current[0])

  allowed_batch_ids = tuple(int(row[0]) for row in rows[:parent_index + 1])
  if current_batch_id is not None:
    allowed_batch_ids = (*allowed_batch_ids, current_batch_id)
  return allowed_batch_ids, current_batch_id


def verify_chained_catch_up_database_state(
  cursor: Any,
  *,
  parent_cumulative_plan: LegacyCatchUpPlan,
  cumulative_plan: LegacyCatchUpPlan,
  stage_plan: LegacyCatchUpPlan,
  expected_baseline_batch_id: int,
  expected_parent_batch_id: int,
  expected_overlay_sha256: str | None,
  lock_rows: bool,
) -> tuple[int, int | None, LegacyOverlayAudit]:
  validate_expected_overlay_sha256(expected_overlay_sha256)
  baseline_batch_id = _require_baseline_batch(
    cursor,
    plan=cumulative_plan,
    expected_baseline_batch_id=expected_baseline_batch_id,
  )
  catch_up_batch_ids, current_batch_id = _require_chained_catch_up_batches(
    cursor,
    parent_cumulative_plan=parent_cumulative_plan,
    cumulative_plan=cumulative_plan,
    stage_plan=stage_plan,
    expected_parent_batch_id=expected_parent_batch_id,
  )
  overlay = inspect_allowed_smoke_overlay(
    cursor,
    baseline_batch_id=baseline_batch_id,
    catch_up_batch_ids=catch_up_batch_ids,
    lock_rows=lock_rows,
  )
  if expected_overlay_sha256 is not None and overlay.sha256 != expected_overlay_sha256:
    raise LegacyValidationError("database smoke overlay SHA-256 differs from the explicit pin")

  state_plan = cumulative_plan if current_batch_id is not None else parent_cumulative_plan
  sample_ids = _verify_sample_state(
    cursor,
    plan=state_plan,
    overlay=overlay,
    final=True,
    lock_rows=lock_rows,
  )
  _verify_baseline_history(
    cursor,
    plan=cumulative_plan,
    baseline_batch_id=baseline_batch_id,
    lock_rows=lock_rows,
    sample_ids=sample_ids,
  )
  _verify_catch_up_history(cursor, plan=state_plan, lock_rows=lock_rows)
  state_batch_id = current_batch_id or expected_parent_batch_id
  _verify_final_state(
    cursor,
    plan=state_plan,
    baseline_batch_id=baseline_batch_id,
    batch_id=state_batch_id,
    catch_up_batch_ids=catch_up_batch_ids,
    batch_event_plan=stage_plan if current_batch_id is not None else None,
    verify_batch_events=current_batch_id is not None,
    lock_rows=lock_rows,
  )
  return baseline_batch_id, current_batch_id, overlay


def import_chained_catch_up_in_transaction(
  cursor: Any,
  *,
  parent_cumulative_plan: LegacyCatchUpPlan,
  cumulative_plan: LegacyCatchUpPlan,
  stage_plan: LegacyCatchUpPlan,
  source_git_sha: str,
  cutover_at: datetime,
  expected_baseline_batch_id: int,
  expected_parent_batch_id: int,
  expected_overlay_sha256: str,
) -> LegacyCatchUpResult:
  cursor.execute("SELECT pg_advisory_xact_lock(%s)", (CATCH_UP_ADVISORY_LOCK_KEY,))
  _, existing_batch_id, overlay = verify_chained_catch_up_database_state(
    cursor,
    parent_cumulative_plan=parent_cumulative_plan,
    cumulative_plan=cumulative_plan,
    stage_plan=stage_plan,
    expected_baseline_batch_id=expected_baseline_batch_id,
    expected_parent_batch_id=expected_parent_batch_id,
    expected_overlay_sha256=expected_overlay_sha256,
    lock_rows=True,
  )
  if existing_batch_id is not None:
    return LegacyCatchUpResult(
      status="already_applied",
      import_batch_id=existing_batch_id,
      overlay_sha256=overlay.sha256,
    )

  sample_ids = _verify_sample_state(
    cursor,
    plan=parent_cumulative_plan,
    overlay=overlay,
    final=True,
    lock_rows=True,
  )
  cursor.execute(
    """
    INSERT INTO sample_inventory.import_batches (
      source_kind,
      source_sha256,
      source_file_name,
      source_git_sha,
      cutover_at,
      imported_by
    )
    VALUES (%s, %s, %s, %s, %s, %s)
    RETURNING id
    """,
    (
      CATCH_UP_SOURCE_KIND,
      cumulative_plan.final.source_sha256,
      cumulative_plan.final.source_path.name,
      source_git_sha,
      cutover_at,
      CATCH_UP_ACTOR,
    ),
  )
  batch_id = int(cursor.fetchone()[0])

  operations = [
    *((item.occurred_at, 0, item.legacy_id, "inbound", item) for item in stage_plan.new_inbounds),
    *((item.requested_at, 1, item.legacy_id, "outbound", item) for item in stage_plan.new_outbounds),
  ]
  for _, _, _, operation, item in sorted(operations):
    sample_id = sample_ids[item.sample_legacy_id]
    if operation == "inbound":
      _apply_inbound(cursor, item=item, sample_id=sample_id, batch_id=batch_id)
    else:
      _apply_outbound(cursor, item=item, sample_id=sample_id, batch_id=batch_id)

  cursor.execute(
    """
    UPDATE sample_inventory.import_batches
    SET
      status = 'succeeded',
      imported_counts = %s::JSONB,
      completed_at = NOW()
    WHERE id = %s
    """,
    (json.dumps(cumulative_plan.summary, ensure_ascii=False, separators=(",", ":")), batch_id),
  )
  _, verified_batch_id, verified_overlay = verify_chained_catch_up_database_state(
    cursor,
    parent_cumulative_plan=parent_cumulative_plan,
    cumulative_plan=cumulative_plan,
    stage_plan=stage_plan,
    expected_baseline_batch_id=expected_baseline_batch_id,
    expected_parent_batch_id=expected_parent_batch_id,
    expected_overlay_sha256=expected_overlay_sha256,
    lock_rows=True,
  )
  if verified_batch_id != batch_id:
    raise LegacyValidationError("chained catch-up batch did not reconcile after apply")
  return LegacyCatchUpResult(
    status="applied",
    import_batch_id=batch_id,
    overlay_sha256=verified_overlay.sha256,
  )


def import_catch_up_in_transaction(
  cursor: Any,
  *,
  plan: LegacyCatchUpPlan,
  source_git_sha: str,
  cutover_at: datetime,
  expected_baseline_batch_id: int,
  expected_overlay_sha256: str,
) -> LegacyCatchUpResult:
  cursor.execute("SELECT pg_advisory_xact_lock(%s)", (CATCH_UP_ADVISORY_LOCK_KEY,))
  baseline_batch_id, existing_batch_id, overlay = verify_catch_up_database_state(
    cursor,
    plan=plan,
    expected_baseline_batch_id=expected_baseline_batch_id,
    expected_overlay_sha256=expected_overlay_sha256,
    lock_rows=True,
  )
  if existing_batch_id is not None:
    return LegacyCatchUpResult(
      status="already_applied",
      import_batch_id=existing_batch_id,
      overlay_sha256=overlay.sha256,
    )
  sample_ids = _verify_sample_state(
    cursor,
    plan=plan,
    overlay=overlay,
    final=False,
    lock_rows=True,
  )

  cursor.execute(
    """
    INSERT INTO sample_inventory.import_batches (
      source_kind,
      source_sha256,
      source_file_name,
      source_git_sha,
      cutover_at,
      imported_by
    )
    VALUES (%s, %s, %s, %s, %s, %s)
    RETURNING id
    """,
    (
      CATCH_UP_SOURCE_KIND,
      plan.final.source_sha256,
      plan.final.source_path.name,
      source_git_sha,
      cutover_at,
      CATCH_UP_ACTOR,
    ),
  )
  batch_id = int(cursor.fetchone()[0])

  operations = [
    *((item.occurred_at, 0, item.legacy_id, "inbound", item) for item in plan.new_inbounds),
    *((item.requested_at, 1, item.legacy_id, "outbound", item) for item in plan.new_outbounds),
  ]
  for _, _, _, operation, item in sorted(operations):
    sample_id = sample_ids[item.sample_legacy_id]
    if operation == "inbound":
      _apply_inbound(cursor, item=item, sample_id=sample_id, batch_id=batch_id)
    else:
      _apply_outbound(cursor, item=item, sample_id=sample_id, batch_id=batch_id)

  cursor.execute(
    """
    UPDATE sample_inventory.import_batches
    SET
      status = 'succeeded',
      imported_counts = %s::JSONB,
      completed_at = NOW()
    WHERE id = %s
    """,
    (json.dumps(plan.summary, ensure_ascii=False, separators=(",", ":")), batch_id),
  )
  _verify_final_state(
    cursor,
    plan=plan,
    baseline_batch_id=baseline_batch_id,
    batch_id=batch_id,
    lock_rows=True,
  )
  return LegacyCatchUpResult(
    status="applied",
    import_batch_id=batch_id,
    overlay_sha256=overlay.sha256,
  )
