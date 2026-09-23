BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;

CREATE TABLE IF NOT EXISTS ads.douyin_live_session_minute_metrics (
  session_key TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  shop_name TEXT NOT NULL DEFAULT '',
  anchor_douyin_id TEXT NOT NULL,
  anchor_nickname TEXT NOT NULL DEFAULT '',
  live_start_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  live_end_time TIMESTAMP WITHOUT TIME ZONE,
  live_minute_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  minute_offset INTEGER NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  source_row_id BIGINT NOT NULL,
  match_status TEXT NOT NULL,
  match_reason TEXT,
  source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_live_session_minute_metrics
    PRIMARY KEY (session_key, live_minute_time, source_row_id),
  CONSTRAINT chk_douyin_live_session_minute_metrics_minute_offset
    CHECK (minute_offset >= 0),
  CONSTRAINT chk_douyin_live_session_minute_metrics_order_count
    CHECK (order_count >= 0),
  CONSTRAINT chk_douyin_live_session_minute_metrics_match_status
    CHECK (match_status IN ('matched', 'overlap_resolved'))
);

COMMENT ON TABLE ads.douyin_live_session_minute_metrics IS
  '直播中台分钟成交桥接表：将 ods.douyin_livestream_minute_raw 归属到 ads.douyin_live_detail 场次。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.session_key IS
  '场次公开标识，md5(shop_id|anchor_douyin_id|live_start_time)。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.shop_id IS
  '直播场次所属店铺 ID，来自 ads.douyin_live_detail。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.shop_name IS
  '直播场次所属店铺名称，来自 ads.douyin_live_detail。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.anchor_douyin_id IS
  '主播抖音号，用于将分钟数据 live_room_douyin_id 关联到直播场次。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.anchor_nickname IS
  '主播昵称快照，来自 ads.douyin_live_detail。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.live_start_time IS
  '直播场次开始时间，作为分钟归属窗口起点。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.live_end_time IS
  '直播场次结束时间；为空时按 live_duration_minutes 推算归属窗口终点。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.live_minute_time IS
  '分钟级成交指标对应的直播分钟时间，来自 ods.douyin_livestream_minute_raw。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.minute_offset IS
  '当前分钟距离直播开始时间的偏移分钟数，用于录屏时间轴对齐。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.order_count IS
  '当前分钟成交订单数，负值按 0 兜底后入表。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.source_row_id IS
  '来源 ods.douyin_livestream_minute_raw 行 ID，用于追溯分钟原始记录。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.match_status IS
  'matched=唯一命中；overlap_resolved=同主播窗口重叠时按最近开始时间归属。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.match_reason IS
  '分钟行归属到场次的中文原因说明，用于排查唯一命中或重叠消解。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.source_updated_at IS
  '来源分钟原始记录的更新时间，用于排查刷新水位和数据新鲜度。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.created_at IS
  '当前桥接记录创建时间。';
COMMENT ON COLUMN ads.douyin_live_session_minute_metrics.updated_at IS
  '当前桥接记录最近更新时间，由触发器自动维护。';
COMMENT ON CONSTRAINT pk_douyin_live_session_minute_metrics
  ON ads.douyin_live_session_minute_metrics IS
  '分钟桥接表主键：同一场次、同一分钟、同一来源行唯一。';
COMMENT ON CONSTRAINT chk_douyin_live_session_minute_metrics_minute_offset
  ON ads.douyin_live_session_minute_metrics IS
  '分钟偏移必须大于等于 0，避免录屏时间轴出现负偏移。';
COMMENT ON CONSTRAINT chk_douyin_live_session_minute_metrics_order_count
  ON ads.douyin_live_session_minute_metrics IS
  '分钟订单数必须大于等于 0。';
COMMENT ON CONSTRAINT chk_douyin_live_session_minute_metrics_match_status
  ON ads.douyin_live_session_minute_metrics IS
  '归属状态仅允许唯一命中 matched 或重叠消解 overlap_resolved。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_session_minute_metrics_session_time
  ON ads.douyin_live_session_minute_metrics (session_key, live_minute_time);
CREATE INDEX IF NOT EXISTS idx_douyin_live_session_minute_metrics_anchor_time
  ON ads.douyin_live_session_minute_metrics (anchor_douyin_id, live_minute_time);
