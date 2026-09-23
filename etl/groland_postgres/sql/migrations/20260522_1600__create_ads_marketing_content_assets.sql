CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS ods;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS dws;

CREATE TABLE IF NOT EXISTS ads.marketing_content_assets (
  asset_id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'video',
  asset_status TEXT NOT NULL DEFAULT 'pending_processing',
  profile_status TEXT NOT NULL DEFAULT 'incomplete',
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  source_type TEXT NOT NULL DEFAULT 'manual_upload',
  source_platform TEXT,
  source_url TEXT,
  source_record_id TEXT,
  source_sheet_id TEXT,
  source_sheet_name TEXT,
  source_row_index INTEGER,
  external_only BOOLEAN NOT NULL DEFAULT FALSE,
  bucket TEXT NOT NULL DEFAULT 'content-video-prod',
  raw_object_key TEXT,
  preview_object_key TEXT,
  cover_object_key TEXT,
  transcript_object_key TEXT,
  analysis_object_key TEXT,
  raw_sha256 TEXT,
  file_ext TEXT,
  mime_type TEXT,
  duration_seconds NUMERIC(12, 3),
  width INTEGER,
  height INTEGER,
  file_size_bytes BIGINT,
  preview_size_bytes BIGINT,
  platform TEXT,
  product_name TEXT,
  creator_name TEXT,
  owner_name TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  authorization_status TEXT NOT NULL DEFAULT 'unknown',
  commercial_use_allowed BOOLEAN,
  repurpose_allowed BOOLEAN,
  authorization_starts_at DATE,
  authorization_expires_at DATE,
  authorization_notes TEXT,
  ai_summary TEXT,
  ai_score NUMERIC(5, 2),
  ai_analysis_source TEXT,
  ai_analysis_model TEXT,
  ai_analyzed_at TIMESTAMPTZ,
  roi NUMERIC(12, 4),
  ctr NUMERIC(12, 6),
  cvr NUMERIC(12, 6),
  spend NUMERIC(14, 2),
  gmv NUMERIC(14, 2),
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT marketing_content_assets_asset_type_check
    CHECK (asset_type IN ('video', 'image', 'document', 'other')),
  CONSTRAINT marketing_content_assets_asset_status_check
    CHECK (asset_status IN (
      'external_only',
      'uploading',
      'pending_processing',
      'processing',
      'ready',
      'failed',
      'archived'
    )),
  CONSTRAINT marketing_content_assets_profile_status_check
    CHECK (profile_status IN (
      'incomplete',
      'basic_complete',
      'platform_bound',
      'performance_ready',
      'verified'
    )),
  CONSTRAINT marketing_content_assets_lifecycle_status_check
    CHECK (lifecycle_status IN (
      'draft',
      'waiting_analysis',
      'testable',
      'testing',
      'scaling',
      'repurpose',
      'rejected',
      'expired'
    )),
  CONSTRAINT marketing_content_assets_authorization_status_check
    CHECK (authorization_status IN (
      'unknown',
      'authorized',
      'pending',
      'expired',
      'restricted'
    )),
  CONSTRAINT marketing_content_assets_ai_analysis_source_check
    CHECK (ai_analysis_source IS NULL OR ai_analysis_source IN (
      'preview',
      'raw',
      'auto'
    ))
);

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_objects (
  object_id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  object_role TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'tos',
  bucket TEXT NOT NULL DEFAULT 'content-video-prod',
  region TEXT,
  object_key TEXT NOT NULL,
  content_type TEXT,
  file_ext TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  etag TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC(12, 3),
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_asset_objects_role_check
    CHECK (object_role IN ('raw', 'preview', 'cover', 'frame', 'transcript', 'analysis')),
  CONSTRAINT marketing_content_asset_objects_status_check
    CHECK (status IN ('active', 'missing', 'deleted', 'failed'))
);

CREATE TABLE IF NOT EXISTS ads.marketing_content_platform_videos (
  platform_video_id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_id TEXT,
  account_name TEXT,
  advertiser_id TEXT,
  external_video_id TEXT,
  external_item_id TEXT,
  external_note_id TEXT,
  external_url TEXT,
  publish_title TEXT,
  publish_cover_url TEXT,
  publish_status TEXT NOT NULL DEFAULT 'unknown',
  published_at TIMESTAMPTZ,
  relation_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'manual',
  confidence NUMERIC(5, 2),
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_platform_videos_relation_status_check
    CHECK (relation_status IN ('active', 'pending_confirm', 'rejected', 'archived')),
  CONSTRAINT marketing_content_platform_videos_source_check
    CHECK (source IN ('manual', 'api_upload', 'api_import', 'report_import', 'fuzzy_match_confirmed'))
);

