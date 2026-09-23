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

export const TAOBAO_GOODS_FORWARD_CUTOVER_TARGET = Object.freeze({
  checksum: 'dcc27f4b4da1c802c4b2a910b4786c07df91e75e1659bd9add96fae4967b737f',
  executionMode: 'transactional',
  identity: 'warehouse/20260806_1140',
  namespace: 'warehouse',
  relativePath: 'etl/groland_postgres/sql/migrations/20260806_1140__repair_taobao_goods_ads_column_contract.sql',
  version: '20260806_1140',
});

export const TAOBAO_GOODS_FORWARD_CUTOVER_HEALTH_CHECK_PATH =
  'etl/groland_postgres/tests/sql/taobao_trade_sale_goods_daily_check.sql';

export const TAOBAO_GOODS_FORWARD_CUTOVER_ADVISORY_LOCK =
  'aios:taobao-goods-forward-cutover:warehouse-20260806-1140:v1';

const TOPOLOGY_SQL = `/* taobao_goods_forward_cutover:topology */
WITH procedure_contract AS (
  SELECT
    to_regprocedure('ads.refresh_taobao_trade_sale_goods_daily(date,date)') IS NOT NULL
      AS procedure_exists,
    COALESCE(
      pg_get_functiondef(
        to_regprocedure('ads.refresh_taobao_trade_sale_goods_daily(date,date)')
      ),
      ''
    ) AS procedure_definition,
    COALESCE(
      pg_get_functiondef(
        to_regprocedure('ads.refresh_taobao_trade_sale_goods_daily_unchecked(date,date)')
      ),
      pg_get_functiondef(
        to_regprocedure('ads.refresh_taobao_trade_sale_goods_daily(date,date)')
      ),
      ''
    ) AS mapping_procedure_definition
), business_column_mismatches AS (
  SELECT COUNT(*)::INTEGER AS mismatch_count
  FROM (
    SELECT
      COALESCE(ods.column_name, ads.column_name) AS column_name,
      ods.data_type AS ods_data_type,
      ads.data_type AS ads_data_type,
      ods.udt_name AS ods_udt_name,
      ads.udt_name AS ads_udt_name
    FROM (
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'ods'
        AND table_name = 'taobao_trade_sale_goods_raw'
    ) ods
    FULL OUTER JOIN (
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'ads'
        AND table_name = 'taobao_trade_sale_goods_daily'
        AND column_name <> 'etl_loaded_at'
    ) ads USING (column_name)
    WHERE ods.column_name IS NULL
       OR ads.column_name IS NULL
       OR ods.data_type IS DISTINCT FROM ads.data_type
       OR ods.udt_name IS DISTINCT FROM ads.udt_name
  ) mismatches
)
SELECT
  current_database() AS database_name,
  COALESCE(inet_server_addr()::TEXT, 'local') AS server_address,
  COALESCE(inet_server_port()::TEXT, 'local') AS server_port,
  current_setting('transaction_read_only') AS transaction_read_only,
  txid_current_if_assigned()::TEXT AS transaction_id,
  to_regclass('public.aios_schema_migrations') IS NOT NULL AS ledger_exists,
  to_regclass('ods.taobao_trade_sale_goods_raw') IS NOT NULL AS source_table_exists,
  to_regclass('ads.taobao_trade_sale_goods_daily') IS NOT NULL AS target_table_exists,
  to_regclass('etl.taobao_trade_sale_goods_daily_refresh_state') IS NOT NULL AS refresh_state_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ods'
      AND table_name = 'taobao_trade_sale_goods_raw'
      AND column_name = 'crowd_ad_favorite_cart_cost'
      AND data_type = 'numeric'
      AND is_nullable = 'YES'
  ) AS source_column_valid,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'taobao_trade_sale_goods_daily'
      AND column_name = 'crowd_ad_favorite_cart_cost'
  ) AS target_column_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'taobao_trade_sale_goods_daily'
      AND column_name = 'crowd_ad_favorite_cart_cost'
      AND data_type = 'numeric'
      AND is_nullable = 'YES'
  ) AS target_column_valid,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'taobao_trade_sale_goods_daily'
      AND column_name = 'etl_loaded_at'
      AND data_type = 'timestamp without time zone'
      AND is_nullable = 'NO'
  ) AS operational_column_valid,
  business_column_mismatches.mismatch_count AS business_column_mismatches,
  procedure_contract.procedure_exists,
  procedure_contract.procedure_definition
FROM procedure_contract
CROSS JOIN business_column_mismatches`;

const TRANSACTION_ID_SQL = `/* taobao_goods_forward_cutover:transaction_id */
SELECT txid_current_if_assigned()::TEXT AS transaction_id`;

