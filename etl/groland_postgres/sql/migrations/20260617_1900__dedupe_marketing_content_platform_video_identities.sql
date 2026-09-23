BEGIN;

-- Historical manual edits could create multiple active platform-video identity
-- rows for the same physical asset and Douyin video ID. Keep the most complete
-- row, move dependent ad-material rows to it, then archive the duplicate rows.
CREATE TEMP TABLE tmp_marketing_content_platform_video_dedupe ON COMMIT DROP AS
WITH ranked_platform_videos AS (
  SELECT
    pv.platform_video_id,
    pv.asset_id,
    pv.platform,
    NULLIF(BTRIM(pv.external_video_id), '') AS external_video_id,
    pv.updated_at,
    pv.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY pv.asset_id, pv.platform, NULLIF(BTRIM(pv.external_video_id), '')
      ORDER BY
        CASE WHEN NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN NULLIF(BTRIM(pv.external_url), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN NULLIF(BTRIM(pv.publish_title), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN NULLIF(BTRIM(pv.account_name), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
        pv.updated_at DESC,
        pv.created_at DESC,
        pv.platform_video_id ASC
    ) AS identity_rank
  FROM ads.marketing_content_platform_videos pv
  JOIN ads.marketing_content_assets asset
    ON asset.asset_id = pv.asset_id
   AND asset.is_deleted = FALSE
  WHERE pv.relation_status = 'active'
    AND NULLIF(BTRIM(pv.external_video_id), '') IS NOT NULL
),
duplicate_groups AS (
  SELECT
    asset_id,
    platform,
    external_video_id
  FROM ranked_platform_videos
  GROUP BY asset_id, platform, external_video_id
  HAVING COUNT(*) > 1
),
survivors AS (
  SELECT ranked.*
  FROM ranked_platform_videos ranked
  JOIN duplicate_groups duplicate_group
    ON duplicate_group.asset_id = ranked.asset_id
   AND duplicate_group.platform = ranked.platform
   AND duplicate_group.external_video_id = ranked.external_video_id
  WHERE ranked.identity_rank = 1
),
duplicates AS (
  SELECT ranked.*
  FROM ranked_platform_videos ranked
  JOIN duplicate_groups duplicate_group
    ON duplicate_group.asset_id = ranked.asset_id
   AND duplicate_group.platform = ranked.platform
   AND duplicate_group.external_video_id = ranked.external_video_id
  WHERE ranked.identity_rank > 1
)
SELECT
  duplicate.platform_video_id AS archived_platform_video_id,
  survivor.platform_video_id AS kept_platform_video_id,
  duplicate.asset_id,
  duplicate.platform,
  duplicate.external_video_id
FROM duplicates duplicate
JOIN survivors survivor
  ON survivor.asset_id = duplicate.asset_id
 AND survivor.platform = duplicate.platform
 AND survivor.external_video_id = duplicate.external_video_id;

UPDATE ads.marketing_content_ad_materials material
SET
  platform_video_id = dedupe.kept_platform_video_id,
  raw_payload = material.raw_payload || JSONB_BUILD_OBJECT(
    'deduped_platform_video_id',
    dedupe.archived_platform_video_id::TEXT,
    'deduped_reason',
    'duplicate_external_video_id'
  ),
  updated_at = CURRENT_TIMESTAMP
FROM tmp_marketing_content_platform_video_dedupe dedupe
WHERE material.platform_video_id = dedupe.archived_platform_video_id
  AND material.relation_status <> 'archived';

UPDATE ads.marketing_content_platform_videos duplicate
SET
  relation_status = 'archived',
  raw_payload = duplicate.raw_payload || JSONB_BUILD_OBJECT(
    'archived_reason',
    'duplicate_external_video_id',
    'archived_duplicate_of',
    dedupe.kept_platform_video_id::TEXT,
    'archived_at',
    CURRENT_TIMESTAMP
  ),
  updated_at = CURRENT_TIMESTAMP
FROM tmp_marketing_content_platform_video_dedupe dedupe
WHERE duplicate.platform_video_id = dedupe.archived_platform_video_id
  AND duplicate.relation_status = 'active';

WITH survivor_patch AS (
  SELECT
    dedupe.kept_platform_video_id,
    (ARRAY_AGG(NULLIF(BTRIM(pv.account_id), '') ORDER BY
      CASE WHEN NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
      pv.updated_at DESC,
      pv.created_at DESC
    ) FILTER (WHERE NULLIF(BTRIM(pv.account_id), '') IS NOT NULL))[1] AS account_id,
    (ARRAY_AGG(NULLIF(BTRIM(pv.account_name), '') ORDER BY
      CASE WHEN NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
      pv.updated_at DESC,
      pv.created_at DESC
    ) FILTER (WHERE NULLIF(BTRIM(pv.account_name), '') IS NOT NULL))[1] AS account_name,
    (ARRAY_AGG(NULLIF(BTRIM(pv.advertiser_id), '') ORDER BY
      CASE WHEN NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
      pv.updated_at DESC,
      pv.created_at DESC
    ) FILTER (WHERE NULLIF(BTRIM(pv.advertiser_id), '') IS NOT NULL))[1] AS advertiser_id,
    (ARRAY_AGG(NULLIF(BTRIM(pv.external_item_id), '') ORDER BY
      pv.updated_at DESC,
      pv.created_at DESC
    ) FILTER (WHERE NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL))[1] AS external_item_id,
    (ARRAY_AGG(NULLIF(BTRIM(pv.external_note_id), '') ORDER BY
      pv.updated_at DESC,
      pv.created_at DESC
    ) FILTER (WHERE NULLIF(BTRIM(pv.external_note_id), '') IS NOT NULL))[1] AS external_note_id,
    (ARRAY_AGG(NULLIF(BTRIM(pv.external_url), '') ORDER BY
      pv.updated_at DESC,
      pv.created_at DESC
    ) FILTER (WHERE NULLIF(BTRIM(pv.external_url), '') IS NOT NULL))[1] AS external_url,
    (ARRAY_AGG(NULLIF(BTRIM(pv.publish_title), '') ORDER BY
      pv.updated_at DESC,
      pv.created_at DESC
    ) FILTER (WHERE NULLIF(BTRIM(pv.publish_title), '') IS NOT NULL))[1] AS publish_title,
    (ARRAY_AGG(pv.publish_status ORDER BY
      pv.updated_at DESC,
      pv.created_at DESC
    ) FILTER (WHERE pv.publish_status <> 'unknown'))[1] AS publish_status
  FROM tmp_marketing_content_platform_video_dedupe dedupe
  JOIN ads.marketing_content_platform_videos pv
    ON pv.platform_video_id IN (
      dedupe.kept_platform_video_id,
      dedupe.archived_platform_video_id
    )
  GROUP BY dedupe.kept_platform_video_id
)
UPDATE ads.marketing_content_platform_videos kept
SET
  account_id = COALESCE(NULLIF(BTRIM(kept.account_id), ''), survivor_patch.account_id),
  account_name = COALESCE(NULLIF(BTRIM(kept.account_name), ''), survivor_patch.account_name),
  advertiser_id = COALESCE(NULLIF(BTRIM(kept.advertiser_id), ''), survivor_patch.advertiser_id),
  external_item_id = COALESCE(NULLIF(BTRIM(kept.external_item_id), ''), survivor_patch.external_item_id),
  external_note_id = COALESCE(NULLIF(BTRIM(kept.external_note_id), ''), survivor_patch.external_note_id),
  external_url = COALESCE(NULLIF(BTRIM(kept.external_url), ''), survivor_patch.external_url),
  publish_title = COALESCE(NULLIF(BTRIM(kept.publish_title), ''), survivor_patch.publish_title),
  publish_status = CASE
    WHEN kept.publish_status = 'unknown' AND survivor_patch.publish_status IS NOT NULL
      THEN survivor_patch.publish_status
    ELSE kept.publish_status
  END,
  updated_at = CURRENT_TIMESTAMP
FROM survivor_patch
WHERE kept.platform_video_id = survivor_patch.kept_platform_video_id
  AND kept.relation_status = 'active';

WITH deduped_platform_material_candidates AS (
  SELECT DISTINCT ON (COALESCE(pv.account_id, ''), NULLIF(BTRIM(pv.external_item_id), ''))
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
  FROM tmp_marketing_content_platform_video_dedupe dedupe
  JOIN ads.marketing_content_platform_videos pv
    ON pv.platform_video_id = dedupe.kept_platform_video_id
  WHERE pv.relation_status = 'active'
    AND pv.platform = 'douyin'
    AND NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL
  ORDER BY
    COALESCE(pv.account_id, ''),
    NULLIF(BTRIM(pv.external_item_id), ''),
    (NULLIF(BTRIM(pv.external_video_id), '') IS NOT NULL) DESC,
    pv.updated_at DESC,
    pv.platform_video_id DESC
),
updated_materials AS (
  UPDATE ads.marketing_content_ad_materials material
  SET
    platform_video_id = candidate.platform_video_id,
    external_video_id = COALESCE(NULLIF(BTRIM(material.external_video_id), ''), candidate.external_video_id),
    account_name = COALESCE(NULLIF(BTRIM(material.account_name), ''), candidate.account_name),
    advertiser_id = COALESCE(NULLIF(BTRIM(material.advertiser_id), ''), candidate.advertiser_id),
    material_title = COALESCE(NULLIF(BTRIM(material.material_title), ''), candidate.publish_title),
    updated_at = CURRENT_TIMESTAMP
  FROM deduped_platform_material_candidates candidate
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
  FROM deduped_platform_material_candidates candidate
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
  UNION
  SELECT asset_id FROM tmp_marketing_content_platform_video_dedupe
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_platform_videos_asset_video_active
  ON ads.marketing_content_platform_videos (
    asset_id,
    platform,
    NULLIF(BTRIM(external_video_id), '')
  )
  WHERE relation_status = 'active'
    AND NULLIF(BTRIM(external_video_id), '') IS NOT NULL;

COMMIT;
