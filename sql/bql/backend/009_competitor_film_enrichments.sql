-- 竞品爆款：爆款拆解的单条文字提取（场景 → 痛点 → 卖点、背书人名）。
-- 一行 = 对一次分析结果（analysis_id）按一个提示词版本的一次提取；只读卡片里已存的口播、
-- 字幕、宣称、购买犹豫和背书原文，不看视频。VPS 竞品 Worker 空闲时排队并执行，宿主校验
-- 引用与人名原文后写入；统计快照只读 succeeded 行。
-- 见 .trellis/tasks/10-29-hit-breakdown/design.md §1。

CREATE TABLE competitor.film_enrichments (
    enrichment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES competitor.analyses (analysis_id) ON DELETE CASCADE,
    aweme_id TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    model_id TEXT,
    result JSONB,
    host_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    usage JSONB,
    cost_yuan NUMERIC(10, 4),
    attempt INTEGER NOT NULL DEFAULT 0,
    claim_token UUID,
    heartbeat_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    CONSTRAINT film_enrichments_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    CONSTRAINT film_enrichments_result_check CHECK (status <> 'succeeded' OR (result IS NOT NULL AND model_id IS NOT NULL)),
    CONSTRAINT film_enrichments_error_check CHECK (status <> 'failed' OR error_code IS NOT NULL),
    CONSTRAINT film_enrichments_cost_check CHECK (cost_yuan IS NULL OR cost_yuan >= 0),
    CONSTRAINT film_enrichments_errors_check CHECK (jsonb_typeof(host_errors) = 'array'),
    CONSTRAINT film_enrichments_aweme_check CHECK (aweme_id ~ '^[0-9]{6,32}$')
);

-- One extraction per analysis and prompt: a re-analysed video gets a new analysis_id and is queued again.
CREATE UNIQUE INDEX film_enrichments_key ON competitor.film_enrichments (analysis_id, prompt_version);
CREATE INDEX film_enrichments_queue_idx ON competitor.film_enrichments (created_at) WHERE status = 'queued';
CREATE INDEX film_enrichments_daily_idx ON competitor.film_enrichments (started_at) WHERE started_at IS NOT NULL;

COMMENT ON TABLE competitor.film_enrichments IS '爆款拆解单条文字提取：场景痛点与背书人名，宿主校验后供统计快照使用';
COMMENT ON COLUMN competitor.film_enrichments.result IS '{scene_pains:[{scene,pain,selling_point,other_point,audience_tags,evidence_refs}], endorsers:[{name,role,evidence_refs}]}';
COMMENT ON COLUMN competitor.film_enrichments.host_errors IS '宿主校验丢弃的条目 [[severity, path, message]]；整份不合法时 status=failed';
