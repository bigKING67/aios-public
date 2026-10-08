-- Additive task/plan storage. Apply through the ledger, never on API startup.
CREATE TABLE ads.content_production_runs (
    run_id UUID PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL CHECK (LENGTH(idempotency_key) BETWEEN 1 AND 100),
    request JSONB NOT NULL CHECK (jsonb_typeof(request) = 'object'),
    source_snapshot JSONB NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    execution_version INTEGER NOT NULL DEFAULT 1 CHECK (execution_version > 0),
    plan_revision INTEGER NOT NULL DEFAULT 0 CHECK (plan_revision >= 0),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'waiting', 'paused', 'cancelled', 'failed')),
    stage TEXT NOT NULL DEFAULT 'planning' CHECK (stage IN ('planning', 'production')),
    waiting_reason TEXT,
    active_attempt UUID,
    project_id UUID,
    project_revision INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, idempotency_key),
    CHECK ((project_id IS NULL) = (project_revision IS NULL)),
    FOREIGN KEY (project_id, project_revision)
        REFERENCES ads.content_production_revisions(project_id, revision)
);
CREATE INDEX content_production_runs_owner_idx
    ON ads.content_production_runs (owner_user_id, created_at DESC, run_id DESC);

CREATE TABLE ads.content_production_plan_attempts (
    attempt_id UUID PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES ads.content_production_runs(run_id),
    execution_version INTEGER NOT NULL CHECK (execution_version > 0),
    input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'),
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'failed', 'superseded')),
    expires_at TIMESTAMPTZ NOT NULL,
    result JSONB,
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX content_production_plan_attempts_run_idx
    ON ads.content_production_plan_attempts (run_id, created_at DESC);

CREATE TABLE ads.content_production_plans (
    run_id UUID NOT NULL REFERENCES ads.content_production_runs(run_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    execution_version INTEGER NOT NULL CHECK (execution_version > 0),
    document JSONB NOT NULL CHECK (jsonb_typeof(document) = 'object'),
    origin TEXT NOT NULL CHECK (origin IN ('model', 'user')),
    attempt_id UUID REFERENCES ads.content_production_plan_attempts(attempt_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, revision)
);
