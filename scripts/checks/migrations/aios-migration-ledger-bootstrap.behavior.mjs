#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  reserveExclusiveMigrationAuditJson,
  writeReservedMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  assertCanonicalAiosMigrationLedgerSchema,
  AIOS_MIGRATION_LEDGER_CANONICAL_SCHEMA_SQL,
  AIOS_MIGRATION_LEDGER_V1_COLUMNS,
  AIOS_MIGRATION_LEDGER_V2_COLUMNS,
} from '../../lib/migrations/aios-migration-ledger-contract.mjs';
import {
  AIOS_MIGRATION_LEDGER_BOOTSTRAP_REPOSITORY_SOURCE_PATHS,
  validateAiosMigrationLedgerBootstrapManifest,
} from '../../lib/migrations/aios-migration-ledger-bootstrap-manifest.mjs';
import {
  assertAiosMigrationLedgerBootstrapAuthorization,
  parseAiosMigrationLedgerBootstrapArgs,
} from '../../lib/migrations/aios-migration-ledger-bootstrap-writer-cli.mjs';
import {
  aiosMigrationLedgerDatabaseIdentitySha256,
  executeAiosMigrationLedgerBootstrap,
  prepareAiosMigrationLedgerBootstrap,
} from '../../lib/migrations/aios-migration-ledger-bootstrap-writer.mjs';

