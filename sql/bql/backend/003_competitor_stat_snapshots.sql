-- 竞品爆款：共性分析统计快照。
-- 一行 = 一个品类（taxonomy 品类 key，或 all）× 一个时间窗的锁定统计；数字由
-- content_production.competitor_analysis.snapshots 按 stats.py 计算，页面与日报只读它。
-- 输入不变（input_snapshot 相同）时只刷新水位与计算时间，不新增行。
-- 见 .trellis/tasks/10-23-competitor-common-stats/design.md。

CREATE TABLE competitor.stat_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort TEXT NOT NULL,
    period TEXT NOT NULL,
    stats_version TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    normalization_version TEXT NOT NULL,
    input_snapshot TEXT NOT NULL,
    source_watermark TEXT NOT NULL,
    films INTEGER NOT NULL,
    families INTEGER NOT NULL,
    payload JSONB NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stat_snapshots_cohort_check CHECK (cohort ~ '^[a-z_]{1,40}$'),
    CONSTRAINT stat_snapshots_period_check CHECK (period IN ('last7', 'last30', 'all')),
    CONSTRAINT stat_snapshots_counts_check CHECK (films >= 0 AND families >= 0 AND families <= films),
    CONSTRAINT stat_snapshots_payload_check CHECK (jsonb_typeof(payload) = 'object')
);

CREATE UNIQUE INDEX stat_snapshots_input_key
    ON competitor.stat_snapshots (cohort, period, stats_version, input_snapshot);

CREATE INDEX stat_snapshots_latest
    ON competitor.stat_snapshots (cohort, period, computed_at DESC);
