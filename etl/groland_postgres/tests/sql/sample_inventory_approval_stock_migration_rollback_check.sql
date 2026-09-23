DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE sample_code = 'APPROVAL-MIG-ROLLBACK-SAFE'
      AND on_hand_quantity = 10
      AND reserved_quantity = 0
      AND version = 1
      AND updated_by = 'fixture'
  ) OR NOT EXISTS (
    SELECT 1
    FROM sample_inventory.samples
    WHERE sample_code = 'APPROVAL-MIG-ROLLBACK-BLOCKED'
      AND on_hand_quantity = 5
      AND reserved_quantity = 4
      AND version = 1
      AND updated_by = 'fixture'
  ) THEN
    RAISE EXCEPTION 'failed approval migration left a partial sample update';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM sample_inventory.outbound_requests
    WHERE source_record_id IN ('approval-rollback-safe', 'approval-rollback-blocked')
      AND status = 'approved'
      AND version = 1
  ) <> 2 THEN
    RAISE EXCEPTION 'failed approval migration changed an outbound request';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM sample_inventory.inventory_movements AS movement
    JOIN sample_inventory.outbound_requests AS outbound
      ON movement.source_type = 'outbound_request'
      AND movement.source_id = outbound.id::TEXT
    WHERE outbound.source_record_id IN ('approval-rollback-safe', 'approval-rollback-blocked')
  ) THEN
    RAISE EXCEPTION 'failed approval migration left a partial movement';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM sample_inventory.business_events AS event
    JOIN sample_inventory.samples AS sample
      ON event.aggregate_type = 'sample'
      AND event.aggregate_id = sample.id::TEXT
    WHERE sample.sample_code IN ('APPROVAL-MIG-ROLLBACK-SAFE', 'APPROVAL-MIG-ROLLBACK-BLOCKED')
  ) THEN
    RAISE EXCEPTION 'failed approval migration left a partial business event';
  END IF;
END;
$$;