const ENTRY_PATH = 'scripts/migrations/aios-migration-ledger-bootstrap.mjs';
const APP_VERSION = '2.3.416';
const GIT_SHA = 'a'.repeat(40);
const OVERLAY_SHA = 'b'.repeat(64);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function captureError(callback) {
  try {
    callback();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function captureAsyncError(callback) {
  try {
    await callback();
    return null;
  } catch (error) {
    return error;
  }
}

function informationSchemaRows(columns) {
  return columns.map((column) => ({
    column_name: column.columnName,
    data_type: column.dataType,
    is_nullable: column.nullable ? 'YES' : 'NO',
  }));
}

function constraint(constraintName, constraintType, definition) {
  return { constraint_name: constraintName, constraint_type: constraintType, definition };
}

function canonicalConstraints(version) {
  const executionModes = version === 2
    ? "'baseline', 'transactional', 'self-transactional', 'nontransactional', 'exception'"
    : "'baseline', 'transactional', 'self-transactional', 'nontransactional'";
  return [
    constraint(
      'aios_schema_migrations_checksum_check',
      'c',
      "CHECK (checksum ~ '^[a-f0-9]{64}$')",
    ),
    ...(version === 2 ? [constraint(
      'aios_schema_migrations_exception_metadata_check',
      'c',
      "CHECK ((execution_mode = 'exception' AND exception_kind IN ('not_applicable', 'forward_repaired') AND decision_artifact_sha256 ~ '^[a-f0-9]{64}$') OR (execution_mode <> 'exception' AND exception_kind IS NULL AND decision_artifact_sha256 IS NULL))",
    )] : []),
    constraint(
      'aios_schema_migrations_execution_mode_check',
      'c',
      `CHECK (execution_mode IN (${executionModes}))`,
    ),
    constraint(
      'aios_schema_migrations_namespace_check',
      'c',
      "CHECK (namespace IN ('backend', 'warehouse'))",
    ),
    constraint('aios_schema_migrations_pkey', 'p', 'PRIMARY KEY (namespace, version)'),
  ];
}

const DATABASE_FIELDS = Object.freeze({
  database_name: 'aios_fixture',
  server_address: '127.0.0.1',
  server_port: '5432',
});

function canonicalSchemaRow(version, overrides = {}) {
  if (version === 0) {
    return {
      ...DATABASE_FIELDS,
      table_exists: false,
      columns: [],
      constraints: [],
      ...overrides,
    };
  }
  return {
    ...DATABASE_FIELDS,
    table_exists: true,
    columns: informationSchemaRows(
      version === 2 ? AIOS_MIGRATION_LEDGER_V2_COLUMNS : AIOS_MIGRATION_LEDGER_V1_COLUMNS,
    ),
    constraints: canonicalConstraints(version),
    ...overrides,
  };
}

function migrationRecord(version, checksumDigit = version.slice(-1)) {
  return {
    namespace: 'backend',
    version,
    checksum: checksumDigit.repeat(64),
    executionMode: 'transactional',
  };
}

function ledgerRow(record, overrides = {}) {
  return {
    namespace: record.namespace,
    version: record.version,
    checksum: record.checksum,
    appVersion: APP_VERSION,
    executionMode: overrides.executionMode ?? record.executionMode,
    exceptionKind: overrides.exceptionKind ?? null,
    decisionArtifactSha256: overrides.decisionArtifactSha256 ?? null,
  };
}

const RECORDS = Object.freeze([
  migrationRecord('001', '1'),
  migrationRecord('002', '2'),
  migrationRecord('003', '3'),
]);

const EXPECTED_ROWS = Object.freeze([
  ledgerRow(RECORDS[0], { executionMode: 'baseline' }),
  ledgerRow(RECORDS[1], {
    executionMode: 'exception',
    exceptionKind: 'not_applicable',
    decisionArtifactSha256: OVERLAY_SHA,
  }),
  ledgerRow(RECORDS[2]),
]);

function externalArtifact(name, digest = sha256(name)) {
  return {
    path: `/private/tmp/${name}.json`,
    bytes: 100 + name.length,
    sha256: digest,
  };
}

function repositorySources() {
  return Object.fromEntries(Object.entries(
    AIOS_MIGRATION_LEDGER_BOOTSTRAP_REPOSITORY_SOURCE_PATHS,
  ).map(([key, sourcePath]) => [key, readFileSync(sourcePath, 'utf8')]));
}

function repositorySourceMetadata(sources) {
  return Object.fromEntries(Object.entries(
    AIOS_MIGRATION_LEDGER_BOOTSTRAP_REPOSITORY_SOURCE_PATHS,
  ).map(([key, sourcePath]) => [key, {
    path: sourcePath,
    bytes: Buffer.byteLength(sources[key]),
    sha256: sha256(sources[key]),
  }]));
}

function bootstrapManifest({
  expectedRows = EXPECTED_ROWS,
  expectedSchema = 'missing',
  existingRows = [],
  rowsToInsert = expectedRows,
  sources = repositorySources(),
} = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-26T06:00:00.000Z',
    mode: 'aios_migration_ledger_bootstrap_write_manifest',
    authorization: {
      reviewer: 'repository-owner',
      reviewedAt: '2026-07-26T06:00:00.000Z',
      productionWritesAuthorized: true,
      ledgerWritesAuthorized: true,
      schemaUpgradeAuthorized: true,
      migrationApplyAuthorized: false,
      deployAuthorized: false,
      arkInvoked: false,
    },
    repository: {
      gitSha: GIT_SHA,
      appVersion: APP_VERSION,
      sources: repositorySourceMetadata(sources),
    },
    database: {
      identitySha256: aiosMigrationLedgerDatabaseIdentitySha256(canonicalSchemaRow(0)),
    },
    sourceArtifacts: {
      bootstrapPlan: externalArtifact('bootstrap-plan'),
      exceptionOverlay: externalArtifact('exception-overlay', OVERLAY_SHA),
      ownerDecisions: externalArtifact('owner-decisions'),
      reconciliation: externalArtifact('reconciliation'),
    },
    ledger: {
      expectedSchema,
      existingRows,
      rowsToInsert,
      expectedRows,
    },
  };
}

function manifestArtifact(manifest) {
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  return {
    path: '/private/tmp/bootstrap-write-manifest.json',
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  };
}

function bootstrapPlanForManifest(manifest) {
  const repositorySources = manifest.repository.sources;
  return {
    schemaVersion: 3,
    mode: 'offline_readonly_migration_ledger_bootstrap_plan',
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      ledgerSchemaMutationSupported: true,
      writerImplemented: true,
    },
    sourceArtifacts: {
      manifest: manifest.sourceArtifacts.reconciliation,
      decisions: manifest.sourceArtifacts.ownerDecisions,
      exceptionOverlay: manifest.sourceArtifacts.exceptionOverlay,
    },
    repositoryEvidence: {
      runner: {
        ledgerSchemaWriterVersion: 2,
        ledgerSchemaMutationSupported: true,
        writerImplemented: true,
        sources: {
          bootstrapSql: repositorySources.bootstrapSql,
          bootstrapWriter: repositorySources.bootstrapWriter,
          historyComparator: repositorySources.historyComparator,
          ledgerContract: repositorySources.ledgerContract,
          ledgerDdl: repositorySources.canonicalDdl,
          ledgerV1ToV2Ddl: repositorySources.v1ToV2Ddl,
        },
      },
    },
    sourceState: {
      manifestReconciled: true,
      manifestReadyForLedgerBootstrap: true,
    },
    ledgerRows: manifest.ledger.expectedRows.map((row) => ({
      namespace: row.namespace,
      version: row.version,
      checksum: row.checksum,
      executionMode: row.executionMode,
      exceptionKind: row.exceptionKind,
      decisionArtifactSha256: row.decisionArtifactSha256,
    })),
    summary: { writePlanReady: true },
    outputContract: { sqlStatements: [], productionCommands: [] },
  };
}

