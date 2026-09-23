import {
  applyLedgerFreeForwardCutover,
  assertLedgerFreeGitState,
  assertLedgerFreePreparationContract,
  assertLedgerFreeTargetRecord,
  ledgerFreeDatabaseIdentitySha256,
  ledgerFreeSha256,
  verifyLedgerFreeForwardCutover,
} from './aios-ledger-free-forward-cutover-engine.mjs';

export const AGENT_CONTEXT_CUTOVER_TARGETS = Object.freeze([
  Object.freeze({
    checksum: '2814bfa143aef681bce064a1cc5343af8579121b183d5d3117f30b160935d43e',
    executionMode: 'self-transactional',
    identity: 'backend/018',
    namespace: 'backend',
    relativePath: 'sql/migrations/018_agent_context_governance.sql',
    version: '018',
  }),
  Object.freeze({
    checksum: '1e899e2feb2c8e8ac744f58f773067f53dbf706b106fa8a29e93389bfd377360',
    executionMode: 'self-transactional',
    identity: 'backend/019',
    namespace: 'backend',
    relativePath: 'sql/migrations/019_agent_sop_candidate_governance.sql',
    version: '019',
  }),
  Object.freeze({
    checksum: '76411945302128c8af208e3427eacdcf18abbfe58e59a6d9ba3944645132ba49',
    executionMode: 'self-transactional',
    identity: 'backend/020',
    namespace: 'backend',
    relativePath: 'sql/migrations/020_agent_sop_asset_lifecycle.sql',
    version: '020',
  }),
]);

export const AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256 =
  '831bc7db14567b8d33f83432b78d7f73b4e1eac617f6792d490961ff54ce4e76';

export const AGENT_CONTEXT_CUTOVER_ADVISORY_LOCK =
  'aios:agent-context-cutover:backend-018-020:v1';

const TARGET_RELATIONS = Object.freeze([
  'agent_accounts',
  'agent_account_members',
  'agent_projects',
  'agent_workspace_bindings',
  'agent_device_authorizations',
  'agent_experience_candidates',
  'agent_shared_assets',
  'agent_operations',
  'agent_audit_events',
  'agent_candidate_sources',
]);

const TARGET_COLUMNS = Object.freeze([
  'agent_experience_candidates.method',
  'agent_experience_candidates.sop_stable_key',
  'agent_experience_candidates.sop_semantic_version',
  'agent_experience_candidates.sop_owner_user_id',
  'agent_experience_candidates.sop_expires_at',
  'agent_experience_candidates.sop_supersedes_candidate_id',
  'agent_shared_assets.sop_stable_key',
  'agent_shared_assets.sop_semantic_version',
  'agent_shared_assets.sop_expires_at',
]);

const TARGET_INDEXES = Object.freeze([
  'idx_agent_projects_account_status',
  'idx_agent_bindings_user_workspace',
  'idx_agent_device_authorizations_expiry',
  'idx_agent_candidates_review_queue',
  'idx_agent_candidates_project',
  'idx_agent_shared_assets_retrieval',
  'idx_agent_audit_account_time',
  'idx_agent_sop_candidate_version',
  'idx_agent_candidate_sources_source',
  'idx_agent_shared_sop_active_version',
  'idx_agent_shared_sop_retrieval',
]);

const TARGET_CONSTRAINTS = Object.freeze([
  'agent_candidate_method_object',
  'agent_sop_candidate_metadata',
  'agent_shared_assets_asset_type_check',
  'agent_shared_sop_metadata',
]);

const TARGET_PERMISSIONS = Object.freeze([
  'agent:read',
  'agent:project:manage',
  'agent:candidate:submit',
  'agent:candidate:review',
  'agent:asset:publish',
  'agent:asset:revoke',
  'agent:runtime:manage',
]);

