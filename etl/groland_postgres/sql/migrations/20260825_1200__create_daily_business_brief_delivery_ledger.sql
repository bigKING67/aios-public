-- Durable delivery state for the DataHub-owned Feishu daily business brief.

CREATE SCHEMA IF NOT EXISTS dataops;

CREATE TABLE IF NOT EXISTS dataops.daily_business_brief_deliveries (
  id BIGSERIAL PRIMARY KEY,
  brief_date DATE NOT NULL,
  delivery_channel VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  card_sha256 CHAR(64) NOT NULL,
  flow_run_id VARCHAR(80),
  flow_run_name VARCHAR(255),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_code VARCHAR(80),
  error_detail VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_daily_business_brief_delivery_channel
    CHECK (delivery_channel IN ('test', 'production')),
  CONSTRAINT chk_daily_business_brief_delivery_status
    CHECK (status IN ('sending', 'sent', 'failed', 'uncertain')),
  CONSTRAINT chk_daily_business_brief_card_sha256
    CHECK (card_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_daily_business_brief_attempt_count
    CHECK (attempt_count >= 1),
  CONSTRAINT chk_daily_business_brief_completion_state
    CHECK (
      (status = 'sending' AND completed_at IS NULL)
      OR (status <> 'sending' AND completed_at IS NOT NULL)
    )
);

COMMENT ON TABLE dataops.daily_business_brief_deliveries
  IS 'Feishu daily business brief delivery ledger with at-most-once production-date protection.';
COMMENT ON COLUMN dataops.daily_business_brief_deliveries.brief_date
  IS 'Asia/Shanghai business date represented by the brief.';
COMMENT ON COLUMN dataops.daily_business_brief_deliveries.delivery_channel
  IS 'Delivery channel: repeatable test or date-unique production.';
COMMENT ON COLUMN dataops.daily_business_brief_deliveries.status
  IS 'Delivery state. uncertain blocks automatic retries until manual reconciliation.';
COMMENT ON COLUMN dataops.daily_business_brief_deliveries.card_sha256
  IS 'SHA-256 of the canonical Feishu card JSON for reconciliation.';
COMMENT ON COLUMN dataops.daily_business_brief_deliveries.flow_run_id
  IS 'Prefect flow-run UUID when available.';
COMMENT ON COLUMN dataops.daily_business_brief_deliveries.flow_run_name
  IS 'Prefect flow-run name when available.';
COMMENT ON COLUMN dataops.daily_business_brief_deliveries.attempt_count
  IS 'Definite delivery attempts for this ledger row.';
COMMENT ON COLUMN dataops.daily_business_brief_deliveries.error_detail
  IS 'Bounded sanitized delivery error. Credentials and webhook URLs are forbidden.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_business_brief_production_date
  ON dataops.daily_business_brief_deliveries (brief_date)
  WHERE delivery_channel = 'production';

COMMENT ON INDEX dataops.uq_daily_business_brief_production_date
  IS 'Admits one production ledger row per business date; failed rows are retried in place.';

CREATE INDEX IF NOT EXISTS idx_daily_business_brief_deliveries_recent
  ON dataops.daily_business_brief_deliveries (brief_date DESC, created_at DESC);

COMMENT ON INDEX dataops.idx_daily_business_brief_deliveries_recent
  IS 'Supports recent delivery history and reconciliation queries.';