function sourceArtifactInputs(manifest) {
  return {
    bootstrapPlan: {
      data: bootstrapPlanForManifest(manifest),
      metadata: manifest.sourceArtifacts.bootstrapPlan,
    },
    exceptionOverlay: {
      data: { fixture: 'exception-overlay' },
      metadata: manifest.sourceArtifacts.exceptionOverlay,
    },
    ownerDecisions: {
      data: { fixture: 'owner-decisions' },
      metadata: manifest.sourceArtifacts.ownerDecisions,
    },
    reconciliation: {
      data: { fixture: 'reconciliation' },
      metadata: manifest.sourceArtifacts.reconciliation,
    },
  };
}

function prepareOptions(manifest, overrides = {}) {
  const sources = overrides.repositorySources ?? repositorySources();
  const artifact = manifestArtifact(manifest);
  return {
    appVersion: APP_VERSION,
    canonicalDdl: sources.canonicalDdl,
    git: {
      branch: 'main',
      head: GIT_SHA,
      originMain: GIT_SHA,
      status: '',
    },
    manifest,
    manifestArtifact: artifact,
    manifestSha256: artifact.sha256,
    records: overrides.records ?? RECORDS,
    repositorySources: sources,
    sourceArtifactInputs: sourceArtifactInputs(manifest),
    v1ToV2Ddl: sources.v1ToV2Ddl,
    ...overrides,
  };
}

class FakeBootstrapClient {
  constructor({ failOn = '', rows = [], schemaVersion = 0 } = {}) {
    this.failOn = failOn;
    this.rows = rows.map((row, index) => ({
      ...row,
      app_version: row.appVersion,
      execution_mode: row.executionMode,
      exception_kind: row.exceptionKind,
      decision_artifact_sha256: row.decisionArtifactSha256,
      applied_at: String(index + 1).padStart(8, '0'),
    }));
    this.schemaVersion = schemaVersion;
    this.queries = [];
    this.snapshot = null;
  }

  async query(sql, params = []) {
    const text = String(sql);
    this.queries.push({ sql: text, params });
    if (this.failOn && text.includes(this.failOn)) throw new Error(`fixture failure at ${this.failOn}`);
    if (text.startsWith('BEGIN')) {
      this.snapshot = { rows: structuredClone(this.rows), schemaVersion: this.schemaVersion };
      return { rows: [] };
    }
    if (text === 'ROLLBACK') {
      this.rows = this.snapshot.rows;
      this.schemaVersion = this.snapshot.schemaVersion;
      this.snapshot = null;
      return { rows: [] };
    }
    if (text === 'COMMIT') {
      this.snapshot = null;
      return { rows: [] };
    }
    if (text.includes("to_regclass('public.aios_schema_migrations')")) {
      return { rows: [canonicalSchemaRow(this.schemaVersion)] };
    }
    if (text.includes('CREATE TABLE IF NOT EXISTS public.aios_schema_migrations')) {
      this.schemaVersion = 2;
      return { rows: [] };
    }
    if (text.includes('ADD COLUMN exception_kind TEXT')) {
      this.schemaVersion = 2;
      return { rows: [] };
    }
    if (text.includes('FROM public.aios_schema_migrations')) {
      return { rows: structuredClone(this.rows) };
    }
    if (text.includes('INSERT INTO public.aios_schema_migrations')) {
      const inserted = [];
      for (let index = 0; index < params.length; index += 7) {
        const identity = `${params[index]}/${params[index + 1]}`;
        if (this.rows.some((row) => `${row.namespace}/${row.version}` === identity)) continue;
        const row = {
          namespace: params[index],
          version: params[index + 1],
          checksum: params[index + 2],
          app_version: params[index + 3],
          execution_mode: params[index + 4],
          exception_kind: params[index + 5],
          decision_artifact_sha256: params[index + 6],
          applied_at: String(this.rows.length + 1).padStart(8, '0'),
        };
        this.rows.push(row);
        inserted.push(row);
      }
      return { rowCount: inserted.length, rows: inserted };
    }
    return { rows: [] };
  }
}

