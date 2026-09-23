from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sample_inventory.legacy_database import LEGACY_SOURCE_KIND
from sample_inventory.legacy_model import LegacyValidationError


CATCH_UP_SOURCE_KIND = "legacy_sample_management_json_v1_catch_up"
MANUAL_RESERVATION_MIGRATION_ACTOR = "system:manual-reservation-migration"
MANUAL_RESERVATION_MIGRATION_MOVEMENT = "legacy_reservation_cleared"
MANUAL_RESERVATION_MIGRATION_SOURCE_ID = "016_sample_inventory_manual_reservation_semantics"
MANUAL_RESERVATION_MIGRATION_SOURCE_TYPE = "migration"
MAX_OVERLAY_SAMPLES = 100
MAX_OVERLAY_INBOUNDS = 200
MAX_OVERLAY_OUTBOUNDS = 200
MAX_OVERLAY_MOVEMENTS = 500
MAX_OVERLAY_EVENTS = 1_000
MAX_OVERLAY_MUTATIONS = 1_000
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class LegacyOverlayAudit:
  sha256: str
  samples: int
  inbounds: int
  outbounds: int
  movements: int
  events: int
  mutations: int
  legacy_sample_version_offsets: dict[str, int]

  @property
  def summary(self) -> dict[str, int | str]:
    return {
      "sha256": self.sha256,
      "samples": self.samples,
      "inbounds": self.inbounds,
      "outbounds": self.outbounds,
      "movements": self.movements,
      "events": self.events,
      "mutations": self.mutations,
    }


def validate_expected_overlay_sha256(value: str | None) -> None:
  if value is not None and not SHA256_PATTERN.fullmatch(value):
    raise LegacyValidationError("expected database smoke overlay SHA-256 is invalid")


def _canonical_value(value: object) -> object:
  if isinstance(value, datetime):
    return value.isoformat()
  return value


def _canonical_rows(rows: list[tuple[object, ...]]) -> list[list[object]]:
  return [[_canonical_value(value) for value in row] for row in rows]


def _overlay_sha256(payload: dict[str, object]) -> str:
  canonical = json.dumps(
    payload,
    ensure_ascii=True,
    sort_keys=True,
    separators=(",", ":"),
  ).encode("utf-8")
  return hashlib.sha256(canonical).hexdigest()


def _required_int(value: object, message: str) -> int:
  try:
    return int(value)
  except (TypeError, ValueError) as error:
    raise LegacyValidationError(message) from error


def _mutation_record_ids(operation: str, payload: object) -> tuple[str, list[int]]:
  if not isinstance(payload, dict):
    raise LegacyValidationError("closed overlay mutation response is invalid")
  singular_operations = {
    "inbound.create": "inbound",
    "inbound.void": "inbound",
    "outbound.transition": "outbound",
    "outbound.update": "outbound",
    "outbound.update_tracking": "outbound",
  }
  owner = singular_operations.get(operation)
  if owner is not None:
    return owner, [_required_int(payload.get("id"), "closed overlay mutation id is invalid")]
  batch_operations = {
    "outbound.archive_batch",
    "outbound.create_batch",
    "outbound.edit_batch",
    "outbound.transition_batch",
  }
  if operation not in batch_operations:
    raise LegacyValidationError("closed overlay contains an unsupported mutation")
  items = payload.get("items")
  if not isinstance(items, list) or not items:
    raise LegacyValidationError("closed overlay mutation items are invalid")
  ids: list[int] = []
  for item in items:
    if not isinstance(item, dict):
      raise LegacyValidationError("closed overlay mutation item is invalid")
    ids.append(_required_int(item.get("id"), "closed overlay mutation id is invalid"))
  return "outbound", ids