const TOPOLOGY_SQL = `/* agent_context_cutover:topology */
SELECT
  current_database() AS database_name,
  COALESCE(inet_server_addr()::TEXT, 'local') AS server_address,
  COALESCE(inet_server_port()::TEXT, 'local') AS server_port,
  current_setting('transaction_read_only') AS transaction_read_only,
  txid_current_if_assigned()::TEXT AS transaction_id,
  to_regclass('public.aios_schema_migrations') IS NOT NULL AS ledger_exists,
  (
    to_regclass('public.auth_permissions') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'auth_permissions' AND column_name = 'key'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = to_regclass('public.auth_permissions')
        AND contype IN ('p', 'u')
        AND pg_get_constraintdef(oid) ~ '^UNIQUE \\(key\\)$|^PRIMARY KEY \\(key\\)$'
    )
  ) AS prerequisite_topology_complete,
  (
    SELECT COUNT(*)::INTEGER
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname = ANY($1::TEXT[])
  ) AS target_relations_present,
  (
    SELECT COUNT(*)::INTEGER
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name || '.' || column_name) = ANY($2::TEXT[])
  ) AS target_columns_present,
  (
    SELECT COUNT(*)::INTEGER
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'i'
      AND relation.relname = ANY($3::TEXT[])
  ) AS target_indexes_present,
  (
    SELECT COUNT(*)::INTEGER
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conname = ANY($4::TEXT[])
  ) AS target_constraints_present,
  (
    SELECT COUNT(*)::INTEGER
    FROM pg_trigger
    WHERE tgname = 'agent_candidate_sources_immutable'
      AND tgrelid = to_regclass('public.agent_candidate_sources')
      AND NOT tgisinternal
  ) AS target_triggers_present,
  (
    SELECT COUNT(*)::INTEGER
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'prevent_agent_candidate_source_mutation'
      AND pg_get_function_identity_arguments(procedure.oid) = ''
  ) AS target_functions_present,
  CASE WHEN to_regclass('public.auth_permissions') IS NULL THEN 0 ELSE (
    SELECT COUNT(*)::INTEGER FROM auth_permissions WHERE key = ANY($5::TEXT[])
  ) END AS target_permissions_present`;

const TRANSACTION_ID_SQL = `/* agent_context_cutover:transaction_id */
SELECT txid_current_if_assigned()::TEXT AS transaction_id`;

const HEALTH_CHECK_SQL = `/* agent_context_cutover:independent_health */
DO $agent_context_health$
DECLARE
  relation_count INTEGER;
  column_count INTEGER;
  index_count INTEGER;
  constraint_count INTEGER;
  trigger_count INTEGER;
  function_count INTEGER;
  permission_count INTEGER;
BEGIN
  IF to_regclass('public.aios_schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'agent context cutover must not create or use the canonical ledger';
  END IF;
  SELECT COUNT(*) INTO relation_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
    AND relation.relname = ANY(ARRAY[${TARGET_RELATIONS.map((value) => `'${value}'`).join(', ')}]);
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (table_name || '.' || column_name) = ANY(ARRAY[${TARGET_COLUMNS.map((value) => `'${value}'`).join(', ')}]);
  SELECT COUNT(*) INTO index_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public' AND relation.relkind = 'i'
    AND relation.relname = ANY(ARRAY[${TARGET_INDEXES.map((value) => `'${value}'`).join(', ')}]);
  SELECT COUNT(*) INTO constraint_count FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace
    AND conname = ANY(ARRAY[${TARGET_CONSTRAINTS.map((value) => `'${value}'`).join(', ')}]);
  SELECT COUNT(*) INTO trigger_count FROM pg_trigger
  WHERE tgname = 'agent_candidate_sources_immutable'
    AND tgrelid = 'public.agent_candidate_sources'::regclass AND NOT tgisinternal;
  SELECT COUNT(*) INTO function_count
  FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'prevent_agent_candidate_source_mutation'
    AND pg_get_function_identity_arguments(procedure.oid) = '';
  SELECT COUNT(*) INTO permission_count FROM auth_permissions
  WHERE key = ANY(ARRAY[${TARGET_PERMISSIONS.map((value) => `'${value}'`).join(', ')}]);
  IF relation_count <> ${TARGET_RELATIONS.length}
    OR column_count <> ${TARGET_COLUMNS.length}
    OR index_count <> ${TARGET_INDEXES.length}
    OR constraint_count <> ${TARGET_CONSTRAINTS.length}
    OR trigger_count <> 1 OR function_count <> 1
    OR permission_count <> ${TARGET_PERMISSIONS.length} THEN
    RAISE EXCEPTION 'agent context cutover catalog health is incomplete';
  END IF;
END
$agent_context_health$;`;

function bundleManifestSha256(targets) {
  return ledgerFreeSha256(targets.map((target) => `${target.identity}\0${target.checksum}`).join('\n'));
}

function unwrapSelfTransactionalMigration(sql, target) {
  const matched = /^\s*BEGIN\s*;\s*([\s\S]*?)\s*COMMIT\s*;\s*$/iu.exec(sql);
  if (!matched || /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu.test(matched[1])) {
    throw new Error(`Agent context cutover ${target.identity} transaction wrapper drifted.`);
  }
  return `/* agent_context_cutover:${target.identity} */\n${matched[1].trim()}\n`;
}

