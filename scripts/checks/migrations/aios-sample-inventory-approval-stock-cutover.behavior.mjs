#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import {
  parseSampleInventoryApprovalStockCutoverArgs,
  resolveSampleInventoryApprovalStockCutoverAuthorization,
} from '../../lib/migrations/aios-sample-inventory-approval-stock-cutover-cli.mjs';
import {
  applySampleInventoryApprovalStockCutover,
  prepareSampleInventoryApprovalStockCutover,
  SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_HEALTH_CHECK_PATH,
  SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET,
  verifySampleInventoryApprovalStockCutover,
} from '../../lib/migrations/aios-sample-inventory-approval-stock-cutover.mjs';
import { sampleInventoryDatabaseIdentitySha256 } from '../../lib/migrations/aios-sample-inventory-forward-cutover.mjs';

const ENTRY_PATH = 'scripts/migrations/aios-sample-inventory-approval-stock-cutover.mjs';
const GIT_SHA = 'a'.repeat(40);
const DATABASE_IDENTITY_SHA256 = sampleInventoryDatabaseIdentitySha256({
  databaseName: 'aios_fixture',
  serverAddress: '127.0.0.1',
  serverPort: '5432',
});
const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
const migrationSql = readFileSync(SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.relativePath, 'utf8');
const healthCheckSql = readFileSync(SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_HEALTH_CHECK_PATH, 'utf8');

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
  return prepareSampleInventoryApprovalStockCutover({
    command: 'verify',
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: null,
    expectedGitSha: GIT_SHA,
    expectedMigrationSha256: SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.checksum,
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '' },
    healthCheckSql,
    migrationAdvisoryLockKey: descriptor.advisoryLockKey,
    migrationSql,
    records,
    ...overrides,
  });
}

function readyState(overrides = {}) {
  return {
    activeApproved: 2,
    affectedSamples: 1,
    exactDebited: 0,
    malformedDebits: 0,
    missingSamples: 0,
    pendingDebitQuantity: 5,
    pendingDebits: 2,
    prerequisites: 5,
    violatingSamples: 0,
    ...overrides,
  };
}

function completeState(overrides = {}) {
  return {
    activeApproved: 2,
    affectedSamples: 0,
    exactDebited: 2,
    malformedDebits: 0,
    missingSamples: 0,
    pendingDebitQuantity: 0,
    pendingDebits: 0,
    prerequisites: 5,
    violatingSamples: 0,
    ...overrides,
  };
}

class FakeApprovalStockCutoverClient {
  constructor({
    databaseName = 'aios_fixture',
    healthCheckHealthy = true,
    ledgerExists = false,
    migrationState = completeState(),
    state = readyState(),
  } = {}) {
    this.databaseName = databaseName;
    this.healthCheckHealthy = healthCheckHealthy;
    this.ledgerExists = ledgerExists;
    this.migrationState = { ...migrationState };
    this.queries = [];
    this.readOnly = false;
    this.snapshot = null;
    this.state = { ...state };
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
    if (text.includes('sample_inventory_approval_stock_cutover:topology')) {
      return {
        rows: [{
          active_approved_requests: this.state.activeApproved,
          affected_samples: this.state.affectedSamples,
          database_name: this.databaseName,
          exact_debited_requests: this.state.exactDebited,
          ledger_exists: this.ledgerExists,
          malformed_debit_requests: this.state.malformedDebits,
          missing_samples: this.state.missingSamples,
          pending_debit_quantity: this.state.pendingDebitQuantity,
          pending_debit_requests: this.state.pendingDebits,
          prerequisite_relations_present: this.state.prerequisites,
          server_address: '127.0.0.1',
          server_port: '5432',
          transaction_id: null,
          transaction_read_only: this.readOnly ? 'on' : 'off',
          violating_samples: this.state.violatingSamples,
        }],
      };
    }
    if (text.includes('sample_inventory_approval_stock_cutover:transaction_id')) {
      return { rows: [{ transaction_id: null }] };
    }
    if (text === migrationSql) {
      this.state = { ...this.migrationState };
      return { rows: [] };
    }
    if (text === healthCheckSql && !this.healthCheckHealthy) {
      throw new Error('fixture approval-stock health check failed');
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
      || sql.startsWith('/* sample_inventory_approval_stock_cutover:');
    assert.equal(allowed, true, `verify issued unexpected SQL: ${sql.slice(0, 80)}`);
    assert.doesNotMatch(sql, /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|COMMIT)\b/imu);
  }
}

