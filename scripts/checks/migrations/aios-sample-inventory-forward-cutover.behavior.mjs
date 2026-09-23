#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  reserveExclusiveMigrationAuditJson,
  writeReservedMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  parseSampleInventoryForwardCutoverArgs,
  resolveSampleInventoryForwardCutoverAuthorization,
} from '../../lib/migrations/aios-sample-inventory-forward-cutover-cli.mjs';
import {
  applySampleInventoryForwardCutover,
  prepareSampleInventoryForwardCutover,
  sampleInventoryDatabaseIdentitySha256,
  SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS,
  SAMPLE_INVENTORY_FORWARD_CUTOVER_HEALTH_CHECK_PATH,
  SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET,
  verifySampleInventoryForwardCutover,
} from '../../lib/migrations/aios-sample-inventory-forward-cutover.mjs';

const GIT_SHA = 'a'.repeat(40);
const ENTRY_PATH = 'scripts/migrations/aios-sample-inventory-forward-cutover.mjs';
const migrationSql = readFileSync(SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET.relativePath, 'utf8');
const healthCheckSql = readFileSync(SAMPLE_INVENTORY_FORWARD_CUTOVER_HEALTH_CHECK_PATH, 'utf8');
const records = discoverAiosMigrations({ descriptor: readAiosMigrationDescriptor() });
const DATABASE_IDENTITY_SHA256 = sampleInventoryDatabaseIdentitySha256({
  databaseName: 'aios_fixture',
  serverAddress: '127.0.0.1',
  serverPort: '5432',
});

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

function prepare(overrides = {}) {
  return prepareSampleInventoryForwardCutover({
    command: 'verify',
    expectedDatabase: 'aios_fixture',
    expectedGitSha: GIT_SHA,
    expectedMigrationSha256: SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET.checksum,
    git: {
      branch: 'main',
      head: GIT_SHA,
      originMain: GIT_SHA,
      status: '',
    },
    healthCheckSql,
    migrationAdvisoryLockKey: 'aios-schema-migrations-v1',
    migrationSql,
    records,
    ...overrides,
  });
}

class FakeCutoverClient {
  constructor({
    databaseName = 'aios_fixture',
    effectCounts = null,
    failOn = '',
    healthCheckHealthy = true,
    ledgerExists = false,
    migrationEffectCounts = null,
  } = {}) {
    this.databaseName = databaseName;
    this.effectCounts = effectCounts ?? {
      functions: 0,
      indexes: 0,
      schema: 0,
      tables: 0,
      triggers: 0,
    };
    this.failOn = failOn;
    this.healthCheckHealthy = healthCheckHealthy;
    this.ledgerExists = ledgerExists;
    this.migrationEffectCounts = migrationEffectCounts ?? {
      functions: 2,
      indexes: 15,
      schema: 1,
      tables: 7,
      triggers: 5,
    };
    this.queries = [];
    this.readOnly = false;
    this.snapshot = null;
  }

  async query(sql, params = []) {
    const text = String(sql);
    this.queries.push({ params, sql: text });
    if (text.startsWith('BEGIN')) {
      this.snapshot = {
        effectCounts: structuredClone(this.effectCounts),
        ledgerExists: this.ledgerExists,
      };
      this.readOnly = text.includes('READ ONLY');
      return { rows: [] };
    }
    if (text === 'ROLLBACK') {
      this.effectCounts = this.snapshot.effectCounts;
      this.ledgerExists = this.snapshot.ledgerExists;
      this.readOnly = false;
      this.snapshot = null;
      return { rows: [] };
    }
    if (text === 'COMMIT') {
      this.readOnly = false;
      this.snapshot = null;
      return { rows: [] };
    }
    if (this.failOn && text.includes(this.failOn)) {
      throw new Error(`fixture failure at ${this.failOn}`);
    }
    if (text.includes('sample_inventory_forward_cutover:topology')) {
      const effects = Object.values(this.effectCounts).reduce((sum, value) => sum + value, 0);
      return {
        rows: [{
          database_name: this.databaseName,
          effects_present: effects,
          functions_present: this.effectCounts.functions,
          indexes_present: this.effectCounts.indexes,
          ledger_exists: this.ledgerExists,
          schema_exists: this.effectCounts.schema === 1,
          server_address: '127.0.0.1',
          server_port: '5432',
          tables_present: this.effectCounts.tables,
          transaction_id: null,
          transaction_read_only: this.readOnly ? 'on' : 'off',
          triggers_present: this.effectCounts.triggers,
        }],
      };
    }
    if (text.includes('sample_inventory_forward_cutover:transaction_id')) {
      return { rows: [{ transaction_id: null }] };
    }
    if (text === migrationSql) {
      this.effectCounts = structuredClone(this.migrationEffectCounts);
      return { rows: [] };
    }
    if (text === healthCheckSql) {
      if (!this.healthCheckHealthy) throw new Error('fixture health check failed');
      return { rows: [] };
    }
    return { rows: [] };
  }
}