async function runFixture({ client, manifest, prepareOverrides = {} }) {
  const prepared = prepareAiosMigrationLedgerBootstrap(
    prepareOptions(manifest, prepareOverrides),
  );
  return executeAiosMigrationLedgerBootstrap({
    client,
    now: () => new Date('2026-07-26T06:30:00.000Z'),
    prepared,
  });
}

const canonicalV1 = assertCanonicalAiosMigrationLedgerSchema(canonicalSchemaRow(1));
assert.equal(canonicalV1.status, 'canonical-v1');
assert.equal(canonicalV1.schemaUpgradeRequired, true);
const canonicalV2 = assertCanonicalAiosMigrationLedgerSchema(canonicalSchemaRow(2));
assert.equal(canonicalV2.status, 'canonical-v2');
assert.equal(canonicalV2.supportsExceptions, true);
assert.match(
  captureError(() => assertCanonicalAiosMigrationLedgerSchema(canonicalSchemaRow(2, {
    constraints: canonicalConstraints(2).slice(1),
  }))),
  /canonical schema drift/u,
);

assert.deepEqual(
  parseAiosMigrationLedgerBootstrapArgs([
    '--manifest', '/tmp/manifest.json',
    '--manifest-sha256', 'a'.repeat(64),
    '--output', '/tmp/result.json',
    '--confirm-ledger-bootstrap',
  ]),
  {
    confirmed: true,
    help: false,
    manifestPath: '/tmp/manifest.json',
    manifestSha256: 'a'.repeat(64),
    outputPath: '/tmp/result.json',
  },
);
assert.match(
  captureError(() => parseAiosMigrationLedgerBootstrapArgs(['--apply'])),
  /Unknown migration ledger bootstrap option/u,
);
assert.match(
  captureError(() => assertAiosMigrationLedgerBootstrapAuthorization({
    confirmed: true,
    env: {},
  })),
  /WRITE_ACK=bootstrap-v2/u,
);
assert.deepEqual(
  assertAiosMigrationLedgerBootstrapAuthorization({
    confirmed: true,
    env: {
      AIOS_MIGRATION_LEDGER_BOOTSTRAP_WRITE_ACK: 'bootstrap-v2',
      AIOS_MIGRATION_EXPECTED_GIT_SHA: GIT_SHA,
    },
  }),
  { expectedGitSha: GIT_SHA },
);

const missingManifest = bootstrapManifest();
validateAiosMigrationLedgerBootstrapManifest(missingManifest);
const missingClient = new FakeBootstrapClient();
const missingResult = await runFixture({ client: missingClient, manifest: missingManifest });
assert.equal(missingResult.schema.mutation, 'create_v2');
assert.equal(missingResult.rows.inserted, 3);
assert.equal(missingResult.policy.committed, true);
assert.equal(missingResult.queryStats.noNPlusOne, true);
assert.ok(missingResult.queryStats.total <= missingResult.queryStats.upperBound);
assert.equal(missingClient.schemaVersion, 2);
assert.equal(missingClient.rows.length, 3);
assert.equal(missingClient.queries.filter((query) => query.sql.startsWith('BEGIN')).length, 1);
assert.equal(missingClient.queries.filter((query) => query.sql === 'COMMIT').length, 1);
assert.equal(
  missingClient.queries.filter((query) => query.sql.includes('pg_advisory_xact_lock')).length,
  1,
);

