WITH params AS (
  SELECT
    $1::DATE AS stat_month,
    $2::TEXT AS video_type,
    $3::TEXT AS brand_key,
    $4::TEXT AS analysis_source
),
__BRAND_RESOLUTION_CTE__,
scoped_materials AS (
  SELECT DISTINCT material.asset_id
  FROM ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly material
  JOIN params p
    ON material.stat_month = p.stat_month
   AND material.video_type = p.video_type
  __BRAND_RESOLUTION_JOIN__
  WHERE material.asset_id IS NOT NULL
    AND (
      CASE
        WHEN effective_brand.brand_name IS NULL THEN '__unknown'
        ELSE effective_brand.brand_name
      END
    ) = p.brand_key
),
base_asset_ids AS (
  SELECT DISTINCT asset_id
  FROM scoped_materials
),
__LATEST_ANALYSIS_CTE__
SELECT
  asset.asset_id,
  COALESCE(
    JSONB_TYPEOF(latest_analysis.analysis->'video_understanding') = 'object',
    FALSE
  ) AS has_structured_video_understanding,
  COALESCE(
    latest_analysis.analysis IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(asset.analysis_object_key, '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(asset.ai_summary, '')), '') IS NOT NULL
    OR CARDINALITY(COALESCE(asset.ai_suggested_tags, '{}'::TEXT[])) > 0
    OR asset.ai_analyzed_at IS NOT NULL,
    FALSE
  ) AS has_any_ai_analysis,
  NULLIF(BTRIM(COALESCE(asset.analysis_object_key, '')), '') IS NOT NULL AS has_analysis_artifact,
  CASE
    WHEN params.analysis_source = 'preview' THEN asset.preview_object_key IS NOT NULL
    WHEN params.analysis_source = 'raw' THEN asset.raw_object_key IS NOT NULL
    ELSE COALESCE(asset.preview_object_key, asset.raw_object_key) IS NOT NULL
  END AS has_input,
  active_job.status AS active_job_status
FROM base_asset_ids scoped
JOIN ads.marketing_content_assets asset
  ON asset.asset_id = scoped.asset_id
 AND asset.is_deleted = FALSE
 AND asset.external_only = FALSE
 AND asset.asset_type = 'video'
 AND (asset.duration_seconds IS NULL OR asset.duration_seconds < 1800)
CROSS JOIN params
LEFT JOIN latest_analysis ON latest_analysis.asset_id = asset.asset_id
LEFT JOIN LATERAL (
  SELECT job.status
  FROM ads.marketing_content_asset_processing_jobs job
  WHERE job.asset_id = asset.asset_id
    AND job.job_type = 'analysis'
    AND job.status IN ('queued', 'running')
  ORDER BY
    CASE job.status WHEN 'running' THEN 0 ELSE 1 END,
    job.started_at DESC NULLS LAST,
    job.queued_at ASC,
    job.created_at ASC
  LIMIT 1
) active_job ON TRUE
ORDER BY asset.updated_at DESC, asset.created_at DESC, asset.asset_id ASC
