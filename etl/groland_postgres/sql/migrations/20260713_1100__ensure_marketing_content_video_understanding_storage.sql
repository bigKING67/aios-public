CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_video_understanding_jobs (
  job_id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  object_id UUID REFERENCES ads.marketing_content_asset_objects(object_id) ON DELETE SET NULL,
  media_hash TEXT NOT NULL,
  media_url TEXT,
  storage_key TEXT,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  analysis_schema_version TEXT NOT NULL DEFAULT '2.1',
  input_snapshot_hash TEXT,
  cache_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT marketing_content_asset_video_understanding_jobs_status_check
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped'))
);

-- Repair the only known legacy drift shape before creating cache-key indexes.
ALTER TABLE ads.marketing_content_asset_video_understanding_jobs
  ADD COLUMN IF NOT EXISTS input_snapshot_hash TEXT;

ALTER TABLE ads.marketing_content_asset_video_understanding_jobs
  ADD COLUMN IF NOT EXISTS cache_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_asset_video_understanding_job_cache
  ON ads.marketing_content_asset_video_understanding_jobs(
    asset_id,
    media_hash,
    model_name,
    prompt_version,
    analysis_schema_version
  );

CREATE INDEX IF NOT EXISTS idx_content_asset_video_understanding_jobs_cache_key
  ON ads.marketing_content_asset_video_understanding_jobs(cache_key)
  WHERE cache_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_video_understanding_results (
  result_id UUID PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  object_id UUID REFERENCES ads.marketing_content_asset_objects(object_id) ON DELETE SET NULL,
  media_hash TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  analysis_schema_version TEXT NOT NULL DEFAULT '2.1',
  input_snapshot_hash TEXT NOT NULL,
  cache_key TEXT,
  result_json JSONB NOT NULL,
  confidence NUMERIC(8, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ads.marketing_content_asset_video_understanding_results
  ADD COLUMN IF NOT EXISTS cache_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_asset_video_understanding_result_cache
  ON ads.marketing_content_asset_video_understanding_results(
    asset_id,
    media_hash,
    model_name,
    prompt_version,
    analysis_schema_version,
    input_snapshot_hash
  );

CREATE INDEX IF NOT EXISTS idx_content_asset_video_understanding_results_cache_key
  ON ads.marketing_content_asset_video_understanding_results(cache_key)
  WHERE cache_key IS NOT NULL;

COMMENT ON TABLE ads.marketing_content_asset_video_understanding_jobs IS
  '内容资产结构化视频理解任务生命周期与缓存身份。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.job_id IS '任务主键。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.asset_id IS '关联内容资产主键。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.object_id IS '关联的分析结果对象主键。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.media_hash IS '用于缓存身份的视频媒体哈希。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.media_url IS '任务执行时使用的临时媒体地址。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.storage_key IS '任务使用的对象存储键。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.model_name IS '视频理解模型名称。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.prompt_version IS '视频理解提示词版本。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.analysis_schema_version IS '结构化分析协议版本。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.input_snapshot_hash IS '分析输入快照哈希。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.cache_key IS '完整视频理解缓存键。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.status IS '任务状态：pending/running/succeeded/failed/skipped。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.error_message IS '失败或跳过原因。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.started_at IS '任务开始时间。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.finished_at IS '任务结束时间。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_jobs.updated_at IS '记录更新时间。';

COMMENT ON TABLE ads.marketing_content_asset_video_understanding_results IS
  '内容资产结构化视频理解结果与可复用缓存载荷。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.result_id IS '结果主键。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.asset_id IS '关联内容资产主键。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.object_id IS '关联的分析结果对象主键。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.media_hash IS '用于缓存身份的视频媒体哈希。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.model_name IS '生成结果的模型名称。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.prompt_version IS '生成结果的提示词版本。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.analysis_schema_version IS '结构化分析协议版本。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.input_snapshot_hash IS '分析输入快照哈希。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.cache_key IS '完整视频理解缓存键。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.result_json IS '包含 analysis、usage 与输入快照的结构化结果。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.confidence IS '模型输出的可选置信度。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_asset_video_understanding_results.updated_at IS '记录更新时间。';
