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


const LABEL = 'Taobao goods schema contract forward cutover';

export const TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET = Object.freeze({
  checksum: '91d6677a9e46edf28c47babaeaa343b943dca39a6e6e5f591d87c63cf96809ad',
  executionMode: 'transactional',
  identity: 'warehouse/20260806_1900',
  namespace: 'warehouse',
  relativePath: 'etl/groland_postgres/sql/migrations/20260806_1900__enforce_taobao_goods_ads_schema_contract.sql',
  version: '20260806_1900',
});

export const TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE = Object.freeze({
  checksum: '6c4263936cb45195a24d4b8f0ea035d796cac16cb1ce0d5e295f273b4f0aebe7',
  executionMode: 'transactional',
  identity: 'warehouse/20260806_1850',
  namespace: 'warehouse',
  relativePath: 'etl/groland_postgres/sql/migrations/20260806_1850__normalize_taobao_goods_favorite_cart_cost_metadata.sql',
  version: '20260806_1850',
});

export const TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_HEALTH_CHECK_PATH =
  'etl/groland_postgres/tests/sql/taobao_trade_sale_goods_daily_schema_contract_check.sql';

export const TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_ADVISORY_LOCK =
  'aios:taobao-goods-schema-contract-forward-cutover:warehouse-20260806-1900:v1';

