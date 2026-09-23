WITH params AS (
  SELECT
    $1::DATE AS stat_month,
    $2::TEXT AS video_type,
    NULLIF(BTRIM($3::TEXT), '') AS requested_brand
),
__BRAND_RESOLUTION_CTE__,
base_all AS (
  SELECT
    material.*,
    CASE
      WHEN effective_brand.brand_name IS NULL THEN '__unknown'
      ELSE effective_brand.brand_name
    END AS brand_key,
    COALESCE(effective_brand.brand_name, '待识别') AS brand_label
  FROM ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly material
  JOIN params p
    ON material.stat_month = p.stat_month
   AND material.video_type = p.video_type
  __BRAND_RESOLUTION_JOIN__
),
brand_option_rows AS (
  SELECT
    base_all.brand_key AS key,
    base_all.brand_label AS label,
    COUNT(*)::BIGINT AS material_count
  FROM base_all
  GROUP BY base_all.brand_key, base_all.brand_label
),
selected_brand AS (
  SELECT
    brand_option_rows.key,
    brand_option_rows.label
  FROM brand_option_rows
  CROSS JOIN params
  WHERE params.requested_brand IS NOT NULL
    AND params.requested_brand <> 'all'
    AND (
      brand_option_rows.key = params.requested_brand
      OR LOWER(brand_option_rows.label) = LOWER(params.requested_brand)
    )
  ORDER BY
    CASE WHEN brand_option_rows.key = params.requested_brand THEN 0 ELSE 1 END,
    brand_option_rows.material_count DESC,
    brand_option_rows.label ASC
  LIMIT 1
)
SELECT
  selected_brand.key,
  selected_brand.label,
  COUNT(base_all.record_id)::BIGINT AS total_materials,
  COUNT(DISTINCT base_all.asset_id) FILTER (WHERE base_all.asset_id IS NOT NULL)::BIGINT AS linked_assets
FROM selected_brand
LEFT JOIN base_all ON base_all.brand_key = selected_brand.key
GROUP BY selected_brand.key, selected_brand.label
