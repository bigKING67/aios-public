import { createHash } from 'node:crypto';

import { AIOS_MIGRATION_LEDGER_BOOTSTRAP_ADVISORY_LOCK } from './aios-migration-ledger-bootstrap-sql.mjs';


const TIMEOUTS_SQL =
  "SELECT set_config('statement_timeout', $1, TRUE), set_config('lock_timeout', $2, TRUE)";


export function ledgerFreeSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}


export function ledgerFreeDatabaseIdentitySha256({ databaseName, serverAddress, serverPort }, label) {
  if (!databaseName || !serverAddress || !serverPort) {
    throw new Error(`${label} database identity fields are incomplete.`);
  }
  return ledgerFreeSha256(`${databaseName}\0${serverAddress}\0${serverPort}`);
}


export function assertLedgerFreeGitState({ expectedGitSha, git, label }) {
  if (git?.branch !== 'main') throw new Error(`${label} requires branch main.`);
  if (git.head !== expectedGitSha || git.originMain !== expectedGitSha) {
    throw new Error(`${label} requires HEAD, origin/main, and expected Git SHA parity.`);
  }
  if (String(git.status ?? '').trim()) {
    throw new Error(`${label} refuses a dirty worktree.`);
  }
}


export function assertLedgerFreeTargetRecord({
  expectedMigrationSha256,
  label,
  records,
  target,
}) {
  const matches = records.filter((record) => (
    `${record.namespace}/${record.version}` === target.identity
  ));
  if (matches.length !== 1) throw new Error(`${label} target is missing or duplicated.`);
  const [record] = matches;
  if (record.relativePath !== target.relativePath
    || record.executionMode !== target.executionMode
    || record.checksum !== target.checksum
    || record.checksum !== expectedMigrationSha256) {
    throw new Error(`${label} target identity, mode, path, or checksum drifted.`);
  }
  return record;
}


export function assertLedgerFreeMigrationBytes({ label, migrationSql, record }) {
  if (Buffer.byteLength(migrationSql) !== record.sizeBytes
    || ledgerFreeSha256(migrationSql) !== record.checksum) {
    throw new Error(`${label} migration bytes differ from discovery.`);
  }
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu.test(migrationSql)) {
    throw new Error(`${label} target must remain runner-managed transactional SQL.`);
  }
}


