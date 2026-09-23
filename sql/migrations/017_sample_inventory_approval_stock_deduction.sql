DO $$
DECLARE
  approved_request RECORD;
  locked_sample RECORD;
  movement_id BIGINT;
  migrated_at TIMESTAMPTZ;
  resulting_on_hand INTEGER;
BEGIN
  FOR approved_request IN
    SELECT id, sample_id, quantity
    FROM sample_inventory.outbound_requests
    WHERE archived_at IS NULL
      AND status = 'approved'
    ORDER BY sample_id, id
    FOR UPDATE
  LOOP
    SELECT id, sample_code, on_hand_quantity, reserved_quantity
    INTO locked_sample
    FROM sample_inventory.samples
    WHERE id = approved_request.sample_id
      AND archived_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'active approved outbound % references missing or archived sample %',
        approved_request.id,
        approved_request.sample_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM sample_inventory.inventory_movements
      WHERE sample_id = approved_request.sample_id
        AND source_type = 'outbound_request'
        AND source_id = approved_request.id::TEXT
        AND movement_type = 'outbound_pending_to_approved'
        AND on_hand_delta = -approved_request.quantity
        AND reserved_delta = 0
    ) THEN
      CONTINUE;
    END IF;

    resulting_on_hand := locked_sample.on_hand_quantity - approved_request.quantity;
    IF resulting_on_hand < 0 OR resulting_on_hand < locked_sample.reserved_quantity THEN
      RAISE EXCEPTION
        'approval stock backfill for outbound % would violate sample % balance: on_hand %, reserved %, quantity %',
        approved_request.id,
        approved_request.sample_id,
        locked_sample.on_hand_quantity,
        locked_sample.reserved_quantity,
        approved_request.quantity;
    END IF;

    migrated_at := clock_timestamp();

    UPDATE sample_inventory.samples
    SET
      on_hand_quantity = resulting_on_hand,
      version = version + 1,
      updated_by = 'system:approval-stock-migration'
    WHERE id = approved_request.sample_id;

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
      metadata
    )
    VALUES (
      approved_request.sample_id,
      'outbound_pending_to_approved',
      -approved_request.quantity,
      0,
      resulting_on_hand,
      locked_sample.reserved_quantity,
      'outbound_request',
      approved_request.id::TEXT,
      migrated_at,
      'system:approval-stock-migration',
      jsonb_build_object(
        'fromStatus', 'pending',
        'toStatus', 'approved',
        'reason', 'backfill_existing_approved_stock',
        'migration', '017_sample_inventory_approval_stock_deduction'
      )
    )
    RETURNING id INTO movement_id;

    INSERT INTO sample_inventory.business_events (
      aggregate_type,
      aggregate_id,
      event_type,
      payload,
      occurred_at,
      actor_user_id
    )
    VALUES (
      'sample',
      approved_request.sample_id::TEXT,
      'inventory.movement.recorded',
      jsonb_build_object(
        'movementId', movement_id,
        'sampleId', approved_request.sample_id,
        'sampleCode', locked_sample.sample_code,
        'movementType', 'outbound_pending_to_approved',
        'onHandDelta', -approved_request.quantity,
        'reservedDelta', 0,
        'resultingOnHandQuantity', resulting_on_hand,
        'resultingReservedQuantity', locked_sample.reserved_quantity,
        'resultingAvailableQuantity', resulting_on_hand - locked_sample.reserved_quantity,
        'sourceType', 'outbound_request',
        'sourceId', approved_request.id::TEXT
      ),
      migrated_at,
      'system:approval-stock-migration'
    );
  END LOOP;
END;
$$;
