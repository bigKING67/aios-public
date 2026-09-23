import {
  applyLedgerFreeForwardCutover,
  assertLedgerFreeGitState,
  assertLedgerFreeMigrationBytes,
  assertLedgerFreePreparationContract,
  assertLedgerFreeTargetRecord,
  ledgerFreeDatabaseIdentitySha256,
  ledgerFreeSha256,
  verifyLedgerFreeForwardCutover,
} from './aios-ledger-free-forward-cutover-engine.mjs';

export const SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET = Object.freeze({
  checksum: '3e6f2e2133714a37903fd226effb260799172f30d8fbc54304d702c93b034159',
  executionMode: 'transactional',
  identity: 'backend/014',
  namespace: 'backend',
  relativePath: 'sql/migrations/014_sample_inventory_transaction_schema.sql',
  version: '014',
});

export const SAMPLE_INVENTORY_FORWARD_CUTOVER_HEALTH_CHECK_PATH =
  'etl/groland_postgres/tests/sql/sample_inventory_transaction_check.sql';

export const SAMPLE_INVENTORY_FORWARD_CUTOVER_TABLES = Object.freeze([
  'sample_inventory.settings',
  'sample_inventory.import_batches',
  'sample_inventory.samples',
  'sample_inventory.inbound_records',
  'sample_inventory.outbound_requests',
  'sample_inventory.inventory_movements',
  'sample_inventory.business_events',
]);

export const SAMPLE_INVENTORY_FORWARD_CUTOVER_FUNCTIONS = Object.freeze([
  'sample_inventory.set_updated_at()',
  'sample_inventory.reject_append_only_mutation()',
]);

export const SAMPLE_INVENTORY_FORWARD_CUTOVER_TRIGGERS = Object.freeze([
  ['sample_inventory.settings', 'trg_sample_inventory_settings_updated_at'],
  ['sample_inventory.samples', 'trg_sample_inventory_samples_updated_at'],
  ['sample_inventory.outbound_requests', 'trg_sample_inventory_outbound_updated_at'],
  ['sample_inventory.inventory_movements', 'trg_sample_inventory_movements_append_only'],
  ['sample_inventory.business_events', 'trg_sample_inventory_events_append_only'],
]);

export const SAMPLE_INVENTORY_FORWARD_CUTOVER_INDEXES = Object.freeze([
  'sample_inventory.uq_sample_inventory_samples_code_active',
  'sample_inventory.uq_sample_inventory_samples_legacy_identity',
  'sample_inventory.idx_sample_inventory_samples_active_updated',
  'sample_inventory.idx_sample_inventory_samples_active_low_stock',
  'sample_inventory.uq_sample_inventory_inbound_source_identity',
  'sample_inventory.idx_sample_inventory_inbound_occurred',
  'sample_inventory.idx_sample_inventory_inbound_sample',
  'sample_inventory.uq_sample_inventory_outbound_source_identity',
  'sample_inventory.idx_sample_inventory_outbound_active_status_requested',
  'sample_inventory.idx_sample_inventory_outbound_active_sample',
  'sample_inventory.idx_sample_inventory_outbound_active_department',
  'sample_inventory.idx_sample_inventory_movements_sample_time',
  'sample_inventory.idx_sample_inventory_movements_type_time',
  'sample_inventory.idx_sample_inventory_business_events_event_watermark',
  'sample_inventory.idx_sample_inventory_business_events_aggregate',
]);

export const SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS =
  1
  + SAMPLE_INVENTORY_FORWARD_CUTOVER_TABLES.length
  + SAMPLE_INVENTORY_FORWARD_CUTOVER_FUNCTIONS.length
  + SAMPLE_INVENTORY_FORWARD_CUTOVER_TRIGGERS.length
  + SAMPLE_INVENTORY_FORWARD_CUTOVER_INDEXES.length;

export const SAMPLE_INVENTORY_FORWARD_CUTOVER_ADVISORY_LOCK =
  'aios:sample-inventory-forward-cutover:backend-014:v1';

