const LEDGER_TABLE = 'public.aios_schema_migrations';

export const AIOS_MIGRATION_LEDGER_V1_EXECUTION_MODES = Object.freeze([
  'baseline',
  'transactional',
  'self-transactional',
  'nontransactional',
]);

export const AIOS_MIGRATION_LEDGER_V2_EXECUTION_MODES = Object.freeze([
  ...AIOS_MIGRATION_LEDGER_V1_EXECUTION_MODES,
  'exception',
]);

export const AIOS_MIGRATION_LEDGER_EXCEPTION_KINDS = Object.freeze([
  'not_applicable',
  'forward_repaired',
]);

export const AIOS_MIGRATION_LEDGER_SCHEMA_SQL = `
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'aios_schema_migrations'
ORDER BY ordinal_position
`;

export const AIOS_MIGRATION_LEDGER_CANONICAL_SCHEMA_SQL = `
SELECT
  to_regclass('public.aios_schema_migrations') IS NOT NULL AS table_exists,
  current_database() AS database_name,
  COALESCE(inet_server_addr()::TEXT, 'local') AS server_address,
  COALESCE(inet_server_port()::TEXT, 'local') AS server_port,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'column_name', column_name,
      'data_type', data_type,
      'is_nullable', is_nullable
    ) ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'aios_schema_migrations'
  ), '[]'::jsonb) AS columns,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'constraint_name', constraint_name,
      'constraint_type', constraint_type,
      'definition', definition
    ) ORDER BY constraint_name)
    FROM (
      SELECT
        ledger_constraint.conname AS constraint_name,
        ledger_constraint.contype::TEXT AS constraint_type,
        pg_get_constraintdef(ledger_constraint.oid, true) AS definition
      FROM pg_constraint AS ledger_constraint
      JOIN pg_class AS relation ON relation.oid = ledger_constraint.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'aios_schema_migrations'
    ) AS ledger_constraints
  ), '[]'::jsonb) AS constraints
`;

export const AIOS_MIGRATION_LEDGER_V1_COLUMNS = Object.freeze([
  Object.freeze({ columnName: 'namespace', dataType: 'text', nullable: false }),
  Object.freeze({ columnName: 'version', dataType: 'text', nullable: false }),
  Object.freeze({ columnName: 'checksum', dataType: 'text', nullable: false }),
  Object.freeze({ columnName: 'applied_at', dataType: 'timestamp with time zone', nullable: false }),
  Object.freeze({ columnName: 'app_version', dataType: 'text', nullable: false }),
  Object.freeze({ columnName: 'execution_mode', dataType: 'text', nullable: false }),
]);

export const AIOS_MIGRATION_LEDGER_V2_COLUMNS = Object.freeze([
  ...AIOS_MIGRATION_LEDGER_V1_COLUMNS,
  Object.freeze({ columnName: 'exception_kind', dataType: 'text', nullable: true }),
  Object.freeze({ columnName: 'decision_artifact_sha256', dataType: 'text', nullable: true }),
]);

const LEDGER_SELECT_V1_SQL = `
SELECT namespace, version, checksum, applied_at, app_version, execution_mode,
       NULL::TEXT AS exception_kind,
       NULL::TEXT AS decision_artifact_sha256
FROM ${LEDGER_TABLE}
ORDER BY namespace, applied_at, version
`;

const LEDGER_SELECT_V2_SQL = `
SELECT namespace, version, checksum, applied_at, app_version, execution_mode,
       exception_kind, decision_artifact_sha256
FROM ${LEDGER_TABLE}
ORDER BY namespace, applied_at, version
`;

function normalizeColumn(row) {
  const nullableValue = row?.is_nullable ?? (
    typeof row?.nullable === 'boolean' ? (row.nullable ? 'YES' : 'NO') : null
  );
  return {
    columnName: row?.column_name ?? row?.columnName,
    dataType: row?.data_type ?? row?.dataType,
    nullable: nullableValue === 'YES' ? true : nullableValue === 'NO' ? false : null,
  };
}

