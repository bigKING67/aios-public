CREATE SCHEMA IF NOT EXISTS sample_inventory;

CREATE TABLE sample_inventory.settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  low_stock_threshold INTEGER NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  refresh_interval_seconds INTEGER NOT NULL DEFAULT 15
    CHECK (refresh_interval_seconds BETWEEN 0 AND 3600),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sample_inventory.settings (id, created_by, updated_by)
VALUES (1, 'system', 'system')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE sample_inventory.import_batches (
  id BIGSERIAL PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (btrim(source_kind) <> ''),
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_file_name TEXT NOT NULL CHECK (btrim(source_file_name) <> ''),
  source_git_sha TEXT NOT NULL CHECK (btrim(source_git_sha) <> ''),
  cutover_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  imported_counts JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(imported_counts) = 'object'),
  imported_by TEXT NOT NULL CHECK (btrim(imported_by) <> ''),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (source_kind, source_sha256)
);

CREATE TABLE sample_inventory.samples (
  id BIGSERIAL PRIMARY KEY,
  sample_code TEXT NOT NULL CHECK (btrim(sample_code) <> ''),
  sample_name TEXT NOT NULL CHECK (btrim(sample_name) <> ''),
  model TEXT,
  category TEXT,
  location TEXT,
  remark TEXT,
  on_hand_quantity INTEGER NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  available_quantity INTEGER GENERATED ALWAYS AS
    (on_hand_quantity - reserved_quantity) STORED,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  legacy_source TEXT,
  legacy_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  CONSTRAINT chk_sample_inventory_samples_reserved_lte_on_hand
    CHECK (reserved_quantity <= on_hand_quantity),
  CONSTRAINT chk_sample_inventory_samples_legacy_identity
    CHECK ((legacy_source IS NULL) = (legacy_id IS NULL))
);

