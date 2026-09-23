ALTER TABLE sample_inventory.settings
  ALTER COLUMN low_stock_threshold SET DEFAULT 3;

UPDATE sample_inventory.settings
SET
  low_stock_threshold = 3,
  version = version + 1,
  updated_by = 'system'
WHERE id = 1
  AND low_stock_threshold = 10
  AND version = 1
  AND created_by = 'system'
  AND updated_by = 'system';

CREATE TABLE sample_inventory.mutation_requests (
  id BIGSERIAL PRIMARY KEY,
  operation TEXT NOT NULL CHECK (btrim(operation) <> ''),
  submission_key TEXT NOT NULL
    CHECK (btrim(submission_key) <> '' AND char_length(submission_key) <= 128),
  request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  actor_user_id TEXT NOT NULL CHECK (btrim(actor_user_id) <> ''),
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_sample_inventory_mutation_operation_key
    UNIQUE (operation, submission_key),
  CONSTRAINT chk_sample_inventory_mutation_completion
    CHECK ((response_payload IS NULL) = (completed_at IS NULL))
);

CREATE INDEX idx_sample_inventory_mutation_actor_created
  ON sample_inventory.mutation_requests (actor_user_id, created_at DESC);

COMMENT ON TABLE sample_inventory.mutation_requests IS
  '样品库存写请求幂等台账；业务写入、事件、流水和响应必须在同一事务提交。';
