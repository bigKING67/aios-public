CREATE OR REPLACE FUNCTION ads.extract_douyin_qianchuan_industry_material_brand(
  p_video_title TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT NULLIF(BTRIM(COALESCE(p_video_title, '')), '') AS title
  )
  SELECT
    CASE
      WHEN title IS NULL THEN NULL
      WHEN title ~* '卡诗' THEN '卡诗'
      WHEN title ~* '欧莱雅[[:space:]]*PRO'
        OR title ~* 'l[''’]?oreal[[:space:]]*pro' THEN '欧莱雅PRO'
      WHEN title ~* '韩束' THEN '韩束'
      WHEN title ~* 'OKCS' THEN 'OKCS'
      WHEN title ~* 'EHD' THEN 'EHD'
      WHEN title ~* 'SPES' OR title ~* '诗裴丝' THEN 'SPES'
      WHEN title ~* '馥绿德雅' THEN '馥绿德雅'
      WHEN title ~* 'off[[:space:]]*(&|and)?[[:space:]]*relax' THEN 'Off&Relax'
      ELSE NULL
    END
  FROM normalized;
$$;

COMMENT ON FUNCTION ads.extract_douyin_qianchuan_industry_material_brand(TEXT) IS
  '从行业素材视频标题提取业务品牌，仅返回固定 8 品牌：卡诗、欧莱雅PRO、韩束、OKCS、EHD、SPES、馥绿德雅、Off&Relax；无法识别返回 NULL。';

COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.brand_name IS
  '业务品牌名称，从 video_title 按固定 8 品牌词典提取；无法识别时为空。来源页面品牌筛选口径保留在 ODS brand_scope_name。';

CREATE OR REPLACE FUNCTION ads.refresh_douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly(
  p_stat_month DATE DEFAULT NULL,
  p_video_type TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  DELETE FROM ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly target
  WHERE (p_stat_month IS NULL OR target.stat_month = DATE_TRUNC('month', p_stat_month)::DATE)
    AND (p_video_type IS NULL OR target.video_type = p_video_type);

  INSERT INTO ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly (
    record_id,
    stat_month,
    platform,
    source_system,
    source_task_name,
    scrape_run_id,
    industry_name,
    brand_name,
    qianchuan_scene,
    qianchuan_scene_name,
    video_type,
    video_type_name,
    source_rank,
    source_page_number,
    source_item_index,
    source_page_url,
    video_title,
    related_product,
    core_audience,
    marketing_selling_point,
    first_publish_date_text,
    raw_exposure_count,
    exposure_count,
    completion_rate,
    ctr,
    cvr,
    play_3s_rate,
    play_5s_rate,
    interaction_rate,
    pvr,
    source_video_id,
    source_material_id,
    aweme_id,
    item_id,
    group_id,
    douyin_video_url,
    archive_status,
    asset_id,
    duration_seconds,
    width,
    height,
    source_first_seen_at,
    source_archived_at,
    source_failed_at,
    source_updated_at,
    refreshed_at
  )
  SELECT
    raw.record_id,
    DATE_TRUNC('month', raw.stat_month)::DATE AS stat_month,
    'douyin' AS platform,
    raw.source_system,
    raw.source_task_name,
    raw.scrape_run_id,
    raw.industry_name,
    ads.extract_douyin_qianchuan_industry_material_brand(raw.video_title) AS brand_name,
    raw.qianchuan_scene,
    raw.qianchuan_scene_name,
    raw.video_type,
    raw.video_type_name,
    raw.source_rank,
    raw.source_page_number,
    raw.source_item_index,
    raw.source_page_url,
    raw.video_title,
    raw.related_product,
    raw.core_audience,
    raw.marketing_selling_point,
    raw.first_publish_date_text,
    raw.raw_exposure_count,
    ads.parse_douyin_qianchuan_material_count(raw.raw_exposure_count) AS exposure_count,
    raw.completion_rate,
    raw.ctr,
    raw.cvr,
    raw.play_3s_rate,
    raw.play_5s_rate,
    raw.interaction_rate,
    raw.pvr,
    raw.source_video_id,
    raw.source_material_id,
    raw.aweme_id,
    raw.item_id,
    raw.group_id,
    raw.douyin_video_url,
    raw.archive_status,
    raw.asset_id,
    raw.duration_seconds,
    raw.width,
    raw.height,
    raw.first_seen_at,
    raw.archived_at,
    raw.failed_at,
    raw.updated_at,
    CURRENT_TIMESTAMP
  FROM ods.douyin_qianchuan_industry_brand_short_video_material_raw raw
  WHERE (p_stat_month IS NULL OR raw.stat_month = DATE_TRUNC('month', p_stat_month)::DATE)
    AND (p_video_type IS NULL OR raw.video_type = p_video_type);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION ads.refresh_douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly(DATE, TEXT) IS
  '从 ODS 千川行业品牌短视频素材宽表刷新行业素材灵感 ADS 月表；品牌字段由视频标题固定词典提取，可按月份和视频类型局部刷新。';

UPDATE ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly target
SET
  brand_name = ads.extract_douyin_qianchuan_industry_material_brand(target.video_title),
  refreshed_at = CURRENT_TIMESTAMP
WHERE target.brand_name IS DISTINCT FROM ads.extract_douyin_qianchuan_industry_material_brand(target.video_title);
