DO $$
DECLARE
  migrated_sample_id BIGINT;
BEGIN
  SELECT id
  INTO migrated_sample_id
  FROM sample_inventory.samples
  WHERE sample_code = 'MANUAL-RESERVATION-MIGRATION';

  IF NOT EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE id = migrated_sample_id
      AND on_hand_quantity = 10
      AND reserved_quantity = 0
      AND available_quantity = 10
      AND version = 2
      AND updated_by = 'system:manual-reservation-migration'
  ) THEN
    RAISE EXCEPTION 'legacy automatic reservation was not normalized to manual semantics';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE sample_code = 'MANUAL-RESERVATION-ZERO'
      AND on_hand_quantity = 8
      AND reserved_quantity = 0
      AND available_quantity = 8
      AND version = 1
      AND updated_by = 'fixture'
  ) THEN
    RAISE EXCEPTION 'zero reservation fixture changed during migration';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM sample_inventory.inventory_movements
    WHERE sample_id = migrated_sample_id
      AND movement_type = 'legacy_reservation_cleared'
      AND on_hand_delta = 0
      AND reserved_delta = -3
      AND resulting_on_hand_quantity = 10
      AND resulting_reserved_quantity = 0
      AND metadata ->> 'previousReservedQuantity' = '3'
  ) <> 1 THEN
    RAISE EXCEPTION 'manual reservation migration compensation movement is missing or duplicated';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM sample_inventory.business_events
    WHERE aggregate_type = 'sample'
      AND aggregate_id = migrated_sample_id::TEXT
      AND event_type = 'inventory.movement.recorded'
      AND payload ->> 'movementType' = 'legacy_reservation_cleared'
      AND payload ->> 'reservedDelta' = '-3'
  ) <> 1 THEN
    RAISE EXCEPTION 'manual reservation migration business event is missing or duplicated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM sample_inventory.inventory_movements
    WHERE sample_id = migrated_sample_id
    GROUP BY sample_id
    HAVING SUM(on_hand_delta) = 10 AND SUM(reserved_delta) = 0
  ) THEN
    RAISE EXCEPTION 'manual reservation migration movement ledger does not reconcile';
  END IF;
END;
$$;
