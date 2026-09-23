BEGIN;

ALTER TABLE ads.douyin_shortvideo_detail
  ADD COLUMN IF NOT EXISTS asset_product_names TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS asset_owner_names TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_product_names IS
  '素材库产品集合，来自 ads.marketing_content_assets.product_names/product_name。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.asset_owner_names IS
  '素材库负责人集合，来自 ads.marketing_content_assets.owner_name。';

ALTER TABLE ads.douyin_shortvideo_creator_manual_attrs
  ADD COLUMN IF NOT EXISTS mcn TEXT;

COMMENT ON COLUMN ads.douyin_shortvideo_creator_manual_attrs.mcn IS
  '页面人工维护 MCN，不来自达人库。';

CREATE OR REPLACE FUNCTION ads.fn_douyin_shortvideo_detail_apply_asset_taxonomy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('ads.marketing_content_assets') IS NULL THEN
    NEW.asset_product_names := COALESCE(NEW.asset_product_names, '{}'::TEXT[]);
    NEW.asset_owner_names := COALESCE(NEW.asset_owner_names, '{}'::TEXT[]);
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
      NULLIF(BTRIM(product_values.product_name), '') AS product_name,
      NULLIF(BTRIM(asset.owner_name), '') AS owner_name,
      NULLIF(BTRIM(asset.video_type), '') AS video_type,
      NULLIF(BTRIM(asset.content_scene), '') AS content_scene,
      NULLIF(BTRIM(asset.content_scene_group), '') AS content_scene_group,
      NULLIF(BTRIM(asset.content_scene_subtype), '') AS content_scene_subtype
    FROM row_assets ra
    JOIN ads.marketing_content_assets asset
      ON asset.asset_id = ra.asset_id
     AND asset.is_deleted = FALSE
    LEFT JOIN LATERAL (
      SELECT value AS product_name
      FROM unnest(
        CASE
          WHEN CARDINALITY(COALESCE(asset.product_names, '{}'::TEXT[])) > 0
          THEN asset.product_names
          WHEN NULLIF(BTRIM(asset.product_name), '') IS NOT NULL
          THEN ARRAY[asset.product_name]
          ELSE '{}'::TEXT[]
        END
      ) AS item(value)
    ) product_values ON TRUE
  )
  SELECT
    COALESCE(ARRAY(SELECT DISTINCT product_name FROM row_asset_meta WHERE product_name IS NOT NULL ORDER BY product_name), '{}'::TEXT[]),
    COALESCE(ARRAY(SELECT DISTINCT owner_name FROM row_asset_meta WHERE owner_name IS NOT NULL ORDER BY owner_name), '{}'::TEXT[]),
    COALESCE(ARRAY(SELECT DISTINCT video_type FROM row_asset_meta WHERE video_type IS NOT NULL ORDER BY video_type), '{}'::TEXT[]),
    COALESCE(ARRAY(SELECT DISTINCT content_scene FROM row_asset_meta WHERE content_scene IS NOT NULL ORDER BY content_scene), '{}'::TEXT[]),
    COALESCE(ARRAY(SELECT DISTINCT content_scene_group FROM row_asset_meta WHERE content_scene_group IS NOT NULL ORDER BY content_scene_group), '{}'::TEXT[]),
    COALESCE(ARRAY(SELECT DISTINCT content_scene_subtype FROM row_asset_meta WHERE content_scene_subtype IS NOT NULL ORDER BY content_scene_subtype), '{}'::TEXT[])
  INTO
    NEW.asset_product_names,
    NEW.asset_owner_names,
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

CREATE OR REPLACE VIEW ads.v_douyin_shortvideo_detail_full AS
SELECT
  d.*,
  ma.manual_attr_id,
  ma.scope_type AS manual_scope_type,
  ma.platform AS manual_platform,
  ma.author_douyin_id AS manual_author_douyin_id,
  ma.author_name_snapshot AS manual_author_name_snapshot,
  ma.video_id AS manual_video_id,
  ma.product_id AS manual_product_id,
  ma.fans_count AS manual_fans_count,
  ma.fans_count_updated_at AS manual_fans_count_updated_at,
  ma.creator_type AS manual_creator_type,
  ma.mcn AS manual_mcn,
  ma.creator_fee_amount AS manual_creator_fee_amount,
  ma.creator_fee_type AS manual_creator_fee_type,
  ma.creator_fee_note AS manual_creator_fee_note,
  ma.created_by_user_id AS manual_created_by_user_id,
  ma.created_by_name AS manual_created_by_name,
  ma.updated_by_user_id AS manual_updated_by_user_id,
  ma.updated_by_name AS manual_updated_by_name,
  ma.created_at AS manual_created_at,
  ma.updated_at AS manual_updated_at,
  ma.is_deleted AS manual_is_deleted
FROM ads.douyin_shortvideo_detail d
LEFT JOIN LATERAL (
  SELECT
    ma.manual_attr_id,
    ma.scope_type,
    ma.platform,
    ma.author_douyin_id,
    ma.author_name_snapshot,
    ma.video_id,
    ma.product_id,
    ma.fans_count,
    ma.fans_count_updated_at,
    ma.creator_type,
    ma.mcn,
    ma.creator_fee_amount,
    ma.creator_fee_type,
    ma.creator_fee_note,
    ma.created_by_user_id,
    ma.created_by_name,
    ma.updated_by_user_id,
    ma.updated_by_name,
    ma.created_at,
    ma.updated_at,
    ma.is_deleted
  FROM ads.douyin_shortvideo_creator_manual_attrs ma
  WHERE ma.platform = 'douyin'
    AND ma.is_deleted = FALSE
    AND ma.author_douyin_id = NULLIF(d.author_douyin_id, '')
    AND ma.scope_type = 'video'
    AND ma.video_id = NULLIF(d.video_id, '')
    AND ma.product_id = ''
  ORDER BY
    ma.updated_at DESC,
    ma.manual_attr_id DESC
  LIMIT 1
) ma ON TRUE;

COMMENT ON VIEW ads.v_douyin_shortvideo_detail_full IS
  '短视频挂车完整只读宽表视图：ads.douyin_shortvideo_detail 事实字段 + 素材库字段 + 页面人工维护字段。';
COMMENT ON COLUMN ads.v_douyin_shortvideo_detail_full.asset_product_names IS
  '素材库产品集合，来自 ads.marketing_content_assets。';
COMMENT ON COLUMN ads.v_douyin_shortvideo_detail_full.asset_owner_names IS
  '素材库负责人集合，来自 ads.marketing_content_assets。';
COMMENT ON COLUMN ads.v_douyin_shortvideo_detail_full.manual_mcn IS
  '页面人工维护 MCN，不来自达人库。';
COMMENT ON COLUMN ads.v_douyin_shortvideo_detail_full.manual_creator_fee_amount IS
  '页面按达人+视频维护的合作费用金额，来自 ads.douyin_shortvideo_creator_manual_attrs。';

COMMIT;
