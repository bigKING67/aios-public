import { createHash } from 'node:crypto';

import { assertAiosMigrationHistory } from './aios-migration-history.mjs';
import {
  assertCanonicalAiosMigrationLedgerSchema,
  AIOS_MIGRATION_LEDGER_CANONICAL_SCHEMA_SQL,
  aiosMigrationLedgerSelectSql,
} from './aios-migration-ledger-contract.mjs';
import {
  AIOS_MIGRATION_LEDGER_BOOTSTRAP_REPOSITORY_SOURCE_PATHS,
  AIOS_MIGRATION_LEDGER_BOOTSTRAP_SOURCE_ARTIFACT_KEYS,
  validateAiosMigrationLedgerBootstrapManifest,
} from './aios-migration-ledger-bootstrap-manifest.mjs';
import {
  buildAiosMigrationLedgerBootstrapInsert,
  AIOS_MIGRATION_LEDGER_BOOTSTRAP_ADVISORY_LOCK,
  AIOS_MIGRATION_LEDGER_BOOTSTRAP_LOCK_SQL,
  AIOS_MIGRATION_LEDGER_BOOTSTRAP_TIMEOUT_SQL,
} from './aios-migration-ledger-bootstrap-sql.mjs';
import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';

const DEFAULT_CHUNK_SIZE = 250;
const MAX_CHUNK_SIZE = 500;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function rowIdentity(row) {
  return `${row.namespace}/${row.version}`;
}

function normalizeDatabaseRow(row) {
  return {
    namespace: row.namespace,
    version: row.version,
    checksum: row.checksum,
    appVersion: row.app_version ?? row.appVersion,
    executionMode: row.execution_mode ?? row.executionMode,
    exceptionKind: row.exception_kind ?? row.exceptionKind ?? null,
    decisionArtifactSha256:
      row.decision_artifact_sha256 ?? row.decisionArtifactSha256 ?? null,
  };
}

function historyRows(rows) {
  return rows.map((row, index) => ({
    namespace: row.namespace,
    version: row.version,
    checksum: row.checksum,
    app_version: row.appVersion,
    execution_mode: row.executionMode,
    exception_kind: row.exceptionKind,
    decision_artifact_sha256: row.decisionArtifactSha256,
    applied_at: String(index + 1).padStart(8, '0'),
  }));
}

function assertExactRows(actualRows, expectedRows, label) {
  const actual = actualRows.map(normalizeDatabaseRow);
  if (JSON.stringify(actual) !== JSON.stringify(expectedRows)) {
    const actualIdentities = actual.map(rowIdentity).join(',') || 'none';
    const expectedIdentities = expectedRows.map(rowIdentity).join(',') || 'none';
    throw new Error(
      `${label} differs from the pinned manifest; expected ${expectedIdentities}; got ${actualIdentities}.`,
    );
  }
  return actual;
}

function assertGitState(git, expectedSha) {
  if (git?.branch !== 'main') {
    throw new Error('Migration ledger bootstrap requires branch main.');
  }
  if (git.head !== expectedSha || git.originMain !== expectedSha) {
    throw new Error('Migration ledger bootstrap requires HEAD, origin/main, and manifest Git SHA parity.');
  }
  if (String(git.status ?? '').trim()) {
    throw new Error('Migration ledger bootstrap refuses a dirty worktree.');
  }
}

function assertRepositorySources(manifest, repositorySources) {
  for (const [key, sourcePath] of Object.entries(
    AIOS_MIGRATION_LEDGER_BOOTSTRAP_REPOSITORY_SOURCE_PATHS,
  )) {
    const source = repositorySources?.[key];
    if (typeof source !== 'string' || !source) {
      throw new Error(`Migration ledger bootstrap repository source ${key} is missing.`);
    }
    const metadata = manifest.repository.sources[key];
    if (metadata.path !== sourcePath
      || metadata.bytes !== Buffer.byteLength(source)
      || metadata.sha256 !== sha256(source)) {
      throw new Error(`Migration ledger bootstrap repository source ${key} differs from the manifest pin.`);
    }
  }
}

function artifactIdentity(artifact) {
  return {
    path: artifact?.path,
    bytes: artifact?.bytes,
    sha256: artifact?.sha256,
  };
}

