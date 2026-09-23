WITH required_ads_columns AS (
  SELECT UNNEST(ARRAY[
    'record_id',
    'stat_month',
    'platform',
    'brand_name',
    'qianchuan_scene',
    'qianchuan_scene_name',
    'video_type',
    'video_type_name',
    'source_rank',
    'video_title',
    'related_product',
    'core_audience',
    'marketing_selling_point',
    'first_publish_date_text',
    'exposure_count',
    'completion_rate',
    'ctr',
    'cvr',
    'play_3s_rate',
    'play_5s_rate',
    'interaction_rate',
    'pvr',
    'archive_status',
    'asset_id',
    'refreshed_at'
  ]) AS column_name
),
required_ods_comments AS (
  SELECT UNNEST(ARRAY[
    'brand_scope_name',
    'qianchuan_scene',
    'qianchuan_scene_name',
    'video_type',
    'video_type_name',
    'raw_interaction_rate',
    'raw_pvr',
    'interaction_rate',
    'pvr',
    'cdn_url',
    'asset_id',
    'tos_object_key',
    'raw_sha256',
    'row_payload'
  ]) AS column_name
),
fixed_brand_dictionary AS (
  SELECT UNNEST(ARRAY[
    '卡诗',
    '欧莱雅PRO',
    '韩束',
    'OKCS',
    'EHD',
    'SPES',
    '馥绿德雅',
    'Off&Relax'
  ]) AS brand_name
),
table_refs AS (
  SELECT
    to_regclass('ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly') AS ads_table_regclass,
    to_regclass('ods.douyin_qianchuan_industry_brand_short_video_material_raw') AS ods_table_regclass,
    to_regclass('ads.marketing_content_asset_brand_resolutions') AS brand_resolution_table_regclass
),
ads_column_status AS (
  SELECT
    COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) AS present_count,
    COUNT(*) AS expected_count
  FROM required_ads_columns required
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'ads'
   AND c.table_name = 'douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly'
   AND c.column_name = required.column_name
),
ods_comment_status AS (
  SELECT
    COUNT(*) FILTER (WHERE d.description IS NOT NULL AND LENGTH(TRIM(d.description)) > 0) AS commented_count,
    COUNT(*) AS expected_count
  FROM required_ods_comments required
  CROSS JOIN table_refs refs
  LEFT JOIN pg_attribute a
    ON a.attrelid = refs.ods_table_regclass
   AND a.attname = required.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
  LEFT JOIN pg_description d
    ON d.objoid = a.attrelid
   AND d.objsubid = a.attnum
)
SELECT
  table_refs.ads_table_regclass IS NOT NULL AS ads_table_exists,
  table_refs.ods_table_regclass IS NOT NULL AS ods_table_exists,
  to_regprocedure('ads.refresh_douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly(date,text)') IS NOT NULL AS refresh_function_exists,
  to_regprocedure('ads.parse_douyin_qianchuan_material_count(text)') IS NOT NULL AS count_parser_exists,
  to_regprocedure('ads.extract_douyin_qianchuan_industry_material_brand(text)') IS NOT NULL AS brand_extractor_exists,
  to_regprocedure('ads.extract_douyin_qianchuan_industry_material_brand_from_evidence(text[])') IS NOT NULL AS brand_evidence_extractor_exists,
  table_refs.brand_resolution_table_regclass IS NOT NULL AS brand_resolution_table_exists,
  ads.extract_douyin_qianchuan_industry_material_brand('off & relax 头皮护理') = 'Off&Relax' AS brand_extractor_normalizes_off_relax,
  ads.extract_douyin_qianchuan_industry_material_brand('欧莱雅 pro 专业沙龙洗护') = '欧莱雅PRO' AS brand_extractor_normalizes_loreal_pro,
  ads.extract_douyin_qianchuan_industry_material_brand('被闺蜜追问的 Spēs 多肽洗发水') = 'SPES' AS brand_extractor_normalizes_spes_diacritic,
  ads.extract_douyin_qianchuan_industry_material_brand('OR清爽洗发水') = 'Off&Relax' AS brand_extractor_normalizes_contextual_or,
  ads.extract_douyin_qianchuan_industry_material_brand('A or B 洗发水对比') IS NULL AS brand_extractor_does_not_guess_from_standalone_or,
  ads.extract_douyin_qianchuan_industry_material_brand('在家染发教程') IS NULL AS brand_extractor_does_not_guess_from_category,
  ads.extract_douyin_qianchuan_industry_material_brand_from_evidence(
    ARRAY['OKCS 与 EHD 对比']
  ) IS NULL AS brand_evidence_extractor_rejects_conflicting_same_source,
  ads.extract_douyin_qianchuan_industry_material_brand_from_evidence(
    ARRAY['黄黑皮闭眼冲', 'OKCS 染发霜包装']
  ) = 'OKCS' AS brand_evidence_extractor_uses_explicit_metadata,
  NOT EXISTS (
    SELECT 1
    FROM ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly material
    LEFT JOIN fixed_brand_dictionary allowed
      ON allowed.brand_name = material.brand_name
    WHERE material.brand_name IS NOT NULL
      AND allowed.brand_name IS NULL
  ) AS ads_brand_name_uses_fixed_dictionary,
  ads_column_status.present_count AS required_ads_column_count,
  ads_column_status.expected_count AS expected_ads_column_count,
  ods_comment_status.commented_count AS required_ods_comment_count,
  ods_comment_status.expected_count AS expected_ods_comment_count
FROM ads_column_status
CROSS JOIN table_refs
CROSS JOIN ods_comment_status;