export function taobaoGoodsDatabaseIdentitySha256({ databaseName, serverAddress, serverPort }) {
  return ledgerFreeDatabaseIdentitySha256(
    { databaseName, serverAddress, serverPort },
    'Taobao goods forward cutover',
  );
}

function assertSourceContracts(migrationSql, healthCheckSql, record) {
  assertLedgerFreeMigrationBytes({
    label: 'Taobao goods forward cutover',
    migrationSql,
    record,
  });
  for (const token of [
    'ADD COLUMN IF NOT EXISTS crowd_ad_favorite_cart_cost NUMERIC',
    'CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily',
    'src.crowd_ad_favorite_cart_cost',
  ]) {
    if (!migrationSql.includes(token)) throw new Error(`Taobao goods migration is missing ${token}.`);
  }
  if (/\bCALL\s+ads\.refresh_taobao_trade_sale_goods_daily\b/iu.test(migrationSql)) {
    throw new Error('Taobao goods migration must not refresh business rows during schema cutover.');
  }
  for (const token of [
    'ODS/ADS business column contract mismatch',
    'refresh procedure must not use SELECT src.*',
    'refresh procedure is missing crowd_ad_favorite_cart_cost mapping',
  ]) {
    if (!healthCheckSql.includes(token)) throw new Error(`Taobao goods health check is missing ${token}.`);
  }
}

export function prepareTaobaoGoodsForwardCutover({
  command,
  expectedDatabase,
  expectedDatabaseIdentitySha256 = null,
  expectedGitSha,
  expectedMigrationSha256,
  expectedProcedureSha256 = null,
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
    label: 'Taobao goods forward cutover',
    migrationAdvisoryLockKey,
  });
  if (expectedProcedureSha256 !== null && !/^[a-f0-9]{64}$/u.test(expectedProcedureSha256)) {
    throw new Error('Taobao goods forward cutover expected current procedure SHA-256 is invalid.');
  }
  if (command === 'apply' && expectedProcedureSha256 === null) {
    throw new Error('Taobao goods forward cutover apply requires the verified current procedure SHA-256.');
  }
  if (!Array.isArray(records) || typeof migrationSql !== 'string' || typeof healthCheckSql !== 'string') {
    throw new Error('Taobao goods forward cutover repository inputs are incomplete.');
  }
  assertLedgerFreeGitState({
    expectedGitSha,
    git,
    label: 'Taobao goods forward cutover',
  });
  const record = assertLedgerFreeTargetRecord({
    expectedMigrationSha256,
    label: 'Taobao goods forward cutover',
    records,
    target: TAOBAO_GOODS_FORWARD_CUTOVER_TARGET,
  });
  assertSourceContracts(migrationSql, healthCheckSql, record);
  return Object.freeze({
    command,
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    expectedProcedureSha256,
    git: Object.freeze({ ...git }),
    healthCheck: Object.freeze({
      path: TAOBAO_GOODS_FORWARD_CUTOVER_HEALTH_CHECK_PATH,
      sha256: ledgerFreeSha256(healthCheckSql),
      sql: healthCheckSql,
    }),
    migration: Object.freeze({ ...record, sql: migrationSql }),
    migrationAdvisoryLockKey,
  });
}

function normalizeTopology(row) {
  const procedureDefinition = String(row?.procedure_definition ?? '');
  const mappingProcedureDefinition = String(
    row?.mapping_procedure_definition ?? procedureDefinition,
  );
  const topology = {
    businessColumnMismatches: Number(row?.business_column_mismatches ?? 0),
    databaseName: String(row?.database_name ?? ''),
    ledgerExists: row?.ledger_exists === true,
    operationalColumnValid: row?.operational_column_valid === true,
    procedureExists: row?.procedure_exists === true,
    procedureMapsNewColumn: /src\.crowd_ad_favorite_cart_cost/iu.test(mappingProcedureDefinition),
    procedureSha256: procedureDefinition ? ledgerFreeSha256(procedureDefinition) : null,
    procedureUsesSourceStar: /SELECT\s+src\.\*/iu.test(mappingProcedureDefinition),
    refreshStateExists: row?.refresh_state_exists === true,
    serverAddress: String(row?.server_address ?? ''),
    serverPort: String(row?.server_port ?? ''),
    sourceColumnValid: row?.source_column_valid === true,
    sourceTableExists: row?.source_table_exists === true,
    targetColumnPresent: row?.target_column_present === true,
    targetColumnValid: row?.target_column_valid === true,
    targetTableExists: row?.target_table_exists === true,
    transactionId: row?.transaction_id ?? null,
    transactionReadOnly: String(row?.transaction_read_only ?? ''),
  };
  topology.databaseIdentitySha256 = taobaoGoodsDatabaseIdentitySha256(topology);
  delete topology.serverAddress;
  delete topology.serverPort;
  topology.basePrerequisitesReady = topology.sourceTableExists
    && topology.targetTableExists
    && topology.refreshStateExists
    && topology.sourceColumnValid
    && topology.operationalColumnValid
    && topology.procedureExists;
  topology.contractHealthy = topology.basePrerequisitesReady
    && topology.targetColumnValid
    && topology.businessColumnMismatches === 0
    && topology.procedureMapsNewColumn
    && !topology.procedureUsesSourceStar;
  topology.contractReadyForApply = topology.basePrerequisitesReady
    && !topology.targetColumnPresent
    && topology.businessColumnMismatches === 1;
  topology.contractState = topology.contractHealthy
    ? 'healthy'
    : topology.contractReadyForApply
      ? 'ready_for_apply'
      : topology.basePrerequisitesReady
        ? 'partial_or_drifted'
        : 'prerequisite_drifted';
  return topology;
}

