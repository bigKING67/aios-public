BEGIN;

DO $$
DECLARE
  v_zero_sample_id BIGINT;
  v_low_sample_id BIGINT;
  v_normal_sample_id BIGINT;
  v_movement_id BIGINT;
  v_source_event_count INTEGER;
  v_refresh_count INTEGER;
  v_watermark BIGINT;
  v_ods_count BIGINT;
  v_movement_count BIGINT;
  v_outbound_count BIGINT;
  v_snapshot_count BIGINT;
BEGIN
  UPDATE sample_inventory.settings
  SET low_stock_threshold = 3, version = version + 1, updated_by = 'warehouse-fixture'
  WHERE id = 1;

  INSERT INTO sample_inventory.samples (
    sample_code,
    sample_name,
    on_hand_quantity,
    reserved_quantity,
    created_by,
    updated_by
  )
  VALUES ('WH-ZERO', 'Warehouse zero fixture', 0, 0, 'warehouse-fixture', 'warehouse-fixture')
  RETURNING id INTO v_zero_sample_id;

  INSERT INTO sample_inventory.samples (
    sample_code,
    sample_name,
    on_hand_quantity,
    reserved_quantity,
    created_by,
    updated_by
  )
  VALUES ('WH-LOW', 'Warehouse low fixture', 2, 0, 'warehouse-fixture', 'warehouse-fixture')
  RETURNING id INTO v_low_sample_id;

  INSERT INTO sample_inventory.samples (
    sample_code,
    sample_name,
    on_hand_quantity,
    reserved_quantity,
    created_by,
    updated_by
  )
  VALUES ('WH-NORMAL', 'Warehouse normal fixture', 5, 0, 'warehouse-fixture', 'warehouse-fixture')
  RETURNING id INTO v_normal_sample_id;

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
    actor_user_id
  )
  VALUES (
    v_zero_sample_id,
    'legacy_cutover_opening',
    0,
    0,
    0,
    0,
    'warehouse-fixture',
    'zero',
    '2026-07-27T08:00:00+08:00',
    'warehouse-fixture'
  )
  RETURNING id INTO v_movement_id;
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
    v_zero_sample_id::TEXT,
    'inventory.movement.recorded',
    jsonb_build_object(
      'movementId', v_movement_id,
      'sampleId', v_zero_sample_id,
      'sampleCode', 'WH-ZERO',
      'movementType', 'legacy_cutover_opening',
      'onHandDelta', 0,
      'reservedDelta', 0,
      'resultingOnHandQuantity', 0,
      'resultingReservedQuantity', 0,
      'resultingAvailableQuantity', 0,
      'sourceType', 'warehouse-fixture',
      'sourceId', 'zero'
    ),
    '2026-07-27T08:00:00+08:00',
    'warehouse-fixture'
  );

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
    actor_user_id
  )
  VALUES (
    v_low_sample_id,
    'legacy_cutover_opening',
    2,
    0,
    2,
    0,
    'warehouse-fixture',
    'low',
    '2026-07-27T08:01:00+08:00',
    'warehouse-fixture'
  )
  RETURNING id INTO v_movement_id;
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
    v_low_sample_id::TEXT,
    'inventory.movement.recorded',
    jsonb_build_object(
      'movementId', v_movement_id,
      'sampleId', v_low_sample_id,
      'sampleCode', 'WH-LOW',
      'movementType', 'legacy_cutover_opening',
      'onHandDelta', 2,
      'reservedDelta', 0,
      'resultingOnHandQuantity', 2,
      'resultingReservedQuantity', 0,
      'resultingAvailableQuantity', 2,
      'sourceType', 'warehouse-fixture',
      'sourceId', 'low'
    ),
    '2026-07-27T08:01:00+08:00',
    'warehouse-fixture'
  );

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
    actor_user_id
  )
  VALUES (
    v_normal_sample_id,
    'legacy_cutover_opening',
    5,
    0,
    5,
    0,
    'warehouse-fixture',
    'normal',
    '2026-07-27T08:02:00+08:00',
    'warehouse-fixture'
  )
  RETURNING id INTO v_movement_id;
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
    v_normal_sample_id::TEXT,
    'inventory.movement.recorded',
    jsonb_build_object(
      'movementId', v_movement_id,
      'sampleId', v_normal_sample_id,
      'sampleCode', 'WH-NORMAL',
      'movementType', 'legacy_cutover_opening',
      'onHandDelta', 5,
      'reservedDelta', 0,
      'resultingOnHandQuantity', 5,
      'resultingReservedQuantity', 0,
      'resultingAvailableQuantity', 5,
      'sourceType', 'warehouse-fixture',
      'sourceId', 'normal'
    ),
    '2026-07-27T08:02:00+08:00',
    'warehouse-fixture'
  );

  INSERT INTO sample_inventory.business_events (
    aggregate_type,
    aggregate_id,
    event_type,
    payload,
    occurred_at,
    actor_user_id
  )
  VALUES (
    'outbound_request',
    '9001',
    'outbound.legacy_imported',
    jsonb_build_object(
      'requestId', 9001,
      'sampleId', v_low_sample_id,
      'sampleCode', 'WH-LOW',
      'fromStatus', NULL,
      'toStatus', 'sampled',
      'quantity', 1,
      'department', 'Fixture department',
      'applicant', 'Fixture applicant',
      'requestedAt', '2026-07-20T10:00:00+08:00',
      'approvedAt', NULL,
      'sampledAt', NULL,
      'rejectedAt', NULL,
      'timeQuality', 'legacy_request_only'
    ),
    '2026-07-27T08:03:00+08:00',
    'warehouse-fixture'
  );

  INSERT INTO sample_inventory.business_events (
    aggregate_type,
    aggregate_id,
    event_type,
    payload,
    occurred_at,
    actor_user_id
  )
  VALUES (
    'outbound_request',
    '9001',
    'outbound.tracking_updated',
    jsonb_build_object(
      'requestId', 9001,
      'sampleId', v_low_sample_id,
      'trackingNumber', 'FIXTURE-TRACKING'
    ),
    '2026-07-27T08:04:00+08:00',
    'warehouse-fixture'
  );

  SELECT COUNT(*)::INTEGER
  INTO v_source_event_count
  FROM sample_inventory.business_events;

  SELECT etl.refresh_sample_inventory_warehouse(100, TRUE)
  INTO v_refresh_count;
  IF v_refresh_count <> v_source_event_count THEN
    RAISE EXCEPTION 'full rebuild did not consume the complete bounded source stream';
  END IF;

  IF (
    SELECT is_low_stock
    FROM dwd.sample_inventory_sample_snapshot_di
    WHERE sample_id = v_zero_sample_id
  ) THEN
    RAISE EXCEPTION 'zero inventory must not be marked low stock';
  END IF;
  IF NOT (
    SELECT is_low_stock
    FROM dwd.sample_inventory_sample_snapshot_di
    WHERE sample_id = v_low_sample_id
  ) THEN
    RAISE EXCEPTION 'positive inventory at the threshold must be marked low stock';
  END IF;
  IF (
    SELECT is_low_stock
    FROM dwd.sample_inventory_sample_snapshot_di
    WHERE sample_id = v_normal_sample_id
  ) THEN
    RAISE EXCEPTION 'inventory above the threshold must not be marked low stock';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM dwd.sample_inventory_outbound_request_event_di
    WHERE request_id = 9001
      AND request_date = DATE '2026-07-20'
      AND time_quality = 'legacy_request_only'
      AND NOT process_time_known
      AND approved_at IS NULL
      AND sampled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy outbound request date and process-time quality were not preserved';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM dwd.sample_inventory_outbound_request_event_di
    WHERE event_type = 'outbound.tracking_updated'
  ) THEN
    RAISE EXCEPTION 'partial tracking events must not enter the conformed outbound event table';
  END IF;

  SELECT last_source_event_id
  INTO v_watermark
  FROM etl.sample_inventory_warehouse_refresh_state
  WHERE id = 1;
  IF v_watermark <> (SELECT MAX(id) FROM sample_inventory.business_events) THEN
    RAISE EXCEPTION 'full rebuild watermark does not match the source event maximum';
  END IF;

  SELECT
    (SELECT COUNT(*) FROM ods.sample_inventory_business_event_raw),
    (SELECT COUNT(*) FROM dwd.sample_inventory_inventory_movement_di),
    (SELECT COUNT(*) FROM dwd.sample_inventory_outbound_request_event_di),
    (SELECT COUNT(*) FROM dwd.sample_inventory_sample_snapshot_di)
  INTO v_ods_count, v_movement_count, v_outbound_count, v_snapshot_count;

  SELECT etl.refresh_sample_inventory_warehouse(100, FALSE)
  INTO v_refresh_count;
  IF v_refresh_count <> 0 THEN
    RAISE EXCEPTION 'empty incremental refresh must return zero';
  END IF;
  IF (
    SELECT ROW(
      (SELECT COUNT(*) FROM ods.sample_inventory_business_event_raw),
      (SELECT COUNT(*) FROM dwd.sample_inventory_inventory_movement_di),
      (SELECT COUNT(*) FROM dwd.sample_inventory_outbound_request_event_di),
      (SELECT COUNT(*) FROM dwd.sample_inventory_sample_snapshot_di)
    ) <> ROW(v_ods_count, v_movement_count, v_outbound_count, v_snapshot_count)
  ) THEN
    RAISE EXCEPTION 'empty incremental refresh changed warehouse row cardinality';
  END IF;

  SELECT etl.refresh_sample_inventory_warehouse(100, TRUE)
  INTO v_refresh_count;
  IF v_refresh_count <> v_source_event_count THEN
    RAISE EXCEPTION 'repeat full rebuild did not consume the complete source stream';
  END IF;
  IF (
    SELECT ROW(
      (SELECT COUNT(*) FROM ods.sample_inventory_business_event_raw),
      (SELECT COUNT(*) FROM dwd.sample_inventory_inventory_movement_di),
      (SELECT COUNT(*) FROM dwd.sample_inventory_outbound_request_event_di),
      (SELECT COUNT(*) FROM dwd.sample_inventory_sample_snapshot_di)
    ) <> ROW(v_ods_count, v_movement_count, v_outbound_count, v_snapshot_count)
  ) THEN
    RAISE EXCEPTION 'repeat full rebuild changed warehouse row cardinality';
  END IF;
END;
$$;

ROLLBACK;