CREATE INDEX IF NOT EXISTS idx_douyin_live_session_minute_metrics_status
  ON ads.douyin_live_session_minute_metrics (match_status);
COMMENT ON INDEX ads.idx_douyin_live_session_minute_metrics_session_time IS
  '按直播场次和分钟时间读取成交趋势的查询索引。';
COMMENT ON INDEX ads.idx_douyin_live_session_minute_metrics_anchor_time IS
  '按主播抖音号和分钟时间排查分钟归属的查询索引。';
COMMENT ON INDEX ads.idx_douyin_live_session_minute_metrics_status IS
  '按分钟归属状态筛查重叠消解记录的查询索引。';

CREATE TABLE IF NOT EXISTS ads.douyin_live_session_recordings (
  recording_id UUID NOT NULL,
  session_key TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  anchor_douyin_id TEXT NOT NULL,
  live_start_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_douyin_live_session_recordings
    PRIMARY KEY (recording_id),
  CONSTRAINT chk_douyin_live_session_recordings_status
    CHECK (status IN ('active', 'archived', 'deleted'))
);

COMMENT ON TABLE ads.douyin_live_session_recordings IS
  '直播中台录屏集合表。一场直播同一时间只允许一个 active recording set。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.recording_id IS
  '录屏集合主键 UUID，由后端创建。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.session_key IS
  '直播场次公开标识，对应分钟桥接表和前端选中的直播场次。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.shop_id IS
  '直播场次所属店铺 ID 快照，用于上传记录审计。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.anchor_douyin_id IS
  '直播场次主播抖音号快照，用于上传记录审计和排查。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.live_start_time IS
  '直播场次开始时间快照，用于识别录屏对应的直播窗口。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.status IS
  '录屏集合状态：active=当前有效，archived=归档，deleted=逻辑删除。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.created_by_user_id IS
  '创建录屏集合的系统用户 ID；为空表示系统或未识别用户。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.created_at IS
  '录屏集合创建时间。';
COMMENT ON COLUMN ads.douyin_live_session_recordings.updated_at IS
  '录屏集合最近更新时间，由触发器自动维护。';
COMMENT ON CONSTRAINT pk_douyin_live_session_recordings
  ON ads.douyin_live_session_recordings IS
  '录屏集合主键。';
COMMENT ON CONSTRAINT chk_douyin_live_session_recordings_status
  ON ads.douyin_live_session_recordings IS
  '录屏集合状态枚举约束，仅允许 active、archived、deleted。';

CREATE UNIQUE INDEX IF NOT EXISTS ux_douyin_live_session_recordings_active_session
  ON ads.douyin_live_session_recordings (session_key)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_douyin_live_session_recordings_session
  ON ads.douyin_live_session_recordings (session_key, created_at DESC);
COMMENT ON INDEX ads.ux_douyin_live_session_recordings_active_session IS
  '保证同一直播场次同一时间最多只有一个 active 录屏集合。';
COMMENT ON INDEX ads.idx_douyin_live_session_recordings_session IS
  '按直播场次查询录屏集合并按创建时间倒序展示的索引。';

CREATE TABLE IF NOT EXISTS ads.douyin_live_session_recording_segments (
  segment_id UUID NOT NULL,
  recording_id UUID NOT NULL,
  segment_index INTEGER NOT NULL,
  bucket TEXT NOT NULL,
  raw_object_key TEXT NOT NULL,
  preview_object_key TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_ext TEXT,
  file_size_bytes BIGINT,
  sha256 TEXT,
  duration_seconds NUMERIC(12, 3),
  start_offset_seconds NUMERIC(12, 3),
  end_offset_seconds NUMERIC(12, 3),
  upload_status TEXT NOT NULL DEFAULT 'pending',
  processing_status TEXT NOT NULL DEFAULT 'pending',
  uploaded_by_user_id TEXT,
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_douyin_live_session_recording_segments
    PRIMARY KEY (segment_id),
  CONSTRAINT fk_douyin_live_session_recording_segments_recording
    FOREIGN KEY (recording_id)
    REFERENCES ads.douyin_live_session_recordings(recording_id),
  CONSTRAINT chk_douyin_live_session_recording_segments_index
    CHECK (segment_index > 0),
  CONSTRAINT chk_douyin_live_session_recording_segments_file_size
    CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  CONSTRAINT chk_douyin_live_session_recording_segments_duration
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT chk_douyin_live_session_recording_segments_offsets
    CHECK (
      start_offset_seconds IS NULL
      OR end_offset_seconds IS NULL
      OR end_offset_seconds >= start_offset_seconds
    ),
  CONSTRAINT chk_douyin_live_session_recording_segments_upload_status
    CHECK (upload_status IN ('pending', 'uploading', 'uploaded', 'failed', 'deleted')),
  CONSTRAINT chk_douyin_live_session_recording_segments_processing_status
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  CONSTRAINT chk_douyin_live_session_recording_segments_key_prefix
    CHECK (raw_object_key LIKE 'live-recordings/%'),
  CONSTRAINT ux_douyin_live_session_recording_segments_index
    UNIQUE (recording_id, segment_index)
);

