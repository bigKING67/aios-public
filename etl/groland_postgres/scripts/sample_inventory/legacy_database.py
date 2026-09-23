from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sample_inventory.legacy_model import LegacyImportPlan, LegacyValidationError


LEGACY_SOURCE_KIND = "legacy_sample_management_json_v1"
LEGACY_ACTOR = "legacy-import"


def _insert_event(
  cursor: Any,
  *,
  aggregate_type: str,
  aggregate_id: int,
  event_type: str,
  payload: dict[str, Any],
  occurred_at: datetime,
  batch_id: int,
  actor: str = LEGACY_ACTOR,
) -> None:
  cursor.execute(
    """
    INSERT INTO sample_inventory.business_events (
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      occurred_at,
      actor_user_id,
      import_batch_id
    )
    VALUES (%s, %s, %s, %s::JSONB, %s, %s, %s)
    """,
    (
      aggregate_type,
      str(aggregate_id),
      event_type,
      json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
      occurred_at,
      actor,
      batch_id,
    ),
  )


def _insert_opening_movement(
  cursor: Any,
  *,
  sample_id: int,
  sample_code: str,
  quantity: int,
  cutover_at: datetime,
  batch_id: int,
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
    VALUES (%s, 'legacy_cutover_opening', %s, 0, %s, 0, %s, %s, %s, %s, %s, %s::JSONB)
    RETURNING id
    """,
    (
      sample_id,
      quantity,
      quantity,
      LEGACY_SOURCE_KIND,
      str(batch_id),
      cutover_at,
      LEGACY_ACTOR,
      batch_id,
      '{"historyIncludedInAnalytics":false}',
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
      "movementType": "legacy_cutover_opening",
      "onHandDelta": quantity,
      "reservedDelta": 0,
      "resultingOnHandQuantity": quantity,
      "resultingReservedQuantity": 0,
      "resultingAvailableQuantity": quantity,
      "sourceType": LEGACY_SOURCE_KIND,
      "sourceId": str(batch_id),
      "historyIncludedInAnalytics": False,
    },
    occurred_at=cutover_at,
    batch_id=batch_id,
  )


def import_plan_in_transaction(
  cursor: Any,
  *,
  plan: LegacyImportPlan,
  source_git_sha: str,
  cutover_at: datetime,
) -> int:
  cursor.execute(
    """
    SELECT id
    FROM sample_inventory.import_batches
    WHERE source_kind = %s AND source_sha256 = %s
    """,
    (LEGACY_SOURCE_KIND, plan.source_sha256),
  )
  existing_batch = cursor.fetchone()
  if existing_batch is not None:
    raise LegacyValidationError(
      f"source SHA-256 was already imported in batch {existing_batch[0]}"
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
      LEGACY_SOURCE_KIND,
      plan.source_sha256,
      plan.source_path.name,
      source_git_sha,
      cutover_at,
      LEGACY_ACTOR,
    ),
  )
  batch_id = int(cursor.fetchone()[0])
  sample_ids: dict[str, int] = {}

  for sample in plan.samples:
    cursor.execute(
      """
      INSERT INTO sample_inventory.samples (
        sample_code,
        sample_name,
        model,
        category,
        location,
        remark,
        on_hand_quantity,
        reserved_quantity,
        legacy_source,
        legacy_id,
        created_by,
        updated_by
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, 0, %s, %s, %s, %s)
      RETURNING id
      """,
      (
        sample.code,
        sample.name,
        sample.model,
        sample.category,
        sample.location,
        sample.remark,
        sample.quantity,
        LEGACY_SOURCE_KIND,
        sample.legacy_id,
        LEGACY_ACTOR,
        LEGACY_ACTOR,
      ),
    )
    sample_id = int(cursor.fetchone()[0])
    sample_ids[sample.legacy_id] = sample_id
    _insert_opening_movement(
      cursor,
      sample_id=sample_id,
      sample_code=sample.code,
      quantity=sample.quantity,
      cutover_at=cutover_at,
      batch_id=batch_id,
    )

  for inbound in plan.inbounds:
    sample_id = sample_ids[inbound.sample_legacy_id]
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
        inbound.quantity,
        inbound.tracking_number,
        inbound.remark,
        inbound.operator_name,
        inbound.occurred_at,
        LEGACY_SOURCE_KIND,
        inbound.legacy_id,
        LEGACY_ACTOR,
      ),
    )
    inbound_id = int(cursor.fetchone()[0])
    _insert_event(
      cursor,
      aggregate_type="inbound_record",
      aggregate_id=inbound_id,
      event_type="inbound.legacy_imported",
      payload={
        "inboundId": inbound_id,
        "sampleId": sample_id,
        "sampleCode": inbound.sample_code,
        "quantity": inbound.quantity,
        "occurredAt": inbound.occurred_at.isoformat(),
        "timeQuality": "legacy_local_minute",
        "historyIncludedInStock": False,
      },
      occurred_at=cutover_at,
      batch_id=batch_id,
    )

  for outbound in plan.outbounds:
    sample_id = sample_ids[outbound.sample_legacy_id]
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
        outbound.quantity,
        outbound.applicant,
        outbound.department,
        outbound.purpose,
        outbound.receiver,
        outbound.shipping_address,
        outbound.tracking_number,
        outbound.status,
        outbound.requested_at,
        LEGACY_SOURCE_KIND,
        outbound.legacy_id,
        LEGACY_ACTOR,
        LEGACY_ACTOR,
      ),
    )
    request_id = int(cursor.fetchone()[0])
    _insert_event(
      cursor,
      aggregate_type="outbound_request",
      aggregate_id=request_id,
      event_type="outbound.legacy_imported",
      payload={
        "requestId": request_id,
        "sampleId": sample_id,
        "sampleCode": outbound.sample_code,
        "fromStatus": None,
        "toStatus": outbound.status,
        "quantity": outbound.quantity,
        "department": outbound.department,
        "applicant": outbound.applicant,
        "requestedAt": outbound.requested_at.isoformat(),
        "approvedAt": None,
        "sampledAt": None,
        "rejectedAt": None,
        "timeQuality": "legacy_request_only",
        "historyIncludedInAnalytics": False,
      },
      occurred_at=cutover_at,
      batch_id=batch_id,
    )

  cursor.execute(
    """
    UPDATE sample_inventory.import_batches
    SET
      status = 'succeeded',
      imported_counts = %s::JSONB,
      completed_at = NOW()
    WHERE id = %s
    """,
    (
      json.dumps(plan.summary, ensure_ascii=False, separators=(",", ":")),
      batch_id,
    ),
  )
  return batch_id
