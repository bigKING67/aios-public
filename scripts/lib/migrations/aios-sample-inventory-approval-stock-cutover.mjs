import {
  applyLedgerFreeForwardCutover,
  assertLedgerFreeGitState,
  assertLedgerFreeMigrationBytes,
  assertLedgerFreePreparationContract,
  assertLedgerFreeTargetRecord,
  ledgerFreeSha256,
  verifyLedgerFreeForwardCutover,
} from './aios-ledger-free-forward-cutover-engine.mjs';
import { sampleInventoryDatabaseIdentitySha256 } from './aios-sample-inventory-forward-cutover.mjs';

export const SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET = Object.freeze({
  checksum: 'ae33a1288ac304a37a811ae1a6386ef8e1dae2ccd7cf035f5fd69e43dd86e92e',
  executionMode: 'transactional',
  identity: 'backend/017',
  namespace: 'backend',
  relativePath: 'sql/migrations/017_sample_inventory_approval_stock_deduction.sql',
  version: '017',
});

export const SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_HEALTH_CHECK_PATH =
  'etl/groland_postgres/tests/sql/sample_inventory_approval_stock_cutover_check.sql';

export const SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_ADVISORY_LOCK =
  'aios:sample-inventory-approval-stock-cutover:backend-017:v1';

const TOPOLOGY_SQL = `/* sample_inventory_approval_stock_cutover:topology */
WITH prerequisite_relations(relation_name) AS (
  SELECT * FROM unnest($1::TEXT[])
), active_approved AS (
  SELECT outbound.id, outbound.sample_id, outbound.quantity
  FROM sample_inventory.outbound_requests AS outbound
  WHERE outbound.archived_at IS NULL
    AND outbound.status = 'approved'
), classified AS (
  SELECT
    approved.*,
    debit.approval_debit_count,
    debit.exact_debit_count,
    CASE
      WHEN debit.approval_debit_count = 0 AND debit.exact_debit_count = 0 THEN 'pending'
      WHEN debit.approval_debit_count = 1 AND debit.exact_debit_count = 1 THEN 'exact'
      ELSE 'malformed'
    END AS debit_state
  FROM active_approved AS approved
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (
        WHERE movement.movement_type = 'outbound_pending_to_approved'
      )::INTEGER AS approval_debit_count,
      COUNT(*) FILTER (
        WHERE movement.movement_type = 'outbound_pending_to_approved'
          AND movement.on_hand_delta = -approved.quantity
          AND movement.reserved_delta = 0
      )::INTEGER AS exact_debit_count
    FROM sample_inventory.inventory_movements AS movement
    WHERE movement.sample_id = approved.sample_id
      AND movement.source_type = 'outbound_request'
      AND movement.source_id = approved.id::TEXT
  ) AS debit ON TRUE
), candidate_totals AS (
  SELECT sample_id, COUNT(*)::INTEGER AS request_count, SUM(quantity)::BIGINT AS debit_quantity
  FROM classified
  WHERE debit_state = 'pending'
  GROUP BY sample_id
), impact AS (
  SELECT
    (SELECT COUNT(*) FROM classified)::INTEGER AS active_approved_requests,
    (SELECT COUNT(*) FROM classified WHERE debit_state = 'exact')::INTEGER AS exact_debited_requests,
    (SELECT COUNT(*) FROM classified WHERE debit_state = 'malformed')::INTEGER AS malformed_debit_requests,
    COALESCE(SUM(candidate_totals.request_count), 0)::INTEGER AS pending_debit_requests,
    COALESCE(SUM(candidate_totals.debit_quantity), 0)::BIGINT AS pending_debit_quantity,
    COUNT(candidate_totals.sample_id)::INTEGER AS affected_samples,
    COUNT(*) FILTER (WHERE sample.id IS NULL)::INTEGER AS missing_samples,
    COUNT(*) FILTER (
      WHERE sample.id IS NOT NULL
        AND (
          sample.on_hand_quantity - candidate_totals.debit_quantity < 0
          OR sample.on_hand_quantity - candidate_totals.debit_quantity < sample.reserved_quantity
        )
    )::INTEGER AS violating_samples
  FROM candidate_totals
  LEFT JOIN sample_inventory.samples AS sample
    ON sample.id = candidate_totals.sample_id
   AND sample.archived_at IS NULL
)
SELECT
  current_database() AS database_name,
  COALESCE(inet_server_addr()::TEXT, 'local') AS server_address,
  COALESCE(inet_server_port()::TEXT, 'local') AS server_port,
  current_setting('transaction_read_only') AS transaction_read_only,
  txid_current_if_assigned()::TEXT AS transaction_id,
  to_regclass('public.aios_schema_migrations') IS NOT NULL AS ledger_exists,
  (SELECT COUNT(*) FROM prerequisite_relations
    WHERE to_regclass(relation_name) IS NOT NULL)::INTEGER AS prerequisite_relations_present,
  impact.*
FROM impact`;

