export const AIOS_MIGRATION_LEDGER_BOOTSTRAP_ADVISORY_LOCK =
  'aios-schema-migrations-bootstrap-v2';

export const AIOS_MIGRATION_LEDGER_BOOTSTRAP_TIMEOUT_SQL = `
SELECT
  set_config('lock_timeout', $1, true) AS lock_timeout,
  set_config('statement_timeout', $2, true) AS statement_timeout
`;

export const AIOS_MIGRATION_LEDGER_BOOTSTRAP_LOCK_SQL = `
SELECT pg_advisory_xact_lock(hashtext($1)) AS locked
`;

const INSERT_COLUMNS = Object.freeze([
  'namespace',
  'version',
  'checksum',
  'app_version',
  'execution_mode',
  'exception_kind',
  'decision_artifact_sha256',
]);

export function buildAiosMigrationLedgerBootstrapInsert(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Migration ledger bootstrap insert requires at least one row.');
  }
  const params = [];
  const values = rows.map((row, rowIndex) => {
    const offset = rowIndex * INSERT_COLUMNS.length;
    params.push(
      row.namespace,
      row.version,
      row.checksum,
      row.appVersion,
      row.executionMode,
      row.exceptionKind,
      row.decisionArtifactSha256,
    );
    return `(${INSERT_COLUMNS.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`;
  });
  return {
    params,
    sql: `
INSERT INTO public.aios_schema_migrations (
  namespace,
  version,
  checksum,
  app_version,
  execution_mode,
  exception_kind,
  decision_artifact_sha256
)
VALUES ${values.join(',\n       ')}
ON CONFLICT (namespace, version) DO NOTHING
RETURNING namespace, version, checksum, app_version, execution_mode,
          exception_kind, decision_artifact_sha256
`,
  };
}
