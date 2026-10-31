-- Separate manual collection from the immutable first source; a film can also occur in compass daily facts.
ALTER TABLE competitor.videos ADD COLUMN manual_added_at TIMESTAMPTZ;
COMMENT ON COLUMN competitor.videos.manual_added_at IS '首次手动收录时间；罗盘与手动可同时存在，重复添加不刷新此时间';
UPDATE competitor.videos SET manual_added_at = first_seen_at WHERE source = 'manual';
CREATE INDEX competitor_videos_manual_added_idx ON competitor.videos (manual_added_at DESC, aweme_id)
    WHERE manual_added_at IS NOT NULL;
CREATE INDEX competitor_videos_first_seen_idx ON competitor.videos (first_seen_at DESC, aweme_id);

-- An incomplete result must not block saving its explicit retry with identical inputs.
-- Match API completeness; preserve every attempt, while still deduplicating complete results.
DROP INDEX competitor.analyses_reuse_key;
CREATE UNIQUE INDEX analyses_reuse_key
    ON competitor.analyses (source_sha256, input_manifest_hash, model_id, prompt_version, taxonomy_version)
    WHERE status = 'succeeded'
      AND card -> 'framework' ->> 'status' = 'ok'
      AND NOT (card -> 'framework' ?| ARRAY['transcriptError', 'sellingPointError']);
