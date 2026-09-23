CREATE SCHEMA IF NOT EXISTS ads;

COMMENT ON TABLE ods.douyin_qianchuan_industry_brand_short_video_material_raw IS
  '巨量云图千川短视频行业品牌 TOP 素材 ODS 宽表：保留 CSV 指标字段、页面原始载荷、CDN 取证、TOS 归档和内容资产绑定。';

COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.record_id IS
  'ODS 行主键。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.archive_id IS
  '本地下载归档任务 ID，用于串联 CDN 下载、ffprobe、TOS 上传和资产入库。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.source_system IS
  '来源系统，例如 巨量云图。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.source_task_name IS
  '采集任务名称，用于区分带货短视频、直播引流短视频等批次。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.scrape_run_id IS
  '单次采集运行 ID。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.date_label IS
  '页面展示的统计日期标签。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.stat_month IS
  '统计月份，取月份首日。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.date_start IS
  '统计周期开始日期。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.date_end IS
  '统计周期结束日期。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.industry_name IS
  '行业名称。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.brand_scope_name IS
  '品牌筛选名称。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.brand_scope_hash IS
  '品牌筛选口径哈希，用于幂等去重。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.qianchuan_scene IS
  '千川业务场景编码：qianchuan_short_video=千川短视频；qianchuan_live=千川直播。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.qianchuan_scene_name IS
  '千川业务场景中文名。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.video_type IS
  '视频类型：goods_short_video=带货短视频；live_lead_short_video=直播引流短视频。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.video_type_name IS
  '视频类型中文名。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.source_rank IS
  '来源页面榜单排名。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.source_page_number IS
  '来源页面页码。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.source_item_index IS
  '来源页面当前页序号。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.source_page_url IS
  '来源页面 URL，仅用于采集取证。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.video_title IS
  '视频标题。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.related_product IS
  '相关商品或产品。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.core_audience IS
  '核心人群。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.marketing_selling_point IS
  '营销卖点。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.first_publish_date_text IS
  '页面展示的首次发布时间。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.raw_exposure_count IS
  '曝光原始文本。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.raw_completion_rate IS
  '完播率原始文本。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.raw_ctr IS
  'CTR 原始文本。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.raw_cvr IS
  'CVR 原始文本。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.raw_3s_completion_rate IS
  '3S 播放率原始文本。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.raw_5s_completion_rate IS
  '5S 播放率原始文本。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.raw_interaction_rate IS
  '互动率原始文本。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.raw_pvr IS
  'PVR 原始文本。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.completion_rate IS
  '完播率，数值口径为 0-1。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.ctr IS
  '点击率 CTR，数值口径为 0-1。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.cvr IS
  '转化率 CVR，数值口径为 0-1。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.play_3s_rate IS
  '3S 播放率，数值口径为 0-1。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.play_5s_rate IS
  '5S 播放率，数值口径为 0-1。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.interaction_rate IS
  '互动率，数值口径为 0-1。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.pvr IS
  'PVR，数值口径为 0-1。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.source_video_id IS
  '来源平台运行时 videoId，例如云图播放接口 vid；不等同于抖音 aweme_id，不能直接拼抖音视频链接。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.source_material_id IS
  '来源平台素材 ID。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.aweme_id IS
  '抖音 aweme_id；有值时可用于拼接抖音视频页。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.item_id IS
  '来源平台 item_id。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.group_id IS
  '来源平台 group_id。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.douyin_video_url IS
  '可识别出的抖音视频页 URL。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.cdn_url IS
  '采集时获取的视频 CDN 直链，通常会动态失效，仅用于即时下载和取证。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.cdn_status IS
  'CDN 直链获取状态。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.cdn_missing_reason IS
  '未获取 CDN 直链的原因。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.batch_id IS
  'CDN 播放接口批次 ID。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.mapping_confidence IS
  '页面行到 CDN/视频标识映射置信度。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.archive_status IS
  '归档状态：queued/running/succeeded/failed/skipped。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.archive_error IS
  '归档失败错误信息。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.asset_id IS
  '内容素材中台 asset_id；前端可据此跳转素材详情。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.tos_bucket IS
  'TOS bucket。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.tos_object_key IS
  'TOS 对象 key。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.tos_region IS
  'TOS region。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.tos_endpoint IS
  'TOS endpoint。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.raw_sha256 IS
  '下载原始视频文件 SHA256。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.file_ext IS
  '归档文件扩展名。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.mime_type IS
  '归档文件 MIME 类型。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.file_size_bytes IS
  '归档文件字节数。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.duration_seconds IS
  'ffprobe 解析出的视频时长，单位秒。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.width IS
  'ffprobe 解析出的视频宽度。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.height IS
  'ffprobe 解析出的视频高度。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.ffprobe_payload IS
  'ffprobe 原始 JSON 结果。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.row_payload IS
  '页面导出原始行，完整保留 CSV 中文字段和值。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.cdn_evidence IS
  'CDN 接口请求、响应、映射等取证信息。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.request_payload IS
  '采集请求上下文和筛选条件。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.first_seen_at IS
  '首次入库时间。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.archived_at IS
  '归档成功时间。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.failed_at IS
  '归档失败时间。';
COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.updated_at IS
  'ODS 行更新时间。';

CREATE OR REPLACE FUNCTION ads.parse_douyin_qianchuan_material_count(p_value TEXT)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
AS $$
  WITH cleaned AS (
    SELECT NULLIF(REGEXP_REPLACE(COALESCE(p_value, ''), '[^0-9.]', '', 'g'), '') AS numeric_text
  )
  SELECT
    CASE
      WHEN numeric_text IS NULL THEN NULL
      WHEN p_value ~* '亿' THEN ROUND(numeric_text::NUMERIC * 100000000)::BIGINT
      WHEN p_value ~* '万|w' THEN ROUND(numeric_text::NUMERIC * 10000)::BIGINT
      ELSE ROUND(numeric_text::NUMERIC)::BIGINT
    END
  FROM cleaned;
$$;

COMMENT ON FUNCTION ads.parse_douyin_qianchuan_material_count(TEXT) IS
  '解析巨量云图素材数量文本为整数，支持普通数字、万、亿等单位。';

CREATE TABLE IF NOT EXISTS ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly (
  record_id UUID PRIMARY KEY,
  stat_month DATE NOT NULL,
  platform TEXT NOT NULL DEFAULT 'douyin',
  source_system TEXT NOT NULL,
  source_task_name TEXT NOT NULL,
  scrape_run_id TEXT,
  industry_name TEXT,
  brand_name TEXT,
  qianchuan_scene TEXT NOT NULL,
  qianchuan_scene_name TEXT NOT NULL,
  video_type TEXT NOT NULL,
  video_type_name TEXT NOT NULL,
  source_rank INTEGER NOT NULL,
  source_page_number INTEGER,
  source_item_index INTEGER,
  source_page_url TEXT,
  video_title TEXT,
  related_product TEXT,
  core_audience TEXT,
  marketing_selling_point TEXT,
  first_publish_date_text TEXT,
  raw_exposure_count TEXT,
  exposure_count BIGINT,
  completion_rate NUMERIC(18, 8),
  ctr NUMERIC(18, 8),
  cvr NUMERIC(18, 8),
  play_3s_rate NUMERIC(18, 8),
  play_5s_rate NUMERIC(18, 8),
  interaction_rate NUMERIC(18, 8),
  pvr NUMERIC(18, 8),
  source_video_id TEXT,
  source_material_id TEXT,
  aweme_id TEXT,
  item_id TEXT,
  group_id TEXT,
  douyin_video_url TEXT,
  archive_status TEXT NOT NULL,
  asset_id UUID,
  duration_seconds NUMERIC(12, 3),
  width INTEGER,
  height INTEGER,
  source_first_seen_at TIMESTAMPTZ,
  source_archived_at TIMESTAMPTZ,
  source_failed_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly IS
  '行业素材灵感看板 ADS 月表：一行对应 ODS 一条千川行业品牌短视频素材，按月份、品牌、视频类型筛选展示。';

COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.record_id IS
  '来源 ODS 行主键。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.stat_month IS
  '统计月份，取月份首日。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.platform IS
  '平台，当前固定为 douyin。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.brand_name IS
  '品牌名称，来自 ODS brand_scope_name。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.qianchuan_scene_name IS
  '千川场景中文名，例如 千川短视频、千川直播。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.video_type_name IS
  '视频类型中文名，例如 带货短视频、直播引流短视频。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.source_rank IS
  '行业素材榜单排名。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.video_title IS
  '视频标题。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.related_product IS
  '相关产品。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.core_audience IS
  '核心人群。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.marketing_selling_point IS
  '营销卖点。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.first_publish_date_text IS
  '页面展示的首次发布时间。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.exposure_count IS
  '曝光数，基于 ODS raw_exposure_count 解析。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.completion_rate IS
  '完播率，数值口径为 0-1。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.ctr IS
  'CTR，数值口径为 0-1。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.cvr IS
  'CVR，数值口径为 0-1。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.play_3s_rate IS
  '3S 播放率，数值口径为 0-1。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.play_5s_rate IS
  '5S 播放率，数值口径为 0-1。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.interaction_rate IS
  '互动率，数值口径为 0-1。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.pvr IS
  'PVR，数值口径为 0-1。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.asset_id IS
  '内容素材中台 asset_id；用于前端跳转素材详情。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.archive_status IS
  '归档状态。';
COMMENT ON COLUMN ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly.refreshed_at IS
  'ADS 刷新时间。';

CREATE INDEX IF NOT EXISTS idx_qianchuan_industry_material_inspiration_month_type_rank
  ON ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly(
    stat_month,
    video_type,
    source_rank
  );

CREATE INDEX IF NOT EXISTS idx_qianchuan_industry_material_inspiration_month_brand_rank
  ON ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly(
    stat_month,
    brand_name,
    source_rank
  );

CREATE INDEX IF NOT EXISTS idx_qianchuan_industry_material_inspiration_asset
  ON ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly(asset_id)
  WHERE asset_id IS NOT NULL;

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
    raw.brand_scope_name AS brand_name,
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
  '从 ODS 千川行业品牌短视频素材宽表刷新行业素材灵感 ADS 月表；可按月份和视频类型局部刷新。';