function assertSourceArtifacts(manifest, sourceArtifactInputs) {
  for (const key of AIOS_MIGRATION_LEDGER_BOOTSTRAP_SOURCE_ARTIFACT_KEYS) {
    const expected = manifest.sourceArtifacts[key];
    const actual = sourceArtifactInputs?.[key]?.metadata;
    assertPinnedMigrationReviewArtifact(
      actual,
      expected.sha256,
      `Migration ledger bootstrap ${key} artifact`,
    );
    if (actual.path !== expected.path || actual.bytes !== expected.bytes) {
      throw new Error(`Migration ledger bootstrap ${key} artifact metadata differs from the manifest.`);
    }
  }
}

function planLedgerRow(row) {
  return {
    namespace: row.namespace,
    version: row.version,
    checksum: row.checksum,
    executionMode: row.executionMode,
    exceptionKind: row.exceptionKind ?? null,
    decisionArtifactSha256: row.decisionArtifactSha256 ?? null,
  };
}

function assertBootstrapPlanChain(manifest, sourceArtifactInputs) {
  const plan = sourceArtifactInputs?.bootstrapPlan?.data;
  if (plan?.schemaVersion !== 3
    || plan.mode !== 'offline_readonly_migration_ledger_bootstrap_plan'
    || plan.summary?.writePlanReady !== true
    || plan.policy?.networkAccess !== false
    || plan.policy?.productionWritesAuthorized !== false
    || plan.policy?.ledgerWritesAuthorized !== false
    || plan.policy?.ledgerSchemaMutationSupported !== true
    || plan.policy?.writerImplemented !== true
    || plan.repositoryEvidence?.runner?.ledgerSchemaWriterVersion !== 2
    || plan.repositoryEvidence?.runner?.writerImplemented !== true
    || plan.repositoryEvidence?.runner?.ledgerSchemaMutationSupported !== true
    || plan.sourceState?.manifestReconciled !== true
    || plan.sourceState?.manifestReadyForLedgerBootstrap !== true
    || !Array.isArray(plan.outputContract?.sqlStatements)
    || plan.outputContract.sqlStatements.length !== 0
    || !Array.isArray(plan.outputContract?.productionCommands)
    || plan.outputContract.productionCommands.length !== 0) {
    throw new Error('Migration ledger bootstrap plan is not a Stage D write-ready offline plan.');
  }
  const planArtifactMap = {
    exceptionOverlay: plan.sourceArtifacts?.exceptionOverlay,
    ownerDecisions: plan.sourceArtifacts?.decisions,
    reconciliation: plan.sourceArtifacts?.manifest,
  };
  for (const [key, planArtifact] of Object.entries(planArtifactMap)) {
    if (JSON.stringify(artifactIdentity(planArtifact))
      !== JSON.stringify(artifactIdentity(manifest.sourceArtifacts[key]))) {
      throw new Error(`Migration ledger bootstrap plan ${key} pin differs from the write manifest.`);
    }
  }
  const expectedPlanRows = manifest.ledger.expectedRows.map(planLedgerRow);
  if (JSON.stringify(plan.ledgerRows?.map(planLedgerRow) ?? [])
    !== JSON.stringify(expectedPlanRows)) {
    throw new Error('Migration ledger bootstrap plan rows differ from the write manifest prefix.');
  }
  const runnerSourceKeyMap = {
    bootstrapSql: 'bootstrapSql',
    bootstrapWriter: 'bootstrapWriter',
    historyComparator: 'historyComparator',
    ledgerContract: 'ledgerContract',
    ledgerDdl: 'canonicalDdl',
    ledgerV1ToV2Ddl: 'v1ToV2Ddl',
  };
  for (const [planKey, manifestKey] of Object.entries(runnerSourceKeyMap)) {
    const planSource = plan.repositoryEvidence.runner.sources?.[planKey];
    const manifestSource = manifest.repository.sources[manifestKey];
    if (planSource?.path !== manifestSource.path
      || planSource?.bytes !== manifestSource.bytes
      || planSource?.sha256 !== manifestSource.sha256) {
      throw new Error(`Migration ledger bootstrap plan runner source ${planKey} differs from the write manifest.`);
    }
  }
}

function assertDdlSource(source, label, requiredTokens) {
  if (typeof source !== 'string' || /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu.test(source)) {
    throw new Error(`${label} must contain caller-transactional DDL without transaction boundaries.`);
  }
  for (const token of requiredTokens) {
    if (!source.includes(token)) throw new Error(`${label} is missing required token ${token}.`);
  }
}

