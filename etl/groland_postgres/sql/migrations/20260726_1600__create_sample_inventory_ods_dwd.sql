CREATE SCHEMA IF NOT EXISTS ods;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS etl;

CREATE TABLE IF NOT EXISTS ods.sample_inventory_business_event_raw (
  source_event_id BIGINT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_user_id TEXT NOT NULL,
  import_batch_id BIGINT,
  source_created_at TIMESTAMPTZ NOT NULL,
  etl_loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_sample_inventory_business_event_raw_type_id
  ON ods.sample_inventory_business_event_raw (event_type, source_event_id);

CREATE TABLE IF NOT EXISTS ods.sample_inventory_sample_snapshot_raw (
  sample_id BIGINT PRIMARY KEY,
  source_event_id BIGINT NOT NULL,
  sample_code TEXT NOT NULL,
  sample_name TEXT NOT NULL,
  model TEXT,
  category TEXT,
  location TEXT,
  remark TEXT,
  on_hand_quantity INTEGER NOT NULL,
  reserved_quantity INTEGER NOT NULL,
  available_quantity INTEGER NOT NULL,
  source_version BIGINT NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ,
  snapshot_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (on_hand_quantity >= 0),
  CHECK (reserved_quantity >= 0),
  CHECK (reserved_quantity <= on_hand_quantity),
  CHECK (available_quantity = on_hand_quantity - reserved_quantity)
);

CREATE TABLE IF NOT EXISTS dwd.sample_inventory_inventory_movement_di (
  source_event_id BIGINT PRIMARY KEY
    REFERENCES ods.sample_inventory_business_event_raw(source_event_id),
  movement_id BIGINT NOT NULL UNIQUE,
  sample_id BIGINT NOT NULL,
  sample_code TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  on_hand_delta INTEGER NOT NULL,
  reserved_delta INTEGER NOT NULL,
  resulting_on_hand_quantity INTEGER NOT NULL,
  resulting_reserved_quantity INTEGER NOT NULL,
  resulting_available_quantity INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  event_date DATE GENERATED ALWAYS AS
    ((occurred_at AT TIME ZONE 'Asia/Shanghai')::DATE) STORED,
  actor_user_id TEXT NOT NULL,
  import_batch_id BIGINT,
  etl_loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    on_hand_delta <> 0
    OR reserved_delta <> 0
    OR movement_type = 'legacy_cutover_opening'
  ),
  CHECK (resulting_reserved_quantity <= resulting_on_hand_quantity),
  CHECK (
    resulting_available_quantity =
      resulting_on_hand_quantity - resulting_reserved_quantity
  )
);

CREATE INDEX IF NOT EXISTS idx_sample_inventory_movement_di_sample_date
  ON dwd.sample_inventory_inventory_movement_di
  (sample_id, event_date DESC, source_event_id DESC);

CREATE INDEX IF NOT EXISTS idx_sample_inventory_movement_di_type_date
  ON dwd.sample_inventory_inventory_movement_di
  (movement_type, event_date DESC, source_event_id DESC);

CREATE TABLE IF NOT EXISTS dwd.sample_inventory_outbound_request_event_di (
  source_event_id BIGINT PRIMARY KEY
    REFERENCES ods.sample_inventory_business_event_raw(source_event_id),
  request_id BIGINT NOT NULL,
  sample_id BIGINT NOT NULL,
  sample_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  department TEXT NOT NULL,
  applicant TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  sampled_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  time_quality TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  event_date DATE GENERATED ALWAYS AS
    ((occurred_at AT TIME ZONE 'Asia/Shanghai')::DATE) STORED,
  actor_user_id TEXT NOT NULL,
  import_batch_id BIGINT,
  etl_loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sample_inventory_outbound_event_di_request
  ON dwd.sample_inventory_outbound_request_event_di
  (request_id, source_event_id DESC);

CREATE INDEX IF NOT EXISTS idx_sample_inventory_outbound_event_di_department_date
  ON dwd.sample_inventory_outbound_request_event_di
  (department, event_date DESC, source_event_id DESC);

CREATE TABLE IF NOT EXISTS dwd.sample_inventory_sample_snapshot_di (
  sample_id BIGINT PRIMARY KEY,
  source_event_id BIGINT NOT NULL,
  sample_code TEXT NOT NULL,
  sample_name TEXT NOT NULL,
  model TEXT,
  category TEXT,
  location TEXT,
  on_hand_quantity INTEGER NOT NULL,
  reserved_quantity INTEGER NOT NULL,
  available_quantity INTEGER NOT NULL,
  is_low_stock BOOLEAN NOT NULL,
  source_version BIGINT NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ,
  snapshot_observed_at TIMESTAMPTZ NOT NULL,
  etl_loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reserved_quantity <= on_hand_quantity),
  CHECK (available_quantity = on_hand_quantity - reserved_quantity)
);

CREATE INDEX IF NOT EXISTS idx_sample_inventory_snapshot_di_active_stock
  ON dwd.sample_inventory_sample_snapshot_di
  (is_low_stock DESC, available_quantity, sample_code)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS etl.sample_inventory_warehouse_refresh_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_source_event_id BIGINT NOT NULL DEFAULT 0 CHECK (last_source_event_id >= 0),
  last_refresh_at TIMESTAMPTZ,
  last_refresh_event_count INTEGER NOT NULL DEFAULT 0
    CHECK (last_refresh_event_count >= 0),
  last_full_rebuild_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO etl.sample_inventory_warehouse_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

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
    DELETE FROM dwd.sample_inventory_inventory_movement_di;
    DELETE FROM dwd.sample_inventory_outbound_request_event_di;
    DELETE FROM dwd.sample_inventory_sample_snapshot_di;
    DELETE FROM ods.sample_inventory_business_event_raw;
    DELETE FROM ods.sample_inventory_sample_snapshot_raw;
    v_last_source_event_id := 0;
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

  IF v_batch_max_event_id IS NULL THEN
    UPDATE etl.sample_inventory_warehouse_refresh_state
    SET
      last_refresh_at = NOW(),
      last_refresh_event_count = 0,
      last_full_rebuild_at = CASE
        WHEN p_full_rebuild THEN NOW()
        ELSE last_full_rebuild_at
      END,
      updated_at = NOW()
    WHERE id = 1;
    RETURN 0;
  END IF;

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
    AND event.event_type LIKE 'outbound.%'
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
    snapshot.available_quantity <= COALESCE(v_low_stock_threshold, 10),
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

COMMENT ON TABLE ods.sample_inventory_business_event_raw IS '样品库存事务 outbox 的原样事件 ODS，source_event_id 幂等。';
COMMENT ON TABLE ods.sample_inventory_sample_snapshot_raw IS '样品库存当前快照 ODS，不替代事务层权威余额。';
COMMENT ON TABLE dwd.sample_inventory_inventory_movement_di IS '样品库存标准化变动事实；legacy opening 可与切换后运营流水区分。';
COMMENT ON TABLE dwd.sample_inventory_outbound_request_event_di IS '出库申请状态事件明细，未知 legacy 审批/取样时间保持 NULL。';
COMMENT ON TABLE dwd.sample_inventory_sample_snapshot_di IS '样品库存标准化当前快照；一期不承担 DWS/ADS 经营分析口径。';
COMMENT ON FUNCTION etl.refresh_sample_inventory_warehouse(INTEGER, BOOLEAN) IS '按 business event ID 水位幂等刷新样品库存 ODS/DWD；失败事务不推进水位。';