function fullEffects() {
  return { functions: 2, indexes: 15, schema: 1, tables: 7, triggers: 5 };
}

function assertVerifySqlSafe(client) {
  for (const query of client.queries) {
    const sql = query.sql.trim();
    assert.ok(
      sql.startsWith('BEGIN TRANSACTION READ ONLY')
        || sql.startsWith('SELECT')
        || sql.startsWith('/* sample_inventory_forward_cutover:')
        || sql === 'ROLLBACK',
      `unexpected verify SQL: ${sql.slice(0, 80)}`,
    );
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|COMMIT)\b/iu);
  }
}

assert.deepEqual(
  parseSampleInventoryForwardCutoverArgs([
    'verify',
    '--expected-migration-sha256',
    SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET.checksum,
    '--output=/private/tmp/sample-inventory-forward-cutover.json',
  ]),
  {
    command: 'verify',
    confirmed: false,
    expectedMigrationSha256: SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET.checksum,
    help: false,
    outputPath: '/private/tmp/sample-inventory-forward-cutover.json',
  },
);
assert.match(
  captureError(() => parseSampleInventoryForwardCutoverArgs(['apply', '--output', '/tmp/result.json'])),
  /expected-migration-sha256/u,
);
assert.match(
  captureError(() => parseSampleInventoryForwardCutoverArgs([
    'verify',
    '--expected-migration-sha256',
    SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET.checksum,
    '--output',
    '/tmp/result.json',
    '--confirm-forward-cutover',
  ])),
  /valid only for apply/u,
);
assert.match(
  captureError(() => parseSampleInventoryForwardCutoverArgs(['baseline'])),
  /Unsupported sample inventory forward cutover command/u,
);

const baseEnv = {
  AIOS_MIGRATION_EXPECTED_GIT_SHA: GIT_SHA,
  AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE: 'aios_fixture',
};
assert.deepEqual(
  resolveSampleInventoryForwardCutoverAuthorization({
    command: 'verify',
    confirmed: false,
    env: { ...baseEnv, AIOS_SAMPLE_INVENTORY_CUTOVER_ALLOW_LIVE_READONLY: '1' },
  }),
  {
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: null,
    expectedGitSha: GIT_SHA,
  },
);
assert.match(
  captureError(() => resolveSampleInventoryForwardCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: baseEnv,
  })),
  /apply-backend-014-v1/u,
);
assert.match(
  captureError(() => resolveSampleInventoryForwardCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: { ...baseEnv, AIOS_SAMPLE_INVENTORY_CUTOVER_WRITE_ACK: 'apply-backend-014-v1' },
  })),
  /EXPECTED_DATABASE_IDENTITY_SHA256/u,
);
assert.deepEqual(
  resolveSampleInventoryForwardCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: {
      ...baseEnv,
      AIOS_SAMPLE_INVENTORY_CUTOVER_WRITE_ACK: 'apply-backend-014-v1',
      AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE_IDENTITY_SHA256: DATABASE_IDENTITY_SHA256,
    },
  }),
  {
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
    expectedGitSha: GIT_SHA,
  },
);