CREATE UNIQUE INDEX uq_sample_inventory_samples_code_active
  ON sample_inventory.samples (sample_code)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX uq_sample_inventory_samples_legacy_identity
  ON sample_inventory.samples (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL;

CREATE INDEX idx_sample_inventory_samples_active_updated
  ON sample_inventory.samples (updated_at DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX idx_sample_inventory_samples_active_low_stock
  ON sample_inventory.samples (available_quantity, sample_code)
  WHERE archived_at IS NULL;

CREATE TABLE sample_inventory.inbound_records (
  id BIGSERIAL PRIMARY KEY,
  sample_id BIGINT NOT NULL REFERENCES sample_inventory.samples(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  tracking_number TEXT,
  remark TEXT,
  operator_name TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  time_quality TEXT NOT NULL DEFAULT 'known'
    CHECK (time_quality IN ('known', 'legacy_local_minute')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  source_kind TEXT,
  source_record_id TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  CONSTRAINT chk_sample_inventory_inbound_source_identity
    CHECK ((source_kind IS NULL) = (source_record_id IS NULL)),
  CONSTRAINT chk_sample_inventory_inbound_void_fields
    CHECK (
      (voided_at IS NULL AND voided_by IS NULL)
      OR (voided_at IS NOT NULL AND voided_by IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_sample_inventory_inbound_source_identity
  ON sample_inventory.inbound_records (source_kind, source_record_id)
  WHERE source_kind IS NOT NULL;

CREATE INDEX idx_sample_inventory_inbound_occurred
  ON sample_inventory.inbound_records (occurred_at DESC, id DESC);

CREATE INDEX idx_sample_inventory_inbound_sample
  ON sample_inventory.inbound_records (sample_id, occurred_at DESC);

CREATE TABLE sample_inventory.outbound_requests (
  id BIGSERIAL PRIMARY KEY,
  sample_id BIGINT NOT NULL REFERENCES sample_inventory.samples(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  applicant TEXT NOT NULL CHECK (btrim(applicant) <> ''),
  department TEXT NOT NULL CHECK (btrim(department) <> ''),
  purpose TEXT NOT NULL CHECK (btrim(purpose) <> ''),
  receiver TEXT,
  shipping_address TEXT,
  tracking_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'sampled', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  sampled_at TIMESTAMPTZ,
  sampled_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by TEXT,
  time_quality TEXT NOT NULL DEFAULT 'known'
    CHECK (time_quality IN ('known', 'legacy_request_only')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  source_kind TEXT,
  source_record_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  CONSTRAINT chk_sample_inventory_outbound_source_identity
    CHECK ((source_kind IS NULL) = (source_record_id IS NULL)),
  CONSTRAINT chk_sample_inventory_outbound_approved_actor
    CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  CONSTRAINT chk_sample_inventory_outbound_sampled_actor
    CHECK ((sampled_at IS NULL) = (sampled_by IS NULL)),
  CONSTRAINT chk_sample_inventory_outbound_rejected_actor
    CHECK ((rejected_at IS NULL) = (rejected_by IS NULL)),
  CONSTRAINT chk_sample_inventory_outbound_archive_actor
    CHECK ((archived_at IS NULL) = (archived_by IS NULL))
);

CREATE UNIQUE INDEX uq_sample_inventory_outbound_source_identity
  ON sample_inventory.outbound_requests (source_kind, source_record_id)
  WHERE source_kind IS NOT NULL;

CREATE INDEX idx_sample_inventory_outbound_active_status_requested
  ON sample_inventory.outbound_requests (status, requested_at DESC, id DESC)
  WHERE archived_at IS NULL;

CREATE INDEX idx_sample_inventory_outbound_active_sample
  ON sample_inventory.outbound_requests (sample_id, requested_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX idx_sample_inventory_outbound_active_department
  ON sample_inventory.outbound_requests (department, requested_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE sample_inventory.inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  sample_id BIGINT NOT NULL REFERENCES sample_inventory.samples(id),
  movement_type TEXT NOT NULL CHECK (btrim(movement_type) <> ''),
  on_hand_delta INTEGER NOT NULL,
  reserved_delta INTEGER NOT NULL,
  resulting_on_hand_quantity INTEGER NOT NULL CHECK (resulting_on_hand_quantity >= 0),
  resulting_reserved_quantity INTEGER NOT NULL CHECK (resulting_reserved_quantity >= 0),
  resulting_available_quantity INTEGER GENERATED ALWAYS AS
    (resulting_on_hand_quantity - resulting_reserved_quantity) STORED,
  source_type TEXT NOT NULL CHECK (btrim(source_type) <> ''),
  source_id TEXT NOT NULL CHECK (btrim(source_id) <> ''),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id TEXT NOT NULL,
  import_batch_id BIGINT REFERENCES sample_inventory.import_batches(id),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sample_inventory_movement_result
    CHECK (resulting_reserved_quantity <= resulting_on_hand_quantity),
  CONSTRAINT chk_sample_inventory_movement_nonzero
    CHECK (
      on_hand_delta <> 0
      OR reserved_delta <> 0
      OR movement_type = 'legacy_cutover_opening'
    )
);

CREATE INDEX idx_sample_inventory_movements_sample_time
  ON sample_inventory.inventory_movements (sample_id, occurred_at DESC, id DESC);

CREATE INDEX idx_sample_inventory_movements_type_time
  ON sample_inventory.inventory_movements (movement_type, occurred_at DESC, id DESC);

CREATE TABLE sample_inventory.business_events (
  id BIGSERIAL PRIMARY KEY,
  aggregate_type TEXT NOT NULL CHECK (btrim(aggregate_type) <> ''),
  aggregate_id TEXT NOT NULL CHECK (btrim(aggregate_id) <> ''),
  event_type TEXT NOT NULL CHECK (btrim(event_type) <> ''),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id TEXT NOT NULL,
  import_batch_id BIGINT REFERENCES sample_inventory.import_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sample_inventory_business_events_event_watermark
  ON sample_inventory.business_events (id, event_type);

CREATE INDEX idx_sample_inventory_business_events_aggregate
  ON sample_inventory.business_events (aggregate_type, aggregate_id, id DESC);

CREATE OR REPLACE FUNCTION sample_inventory.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sample_inventory_settings_updated_at
BEFORE UPDATE ON sample_inventory.settings
FOR EACH ROW EXECUTE FUNCTION sample_inventory.set_updated_at();

CREATE TRIGGER trg_sample_inventory_samples_updated_at
BEFORE UPDATE ON sample_inventory.samples
FOR EACH ROW EXECUTE FUNCTION sample_inventory.set_updated_at();

CREATE TRIGGER trg_sample_inventory_outbound_updated_at
BEFORE UPDATE ON sample_inventory.outbound_requests
FOR EACH ROW EXECUTE FUNCTION sample_inventory.set_updated_at();

CREATE OR REPLACE FUNCTION sample_inventory.reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_sample_inventory_movements_append_only
BEFORE UPDATE OR DELETE ON sample_inventory.inventory_movements
FOR EACH ROW EXECUTE FUNCTION sample_inventory.reject_append_only_mutation();

CREATE TRIGGER trg_sample_inventory_events_append_only
BEFORE UPDATE OR DELETE ON sample_inventory.business_events
FOR EACH ROW EXECUTE FUNCTION sample_inventory.reject_append_only_mutation();

COMMENT ON SCHEMA sample_inventory IS '样品库存事务域；库存写入、业务状态与不可变审计流水的权威来源。';
COMMENT ON TABLE sample_inventory.samples IS '样品主数据与切换后的实时库存余额。';
COMMENT ON COLUMN sample_inventory.samples.available_quantity IS '可用库存，始终由在手库存减预留库存生成。';
COMMENT ON TABLE sample_inventory.inventory_movements IS '不可变库存变动流水；冲正使用新的补偿记录。';
COMMENT ON TABLE sample_inventory.business_events IS '不可变业务事件 outbox，供 ODS/DWD 水位刷新消费。';
COMMENT ON TABLE sample_inventory.import_batches IS '一次性 legacy 导入批次与源文件 SHA-256 幂等台账。';
