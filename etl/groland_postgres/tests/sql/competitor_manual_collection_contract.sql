-- Nullable provenance is essential: migration must not mark every compass film as manual.
BEGIN;
INSERT INTO competitor.videos (aweme_id, share_url, source, first_seen_at)
VALUES ('789000000001', 'https://www.douyin.com/video/789000000001', 'compass', '2026-09-01 00:00:00+08');
DO $$
BEGIN
    IF (SELECT manual_added_at IS NOT NULL FROM competitor.videos WHERE aweme_id = '789000000001') THEN
        RAISE EXCEPTION 'compass-only collection fabricated a manual event';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'competitor' AND indexdef LIKE '%manual_added_at%') THEN
        RAISE EXCEPTION 'manual collection date index missing';
    END IF;
END $$;

-- Same inputs: retain incomplete attempts, then permit the successful explicit retry.
INSERT INTO competitor.analyses
    (aweme_id, status, card, source_sha256, input_manifest_hash, model_id, prompt_version, taxonomy_version)
VALUES
    ('789000000001', 'partial', '{"framework":{"status":"ok"}}', REPEAT('a', 64), REPEAT('e', 64), 'fixture', 'v1', 'v1'),
    ('789000000001', 'succeeded', '{"framework":{"status":"ok","sellingPointError":"timeout"}}', REPEAT('a', 64), REPEAT('e', 64), 'fixture', 'v1', 'v1'),
    ('789000000001', 'succeeded', '{"framework":{"status":"ok","transcriptError":"timeout"}}', REPEAT('a', 64), REPEAT('e', 64), 'fixture', 'v1', 'v1'),
    ('789000000001', 'succeeded', '{"framework":{"status":"ok"}}', REPEAT('a', 64), REPEAT('e', 64), 'fixture', 'v1', 'v1');
DO $$
BEGIN
    BEGIN
        INSERT INTO competitor.analyses
            (aweme_id, status, card, source_sha256, input_manifest_hash, model_id, prompt_version, taxonomy_version)
        VALUES ('789000000001', 'succeeded', '{"framework":{"status":"ok"}}', REPEAT('a', 64), REPEAT('e', 64), 'fixture', 'v1', 'v1');
        RAISE EXCEPTION 'complete results with identical inputs must remain unique';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;
    IF (SELECT COUNT(*) FROM competitor.analyses WHERE aweme_id = '789000000001') <> 4 THEN
        RAISE EXCEPTION 'incomplete history or explicit retry was lost';
    END IF;
END $$;
ROLLBACK;
