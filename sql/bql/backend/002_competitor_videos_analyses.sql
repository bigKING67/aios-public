-- 竞品爆款：链接型竞品视频与单条拆解（卡 A）。
-- 竞品不进 ads 的自有素材库，混剪候选、片段库与原片列表在结构上碰不到这里。
-- 视频只存抖音引用（aweme_id + 分享链接），播放与分析时现场解析地址；
-- 证据片段与帧存 Garage bql-derived，analyses.evidence_objects 记录其位置。
-- 罗盘榜单、统计快照与日报等罗盘表结构确认后另起迁移。
-- 见 .trellis/tasks/10-20-competitor-hit-analysis/design.md。

CREATE SCHEMA IF NOT EXISTS competitor;

CREATE TABLE competitor.videos (
    aweme_id TEXT PRIMARY KEY,
    share_url TEXT NOT NULL,
    title TEXT,
    author_name TEXT,
    author_id TEXT,
    brand_name TEXT,
    product_category TEXT,
    duration_seconds NUMERIC(10, 3),
    availability TEXT NOT NULL DEFAULT 'unknown',
    source TEXT NOT NULL DEFAULT 'manual',
    notes TEXT,
    created_by TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT videos_aweme_id_check CHECK (aweme_id ~ '^[0-9]{6,32}$'),
    CONSTRAINT videos_share_url_check CHECK (share_url ~ '^https://'),
    CONSTRAINT videos_availability_check CHECK (availability IN ('available', 'removed', 'private', 'unknown')),
    CONSTRAINT videos_source_check CHECK (source IN ('manual', 'compass')),
    CONSTRAINT videos_duration_check CHECK (duration_seconds IS NULL OR duration_seconds > 0)
);

CREATE TABLE competitor.analyses (
    analysis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aweme_id TEXT NOT NULL REFERENCES competitor.videos (aweme_id),
    status TEXT NOT NULL DEFAULT 'queued',
    source_sha256 TEXT,
    input_manifest_hash TEXT,
    model_id TEXT,
    prompt_version TEXT,
    taxonomy_version TEXT,
    card JSONB,
    host_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
    usage JSONB,
    cost_yuan NUMERIC(10, 4),
    attempt INTEGER NOT NULL DEFAULT 0,
    claim_token UUID,
    heartbeat_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    requested_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    CONSTRAINT analyses_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
    CONSTRAINT analyses_sha256_check CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT analyses_manifest_check CHECK (input_manifest_hash IS NULL OR input_manifest_hash ~ '^[a-f0-9]{64}$'),
    -- The worker owns model/prompt/taxonomy versions; a queued row only carries the staged source hash.
    CONSTRAINT analyses_result_check CHECK (status NOT IN ('succeeded', 'partial') OR (card IS NOT NULL AND source_sha256 IS NOT NULL AND input_manifest_hash IS NOT NULL AND model_id IS NOT NULL AND prompt_version IS NOT NULL AND taxonomy_version IS NOT NULL)),
    CONSTRAINT analyses_error_check CHECK (status <> 'failed' OR error_code IS NOT NULL),
    CONSTRAINT analyses_cost_check CHECK (cost_yuan IS NULL OR cost_yuan >= 0),
    CONSTRAINT analyses_arrays_check CHECK (jsonb_typeof(host_errors) = 'array' AND jsonb_typeof(evidence_objects) = 'array')
);

-- One result per identical input: re-requests reuse it instead of paying again.
CREATE UNIQUE INDEX analyses_reuse_key
    ON competitor.analyses (source_sha256, input_manifest_hash, model_id, prompt_version, taxonomy_version)
    WHERE status IN ('succeeded', 'partial');
-- One queued or running analysis per video, so repeat clicks neither download nor pay twice.
CREATE UNIQUE INDEX analyses_active_per_video ON competitor.analyses (aweme_id) WHERE status IN ('queued', 'running');
CREATE INDEX analyses_queue_idx ON competitor.analyses (created_at) WHERE status = 'queued';
CREATE INDEX analyses_video_idx ON competitor.analyses (aweme_id, created_at DESC);

CREATE FUNCTION competitor.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_competitor_videos_touch_updated_at
    BEFORE UPDATE ON competitor.videos
    FOR EACH ROW EXECUTE FUNCTION competitor.touch_updated_at();

COMMENT ON SCHEMA competitor IS '竞品爆款：链接型竞品视频与分析，和 ads 的自有素材物理分开';
COMMENT ON TABLE competitor.videos IS '竞品抖音视频引用：只存 aweme_id 与分享链接，播放与分析时现场解析地址';
COMMENT ON COLUMN competitor.videos.availability IS '最近一次解析结果：available / removed / private / unknown';
COMMENT ON COLUMN competitor.videos.source IS 'manual 手动贴链接；compass 罗盘榜单导入';
COMMENT ON TABLE competitor.analyses IS '单条拆解（卡 A）：每次分析一行，同一输入的成功结果按复用键只保留一份';
COMMENT ON COLUMN competitor.analyses.input_manifest_hash IS '代理视频、钩子片段、音频等模型输入清单的 sha256';
COMMENT ON COLUMN competitor.analyses.host_errors IS '宿主校验错误（引用、时间越界、钩子窗口等），只剔除引用它的部分';
COMMENT ON COLUMN competitor.analyses.evidence_objects IS '证据对象：[{kind: clip|frame, startMs, endMs, bucket, objectKey, sha256}]';