def inspect_allowed_smoke_overlay(
  cursor: Any,
  *,
  baseline_batch_id: int,
  catch_up_batch_ids: tuple[int, ...] = (),
  lock_rows: bool,
) -> LegacyOverlayAudit:
  lock_clause = " FOR UPDATE" if lock_rows else ""
  allowed_batch_ids = [baseline_batch_id, *catch_up_batch_ids]

  cursor.execute(
    f"""
    SELECT
      id,
      legacy_source,
      legacy_id,
      on_hand_quantity,
      reserved_quantity,
      version,
      archived_at,
      created_at,
      updated_at
    FROM sample_inventory.samples
    WHERE legacy_source IS DISTINCT FROM %s
    ORDER BY id
    LIMIT {MAX_OVERLAY_SAMPLES + 1}{lock_clause}
    """,
    (LEGACY_SOURCE_KIND,),
  )
  sample_rows = list(cursor.fetchall())
  if len(sample_rows) > MAX_OVERLAY_SAMPLES:
    raise LegacyValidationError("nonlegacy smoke overlay exceeds the sample limit")
  for row in sample_rows:
    if row[1] is not None or row[2] is not None:
      raise LegacyValidationError("nonlegacy smoke overlay contains legacy provenance")
    if int(row[3]) != 0 or int(row[4]) != 0 or row[6] is None:
      raise LegacyValidationError("nonlegacy smoke overlay sample is active or has stock")
  sample_ids = [int(row[0]) for row in sample_rows]

  cursor.execute(
    f"""
    SELECT
      id,
      sample_id,
      quantity,
      source_kind,
      source_record_id,
      version,
      voided_at,
      occurred_at,
      created_at
    FROM sample_inventory.inbound_records
    WHERE sample_id = ANY(%s)
    ORDER BY id
    LIMIT {MAX_OVERLAY_INBOUNDS + 1}{lock_clause}
    """,
    (sample_ids,),
  )
  inbound_rows = list(cursor.fetchall())
  if len(inbound_rows) > MAX_OVERLAY_INBOUNDS:
    raise LegacyValidationError("nonlegacy smoke overlay exceeds the inbound limit")
  for row in inbound_rows:
    if row[6] is None:
      raise LegacyValidationError("nonlegacy smoke overlay contains an active inbound record")
    if str(row[3]) in {LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND}:
      raise LegacyValidationError("nonlegacy smoke overlay inbound record has legacy provenance")
  inbound_ids = [int(row[0]) for row in inbound_rows]

  cursor.execute(
    f"""
    SELECT id
    FROM sample_inventory.outbound_requests
    WHERE sample_id = ANY(%s)
    ORDER BY id
    LIMIT 1{lock_clause}
    """,
    (sample_ids,),
  )
  outbound_rows = list(cursor.fetchall())
  if outbound_rows:
    raise LegacyValidationError("nonlegacy smoke overlay contains an outbound request")

  cursor.execute(
    f"""
    SELECT
      outbound.id,
      outbound.sample_id,
      sample.legacy_id,
      outbound.quantity,
      outbound.status,
      outbound.time_quality,
      outbound.source_kind,
      outbound.source_record_id,
      outbound.version,
      outbound.archived_at,
      outbound.created_at,
      outbound.updated_at
    FROM sample_inventory.outbound_requests AS outbound
    JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
    WHERE sample.legacy_source = %s
      AND outbound.source_kind IS DISTINCT FROM %s
      AND outbound.source_kind IS DISTINCT FROM %s
    ORDER BY outbound.id
    LIMIT {MAX_OVERLAY_OUTBOUNDS + 1}{lock_clause}
    """,
    (LEGACY_SOURCE_KIND, LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND),
  )
  legacy_outbound_rows = list(cursor.fetchall())
  if len(legacy_outbound_rows) > MAX_OVERLAY_OUTBOUNDS:
    raise LegacyValidationError("closed outbound overlay exceeds the outbound limit")
  for row in legacy_outbound_rows:
    if row[6] is not None or row[7] is not None:
      raise LegacyValidationError("closed outbound overlay contains external provenance")
    if str(row[4]) not in {"sampled", "rejected"} or str(row[5]) != "known" or row[9] is None:
      raise LegacyValidationError("closed outbound overlay contains an active or unsupported request")
  legacy_outbound_by_id = {int(row[0]): row for row in legacy_outbound_rows}
  legacy_outbound_sample_ids = {int(row[1]) for row in legacy_outbound_rows}

  cursor.execute(
    f"""
    SELECT
      inbound.id,
      inbound.sample_id,
      sample.legacy_id,
      inbound.quantity,
      inbound.source_kind,
      inbound.source_record_id,
      inbound.time_quality,
      inbound.version,
      inbound.voided_at,
      inbound.created_at
    FROM sample_inventory.inbound_records AS inbound
    JOIN sample_inventory.samples AS sample ON sample.id = inbound.sample_id
    WHERE sample.legacy_source = %s
      AND inbound.source_kind IS DISTINCT FROM %s
      AND inbound.source_kind IS DISTINCT FROM %s
    ORDER BY inbound.id
    LIMIT {MAX_OVERLAY_INBOUNDS + 1}{lock_clause}
    """,
    (LEGACY_SOURCE_KIND, LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND),
  )
  legacy_inbound_rows = list(cursor.fetchall())
  if len(legacy_inbound_rows) > MAX_OVERLAY_INBOUNDS:
    raise LegacyValidationError("closed inbound overlay exceeds the inbound limit")
  for row in legacy_inbound_rows:
    if row[4] is not None or row[5] is not None or str(row[6]) != "known" or row[8] is None:
      raise LegacyValidationError("closed inbound overlay contains an active or unsupported record")
  legacy_inbound_by_id = {int(row[0]): row for row in legacy_inbound_rows}
  legacy_inbound_sample_ids = {int(row[1]) for row in legacy_inbound_rows}

  cursor.execute(
    f"""
    SELECT
      outbound.id,
      outbound.sample_id,
      sample.legacy_id,
      outbound.quantity,
      outbound.status,
      outbound.time_quality,
      outbound.source_kind,
      outbound.source_record_id,
      outbound.version,
      outbound.archived_at,
      outbound.created_at,
      outbound.updated_at
    FROM sample_inventory.outbound_requests AS outbound
    JOIN sample_inventory.samples AS sample ON sample.id = outbound.sample_id
    WHERE sample.legacy_source = %s
      AND outbound.source_kind IN (%s, %s)
      AND (
        EXISTS (
          SELECT 1
          FROM sample_inventory.inventory_movements AS movement
          WHERE movement.source_type = 'outbound_request'
            AND movement.source_id = outbound.id::TEXT
            AND movement.import_batch_id IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM sample_inventory.business_events AS event
          WHERE event.aggregate_type = 'outbound_request'
            AND event.aggregate_id = outbound.id::TEXT
            AND event.import_batch_id IS NULL
        )
      )
    ORDER BY outbound.id
    LIMIT {MAX_OVERLAY_OUTBOUNDS + 1}{lock_clause}
    """,
    (LEGACY_SOURCE_KIND, LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND),
  )
  imported_outbound_rows = list(cursor.fetchall())
  if len(imported_outbound_rows) > MAX_OVERLAY_OUTBOUNDS:
    raise LegacyValidationError("mutated imported outbound overlay exceeds the outbound limit")
  for row in imported_outbound_rows:
    if (
      str(row[4]) not in {"pending", "approved", "sampled", "rejected"}
      or str(row[5]) != "legacy_request_only"
      or str(row[6]) not in {LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND}
      or row[7] is None
      or row[9] is not None
    ):
      raise LegacyValidationError("mutated imported outbound overlay is not active or supported")
  imported_outbound_by_id = {int(row[0]): row for row in imported_outbound_rows}
  imported_outbound_sample_ids = {int(row[1]) for row in imported_outbound_rows}
  outbound_overlay_by_id = {**legacy_outbound_by_id, **imported_outbound_by_id}
  outbound_overlay_sample_ids = legacy_outbound_sample_ids | imported_outbound_sample_ids

  cursor.execute(
    f"""
    SELECT
      movement.id,
      movement.sample_id,
      sample.legacy_source,
      sample.legacy_id,
      movement.movement_type,
      movement.on_hand_delta,
      movement.reserved_delta,
      movement.resulting_on_hand_quantity,
      movement.resulting_reserved_quantity,
      movement.source_type,
      movement.source_id,
      movement.occurred_at,
      movement.import_batch_id,
      movement.actor_user_id,
      movement.metadata,
      movement.created_at
    FROM sample_inventory.inventory_movements AS movement
    JOIN sample_inventory.samples AS sample ON sample.id = movement.sample_id
    WHERE movement.import_batch_id IS NULL OR NOT (movement.import_batch_id = ANY(%s))
    ORDER BY movement.id
    LIMIT {MAX_OVERLAY_MOVEMENTS + 1}{lock_clause}
    """,
    (allowed_batch_ids,),
  )
  movement_rows = list(cursor.fetchall())
  if len(movement_rows) > MAX_OVERLAY_MOVEMENTS:
    raise LegacyValidationError("closed smoke overlay exceeds the movement limit")
  movement_totals: dict[int, list[int]] = defaultdict(lambda: [0, 0])
  outbound_movement_totals: dict[int, list[int]] = defaultdict(lambda: [0, 0])
  outbound_movement_counts: Counter[int] = Counter()
  inbound_movement_signatures: Counter[tuple[int, str, int, int]] = Counter()
  legacy_sample_version_offsets: dict[str, int] = defaultdict(int)
  migration_movements: dict[int, tuple[object, ...]] = {}
  for row in movement_rows:
    sample_id = int(row[1])
    on_hand_delta = int(row[5])
    reserved_delta = int(row[6])
    is_manual_reservation_migration = (
      str(row[4]) == MANUAL_RESERVATION_MIGRATION_MOVEMENT
      or str(row[9]) == MANUAL_RESERVATION_MIGRATION_SOURCE_TYPE
      or str(row[10]) == MANUAL_RESERVATION_MIGRATION_SOURCE_ID
      or str(row[13]) == MANUAL_RESERVATION_MIGRATION_ACTOR
    )
    if is_manual_reservation_migration:
      metadata = row[14]
      previous_reserved = -reserved_delta
      if (
        str(row[4]) != MANUAL_RESERVATION_MIGRATION_MOVEMENT
        or on_hand_delta != 0
        or reserved_delta >= 0
        or int(row[8]) != 0
        or str(row[9]) != MANUAL_RESERVATION_MIGRATION_SOURCE_TYPE
        or str(row[10]) != MANUAL_RESERVATION_MIGRATION_SOURCE_ID
        or row[12] is not None
        or str(row[13]) != MANUAL_RESERVATION_MIGRATION_ACTOR
        or not isinstance(metadata, dict)
        or metadata.get("reason") != "replace_automatic_reservation_with_manual_semantics"
        or _required_int(
          metadata.get("previousReservedQuantity"),
          "manual reservation migration movement metadata is invalid",
        ) != previous_reserved
      ):
        raise LegacyValidationError("manual reservation migration movement is invalid")
      movement_id = int(row[0])
      if movement_id in migration_movements:
        raise LegacyValidationError("manual reservation migration movement is duplicated")
      migration_movements[movement_id] = row
      if str(row[2]) == LEGACY_SOURCE_KIND:
        if row[3] is None:
          raise LegacyValidationError("manual reservation migration legacy identity is invalid")
        legacy_sample_version_offsets[str(row[3])] += 1
      elif sample_id in sample_ids:
        movement_totals[sample_id][0] += on_hand_delta
        movement_totals[sample_id][1] += reserved_delta
      else:
        raise LegacyValidationError("manual reservation migration movement is outside the closed overlay")
      continue
    movement_totals[sample_id][0] += on_hand_delta
    movement_totals[sample_id][1] += reserved_delta
    if row[12] is not None:
      raise LegacyValidationError("closed smoke overlay movement has import provenance")
    if sample_id in sample_ids:
      if str(row[9]) in {LEGACY_SOURCE_KIND, CATCH_UP_SOURCE_KIND}:
        raise LegacyValidationError("nonlegacy smoke overlay movement has legacy import provenance")
      continue
    if str(row[2]) != LEGACY_SOURCE_KIND:
      raise LegacyValidationError("database contains a runtime movement outside the closed smoke overlay")
    source_type = str(row[9])
    source_id = _required_int(row[10], "closed overlay movement source is invalid")
    if source_type == "outbound_request":
      outbound = outbound_overlay_by_id.get(source_id)
      if outbound is None or int(outbound[1]) != sample_id:
        raise LegacyValidationError("database contains a runtime movement outside the closed smoke overlay")
      quantity = int(outbound[3])
      allowed_deltas = {
        "outbound_pending_to_approved": {(0, quantity)},
        "outbound_approved_to_sampled": {(-quantity, -quantity), (-quantity, 0)},
        "outbound_approved_to_pending": {(0, -quantity)},
        "outbound_approved_to_rejected": {(0, -quantity)},
        "outbound_sampled_to_approved": {(quantity, quantity), (quantity, 0)},
        "outbound_sampled_to_pending": {(quantity, 0)},
        "outbound_sampled_to_rejected": {(quantity, 0)},
      }
      if str(row[4]) == "outbound_archived_compensation":
        if str(outbound[4]) == "approved":
          expected_deltas = {(0, -quantity)}
        elif str(outbound[4]) == "sampled":
          expected_deltas = {(quantity, 0)}
        else:
          expected_deltas = set()
      else:
        expected_deltas = allowed_deltas.get(str(row[4]), set())
      if (on_hand_delta, reserved_delta) not in expected_deltas:
        raise LegacyValidationError("closed outbound overlay movement delta is invalid")
      outbound_movement_totals[source_id][0] += on_hand_delta
      outbound_movement_totals[source_id][1] += reserved_delta
      outbound_movement_counts[source_id] += 1
    elif source_type == "inbound_record":
      inbound = legacy_inbound_by_id.get(source_id)
      if inbound is None or int(inbound[1]) != sample_id:
        raise LegacyValidationError("database contains a runtime movement outside the closed smoke overlay")
      inbound_movement_signatures[(source_id, str(row[4]), on_hand_delta, reserved_delta)] += 1
    else:
      raise LegacyValidationError("database contains a runtime movement outside the closed smoke overlay")
    legacy_sample_version_offsets[str(row[3])] += 1
  if any(total != [0, 0] for total in movement_totals.values()):
    raise LegacyValidationError("closed smoke overlay movement net change is not zero")
  if any(total != [0, 0] for total in outbound_movement_totals.values()):
    raise LegacyValidationError("closed outbound overlay movement net change is not zero")
  for inbound_id, row in legacy_inbound_by_id.items():
    quantity = int(row[3])
    expected = Counter({
      (inbound_id, "inbound_received", quantity, 0): 1,
      (inbound_id, "inbound_voided", -quantity, 0): 1,
    })
    actual = Counter({
      signature: count
      for signature, count in inbound_movement_signatures.items()
      if signature[0] == inbound_id
    })
    if actual != expected:
      raise LegacyValidationError("closed inbound overlay movement history is incomplete")

  cursor.execute(
    f"""
    SELECT
      id,
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      occurred_at,
      import_batch_id,
      created_at,
      actor_user_id
    FROM sample_inventory.business_events
    WHERE import_batch_id IS NULL OR NOT (import_batch_id = ANY(%s))
    ORDER BY id
    LIMIT {MAX_OVERLAY_EVENTS + 1}{lock_clause}
    """,
    (allowed_batch_ids,),
  )
  event_rows = list(cursor.fetchall())
  if len(event_rows) > MAX_OVERLAY_EVENTS:
    raise LegacyValidationError("nonlegacy smoke overlay exceeds the event limit")
  allowed_aggregates = {
    *(("sample", sample_id) for sample_id in sample_ids),
    *(("inbound_record", inbound_id) for inbound_id in inbound_ids),
  }
  outbound_event_counts: Counter[tuple[int, str]] = Counter()
  requested_event_counts: Counter[int] = Counter()
  outbound_movement_event_counts: Counter[int] = Counter()
  inbound_event_counts: Counter[tuple[int, str]] = Counter()
  inbound_movement_event_counts: Counter[int] = Counter()
  migration_movement_event_counts: Counter[int] = Counter()
  for row in event_rows:
    aggregate = (str(row[1]), _required_int(row[2], "business event aggregate identity is invalid"))
    if row[6] is not None:
      raise LegacyValidationError("business event outside legacy history has import provenance")
    payload = row[4]
    is_manual_reservation_migration = str(row[8]) == MANUAL_RESERVATION_MIGRATION_ACTOR or (
      isinstance(payload, dict)
      and (
        payload.get("movementType") == MANUAL_RESERVATION_MIGRATION_MOVEMENT
        or payload.get("sourceType") == MANUAL_RESERVATION_MIGRATION_SOURCE_TYPE
        or payload.get("sourceId") == MANUAL_RESERVATION_MIGRATION_SOURCE_ID
      )
    )
    if is_manual_reservation_migration:
      if not isinstance(payload, dict):
        raise LegacyValidationError("manual reservation migration event payload is invalid")
      movement_id = _required_int(
        payload.get("movementId"),
        "manual reservation migration event movement identity is invalid",
      )
      movement = migration_movements.get(movement_id)
      if movement is None:
        raise LegacyValidationError("manual reservation migration event has no matching movement")
      sample_id = int(movement[1])
      if (
        aggregate != ("sample", sample_id)
        or str(row[3]) != "inventory.movement.recorded"
        or str(row[8]) != MANUAL_RESERVATION_MIGRATION_ACTOR
        or payload.get("movementType") != MANUAL_RESERVATION_MIGRATION_MOVEMENT
        or payload.get("sourceType") != MANUAL_RESERVATION_MIGRATION_SOURCE_TYPE
        or payload.get("sourceId") != MANUAL_RESERVATION_MIGRATION_SOURCE_ID
        or _required_int(payload.get("sampleId"), "manual reservation migration sample identity is invalid")
        != sample_id
        or _required_int(payload.get("onHandDelta"), "manual reservation migration event delta is invalid")
        != int(movement[5])
        or _required_int(payload.get("reservedDelta"), "manual reservation migration event delta is invalid")
        != int(movement[6])
        or _required_int(
          payload.get("resultingOnHandQuantity"),
          "manual reservation migration event balance is invalid",
        )
        != int(movement[7])
        or _required_int(
          payload.get("resultingReservedQuantity"),
          "manual reservation migration event balance is invalid",
        )
        != int(movement[8])
      ):
        raise LegacyValidationError("manual reservation migration event is invalid")
      migration_movement_event_counts[movement_id] += 1
      continue
    if aggregate in allowed_aggregates:
      continue
    if not isinstance(payload, dict):
      raise LegacyValidationError("closed outbound overlay event payload is invalid")
    if aggregate[0] == "outbound_request" and aggregate[1] in outbound_overlay_by_id:
      if str(row[3]) not in {
        "outbound.archived",
        "outbound.created",
        "outbound.tracking_updated",
        "outbound.transitioned",
        "outbound.updated",
      }:
        raise LegacyValidationError("closed outbound overlay contains an unsupported outbound event")
      outbound_event_counts[(aggregate[1], str(row[3]))] += 1
      continue
    if aggregate[0] == "inbound_record" and aggregate[1] in legacy_inbound_by_id:
      if str(row[3]) not in {"inbound.created", "inbound.voided"}:
        raise LegacyValidationError("closed inbound overlay contains an unsupported inbound event")
      inbound_event_counts[(aggregate[1], str(row[3]))] += 1
      continue
    if aggregate[0] == "sample" and aggregate[1] in (
      outbound_overlay_sample_ids | legacy_inbound_sample_ids
    ):
      sample_id = aggregate[1]
      if str(row[3]) == "sample.outbound_requested":
        outbound_id = _required_int(payload.get("requestId"), "closed outbound overlay request event is invalid")
        if outbound_id not in legacy_outbound_by_id or int(legacy_outbound_by_id[outbound_id][1]) != sample_id:
          raise LegacyValidationError("closed outbound overlay request event is not isolated")
        requested_event_counts[outbound_id] += 1
        continue
      if str(row[3]) == "inventory.movement.recorded":
        source_id = _required_int(payload.get("sourceId"), "closed overlay movement event is invalid")
        if payload.get("sourceType") == "outbound_request":
          outbound = outbound_overlay_by_id.get(source_id)
          if outbound is None or int(outbound[1]) != sample_id:
            raise LegacyValidationError("closed outbound overlay movement event is not isolated")
          outbound_movement_event_counts[source_id] += 1
          continue
        if payload.get("sourceType") == "inbound_record":
          inbound = legacy_inbound_by_id.get(source_id)
          if inbound is None or int(inbound[1]) != sample_id:
            raise LegacyValidationError("closed inbound overlay movement event is not isolated")
          inbound_movement_event_counts[source_id] += 1
          continue
    raise LegacyValidationError("business events outside legacy history are not isolated to the smoke overlay")

  if any(migration_movement_event_counts[movement_id] != 1 for movement_id in migration_movements):
    raise LegacyValidationError("manual reservation migration event history is incomplete")

  cursor.execute("SELECT id FROM sample_inventory.import_batches ORDER BY id")
  actual_batch_ids = [int(row[0]) for row in cursor.fetchall()]
  if actual_batch_ids != sorted(allowed_batch_ids):
    raise LegacyValidationError("database import batches are not limited to the pinned legacy stages")

  cursor.execute("SELECT to_regclass('sample_inventory.mutation_requests') IS NOT NULL")
  mutation_table_exists = cursor.fetchone()[0] is True
  mutation_rows: list[tuple[object, ...]] = []
  if mutation_table_exists:
    cursor.execute(
      f"""
      SELECT
        id,
        operation,
        submission_key,
        request_sha256,
        actor_user_id,
        response_payload,
        created_at,
        completed_at
      FROM sample_inventory.mutation_requests
      ORDER BY id
      LIMIT {MAX_OVERLAY_MUTATIONS + 1}{lock_clause}
      """
    )
    mutation_rows = list(cursor.fetchall())
    if len(mutation_rows) > MAX_OVERLAY_MUTATIONS:
      raise LegacyValidationError("closed outbound overlay exceeds the mutation limit")
  mutation_references: Counter[tuple[str, str, int]] = Counter()
  for row in mutation_rows:
    operation = str(row[1])
    if row[5] is None or row[7] is None:
      raise LegacyValidationError("closed overlay contains an incomplete mutation")
    owner, record_ids = _mutation_record_ids(operation, row[5])
    for record_id in record_ids:
      if owner == "outbound" and record_id not in outbound_overlay_by_id:
        raise LegacyValidationError("closed outbound overlay mutation references another record")
      if owner == "inbound" and record_id not in legacy_inbound_by_id:
        raise LegacyValidationError("closed inbound overlay mutation references another record")
      mutation_references[(operation, owner, record_id)] += 1

  transition_operations = ("outbound.transition", "outbound.transition_batch")
  update_operations = ("outbound.edit_batch", "outbound.update")
  for outbound_id in outbound_overlay_by_id:
    transition_count = sum(
      mutation_references[(operation, "outbound", outbound_id)]
      for operation in transition_operations
    )
    update_count = sum(
      mutation_references[(operation, "outbound", outbound_id)]
      for operation in update_operations
    )
    tracking_count = mutation_references[("outbound.update_tracking", "outbound", outbound_id)]
    is_runtime = outbound_id in legacy_outbound_by_id
    if (
      mutation_references[("outbound.create_batch", "outbound", outbound_id)] != int(is_runtime)
      or mutation_references[("outbound.archive_batch", "outbound", outbound_id)] != int(is_runtime)
      or outbound_event_counts[(outbound_id, "outbound.created")] != int(is_runtime)
      or outbound_event_counts[(outbound_id, "outbound.archived")] != int(is_runtime)
      or requested_event_counts[outbound_id] != int(is_runtime)
      or outbound_event_counts[(outbound_id, "outbound.transitioned")] != transition_count
      or outbound_event_counts[(outbound_id, "outbound.updated")] != update_count
      or outbound_event_counts[(outbound_id, "outbound.tracking_updated")] != tracking_count
      or outbound_movement_event_counts[outbound_id] != outbound_movement_counts[outbound_id]
    ):
      raise LegacyValidationError("closed outbound overlay mutation or event history is incomplete")

  for inbound_id in legacy_inbound_by_id:
    if (
      mutation_references[("inbound.create", "inbound", inbound_id)] != 1
      or mutation_references[("inbound.void", "inbound", inbound_id)] != 1
      or inbound_event_counts[(inbound_id, "inbound.created")] != 1
      or inbound_event_counts[(inbound_id, "inbound.voided")] != 1
      or inbound_movement_event_counts[inbound_id] != 2
    ):
      raise LegacyValidationError("closed inbound overlay mutation or event history is incomplete")

  if (legacy_outbound_rows or imported_outbound_rows or legacy_inbound_rows) and not mutation_table_exists:
    raise LegacyValidationError("closed overlay requires the mutation ledger")

  canonical_payload: dict[str, object] = {
    "schemaVersion": 2,
    "samples": _canonical_rows(sample_rows),
    "inbounds": _canonical_rows(inbound_rows),
    "legacyInbounds": _canonical_rows(legacy_inbound_rows),
    "outbounds": _canonical_rows(legacy_outbound_rows),
    "importedOutbounds": _canonical_rows(imported_outbound_rows),
    "movements": _canonical_rows(movement_rows),
    "events": _canonical_rows(event_rows),
    "mutations": _canonical_rows(mutation_rows),
  }
  return LegacyOverlayAudit(
    sha256=_overlay_sha256(canonical_payload),
    samples=len(sample_rows),
    inbounds=len(inbound_rows) + len(legacy_inbound_rows),
    outbounds=len(legacy_outbound_rows) + len(imported_outbound_rows),
    movements=len(movement_rows),
    events=len(event_rows),
    mutations=len(mutation_rows),
    legacy_sample_version_offsets=dict(legacy_sample_version_offsets),
  )