function assertSourceContracts(records, migrationSqlByIdentity) {
  const preparedTargets = AGENT_CONTEXT_CUTOVER_TARGETS.map((target) => {
    const record = assertLedgerFreeTargetRecord({
      expectedMigrationSha256: target.checksum,
      label: 'Agent context cutover',
      records,
      target,
    });
    const sql = migrationSqlByIdentity[target.identity];
    if (typeof sql !== 'string'
      || Buffer.byteLength(sql) !== record.sizeBytes
      || ledgerFreeSha256(sql) !== record.checksum) {
      throw new Error(`Agent context cutover ${target.identity} bytes differ from discovery.`);
    }
    return Object.freeze({
      ...record,
      identity: target.identity,
      sql,
      unwrappedSql: unwrapSelfTransactionalMigration(sql, target),
    });
  });
  const sourceTokens = new Map([
    ['backend/018', ['CREATE TABLE IF NOT EXISTS agent_accounts', 'INSERT INTO auth_permissions']],
    ['backend/019', ['CREATE TABLE IF NOT EXISTS agent_candidate_sources', 'prevent_agent_candidate_source_mutation']],
    ['backend/020', ['agent_shared_assets_asset_type_check', 'idx_agent_shared_sop_active_version']],
  ]);
  for (const target of preparedTargets) {
    for (const token of sourceTokens.get(target.identity) ?? []) {
      if (!target.sql.includes(token)) {
        throw new Error(`Agent context cutover ${target.identity} is missing ${token}.`);
      }
    }
  }
  return preparedTargets;
}

export function agentContextDatabaseIdentitySha256(topology) {
  return ledgerFreeDatabaseIdentitySha256(topology, 'Agent context cutover');
}

export function prepareAgentContextCutover({
  command,
  expectedBundleSha256,
  expectedDatabase,
  expectedDatabaseIdentitySha256 = null,
  expectedGitSha,
  git,
  migrationAdvisoryLockKey,
  migrationSqlByIdentity,
  records,
}) {
  assertLedgerFreePreparationContract({
    command,
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    expectedMigrationSha256: expectedBundleSha256,
    label: 'Agent context cutover',
    migrationAdvisoryLockKey,
  });
  if (!Array.isArray(records) || !migrationSqlByIdentity || typeof migrationSqlByIdentity !== 'object') {
    throw new Error('Agent context cutover repository inputs are incomplete.');
  }
  assertLedgerFreeGitState({ expectedGitSha, git, label: 'Agent context cutover' });
  const migrations = assertSourceContracts(records, migrationSqlByIdentity);
  const actualBundleSha256 = bundleManifestSha256(migrations);
  if (actualBundleSha256 !== AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256
    || expectedBundleSha256 !== actualBundleSha256) {
    throw new Error('Agent context cutover bundle checksum drifted.');
  }
  const combinedSql = migrations.map((migration) => migration.unwrappedSql).join('\n');
  return Object.freeze({
    command,
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    git: Object.freeze({ ...git }),
    migration: Object.freeze({
      checksum: actualBundleSha256,
      executionMode: 'runner-managed-transactional-bundle',
      identity: 'backend/018-020',
      relativePath: migrations.map((migration) => migration.relativePath).join(','),
      sizeBytes: Buffer.byteLength(combinedSql),
      sql: combinedSql,
    }),
    migrations: Object.freeze(migrations),
    migrationAdvisoryLockKey,
  });
}