const prepared = prepare();
const applyPrepared = prepare({
  command: 'apply',
  expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
});
assert.equal(prepared.migration.checksum, SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET.checksum);
assert.equal(prepared.migration.executionMode, 'transactional');
assert.match(
  captureError(() => prepare({ git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '?? task' } })),
  /dirty worktree/u,
);
assert.match(
  captureError(() => prepare({ expectedMigrationSha256: 'b'.repeat(64) })),
  /drifted/u,
);
assert.match(
  captureError(() => prepare({ migrationSql: `${migrationSql}\n-- drift` })),
  /bytes differ/u,
);

const absentVerifyClient = new FakeCutoverClient();
const absentVerify = await verifySampleInventoryForwardCutover({
  client: absentVerifyClient,
  now: () => new Date('2026-07-27T08:00:00.000Z'),
  prepared,
});
assert.equal(absentVerify.status, 'ready_for_apply');
assert.equal(absentVerify.ready, true);
assert.equal(absentVerify.topology.effectsPresent, 0);
assert.equal(absentVerify.policy.rolledBack, true);
assert.equal(absentVerify.policy.transactionIdAssigned, false);
assertVerifySqlSafe(absentVerifyClient);

const ledgerVerify = await verifySampleInventoryForwardCutover({
  client: new FakeCutoverClient({ ledgerExists: true }),
  prepared,
});
assert.equal(ledgerVerify.status, 'blocked_ledger_present');
assert.equal(ledgerVerify.ready, false);

const partialVerify = await verifySampleInventoryForwardCutover({
  client: new FakeCutoverClient({
    effectCounts: { functions: 1, indexes: 2, schema: 1, tables: 3, triggers: 0 },
  }),
  prepared,
});
assert.equal(partialVerify.status, 'blocked_partial_topology');
assert.equal(partialVerify.ready, false);

const completeVerify = await verifySampleInventoryForwardCutover({
  client: new FakeCutoverClient({ effectCounts: fullEffects() }),
  prepared,
});
assert.equal(completeVerify.status, 'catalog_complete');
assert.equal(completeVerify.topology.effectsPresent, SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS);

const applyClient = new FakeCutoverClient();
const applied = await applySampleInventoryForwardCutover({
  client: applyClient,
  now: () => new Date('2026-07-27T08:01:00.000Z'),
  prepared: applyPrepared,
});
assert.equal(applied.status, 'applied');
assert.equal(applied.policy.committed, true);
assert.equal(applied.policy.migrationBodyExecuted, true);
assert.equal(applied.policy.ledgerWrites, false);
assert.equal(applied.topology.after.effectsPresent, SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS);
assert.equal(applyClient.queries.filter((query) => query.sql === migrationSql).length, 1);
assert.equal(applyClient.queries.filter((query) => query.sql === healthCheckSql).length, 1);
assert.equal(applyClient.queries.at(-1).sql, 'COMMIT');
const lockQuery = applyClient.queries.find((query) => (
  query.sql.includes('sample_inventory_forward_cutover:advisory_locks')
));
assert.equal(lockQuery.params[0].length, 3, 'apply should coordinate runner, bootstrap, and cutover locks');
assert.ok(applyClient.queries.every((query) => !query.sql.includes('warehouse.')));
assert.ok(applyClient.queries.every((query) => !/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\.aios_schema_migrations\b/iu.test(query.sql)));

const noOpClient = new FakeCutoverClient({ effectCounts: fullEffects() });
const noOp = await applySampleInventoryForwardCutover({ client: noOpClient, prepared: applyPrepared });
assert.equal(noOp.status, 'already_applied_healthy');
assert.equal(noOp.policy.migrationBodyExecuted, false);
assert.equal(noOp.policy.databaseWrites, false);
assert.equal(noOpClient.queries.some((query) => query.sql === healthCheckSql), true);

const partialApplyClient = new FakeCutoverClient({
  effectCounts: { functions: 0, indexes: 0, schema: 1, tables: 1, triggers: 0 },
});
const partialApplyError = await captureAsyncError(() => applySampleInventoryForwardCutover({
  client: partialApplyClient,
  prepared: applyPrepared,
}));
assert.match(partialApplyError.message, /partial or drifted/u);
assert.equal(partialApplyError.cutoverStage, 'inspect_before');
assert.equal(partialApplyClient.queries.at(-1).sql, 'ROLLBACK');

