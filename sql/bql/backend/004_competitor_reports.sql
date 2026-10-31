-- 竞品爆款：总览的 AI 总结与出片指导（批量洞察 B，线上版）。
-- 一行 = 对一个品类 × 时间窗的一次生成请求；由 API 按需排队，VPS 竞品 Worker 生成并做宿主校验。
-- 模型只引用 stat_id 与视频编号，数字由页面从 inputs 里的锁定统计渲染。
-- 见 .trellis/tasks/10-24-competitor-overview-ai-summary/design.md。

CREATE TABLE competitor.reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort TEXT NOT NULL,
    period TEXT NOT NULL,
    input_snapshot TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    requested_by TEXT,
    model_id TEXT,
    inputs JSONB,
    report JSONB,
    issues JSONB NOT NULL DEFAULT '[]'::jsonb,
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
    CONSTRAINT reports_cohort_check CHECK (cohort ~ '^[a-z_]{1,40}$'),
    CONSTRAINT reports_period_check CHECK (period IN ('last7', 'last30', 'all')),
    CONSTRAINT reports_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    CONSTRAINT reports_result_check CHECK (status <> 'succeeded' OR (report IS NOT NULL AND inputs IS NOT NULL AND model_id IS NOT NULL)),
    CONSTRAINT reports_error_check CHECK (status <> 'failed' OR error_code IS NOT NULL),
    CONSTRAINT reports_cost_check CHECK (cost_yuan IS NULL OR cost_yuan >= 0),
    CONSTRAINT reports_issues_check CHECK (jsonb_typeof(issues) = 'array')
);

-- One live or finished report per statistics input and prompt, so repeat clicks never pay twice;
-- a failed one can be requested again.
CREATE UNIQUE INDEX reports_input_key
    ON competitor.reports (cohort, period, input_snapshot, prompt_version)
    WHERE status IN ('queued', 'running', 'succeeded');
CREATE INDEX reports_latest ON competitor.reports (cohort, period, created_at DESC);
CREATE INDEX reports_queue_idx ON competitor.reports (created_at) WHERE status = 'queued';

COMMENT ON TABLE competitor.reports IS '总览 AI 总结与出片指导：按品类 × 时间窗按需生成，宿主校验后展示';
COMMENT ON COLUMN competitor.reports.input_snapshot IS '请求时统计快照的输入指纹；与当前快照不同即「统计已更新」';
COMMENT ON COLUMN competitor.reports.inputs IS 'Worker 生成时的锁定统计行（comp/ours）与视频编号 → analysisId、标题';
COMMENT ON COLUMN competitor.reports.issues IS '宿主校验结果 [[severity, path, message]]；有 error 时 status=failed';
