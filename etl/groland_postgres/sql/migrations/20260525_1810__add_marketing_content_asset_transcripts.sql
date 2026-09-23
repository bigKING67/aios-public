ALTER TABLE ads.marketing_content_assets
  ADD COLUMN IF NOT EXISTS transcript_source TEXT,
  ADD COLUMN IF NOT EXISTS transcript_model TEXT,
  ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS script_excerpt TEXT;

ALTER TABLE ads.marketing_content_assets
  DROP CONSTRAINT IF EXISTS marketing_content_assets_transcript_source_check;

ALTER TABLE ads.marketing_content_assets
  ADD CONSTRAINT marketing_content_assets_transcript_source_check
    CHECK (transcript_source IS NULL OR transcript_source IN ('raw', 'preview', 'auto'));

ALTER TABLE ads.marketing_content_asset_objects
  DROP CONSTRAINT IF EXISTS marketing_content_asset_objects_role_check;

ALTER TABLE ads.marketing_content_asset_objects
  ADD CONSTRAINT marketing_content_asset_objects_role_check
    CHECK (object_role IN ('raw', 'preview', 'cover', 'frame', 'transcript', 'analysis', 'analysis_proxy'));

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_transcripts (
  transcript_id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  source_object_key TEXT NOT NULL,
  transcript_object_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  language TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  transcript_text TEXT NOT NULL,
  script_text TEXT NOT NULL,
  srt_text TEXT NOT NULL,
  segments JSONB NOT NULL DEFAULT '[]'::JSONB,
  duration_seconds NUMERIC(12, 3),
  word_count INTEGER,
  confidence NUMERIC(6, 4),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_asset_transcripts_status_check
    CHECK (status IN ('active', 'superseded', 'deleted', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_transcripts_asset_active
  ON ads.marketing_content_asset_transcripts(asset_id, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_transcripts_script_tsv
  ON ads.marketing_content_asset_transcripts
  USING GIN (to_tsvector('simple', script_text));

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_transcribed
  ON ads.marketing_content_assets(transcript_source, transcribed_at DESC)
  WHERE is_deleted = FALSE AND transcript_object_key IS NOT NULL;