async function readTopology(client) {
  const result = await client.query(TOPOLOGY_SQL);
  return normalizeTopology(result.rows?.[0]);
}

function assertDatabaseIdentity(topology, prepared) {
  if (topology.databaseName !== prepared.expectedDatabase) {
    throw new Error('Taobao goods forward cutover database identity differs from the explicit pin.');
  }
  if (prepared.expectedDatabaseIdentitySha256
    && topology.databaseIdentitySha256 !== prepared.expectedDatabaseIdentitySha256) {
    throw new Error('Taobao goods forward cutover database identity SHA-256 differs from the verified pin.');
  }
}

function verifyStatus(topology) {
  if (topology.ledgerExists) return 'blocked_ledger_present';
  if (topology.contractHealthy) return 'already_applied_healthy';
  if (topology.contractReadyForApply) return 'ready_for_apply';
  if (!topology.basePrerequisitesReady) return 'blocked_prerequisite_drift';
  return 'blocked_partial_or_drifted';
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
      identity: TAOBAO_GOODS_FORWARD_CUTOVER_TARGET.identity,
      relativePath: prepared.migration.relativePath,
      checksum: prepared.migration.checksum,
      executionMode: prepared.migration.executionMode,
      healthCheckPath: prepared.healthCheck.path,
      healthCheckSha256: prepared.healthCheck.sha256,
    },
  };
}

export async function verifyTaobaoGoodsForwardCutover({
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
      && (topology.contractReadyForApply || topology.contractHealthy),
    label: 'Taobao goods forward cutover',
    lockTimeout,
    mode: 'taobao_goods_forward_cutover_verify',
    now,
    policy: {
      businessRowsEmitted: false,
      databaseWrites: false,
      ledgerWrites: false,
      migrationBodyExecuted: false,
      transactionIdAssigned: false,
      rolledBack: true,
      deployAuthorized: false,
    },
    prepared,
    readTopology,
    statementTimeout,
    transactionIdSql: TRANSACTION_ID_SQL,
    verifyStatus,
  });
}

export async function applyTaobaoGoodsForwardCutover({
  client,
  lockTimeout = '5s',
  now = () => new Date(),
  prepared,
  statementTimeout = '120s',
}) {
  return applyLedgerFreeForwardCutover({
    assertBefore(topologyBefore) {
      if (topologyBefore.ledgerExists) {
        throw new Error('Taobao goods forward cutover blocked because the canonical migration ledger exists.');
      }
      if (!topologyBefore.contractHealthy && !topologyBefore.contractReadyForApply) {
        throw new Error('Taobao goods forward cutover blocked by partial or drifted prerequisites.');
      }
      if (topologyBefore.procedureSha256 !== prepared.expectedProcedureSha256) {
        throw new Error('Taobao goods forward cutover current procedure differs from the verified pin.');
      }
    },
    assertDatabaseIdentity,
    assertPostconditions(topologyAfter) {
      if (topologyAfter.ledgerExists || !topologyAfter.contractHealthy) {
        throw new Error('Taobao goods forward cutover postconditions are incomplete.');
      }
    },
    baseResult,
    client,
    healthChecks: [{ stage: 'execute_health_check', sql: prepared.healthCheck.sql }],
    label: 'Taobao goods forward cutover',
    lockComment: 'taobao_goods_forward_cutover',
    lockTimeout,
    mode: 'taobao_goods_forward_cutover_apply',
    now,
    policy: ({ committed, migrationBodyExecuted }) => ({
      businessRowsChanged: false,
      committed,
      databaseWrites: migrationBodyExecuted,
      ledgerWrites: false,
      migrationBodyExecuted,
      deployAuthorized: false,
      refreshExecuted: false,
    }),
    prepared,
    readTopology,
    shouldExecuteMigration: (topologyBefore) => topologyBefore.contractReadyForApply,
    statementTimeout,
    targetAdvisoryLock: TAOBAO_GOODS_FORWARD_CUTOVER_ADVISORY_LOCK,
  });
}