COMMENT ON TABLE ads.douyin_live_session_recording_segments IS
  '直播中台录屏分段表。首版不强制合并文件，按 segment 播放。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.segment_id IS
  '录屏分段主键 UUID，由后端创建。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.recording_id IS
  '所属录屏集合 ID，关联 ads.douyin_live_session_recordings。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.segment_index IS
  '录屏分段序号，从 1 开始，同一录屏集合内唯一。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.bucket IS
  'TOS 存储桶名称，用于生成播放和处理访问地址。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.raw_object_key IS
  '原始录屏分段在 TOS 中的对象键，必须位于 live-recordings/ 前缀下。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.preview_object_key IS
  '预览或转码后视频对象键；首版可为空。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.file_name IS
  '用户上传时的原始文件名或前端展示文件名。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.mime_type IS
  '上传文件 MIME 类型，例如 video/mp4。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.file_ext IS
  '上传文件扩展名，用于排查格式和生成对象键。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.file_size_bytes IS
  '上传文件大小，单位字节。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.sha256 IS
  '上传文件 SHA-256 摘要；首版可为空，用于后续去重或完整性校验。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.duration_seconds IS
  '录屏分段时长，单位秒；首版可由前端或后续 worker 回填。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.start_offset_seconds IS
  '该分段相对整场直播开始的起始偏移秒数。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.end_offset_seconds IS
  '该分段相对整场直播开始的结束偏移秒数。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.upload_status IS
  '上传状态：pending=待上传，uploading=上传中，uploaded=已上传，failed=失败，deleted=逻辑删除。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.processing_status IS
  '处理状态：pending=待处理，processing=处理中，ready=可用，failed=失败，skipped=跳过。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.uploaded_by_user_id IS
  '完成上传的系统用户 ID；为空表示系统或未识别用户。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.uploaded_at IS
  '录屏分段上传完成时间。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.created_at IS
  '录屏分段记录创建时间。';
COMMENT ON COLUMN ads.douyin_live_session_recording_segments.updated_at IS
  '录屏分段记录最近更新时间，由触发器自动维护。';
COMMENT ON CONSTRAINT pk_douyin_live_session_recording_segments
  ON ads.douyin_live_session_recording_segments IS
  '录屏分段主键。';
COMMENT ON CONSTRAINT fk_douyin_live_session_recording_segments_recording
  ON ads.douyin_live_session_recording_segments IS
  '录屏分段必须归属于一个录屏集合。';
COMMENT ON CONSTRAINT chk_douyin_live_session_recording_segments_index
  ON ads.douyin_live_session_recording_segments IS
  '录屏分段序号必须从 1 开始。';
COMMENT ON CONSTRAINT chk_douyin_live_session_recording_segments_file_size
  ON ads.douyin_live_session_recording_segments IS
  '上传文件大小为空或大于等于 0。';
COMMENT ON CONSTRAINT chk_douyin_live_session_recording_segments_duration
  ON ads.douyin_live_session_recording_segments IS
  '录屏分段时长为空或大于等于 0。';
COMMENT ON CONSTRAINT chk_douyin_live_session_recording_segments_offsets
  ON ads.douyin_live_session_recording_segments IS
  '录屏结束偏移必须晚于或等于起始偏移。';
COMMENT ON CONSTRAINT chk_douyin_live_session_recording_segments_upload_status
  ON ads.douyin_live_session_recording_segments IS
  '上传状态枚举约束，仅允许 pending、uploading、uploaded、failed、deleted。';
