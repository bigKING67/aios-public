#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  reserveExclusiveMigrationAuditJson,
  writeReservedMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  parseSampleInventoryPublicCutoverArgs,
  resolveSampleInventoryPublicCutoverAuthorization,
} from '../../lib/migrations/aios-sample-inventory-public-cutover-cli.mjs';
import {
  applySampleInventoryPublicCutover,
  prepareSampleInventoryPublicCutover,
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_BASE_HEALTH_CHECK_PATH,
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_EXPECTED_EFFECTS,
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_HEALTH_CHECK_PATH,
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET,
  verifySampleInventoryPublicCutover,
} from '../../lib/migrations/aios-sample-inventory-public-cutover.mjs';
import {
  SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS,
  sampleInventoryDatabaseIdentitySha256,
} from '../../lib/migrations/aios-sample-inventory-forward-cutover.mjs';

const ENTRY_PATH = 'scripts/migrations/aios-sample-inventory-public-cutover.mjs';
const GIT_SHA = 'a'.repeat(40);
const DATABASE_IDENTITY_SHA256 = sampleInventoryDatabaseIdentitySha256({
  databaseName: 'aios_fixture',
  serverAddress: '127.0.0.1',
  serverPort: '5432',
});
const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
const migrationSql = readFileSync(SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.relativePath, 'utf8');
const baseHealthCheckSql = readFileSync(SAMPLE_INVENTORY_PUBLIC_CUTOVER_BASE_HEALTH_CHECK_PATH, 'utf8');
const healthCheckSql = readFileSync(SAMPLE_INVENTORY_PUBLIC_CUTOVER_HEALTH_CHECK_PATH, 'utf8');

function captureError(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error('Expected callback to fail.');
}

async function captureAsyncError(callback) {
  try {
    await callback();
  } catch (error) {
    return error;
  }
  throw new Error('Expected async callback to fail.');
}

function prepared(overrides = {}) {
  return prepareSampleInventoryPublicCutover({
    baseHealthCheckSql,
    command: 'verify',
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: null,
    expectedGitSha: GIT_SHA,
    expectedMigrationSha256: SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.checksum,
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '' },
    healthCheckSql,
    migrationAdvisoryLockKey: descriptor.advisoryLockKey,
    migrationSql,
    records,
    ...overrides,
  });
}

function absentState(overrides = {}) {
  return {
    baseEffects: SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS,
    constraints: 0,
    columns: 0,
    indexes: 0,
    legacyPristineSettings: 1,
    table: 0,
    thresholdDefault: '10',
    ...overrides,
  };
}

function completeState(overrides = {}) {
  return {
    baseEffects: SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS,
    constraints: 7,
    columns: 8,
    indexes: 1,
    legacyPristineSettings: 0,
    table: 1,
    thresholdDefault: '3',
    ...overrides,
  };
}

class FakePublicCutoverClient {
  constructor({
    databaseName = 'aios_fixture',
    healthCheckHealthy = true,
    ledgerExists = false,
    migrationState = completeState(),
    state = absentState(),
  } = {}) {
    this.databaseName = databaseName;
    this.healthCheckHealthy = healthCheckHealthy;
    this.ledgerExists = ledgerExists;
    this.migrationState = { ...migrationState };
    this.queries = [];
    this.readOnly = false;
    this.state = { ...state };
    this.snapshot = null;
  }

