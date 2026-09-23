CREATE TABLE IF NOT EXISTS public.aios_schema_migrations (
    namespace TEXT NOT NULL,
    version TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    app_version TEXT NOT NULL,
    execution_mode TEXT NOT NULL,
    exception_kind TEXT,
    decision_artifact_sha256 TEXT,
    PRIMARY KEY (namespace, version),
    CONSTRAINT aios_schema_migrations_namespace_check
        CHECK (namespace IN ('backend', 'warehouse')),
    CONSTRAINT aios_schema_migrations_checksum_check
        CHECK (checksum ~ '^[a-f0-9]{64}$'),
    CONSTRAINT aios_schema_migrations_execution_mode_check
        CHECK (execution_mode IN ('baseline', 'transactional', 'self-transactional', 'nontransactional', 'exception')),
    CONSTRAINT aios_schema_migrations_exception_metadata_check
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
        )
);

COMMENT ON TABLE public.aios_schema_migrations IS
    'AIOS backend and warehouse migration resolution ledger schema v2';
COMMENT ON COLUMN public.aios_schema_migrations.namespace IS
    'Migration namespace: backend or warehouse';
COMMENT ON COLUMN public.aios_schema_migrations.version IS
    'Immutable migration version parsed from the filename';
COMMENT ON COLUMN public.aios_schema_migrations.checksum IS
    'SHA-256 of the exact migration file bytes';
COMMENT ON COLUMN public.aios_schema_migrations.applied_at IS
    'Timestamp when the migration resolution was recorded';
COMMENT ON COLUMN public.aios_schema_migrations.app_version IS
    'AIOS application version that recorded the migration';
COMMENT ON COLUMN public.aios_schema_migrations.execution_mode IS
    'baseline, transactional, self-transactional, nontransactional, or exception';
COMMENT ON COLUMN public.aios_schema_migrations.exception_kind IS
    'Owner-approved non-execution resolution kind for exception rows';
COMMENT ON COLUMN public.aios_schema_migrations.decision_artifact_sha256 IS
    'SHA-256 of the immutable owner-decision overlay for exception rows';
