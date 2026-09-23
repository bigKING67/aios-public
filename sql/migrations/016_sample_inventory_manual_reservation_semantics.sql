DO $$
DECLARE
  legacy_sample RECORD;
  movement_id BIGINT;
  migrated_at TIMESTAMPTZ;
BEGIN
  FOR legacy_sample IN
    SELECT id, sample_code, on_hand_quantity, reserved_quantity
    FROM sample_inventory.samples
    WHERE reserved_quantity <> 0
    ORDER BY id
    FOR UPDATE
  LOOP
    migrated_at := clock_timestamp();

    UPDATE sample_inventory.samples
    SET
      reserved_quantity = 0,
      version = version + 1,
      updated_by = 'system:manual-reservation-migration'
    WHERE id = legacy_sample.id;

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
      legacy_sample.id,
      'legacy_reservation_cleared',
      0,
      -legacy_sample.reserved_quantity,
      legacy_sample.on_hand_quantity,
      0,
      'migration',
      '016_sample_inventory_manual_reservation_semantics',
      migrated_at,
      'system:manual-reservation-migration',
      jsonb_build_object(
        'reason', 'replace_automatic_reservation_with_manual_semantics',
        'previousReservedQuantity', legacy_sample.reserved_quantity
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
      legacy_sample.id::TEXT,
      'inventory.movement.recorded',
      jsonb_build_object(
        'movementId', movement_id,
        'sampleId', legacy_sample.id,
        'sampleCode', legacy_sample.sample_code,
        'movementType', 'legacy_reservation_cleared',
        'onHandDelta', 0,
        'reservedDelta', -legacy_sample.reserved_quantity,
        'resultingOnHandQuantity', legacy_sample.on_hand_quantity,
        'resultingReservedQuantity', 0,
        'resultingAvailableQuantity', legacy_sample.on_hand_quantity,
        'sourceType', 'migration',
        'sourceId', '016_sample_inventory_manual_reservation_semantics'
      ),
      migrated_at,
      'system:manual-reservation-migration'
    );
  END LOOP;
END;
$$;

COMMENT ON COLUMN sample_inventory.samples.reserved_quantity IS
  '用户手工维护的预留数量；审批状态不得自动修改。';

COMMENT ON COLUMN sample_inventory.samples.available_quantity IS
  '可用库存，由在手库存减用户手工预留数量生成。';
