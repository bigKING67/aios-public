ALTER TABLE ads.marketing_content_assets
  ADD COLUMN IF NOT EXISTS video_type TEXT,
  ADD COLUMN IF NOT EXISTS content_scene TEXT,
  ADD COLUMN IF NOT EXISTS content_scene_group TEXT,
  ADD COLUMN IF NOT EXISTS content_scene_subtype TEXT;

COMMENT ON COLUMN ads.marketing_content_assets.video_type IS '素材运营视频类型，例如 KOL种草视频、KOC挂车视频、店播视频。';
COMMENT ON COLUMN ads.marketing_content_assets.content_scene IS 'KOL/KOC 内容场景类型一级分类。';
COMMENT ON COLUMN ads.marketing_content_assets.content_scene_group IS 'KOL/KOC 内容大场景分类。';
COMMENT ON COLUMN ads.marketing_content_assets.content_scene_subtype IS 'KOL/KOC 内容细分场景分类。';

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_video_type
  ON ads.marketing_content_assets (video_type)
  WHERE video_type IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_content_scene
  ON ads.marketing_content_assets (content_scene)
  WHERE content_scene IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_content_scene_group
  ON ads.marketing_content_assets (content_scene_group)
  WHERE content_scene_group IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_content_scene_subtype
  ON ads.marketing_content_assets (content_scene_subtype)
  WHERE content_scene_subtype IS NOT NULL AND is_deleted = FALSE;