const TOPOLOGY_SQL = `/* taobao_goods_schema_contract_forward_cutover:topology */
WITH procedure_contract AS (
  SELECT
    to_regprocedure('ads.refresh_taobao_trade_sale_goods_daily(date,date)') IS NOT NULL
      AS full_wrapper_exists,
    to_regprocedure(
      'ads.refresh_taobao_trade_sale_goods_daily_incremental(integer,boolean)'
    ) IS NOT NULL AS incremental_wrapper_exists,
    to_regprocedure(
      'ads.refresh_taobao_trade_sale_goods_daily_unchecked(date,date)'
    ) IS NOT NULL AS full_internal_exists,
    to_regprocedure(
      'ads.refresh_taobao_trade_sale_goods_daily_incremental_unchecked(integer,boolean)'
    ) IS NOT NULL AS incremental_internal_exists,
    to_regprocedure(
      'ads.assert_taobao_trade_sale_goods_daily_schema_contract()'
    ) IS NOT NULL AS assertion_exists,
    COALESCE((
      SELECT prosecdef
      FROM pg_proc
      WHERE oid = to_regprocedure('ads.refresh_taobao_trade_sale_goods_daily(date,date)')
    ), FALSE) AS full_wrapper_security_definer,
    COALESCE((
      SELECT prosecdef
      FROM pg_proc
      WHERE oid = to_regprocedure(
        'ads.refresh_taobao_trade_sale_goods_daily_incremental(integer,boolean)'
      )
    ), FALSE) AS incremental_wrapper_security_definer,
    COALESCE(pg_get_functiondef(
      to_regprocedure('ads.refresh_taobao_trade_sale_goods_daily(date,date)')
    ), '') AS full_wrapper_definition,
    COALESCE(pg_get_functiondef(to_regprocedure(
      'ads.refresh_taobao_trade_sale_goods_daily_incremental(integer,boolean)'
    )), '') AS incremental_wrapper_definition,
    COALESCE(pg_get_functiondef(to_regprocedure(
      'ads.assert_taobao_trade_sale_goods_daily_schema_contract()'
    )), '') AS assertion_definition,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM pg_proc procedure
      CROSS JOIN LATERAL aclexplode(
        COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
      ) privilege
      WHERE procedure.oid IN (
        to_regprocedure('ads.assert_taobao_trade_sale_goods_daily_schema_contract()'),
        to_regprocedure('ads.refresh_taobao_trade_sale_goods_daily_unchecked(date,date)'),
        to_regprocedure(
          'ads.refresh_taobao_trade_sale_goods_daily_incremental_unchecked(integer,boolean)'
        )
      )
        AND privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    ), 0) AS internal_public_execute_count
), business_column_mismatches AS (
  SELECT COUNT(*)::INTEGER AS mismatch_count
  FROM (
    SELECT COALESCE(source.column_name, target.column_name) AS column_name
    FROM (
      SELECT
        column_name, data_type, udt_schema, udt_name, is_nullable,
        character_maximum_length, numeric_precision, numeric_scale, datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'ods'
        AND table_name = 'taobao_trade_sale_goods_raw'
    ) source
    FULL OUTER JOIN (
      SELECT
        column_name, data_type, udt_schema, udt_name, is_nullable,
        character_maximum_length, numeric_precision, numeric_scale, datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'ads'
        AND table_name = 'taobao_trade_sale_goods_daily'
        AND column_name <> 'etl_loaded_at'
    ) target USING (column_name)
    WHERE source.column_name IS NULL
       OR target.column_name IS NULL
       OR source.data_type IS DISTINCT FROM target.data_type
       OR source.udt_schema IS DISTINCT FROM target.udt_schema
       OR source.udt_name IS DISTINCT FROM target.udt_name
       OR source.is_nullable IS DISTINCT FROM target.is_nullable
       OR source.character_maximum_length IS DISTINCT FROM target.character_maximum_length
       OR source.numeric_precision IS DISTINCT FROM target.numeric_precision
       OR source.numeric_scale IS DISTINCT FROM target.numeric_scale
       OR source.datetime_precision IS DISTINCT FROM target.datetime_precision
  ) mismatches
), metadata_normalization_contract AS (
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns source
    JOIN information_schema.columns target USING (column_name)
    WHERE source.table_schema = 'ods'
      AND source.table_name = 'taobao_trade_sale_goods_raw'
      AND target.table_schema = 'ads'
      AND target.table_name = 'taobao_trade_sale_goods_daily'
      AND source.column_name = 'crowd_ad_favorite_cart_cost'
      AND source.data_type = 'numeric'
      AND source.udt_schema = 'pg_catalog'
      AND source.udt_name = 'numeric'
      AND source.is_nullable = 'YES'
      AND source.numeric_precision = 18
      AND source.numeric_scale = 2
      AND target.data_type = 'numeric'
      AND target.udt_schema = 'pg_catalog'
      AND target.udt_name = 'numeric'
      AND target.is_nullable = 'YES'
      AND target.numeric_precision IS NULL
      AND target.numeric_scale IS NULL
  ) AS ready
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
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ads'
      AND table_name = 'taobao_trade_sale_goods_daily'
      AND column_name = 'etl_loaded_at'
      AND data_type = 'timestamp without time zone'
      AND udt_schema = 'pg_catalog'
      AND udt_name = 'timestamp'
      AND is_nullable = 'NO'
      AND lower(regexp_replace(COALESCE(column_default, ''), '[[:space:]]', '', 'g'))
        IN ('now()', 'current_timestamp')
  ) AS operational_column_valid,
  business_column_mismatches.mismatch_count AS business_column_mismatches,
  metadata_normalization_contract.ready AS metadata_normalization_ready,
  procedure_contract.*
FROM procedure_contract
CROSS JOIN business_column_mismatches
CROSS JOIN metadata_normalization_contract`;

const TRANSACTION_ID_SQL = `/* taobao_goods_schema_contract_forward_cutover:transaction_id */
SELECT txid_current_if_assigned()::TEXT AS transaction_id`;


export function taobaoGoodsSchemaContractDatabaseIdentitySha256(fields) {
  return ledgerFreeDatabaseIdentitySha256(fields, LABEL);
}


