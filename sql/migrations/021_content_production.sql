-- Additive only. Apply through the migration ledger, never on API startup.
CREATE TABLE ads.content_production_projects (
    project_id UUID PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX content_production_projects_owner_idx
    ON ads.content_production_projects (owner_user_id, updated_at DESC);

CREATE TABLE ads.content_production_revisions (
    project_id UUID NOT NULL REFERENCES ads.content_production_projects(project_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, revision)
);

CREATE TABLE ads.content_production_jobs (
    job_id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    revision INTEGER NOT NULL,
    preview BOOLEAN NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'cancel_requested', 'cancelled', 'completed', 'failed')),
    claim_token UUID,
    heartbeat_at TIMESTAMPTZ,
    stage TEXT NOT NULL DEFAULT '等待制作',
    output_object_key TEXT,
    receipt JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    FOREIGN KEY (project_id, revision) REFERENCES ads.content_production_revisions(project_id, revision),
    CHECK (status <> 'completed' OR (output_object_key IS NOT NULL AND receipt IS NOT NULL))
);
CREATE UNIQUE INDEX content_production_jobs_active_idx
    ON ads.content_production_jobs (project_id, revision, preview)
    WHERE status IN ('queued', 'running', 'cancel_requested');
CREATE INDEX content_production_jobs_queue_idx
    ON ads.content_production_jobs (created_at) WHERE status = 'queued';