const TOPOLOGY_SQL = `/* sample_inventory_forward_cutover:topology */
WITH requested_tables(relation_name) AS (
  SELECT * FROM unnest($1::TEXT[])
), requested_functions(signature) AS (
  SELECT * FROM unnest($2::TEXT[])
), requested_triggers(relation_name, trigger_name) AS (
  SELECT * FROM unnest($3::TEXT[], $4::TEXT[])
), requested_indexes(relation_name) AS (
  SELECT * FROM unnest($5::TEXT[])
), effect_counts AS (
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
)
SELECT current_database() AS database_name,
       COALESCE(inet_server_addr()::TEXT, 'local') AS server_address,
       COALESCE(inet_server_port()::TEXT, 'local') AS server_port,
       current_setting('transaction_read_only') AS transaction_read_only,
       txid_current_if_assigned()::TEXT AS transaction_id,
       to_regclass('public.aios_schema_migrations') IS NOT NULL AS ledger_exists,
       effect_counts.schemas = 1 AS schema_exists,
       effect_counts.tables::INTEGER AS tables_present,
       effect_counts.functions::INTEGER AS functions_present,
       effect_counts.triggers::INTEGER AS triggers_present,
       effect_counts.indexes::INTEGER AS indexes_present,
       (effect_counts.schemas + effect_counts.tables + effect_counts.functions
         + effect_counts.triggers + effect_counts.indexes)::INTEGER AS effects_present
FROM effect_counts`;

const TRANSACTION_ID_SQL = `/* sample_inventory_forward_cutover:transaction_id */
SELECT txid_current_if_assigned()::TEXT AS transaction_id`;

export function sampleInventoryDatabaseIdentitySha256({ databaseName, serverAddress, serverPort }) {
  return ledgerFreeDatabaseIdentitySha256(
    { databaseName, serverAddress, serverPort },
    'Sample inventory forward cutover',
  );
}

function assertSourceContracts(migrationSql, healthCheckSql, record) {
  assertLedgerFreeMigrationBytes({
    label: 'Sample inventory forward cutover',
    migrationSql,
    record,
  });
  for (const token of [
    'CREATE SCHEMA IF NOT EXISTS sample_inventory',
    'CREATE TABLE sample_inventory.samples',
    'CREATE TABLE sample_inventory.business_events',
    'trg_sample_inventory_events_append_only',
  ]) {
    if (!migrationSql.includes(token)) throw new Error(`Sample inventory migration is missing ${token}.`);
  }
  for (const token of [
    'missing sample inventory transaction tables',
    'sample inventory available_quantity is not generated',
    'sample inventory append-only triggers are missing or disabled',
  ]) {
    if (!healthCheckSql.includes(token)) throw new Error(`Sample inventory health check is missing ${token}.`);
  }
}

