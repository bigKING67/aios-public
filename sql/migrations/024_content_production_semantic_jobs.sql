-- Additive ledger migration; never run from API startup.
CREATE TABLE ads.content_production_semantic_jobs (
    job_id UUID PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    catalog_id UUID NOT NULL REFERENCES ads.content_production_shot_catalogs(catalog_id),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','cancel_requested','cancelled','completed','failed')),
    stage TEXT NOT NULL DEFAULT '等待语义分析',
    claim_token UUID,
    heartbeat_at TIMESTAMPTZ,
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    CHECK ((status = 'completed') = (result IS NOT NULL))
);
CREATE UNIQUE INDEX content_production_semantic_active_idx
    ON ads.content_production_semantic_jobs (owner_user_id, catalog_id, request_hash)
    WHERE status IN ('queued','running','cancel_requested');
CREATE INDEX content_production_semantic_queue_idx
    ON ads.content_production_semantic_jobs (created_at) WHERE status = 'queued';
CREATE INDEX content_production_semantic_catalog_idx
    ON ads.content_production_semantic_jobs (owner_user_id, catalog_id, finished_at DESC);
