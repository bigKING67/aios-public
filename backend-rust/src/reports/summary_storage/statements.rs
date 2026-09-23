pub(super) const WEEKLY_SUMMARY_STORAGE_BOOTSTRAP_STATEMENTS: &[&str] = &[
    r#"
    CREATE TABLE IF NOT EXISTS ads.report_weekly_summary (
        id BIGSERIAL PRIMARY KEY,
        week_period VARCHAR(64) NOT NULL,
        summary_scope VARCHAR(32) NOT NULL DEFAULT 'global',
        summary_text TEXT,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        summary_content_status VARCHAR(32) NOT NULL DEFAULT 'AI_DRAFT',
        summary_updated_by VARCHAR(128),
        summary_approved_by VARCHAR(128),
        summary_approved_at TIMESTAMPTZ,
        summary_published_by VARCHAR(128),
        summary_published_at TIMESTAMPTZ,
        generated_at TIMESTAMPTZ,
        error_msg TEXT,
        task_id VARCHAR(64),
        provider VARCHAR(32),
        model VARCHAR(64),
        prompt_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        facts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        attempt_count INT NOT NULL DEFAULT 0,
        requested_by VARCHAR(128),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    "#,
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS summary_text TEXT",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS summary_scope VARCHAR(32) DEFAULT 'global'",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS status VARCHAR(16)",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS summary_content_status VARCHAR(32) DEFAULT 'AI_DRAFT'",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS summary_updated_by VARCHAR(128)",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS summary_approved_by VARCHAR(128)",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS summary_approved_at TIMESTAMPTZ",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS summary_published_by VARCHAR(128)",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS summary_published_at TIMESTAMPTZ",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS error_msg TEXT",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS task_id VARCHAR(64)",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS provider VARCHAR(32)",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS model VARCHAR(64)",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS prompt_config JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS facts_snapshot JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS requested_by VARCHAR(128)",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE ads.report_weekly_summary ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP",
    "UPDATE ads.report_weekly_summary SET prompt_config = '{}'::jsonb WHERE prompt_config IS NULL",
    "UPDATE ads.report_weekly_summary SET facts_snapshot = '{}'::jsonb WHERE facts_snapshot IS NULL",
    "UPDATE ads.report_weekly_summary SET attempt_count = 0 WHERE attempt_count IS NULL",
    "UPDATE ads.report_weekly_summary SET status = 'PENDING' WHERE status IS NULL OR status = ''",
    "UPDATE ads.report_weekly_summary SET summary_content_status = 'MANUAL_EDITED' WHERE summary_content_status IS NULL AND lower(coalesce(provider, '')) = 'manual'",
    "UPDATE ads.report_weekly_summary SET summary_content_status = 'AI_DRAFT' WHERE summary_content_status IS NULL OR btrim(summary_content_status) = ''",
    "UPDATE ads.report_weekly_summary SET summary_content_status = upper(summary_content_status)",
    "UPDATE ads.report_weekly_summary SET summary_content_status = 'AI_DRAFT' WHERE summary_content_status NOT IN ('AI_DRAFT', 'MANUAL_EDITED', 'APPROVED', 'PUBLISHED')",
    "UPDATE ads.report_weekly_summary SET summary_scope = 'global' WHERE summary_scope IS NULL OR btrim(summary_scope) = ''",
    "UPDATE ads.report_weekly_summary SET summary_scope = lower(summary_scope)",
    "UPDATE ads.report_weekly_summary SET summary_scope = 'global' WHERE summary_scope NOT IN ('global', 'overview', 'tmall')",
    "ALTER TABLE ads.report_weekly_summary ALTER COLUMN summary_content_status SET NOT NULL",
    "ALTER TABLE ads.report_weekly_summary ALTER COLUMN summary_scope SET NOT NULL",
    "ALTER TABLE ads.report_weekly_summary DROP CONSTRAINT IF EXISTS uq_report_weekly_summary_week_period",
    "DROP INDEX IF EXISTS ads.uq_report_weekly_summary_week_period",
    "DROP INDEX IF EXISTS ads.idx_report_weekly_summary_status_updated",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_report_weekly_summary_week_period_scope ON ads.report_weekly_summary (week_period, summary_scope)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_report_weekly_summary_task_id ON ads.report_weekly_summary (task_id) WHERE task_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_scope_status_updated ON ads.report_weekly_summary (summary_scope, status, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_content_status ON ads.report_weekly_summary (summary_content_status, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_generated_at ON ads.report_weekly_summary (generated_at DESC)",
    r#"
    WITH candidate AS (
        SELECT
            id,
            regexp_replace(replace(week_period, '~', '～'), '\s+', '', 'g') AS normalized_week_period,
            lower(coalesce(summary_scope, 'global')) AS normalized_scope
        FROM ads.report_weekly_summary
    ),
    safe_update AS (
        SELECT c.id, c.normalized_week_period
        FROM candidate c
        WHERE c.normalized_week_period <> (
            SELECT week_period
            FROM ads.report_weekly_summary t
            WHERE t.id = c.id
        )
          AND NOT EXISTS (
              SELECT 1
              FROM candidate c2
              WHERE c2.id <> c.id
                AND c2.normalized_week_period = c.normalized_week_period
                AND c2.normalized_scope = c.normalized_scope
          )
    )
    UPDATE ads.report_weekly_summary target
    SET week_period = safe_update.normalized_week_period
    FROM safe_update
    WHERE target.id = safe_update.id
    "#,
];
