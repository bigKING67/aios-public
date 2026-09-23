ALTER TABLE public.aios_schema_migrations
    ADD COLUMN exception_kind TEXT,
    ADD COLUMN decision_artifact_sha256 TEXT;

ALTER TABLE public.aios_schema_migrations
    DROP CONSTRAINT aios_schema_migrations_execution_mode_check;

ALTER TABLE public.aios_schema_migrations
    ADD CONSTRAINT aios_schema_migrations_execution_mode_check
        CHECK (execution_mode IN ('baseline', 'transactional', 'self-transactional', 'nontransactional', 'exception')),
    ADD CONSTRAINT aios_schema_migrations_exception_metadata_check
        CHECK (
            (
                execution_mode = 'exception'
                AND exception_kind IN ('not_applicable', 'forward_repaired')
                AND decision_artifact_sha256 ~ '^[a-f0-9]{64}$'
            )
            OR (
                execution_mode <> 'exception'
                AND exception_kind IS NULL
                AND decision_artifact_sha256 IS NULL
            )
        );

COMMENT ON TABLE public.aios_schema_migrations IS
    'AIOS backend and warehouse migration resolution ledger schema v2';
COMMENT ON COLUMN public.aios_schema_migrations.applied_at IS
    'Timestamp when the migration resolution was recorded';
COMMENT ON COLUMN public.aios_schema_migrations.execution_mode IS
    'baseline, transactional, self-transactional, nontransactional, or exception';
COMMENT ON COLUMN public.aios_schema_migrations.exception_kind IS
    'Owner-approved non-execution resolution kind for exception rows';
COMMENT ON COLUMN public.aios_schema_migrations.decision_artifact_sha256 IS
    'SHA-256 of the immutable owner-decision overlay for exception rows';
