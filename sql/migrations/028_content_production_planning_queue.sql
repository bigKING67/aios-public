-- Additive queue admission; no API startup DDL and no historical attempt rewrite.
ALTER TABLE ads.content_production_plan_attempts
    DROP CONSTRAINT content_production_plan_attempts_status_check,
    ADD CONSTRAINT content_production_plan_attempts_status_check
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'superseded'));

CREATE INDEX content_production_plan_attempts_pending_idx
    ON ads.content_production_plan_attempts (created_at, attempt_id)
    WHERE status IN ('queued', 'running');