const v1Manifest = bootstrapManifest({
  expectedSchema: 'canonical-v1',
  existingRows: EXPECTED_ROWS.slice(0, 1),
  rowsToInsert: EXPECTED_ROWS.slice(1),
});
const v1Client = new FakeBootstrapClient({
  rows: EXPECTED_ROWS.slice(0, 1),
  schemaVersion: 1,
});
const v1Result = await runFixture({ client: v1Client, manifest: v1Manifest });
assert.equal(v1Result.schema.mutation, 'upgrade_v1_to_v2');
assert.equal(v1Result.rows.inserted, 2);
assert.equal(v1Client.schemaVersion, 2);

const v2Manifest = bootstrapManifest({
  expectedSchema: 'canonical-v2',
  existingRows: EXPECTED_ROWS.slice(0, 2),
  rowsToInsert: EXPECTED_ROWS.slice(2),
});
const v2Client = new FakeBootstrapClient({
  rows: EXPECTED_ROWS.slice(0, 2),
  schemaVersion: 2,
});
const v2Result = await runFixture({ client: v2Client, manifest: v2Manifest });
assert.equal(v2Result.schema.mutation, 'none');
assert.equal(v2Result.rows.inserted, 1);
assert.equal(
  v2Client.queries.some((query) => query.sql.includes('ADD COLUMN exception_kind TEXT')),
  false,
);

const immutableDriftClient = new FakeBootstrapClient({
  rows: [EXPECTED_ROWS[0], EXPECTED_ROWS[2]],
  schemaVersion: 2,
});
const immutableDriftError = await captureAsyncError(() => runFixture({
  client: immutableDriftClient,
  manifest: v2Manifest,
}));
assert.match(immutableDriftError.message, /existing rows differs from the pinned manifest/u);
assert.equal(immutableDriftClient.rows.length, 2);
assert.equal(
  immutableDriftClient.queries.some((query) => query.sql.includes('INSERT INTO')),
  false,
);
assert.equal(immutableDriftClient.queries.at(-1).sql, 'ROLLBACK');

const rollbackClient = new FakeBootstrapClient({ failOn: 'INSERT INTO' });
const rollbackError = await captureAsyncError(() => runFixture({
  client: rollbackClient,
  manifest: missingManifest,
}));
assert.match(rollbackError.message, /fixture failure at INSERT INTO/u);
assert.equal(rollbackError.bootstrapCommitted, false);
assert.equal(rollbackClient.schemaVersion, 0);
assert.deepEqual(rollbackClient.rows, []);
assert.equal(rollbackClient.queries.at(-1).sql, 'ROLLBACK');

const wrongDatabaseManifest = structuredClone(missingManifest);
wrongDatabaseManifest.database.identitySha256 = 'f'.repeat(64);
const wrongDatabaseClient = new FakeBootstrapClient();
const wrongDatabaseError = await captureAsyncError(() => runFixture({
  client: wrongDatabaseClient,
  manifest: wrongDatabaseManifest,
}));
assert.match(wrongDatabaseError.message, /database identity differs/u);
assert.equal(wrongDatabaseClient.schemaVersion, 0);
assert.equal(wrongDatabaseClient.queries.at(-1).sql, 'ROLLBACK');

assert.match(
  captureError(() => prepareAiosMigrationLedgerBootstrap(prepareOptions(missingManifest, {
    git: {
      branch: 'main',
      head: GIT_SHA,
      originMain: GIT_SHA,
      status: ' M user-wip.txt',
    },
  }))),
  /dirty worktree/u,
);
const driftedSources = repositorySources();
driftedSources.bootstrapSql += '\n// drift';
assert.match(
  captureError(() => prepareAiosMigrationLedgerBootstrap(prepareOptions(missingManifest, {
    repositorySources: driftedSources,
  }))),
  /repository source bootstrapSql differs/u,
);
const notReadyPlanInputs = sourceArtifactInputs(missingManifest);
notReadyPlanInputs.bootstrapPlan.data.summary.writePlanReady = false;
assert.match(
  captureError(() => prepareAiosMigrationLedgerBootstrap(prepareOptions(missingManifest, {
    sourceArtifactInputs: notReadyPlanInputs,
  }))),
  /not a Stage D write-ready offline plan/u,
);
const driftedPlanInputs = sourceArtifactInputs(missingManifest);
driftedPlanInputs.bootstrapPlan.data.ledgerRows.pop();
assert.match(
  captureError(() => prepareAiosMigrationLedgerBootstrap(prepareOptions(missingManifest, {
    sourceArtifactInputs: driftedPlanInputs,
  }))),
  /plan rows differ/u,
);
const badManifest = structuredClone(missingManifest);
badManifest.ledger.expectedRows[1].decisionArtifactSha256 = null;
assert.match(
  captureError(() => validateAiosMigrationLedgerBootstrapManifest(badManifest)),
  /invalid exception metadata/u,
);
const nonPrefixManifest = bootstrapManifest({ expectedRows: [EXPECTED_ROWS[1]] });
assert.match(
  captureError(() => prepareAiosMigrationLedgerBootstrap(prepareOptions(nonPrefixManifest))),
  /not a filesystem prefix/u,
);

