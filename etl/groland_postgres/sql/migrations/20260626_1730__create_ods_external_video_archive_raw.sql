CREATE SCHEMA IF NOT EXISTS ods;

CREATE TABLE IF NOT EXISTS ods.external_video_archive_raw (
  archive_id UUID PRIMARY KEY,
  source_system TEXT NOT NULL,
  source_task_name TEXT NOT NULL,
  date_label TEXT NOT NULL,
  source_rank INTEGER NOT NULL,
  source_page_number INTEGER,
  source_item_index INTEGER,
  source_page_url TEXT,
  source_video_id TEXT,
  source_material_id TEXT,
  aweme_id TEXT,
  item_id TEXT,
  group_id TEXT,
  video_title TEXT,
  cdn_url TEXT,
  cdn_status TEXT,
  cdn_missing_reason TEXT,
  batch_id TEXT,
  mapping_confidence TEXT,
  row_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  cdn_evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  request_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  archive_status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  asset_id UUID,
  bucket TEXT,
  raw_object_key TEXT,
  raw_sha256 TEXT,
  file_ext TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  duration_seconds NUMERIC(12, 3),
  width INTEGER,
  height INTEGER,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT external_video_archive_raw_status_check
    CHECK (archive_status IN ('queued', 'running', 'succeeded', 'failed', 'skipped'))
);

CREATE OR REPLACE FUNCTION ods.external_video_archive_raw_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_video_archive_raw_touch_updated_at ON ods.external_video_archive_raw;
CREATE TRIGGER trg_external_video_archive_raw_touch_updated_at
BEFORE UPDATE ON ods.external_video_archive_raw
FOR EACH ROW
EXECUTE FUNCTION ods.external_video_archive_raw_touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_video_archive_raw_source_rank
  ON ods.external_video_archive_raw(source_system, source_task_name, date_label, source_rank);

CREATE INDEX IF NOT EXISTS idx_external_video_archive_raw_status
  ON ods.external_video_archive_raw(archive_status, queued_at ASC, first_seen_at ASC);

CREATE INDEX IF NOT EXISTS idx_external_video_archive_raw_asset
  ON ods.external_video_archive_raw(asset_id)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_video_archive_raw_sha256
  ON ods.external_video_archive_raw(raw_sha256)
  WHERE raw_sha256 IS NOT NULL;

COMMENT ON TABLE ods.external_video_archive_raw IS
  '外部视频实时归档 ODS：记录来源行、临时 CDN、归档状态、TOS raw 对象和内容资产绑定。';

COMMENT ON COLUMN ods.external_video_archive_raw.source_video_id IS
  '来源平台运行时 videoId，例如云图播放接口 vid；不等同于抖音 aweme_id，不能直接拼抖音视频链接。';

COMMENT ON COLUMN ods.external_video_archive_raw.aweme_id IS
  '仅在来源明确提供抖音 aweme_id/item_id/group_id 时填充，用于生成或绑定抖音视频链接。';