function assertSourceContracts(migrationSql, healthCheckSql, record) {
  assertLedgerFreeMigrationBytes({ label: LABEL, migrationSql, record });
  for (const token of [
    'assert_taobao_trade_sale_goods_daily_schema_contract',
    'refresh_taobao_trade_sale_goods_daily_unchecked',
    'refresh_taobao_trade_sale_goods_daily_incremental_unchecked',
    'source.numeric_precision IS DISTINCT FROM target.numeric_precision',
    'REVOKE ALL',
  ]) {
    if (!migrationSql.includes(token)) throw new Error(`${LABEL} migration is missing ${token}.`);
  }
  for (const token of [
    'full refresh wrapper does not assert before delegating',
    'incremental wrapper does not assert before delegating',
    'internal schema/refresh entrypoints remain PUBLIC executable',
  ]) {
    if (!healthCheckSql.includes(token)) throw new Error(`${LABEL} health check is missing ${token}.`);
  }
}


function assertMetadataPrerequisiteContracts(migrationSql, record) {
  assertLedgerFreeMigrationBytes({ label: LABEL, migrationSql, record });
  for (const token of [
    'crowd_ad_favorite_cart_cost <> round(crowd_ad_favorite_cart_cost, 2)',
    'ALTER COLUMN crowd_ad_favorite_cart_cost TYPE NUMERIC(18, 2)',
    'USING crowd_ad_favorite_cart_cost::NUMERIC(18, 2)',
  ]) {
    if (!migrationSql.includes(token)) {
      throw new Error(`${LABEL} metadata prerequisite is missing ${token}.`);
    }
  }
}


