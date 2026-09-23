BEGIN;

-- Existing platform-video rows used `external_item_id` as the 千川素材ID before
-- ad-material rows were auto-synced. Backfill the real relation rows so detail
-- pages and ADS refreshes do not keep showing "广告素材实例 0".
WITH raw_platform_material_candidates AS (
  SELECT
    pv.platform_video_id,
    pv.asset_id,
    pv.account_id,
    pv.account_name,
    pv.advertiser_id,
    NULLIF(BTRIM(pv.external_item_id), '') AS external_material_id,
    NULLIF(BTRIM(pv.external_video_id), '') AS external_video_id,
    pv.publish_title,
    pv.updated_at,
    (
      SUBSTR(MD5('qianchuan-material-from-platform-video:' || pv.platform_video_id::TEXT), 1, 8)
      || '-'
      || SUBSTR(MD5('qianchuan-material-from-platform-video:' || pv.platform_video_id::TEXT), 9, 4)
      || '-'
      || SUBSTR(MD5('qianchuan-material-from-platform-video:' || pv.platform_video_id::TEXT), 13, 4)
      || '-'
      || SUBSTR(MD5('qianchuan-material-from-platform-video:' || pv.platform_video_id::TEXT), 17, 4)
      || '-'
      || SUBSTR(MD5('qianchuan-material-from-platform-video:' || pv.platform_video_id::TEXT), 21, 12)
    )::UUID AS ad_material_id
  FROM ads.marketing_content_platform_videos pv
  JOIN ads.marketing_content_assets asset
    ON asset.asset_id = pv.asset_id
   AND asset.is_deleted = FALSE
  WHERE pv.relation_status = 'active'
    AND pv.platform = 'douyin'
    AND NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL
),
platform_material_candidates AS (
  SELECT DISTINCT ON (COALESCE(account_id, ''), external_material_id)
    platform_video_id,
    asset_id,
    account_id,
    account_name,
    advertiser_id,
    external_material_id,
    external_video_id,
    publish_title,
    updated_at,
    ad_material_id
  FROM raw_platform_material_candidates
  ORDER BY
    COALESCE(account_id, ''),
    external_material_id,
    (external_video_id IS NOT NULL) DESC,
    updated_at DESC,
    platform_video_id DESC
),
updated_materials AS (
  UPDATE ads.marketing_content_ad_materials material
  SET
    platform_video_id = COALESCE(material.platform_video_id, candidate.platform_video_id),
    external_video_id = COALESCE(NULLIF(BTRIM(material.external_video_id), ''), candidate.external_video_id),
    account_name = COALESCE(NULLIF(BTRIM(material.account_name), ''), candidate.account_name),
    advertiser_id = COALESCE(NULLIF(BTRIM(material.advertiser_id), ''), candidate.advertiser_id),
    material_title = COALESCE(NULLIF(BTRIM(material.material_title), ''), candidate.publish_title),
    updated_at = CURRENT_TIMESTAMP
  FROM platform_material_candidates candidate
  WHERE material.asset_id = candidate.asset_id
    AND material.relation_status = 'active'
    AND material.ad_platform = 'qianchuan'
    AND COALESCE(material.account_id, '') = COALESCE(candidate.account_id, '')
    AND NULLIF(BTRIM(material.external_material_id), '') = candidate.external_material_id
  RETURNING material.asset_id
),
inserted_materials AS (
  INSERT INTO ads.marketing_content_ad_materials (
    ad_material_id,
    asset_id,
    platform_video_id,
    ad_platform,
    account_id,
    account_name,
    advertiser_id,
    external_material_id,
    external_video_id,
    material_title,
    material_status,
    source
  )
  SELECT
    candidate.ad_material_id,
    candidate.asset_id,
    candidate.platform_video_id,
    'qianchuan',
    candidate.account_id,
    candidate.account_name,
    candidate.advertiser_id,
    candidate.external_material_id,
    candidate.external_video_id,
    candidate.publish_title,
    'unknown',
    'manual'
  FROM platform_material_candidates candidate
  WHERE NOT EXISTS (
      SELECT 1
      FROM ads.marketing_content_ad_materials material
      WHERE material.relation_status = 'active'
        AND material.ad_platform = 'qianchuan'
        AND COALESCE(material.account_id, '') = COALESCE(candidate.account_id, '')
        AND NULLIF(BTRIM(material.external_material_id), '') = candidate.external_material_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM ads.marketing_content_ad_materials material
      WHERE material.ad_material_id = candidate.ad_material_id
    )
  RETURNING asset_id
),
affected_assets AS (
  SELECT asset_id FROM updated_materials
  UNION
  SELECT asset_id FROM inserted_materials
)
UPDATE ads.marketing_content_assets asset
SET
  profile_status = CASE
    WHEN profile_status IN ('incomplete', 'basic_complete', 'platform_bound')
      THEN 'performance_ready'
    ELSE profile_status
  END,
  updated_at = CURRENT_TIMESTAMP
WHERE asset.asset_id IN (SELECT asset_id FROM affected_assets)
  AND asset.is_deleted = FALSE;

COMMIT;