function columnsEqual(actual, expected) {
  return actual.length === expected.length && actual.every((column, index) => (
    column.columnName === expected[index].columnName
    && column.dataType === expected[index].dataType
    && column.nullable === expected[index].nullable
  ));
}

function formatColumns(columns) {
  return columns.map((column) => (
    `${column.columnName}:${column.dataType}:`
    + (column.nullable === true ? 'nullable' : column.nullable === false ? 'required' : 'unknown-nullability')
  )).join(',');
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeConstraint(row) {
  return {
    constraintName: row?.constraint_name ?? row?.constraintName,
    constraintType: row?.constraint_type ?? row?.constraintType,
    definition: String(row?.definition ?? '')
      .replaceAll('"', '')
      .replace(/::(?:text|character varying)/giu, '')
      .replace(/\s+/gu, ' ')
      .trim()
      .toLowerCase(),
  };
}

function quotedValues(definition) {
  return [...definition.matchAll(/'([^']+)'/gu)].map((match) => match[1]);
}

function sameValues(actual, expected) {
  return JSON.stringify([...new Set(actual)].sort()) === JSON.stringify([...expected].sort());
}

function canonicalConstraintFailures(constraints, version) {
  const expectedNames = [
    'aios_schema_migrations_checksum_check',
    'aios_schema_migrations_execution_mode_check',
    'aios_schema_migrations_namespace_check',
    'aios_schema_migrations_pkey',
    ...(version === 2 ? ['aios_schema_migrations_exception_metadata_check'] : []),
  ].sort();
  const names = constraints.map((constraint) => constraint.constraintName).sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    return [`constraint names differ: expected ${expectedNames.join(',')}; got ${names.join(',') || 'none'}`];
  }
  const byName = new Map(constraints.map((constraint) => [constraint.constraintName, constraint]));
  const failures = [];
  const primary = byName.get('aios_schema_migrations_pkey');
  if (primary?.constraintType !== 'p'
    || !/primary key\s*\(\s*namespace\s*,\s*version\s*\)/u.test(primary.definition)) {
    failures.push('primary key contract differs');
  }
  const namespace = byName.get('aios_schema_migrations_namespace_check');
  if (namespace?.constraintType !== 'c'
    || !sameValues(quotedValues(namespace.definition), ['backend', 'warehouse'])) {
    failures.push('namespace constraint differs');
  }
  const checksum = byName.get('aios_schema_migrations_checksum_check');
  if (checksum?.constraintType !== 'c'
    || !checksum.definition.includes('checksum')
    || !sameValues(quotedValues(checksum.definition), ['^[a-f0-9]{64}$'])) {
    failures.push('checksum constraint differs');
  }
  const executionMode = byName.get('aios_schema_migrations_execution_mode_check');
  const expectedModes = version === 2
    ? AIOS_MIGRATION_LEDGER_V2_EXECUTION_MODES
    : AIOS_MIGRATION_LEDGER_V1_EXECUTION_MODES;
  if (executionMode?.constraintType !== 'c'
    || !executionMode.definition.includes('execution_mode')
    || !sameValues(quotedValues(executionMode.definition), expectedModes)) {
    failures.push(`execution_mode constraint differs from v${version}`);
  }
  if (version === 2) {
    const metadata = byName.get('aios_schema_migrations_exception_metadata_check');
    const definition = metadata?.definition ?? '';
    if (metadata?.constraintType !== 'c'
      || !sameValues(quotedValues(definition), [
        'exception',
        'not_applicable',
        'forward_repaired',
        '^[a-f0-9]{64}$',
      ])
      || !definition.includes('exception_kind is null')
      || !definition.includes('decision_artifact_sha256 is null')
      || !definition.includes("execution_mode <> 'exception'")) {
      failures.push('exception metadata constraint differs from v2');
    }
  }
  return failures;
}

