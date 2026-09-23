DO $$
DECLARE
  current_sample_id BIGINT;
  legacy_sample_id BIGINT;
  unchanged_sample_id BIGINT;
  skipped_sample_id BIGINT;
BEGIN
  SELECT id INTO current_sample_id
  FROM sample_inventory.samples
  WHERE sample_code = 'APPROVAL-MIG-CURRENT';

  SELECT id INTO legacy_sample_id
  FROM sample_inventory.samples
  WHERE sample_code = 'APPROVAL-MIG-LEGACY';

  SELECT id INTO unchanged_sample_id
  FROM sample_inventory.samples
  WHERE sample_code = 'APPROVAL-MIG-UNCHANGED';

  SELECT id INTO skipped_sample_id
  FROM sample_inventory.samples
  WHERE sample_code = 'APPROVAL-MIG-SKIP';

  IF NOT EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE id = current_sample_id
      AND on_hand_quantity = 7
      AND reserved_quantity = 2
      AND available_quantity = 5
      AND version = 2
      AND updated_by = 'system:approval-stock-migration'
  ) THEN
    RAISE EXCEPTION 'current approved row was not deducted exactly once';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE id = legacy_sample_id
      AND on_hand_quantity = 6
      AND reserved_quantity = 1
      AND available_quantity = 5
      AND version = 2
      AND updated_by = 'system:approval-stock-migration'
  ) THEN
    RAISE EXCEPTION 'legacy approved row was not deducted exactly once';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE id = unchanged_sample_id
      AND on_hand_quantity = 20
      AND reserved_quantity = 0
      AND version = 1
      AND updated_by = 'fixture'
  ) THEN
    RAISE EXCEPTION 'sampled, pending, rejected, or archived approved fixture changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE id = skipped_sample_id
      AND on_hand_quantity = 6
      AND reserved_quantity = 1
      AND available_quantity = 5
      AND version = 7
      AND updated_by = 'fixture'
  ) THEN
    RAISE EXCEPTION 'already-debited approved fixture changed';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM sample_inventory.inventory_movements AS movement
    JOIN sample_inventory.outbound_requests AS outbound
      ON movement.source_type = 'outbound_request'
      AND movement.source_id = outbound.id::TEXT
    WHERE outbound.source_record_id IN ('approval-current', 'approval-legacy')
      AND movement.movement_type = 'outbound_pending_to_approved'
      AND movement.on_hand_delta = -outbound.quantity
      AND movement.reserved_delta = 0
      AND movement.actor_user_id = 'system:approval-stock-migration'
      AND movement.metadata ->> 'reason' = 'backfill_existing_approved_stock'
      AND movement.metadata ->> 'migration' = '017_sample_inventory_approval_stock_deduction'
  ) <> 2 THEN
    RAISE EXCEPTION 'approval migration movements are missing or duplicated';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM sample_inventory.business_events AS event
    WHERE event.aggregate_type = 'sample'
      AND event.aggregate_id IN (current_sample_id::TEXT, legacy_sample_id::TEXT)
      AND event.event_type = 'inventory.movement.recorded'
      AND event.payload ->> 'movementType' = 'outbound_pending_to_approved'
      AND event.actor_user_id = 'system:approval-stock-migration'
  ) <> 2 THEN
    RAISE EXCEPTION 'approval migration business events are missing or duplicated';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM sample_inventory.business_events
    WHERE aggregate_type = 'sample'
      AND aggregate_id = skipped_sample_id::TEXT
      AND event_type = 'inventory.movement.recorded'
      AND payload ->> 'movementType' = 'outbound_pending_to_approved'
  ) <> 1 THEN
    RAISE EXCEPTION 'already-debited approval event changed or duplicated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM sample_inventory.inventory_movements AS movement
    JOIN sample_inventory.outbound_requests AS outbound
      ON movement.source_type = 'outbound_request'
      AND movement.source_id = outbound.id::TEXT
    WHERE outbound.source_record_id IN (
      'approval-sampled',
      'approval-pending',
      'approval-rejected',
      'approval-archived'
    )
      AND movement.movement_type = 'outbound_pending_to_approved'
  ) THEN
    RAISE EXCEPTION 'non-target outbound received an approval debit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM sample_inventory.samples AS sample
    WHERE sample.id IN (current_sample_id, legacy_sample_id, unchanged_sample_id, skipped_sample_id)
      AND NOT EXISTS (
        SELECT 1
        FROM sample_inventory.inventory_movements AS movement
        WHERE movement.sample_id = sample.id
        GROUP BY movement.sample_id
        HAVING SUM(movement.on_hand_delta) = sample.on_hand_quantity
          AND SUM(movement.reserved_delta) = 0
      )
  ) THEN
    RAISE EXCEPTION 'approval migration movement ledger does not reconcile';
  END IF;
END;
$$;