const TRANSACTION_ID_SQL = `/* sample_inventory_approval_stock_cutover:transaction_id */
SELECT txid_current_if_assigned()::TEXT AS transaction_id`;

const PREREQUISITE_RELATIONS = Object.freeze([
  'sample_inventory.samples',
  'sample_inventory.outbound_requests',
  'sample_inventory.inventory_movements',
  'sample_inventory.business_events',
  'sample_inventory.mutation_requests',
]);

function assertSourceContracts(migrationSql, healthCheckSql, record) {
  assertLedgerFreeMigrationBytes({
    label: 'Sample inventory approval-stock cutover',
    migrationSql,
    record,
  });
  for (const token of [
    "status = 'approved'",
    "movement_type = 'outbound_pending_to_approved'",
    "'system:approval-stock-migration'",
    "'backfill_existing_approved_stock'",
  ]) {
    if (!migrationSql.includes(token)) {
      throw new Error(`Sample inventory approval-stock migration is missing ${token}.`);
    }
  }
  for (const token of [
    'active approved outbound debit contract is incomplete or malformed',
    'approval debit movement is missing its matching business event',
    'sample inventory balance contract is invalid after approval-stock cutover',
  ]) {
    if (!healthCheckSql.includes(token)) {
      throw new Error(`Sample inventory approval-stock health check is missing ${token}.`);
    }
  }
}

export function prepareSampleInventoryApprovalStockCutover({
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
    label: 'Sample inventory approval-stock cutover',
    migrationAdvisoryLockKey,
  });
  if (!Array.isArray(records) || typeof migrationSql !== 'string' || typeof healthCheckSql !== 'string') {
    throw new Error('Sample inventory approval-stock cutover repository inputs are incomplete.');
  }
  assertLedgerFreeGitState({
    expectedGitSha,
    git,
    label: 'Sample inventory approval-stock cutover',
  });
  const record = assertLedgerFreeTargetRecord({
    expectedMigrationSha256,
    label: 'Sample inventory approval-stock cutover',
    records,
    target: SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET,
  });
  assertSourceContracts(migrationSql, healthCheckSql, record);
  return Object.freeze({
    command,
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    git: Object.freeze({ ...git }),
    healthCheck: Object.freeze({
      path: SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_HEALTH_CHECK_PATH,
      sha256: ledgerFreeSha256(healthCheckSql),
      sql: healthCheckSql,
    }),
    migration: Object.freeze({ ...record, sql: migrationSql }),
    migrationAdvisoryLockKey,
  });
}

function normalizeTopology(row) {
  const topology = {
    activeApprovedRequests: Number(row?.active_approved_requests ?? 0),
    affectedSamples: Number(row?.affected_samples ?? 0),
    databaseName: String(row?.database_name ?? ''),
    exactDebitedRequests: Number(row?.exact_debited_requests ?? 0),
    ledgerExists: row?.ledger_exists === true,
    malformedDebitRequests: Number(row?.malformed_debit_requests ?? 0),
    missingSamples: Number(row?.missing_samples ?? 0),
    pendingDebitQuantity: Number(row?.pending_debit_quantity ?? 0),
    pendingDebitRequests: Number(row?.pending_debit_requests ?? 0),
    prerequisiteRelationsPresent: Number(row?.prerequisite_relations_present ?? 0),
    serverAddress: String(row?.server_address ?? ''),
    serverPort: String(row?.server_port ?? ''),
    transactionId: row?.transaction_id ?? null,
    transactionReadOnly: String(row?.transaction_read_only ?? ''),
    violatingSamples: Number(row?.violating_samples ?? 0),
  };
  topology.expectedPrerequisiteRelations = PREREQUISITE_RELATIONS.length;
  topology.prerequisiteTopologyComplete =
    topology.prerequisiteRelationsPresent === topology.expectedPrerequisiteRelations;
  topology.debitComplete = topology.pendingDebitRequests === 0
    && topology.exactDebitedRequests === topology.activeApprovedRequests
    && topology.malformedDebitRequests === 0;
  topology.databaseIdentitySha256 = sampleInventoryDatabaseIdentitySha256(topology);
  return topology;
}

