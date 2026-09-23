import {
  applyLedgerFreeForwardCutover,
  assertLedgerFreeGitState,
  assertLedgerFreeMigrationBytes,
  assertLedgerFreePreparationContract,
  assertLedgerFreeTargetRecord,
  ledgerFreeSha256,
  verifyLedgerFreeForwardCutover,
} from './aios-ledger-free-forward-cutover-engine.mjs';
import {
  SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS,
  SAMPLE_INVENTORY_FORWARD_CUTOVER_FUNCTIONS,
  SAMPLE_INVENTORY_FORWARD_CUTOVER_INDEXES,
  SAMPLE_INVENTORY_FORWARD_CUTOVER_TABLES,
  SAMPLE_INVENTORY_FORWARD_CUTOVER_TRIGGERS,
  sampleInventoryDatabaseIdentitySha256,
} from './aios-sample-inventory-forward-cutover.mjs';

export const SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET = Object.freeze({
  checksum: '8e1009a7faaea6c3d923081ba35caf4f5067112be5a0fdf9442bc549c49f511e',
  executionMode: 'transactional',
  identity: 'backend/015',
  namespace: 'backend',
  relativePath: 'sql/migrations/015_sample_inventory_public_ux_support.sql',
  version: '015',
});

export const SAMPLE_INVENTORY_PUBLIC_CUTOVER_BASE_HEALTH_CHECK_PATH =
  'etl/groland_postgres/tests/sql/sample_inventory_transaction_check.sql';
export const SAMPLE_INVENTORY_PUBLIC_CUTOVER_HEALTH_CHECK_PATH =
  'etl/groland_postgres/tests/sql/sample_inventory_public_cutover_check.sql';

export const SAMPLE_INVENTORY_PUBLIC_CUTOVER_COLUMNS = Object.freeze([
  ['id', 'bigint', 'NO'],
  ['operation', 'text', 'NO'],
  ['submission_key', 'text', 'NO'],
  ['request_sha256', 'text', 'NO'],
  ['actor_user_id', 'text', 'NO'],
  ['response_payload', 'jsonb', 'YES'],
  ['created_at', 'timestamp with time zone', 'NO'],
  ['completed_at', 'timestamp with time zone', 'YES'],
]);

export const SAMPLE_INVENTORY_PUBLIC_CUTOVER_CONSTRAINTS = Object.freeze([
  ['mutation_requests_pkey', 'p', 'PRIMARY KEY (id)'],
  ['mutation_requests_operation_check', 'c', "CHECK ((btrim(operation) <> ''::text))"],
  [
    'mutation_requests_submission_key_check',
    'c',
    "CHECK (((btrim(submission_key) <> ''::text) AND (char_length(submission_key) <= 128)))",
  ],
  [
    'mutation_requests_request_sha256_check',
    'c',
    "CHECK ((request_sha256 ~ '^[0-9a-f]{64}$'::text))",
  ],
  ['mutation_requests_actor_user_id_check', 'c', "CHECK ((btrim(actor_user_id) <> ''::text))"],
  [
    'chk_sample_inventory_mutation_completion',
    'c',
    'CHECK (((response_payload IS NULL) = (completed_at IS NULL)))',
  ],
  ['uq_sample_inventory_mutation_operation_key', 'u', 'UNIQUE (operation, submission_key)'],
]);

export const SAMPLE_INVENTORY_PUBLIC_CUTOVER_EXPECTED_EFFECTS =
  1
  + SAMPLE_INVENTORY_PUBLIC_CUTOVER_COLUMNS.length
  + SAMPLE_INVENTORY_PUBLIC_CUTOVER_CONSTRAINTS.length
  + 1
  + 1;

export const SAMPLE_INVENTORY_PUBLIC_CUTOVER_ADVISORY_LOCK =
  'aios:sample-inventory-public-cutover:backend-015:v1';