assert.deepEqual(
  parseSampleInventoryApprovalStockCutoverArgs([
    'verify',
    `--expected-migration-sha256=${SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.checksum}`,
    '--output=/tmp/sample-inventory-approval-stock-cutover.json',
  ]),
  {
    command: 'verify',
    confirmed: false,
    expectedMigrationSha256: SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.checksum,
    help: false,
    outputPath: '/tmp/sample-inventory-approval-stock-cutover.json',
  },
);
assert.match(
  captureError(() => parseSampleInventoryApprovalStockCutoverArgs([
    'verify',
    '--expected-migration-sha256',
    SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.checksum,
    '--output',
    '/tmp/result.json',
    '--confirm-approval-stock-cutover',
  ])).message,
  /valid only for apply/u,
);
assert.match(
  captureError(() => parseSampleInventoryApprovalStockCutoverArgs(['baseline'])).message,
  /Unsupported sample inventory approval-stock cutover command/u,
);

const baseEnv = {
  AIOS_MIGRATION_EXPECTED_GIT_SHA: GIT_SHA,
  AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE: 'aios_fixture',
};
assert.deepEqual(
  resolveSampleInventoryApprovalStockCutoverAuthorization({
    command: 'verify',
    confirmed: false,
    env: {
      ...baseEnv,
      AIOS_SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_ALLOW_LIVE_READONLY: '1',
    },
  }),
  {
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: null,
    expectedGitSha: GIT_SHA,
  },
);
assert.match(
  captureError(() => resolveSampleInventoryApprovalStockCutoverAuthorization({
    command: 'apply', confirmed: true, env: baseEnv,
  })).message,
  /apply-backend-017-v1/u,
);
assert.deepEqual(
  resolveSampleInventoryApprovalStockCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: {
      ...baseEnv,
      AIOS_SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_WRITE_ACK: 'apply-backend-017-v1',
      AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE_IDENTITY_SHA256: DATABASE_IDENTITY_SHA256,
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
assert.equal(verifyPrepared.migration.checksum, SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.checksum);
assert.match(
  captureError(() => prepared({
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '?? unrelated' },
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

const readyClient = new FakeApprovalStockCutoverClient();
const readyVerify = await verifySampleInventoryApprovalStockCutover({
  client: readyClient,
  now: () => new Date('2026-08-12T12:00:00.000Z'),
  prepared: verifyPrepared,
});
assert.equal(readyVerify.status, 'ready_for_apply');
assert.equal(readyVerify.ready, true);
assert.equal(readyVerify.topology.pendingDebitRequests, 2);
assert.equal(readyVerify.topology.pendingDebitQuantity, 5);
assert.equal(readyVerify.policy.transactionIdAssigned, false);
assertVerifySqlSafe(readyClient);

const completeVerify = await verifySampleInventoryApprovalStockCutover({
  client: new FakeApprovalStockCutoverClient({ state: completeState() }),
  prepared: verifyPrepared,
});
assert.equal(completeVerify.status, 'approval_debits_complete');
assert.equal(completeVerify.ready, true);

for (const [state, expectedStatus] of [
  [readyState({ prerequisites: 4 }), 'blocked_prerequisite_topology'],
  [readyState({ malformedDebits: 1, pendingDebits: 1 }), 'blocked_malformed_debits'],
  [readyState({ missingSamples: 1 }), 'blocked_missing_samples'],
  [readyState({ violatingSamples: 1 }), 'blocked_invalid_stock'],
]) {
  const blocked = await verifySampleInventoryApprovalStockCutover({
    client: new FakeApprovalStockCutoverClient({ state }),
    prepared: verifyPrepared,
  });
  assert.equal(blocked.status, expectedStatus);
  assert.equal(blocked.ready, false);
}
const ledgerBlocked = await verifySampleInventoryApprovalStockCutover({
  client: new FakeApprovalStockCutoverClient({ ledgerExists: true }),
  prepared: verifyPrepared,
});
assert.equal(ledgerBlocked.status, 'blocked_ledger_present');
assert.equal(ledgerBlocked.ready, false);

const rollbackClient = new FakeApprovalStockCutoverClient({ healthCheckHealthy: false });
const rollbackError = await captureAsyncError(() => applySampleInventoryApprovalStockCutover({
  client: rollbackClient,
  prepared: applyPrepared,
}));
assert.equal(rollbackError.cutoverStage, 'execute_health_check');
assert.equal(rollbackError.cutoverCommitted, false);
assert.equal(rollbackError.cutoverMigrationBodyExecuted, true);
assert.deepEqual(rollbackClient.state, readyState());

const applyClient = new FakeApprovalStockCutoverClient();
const applied = await applySampleInventoryApprovalStockCutover({
  client: applyClient,
  now: () => new Date('2026-08-12T12:01:00.000Z'),
  prepared: applyPrepared,
});
assert.equal(applied.status, 'applied');
assert.equal(applied.policy.committed, true);
assert.equal(applied.policy.migrationBodyExecuted, true);
assert.equal(applied.policy.ledgerWrites, false);
assert.equal(applied.topology.after.pendingDebitRequests, 0);
const lockQuery = applyClient.queries.find((query) => query.sql.includes(':advisory_locks'));
assert.ok(lockQuery);
assert.match(lockQuery.sql, /ORDER BY lock_key/u);
assert.ok(lockQuery.params[0].includes('aios:sample-inventory-approval-stock-cutover:backend-017:v1'));

const noOpClient = new FakeApprovalStockCutoverClient({ state: completeState() });
const noOp = await applySampleInventoryApprovalStockCutover({
  client: noOpClient,
  prepared: applyPrepared,
});
assert.equal(noOp.status, 'already_applied_healthy');
assert.equal(noOp.policy.migrationBodyExecuted, false);
assert.equal(noOp.policy.databaseWrites, false);
assert.equal(noOpClient.queries.filter((query) => query.sql === migrationSql).length, 0);

const helpRun = spawnSync(process.execPath, [ENTRY_PATH, '--help'], { encoding: 'utf8' });
assert.equal(helpRun.status, 0);
assert.match(helpRun.stdout, /targets only backend\/017/u);
assert.match(helpRun.stdout, /never[\s\S]*applies backend\/016/u);
assert.doesNotMatch(
  helpRun.stdout,
  /AIOS_MIGRATION_WRITE_ACK|baseline --confirm|016_sample_inventory_manual_reservation_semantics\.sql/u,
);

const preconnectRoot = mkdtempSync(path.join(tmpdir(), 'sample-inventory-approval-stock-cutover-'));
try {
  const outputPath = path.join(preconnectRoot, 'must-not-exist.json');
  const rejectedRun = spawnSync(process.execPath, [
    ENTRY_PATH,
    'apply',
    '--expected-migration-sha256',
    SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_TARGET.checksum,
    '--output',
    outputPath,
    '--confirm-approval-stock-cutover',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...baseEnv,
      DATABASE_URL: 'postgresql://user:secret@example.invalid/aios',
    },
  });
  assert.equal(rejectedRun.status, 1);
  assert.match(rejectedRun.stderr, /apply-backend-017-v1/u);
  assert.doesNotMatch(rejectedRun.stderr, /example\.invalid|secret/u);
  assert.equal(existsSync(outputPath), false);
} finally {
  rmSync(preconnectRoot, { force: true, recursive: true });
}

console.log(
  '[aios-sample-inventory-approval-stock-cutover-behavior] OK: pins, read-only verify, blocked states, sorted locks, rollback, apply, no-op, and entrypoint safety passed.',
);
