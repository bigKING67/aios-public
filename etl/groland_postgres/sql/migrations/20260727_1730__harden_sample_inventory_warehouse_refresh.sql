ALTER TABLE dwd.sample_inventory_outbound_request_event_di
  ADD COLUMN IF NOT EXISTS request_date DATE GENERATED ALWAYS AS
    ((requested_at AT TIME ZONE 'Asia/Shanghai')::DATE) STORED,
  ADD COLUMN IF NOT EXISTS process_time_known BOOLEAN GENERATED ALWAYS AS
    (time_quality = 'known') STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'dwd.sample_inventory_outbound_request_event_di'::REGCLASS
      AND conname = 'chk_sample_inventory_outbound_event_time_quality'
  ) THEN
    ALTER TABLE dwd.sample_inventory_outbound_request_event_di
      ADD CONSTRAINT chk_sample_inventory_outbound_event_time_quality
      CHECK (time_quality IN ('known', 'legacy_request_only'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_sample_inventory_outbound_event_di_department_request_date
  ON dwd.sample_inventory_outbound_request_event_di
  (department, request_date DESC, source_event_id DESC);

CREATE OR REPLACE FUNCTION etl.refresh_sample_inventory_warehouse(
  p_limit INTEGER DEFAULT 5000,
  p_full_rebuild BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_source_event_id BIGINT;
  v_batch_max_event_id BIGINT;
  v_event_count INTEGER;
  v_source_event_count BIGINT;
  v_low_stock_threshold INTEGER;
BEGIN
  IF p_limit < 1 OR p_limit > 50000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 50000';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('sample-inventory-warehouse-refresh-v1', 0)
  );

  INSERT INTO etl.sample_inventory_warehouse_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_event_id
  INTO v_last_source_event_id
  FROM etl.sample_inventory_warehouse_refresh_state
  WHERE id = 1
  FOR UPDATE;

  IF p_full_rebuild THEN
    SELECT COUNT(*)
    INTO v_source_event_count
    FROM sample_inventory.business_events;

    IF v_source_event_count > p_limit THEN
      RAISE EXCEPTION 'full rebuild source event count exceeds p_limit';
    END IF;

    DELETE FROM dwd.sample_inventory_inventory_movement_di;
    DELETE FROM dwd.sample_inventory_outbound_request_event_di;
    DELETE FROM dwd.sample_inventory_sample_snapshot_di;
    DELETE FROM ods.sample_inventory_business_event_raw;
    DELETE FROM ods.sample_inventory_sample_snapshot_raw;
    v_last_source_event_id := 0;
    UPDATE etl.sample_inventory_warehouse_refresh_state
    SET
      last_source_event_id = 0,
      last_refresh_event_count = 0,
      updated_at = NOW()
    WHERE id = 1;
  END IF;

  SELECT MAX(event_batch.id), COUNT(*)::INTEGER
  INTO v_batch_max_event_id, v_event_count
  FROM (
    SELECT id
    FROM sample_inventory.business_events
    WHERE id > v_last_source_event_id
    ORDER BY id
    LIMIT p_limit
  ) AS event_batch;

  IF v_batch_max_event_id IS NULL AND NOT p_full_rebuild THEN
    UPDATE etl.sample_inventory_warehouse_refresh_state
    SET
      last_refresh_at = NOW(),
      last_refresh_event_count = 0,
      updated_at = NOW()
    WHERE id = 1;
    RETURN 0;
  END IF;

  v_batch_max_event_id := COALESCE(v_batch_max_event_id, 0);
  v_event_count := COALESCE(v_event_count, 0);

  INSERT INTO ods.sample_inventory_business_event_raw (
    source_event_id,
    aggregate_type,
    aggregate_id,
    event_type,
    payload,
    occurred_at,
    actor_user_id,
    import_batch_id,
    source_created_at
  )
  SELECT
    event.id,
    event.aggregate_type,
    event.aggregate_id,
    event.event_type,
    event.payload,
    event.occurred_at,
    event.actor_user_id,
    event.import_batch_id,
    event.created_at
  FROM sample_inventory.business_events AS event
  WHERE event.id > v_last_source_event_id
    AND event.id <= v_batch_max_event_id
  ORDER BY event.id
  ON CONFLICT (source_event_id) DO NOTHING;

  INSERT INTO dwd.sample_inventory_inventory_movement_di (
    source_event_id,
    movement_id,
    sample_id,
    sample_code,
    movement_type,
    on_hand_delta,
    reserved_delta,
    resulting_on_hand_quantity,
    resulting_reserved_quantity,
    resulting_available_quantity,
    source_type,
    source_id,
    occurred_at,
    actor_user_id,
    import_batch_id
  )
  SELECT
    event.source_event_id,
    (event.payload ->> 'movementId')::BIGINT,
    (event.payload ->> 'sampleId')::BIGINT,
    event.payload ->> 'sampleCode',
    event.payload ->> 'movementType',
    (event.payload ->> 'onHandDelta')::INTEGER,
    (event.payload ->> 'reservedDelta')::INTEGER,
    (event.payload ->> 'resultingOnHandQuantity')::INTEGER,
    (event.payload ->> 'resultingReservedQuantity')::INTEGER,
    (event.payload ->> 'resultingAvailableQuantity')::INTEGER,
    event.payload ->> 'sourceType',
    event.payload ->> 'sourceId',
    event.occurred_at,
    event.actor_user_id,
    event.import_batch_id
  FROM ods.sample_inventory_business_event_raw AS event
  WHERE event.source_event_id > v_last_source_event_id
    AND event.source_event_id <= v_batch_max_event_id
    AND event.event_type = 'inventory.movement.recorded'
  ON CONFLICT (source_event_id) DO NOTHING;

  INSERT INTO dwd.sample_inventory_outbound_request_event_di (
    source_event_id,
    request_id,
    sample_id,
    sample_code,
    event_type,
    from_status,
    to_status,
    quantity,
    department,
    applicant,
    requested_at,
    approved_at,
    sampled_at,
    rejected_at,
    time_quality,
    occurred_at,
    actor_user_id,
    import_batch_id
  )
  SELECT
    event.source_event_id,
    (event.payload ->> 'requestId')::BIGINT,
    (event.payload ->> 'sampleId')::BIGINT,
    event.payload ->> 'sampleCode',
    event.event_type,
    NULLIF(event.payload ->> 'fromStatus', ''),
    event.payload ->> 'toStatus',
    (event.payload ->> 'quantity')::INTEGER,
    event.payload ->> 'department',
    event.payload ->> 'applicant',
    (event.payload ->> 'requestedAt')::TIMESTAMPTZ,
    NULLIF(event.payload ->> 'approvedAt', '')::TIMESTAMPTZ,
    NULLIF(event.payload ->> 'sampledAt', '')::TIMESTAMPTZ,
    NULLIF(event.payload ->> 'rejectedAt', '')::TIMESTAMPTZ,
    event.payload ->> 'timeQuality',
    event.occurred_at,
    event.actor_user_id,
    event.import_batch_id
  FROM ods.sample_inventory_business_event_raw AS event
  WHERE event.source_event_id > v_last_source_event_id
    AND event.source_event_id <= v_batch_max_event_id
    AND event.event_type IN (
      'outbound.created',
      'outbound.updated',
      'outbound.transitioned',
      'outbound.legacy_imported',
      'outbound.legacy_catch_up_imported'
    )
    AND event.payload ?& ARRAY[
      'requestId',
      'sampleId',
      'sampleCode',
      'toStatus',
      'quantity',
      'department',
      'applicant',
      'requestedAt',
      'timeQuality'
    ]
  ON CONFLICT (source_event_id) DO NOTHING;

  INSERT INTO ods.sample_inventory_sample_snapshot_raw (
    sample_id,
    source_event_id,
    sample_code,
    sample_name,
    model,
    category,
    location,
    remark,
    on_hand_quantity,
    reserved_quantity,
    available_quantity,
    source_version,
    source_updated_at,
    archived_at,
    snapshot_observed_at
  )
  SELECT
    sample.id,
    v_batch_max_event_id,
    sample.sample_code,
    sample.sample_name,
    sample.model,
    sample.category,
    sample.location,
    sample.remark,
    sample.on_hand_quantity,
    sample.reserved_quantity,
    sample.available_quantity,
    sample.version,
    sample.updated_at,
    sample.archived_at,
    NOW()
  FROM sample_inventory.samples AS sample
  ON CONFLICT (sample_id) DO UPDATE
  SET
    source_event_id = EXCLUDED.source_event_id,
    sample_code = EXCLUDED.sample_code,
    sample_name = EXCLUDED.sample_name,
    model = EXCLUDED.model,
    category = EXCLUDED.category,
    location = EXCLUDED.location,
    remark = EXCLUDED.remark,
    on_hand_quantity = EXCLUDED.on_hand_quantity,
    reserved_quantity = EXCLUDED.reserved_quantity,
    available_quantity = EXCLUDED.available_quantity,
    source_version = EXCLUDED.source_version,
    source_updated_at = EXCLUDED.source_updated_at,
    archived_at = EXCLUDED.archived_at,
    snapshot_observed_at = EXCLUDED.snapshot_observed_at;

  SELECT low_stock_threshold
  INTO v_low_stock_threshold
  FROM sample_inventory.settings
  WHERE id = 1;

  INSERT INTO dwd.sample_inventory_sample_snapshot_di (
    sample_id,
    source_event_id,
    sample_code,
    sample_name,
    model,
    category,
    location,
    on_hand_quantity,
    reserved_quantity,
    available_quantity,
    is_low_stock,
    source_version,
    source_updated_at,
    archived_at,
    snapshot_observed_at,
    etl_loaded_at
  )
  SELECT
    snapshot.sample_id,
    snapshot.source_event_id,
    snapshot.sample_code,
    snapshot.sample_name,
    snapshot.model,
    snapshot.category,
    snapshot.location,
    snapshot.on_hand_quantity,
    snapshot.reserved_quantity,
    snapshot.available_quantity,
    snapshot.available_quantity > 0
      AND snapshot.available_quantity <= COALESCE(v_low_stock_threshold, 3),
    snapshot.source_version,
    snapshot.source_updated_at,
    snapshot.archived_at,
    snapshot.snapshot_observed_at,
    NOW()
  FROM ods.sample_inventory_sample_snapshot_raw AS snapshot
  ON CONFLICT (sample_id) DO UPDATE
  SET
    source_event_id = EXCLUDED.source_event_id,
    sample_code = EXCLUDED.sample_code,
    sample_name = EXCLUDED.sample_name,
    model = EXCLUDED.model,
    category = EXCLUDED.category,
    location = EXCLUDED.location,
    on_hand_quantity = EXCLUDED.on_hand_quantity,
    reserved_quantity = EXCLUDED.reserved_quantity,
    available_quantity = EXCLUDED.available_quantity,
    is_low_stock = EXCLUDED.is_low_stock,
    source_version = EXCLUDED.source_version,
    source_updated_at = EXCLUDED.source_updated_at,
    archived_at = EXCLUDED.archived_at,
    snapshot_observed_at = EXCLUDED.snapshot_observed_at,
    etl_loaded_at = EXCLUDED.etl_loaded_at;

  UPDATE etl.sample_inventory_warehouse_refresh_state
  SET
    last_source_event_id = v_batch_max_event_id,
    last_refresh_at = NOW(),
    last_refresh_event_count = v_event_count,
    last_full_rebuild_at = CASE
      WHEN p_full_rebuild THEN NOW()
      ELSE last_full_rebuild_at
    END,
    updated_at = NOW()
  WHERE id = 1;

  RETURN v_event_count;
END;
$$;

COMMENT ON COLUMN dwd.sample_inventory_outbound_request_event_di.request_date IS
  '源申请时间按 Asia/Shanghai 归属的业务日期；与事件入仓日期分开。';
COMMENT ON COLUMN dwd.sample_inventory_outbound_request_event_di.process_time_known IS
  '仅 known 事件具有可信审批/取样时点；legacy_request_only 不臆造流程时间。';
COMMENT ON FUNCTION etl.refresh_sample_inventory_warehouse(INTEGER, BOOLEAN) IS
  '按 business event ID 水位幂等刷新样品库存 ODS/DWD；全量重建有界，零库存不标记低库存。';
