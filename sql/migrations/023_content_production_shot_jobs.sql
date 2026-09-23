-- Additive, ledger-managed; no automatic API startup DDL.
CREATE TABLE ads.content_production_shot_jobs (
    job_id UUID PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id),
    raw_sha256 TEXT NOT NULL CHECK (raw_sha256 ~ '^[0-9a-f]{64}$'),
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','cancel_requested','cancelled','completed','failed')),
    stage TEXT NOT NULL DEFAULT '等待提取',
    claim_token UUID,
    heartbeat_at TIMESTAMPTZ,
    catalog_id UUID REFERENCES ads.content_production_shot_catalogs(catalog_id),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    CHECK (status <> 'completed' OR catalog_id IS NOT NULL)
);
CREATE UNIQUE INDEX content_production_shot_jobs_active_idx
    ON ads.content_production_shot_jobs (owner_user_id, asset_id, raw_sha256)
    WHERE status IN ('queued','running','cancel_requested');
CREATE INDEX content_production_shot_jobs_queue_idx
    ON ads.content_production_shot_jobs (created_at) WHERE status = 'queued';
CREATE INDEX content_production_shot_jobs_owner_idx
    ON ads.content_production_shot_jobs (owner_user_id, created_at DESC);
