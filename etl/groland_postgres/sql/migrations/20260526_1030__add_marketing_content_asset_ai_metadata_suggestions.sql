ALTER TABLE ads.marketing_content_assets
  ADD COLUMN IF NOT EXISTS ai_suggested_title TEXT,
  ADD COLUMN IF NOT EXISTS ai_suggested_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_metadata_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS title_source TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS tags_source TEXT NOT NULL DEFAULT 'empty';

ALTER TABLE ads.marketing_content_assets
  DROP CONSTRAINT IF EXISTS marketing_content_assets_title_source_check;

ALTER TABLE ads.marketing_content_assets
  ADD CONSTRAINT marketing_content_assets_title_source_check
    CHECK (title_source IN (
      'manual',
      'upload',
      'feishu_row',
      'file_name',
      'ai_generated',
      'row_fallback',
      'token_fallback',
      'unknown'
    ));

ALTER TABLE ads.marketing_content_assets
  DROP CONSTRAINT IF EXISTS marketing_content_assets_tags_source_check;

ALTER TABLE ads.marketing_content_assets
  ADD CONSTRAINT marketing_content_assets_tags_source_check
    CHECK (tags_source IN (
      'manual',
      'upload',
      'feishu_row',
      'ai_generated',
      'mixed',
      'empty',
      'unknown'
    ));

UPDATE ads.marketing_content_assets
SET title_source = CASE
      WHEN source_type = 'manual_upload' THEN 'upload'
      WHEN source_type = 'feishu_bootstrap'
        AND title ~ '^[A-Za-z0-9_-]{16,}$'
        AND title !~ '[[:space:]]'
        THEN 'token_fallback'
      WHEN source_type = 'feishu_bootstrap'
        AND source_sheet_name IS NOT NULL
        AND source_row_index IS NOT NULL
        AND title = CONCAT(source_sheet_name, ' 第', source_row_index, '行视频')
        THEN 'row_fallback'
      WHEN source_type = 'feishu_bootstrap' THEN 'feishu_row'
      ELSE title_source
    END
WHERE title_source = 'unknown';

UPDATE ads.marketing_content_assets
SET title = CONCAT(source_sheet_name, ' 第', source_row_index, '行视频'),
    title_source = 'row_fallback'
WHERE source_type = 'feishu_bootstrap'
  AND source_sheet_name IS NOT NULL
  AND source_row_index IS NOT NULL
  AND title_source = 'token_fallback';

UPDATE ads.marketing_content_assets
SET tags_source = CASE
      WHEN CARDINALITY(tags) = 0 THEN 'empty'
      WHEN source_type = 'manual_upload' THEN 'upload'
      WHEN source_type = 'feishu_bootstrap' THEN 'feishu_row'
      ELSE tags_source
    END
WHERE tags_source IN ('unknown', 'empty');

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_ai_suggested_tags
  ON ads.marketing_content_assets USING GIN (ai_suggested_tags)
  WHERE is_deleted = FALSE AND CARDINALITY(ai_suggested_tags) > 0;