CREATE TABLE IF NOT EXISTS ads.marketing_content_ad_materials (
  ad_material_id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  platform_video_id UUID REFERENCES ads.marketing_content_platform_videos(platform_video_id) ON DELETE SET NULL,
  ad_platform TEXT NOT NULL,
  account_id TEXT,
  account_name TEXT,
  advertiser_id TEXT,
  external_material_id TEXT NOT NULL,
  external_video_id TEXT,
  material_name TEXT,
  material_title TEXT,
  material_cover_url TEXT,
  material_status TEXT NOT NULL DEFAULT 'unknown',
  created_at_on_platform TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  relation_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'manual',
  confidence NUMERIC(5, 2),
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_ad_materials_relation_status_check
    CHECK (relation_status IN ('active', 'pending_confirm', 'rejected', 'archived')),
  CONSTRAINT marketing_content_ad_materials_source_check
    CHECK (source IN ('manual', 'api_upload', 'api_import', 'report_import', 'fuzzy_match_confirmed'))
);

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_sources (
  source_id BIGSERIAL PRIMARY KEY,
  asset_id UUID REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  source_url TEXT,
  source_title TEXT,
  feishu_file_token TEXT,
  feishu_spreadsheet_token TEXT,
  feishu_sheet_id TEXT,
  feishu_sheet_name TEXT,
  feishu_row_index INTEGER,
  feishu_cell_ref TEXT,
  external_platform TEXT,
  external_status TEXT NOT NULL DEFAULT 'pending_manual_upload',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_asset_sources_source_kind_check
    CHECK (source_kind IN ('feishu_attachment', 'baidu_netdisk', 'douyin_link', 'feishu_link', 'manual_upload', 'other')),
  CONSTRAINT marketing_content_asset_sources_external_status_check
    CHECK (external_status IN ('ingested', 'pending_manual_upload', 'ignored', 'failed'))
);

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_import_runs (
  run_id UUID PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  source_url TEXT NOT NULL,
  spreadsheet_token TEXT,
  sheet_ids TEXT[] NOT NULL DEFAULT '{}',
  dry_run_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  total_rows INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  uploaded_count INTEGER NOT NULL DEFAULT 0,
  external_only_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  requested_by TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_asset_import_runs_mode_check
    CHECK (mode IN ('dry_run', 'sample_upload', 'full_upload')),
  CONSTRAINT marketing_content_asset_import_runs_status_check
    CHECK (status IN ('requested', 'running', 'succeeded', 'failed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_processing_jobs (
  job_id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  input_object_key TEXT,
  output_object_key TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_asset_processing_jobs_job_type_check
    CHECK (job_type IN ('preview', 'cover', 'frames', 'transcript', 'analysis')),
  CONSTRAINT marketing_content_asset_processing_jobs_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_events (
  event_id BIGSERIAL PRIMARY KEY,
  asset_id UUID REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT,
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION ads.marketing_content_assets_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketing_content_assets_touch_updated_at ON ads.marketing_content_assets;
CREATE TRIGGER trg_marketing_content_assets_touch_updated_at
BEFORE UPDATE ON ads.marketing_content_assets
FOR EACH ROW
EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_content_asset_sources_touch_updated_at ON ads.marketing_content_asset_sources;
CREATE TRIGGER trg_marketing_content_asset_sources_touch_updated_at
BEFORE UPDATE ON ads.marketing_content_asset_sources
FOR EACH ROW
EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_content_asset_objects_touch_updated_at ON ads.marketing_content_asset_objects;
CREATE TRIGGER trg_marketing_content_asset_objects_touch_updated_at
BEFORE UPDATE ON ads.marketing_content_asset_objects
FOR EACH ROW
EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_content_platform_videos_touch_updated_at ON ads.marketing_content_platform_videos;
CREATE TRIGGER trg_marketing_content_platform_videos_touch_updated_at
BEFORE UPDATE ON ads.marketing_content_platform_videos
FOR EACH ROW
EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_content_ad_materials_touch_updated_at ON ads.marketing_content_ad_materials;
CREATE TRIGGER trg_marketing_content_ad_materials_touch_updated_at
BEFORE UPDATE ON ads.marketing_content_ad_materials
FOR EACH ROW
EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_content_asset_import_runs_touch_updated_at ON ads.marketing_content_asset_import_runs;
CREATE TRIGGER trg_marketing_content_asset_import_runs_touch_updated_at
BEFORE UPDATE ON ads.marketing_content_asset_import_runs
FOR EACH ROW
EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_content_asset_processing_jobs_touch_updated_at ON ads.marketing_content_asset_processing_jobs;
CREATE TRIGGER trg_marketing_content_asset_processing_jobs_touch_updated_at
BEFORE UPDATE ON ads.marketing_content_asset_processing_jobs
FOR EACH ROW
EXECUTE FUNCTION ads.marketing_content_assets_touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_assets_raw_sha256_active
  ON ads.marketing_content_assets(raw_sha256)
  WHERE raw_sha256 IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_status
  ON ads.marketing_content_assets(asset_status, profile_status, lifecycle_status)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_platform
  ON ads.marketing_content_assets(platform)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_product
  ON ads.marketing_content_assets(product_name)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_creator
  ON ads.marketing_content_assets(creator_name)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_tags
  ON ads.marketing_content_assets USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_updated_at
  ON ads.marketing_content_assets(updated_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_content_assets_ai_analysis
  ON ads.marketing_content_assets(ai_analysis_source, ai_analyzed_at DESC)
  WHERE is_deleted = FALSE AND analysis_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_sources_asset_id
  ON ads.marketing_content_asset_sources(asset_id);

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_sources_feishu_file_token
  ON ads.marketing_content_asset_sources(feishu_file_token)
  WHERE feishu_file_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_asset_objects_unique_active
  ON ads.marketing_content_asset_objects(asset_id, object_role, object_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_objects_asset
  ON ads.marketing_content_asset_objects(asset_id, object_role);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_platform_videos_video_active
  ON ads.marketing_content_platform_videos(
    platform,
    COALESCE(account_id, ''),
    COALESCE(external_video_id, ''),
    COALESCE(external_item_id, ''),
    COALESCE(external_note_id, '')
  )
  WHERE relation_status = 'active'
    AND COALESCE(
      NULLIF(external_video_id, ''),
      NULLIF(external_item_id, ''),
      NULLIF(external_note_id, '')
    ) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_content_platform_videos_asset
  ON ads.marketing_content_platform_videos(asset_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_ad_materials_material_active
  ON ads.marketing_content_ad_materials(ad_platform, COALESCE(account_id, ''), external_material_id)
  WHERE relation_status = 'active';

CREATE INDEX IF NOT EXISTS idx_marketing_content_ad_materials_asset
  ON ads.marketing_content_ad_materials(asset_id);

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_import_runs_created_at
  ON ads.marketing_content_asset_import_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_processing_jobs_asset_status
  ON ads.marketing_content_asset_processing_jobs(asset_id, status);

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_processing_jobs_queue
  ON ads.marketing_content_asset_processing_jobs(job_type, queued_at ASC, created_at ASC)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_events_asset_created
  ON ads.marketing_content_asset_events(asset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ods.qianchuan_material_daily_report_raw (
  ingest_id UUID NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'qianchuan',
  report_type TEXT NOT NULL DEFAULT 'material_daily',
  stat_date DATE NOT NULL,
  advertiser_id TEXT,
  account_id TEXT,
  account_name TEXT,
  external_material_id TEXT,
  external_video_id TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  ad_group_id TEXT,
  ad_group_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  raw_impressions TEXT,
  raw_clicks TEXT,
  raw_ctr TEXT,
  raw_conversions TEXT,
  raw_cvr TEXT,
  raw_cost TEXT,
  raw_gmv TEXT,
  raw_roi TEXT,
  raw_live_room_entries TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  raw_payload_hash TEXT NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ods.douyin_video_daily_report_raw (
  ingest_id UUID NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'douyin',
  report_type TEXT NOT NULL DEFAULT 'video_daily',
  stat_date DATE NOT NULL,
  account_id TEXT,
  account_name TEXT,
  external_video_id TEXT,
  external_item_id TEXT,
  external_url TEXT,
  raw_play_count TEXT,
  raw_like_count TEXT,
  raw_comment_count TEXT,
  raw_share_count TEXT,
  raw_follow_count TEXT,
  raw_completion_rate TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  raw_payload_hash TEXT NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ods.xhs_note_daily_report_raw (
  ingest_id UUID NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'xhs',
  report_type TEXT NOT NULL DEFAULT 'note_daily',
  stat_date DATE NOT NULL,
  account_id TEXT,
  account_name TEXT,
  external_note_id TEXT,
  external_item_id TEXT,
  external_url TEXT,
  raw_impressions TEXT,
  raw_reads TEXT,
  raw_likes TEXT,
  raw_collects TEXT,
  raw_comments TEXT,
  raw_shares TEXT,
  raw_follows TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  raw_payload_hash TEXT NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dwd.marketing_content_ad_material_stats_di (
  stat_date DATE NOT NULL,
  source_system TEXT NOT NULL,
  ad_platform TEXT NOT NULL,
  account_id TEXT,
  account_name TEXT,
  advertiser_id TEXT,
  external_material_id TEXT NOT NULL,
  external_video_id TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  ad_group_id TEXT,
  ad_group_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  asset_id UUID,
  platform_video_id UUID,
  ad_material_id UUID,
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  impressions BIGINT,
  clicks BIGINT,
  ctr NUMERIC(12, 6),
  conversions BIGINT,
  cvr NUMERIC(12, 6),
  cost NUMERIC(14, 2),
  gmv NUMERIC(14, 2),
  roi NUMERIC(12, 4),
  live_room_entries BIGINT,
  live_room_entry_rate NUMERIC(12, 6),
  transaction_cost NUMERIC(14, 2),
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  follows BIGINT,
  source_ingest_id UUID,
  source_row_hash TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_ad_material_stats_di_match_status_check
    CHECK (match_status IN ('matched', 'unmatched', 'pending_confirm', 'ambiguous'))
);

CREATE TABLE IF NOT EXISTS dwd.marketing_content_platform_video_stats_di (
  stat_date DATE NOT NULL,
  source_system TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT,
  account_name TEXT,
  external_video_id TEXT,
  external_item_id TEXT,
  external_note_id TEXT,
  external_url TEXT,
  asset_id UUID,
  platform_video_id UUID,
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  impressions BIGINT,
  plays BIGINT,
  reads BIGINT,
  clicks BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  collects BIGINT,
  follows BIGINT,
  completion_rate NUMERIC(12, 6),
  avg_watch_seconds NUMERIC(12, 3),
  source_ingest_id UUID,
  source_row_hash TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_platform_video_stats_di_match_status_check
    CHECK (match_status IN ('matched', 'unmatched', 'pending_confirm', 'ambiguous'))
);

CREATE TABLE IF NOT EXISTS dws.marketing_content_asset_daily_summary (
  stat_date DATE NOT NULL,
  asset_id UUID NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  account_id TEXT NOT NULL DEFAULT '',
  account_name TEXT,
  product_name TEXT,
  creator_name TEXT,
  material_count INTEGER NOT NULL DEFAULT 0,
  video_count INTEGER NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  plays BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gmv NUMERIC(14, 2) NOT NULL DEFAULT 0,
  roi NUMERIC(12, 4),
  ctr NUMERIC(12, 6),
  cvr NUMERIC(12, 6),
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  collects BIGINT NOT NULL DEFAULT 0,
  follows BIGINT NOT NULL DEFAULT 0,
  live_room_entries BIGINT NOT NULL DEFAULT 0,
  live_room_entry_rate NUMERIC(12, 6),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (stat_date, asset_id, platform, account_id)
);

CREATE TABLE IF NOT EXISTS dws.marketing_content_asset_lifetime_summary (
  asset_id UUID PRIMARY KEY,
  first_stat_date DATE,
  last_stat_date DATE,
  platform_count INTEGER NOT NULL DEFAULT 0,
  account_count INTEGER NOT NULL DEFAULT 0,
  material_count INTEGER NOT NULL DEFAULT 0,
  video_count INTEGER NOT NULL DEFAULT 0,
  total_impressions BIGINT NOT NULL DEFAULT 0,
  total_plays BIGINT NOT NULL DEFAULT 0,
  total_clicks BIGINT NOT NULL DEFAULT 0,
  total_conversions BIGINT NOT NULL DEFAULT 0,
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_gmv NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_roi NUMERIC(12, 4),
  last_7d_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  last_7d_gmv NUMERIC(14, 2) NOT NULL DEFAULT 0,
  last_7d_roi NUMERIC(12, 4),
  last_30d_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  last_30d_gmv NUMERIC(14, 2) NOT NULL DEFAULT 0,
  last_30d_roi NUMERIC(12, 4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ods_qianchuan_material_daily_report_raw_date
  ON ods.qianchuan_material_daily_report_raw(stat_date);
CREATE INDEX IF NOT EXISTS idx_ods_qianchuan_material_daily_report_raw_material
  ON ods.qianchuan_material_daily_report_raw(external_material_id);
CREATE INDEX IF NOT EXISTS idx_ods_douyin_video_daily_report_raw_video
  ON ods.douyin_video_daily_report_raw(external_video_id);
CREATE INDEX IF NOT EXISTS idx_ods_xhs_note_daily_report_raw_note
  ON ods.xhs_note_daily_report_raw(external_note_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dwd_marketing_content_ad_material_stats_di_unique
  ON dwd.marketing_content_ad_material_stats_di (
    ad_platform,
    COALESCE(account_id, ''),
    external_material_id,
    stat_date,
    COALESCE(campaign_id, ''),
    COALESCE(ad_group_id, ''),
    COALESCE(ad_id, '')
  );
CREATE INDEX IF NOT EXISTS idx_dwd_marketing_content_ad_material_stats_di_asset_date
  ON dwd.marketing_content_ad_material_stats_di(asset_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_dwd_marketing_content_platform_video_stats_di_asset_date
  ON dwd.marketing_content_platform_video_stats_di(asset_id, stat_date);
