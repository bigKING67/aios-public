-- ============================================================================
-- Migration 010: Weekly Summary Scope Hardening
-- ============================================================================
-- Created: 2026-03-03
-- Purpose:
-- 1) 将周报总结唯一键从 week_period 升级到 (week_period, summary_scope)
-- 2) 统一历史 week_period 格式（半角~ / 空白字符）
-- 3) 清理归一化后重复记录，避免“有数据但查不到 / 状态错乱”
-- 4) 补齐 scope/status 相关约束与查询索引

BEGIN;

-- 兼容旧表结构：补齐新版字段
ALTER TABLE ads.report_weekly_summary
    ADD COLUMN IF NOT EXISTS summary_scope VARCHAR(32) DEFAULT 'global';
ALTER TABLE ads.report_weekly_summary
    ADD COLUMN IF NOT EXISTS summary_content_status VARCHAR(32) DEFAULT 'AI_DRAFT';
ALTER TABLE ads.report_weekly_summary
    ADD COLUMN IF NOT EXISTS summary_updated_by VARCHAR(128);
ALTER TABLE ads.report_weekly_summary
    ADD COLUMN IF NOT EXISTS summary_approved_by VARCHAR(128);
ALTER TABLE ads.report_weekly_summary
    ADD COLUMN IF NOT EXISTS summary_approved_at TIMESTAMPTZ;
ALTER TABLE ads.report_weekly_summary
    ADD COLUMN IF NOT EXISTS summary_published_by VARCHAR(128);
ALTER TABLE ads.report_weekly_summary
    ADD COLUMN IF NOT EXISTS summary_published_at TIMESTAMPTZ;

-- 兼容旧数据：补齐默认值并标准化枚举
UPDATE ads.report_weekly_summary
SET prompt_config = '{}'::jsonb
WHERE prompt_config IS NULL;

UPDATE ads.report_weekly_summary
SET facts_snapshot = '{}'::jsonb
WHERE facts_snapshot IS NULL;

UPDATE ads.report_weekly_summary
SET attempt_count = 0
WHERE attempt_count IS NULL;

UPDATE ads.report_weekly_summary
SET summary_scope = 'global'
WHERE summary_scope IS NULL OR btrim(summary_scope) = '';

UPDATE ads.report_weekly_summary
SET summary_scope = lower(summary_scope);

UPDATE ads.report_weekly_summary
SET summary_scope = 'global'
WHERE summary_scope NOT IN ('global', 'overview', 'tmall');

UPDATE ads.report_weekly_summary
SET summary_content_status = 'MANUAL_EDITED'
WHERE summary_content_status IS NULL
  AND lower(coalesce(provider, '')) = 'manual';

UPDATE ads.report_weekly_summary
SET summary_content_status = 'AI_DRAFT'
WHERE summary_content_status IS NULL OR btrim(summary_content_status) = '';

UPDATE ads.report_weekly_summary
SET summary_content_status = upper(summary_content_status);

UPDATE ads.report_weekly_summary
SET summary_content_status = 'AI_DRAFT'
WHERE summary_content_status NOT IN ('AI_DRAFT', 'MANUAL_EDITED', 'APPROVED', 'PUBLISHED');

-- 归一化后去重：同 (normalized_week_period, summary_scope) 保留最可信的一条
WITH ranked AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY
                regexp_replace(replace(week_period, '~', '～'), '\s+', '', 'g'),
                lower(coalesce(summary_scope, 'global'))
            ORDER BY
                CASE upper(coalesce(status, ''))
                    WHEN 'SUCCESS' THEN 4
                    WHEN 'GENERATING' THEN 3
                    WHEN 'PENDING' THEN 2
                    WHEN 'FAILED' THEN 1
                    ELSE 0
                END DESC,
                updated_at DESC NULLS LAST,
                id DESC
        ) AS rn
    FROM ads.report_weekly_summary
)
DELETE FROM ads.report_weekly_summary target
USING ranked
WHERE target.id = ranked.id
  AND ranked.rn > 1;

-- 统一 week_period 到规范格式：去空白 + 半角~转全角～
UPDATE ads.report_weekly_summary
SET week_period = regexp_replace(replace(week_period, '~', '～'), '\s+', '', 'g')
WHERE week_period <> regexp_replace(replace(week_period, '~', '～'), '\s+', '', 'g');

-- 删除旧唯一键（按周唯一），升级为按 scope 隔离
ALTER TABLE ads.report_weekly_summary
    DROP CONSTRAINT IF EXISTS uq_report_weekly_summary_week_period;
DROP INDEX IF EXISTS ads.uq_report_weekly_summary_week_period;

-- 清理旧索引，创建新版索引
DROP INDEX IF EXISTS ads.idx_report_weekly_summary_status_updated;
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_weekly_summary_week_period_scope
    ON ads.report_weekly_summary (week_period, summary_scope);
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_weekly_summary_task_id
    ON ads.report_weekly_summary (task_id)
    WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_scope_status_updated
    ON ads.report_weekly_summary (summary_scope, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_content_status
    ON ads.report_weekly_summary (summary_content_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_generated_at
    ON ads.report_weekly_summary (generated_at DESC);

-- 约束加固
ALTER TABLE ads.report_weekly_summary
    ALTER COLUMN summary_scope SET NOT NULL;
ALTER TABLE ads.report_weekly_summary
    ALTER COLUMN summary_content_status SET NOT NULL;

ALTER TABLE ads.report_weekly_summary
    DROP CONSTRAINT IF EXISTS ck_report_weekly_summary_scope;
ALTER TABLE ads.report_weekly_summary
    ADD CONSTRAINT ck_report_weekly_summary_scope
    CHECK (summary_scope IN ('global', 'overview', 'tmall'));

ALTER TABLE ads.report_weekly_summary
    DROP CONSTRAINT IF EXISTS ck_report_weekly_summary_week_period_normalized;
ALTER TABLE ads.report_weekly_summary
    ADD CONSTRAINT ck_report_weekly_summary_week_period_normalized
    CHECK (week_period = regexp_replace(replace(week_period, '~', '～'), '\s+', '', 'g'));

COMMIT;
