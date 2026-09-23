CREATE SCHEMA IF NOT EXISTS ods;

CREATE TABLE IF NOT EXISTS ods.douyin_qianchuan_industry_brand_short_video_material_raw (
  record_id UUID PRIMARY KEY,
  archive_id UUID,
  source_system TEXT NOT NULL,
  source_task_name TEXT NOT NULL,
  scrape_run_id TEXT,
  date_label TEXT NOT NULL,
  stat_month DATE NOT NULL,
  date_start DATE,
  date_end DATE,
  industry_name TEXT,
  brand_scope_name TEXT,
  brand_scope_hash TEXT,
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
  raw_completion_rate TEXT,
  raw_ctr TEXT,
  raw_cvr TEXT,
  raw_3s_completion_rate TEXT,
  raw_5s_completion_rate TEXT,
  raw_interaction_rate TEXT,
  raw_pvr TEXT,
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
  cdn_url TEXT,
  cdn_status TEXT,
  cdn_missing_reason TEXT,
  batch_id TEXT,
  mapping_confidence TEXT,
  archive_status TEXT NOT NULL DEFAULT 'queued',
  archive_error TEXT,
  asset_id UUID,
  tos_bucket TEXT,
  tos_object_key TEXT,
  tos_region TEXT,
  tos_endpoint TEXT,
  raw_sha256 TEXT,
  file_ext TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  duration_seconds NUMERIC(12, 3),
  width INTEGER,
  height INTEGER,
  ffprobe_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  row_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  cdn_evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  request_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT douyin_qianchuan_short_video_archive_status_check
    CHECK (archive_status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  CONSTRAINT douyin_qianchuan_short_video_video_type_check
    CHECK (video_type IN ('goods_short_video', 'live_lead_short_video', 'unknown')),
  CONSTRAINT douyin_qianchuan_short_video_scene_check
    CHECK (qianchuan_scene IN ('qianchuan_short_video', 'qianchuan_live', 'unknown'))
);

CREATE OR REPLACE FUNCTION ods.douyin_qianchuan_industry_brand_short_video_material_raw_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_douyin_qianchuan_short_video_touch_updated_at
  ON ods.douyin_qianchuan_industry_brand_short_video_material_raw;
CREATE TRIGGER trg_douyin_qianchuan_short_video_touch_updated_at
BEFORE UPDATE ON ods.douyin_qianchuan_industry_brand_short_video_material_raw
FOR EACH ROW
EXECUTE FUNCTION ods.douyin_qianchuan_industry_brand_short_video_material_raw_touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_douyin_qianchuan_short_video_source_rank
  ON ods.douyin_qianchuan_industry_brand_short_video_material_raw(
    source_system,
    source_task_name,
    stat_month,
    COALESCE(brand_scope_hash, ''),
    video_type,
    source_rank
  );

CREATE INDEX IF NOT EXISTS idx_douyin_qianchuan_short_video_month_type
  ON ods.douyin_qianchuan_industry_brand_short_video_material_raw(stat_month, video_type, source_rank);

CREATE INDEX IF NOT EXISTS idx_douyin_qianchuan_short_video_archive_status
  ON ods.douyin_qianchuan_industry_brand_short_video_material_raw(archive_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_douyin_qianchuan_short_video_asset
  ON ods.douyin_qianchuan_industry_brand_short_video_material_raw(asset_id)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_douyin_qianchuan_short_video_archive
  ON ods.douyin_qianchuan_industry_brand_short_video_material_raw(archive_id)
  WHERE archive_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_douyin_qianchuan_short_video_sha256
  ON ods.douyin_qianchuan_industry_brand_short_video_material_raw(raw_sha256)
  WHERE raw_sha256 IS NOT NULL;

COMMENT ON TABLE ods.douyin_qianchuan_industry_brand_short_video_material_raw IS
  '巨量云图千川短视频行业品牌 TOP 素材 ODS 宽表：保留 CSV 指标字段，并绑定 CDN 归档、TOS raw 对象和 content asset。';

COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.video_type IS
  '视频类型：goods_short_video=带货短视频；live_lead_short_video=直播引流短视频。';

COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.source_video_id IS
  '来源平台运行时 videoId，例如云图播放接口 vid；不等同于抖音 aweme_id，不能直接拼抖音视频链接。';

COMMENT ON COLUMN ods.douyin_qianchuan_industry_brand_short_video_material_raw.row_payload IS
  '页面导出原始行，完整保留 CSV 中文字段和值。';