export function prepareSampleInventoryForwardCutover({
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
    label: 'Sample inventory forward cutover',
    migrationAdvisoryLockKey,
  });
  if (!Array.isArray(records) || typeof migrationSql !== 'string' || typeof healthCheckSql !== 'string') {
    throw new Error('Sample inventory forward cutover repository inputs are incomplete.');
  }
  assertLedgerFreeGitState({
    expectedGitSha,
    git,
    label: 'Sample inventory forward cutover',
  });
  const record = assertLedgerFreeTargetRecord({
    expectedMigrationSha256,
    label: 'Sample inventory forward cutover',
    records,
    target: SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET,
  });
  assertSourceContracts(migrationSql, healthCheckSql, record);
  return Object.freeze({
    command,
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    git: Object.freeze({ ...git }),
    healthCheck: Object.freeze({
      path: SAMPLE_INVENTORY_FORWARD_CUTOVER_HEALTH_CHECK_PATH,
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
  ];
}

function normalizeTopology(row) {
  const topology = {
    databaseName: String(row?.database_name ?? ''),
    effectsPresent: Number(row?.effects_present ?? 0),
    functionsPresent: Number(row?.functions_present ?? 0),
    indexesPresent: Number(row?.indexes_present ?? 0),
    ledgerExists: row?.ledger_exists === true,
    schemaExists: row?.schema_exists === true,
    serverAddress: String(row?.server_address ?? ''),
    serverPort: String(row?.server_port ?? ''),
    tablesPresent: Number(row?.tables_present ?? 0),
    transactionId: row?.transaction_id ?? null,
    transactionReadOnly: String(row?.transaction_read_only ?? ''),
    triggersPresent: Number(row?.triggers_present ?? 0),
  };
  topology.catalogComplete = topology.effectsPresent === SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS;
  topology.catalogAbsent = !topology.schemaExists && topology.effectsPresent === 0;
  topology.expectedEffects = SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS;
  topology.databaseIdentitySha256 = sampleInventoryDatabaseIdentitySha256(topology);
  return topology;
}

async function readTopology(client) {
  const result = await client.query(TOPOLOGY_SQL, topologyParams());
  return normalizeTopology(result.rows?.[0]);
}

function assertDatabaseIdentity(topology, prepared) {
  if (topology.databaseName !== prepared.expectedDatabase) {
    throw new Error('Sample inventory forward cutover database identity differs from the explicit pin.');
  }
  if (prepared.expectedDatabaseIdentitySha256
    && topology.databaseIdentitySha256 !== prepared.expectedDatabaseIdentitySha256) {
    throw new Error('Sample inventory forward cutover database identity SHA-256 differs from the verified pin.');
  }
}

function verifyStatus(topology) {
  if (topology.ledgerExists) return 'blocked_ledger_present';
  if (topology.catalogAbsent) return 'ready_for_apply';
  if (topology.catalogComplete) return 'catalog_complete';
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
      identity: SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET.identity,
      relativePath: prepared.migration.relativePath,
      checksum: prepared.migration.checksum,
      executionMode: prepared.migration.executionMode,
      healthCheckPath: prepared.healthCheck.path,
      healthCheckSha256: prepared.healthCheck.sha256,
    },
  };
}

export async function verifySampleInventoryForwardCutover({
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
    isReady: (topology) => !topology.ledgerExists
      && (topology.catalogAbsent || topology.catalogComplete),
    label: 'Sample inventory forward cutover',
    lockTimeout,
    mode: 'sample_inventory_forward_cutover_verify',
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

export async function applySampleInventoryForwardCutover({
  client,
  lockTimeout = '5s',
  now = () => new Date(),
  prepared,
  statementTimeout = '60s',
}) {
  return applyLedgerFreeForwardCutover({
    assertBefore(topologyBefore) {
      if (topologyBefore.ledgerExists) {
        throw new Error('Sample inventory forward cutover refuses to run while the canonical migration ledger exists.');
      }
      if (!topologyBefore.catalogAbsent && !topologyBefore.catalogComplete) {
        throw new Error('Sample inventory forward cutover refuses partial or drifted sample_inventory topology.');
      }
    },
    assertDatabaseIdentity,
    assertPostconditions(topologyAfter) {
      if (topologyAfter.ledgerExists || !topologyAfter.catalogComplete) {
        throw new Error('Sample inventory forward cutover postconditions are incomplete or created ledger state.');
      }
    },
    baseResult,
    client,
    healthChecks: [{ stage: 'execute_health_check', sql: prepared.healthCheck.sql }],
    label: 'Sample inventory forward cutover',
    lockComment: 'sample_inventory_forward_cutover',
    lockTimeout,
    mode: 'sample_inventory_forward_cutover_apply',
    now,
    policy: ({ committed, migrationBodyExecuted }) => ({
      transaction: 'serializable',
      advisoryLock: 'transaction-scoped-runner-bootstrap-cutover',
      committed,
      databaseWrites: migrationBodyExecuted,
      ledgerWrites: false,
      migrationBodyExecuted,
      healthCheckExecuted: true,
      deployAuthorized: false,
      warehouseChanges: false,
    }),
    prepared,
    readTopology,
    shouldExecuteMigration: (topologyBefore) => topologyBefore.catalogAbsent,
    statementTimeout,
    targetAdvisoryLock: SAMPLE_INVENTORY_FORWARD_CUTOVER_ADVISORY_LOCK,
  });
}
