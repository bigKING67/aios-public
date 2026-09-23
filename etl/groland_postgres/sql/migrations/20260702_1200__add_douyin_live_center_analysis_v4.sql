BEGIN;

ALTER TABLE ads.douyin_live_session_analysis
  ADD COLUMN IF NOT EXISTS analysis_profile TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS input_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_stage TEXT,
  ADD COLUMN IF NOT EXISTS output_object_key TEXT,
  ADD COLUMN IF NOT EXISTS response_id TEXT,
  ADD COLUMN IF NOT EXISTS usage_json JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN ads.douyin_live_session_analysis.analysis_profile IS
  'V4 分析 profile：auto、l1_text 或 l2_multimodal，用于 worker 决定是否调用多模态视频输入。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.provider IS
  '实际执行分析的模型服务提供方，例如 ark；排队未执行时为空。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.prompt_version IS
  '直播录屏 AI 分析提示词版本；V4 默认写入 v4。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.input_snapshot IS
  'Worker 领取任务时使用的场次、分钟指标和录屏分段输入快照摘要；不得持久化 signed URL 或密钥。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.progress_percent IS
  'AI 分析任务进度百分比，0 到 100；用于前端和运维观察 worker 状态。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.processing_stage IS
  'AI 分析任务当前处理阶段，例如 claimed、loading_context、calling_model、completed、failed。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.output_object_key IS
  '可选：V4 分析完整产物在 TOS 中的对象键；当前可为空。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.response_id IS
  '模型服务返回的 response id，用于排障和成本追踪。';
COMMENT ON COLUMN ads.douyin_live_session_analysis.usage_json IS
  '模型服务返回的 usage/token 统计 JSON；未返回时为空对象。';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_douyin_live_session_analysis_progress_percent'
      AND conrelid = 'ads.douyin_live_session_analysis'::regclass
  ) THEN
    ALTER TABLE ads.douyin_live_session_analysis
      ADD CONSTRAINT chk_douyin_live_session_analysis_progress_percent
      CHECK (progress_percent BETWEEN 0 AND 100);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT chk_douyin_live_session_analysis_progress_percent
  ON ads.douyin_live_session_analysis IS
  'AI 分析进度必须在 0 到 100 之间。';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_douyin_live_session_analysis_profile'
      AND conrelid = 'ads.douyin_live_session_analysis'::regclass
  ) THEN
    ALTER TABLE ads.douyin_live_session_analysis
      ADD CONSTRAINT chk_douyin_live_session_analysis_profile
      CHECK (
        analysis_profile IS NULL
        OR analysis_profile IN ('auto', 'l1_text', 'l2_multimodal')
      );
  END IF;
END;
$$;

COMMENT ON CONSTRAINT chk_douyin_live_session_analysis_profile
  ON ads.douyin_live_session_analysis IS
  'AI 分析 profile 只能为空或为 auto、l1_text、l2_multimodal。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_session_analysis_worker_claim
  ON ads.douyin_live_session_analysis (status, created_at ASC)
  WHERE status IN ('queued', 'running');
COMMENT ON INDEX ads.idx_douyin_live_session_analysis_worker_claim IS
  'Worker 按状态和创建时间领取直播录屏 AI 分析任务的部分索引。';

COMMIT;