  async query(sql, params = []) {
    const text = String(sql);
    this.queries.push({ sql: text, params });
    if (text === 'BEGIN TRANSACTION READ ONLY') {
      this.snapshot = { ...this.state };
      this.readOnly = true;
      return { rows: [] };
    }
    if (text === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
      this.snapshot = { ...this.state };
      this.readOnly = false;
      return { rows: [] };
    }
    if (text === 'ROLLBACK') {
      if (this.snapshot) this.state = { ...this.snapshot };
      this.snapshot = null;
      this.readOnly = false;
      return { rows: [] };
    }
    if (text === 'COMMIT') {
      this.snapshot = null;
      this.readOnly = false;
      return { rows: [] };
    }
    if (text.includes('sample_inventory_public_cutover:topology')) {
      return {
        rows: [{
          base_effects_present: this.state.baseEffects,
          database_name: this.databaseName,
          ledger_exists: this.ledgerExists,
          legacy_pristine_settings: this.state.legacyPristineSettings,
          public_columns_present: this.state.columns,
          public_constraints_present: this.state.constraints,
          public_indexes_present: this.state.indexes,
          public_tables_present: this.state.table,
          server_address: '127.0.0.1',
          server_port: '5432',
          threshold_default: this.state.thresholdDefault,
          transaction_id: null,
          transaction_read_only: this.readOnly ? 'on' : 'off',
        }],
      };
    }
    if (text.includes('sample_inventory_public_cutover:transaction_id')) {
      return { rows: [{ transaction_id: null }] };
    }
    if (text === migrationSql) {
      this.state = { ...this.migrationState };
      return { rows: [] };
    }
    if (text === healthCheckSql && !this.healthCheckHealthy) {
      throw new Error('fixture public health check failed');
    }
    return { rows: [] };
  }
}

function assertVerifySqlSafe(client) {
  for (const query of client.queries) {
    const sql = query.sql.trim();
    const allowed = sql === 'BEGIN TRANSACTION READ ONLY'
      || sql === 'ROLLBACK'
      || sql.startsWith('SELECT set_config')
      || sql.startsWith('/* sample_inventory_public_cutover:');
    assert.equal(allowed, true, `verify issued unexpected SQL: ${sql.slice(0, 80)}`);
    assert.doesNotMatch(
      sql,
      /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|COMMIT)\b/imu,
    );
  }
}

assert.deepEqual(
  parseSampleInventoryPublicCutoverArgs([
    'verify',
    `--expected-migration-sha256=${SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.checksum}`,
    '--output=/private/tmp/sample-inventory-public-cutover.json',
  ]),
  {
    command: 'verify',
    confirmed: false,
    expectedMigrationSha256: SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.checksum,
    help: false,
    outputPath: '/private/tmp/sample-inventory-public-cutover.json',
  },
);
assert.match(
  captureError(() => parseSampleInventoryPublicCutoverArgs([
    'verify',
    '--expected-migration-sha256',
    SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.checksum,
    '--output',
    '/tmp/result.json',
    '--confirm-public-cutover',
  ])).message,
  /valid only for apply/u,
);
assert.match(
  captureError(() => parseSampleInventoryPublicCutoverArgs(['baseline'])).message,
  /Unsupported sample inventory public cutover command/u,
);

const baseEnv = {
  AIOS_MIGRATION_EXPECTED_GIT_SHA: GIT_SHA,
  AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE: 'aios_fixture',
};
assert.deepEqual(
  resolveSampleInventoryPublicCutoverAuthorization({
    command: 'verify',
    confirmed: false,
    env: { ...baseEnv, AIOS_SAMPLE_INVENTORY_PUBLIC_CUTOVER_ALLOW_LIVE_READONLY: '1' },
  }),
  {
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: null,
    expectedGitSha: GIT_SHA,
  },
);
assert.match(
  captureError(() => resolveSampleInventoryPublicCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: baseEnv,
  })).message,
  /apply-backend-015-v1/u,
);
assert.deepEqual(
  resolveSampleInventoryPublicCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: {
      ...baseEnv,
      AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE_IDENTITY_SHA256: DATABASE_IDENTITY_SHA256,
      AIOS_SAMPLE_INVENTORY_PUBLIC_CUTOVER_WRITE_ACK: 'apply-backend-015-v1',
    },
  }),
  {
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
    expectedGitSha: GIT_SHA,
  },
);

const verifyPrepared = prepared();
const applyPrepared = prepared({
  command: 'apply',
  expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
});
assert.equal(verifyPrepared.migration.checksum, SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.checksum);
assert.equal(verifyPrepared.migration.executionMode, 'transactional');
assert.match(
  captureError(() => prepared({
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '?? task' },
  })).message,
  /dirty worktree/u,
);
assert.match(
  captureError(() => prepared({ expectedMigrationSha256: 'b'.repeat(64) })).message,
  /drifted/u,
);
assert.match(
  captureError(() => prepared({ migrationSql: `${migrationSql}\n-- drift` })).message,
  /bytes differ/u,
);