async function readTopology(client) {
  const result = await client.query(TOPOLOGY_SQL, [PREREQUISITE_RELATIONS]);
  return normalizeTopology(result.rows?.[0]);
}

function assertDatabaseIdentity(topology, prepared) {
  if (topology.databaseName !== prepared.expectedDatabase) {
    throw new Error('Sample inventory approval-stock cutover database identity differs from the explicit pin.');
  }
  if (prepared.expectedDatabaseIdentitySha256
    && topology.databaseIdentitySha256 !== prepared.expectedDatabaseIdentitySha256) {
    throw new Error('Sample inventory approval-stock cutover database identity SHA-256 differs from the verified pin.');
  }
}

function verifyStatus(topology) {
  if (topology.ledgerExists) return 'blocked_ledger_present';
  if (!topology.prerequisiteTopologyComplete) return 'blocked_prerequisite_topology';
  if (topology.malformedDebitRequests > 0) return 'blocked_malformed_debits';
  if (topology.missingSamples > 0) return 'blocked_missing_samples';
  if (topology.violatingSamples > 0) return 'blocked_invalid_stock';
  if (topology.debitComplete) return 'approval_debits_complete';
  return 'ready_for_apply';
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
      identity: SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.identity,
      relativePath: prepared.migration.relativePath,
      checksum: prepared.migration.checksum,
      executionMode: prepared.migration.executionMode,
      healthCheckPath: prepared.healthCheck.path,
      healthCheckSha256: prepared.healthCheck.sha256,
    },
  };
}

function topologyReady(topology, status) {
  return ['ready_for_apply', 'approval_debits_complete'].includes(status)
    && !topology.ledgerExists
    && topology.prerequisiteTopologyComplete
    && topology.malformedDebitRequests === 0
    && topology.missingSamples === 0
    && topology.violatingSamples === 0;
}

export async function verifySampleInventoryApprovalStockCutover({
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
    isReady: topologyReady,
    label: 'Sample inventory approval-stock cutover',
    lockTimeout,
    mode: 'sample_inventory_approval_stock_cutover_verify',
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

export async function applySampleInventoryApprovalStockCutover({
  client,
  lockTimeout = '5s',
  now = () => new Date(),
  prepared,
  statementTimeout = '60s',
}) {
  return applyLedgerFreeForwardCutover({
    assertBefore(topologyBefore) {
      const status = verifyStatus(topologyBefore);
      if (!topologyReady(topologyBefore, status)) {
        throw new Error(`Sample inventory approval-stock cutover is not ready: ${status}.`);
      }
    },
    assertDatabaseIdentity,
    assertPostconditions(topologyAfter) {
      if (topologyAfter.ledgerExists
        || !topologyAfter.prerequisiteTopologyComplete
        || !topologyAfter.debitComplete
        || topologyAfter.malformedDebitRequests > 0
        || topologyAfter.missingSamples > 0
        || topologyAfter.violatingSamples > 0) {
        throw new Error('Sample inventory approval-stock cutover postconditions are incomplete or drifted.');
      }
    },
    baseResult,
    client,
    healthChecks: [{ stage: 'execute_health_check', sql: prepared.healthCheck.sql }],
    label: 'Sample inventory approval-stock cutover',
    lockComment: 'sample_inventory_approval_stock_cutover',
    lockTimeout,
    mode: 'sample_inventory_approval_stock_cutover_apply',
    now,
    policy: ({ committed, migrationBodyExecuted }) => ({
      committed,
      databaseWrites: migrationBodyExecuted,
      ledgerWrites: false,
      migrationBodyExecuted,
      businessRowsEmitted: migrationBodyExecuted,
      deployAuthorized: false,
      warehouseChanges: false,
    }),
    prepared,
    readTopology,
    shouldExecuteMigration: (topologyBefore) => topologyBefore.pendingDebitRequests > 0,
    statementTimeout,
    targetAdvisoryLock: SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_ADVISORY_LOCK,
  });
}