function assertManifestPrefixes(manifest, records) {
  const existingSchemaVersion = manifest.ledger.expectedSchema === 'canonical-v1' ? 1 : 2;
  assertAiosMigrationHistory(records, historyRows(manifest.ledger.existingRows), {
    ledgerSchemaVersion: existingSchemaVersion,
  });
  assertAiosMigrationHistory(records, historyRows(manifest.ledger.expectedRows), {
    ledgerSchemaVersion: 2,
  });
}

function normalizeChunkSize(value) {
  const chunkSize = value ?? DEFAULT_CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
    throw new Error(`Migration ledger bootstrap chunkSize must be between 1 and ${MAX_CHUNK_SIZE}.`);
  }
  return chunkSize;
}

export function aiosMigrationLedgerDatabaseIdentitySha256(schemaRow) {
  const databaseName = String(schemaRow?.database_name ?? schemaRow?.databaseName ?? '');
  const serverAddress = String(
    schemaRow?.server_address ?? schemaRow?.serverAddress ?? 'local',
  );
  const serverPort = String(schemaRow?.server_port ?? schemaRow?.serverPort ?? 'local');
  if (!databaseName) throw new Error('Migration ledger bootstrap could not identify the database.');
  return sha256(`${databaseName}\0${serverAddress}\0${serverPort}`);
}