COMMENT ON CONSTRAINT chk_douyin_live_session_recording_segments_processing_status
  ON ads.douyin_live_session_recording_segments IS
  '处理状态枚举约束，仅允许 pending、processing、ready、failed、skipped。';
COMMENT ON CONSTRAINT chk_douyin_live_session_recording_segments_key_prefix
  ON ads.douyin_live_session_recording_segments IS
  '原始录屏对象键必须使用 live-recordings/ 前缀，与素材中台 TOS 路径隔离。';
COMMENT ON CONSTRAINT ux_douyin_live_session_recording_segments_index
  ON ads.douyin_live_session_recording_segments IS
  '同一录屏集合内 segment_index 唯一。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_session_recording_segments_recording
  ON ads.douyin_live_session_recording_segments (recording_id, segment_index);
CREATE INDEX IF NOT EXISTS idx_douyin_live_session_recording_segments_upload_status
  ON ads.douyin_live_session_recording_segments (upload_status, created_at DESC);
COMMENT ON INDEX ads.idx_douyin_live_session_recording_segments_recording IS
  '按录屏集合读取分段列表并按分段序号播放的索引。';
COMMENT ON INDEX ads.idx_douyin_live_session_recording_segments_upload_status IS
  '按上传状态筛查待处理、失败或已上传分段的索引。';

CREATE TABLE IF NOT EXISTS ads.douyin_live_session_analysis (
  analysis_id UUID NOT NULL,
  session_key TEXT NOT NULL,
  recording_id UUID,
  status TEXT NOT NULL DEFAULT 'queued',
  model TEXT,
  analysis_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_douyin_live_session_analysis
    PRIMARY KEY (analysis_id),
  CONSTRAINT fk_douyin_live_session_analysis_recording
    FOREIGN KEY (recording_id)
    REFERENCES ads.douyin_live_session_recordings(recording_id)
    ON DELETE SET NULL,
  CONSTRAINT chk_douyin_live_session_analysis_status
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);

COMMENT ON TABLE ads.douyin_live_session_analysis IS
  '直播中台 AI 分析任务表。v1 只记录手动触发任务状态，不写入假分析内容。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.analysis_id IS
  'AI 分析任务主键 UUID，由后端创建。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.session_key IS
  '被分析的直播场次公开标识。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.recording_id IS
  '分析任务关联的录屏集合 ID；录屏集合删除时置空保留任务审计。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.status IS
  '分析任务状态：queued=排队，running=执行中，succeeded=成功，failed=失败，cancelled=取消。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.model IS
  '本次分析使用的模型或模型配置名称；首版可为空。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.analysis_json IS
  'AI 分析结构化结果或任务元信息 JSON；首版不写入虚构分析内容。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.error_message IS
  '分析失败时的错误信息，用于前端展示和排障。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.created_by_user_id IS
  '创建分析任务的系统用户 ID；为空表示系统或未识别用户。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.created_at IS
  '分析任务创建时间。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.started_at IS
  '分析任务开始执行时间。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.completed_at IS
  '分析任务完成时间，成功、失败或取消时回填。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.updated_at IS
  '分析任务最近更新时间，由触发器自动维护。';
COMMENT ON CONSTRAINT pk_douyin_live_session_analysis
  ON ads.douyin_live_session_analysis IS
  'AI 分析任务主键。';
COMMENT ON CONSTRAINT fk_douyin_live_session_analysis_recording
  ON ads.douyin_live_session_analysis IS
  'AI 分析任务可关联一个直播录屏集合，录屏集合删除时置空。';
