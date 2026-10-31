-- Retain audit and lineage while expiring only explicitly identified output objects.
CREATE TABLE ads.content_remix_retention (
    output_asset_id UUID PRIMARY KEY REFERENCES ads.marketing_content_assets(asset_id),
    reason TEXT NOT NULL CHECK (reason IN ('rejected','delivered')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','deleting','failed','completed','cancelled')),
    cleanup_at TIMESTAMPTZ NOT NULL,
    purge_started_at TIMESTAMPTZ,
    cleaned_at TIMESTAMPTZ,
    objects JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (JSONB_TYPEOF(objects)='array'),
    error_code TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status<>'completed' OR cleaned_at IS NOT NULL)
);
CREATE INDEX remix_retention_due_idx ON ads.content_remix_retention(cleanup_at)
    WHERE status IN ('pending','deleting','failed');
CREATE TABLE ads.content_remix_review_history (
    history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id UUID NOT NULL,
    output_asset_id UUID NOT NULL,
    decision TEXT NOT NULL,
    reasons TEXT[] NOT NULL,
    note TEXT,
    reviewer_user_id TEXT NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE FUNCTION ads.archive_remix_review() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO ads.content_remix_review_history(run_id,output_asset_id,decision,reasons,note,reviewer_user_id,reviewed_at)
        VALUES (OLD.run_id,OLD.output_asset_id,OLD.decision,OLD.reasons,OLD.note,OLD.reviewer_user_id,OLD.reviewed_at);
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER remix_review_archive BEFORE UPDATE OR DELETE ON ads.content_remix_output_reviews
    FOR EACH ROW EXECUTE FUNCTION ads.archive_remix_review();
ALTER TABLE cloud_video.pushes ADD COLUMN playback_outer_host TEXT,
    ADD COLUMN playback_inner_host TEXT, ADD COLUMN playback_path TEXT,
    ADD COLUMN playback_verified_at TIMESTAMPTZ,
    ADD COLUMN playback_error_code TEXT,
    ADD CONSTRAINT push_playback_host_check CHECK (
        playback_outer_host ~ '^[a-z0-9.-]+(:[0-9]{1,5})?$' AND playback_inner_host ~ '^[a-z0-9.-]+(:[0-9]{1,5})?$'),
    ADD CONSTRAINT push_playback_path_check CHECK (playback_path ~ '^/[^?#]+$');
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aios_gpu_node') THEN
        GRANT SELECT ON ads.content_remix_retention TO aios_gpu_node;
    END IF;
END $$;
-- Existing rejected generated outputs adopt the same rule; shared/manual originals stay protected.
INSERT INTO ads.content_remix_retention(output_asset_id,reason,cleanup_at)
SELECT br.output_asset_id,'rejected',MAX(rv.reviewed_at)+INTERVAL '7 days'
FROM ads.content_remix_batch_runs br
JOIN ads.marketing_content_assets a ON a.asset_id=br.output_asset_id AND a.source_type='ai_studio_output'
LEFT JOIN ads.content_remix_output_reviews rv ON rv.run_id=br.run_id AND rv.output_asset_id=br.output_asset_id
GROUP BY br.output_asset_id HAVING BOOL_AND(COALESCE(rv.decision='rejected',FALSE));
UPDATE ads.marketing_content_assets a SET is_deleted=TRUE
FROM ads.content_remix_retention rt WHERE rt.output_asset_id=a.asset_id AND rt.reason='rejected';