const absentVerifyClient = new FakePublicCutoverClient();
const absentVerify = await verifySampleInventoryPublicCutover({
  client: absentVerifyClient,
  now: () => new Date('2026-07-27T08:00:00.000Z'),
  prepared: verifyPrepared,
});
assert.equal(absentVerify.status, 'ready_for_apply');
assert.equal(absentVerify.ready, true);
assert.equal(absentVerify.topology.baseEffectsPresent, SAMPLE_INVENTORY_FORWARD_CUTOVER_EXPECTED_EFFECTS);
assert.equal(absentVerify.topology.publicEffectsPresent, 0);
assert.equal(absentVerify.policy.rolledBack, true);
assert.equal(absentVerify.policy.transactionIdAssigned, false);
assertVerifySqlSafe(absentVerifyClient);

const ledgerVerify = await verifySampleInventoryPublicCutover({
  client: new FakePublicCutoverClient({ ledgerExists: true }),
  prepared: verifyPrepared,
});
assert.equal(ledgerVerify.status, 'blocked_ledger_present');
assert.equal(ledgerVerify.ready, false);

const baseIncomplete = await verifySampleInventoryPublicCutover({
  client: new FakePublicCutoverClient({ state: absentState({ baseEffects: 29 }) }),
  prepared: verifyPrepared,
});
assert.equal(baseIncomplete.status, 'blocked_backend_014_incomplete');

const partialVerify = await verifySampleInventoryPublicCutover({
  client: new FakePublicCutoverClient({
    state: absentState({ table: 1, columns: 4, constraints: 2 }),
  }),
  prepared: verifyPrepared,
});
assert.equal(partialVerify.status, 'blocked_partial_topology');
assert.equal(partialVerify.ready, false);

const completeVerify = await verifySampleInventoryPublicCutover({
  client: new FakePublicCutoverClient({ state: completeState() }),
  prepared: verifyPrepared,
});
assert.equal(completeVerify.status, 'catalog_complete');
assert.equal(
  completeVerify.topology.publicEffectsPresent,
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_EXPECTED_EFFECTS,
);

const applyClient = new FakePublicCutoverClient();
const applied = await applySampleInventoryPublicCutover({
  client: applyClient,
  now: () => new Date('2026-07-27T08:01:00.000Z'),
  prepared: applyPrepared,
});
assert.equal(applied.status, 'applied');
assert.equal(applied.policy.committed, true);
assert.equal(applied.policy.migrationBodyExecuted, true);
assert.equal(applied.policy.ledgerWrites, false);
assert.equal(applied.policy.legacyImportExecuted, false);
assert.equal(
  applied.topology.after.publicEffectsPresent,
  SAMPLE_INVENTORY_PUBLIC_CUTOVER_EXPECTED_EFFECTS,
);
assert.equal(applyClient.queries.filter((query) => query.sql === migrationSql).length, 1);
assert.equal(applyClient.queries.filter((query) => query.sql === baseHealthCheckSql).length, 1);
assert.equal(applyClient.queries.filter((query) => query.sql === healthCheckSql).length, 1);
assert.equal(applyClient.queries.at(-1).sql, 'COMMIT');
const lockQuery = applyClient.queries.find((query) => (
  query.sql.includes('sample_inventory_public_cutover:advisory_locks')
));
assert.equal(lockQuery.params[0].length, 3);
assert.ok(applyClient.queries.every((query) => !query.sql.includes('warehouse.')));
assert.ok(applyClient.queries.every((query) => (
  !/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\.aios_schema_migrations\b/iu.test(query.sql)
)));

