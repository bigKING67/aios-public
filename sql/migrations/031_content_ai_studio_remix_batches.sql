-- AI 创作中心：框架混剪批次、批次与 Run 的关联及成片片段来源。Additive only;
-- apply through the ledger, never on API startup. Runs keep their existing
-- tables and semantics: a batch links one framework_remix Run per unique
-- segment combination. The render worker's Run reconciliation (Python
-- run_bridge) is the only writer of output assets and lineage.
CREATE TABLE ads.content_remix_batches (
    batch_id UUID PRIMARY KEY,
    owner_user_id TEXT NOT NULL CHECK (LENGTH(owner_user_id) BETWEEN 1 AND 200),
    idempotency_key TEXT NOT NULL CHECK (LENGTH(idempotency_key) BETWEEN 1 AND 100),
    -- SHA-256 of the normalized request; a reused key with another request is a conflict.
    request_digest TEXT NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    task_type TEXT NOT NULL DEFAULT 'framework_remix' CHECK (task_type = 'framework_remix'),
    preset_key TEXT NOT NULL,
    preset_version INTEGER NOT NULL,
    -- {"labels": [...], "sourceAssetId": uuid|null}; labels are ordered slots.
    structure JSONB NOT NULL CHECK (jsonb_typeof(structure) = 'object'),
    -- {"productName": text}; the only phase-1 constraint is the exact segment product.
    constraints JSONB NOT NULL CHECK (jsonb_typeof(constraints) = 'object'),
    requested_count INTEGER NOT NULL CHECK (requested_count BETWEEN 1 AND 100),
    planned_count INTEGER NOT NULL CHECK (planned_count BETWEEN 1 AND requested_count),
    seed BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'partially_failed', 'failed')),
    shortfall_reason TEXT CHECK (shortfall_reason IS NULL OR LENGTH(shortfall_reason) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, idempotency_key),
    FOREIGN KEY (preset_key, preset_version)
        REFERENCES ads.content_segment_presets(preset_key, version),
    CHECK ((planned_count < requested_count) = (shortfall_reason IS NOT NULL))
);
CREATE INDEX content_remix_batches_owner_idx
    ON ads.content_remix_batches (owner_user_id, created_at DESC, batch_id DESC);

CREATE TABLE ads.content_remix_batch_runs (
    batch_id UUID NOT NULL REFERENCES ads.content_remix_batches(batch_id),
    ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
    run_id UUID NOT NULL UNIQUE REFERENCES ads.content_production_runs(run_id),
    -- SHA-256 of the ordered segment ids; unique inside a batch.
    combination_hash TEXT NOT NULL CHECK (combination_hash ~ '^[0-9a-f]{64}$'),
    -- Ordered [{segmentId, assetId, startMs, endMs, labelKey, sourceContentHash}];
    -- equals the Run's frozen clip order.
    segments JSONB NOT NULL CHECK (jsonb_typeof(segments) = 'array' AND jsonb_array_length(segments) >= 1),
    output_asset_id UUID REFERENCES ads.marketing_content_assets(asset_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (batch_id, ordinal),
    UNIQUE (batch_id, combination_hash)
);
CREATE INDEX content_remix_batch_runs_hash_idx
    ON ads.content_remix_batch_runs (combination_hash);

CREATE TABLE ads.content_asset_lineage (
    output_asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id),
    run_id UUID NOT NULL REFERENCES ads.content_production_runs(run_id),
    ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
    segment_id UUID NOT NULL REFERENCES ads.content_segments(segment_id),
    source_asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id),
    source_content_hash TEXT NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
    source_start_ms INTEGER NOT NULL CHECK (source_start_ms >= 0),
    source_end_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, ordinal),
    CHECK (source_end_ms > source_start_ms)
);
CREATE INDEX content_asset_lineage_output_idx
    ON ads.content_asset_lineage (output_asset_id, ordinal);
CREATE INDEX content_asset_lineage_segment_idx
    ON ads.content_asset_lineage (segment_id);
CREATE INDEX content_asset_lineage_source_idx
    ON ads.content_asset_lineage (source_asset_id);
