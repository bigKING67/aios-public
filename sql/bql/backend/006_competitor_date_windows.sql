-- 竞品爆款：日 / 月 / 年 / 自定义时间范围。
-- period 从固定的 last7 / last30 / all 扩成窗口键：all，或 YYYY-MM-DD..YYYY-MM-DD（自然日历窗口，首尾都含）。
-- last7 / last30 仍允许，留给旧行与回滚；新代码不再写。唯一键与索引不变。
-- stat_requests：页面要了一个还没算过的窗口，由 VPS 竞品 Worker 计算后删除。
-- 见 .trellis/tasks/10-26-competitor-date-range/design.md（D1）。

ALTER TABLE competitor.stat_snapshots DROP CONSTRAINT stat_snapshots_period_check;
ALTER TABLE competitor.stat_snapshots ADD CONSTRAINT stat_snapshots_period_check
    CHECK (period IN ('last7', 'last30', 'all') OR period ~ '^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$');

ALTER TABLE competitor.reports DROP CONSTRAINT reports_period_check;
ALTER TABLE competitor.reports ADD CONSTRAINT reports_period_check
    CHECK (period IN ('last7', 'last30', 'all') OR period ~ '^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$');

CREATE TABLE competitor.stat_requests (
    cohort TEXT NOT NULL,
    period TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cohort, period),
    CONSTRAINT stat_requests_cohort_check CHECK (cohort ~ '^[a-z_]{1,40}$'),
    CONSTRAINT stat_requests_period_check CHECK (period ~ '^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$')
);
