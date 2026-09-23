DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sample_inventory.outbound_requests AS outbound
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE movement.movement_type = 'outbound_pending_to_approved'
        ) AS approval_debit_count,
        COUNT(*) FILTER (
          WHERE movement.movement_type = 'outbound_pending_to_approved'
            AND movement.on_hand_delta = -outbound.quantity
            AND movement.reserved_delta = 0
        ) AS exact_debit_count
      FROM sample_inventory.inventory_movements AS movement
      WHERE movement.sample_id = outbound.sample_id
        AND movement.source_type = 'outbound_request'
        AND movement.source_id = outbound.id::TEXT
    ) AS debit ON TRUE
    WHERE outbound.archived_at IS NULL
      AND outbound.status = 'approved'
      AND (
        debit.exact_debit_count <> 1
        OR debit.approval_debit_count <> 1
      )
  ) THEN
    RAISE EXCEPTION 'active approved outbound debit contract is incomplete or malformed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM sample_inventory.inventory_movements AS movement
    JOIN sample_inventory.outbound_requests AS outbound
      ON outbound.id::TEXT = movement.source_id
     AND outbound.sample_id = movement.sample_id
    WHERE movement.source_type = 'outbound_request'
      AND movement.movement_type = 'outbound_pending_to_approved'
      AND movement.on_hand_delta = -outbound.quantity
      AND movement.reserved_delta = 0
      AND NOT EXISTS (
        SELECT 1
        FROM sample_inventory.business_events AS event
        WHERE event.aggregate_type = 'sample'
          AND event.aggregate_id = movement.sample_id::TEXT
          AND event.event_type = 'inventory.movement.recorded'
          AND event.payload ->> 'movementId' = movement.id::TEXT
          AND event.payload ->> 'movementType' = movement.movement_type
          AND event.payload ->> 'onHandDelta' = movement.on_hand_delta::TEXT
          AND event.payload ->> 'reservedDelta' = movement.reserved_delta::TEXT
          AND event.payload ->> 'resultingOnHandQuantity' = movement.resulting_on_hand_quantity::TEXT
          AND event.payload ->> 'resultingReservedQuantity' = movement.resulting_reserved_quantity::TEXT
          AND event.payload ->> 'sourceType' = movement.source_type
          AND event.payload ->> 'sourceId' = movement.source_id
      )
  ) THEN
    RAISE EXCEPTION 'approval debit movement is missing its matching business event';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE on_hand_quantity < 0
       OR reserved_quantity < 0
       OR on_hand_quantity < reserved_quantity
       OR available_quantity <> on_hand_quantity - reserved_quantity
  ) THEN
    RAISE EXCEPTION 'sample inventory balance contract is invalid after approval-stock cutover';
  END IF;
END;
$$;