function normalizeTopology(row) {
  const topology = {
    databaseName: String(row?.database_name ?? ''),
    ledgerExists: row?.ledger_exists === true,
    prerequisiteTopologyComplete: row?.prerequisite_topology_complete === true,
    serverAddress: String(row?.server_address ?? ''),
    serverPort: String(row?.server_port ?? ''),
    targetColumnsPresent: Number(row?.target_columns_present ?? 0),
    targetConstraintsPresent: Number(row?.target_constraints_present ?? 0),
    targetFunctionsPresent: Number(row?.target_functions_present ?? 0),
    targetIndexesPresent: Number(row?.target_indexes_present ?? 0),
    targetPermissionsPresent: Number(row?.target_permissions_present ?? 0),
    targetRelationsPresent: Number(row?.target_relations_present ?? 0),
    targetTriggersPresent: Number(row?.target_triggers_present ?? 0),
    transactionId: row?.transaction_id ?? null,
    transactionReadOnly: String(row?.transaction_read_only ?? ''),
  };
  topology.databaseIdentitySha256 = agentContextDatabaseIdentitySha256(topology);
  topology.schemaEffectsPresent = topology.targetRelationsPresent
    + topology.targetColumnsPresent
    + topology.targetIndexesPresent
    + topology.targetConstraintsPresent
    + topology.targetTriggersPresent
    + topology.targetFunctionsPresent;
  topology.catalogComplete = topology.targetRelationsPresent === TARGET_RELATIONS.length
    && topology.targetColumnsPresent === TARGET_COLUMNS.length
    && topology.targetIndexesPresent === TARGET_INDEXES.length
    && topology.targetConstraintsPresent === TARGET_CONSTRAINTS.length
    && topology.targetTriggersPresent === 1
    && topology.targetFunctionsPresent === 1
    && topology.targetPermissionsPresent === TARGET_PERMISSIONS.length;
  return topology;
}

async function readTopology(client) {
  const result = await client.query(TOPOLOGY_SQL, [
    TARGET_RELATIONS,
    TARGET_COLUMNS,
    TARGET_INDEXES,
    TARGET_CONSTRAINTS,
    TARGET_PERMISSIONS,
  ]);
  return normalizeTopology(result.rows?.[0]);
}

function assertDatabaseIdentity(topology, prepared) {
  if (topology.databaseName !== prepared.expectedDatabase) {
    throw new Error('Agent context cutover database identity differs from the explicit pin.');
  }
  if (prepared.expectedDatabaseIdentitySha256
    && topology.databaseIdentitySha256 !== prepared.expectedDatabaseIdentitySha256) {
    throw new Error('Agent context cutover database identity SHA-256 differs from the verified pin.');
  }
}

function verifyStatus(topology) {
  if (topology.ledgerExists) return 'blocked_ledger_present';
  if (!topology.prerequisiteTopologyComplete) return 'blocked_prerequisite_topology';
  if (topology.catalogComplete) return 'catalog_complete';
  if (topology.schemaEffectsPresent > 0) return 'blocked_partial_topology';
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
    bundle: {
      checksum: prepared.migration.checksum,
      identity: prepared.migration.identity,
      migrations: prepared.migrations.map((migration) => ({
        checksum: migration.checksum,
        executionMode: migration.executionMode,
        identity: `${migration.namespace}/${migration.version}`,
        relativePath: migration.relativePath,
      })),
    },
  };
}

function topologyReady(topology, status) {
  return ['ready_for_apply', 'catalog_complete'].includes(status)
    && !topology.ledgerExists
    && topology.prerequisiteTopologyComplete;
}

export async function verifyAgentContextCutover({
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
    label: 'Agent context cutover',
    lockTimeout,
    mode: 'agent_context_cutover_verify',
    now,
    policy: {
      databaseWrites: false,
      deployAuthorized: false,
      ledgerWrites: false,
      migrationBodyExecuted: false,
      transactionIdAssigned: false,
      rolledBack: true,
      warehouseChanges: false,
    },
    prepared,
    readTopology,
    statementTimeout,
    transactionIdSql: TRANSACTION_ID_SQL,
    verifyStatus,
  });
}

export async function applyAgentContextCutover({
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
        throw new Error(`Agent context cutover is not ready: ${status}.`);
      }
    },
    assertDatabaseIdentity,
    assertPostconditions(topologyAfter) {
      if (verifyStatus(topologyAfter) !== 'catalog_complete') {
        throw new Error('Agent context cutover postconditions are incomplete or drifted.');
      }
    },
    baseResult,
    client,
    healthChecks: [{ stage: 'execute_independent_health_check', sql: HEALTH_CHECK_SQL }],
    label: 'Agent context cutover',
    lockComment: 'agent_context_cutover',
    lockTimeout,
    mode: 'agent_context_cutover_apply',
    now,
    policy: ({ committed, migrationBodyExecuted }) => ({
      committed,
      databaseWrites: migrationBodyExecuted,
      deployAuthorized: false,
      ledgerWrites: false,
      migrationBodyExecuted,
      warehouseChanges: false,
    }),
    prepared,
    readTopology,
    shouldExecuteMigration: (topologyBefore) => !topologyBefore.catalogComplete,
    statementTimeout,
    targetAdvisoryLock: AGENT_CONTEXT_CUTOVER_ADVISORY_LOCK,
  });
}