export function prepareAiosMigrationLedgerBootstrap({
  appVersion,
  canonicalDdl,
  chunkSize,
  git,
  manifest,
  manifestArtifact,
  manifestSha256,
  records,
  repositorySources,
  sourceArtifactInputs,
  v1ToV2Ddl,
}) {
  assertPinnedMigrationReviewArtifact(
    manifestArtifact,
    manifestSha256,
    'Migration ledger bootstrap manifest',
  );
  const validatedManifest = validateAiosMigrationLedgerBootstrapManifest(manifest);
  if (validatedManifest.repository.appVersion !== appVersion) {
    throw new Error('Migration ledger bootstrap app version differs from the manifest.');
  }
  assertGitState(git, validatedManifest.repository.gitSha);
  assertRepositorySources(validatedManifest, repositorySources);
  assertSourceArtifacts(validatedManifest, sourceArtifactInputs);
  assertBootstrapPlanChain(validatedManifest, sourceArtifactInputs);
  assertDdlSource(canonicalDdl, 'Canonical migration ledger v2 DDL', [
    'CREATE TABLE IF NOT EXISTS public.aios_schema_migrations',
    "'exception'",
    'aios_schema_migrations_exception_metadata_check',
  ]);
  assertDdlSource(v1ToV2Ddl, 'Migration ledger v1-to-v2 DDL', [
    'ADD COLUMN exception_kind TEXT',
    'ADD COLUMN decision_artifact_sha256 TEXT',
    'aios_schema_migrations_exception_metadata_check',
  ]);
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Migration ledger bootstrap requires the repository migration inventory.');
  }
  assertManifestPrefixes(validatedManifest, records);
  return Object.freeze({
    appVersion,
    canonicalDdl,
    chunkSize: normalizeChunkSize(chunkSize),
    git: Object.freeze({ ...git }),
    manifest: validatedManifest,
    manifestArtifact: Object.freeze({ ...manifestArtifact }),
    records,
    v1ToV2Ddl,
  });
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function executeAiosMigrationLedgerBootstrap({
  client,
  lockTimeout = '5s',
  now = () => new Date(),
  prepared,
  statementTimeout = '30s',
}) {
  const queryLog = [];
  const query = async (sql, params = []) => {
    queryLog.push({ params: params.length, sql: String(sql) });
    return client.query(sql, params);
  };
  let transactionStarted = false;
  let committed = false;
  let stage = 'begin';
  let schemaBefore;
  let schemaMutation = 'none';
  let insertedRows = 0;
  const insertChunks = chunks(prepared.manifest.ledger.rowsToInsert, prepared.chunkSize);
  try {
    await query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    transactionStarted = true;
    stage = 'configure_timeouts';
    await query(AIOS_MIGRATION_LEDGER_BOOTSTRAP_TIMEOUT_SQL, [lockTimeout, statementTimeout]);
    stage = 'acquire_advisory_lock';
    await query(AIOS_MIGRATION_LEDGER_BOOTSTRAP_LOCK_SQL, [
      AIOS_MIGRATION_LEDGER_BOOTSTRAP_ADVISORY_LOCK,
    ]);
    stage = 'inspect_schema';
    const schemaBeforeRow = (await query(AIOS_MIGRATION_LEDGER_CANONICAL_SCHEMA_SQL)).rows?.[0];
    schemaBefore = assertCanonicalAiosMigrationLedgerSchema(schemaBeforeRow);
    if (schemaBefore.status !== prepared.manifest.ledger.expectedSchema) {
      throw new Error(
        `Migration ledger schema state differs from the manifest; expected ${prepared.manifest.ledger.expectedSchema}; got ${schemaBefore.status}.`,
      );
    }
    const databaseIdentitySha256 = aiosMigrationLedgerDatabaseIdentitySha256(schemaBeforeRow);
    if (databaseIdentitySha256 !== prepared.manifest.database.identitySha256) {
      throw new Error('Migration ledger bootstrap database identity differs from the manifest.');
    }
    stage = 'verify_existing_rows';
    const existingDatabaseRows = schemaBefore.exists
      ? (await query(aiosMigrationLedgerSelectSql(schemaBefore.version))).rows ?? []
      : [];
    assertExactRows(
      existingDatabaseRows,
      prepared.manifest.ledger.existingRows,
      'Migration ledger existing rows',
    );
    stage = 'upgrade_schema';
    if (schemaBefore.status === 'missing') {
      await query(prepared.canonicalDdl);
      schemaMutation = 'create_v2';
    } else if (schemaBefore.status === 'canonical-v1') {
      await query(prepared.v1ToV2Ddl);
      schemaMutation = 'upgrade_v1_to_v2';
    }
    stage = 'insert_rows';
    for (const rowChunk of insertChunks) {
      const insert = buildAiosMigrationLedgerBootstrapInsert(rowChunk);
      const result = await query(insert.sql, insert.params);
      insertedRows += result.rowCount ?? result.rows?.length ?? 0;
    }
    if (insertedRows !== prepared.manifest.ledger.rowsToInsert.length) {
      throw new Error('Migration ledger bootstrap insert count differs from the manifest.');
    }
    stage = 'verify_schema';
    const schemaAfterRow = (await query(AIOS_MIGRATION_LEDGER_CANONICAL_SCHEMA_SQL)).rows?.[0];
    const schemaAfter = assertCanonicalAiosMigrationLedgerSchema(schemaAfterRow);
    if (schemaAfter.status !== 'canonical-v2'
      || aiosMigrationLedgerDatabaseIdentitySha256(schemaAfterRow)
        !== prepared.manifest.database.identitySha256) {
      throw new Error('Migration ledger bootstrap did not produce canonical v2 on the pinned database.');
    }
    stage = 'verify_expected_rows';
    const finalDatabaseRows = (await query(aiosMigrationLedgerSelectSql(2))).rows ?? [];
    const finalRows = assertExactRows(
      finalDatabaseRows,
      prepared.manifest.ledger.expectedRows,
      'Migration ledger final rows',
    );
    assertAiosMigrationHistory(prepared.records, historyRows(finalRows), {
      ledgerSchemaVersion: 2,
    });
    stage = 'commit';
    await query('COMMIT');
    committed = true;
    transactionStarted = false;
    const queryUpperBound = 9 + insertChunks.length;
    if (queryLog.length > queryUpperBound) {
      throw new Error('Migration ledger bootstrap exceeded its bounded query contract.');
    }
    return {
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      mode: 'aios_migration_ledger_bootstrap_result',
      status: 'succeeded',
      sourceArtifact: prepared.manifestArtifact,
      git: prepared.git,
      database: {
        identitySha256: prepared.manifest.database.identitySha256,
      },
      schema: {
        before: schemaBefore.status,
        mutation: schemaMutation,
        after: 'canonical-v2',
      },
      rows: {
        before: prepared.manifest.ledger.existingRows.length,
        requested: prepared.manifest.ledger.rowsToInsert.length,
        inserted: insertedRows,
        after: prepared.manifest.ledger.expectedRows.length,
      },
      queryStats: {
        total: queryLog.length,
        bulkInsertChunks: insertChunks.length,
        upperBound: queryUpperBound,
        noNPlusOne: true,
      },
      policy: {
        transaction: 'serializable',
        advisoryLock: 'transaction-scoped',
        committed,
        migrationBodiesExecuted: false,
        deployAuthorized: false,
        arkInvoked: false,
        sqlIncludedInArtifact: false,
      },
    };
  } catch (error) {
    if (transactionStarted) await query('ROLLBACK').catch(() => {});
    const bootstrapError = error instanceof Error ? error : new Error(String(error));
    bootstrapError.bootstrapStage = stage;
    bootstrapError.bootstrapCommitted = committed;
    bootstrapError.bootstrapQueryCount = queryLog.length;
    throw bootstrapError;
  }
}
