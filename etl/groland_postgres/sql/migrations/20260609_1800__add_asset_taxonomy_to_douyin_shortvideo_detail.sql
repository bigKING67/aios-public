BEGIN;

ALTER TABLE ads.douyin_shortvideo_detail
  ADD COLUMN IF NOT EXISTS asset_video_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS asset_content_scenes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS asset_content_scene_groups TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS asset_content_scene_subtypes TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_video_types IS
  '素材库视频类型集合，来自 ads.marketing_content_assets.video_type。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_content_scenes IS
  '素材库内容场景类型集合，来自 ads.marketing_content_assets.content_scene。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_content_scene_groups IS
  '素材库内容大场景集合，来自 ads.marketing_content_assets.content_scene_group。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_content_scene_subtypes IS
  '素材库内容细分场景集合，来自 ads.marketing_content_assets.content_scene_subtype。';

CREATE OR REPLACE FUNCTION ads.fn_douyin_shortvideo_detail_apply_asset_taxonomy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('ads.marketing_content_assets') IS NULL THEN
    NEW.asset_video_types := COALESCE(NEW.asset_video_types, '{}'::TEXT[]);
    NEW.asset_content_scenes := COALESCE(NEW.asset_content_scenes, '{}'::TEXT[]);
    NEW.asset_content_scene_groups := COALESCE(NEW.asset_content_scene_groups, '{}'::TEXT[]);
    NEW.asset_content_scene_subtypes := COALESCE(NEW.asset_content_scene_subtypes, '{}'::TEXT[]);
    RETURN NEW;
  END IF;

  WITH row_assets AS (
    SELECT DISTINCT u.value AS asset_id
    FROM unnest(COALESCE(NEW.asset_ids, '{}'::UUID[])) AS u(value)
    WHERE u.value IS NOT NULL
  ),
  row_asset_meta AS (
    SELECT
      NULLIF(BTRIM(asset.video_type), '') AS video_type,
      NULLIF(BTRIM(asset.content_scene), '') AS content_scene,
      NULLIF(BTRIM(asset.content_scene_group), '') AS content_scene_group,
      NULLIF(BTRIM(asset.content_scene_subtype), '') AS content_scene_subtype
    FROM row_assets ra
    JOIN ads.marketing_content_assets asset
      ON asset.asset_id = ra.asset_id
     AND asset.is_deleted = FALSE
  )
  SELECT
    COALESCE(ARRAY(SELECT DISTINCT video_type FROM row_asset_meta WHERE video_type IS NOT NULL ORDER BY video_type), '{}'::TEXT[]),
    COALESCE(ARRAY(SELECT DISTINCT content_scene FROM row_asset_meta WHERE content_scene IS NOT NULL ORDER BY content_scene), '{}'::TEXT[]),
    COALESCE(ARRAY(SELECT DISTINCT content_scene_group FROM row_asset_meta WHERE content_scene_group IS NOT NULL ORDER BY content_scene_group), '{}'::TEXT[]),
    COALESCE(ARRAY(SELECT DISTINCT content_scene_subtype FROM row_asset_meta WHERE content_scene_subtype IS NOT NULL ORDER BY content_scene_subtype), '{}'::TEXT[])
  INTO
    NEW.asset_video_types,
    NEW.asset_content_scenes,
    NEW.asset_content_scene_groups,
    NEW.asset_content_scene_subtypes;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_douyin_shortvideo_detail_apply_asset_taxonomy ON ads.douyin_shortvideo_detail;
CREATE TRIGGER trg_douyin_shortvideo_detail_apply_asset_taxonomy
BEFORE INSERT OR UPDATE OF asset_ids ON ads.douyin_shortvideo_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_douyin_shortvideo_detail_apply_asset_taxonomy();

UPDATE ads.douyin_shortvideo_detail
SET asset_ids = asset_ids;

COMMIT;
