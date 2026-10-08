-- Forward-only linkage to the existing renderer. Apply through the ledger.
ALTER TABLE ads.content_production_runs
    DROP CONSTRAINT content_production_runs_status_check,
    ADD CONSTRAINT content_production_runs_status_check
        CHECK (status IN ('queued', 'running', 'waiting', 'paused', 'cancelling', 'cancelled', 'failed', 'succeeded')),
    DROP CONSTRAINT content_production_runs_stage_check,
    ADD CONSTRAINT content_production_runs_stage_check
        CHECK (stage IN ('planning', 'production', 'inspection', 'delivery')),
    ADD COLUMN render_job_id UUID REFERENCES ads.content_production_jobs(job_id),
    ADD COLUMN pause_requested BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT content_production_runs_pause_check CHECK (NOT pause_requested OR status = 'running'),
    ADD CONSTRAINT content_production_runs_delivery_check CHECK (status <> 'succeeded' OR render_job_id IS NOT NULL);

CREATE INDEX content_production_runs_render_active_idx
    ON ads.content_production_runs (updated_at)
    WHERE render_job_id IS NOT NULL AND status IN ('running', 'cancelling');

CREATE TABLE ads.content_production_run_renders (
    run_id UUID NOT NULL REFERENCES ads.content_production_runs(run_id),
    execution_version INTEGER NOT NULL CHECK (execution_version > 0),
    plan_revision INTEGER NOT NULL,
    job_id UUID NOT NULL UNIQUE REFERENCES ads.content_production_jobs(job_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, execution_version),
    FOREIGN KEY (run_id, plan_revision) REFERENCES ads.content_production_plans(run_id, revision)
);