const largeRecords = Array.from({ length: 10_000 }, (_, index) => ({
  namespace: 'backend',
  version: String(index + 1).padStart(8, '0'),
  checksum: (index + 1).toString(16).padStart(64, '0'),
  executionMode: 'transactional',
}));
const largeRows = largeRecords.map((record) => ledgerRow(record));
const largeManifest = bootstrapManifest({ expectedRows: largeRows, rowsToInsert: largeRows });
const largeClient = new FakeBootstrapClient();
const largeResult = await runFixture({
  client: largeClient,
  manifest: largeManifest,
  prepareOverrides: { chunkSize: 500, records: largeRecords },
});
assert.equal(largeResult.rows.inserted, 10_000);
assert.equal(largeResult.queryStats.bulkInsertChunks, 20);
assert.ok(largeResult.queryStats.total <= 29);

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'aios-ledger-bootstrap-'));
try {
  const exclusiveOutput = path.join(temporaryDirectory, 'result.json');
  const reservation = reserveExclusiveMigrationAuditJson(exclusiveOutput);
  const written = writeReservedMigrationAuditJson(reservation, missingResult);
  assert.equal(existsSync(written.path), true);
  assert.match(
    captureError(() => reserveExclusiveMigrationAuditJson(exclusiveOutput)),
    /EEXIST/u,
  );
  assert.equal(JSON.parse(readFileSync(exclusiveOutput, 'utf8')).status, 'succeeded');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

const invalidCli = spawnSync(process.execPath, [ENTRY_PATH, '--apply'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    DATABASE_URL: 'postgres://admin:secret@example.invalid/aios',
  },
});
assert.notEqual(invalidCli.status, 0);
assert.match(invalidCli.stderr, /Unknown migration ledger bootstrap option/u);
assert.doesNotMatch(invalidCli.stderr, /admin:secret/u);

const canonicalDdl = readFileSync('scripts/config/migrations/aios-schema-migrations.sql', 'utf8');
const upgradeDdl = readFileSync(
  'scripts/config/migrations/aios-schema-migrations-v1-to-v2.sql',
  'utf8',
);
assert.match(canonicalDdl, /execution_mode IN \([^)]*'exception'/u);
assert.match(canonicalDdl, /aios_schema_migrations_exception_metadata_check/u);
assert.doesNotMatch(canonicalDdl, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu);
assert.match(upgradeDdl, /ADD COLUMN exception_kind TEXT/u);
assert.match(upgradeDdl, /ADD COLUMN decision_artifact_sha256 TEXT/u);
assert.doesNotMatch(upgradeDdl, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu);
assert.match(AIOS_MIGRATION_LEDGER_CANONICAL_SCHEMA_SQL, /pg_get_constraintdef/u);
assert.doesNotMatch(JSON.stringify(missingResult), /postgres(?:ql)?:\/\//u);
assert.doesNotMatch(JSON.stringify(missingResult), /CREATE TABLE|ALTER TABLE|INSERT INTO/u);

console.log(
  '[aios-migration-ledger-bootstrap.behavior] OK: canonical absent/v1/v2 handling, '
  + 'manifest/Git/database pins, dual acknowledgement, transaction-scoped advisory lock, '
  + 'bulk insert, rollback, exclusive redacted artifacts, and 10000-row bounded queries passed.',
);
