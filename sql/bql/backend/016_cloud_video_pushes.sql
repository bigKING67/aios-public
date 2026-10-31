-- Desktop delivery ledger. No credentials or signed download URLs are persisted.
CREATE TABLE cloud_video.pushes (
    output_asset_id UUID PRIMARY KEY REFERENCES ads.marketing_content_assets(asset_id),
    run_id UUID NOT NULL REFERENCES ads.content_remix_batch_runs(run_id),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'submitting', 'importing', 'succeeded', 'failed', 'uncertain')),
    video_name TEXT,
    two_level_type_id BIGINT,
    label_ids BIGINT[],
    request_id TEXT,
    cloud_video_id BIGINT UNIQUE CHECK (cloud_video_id > 0),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    retry_limit INTEGER NOT NULL DEFAULT 4 CHECK (retry_limit > 0),
    error_code TEXT,
    approved_by TEXT NOT NULL,
    approved_at TIMESTAMPTZ NOT NULL,
    submission_history JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (JSONB_TYPEOF(submission_history) = 'array'),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    succeeded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT push_success_check CHECK (status <> 'succeeded' OR (cloud_video_id IS NOT NULL AND succeeded_at IS NOT NULL)),
    CONSTRAINT push_importing_check CHECK (status <> 'importing' OR request_id IS NOT NULL)
);
CREATE INDEX cloud_video_pushes_pending_idx ON cloud_video.pushes(next_attempt_at)
    WHERE status IN ('pending', 'submitting', 'importing', 'failed');
COMMENT ON TABLE cloud_video.pushes IS 'One cloud delivery per output asset; unknown submission outcomes are never automatically resubmitted';
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_gpu_node') THEN
        GRANT SELECT, INSERT, UPDATE ON cloud_video.pushes TO aios_gpu_node;
        GRANT SELECT ON ads.content_remix_output_reviews, ads.content_remix_batch_runs,
            ads.content_remix_batches, ads.content_production_runs, ads.content_production_jobs, ads.content_production_revisions,
            ads.content_segment_presets, ads.marketing_content_assets TO aios_gpu_node;
    END IF;
END $$;
