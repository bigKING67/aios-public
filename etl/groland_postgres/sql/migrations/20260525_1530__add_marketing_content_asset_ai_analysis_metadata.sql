ALTER TABLE ads.marketing_content_assets
  ADD COLUMN IF NOT EXISTS ai_analysis_source TEXT,
  ADD COLUMN IF NOT EXISTS ai_analysis_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

ALTER TABLE ads.marketing_content_assets
  DROP CONSTRAINT IF EXISTS marketing_content_assets_ai_analysis_source_check;

ALTER TABLE ads.marketing_content_assets
  ADD CONSTRAINT marketing_content_assets_ai_analysis_source_check
    CHECK (ai_analysis_source IS NULL OR ai_analysis_source IN ('preview', 'raw', 'auto'));

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_ai_analysis
  ON ads.marketing_content_assets(ai_analysis_source, ai_analyzed_at DESC)
  WHERE is_deleted = FALSE AND analysis_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_processing_jobs_queue
  ON ads.marketing_content_asset_processing_jobs(job_type, queued_at ASC, created_at ASC)
  WHERE status = 'queued';