const TOPOLOGY_SQL = `/* sample_inventory_public_cutover:topology */
WITH requested_tables(relation_name) AS (
  SELECT * FROM unnest($1::TEXT[])
), requested_functions(signature) AS (
  SELECT * FROM unnest($2::TEXT[])
), requested_triggers(relation_name, trigger_name) AS (
  SELECT * FROM unnest($3::TEXT[], $4::TEXT[])
), requested_indexes(relation_name) AS (
  SELECT * FROM unnest($5::TEXT[])
), requested_columns(column_name, data_type, is_nullable) AS (
  SELECT * FROM unnest($6::TEXT[], $7::TEXT[], $8::TEXT[])
), requested_constraints(constraint_name, constraint_type, definition) AS (
  SELECT * FROM unnest($9::TEXT[], $10::TEXT[], $11::TEXT[])
), base_effect_counts AS (
  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_namespace WHERE nspname = 'sample_inventory'
    ) THEN 1 ELSE 0 END AS schemas,
    (SELECT COUNT(*) FROM requested_tables WHERE to_regclass(relation_name) IS NOT NULL) AS tables,
    (SELECT COUNT(*) FROM requested_functions WHERE to_regprocedure(signature) IS NOT NULL) AS functions,
    (SELECT COUNT(*)
       FROM requested_triggers requested
       JOIN pg_trigger actual
         ON actual.tgrelid = to_regclass(requested.relation_name)
        AND actual.tgname = requested.trigger_name
        AND NOT actual.tgisinternal) AS triggers,
    (SELECT COUNT(*) FROM requested_indexes WHERE to_regclass(relation_name) IS NOT NULL) AS indexes
), public_effect_counts AS (
  SELECT
    CASE WHEN to_regclass('sample_inventory.mutation_requests') IS NULL THEN 0 ELSE 1 END AS tables,
    (SELECT COUNT(*)
       FROM requested_columns requested
       JOIN information_schema.columns actual
         ON actual.table_schema = 'sample_inventory'
        AND actual.table_name = 'mutation_requests'
        AND actual.column_name = requested.column_name
        AND actual.data_type = requested.data_type
        AND actual.is_nullable = requested.is_nullable) AS columns,
    (SELECT COUNT(*)
       FROM requested_constraints requested
       JOIN pg_constraint actual
         ON actual.conrelid = to_regclass('sample_inventory.mutation_requests')
        AND actual.conname = requested.constraint_name
        AND actual.contype::TEXT = requested.constraint_type
        AND actual.convalidated
        AND pg_get_constraintdef(actual.oid) = requested.definition) AS constraints,
    CASE WHEN EXISTS (
      SELECT 1
      FROM pg_index
      WHERE indexrelid = to_regclass('sample_inventory.idx_sample_inventory_mutation_actor_created')
        AND indrelid = to_regclass('sample_inventory.mutation_requests')
        AND indisvalid
        AND indisready
        AND NOT indisunique
        AND pg_get_indexdef(indexrelid) =
          'CREATE INDEX idx_sample_inventory_mutation_actor_created ON sample_inventory.mutation_requests USING btree (actor_user_id, created_at DESC)'
    ) THEN 1 ELSE 0 END AS indexes,
    COALESCE((
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = 'sample_inventory'
        AND table_name = 'settings'
        AND column_name = 'low_stock_threshold'
    ), '') AS threshold_default,
    CASE WHEN to_regclass('sample_inventory.settings') IS NULL THEN 0 ELSE (
      SELECT COUNT(*)
      FROM sample_inventory.settings
      WHERE id = 1
        AND low_stock_threshold = 10
        AND version = 1
        AND created_by = 'system'
        AND updated_by = 'system'
    ) END AS legacy_pristine_settings
)
SELECT current_database() AS database_name,
       COALESCE(inet_server_addr()::TEXT, 'local') AS server_address,
       COALESCE(inet_server_port()::TEXT, 'local') AS server_port,
       current_setting('transaction_read_only') AS transaction_read_only,
       txid_current_if_assigned()::TEXT AS transaction_id,
       to_regclass('public.aios_schema_migrations') IS NOT NULL AS ledger_exists,
       (base_effect_counts.schemas + base_effect_counts.tables
         + base_effect_counts.functions + base_effect_counts.triggers
         + base_effect_counts.indexes)::INTEGER AS base_effects_present,
       public_effect_counts.tables::INTEGER AS public_tables_present,
       public_effect_counts.columns::INTEGER AS public_columns_present,
       public_effect_counts.constraints::INTEGER AS public_constraints_present,
       public_effect_counts.indexes::INTEGER AS public_indexes_present,
       public_effect_counts.threshold_default,
       public_effect_counts.legacy_pristine_settings::INTEGER AS legacy_pristine_settings
FROM base_effect_counts, public_effect_counts`;