export function assertLedgerFreePreparationContract({
  command,
  expectedDatabase,
  expectedDatabaseIdentitySha256,
  expectedGitSha,
  expectedMigrationSha256,
  label,
  migrationAdvisoryLockKey,
}) {
  if (!['apply', 'verify'].includes(command)) {
    throw new Error(`${label} command must be apply or verify.`);
  }
  if (!/^[a-f0-9]{40}$/u.test(expectedGitSha ?? '')) {
    throw new Error(`${label} expected Git SHA must be 40 lowercase hex characters.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(expectedMigrationSha256 ?? '')) {
    throw new Error(`${label} expected migration SHA-256 must be 64 lowercase hex characters.`);
  }
  if (typeof expectedDatabase !== 'string'
    || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/u.test(expectedDatabase)) {
    throw new Error(`${label} expected database name is invalid.`);
  }
  if (expectedDatabaseIdentitySha256 !== null
    && !/^[a-f0-9]{64}$/u.test(expectedDatabaseIdentitySha256)) {
    throw new Error(`${label} expected database identity SHA-256 is invalid.`);
  }
  if (command === 'apply' && expectedDatabaseIdentitySha256 === null) {
    throw new Error(`${label} apply requires a verified database identity SHA-256.`);
  }
  if (typeof migrationAdvisoryLockKey !== 'string' || !migrationAdvisoryLockKey.trim()) {
    throw new Error(`${label} migration advisory lock key is missing.`);
  }
}


function decorateCutoverError(error, {
  committed,
  migrationBodyExecuted,
  queryCount,
  stage,
}) {
  const cutoverError = error instanceof Error ? error : new Error(String(error));
  cutoverError.cutoverStage = stage;
  cutoverError.cutoverCommitted = committed;
  if (migrationBodyExecuted !== undefined) {
    cutoverError.cutoverMigrationBodyExecuted = migrationBodyExecuted;
  }
  cutoverError.cutoverQueryCount = queryCount;
  return cutoverError;
}


export async function verifyLedgerFreeForwardCutover({
  assertDatabaseIdentity,
  baseResult,
  client,
  isReady,
  label,
  lockTimeout = '1s',
  mode,
  now = () => new Date(),
  policy,
  prepared,
  readTopology,
  statementTimeout = '15s',
  transactionIdSql,
  verifyStatus,
}) {
  if (prepared.command !== 'verify') {
    throw new Error(`${label} verify requires a verify-prepared contract.`);
  }
  let started = false;
  let queryCount = 0;
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    queryCount += 1;
    started = true;
    await client.query(TIMEOUTS_SQL, [statementTimeout, lockTimeout]);
    queryCount += 1;
    const topology = await readTopology(client);
    queryCount += 1;
    assertDatabaseIdentity(topology, prepared);
    if (topology.transactionReadOnly !== 'on') {
      throw new Error(`${label} verify transaction is not read-only.`);
    }
    const transactionId = (await client.query(transactionIdSql)).rows?.[0]?.transaction_id ?? null;
    queryCount += 1;
    if (transactionId !== null || topology.transactionId !== null) {
      throw new Error(`${label} verify unexpectedly assigned a transaction ID.`);
    }
    await client.query('ROLLBACK');
    queryCount += 1;
    started = false;
    const status = verifyStatus(topology);
    return {
      ...baseResult({
        generatedAt: now().toISOString(),
        mode,
        prepared,
        status,
        topology,
      }),
      ready: isReady(topology, status),
      topology,
      queryCount,
      policy,
    };
  } catch (error) {
    if (started) {
      await client.query('ROLLBACK').catch(() => {});
      queryCount += 1;
    }
    throw decorateCutoverError(error, {
      committed: false,
      queryCount,
      stage: 'verify',
    });
  }
}


export async function applyLedgerFreeForwardCutover({
  assertBefore,
  assertDatabaseIdentity,
  assertPostconditions,
  baseResult,
  client,
  healthChecks,
  label,
  lockComment,
  lockTimeout = '5s',
  mode,
  now = () => new Date(),
  policy,
  preMigrationChecks = [],
  preMigrationMutations = [],
  prepared,
  readTopology,
  shouldExecuteMigration,
  statementTimeout = '60s',
  targetAdvisoryLock,
}) {
  if (prepared.command !== 'apply') {
    throw new Error(`${label} apply requires an apply-prepared contract.`);
  }
  for (const mutation of preMigrationMutations) {
    if (typeof mutation?.stage !== 'string' || !mutation.stage
      || typeof mutation?.sql !== 'string' || !mutation.sql) {
      throw new Error(`${label} pre-migration mutation contract is invalid.`);
    }
    if (mutation.shouldExecute !== undefined && typeof mutation.shouldExecute !== 'function') {
      throw new Error(`${label} pre-migration mutation predicate is invalid.`);
    }
  }
  let committed = false;
  let migrationBodyExecuted = false;
  const preMigrationMutationStages = [];
  let queryCount = 0;
  let stage = 'begin';
  let started = false;
  let topologyBefore;
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    queryCount += 1;
    started = true;
    stage = 'configure_timeouts';
    await client.query(TIMEOUTS_SQL, [statementTimeout, lockTimeout]);
    queryCount += 1;
    stage = 'acquire_advisory_lock';
    await client.query(`/* ${lockComment}:advisory_locks */
SELECT pg_advisory_xact_lock(hashtext(lock_key))
FROM (
  SELECT unnest($1::TEXT[]) AS lock_key
  ORDER BY lock_key
) ordered_locks`, [[
      prepared.migrationAdvisoryLockKey,
      AIOS_MIGRATION_LEDGER_BOOTSTRAP_ADVISORY_LOCK,
      targetAdvisoryLock,
    ]]);
    queryCount += 1;
    stage = 'inspect_before';
    topologyBefore = await readTopology(client);
    queryCount += 1;
    assertDatabaseIdentity(topologyBefore, prepared);
    assertBefore(topologyBefore, prepared);

    for (const check of preMigrationChecks) {
      stage = check.stage;
      await client.query(check.sql);
      queryCount += 1;
    }
    if (shouldExecuteMigration(topologyBefore)) {
      for (const mutation of preMigrationMutations) {
        if (mutation.shouldExecute?.(topologyBefore, prepared) === false) continue;
        stage = mutation.stage;
        await client.query(mutation.sql);
        queryCount += 1;
        preMigrationMutationStages.push(mutation.stage);
      }
      stage = 'execute_migration';
      await client.query(prepared.migration.sql);
      queryCount += 1;
      migrationBodyExecuted = true;
    }
    for (const check of healthChecks) {
      stage = check.stage;
      await client.query(check.sql);
      queryCount += 1;
    }
    stage = 'inspect_after';
    const topologyAfter = await readTopology(client);
    queryCount += 1;
    assertDatabaseIdentity(topologyAfter, prepared);
    assertPostconditions(topologyAfter, prepared);
    stage = 'commit';
    await client.query('COMMIT');
    queryCount += 1;
    committed = true;
    started = false;
    return {
      ...baseResult({
        generatedAt: now().toISOString(),
        mode,
        prepared,
        status: migrationBodyExecuted ? 'applied' : 'already_applied_healthy',
        topology: topologyAfter,
      }),
      topology: { before: topologyBefore, after: topologyAfter },
      queryCount,
      policy: policy({ committed, migrationBodyExecuted, preMigrationMutationStages }),
      preMigrationMutationStages,
    };
  } catch (error) {
    if (started) {
      await client.query('ROLLBACK').catch(() => {});
      queryCount += 1;
    }
    throw decorateCutoverError(error, {
      committed,
      migrationBodyExecuted,
      queryCount,
      stage,
    });
  }
}