const noOpClient = new FakePublicCutoverClient({ state: completeState() });
const noOp = await applySampleInventoryPublicCutover({ client: noOpClient, prepared: applyPrepared });
assert.equal(noOp.status, 'already_applied_healthy');
assert.equal(noOp.policy.migrationBodyExecuted, false);
assert.equal(noOp.policy.databaseWrites, false);
assert.equal(noOpClient.queries.some((query) => query.sql === healthCheckSql), true);

const partialApplyClient = new FakePublicCutoverClient({
  state: absentState({ table: 1, columns: 5, constraints: 2 }),
});
const partialApplyError = await captureAsyncError(() => applySampleInventoryPublicCutover({
  client: partialApplyClient,
  prepared: applyPrepared,
}));
assert.match(partialApplyError.message, /partial or drifted/u);
assert.equal(partialApplyError.cutoverStage, 'inspect_before');
assert.equal(partialApplyClient.queries.at(-1).sql, 'ROLLBACK');

const healthFailureClient = new FakePublicCutoverClient({ healthCheckHealthy: false });
const healthFailure = await captureAsyncError(() => applySampleInventoryPublicCutover({
  client: healthFailureClient,
  prepared: applyPrepared,
}));
assert.match(healthFailure.message, /health check failed/u);
assert.equal(healthFailure.cutoverStage, 'execute_health_check');
assert.equal(healthFailure.cutoverMigrationBodyExecuted, true);
assert.deepEqual(healthFailureClient.state, absentState());
assert.equal(healthFailureClient.queries.at(-1).sql, 'ROLLBACK');

const incompletePostClient = new FakePublicCutoverClient({
  migrationState: absentState({ table: 1, columns: 7, constraints: 6, indexes: 1, thresholdDefault: '3' }),
});
const incompletePost = await captureAsyncError(() => applySampleInventoryPublicCutover({
  client: incompletePostClient,
  prepared: applyPrepared,
}));
assert.match(incompletePost.message, /postconditions are incomplete/u);
assert.deepEqual(incompletePostClient.state, absentState());

const databaseMismatch = await captureAsyncError(() => verifySampleInventoryPublicCutover({
  client: new FakePublicCutoverClient({ databaseName: 'wrong_database' }),
  prepared: verifyPrepared,
}));
assert.match(databaseMismatch.message, /database identity differs/u);

const artifactRoot = mkdtempSync(path.join(tmpdir(), 'sample-inventory-public-cutover-artifact-'));
try {
  const outputPath = path.join(artifactRoot, 'result.json');
  const reservation = reserveExclusiveMigrationAuditJson(outputPath);
  const artifact = writeReservedMigrationAuditJson(reservation, applied);
  assert.equal(artifact.path, outputPath);
  assert.match(
    captureError(() => reserveExclusiveMigrationAuditJson(outputPath)).message,
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
assert.match(helpRun.stdout, /targets only backend\/015/u);
assert.match(helpRun.stdout, /requires a complete\s+backend\/014 catalog/u);
const preconnectRoot = mkdtempSync(path.join(tmpdir(), 'sample-inventory-public-cutover-preconnect-'));
try {
  const outputPath = path.join(preconnectRoot, 'must-not-exist.json');
  const rejectedRun = spawnSync(process.execPath, [
    ENTRY_PATH,
    'apply',
    '--expected-migration-sha256',
    SAMPLE_INVENTORY_PUBLIC_CUTOVER_TARGET.checksum,
    '--output',
    outputPath,
    '--confirm-public-cutover',
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...baseEnv, DATABASE_URL: 'postgresql://user:secret@example.invalid/aios' },
  });
  assert.equal(rejectedRun.status, 1);
  assert.match(rejectedRun.stderr, /apply-backend-015-v1/u);
  assert.doesNotMatch(rejectedRun.stderr, /example\.invalid|secret/u);
  assert.equal(existsSync(outputPath), false);
} finally {
  rmSync(preconnectRoot, { force: true, recursive: true });
}

console.log('[aios-sample-inventory-public-cutover.behavior] OK: backend/014 prerequisite, backend/015 pins, read-only verify, transactional apply, rollback, no-op, ledger isolation, and artifact safety passed.');