const TRANSACTION_ID_SQL = `/* sample_inventory_public_cutover:transaction_id */
SELECT txid_current_if_assigned()::TEXT AS transaction_id`;

function normalizeIntegerDefault(value) {
  return String(value ?? '').replaceAll('::integer', '').replace(/[\s()]/gu, '');
}

function assertSourceContracts(migrationSql, baseHealthCheckSql, healthCheckSql, record) {
  assertLedgerFreeMigrationBytes({
    label: 'Sample inventory public cutover',
    migrationSql,
    record,
  });
  for (const token of [
    'ALTER COLUMN low_stock_threshold SET DEFAULT 3',
    'CREATE TABLE sample_inventory.mutation_requests',
    'uq_sample_inventory_mutation_operation_key',
    'idx_sample_inventory_mutation_actor_created',
  ]) {
    if (!migrationSql.includes(token)) throw new Error(`Sample inventory public migration is missing ${token}.`);
  }
  if (!baseHealthCheckSql.includes('missing sample inventory transaction tables')) {
    throw new Error('Sample inventory public cutover base health check is incomplete.');
  }
  for (const token of [
    'missing sample inventory mutation request table',
    'sample inventory mutation request constraint contract is incomplete',
    'sample inventory low stock threshold default is not 3',
    'sample inventory pristine legacy threshold was not migrated',
  ]) {
    if (!healthCheckSql.includes(token)) throw new Error(`Sample inventory public health check is missing ${token}.`);
  }
}

export function prepareSampleInventoryPublicCutover({
  baseHealthCheckSql,
  command,
  expectedDatabase,
  expectedDatabaseIdentitySha256 = null,
  expectedGitSha,
  expectedMigrationSha256,
  git,
  healthCheckSql,
  migrationAdvisoryLockKey,
  migrationSql,
  records,
}) {
  assertLedgerFreePreparationContract({
    command,
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    expectedMigrationSha256,
    label: 'Sample inventory public cutover',
    migrationAdvisoryLockKey,
  });
  if (!Array.isArray(records)
    || typeof migrationSql !== 'string'
    || typeof baseHealthCheckSql !== 'string'
    || typeof healthCheckSql !== 'string') {
    throw new Error('Sample inventory public cutover repository inputs are incomplete.');
  }
  assertLedgerFreeGitState({
    expectedGitSha,
    git,
    label: 'Sample inventory public cutover',
  });
  const record = assertLedgerFreeTargetRecord({
    expectedMigrationSha256,
    label: 'Sample inventory public cutover',
    records,
    target: SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET,
  });
  assertSourceContracts(migrationSql, baseHealthCheckSql, healthCheckSql, record);
  return Object.freeze({
    baseHealthCheck: Object.freeze({
      path: SAMPLE_INVENTORY_PUBLIC_CUTOVER_BASE_HEALTH_CHECK_PATH,
      sha256: ledgerFreeSha256(baseHealthCheckSql),
      sql: baseHealthCheckSql,
    }),
    command,
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    git: Object.freeze({ ...git }),
    healthCheck: Object.freeze({
      path: SAMPLE_INVENTORY_PUBLIC_CUTOVER_HEALTH_CHECK_PATH,
      sha256: ledgerFreeSha256(healthCheckSql),
      sql: healthCheckSql,
    }),
    migration: Object.freeze({ ...record, sql: migrationSql }),
    migrationAdvisoryLockKey,
  });
}

