ALTER TABLE ads.marketing_content_assets
  ADD COLUMN IF NOT EXISTS platform_names TEXT[] NOT NULL DEFAULT '{}';

UPDATE ads.marketing_content_assets
SET platform_names = ARRAY[platform]
WHERE platform IS NOT NULL
  AND NULLIF(BTRIM(platform), '') IS NOT NULL
  AND CARDINALITY(platform_names) = 0;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_platform_names
  ON ads.marketing_content_assets USING GIN (platform_names);

COMMENT ON COLUMN ads.marketing_content_assets.platform_names IS '素材可发布/归档的平台列表；platform 保留为默认平台兼容字段。';
