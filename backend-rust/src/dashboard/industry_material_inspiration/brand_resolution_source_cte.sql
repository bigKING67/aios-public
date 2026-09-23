latest_brand_resolution AS (
  SELECT DISTINCT ON (resolution.asset_id)
    resolution.asset_id,
    resolution.brand_name,
    resolution.status,
    resolution.confidence,
    resolution.primary_source,
    resolution.evidence_json,
    resolution.is_manual_override
  FROM ads.marketing_content_asset_brand_resolutions resolution
  JOIN (
    SELECT DISTINCT material.asset_id
    FROM ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly material
    JOIN params p
      ON material.stat_month = p.stat_month
     AND material.video_type = p.video_type
    WHERE material.asset_id IS NOT NULL
  ) scoped_assets ON scoped_assets.asset_id = resolution.asset_id
  ORDER BY
    resolution.asset_id,
    CASE
      WHEN resolution.is_manual_override THEN 0
      WHEN resolution.status = 'recognized'
        AND resolution.brand_name IS NOT NULL
        AND resolution.confidence >= 0.9000 THEN 1
      ELSE 2
    END,
    resolution.resolved_at DESC,
    resolution.updated_at DESC,
    resolution.resolver_version DESC
)