const ledgerApplyClient = new FakeCutoverClient({ ledgerExists: true });
const ledgerApplyError = await captureAsyncError(() => applySampleInventoryForwardCutover({
  client: ledgerApplyClient,
  prepared: applyPrepared,
}));
assert.match(ledgerApplyError.message, /canonical migration ledger exists/u);
assert.equal(ledgerApplyClient.queries.at(-1).sql, 'ROLLBACK');

const healthFailureClient = new FakeCutoverClient({ healthCheckHealthy: false });
const healthFailure = await captureAsyncError(() => applySampleInventoryForwardCutover({
  client: healthFailureClient,
  prepared: applyPrepared,
}));
assert.match(healthFailure.message, /health check failed/u);
assert.equal(healthFailure.cutoverStage, 'execute_health_check');
assert.equal(healthFailure.cutoverMigrationBodyExecuted, true);
assert.equal(healthFailureClient.effectCounts.schema, 0, 'rollback should restore the absent schema');
assert.equal(healthFailureClient.queries.at(-1).sql, 'ROLLBACK');

const incompletePostClient = new FakeCutoverClient({
  migrationEffectCounts: { functions: 1, indexes: 2, schema: 1, tables: 3, triggers: 0 },
});
const incompletePost = await captureAsyncError(() => applySampleInventoryForwardCutover({
  client: incompletePostClient,
  prepared: applyPrepared,
}));
assert.match(incompletePost.message, /postconditions are incomplete/u);
assert.equal(incompletePostClient.effectCounts.schema, 0);

const databaseMismatch = await captureAsyncError(() => verifySampleInventoryForwardCutover({
  client: new FakeCutoverClient({ databaseName: 'wrong_database' }),
  prepared,
}));
assert.match(databaseMismatch.message, /database identity differs/u);

const artifactRoot = mkdtempSync(path.join(tmpdir(), 'sample-inventory-cutover-artifact-'));
try {
  const outputPath = path.join(artifactRoot, 'result.json');
  const reservation = reserveExclusiveMigrationAuditJson(outputPath);
  const artifact = writeReservedMigrationAuditJson(reservation, applied);
  assert.equal(artifact.path, outputPath);
  assert.match(
    captureError(() => reserveExclusiveMigrationAuditJson(outputPath)),
    /EEXIST|exist/iu,
  );
} finally {
  rmSync(artifactRoot, { force: true, recursive: true });
}

const redacted = redactMigrationText(
  'postgresql://admin:secret@example.invalid/groland?password=hunter2 token=visible',
);
assert.doesNotMatch(redacted, /secret|hunter2/u);

const helpRun = spawnSync(process.execPath, [ENTRY_PATH, '--help'], { encoding: 'utf8' });
assert.equal(helpRun.status, 0);
assert.match(helpRun.stdout, /targets only backend\/014/u);
const preconnectRoot = mkdtempSync(path.join(tmpdir(), 'sample-inventory-cutover-preconnect-'));
try {
  const outputPath = path.join(preconnectRoot, 'must-not-exist.json');
  const rejectedRun = spawnSync(process.execPath, [
    ENTRY_PATH,
    'apply',
    '--expected-migration-sha256',
    SAMPLE_INVENTORY_FORWARD_CUTOVER_TARGET.checksum,
    '--output',
    outputPath,
    '--confirm-forward-cutover',
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...baseEnv, DATABASE_URL: 'postgresql://user:secret@example.invalid/aios' },
  });
  assert.equal(rejectedRun.status, 1);
  assert.match(rejectedRun.stderr, /apply-backend-014-v1/u);
  assert.doesNotMatch(rejectedRun.stderr, /example\.invalid|secret/u);
  assert.equal(existsSync(outputPath), false, 'authorization failure should happen before output reservation');
} finally {
  rmSync(preconnectRoot, { force: true, recursive: true });
}

console.log('[aios-sample-inventory-forward-cutover.behavior] OK: static pins, read-only verify, transactional apply, rollback, idempotency, ledger isolation, and artifact safety passed.');