function topologyParams() {
  return [
    SAMPLE_INVENTORY_FORWARD_CUTOVER_TABLES,
    SAMPLE_INVENTORY_FORWARD_CUTOVER_FUNCTIONS,
    SAMPLE_INVENTORY_FORWARD_CUTOVER_TRIGGERS.map(([relationName]) => relationName),
    SAMPLE_INVENTORY_FORWARD_CUTOVER_TRIGGERS.map(([, triggerName]) => triggerName),
    SAMPLE_INVENTORY_FORWARD_CUTOVER_INDEXES,
    SAMPLE_INVENTORY_PUBLIC_CUTOVER_COLUMNS.map(([columnName]) => columnName),
    SAMPLE_INVENTORY_PUBLIC_CUTOVER_COLUMNS.map(([, dataType]) => dataType),
    SAMPLE_INVENTORY_PUBLIC_CUTOVER_COLUMNS.map(([, , isNullable]) => isNullable),
    SAMPLE_INVENTORY_PUBLIC_CUTOVER_CONSTRAINTS.map(([constraintName]) => constraintName),
    SAMPLE_INVENTORY_PUBLIC_CUTOVER_CONSTRAINTS.map(([, constraintType]) => constraintType),
    SAMPLE_INVENTORY_PUBLIC_CUTOVER_CONSTRAINTS.map(([, , definition]) => definition),
  ];
}

function normalizeTopology(row) {
  const thresholdDefault = normalizeIntegerDefault(row?.threshold_default);
  const topology = {
    baseEffectsPresent: Number(row?.base_effects_present ?? 0),
    databaseName: String(row?.database_name ?? ''),
    ledgerExists: row?.ledger_exists === true,
    legacyPristineSettings: Number(row?.legacy_pristine_settings ?? 0),
    publicColumnsPresent: Number(row?.public_columns_present ?? 0),
    publicConstraintsPresent: Number(row?.public_constraints_present ?? 0),
    publicIndexesPresent: Number(row?.public_indexes_present ?? 0),
    publicTablesPresent: Number(row?.public_tables_present ?? 0),
    serverAddress: String(row?.server_address ?? ''),
    serverPort: String(row?.server_port ?? ''),
    thresholdDefault,
    transactionId: row?.transaction_id ?? null,
    transactionReadOnly: String(row?.transaction_read_only ?? ''),
  };
  topology.baseCatalogComplete =
    topology.baseEffectsPresent === SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS;
  topology.publicEffectsPresent = topology.publicTablesPresent
    + topology.publicColumnsPresent
    + topology.publicConstraintsPresent
    + topology.publicIndexesPresent
    + (thresholdDefault === '3' ? 1 : 0);
  topology.publicCatalogAbsent = topology.publicTablesPresent === 0
    && topology.publicColumnsPresent === 0
    && topology.publicConstraintsPresent === 0
    && topology.publicIndexesPresent === 0
    && thresholdDefault === '10';
  topology.publicCatalogComplete =
    topology.publicEffectsPresent === SAMPLE_INVENTORY_PUBLIC_CUTOVER_EXPECTED_EFFECTS
    && topology.legacyPristineSettings === 0;
  topology.expectedBaseEffects = SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS;
  topology.expectedPublicEffects = SAMPLE_INVENTORY_PUBLIC_CUTOVER_EXPECTED_EFFECTS;
  topology.databaseIdentitySha256 = sampleInventoryDatabaseIdentitySha256(topology);
  return topology;
}

async function readTopology(client) {
  const result = await client.query(TOPOLOGY_SQL, topologyParams());
  return normalizeTopology(result.rows?.[0]);
}

function assertDatabaseIdentity(topology, prepared) {
  if (topology.databaseName !== prepared.expectedDatabase) {
    throw new Error('Sample inventory public cutover database identity differs from the explicit pin.');
  }
  if (prepared.expectedDatabaseIdentitySha256
    && topology.databaseIdentitySha256 !== prepared.expectedDatabaseIdentitySha256) {
    throw new Error('Sample inventory public cutover database identity SHA-256 differs from the verified pin.');
  }
}