export function prepareTaobaoGoodsSchemaContractForwardCutover({
  command,
  expectedDatabase,
  expectedDatabaseIdentitySha256 = null,
  expectedGitSha,
  expectedMigrationSha256,
  expectedPrerequisiteMigrationSha256,
  expectedRuntimeContractSha256 = null,
  git,
  healthCheckSql,
  migrationAdvisoryLockKey,
  migrationSql,
  prerequisiteMigrationSql,
  records,
}) {
  assertLedgerFreePreparationContract({
    command,
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    expectedMigrationSha256,
    label: LABEL,
    migrationAdvisoryLockKey,
  });
  if (expectedRuntimeContractSha256 !== null
    && !/^[a-f0-9]{64}$/u.test(expectedRuntimeContractSha256)) {
    throw new Error(`${LABEL} expected runtime contract SHA-256 is invalid.`);
  }
  if (command === 'apply' && expectedRuntimeContractSha256 === null) {
    throw new Error(`${LABEL} apply requires the verified runtime contract SHA-256.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(expectedPrerequisiteMigrationSha256 ?? '')) {
    throw new Error(`${LABEL} expected prerequisite migration SHA-256 is invalid.`);
  }
  if (!Array.isArray(records)
    || typeof migrationSql !== 'string'
    || typeof prerequisiteMigrationSql !== 'string'
    || typeof healthCheckSql !== 'string') {
    throw new Error(`${LABEL} repository inputs are incomplete.`);
  }
  assertLedgerFreeGitState({ expectedGitSha, git, label: LABEL });
  const record = assertLedgerFreeTargetRecord({
    expectedMigrationSha256,
    label: LABEL,
    records,
    target: TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET,
  });
  assertSourceContracts(migrationSql, healthCheckSql, record);
  const prerequisiteRecord = assertLedgerFreeTargetRecord({
    expectedMigrationSha256: expectedPrerequisiteMigrationSha256,
    label: `${LABEL} metadata prerequisite`,
    records,
    target: TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE,
  });
  assertMetadataPrerequisiteContracts(prerequisiteMigrationSql, prerequisiteRecord);
  return Object.freeze({
    command,
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    expectedRuntimeContractSha256,
    git: Object.freeze({ ...git }),
    healthCheck: Object.freeze({
      path: TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_HEALTH_CHECK_PATH,
      sha256: ledgerFreeSha256(healthCheckSql),
      sql: healthCheckSql,
    }),
    migration: Object.freeze({ ...record, sql: migrationSql }),
    migrationAdvisoryLockKey,
    prerequisiteMigration: Object.freeze({
      ...prerequisiteRecord,
      sql: prerequisiteMigrationSql,
    }),
  });
}


function normalizeTopology(row) {
  const fullDefinition = String(row?.full_wrapper_definition ?? '');
  const incrementalDefinition = String(row?.incremental_wrapper_definition ?? '');
  const assertionDefinition = String(row?.assertion_definition ?? '');
  const topology = {
    assertionExists: row?.assertion_exists === true,
    businessColumnMismatches: Number(row?.business_column_mismatches ?? 0),
    databaseName: String(row?.database_name ?? ''),
    fullInternalExists: row?.full_internal_exists === true,
    fullWrapperSecurityDefiner: row?.full_wrapper_security_definer === true,
    fullWrapperExists: row?.full_wrapper_exists === true,
    incrementalInternalExists: row?.incremental_internal_exists === true,
    incrementalWrapperSecurityDefiner: row?.incremental_wrapper_security_definer === true,
    incrementalWrapperExists: row?.incremental_wrapper_exists === true,
    internalPublicExecuteCount: Number(row?.internal_public_execute_count ?? 0),
    ledgerExists: row?.ledger_exists === true,
    metadataNormalizationReady: row?.metadata_normalization_ready === true,
    operationalColumnValid: row?.operational_column_valid === true,
    refreshStateExists: row?.refresh_state_exists === true,
    serverAddress: String(row?.server_address ?? ''),
    serverPort: String(row?.server_port ?? ''),
    sourceTableExists: row?.source_table_exists === true,
    targetTableExists: row?.target_table_exists === true,
    transactionId: row?.transaction_id ?? null,
    transactionReadOnly: String(row?.transaction_read_only ?? ''),
  };
  topology.databaseIdentitySha256 = taobaoGoodsSchemaContractDatabaseIdentitySha256(topology);
  delete topology.serverAddress;
  delete topology.serverPort;
  topology.runtimeContractSha256 = fullDefinition && incrementalDefinition
    ? ledgerFreeSha256(`${fullDefinition}\0${incrementalDefinition}`)
    : null;
  topology.basePrerequisitesReady = topology.sourceTableExists
    && topology.targetTableExists
    && topology.refreshStateExists
    && topology.fullWrapperExists
    && topology.incrementalWrapperExists
    && topology.operationalColumnValid
    && (
      topology.businessColumnMismatches === 0
      || (topology.businessColumnMismatches === 1 && topology.metadataNormalizationReady)
    );
  const wrapperContractReady = /assert_taobao_trade_sale_goods_daily_schema_contract/iu.test(fullDefinition)
    && /refresh_taobao_trade_sale_goods_daily_unchecked/iu.test(fullDefinition)
    && /assert_taobao_trade_sale_goods_daily_schema_contract/iu.test(incrementalDefinition)
    && /refresh_taobao_trade_sale_goods_daily_incremental_unchecked/iu.test(incrementalDefinition);
  const assertionContractReady = [
    'character_maximum_length',
    'numeric_precision',
    'numeric_scale',
    'datetime_precision',
    'etl_loaded_at',
  ].every((token) => assertionDefinition.includes(token));
  topology.contractHealthy = topology.basePrerequisitesReady
    && topology.businessColumnMismatches === 0
    && topology.assertionExists
    && topology.fullInternalExists
    && topology.incrementalInternalExists
    && topology.fullWrapperSecurityDefiner
    && topology.incrementalWrapperSecurityDefiner
    && wrapperContractReady
    && assertionContractReady
    && topology.internalPublicExecuteCount === 0;
  const derivedEffectsPresent = Number(topology.assertionExists)
    + Number(topology.fullInternalExists)
    + Number(topology.incrementalInternalExists);
  topology.contractReadyForApply = topology.basePrerequisitesReady
    && derivedEffectsPresent === 0;
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
    throw new Error(`${LABEL} database identity differs from the explicit pin.`);
  }
  if (prepared.expectedDatabaseIdentitySha256
    && topology.databaseIdentitySha256 !== prepared.expectedDatabaseIdentitySha256) {
    throw new Error(`${LABEL} database identity SHA-256 differs from the verified pin.`);
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
      identity: TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET.identity,
      relativePath: prepared.migration.relativePath,
      checksum: prepared.migration.checksum,
      executionMode: prepared.migration.executionMode,
      healthCheckPath: prepared.healthCheck.path,
      healthCheckSha256: prepared.healthCheck.sha256,
    },
    prerequisiteMigration: {
      identity: TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE.identity,
      relativePath: prepared.prerequisiteMigration.relativePath,
      checksum: prepared.prerequisiteMigration.checksum,
      executionMode: prepared.prerequisiteMigration.executionMode,
    },
  };
}


export async function verifyTaobaoGoodsSchemaContractForwardCutover({
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
    label: LABEL,
    lockTimeout,
    mode: 'taobao_goods_schema_contract_forward_cutover_verify',
    now,
    policy: {
      businessRowsEmitted: false,
      databaseWrites: false,
      deployAuthorized: false,
      ledgerWrites: false,
      migrationBodyExecuted: false,
      rolledBack: true,
      transactionIdAssigned: false,
    },
    prepared,
    readTopology,
    statementTimeout,
    transactionIdSql: TRANSACTION_ID_SQL,
    verifyStatus,
  });
}


export async function applyTaobaoGoodsSchemaContractForwardCutover({
  client,
  lockTimeout = '5s',
  now = () => new Date(),
  prepared,
  statementTimeout = '120s',
}) {
  return applyLedgerFreeForwardCutover({
    assertBefore(topologyBefore) {
      if (topologyBefore.ledgerExists) {
        throw new Error(`${LABEL} blocked because the canonical migration ledger exists.`);
      }
      if (!topologyBefore.contractHealthy && !topologyBefore.contractReadyForApply) {
        throw new Error(`${LABEL} blocked by partial or drifted prerequisites.`);
      }
      if (topologyBefore.runtimeContractSha256 !== prepared.expectedRuntimeContractSha256) {
        throw new Error(`${LABEL} current runtime contract differs from the verified pin.`);
      }
    },
    assertDatabaseIdentity,
    assertPostconditions(topologyAfter) {
      if (topologyAfter.ledgerExists || !topologyAfter.contractHealthy) {
        throw new Error(`${LABEL} postconditions are incomplete.`);
      }
    },
    baseResult,
    client,
    healthChecks: [{ stage: 'execute_health_check', sql: prepared.healthCheck.sql }],
    label: LABEL,
    lockComment: 'taobao_goods_schema_contract_forward_cutover',
    lockTimeout,
    mode: 'taobao_goods_schema_contract_forward_cutover_apply',
    now,
    policy: ({ committed, migrationBodyExecuted, preMigrationMutationStages }) => ({
      businessRowsChanged: false,
      committed,
      databaseWrites: migrationBodyExecuted,
      deployAuthorized: false,
      ledgerWrites: false,
      migrationBodyExecuted,
      prerequisiteMigrationBodyExecuted:
        preMigrationMutationStages.includes('normalize_target_metadata'),
      refreshExecuted: false,
    }),
    preMigrationMutations: [{
      shouldExecute: (topologyBefore) => topologyBefore.metadataNormalizationReady,
      sql: prepared.prerequisiteMigration.sql,
      stage: 'normalize_target_metadata',
    }],
    prepared,
    readTopology,
    shouldExecuteMigration: (topologyBefore) => topologyBefore.contractReadyForApply,
    statementTimeout,
    targetAdvisoryLock: TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_ADVISORY_LOCK,
  });
}