export function detectAiosMigrationLedgerSchema(rows) {
  const columns = (rows ?? []).map(normalizeColumn);
  if (columns.length === 0) {
    return {
      exists: false,
      version: 0,
      status: 'missing',
      supportsExceptions: false,
      schemaUpgradeRequired: true,
      columns,
      failures: [],
    };
  }
  if (columnsEqual(columns, AIOS_MIGRATION_LEDGER_V1_COLUMNS)) {
    return {
      exists: true,
      version: 1,
      status: 'read-compatible-v1',
      supportsExceptions: false,
      schemaUpgradeRequired: true,
      columns,
      failures: [],
    };
  }
  if (columnsEqual(columns, AIOS_MIGRATION_LEDGER_V2_COLUMNS)) {
    return {
      exists: true,
      version: 2,
      status: 'read-compatible-v2',
      supportsExceptions: true,
      schemaUpgradeRequired: false,
      columns,
      failures: [],
    };
  }
  return {
    exists: true,
    version: null,
    status: 'drifted',
    supportsExceptions: false,
    schemaUpgradeRequired: true,
    columns,
    failures: [
      `Migration ledger schema drift: expected read-compatible v1 or v2 columns; got ${formatColumns(columns) || 'none'}.`,
    ],
  };
}

export function assertAiosMigrationLedgerSchema(rows) {
  const schema = detectAiosMigrationLedgerSchema(rows);
  if (schema.failures.length) throw new Error(schema.failures.join('\n'));
  return schema;
}

export function detectCanonicalAiosMigrationLedgerSchema(row) {
  const tableExists = row?.table_exists ?? row?.tableExists ?? false;
  if (tableExists !== true) {
    return {
      exists: false,
      version: 0,
      status: 'missing',
      supportsExceptions: false,
      schemaUpgradeRequired: true,
      columns: [],
      constraints: [],
      failures: [],
    };
  }
  const columns = jsonArray(row?.columns).map(normalizeColumn);
  const constraints = jsonArray(row?.constraints).map(normalizeConstraint);
  const columnVersion = columnsEqual(columns, AIOS_MIGRATION_LEDGER_V1_COLUMNS)
    ? 1
    : columnsEqual(columns, AIOS_MIGRATION_LEDGER_V2_COLUMNS)
      ? 2
      : null;
  const constraintFailures = columnVersion
    ? canonicalConstraintFailures(constraints, columnVersion)
    : ['column shape differs from canonical v1/v2'];
  if (columnVersion && constraintFailures.length === 0) {
    return {
      exists: true,
      version: columnVersion,
      status: `canonical-v${columnVersion}`,
      supportsExceptions: columnVersion === 2,
      schemaUpgradeRequired: columnVersion === 1,
      columns,
      constraints,
      failures: [],
    };
  }
  return {
    exists: true,
    version: null,
    status: 'drifted',
    supportsExceptions: false,
    schemaUpgradeRequired: true,
    columns,
    constraints,
    failures: [
      `Migration ledger canonical schema drift: ${constraintFailures.join('; ')}.`,
    ],
  };
}

export function assertCanonicalAiosMigrationLedgerSchema(row) {
  const schema = detectCanonicalAiosMigrationLedgerSchema(row);
  if (schema.failures.length) throw new Error(schema.failures.join('\n'));
  return schema;
}

export function aiosMigrationLedgerSelectSql(schemaVersion) {
  if (schemaVersion === 1) return LEDGER_SELECT_V1_SQL;
  if (schemaVersion === 2) return LEDGER_SELECT_V2_SQL;
  throw new Error(`Unsupported migration ledger schema version: ${schemaVersion}.`);
}

export function formatAiosMigrationLedgerSchema(schema) {
  if (!schema?.exists) return 'missing';
  if (schema.version === 1) return 'v1';
  if (schema.version === 2) return 'v2';
  return 'drifted';
}
