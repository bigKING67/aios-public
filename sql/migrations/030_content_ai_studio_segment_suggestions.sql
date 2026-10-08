-- AI 创作中心：显式触发的 AI 切段打标任务。Additive only; apply through the
-- ledger, never on API startup. One active (queued/running) job per
-- (asset, preset); failures are never retried automatically because a model
-- call may already have been billed. Results are written as origin=ai,
-- status=suggested segments; confirmed/human segments are never modified.
CREATE TABLE ads.content_segment_suggestion_jobs (
    job_id UUID PRIMARY KEY,
    owner_user_id TEXT NOT NULL CHECK (LENGTH(owner_user_id) BETWEEN 1 AND 200),
    asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id),
    source_content_hash TEXT NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
    preset_key TEXT NOT NULL,
    preset_version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    stage TEXT NOT NULL DEFAULT '等待切段' CHECK (LENGTH(stage) BETWEEN 1 AND 100),
    attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    claim_token UUID,
    heartbeat_at TIMESTAMPTZ,
    -- Machine-readable failure reason (source_changed, provider_error, ...); the
    -- message is a fixed human text and never echoes provider output or URLs.
    error_code TEXT CHECK (error_code IS NULL OR error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
    error_message TEXT CHECK (error_message IS NULL OR LENGTH(error_message) <= 500),
    -- Persisted before the paid provider call so an interrupted job still records intent.
    model TEXT CHECK (model IS NULL OR LENGTH(model) BETWEEN 1 AND 200),
    prompt_version TEXT CHECK (prompt_version IS NULL OR LENGTH(prompt_version) BETWEEN 1 AND 100),
    request_settings JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(request_settings) = 'object'),
    usage JSONB CHECK (usage IS NULL OR jsonb_typeof(usage) = 'object'),
    result_summary JSONB CHECK (result_summary IS NULL OR jsonb_typeof(result_summary) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (preset_key, preset_version)
        REFERENCES ads.content_segment_presets(preset_key, version),
    CHECK (status <> 'succeeded' OR result_summary IS NOT NULL),
    CHECK (status <> 'failed' OR error_code IS NOT NULL),
    CHECK ((status IN ('succeeded', 'failed', 'cancelled')) = (finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX content_segment_suggestion_jobs_active_idx
    ON ads.content_segment_suggestion_jobs (asset_id, preset_key)
    WHERE status IN ('queued', 'running');
CREATE INDEX content_segment_suggestion_jobs_queue_idx
    ON ads.content_segment_suggestion_jobs (created_at) WHERE status = 'queued';
CREATE INDEX content_segment_suggestion_jobs_asset_idx
    ON ads.content_segment_suggestion_jobs (asset_id, created_at DESC);
CREATE INDEX content_segment_suggestion_jobs_owner_idx
    ON ads.content_segment_suggestion_jobs (owner_user_id, created_at DESC);