function verifyStatus(topology) {
  if (topology.ledgerExists) return 'blocked_ledger_present';
  if (!topology.baseCatalogComplete) return 'blocked_backend_014_incomplete';
  if (topology.publicCatalogAbsent) return 'ready_for_apply';
  if (topology.publicCatalogComplete) return 'catalog_complete';
  return 'blocked_partial_topology';
}

function baseResult({ generatedAt, mode, prepared, status, topology }) {
  return {
    schemaVersion: 1,
    generatedAt,
    mode,
    status,
    git: prepared.git,
    database: {
      name: topology.databaseName,
      identitySha256: topology.databaseIdentitySha256,
    },
    migration: {
      identity: SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.identity,
      relativePath: prepared.migration.relativePath,
      checksum: prepared.migration.checksum,
      executionMode: prepared.migration.executionMode,
      baseHealthCheckPath: prepared.baseHealthCheck.path,
      baseHealthCheckSha256: prepared.baseHealthCheck.sha256,
      healthCheckPath: prepared.healthCheck.path,
      healthCheckSha256: prepared.healthCheck.sha256,
    },
  };
}

export async function verifySampleInventoryPublicCutover({
  client,
  lockTimeout = '1s',
  now = () => new Date(),
  prepared,
  statementTimeout = '15s',
}) {
  return verifyLedgerFreeForwardCutover({
    assertDatabaseIdentity,
    baseResult,
    client,
    isReady: (_topology, status) => ['ready_for_apply', 'catalog_complete'].includes(status),
    label: 'Sample inventory public cutover',
    lockTimeout,
    mode: 'sample_inventory_public_cutover_verify',
    now,
    policy: {
      databaseWrites: false,
      ledgerWrites: false,
      migrationBodyExecuted: false,
      businessRowsEmitted: false,
      transactionIdAssigned: false,
      rolledBack: true,
      deployAuthorized: false,
      warehouseChanges: false,
    },
    prepared,
    readTopology,
    statementTimeout,
    transactionIdSql: TRANSACTION_ID_SQL,
    verifyStatus,
  });
}

export async function applySampleInventoryPublicCutover({
  client,
  lockTimeout = '5s',
  now = () => new Date(),
  prepared,
  statementTimeout = '60s',
}) {
  return applyLedgerFreeForwardCutover({
    assertBefore(topologyBefore) {
      if (topologyBefore.ledgerExists) {
        throw new Error('Sample inventory public cutover refuses to run while the canonical migration ledger exists.');
      }
      if (!topologyBefore.baseCatalogComplete) {
        throw new Error('Sample inventory public cutover requires the complete backend/014 catalog.');
      }
      if (!topologyBefore.publicCatalogAbsent && !topologyBefore.publicCatalogComplete) {
        throw new Error('Sample inventory public cutover refuses partial or drifted backend/015 topology.');
      }
    },
    assertDatabaseIdentity,
    assertPostconditions(topologyAfter) {
      if (topologyAfter.ledgerExists
        || !topologyAfter.baseCatalogComplete
        || !topologyAfter.publicCatalogComplete) {
        throw new Error('Sample inventory public cutover postconditions are incomplete or created ledger state.');
      }
    },
    baseResult,
    client,
    healthChecks: [{ stage: 'execute_health_check', sql: prepared.healthCheck.sql }],
    label: 'Sample inventory public cutover',
    lockComment: 'sample_inventory_public_cutover',
    lockTimeout,
    mode: 'sample_inventory_public_cutover_apply',
    now,
    policy: ({ migrationBodyExecuted }) => ({
      databaseWrites: migrationBodyExecuted,
      ledgerWrites: false,
      migrationBodyExecuted,
      healthCheckExecuted: true,
      committed: true,
      deployAuthorized: false,
      warehouseChanges: false,
      legacyImportExecuted: false,
    }),
    preMigrationChecks: [{
      stage: 'execute_base_health_check',
      sql: prepared.baseHealthCheck.sql,
    }],
    prepared,
    readTopology,
    shouldExecuteMigration: (topologyBefore) => topologyBefore.publicCatalogAbsent,
    statementTimeout,
    targetAdvisoryLock: SAMPLE_INVENTORY_PUBLIC_CUTOVER_ADVISORY_LOCK,
  });
}