COMMENT ON CONSTRAINT chk_douyin_live_session_analysis_status
  ON ads.douyin_live_session_analysis IS
  '分析任务状态枚举约束，仅允许 queued、running、succeeded、failed、cancelled。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_session_analysis_session
  ON ads.douyin_live_session_analysis (session_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_douyin_live_session_analysis_status
  ON ads.douyin_live_session_analysis (status, created_at DESC);
COMMENT ON INDEX ads.idx_douyin_live_session_analysis_session IS
  '按直播场次读取 AI 分析任务历史并按创建时间倒序展示的索引。';
COMMENT ON INDEX ads.idx_douyin_live_session_analysis_status IS
  '按任务状态筛查排队、运行中或失败任务的索引。';

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_live_center_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION ads.fn_touch_douyin_live_center_updated_at() IS
  '直播中台通用更新时间触发器函数：更新记录时自动刷新 updated_at。';

DROP TRIGGER IF EXISTS trg_touch_douyin_live_session_minute_metrics_updated_at
  ON ads.douyin_live_session_minute_metrics;
CREATE TRIGGER trg_touch_douyin_live_session_minute_metrics_updated_at
BEFORE UPDATE ON ads.douyin_live_session_minute_metrics
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_live_center_updated_at();
COMMENT ON TRIGGER trg_touch_douyin_live_session_minute_metrics_updated_at
  ON ads.douyin_live_session_minute_metrics IS
  '分钟成交桥接记录更新时自动刷新 updated_at。';

DROP TRIGGER IF EXISTS trg_touch_douyin_live_session_recordings_updated_at
  ON ads.douyin_live_session_recordings;
CREATE TRIGGER trg_touch_douyin_live_session_recordings_updated_at
BEFORE UPDATE ON ads.douyin_live_session_recordings
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_live_center_updated_at();
COMMENT ON TRIGGER trg_touch_douyin_live_session_recordings_updated_at
  ON ads.douyin_live_session_recordings IS
  '录屏集合记录更新时自动刷新 updated_at。';

DROP TRIGGER IF EXISTS trg_touch_douyin_live_session_recording_segments_updated_at
  ON ads.douyin_live_session_recording_segments;
CREATE TRIGGER trg_touch_douyin_live_session_recording_segments_updated_at
BEFORE UPDATE ON ads.douyin_live_session_recording_segments
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_live_center_updated_at();
COMMENT ON TRIGGER trg_touch_douyin_live_session_recording_segments_updated_at
  ON ads.douyin_live_session_recording_segments IS
  '录屏分段记录更新时自动刷新 updated_at。';

DROP TRIGGER IF EXISTS trg_touch_douyin_live_session_analysis_updated_at
  ON ads.douyin_live_session_analysis;
CREATE TRIGGER trg_touch_douyin_live_session_analysis_updated_at
BEFORE UPDATE ON ads.douyin_live_session_analysis
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_live_center_updated_at();
COMMENT ON TRIGGER trg_touch_douyin_live_session_analysis_updated_at
  ON ads.douyin_live_session_analysis IS
  'AI 分析任务记录更新时自动刷新 updated_at。';

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_live_session_minute_metrics(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  IF to_regclass('ods.douyin_livestream_minute_raw') IS NULL THEN
    RAISE EXCEPTION 'required source table missing: ods.douyin_livestream_minute_raw';
  END IF;

  IF to_regclass('ads.douyin_live_detail') IS NULL THEN
    RAISE EXCEPTION 'required session table missing: ads.douyin_live_detail';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(live_minute_time::DATE)),
    COALESCE(p_end_date, MAX(live_minute_time::DATE))
  INTO v_start_date, v_end_date
  FROM ods.douyin_livestream_minute_raw;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'douyin_live_session_minute_metrics refresh skipped: no minute rows';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'invalid refresh window: % > %', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_live_session_minute_metrics
  WHERE live_minute_time::DATE BETWEEN v_start_date AND v_end_date;

  WITH minute_rows AS (
    SELECT
      m.id AS source_row_id,
      m.live_minute_time,
      BTRIM(COALESCE(m.live_room_douyin_id, '')) AS anchor_douyin_id,
      GREATEST(COALESCE(m.order_count, 0), 0) AS order_count,
      m.updated_at AS source_updated_at
    FROM ods.douyin_livestream_minute_raw m
    WHERE m.live_minute_time::DATE BETWEEN v_start_date AND v_end_date
      AND NULLIF(BTRIM(COALESCE(m.live_room_douyin_id, '')), '') IS NOT NULL
  ),
  live_windows AS (
    SELECT DISTINCT ON (session_key)
      session_key,
      shop_id,
      shop_name,
      anchor_douyin_id,
      anchor_nickname,
      live_start_time,
      live_end_time,
      live_end_boundary
    FROM (
      SELECT
        md5(
          COALESCE(NULLIF(BTRIM(d.shop_id), ''), '')
          || '|'
          || COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '')
          || '|'
          || d.live_start_time::TEXT
        ) AS session_key,
        COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
        COALESCE(NULLIF(BTRIM(d.shop_name), ''), '') AS shop_name,
        COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
        COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '') AS anchor_nickname,
        d.live_start_time,
        d.live_end_time,
        CASE
          WHEN d.live_end_time IS NOT NULL AND d.live_end_time > d.live_start_time
            THEN d.live_end_time
          ELSE d.live_start_time + (GREATEST(COALESCE(d.live_duration_minutes, 0), 1) * INTERVAL '1 minute')
        END AS live_end_boundary,
        d.source_updated_at,
        d.updated_at
      FROM ads.douyin_live_detail d
      WHERE d.live_start_time::DATE <= v_end_date
        AND (
          d.live_end_time::DATE >= v_start_date
          OR (
            d.live_end_time IS NULL
            AND (
              d.live_start_time
              + (GREATEST(COALESCE(d.live_duration_minutes, 0), 1) * INTERVAL '1 minute')
            )::DATE >= v_start_date
          )
        )
        AND NULLIF(BTRIM(COALESCE(d.anchor_douyin_id, '')), '') IS NOT NULL
    ) live_window_source
    ORDER BY session_key, source_updated_at DESC NULLS LAST, updated_at DESC NULLS LAST
  ),
  candidates AS (
    SELECT
      m.source_row_id,
      m.live_minute_time,
      m.order_count,
      m.source_updated_at,
      w.session_key,
      w.shop_id,
      w.shop_name,
      w.anchor_douyin_id,
      w.anchor_nickname,
      w.live_start_time,
      w.live_end_time,
      FLOOR(EXTRACT(EPOCH FROM (m.live_minute_time - w.live_start_time)) / 60)::INTEGER AS minute_offset,
      COUNT(*) OVER (PARTITION BY m.source_row_id) AS match_count,
      ROW_NUMBER() OVER (
        PARTITION BY m.source_row_id
        ORDER BY w.live_start_time DESC, w.live_end_time DESC NULLS LAST, w.shop_id, w.session_key
      ) AS rn
    FROM minute_rows m
    JOIN live_windows w
      ON m.anchor_douyin_id = w.anchor_douyin_id
     AND m.live_minute_time >= w.live_start_time
     AND m.live_minute_time < w.live_end_boundary
  )
  INSERT INTO ads.douyin_live_session_minute_metrics (
    session_key,
    shop_id,
    shop_name,
    anchor_douyin_id,
    anchor_nickname,
    live_start_time,
    live_end_time,
    live_minute_time,
    minute_offset,
    order_count,
    source_row_id,
    match_status,
    match_reason,
    source_updated_at
  )
  SELECT
    session_key,
    shop_id,
    shop_name,
    anchor_douyin_id,
    anchor_nickname,
    live_start_time,
    live_end_time,
    live_minute_time,
    minute_offset,
    order_count,
    source_row_id,
    CASE WHEN match_count > 1 THEN 'overlap_resolved' ELSE 'matched' END AS match_status,
    CASE
      WHEN match_count > 1 THEN '同主播多个直播窗口重叠，按最近 live_start_time 归属'
      ELSE '同主播时间窗口唯一命中'
    END AS match_reason,
    source_updated_at
  FROM candidates
  WHERE rn = 1
    AND minute_offset >= 0
  ON CONFLICT (session_key, live_minute_time, source_row_id) DO UPDATE SET
    shop_id = EXCLUDED.shop_id,
    shop_name = EXCLUDED.shop_name,
    anchor_douyin_id = EXCLUDED.anchor_douyin_id,
    anchor_nickname = EXCLUDED.anchor_nickname,
    live_start_time = EXCLUDED.live_start_time,
    live_end_time = EXCLUDED.live_end_time,
    minute_offset = EXCLUDED.minute_offset,
    order_count = EXCLUDED.order_count,
    match_status = EXCLUDED.match_status,
    match_reason = EXCLUDED.match_reason,
    source_updated_at = EXCLUDED.source_updated_at,
    updated_at = NOW();

  RAISE NOTICE 'douyin_live_session_minute_metrics refreshed for % to %', v_start_date, v_end_date;
END;
$$;
COMMENT ON PROCEDURE ads.refresh_douyin_live_session_minute_metrics(DATE, DATE) IS
  '按日期窗口刷新直播中台分钟成交桥接表，将 ods.douyin_livestream_minute_raw 归属到 ads.douyin_live_detail 直播场次。';

COMMIT;
