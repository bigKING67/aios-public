#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import {
  parseAgentContextCutoverArgs,
  resolveAgentContextCutoverAuthorization,
} from '../../lib/migrations/aios-agent-context-cutover-cli.mjs';
import {
  AGENT_CONTEXT_CUTOVER_ADVISORY_LOCK,
  AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256,
  AGENT_CONTEXT_CUTOVER_TARGETS,
  agentContextDatabaseIdentitySha256,
  applyAgentContextCutover,
  prepareAgentContextCutover,
  verifyAgentContextCutover,
} from '../../lib/migrations/aios-agent-context-cutover.mjs';

const ENTRY_PATH = 'scripts/migrations/aios-agent-context-cutover.mjs';
const GIT_SHA = 'a'.repeat(40);
const DATABASE_IDENTITY_SHA256 = agentContextDatabaseIdentitySha256({
  databaseName: 'aios_fixture',
  serverAddress: '127.0.0.1',
  serverPort: '5432',
});
const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
const migrationSqlByIdentity = Object.fromEntries(
  AGENT_CONTEXT_CUTOVER_TARGETS.map((target) => [
    target.identity,
    readFileSync(target.relativePath, 'utf8'),
  ]),
);

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
  return prepareAgentContextCutover({
    command: 'verify',
    expectedBundleSha256: AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256,
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: null,
    expectedGitSha: GIT_SHA,
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '' },
    migrationAdvisoryLockKey: descriptor.advisoryLockKey,
    migrationSqlByIdentity,
    records,
    ...overrides,
  });
}

function readyState(overrides = {}) {
  return {
    columns: 0,
    constraints: 0,
    functions: 0,
    indexes: 0,
    permissions: 0,
    prerequisite: true,
    relations: 0,
    triggers: 0,
    ...overrides,
  };
}

function completeState(overrides = {}) {
  return {
    columns: 9,
    constraints: 4,
    functions: 1,
    indexes: 11,
    permissions: 7,
    prerequisite: true,
    relations: 10,
    triggers: 1,
    ...overrides,
  };
}

class FakeAgentContextCutoverClient {
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
    if (text.includes('agent_context_cutover:topology')) {
      return {
        rows: [{
          database_name: this.databaseName,
          ledger_exists: this.ledgerExists,
          prerequisite_topology_complete: this.state.prerequisite,
          server_address: '127.0.0.1',
          server_port: '5432',
          target_columns_present: this.state.columns,
          target_constraints_present: this.state.constraints,
          target_functions_present: this.state.functions,
          target_indexes_present: this.state.indexes,
          target_permissions_present: this.state.permissions,
          target_relations_present: this.state.relations,
          target_triggers_present: this.state.triggers,
          transaction_id: null,
          transaction_read_only: this.readOnly ? 'on' : 'off',
        }],
      };
    }
    if (text.includes('agent_context_cutover:transaction_id')) {
      return { rows: [{ transaction_id: null }] };
    }
    if (text.includes('agent_context_cutover:backend/018')) {
      this.state = { ...this.migrationState };
      return { rows: [] };
    }
    if (text.includes('agent_context_cutover:independent_health') && !this.healthCheckHealthy) {
      throw new Error('fixture agent context health check failed');
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
      || sql.startsWith('/* agent_context_cutover:');
    assert.equal(allowed, true, `verify issued unexpected SQL: ${sql.slice(0, 80)}`);
    assert.doesNotMatch(sql, /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|COMMIT)\b/imu);
  }
}

assert.deepEqual(
  parseAgentContextCutoverArgs([
    'verify',
    `--expected-bundle-sha256=${AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256}`,
    '--output=/tmp/agent-context-cutover.json',
  ]),
  {
    command: 'verify',
    confirmed: false,
    expectedBundleSha256: AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256,
    help: false,
    outputPath: '/tmp/agent-context-cutover.json',
  },
);
assert.match(
  captureError(() => parseAgentContextCutoverArgs([
    'verify',
    '--expected-bundle-sha256',
    AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256,
    '--output',
    '/tmp/result.json',
    '--confirm-agent-context-cutover',
  ])).message,
  /valid only for apply/u,
);
assert.match(
  captureError(() => parseAgentContextCutoverArgs(['baseline'])).message,
  /Unsupported agent context cutover command/u,
);

const baseEnv = {
  AIOS_AGENT_CONTEXT_EXPECTED_DATABASE: 'aios_fixture',
  AIOS_MIGRATION_EXPECTED_GIT_SHA: GIT_SHA,
};
assert.deepEqual(
  resolveAgentContextCutoverAuthorization({
    command: 'verify',
    confirmed: false,
    env: { ...baseEnv, AIOS_AGENT_CONTEXT_CUTOVER_ALLOW_LIVE_READONLY: '1' },
  }),
  {
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: null,
    expectedGitSha: GIT_SHA,
  },
);
assert.match(
  captureError(() => resolveAgentContextCutoverAuthorization({
    command: 'apply', confirmed: true, env: baseEnv,
  })).message,
  /apply-backend-018-020-v1/u,
);
assert.deepEqual(
  resolveAgentContextCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: {
      ...baseEnv,
      AIOS_AGENT_CONTEXT_CUTOVER_WRITE_ACK: 'apply-backend-018-020-v1',
      AIOS_AGENT_CONTEXT_EXPECTED_DATABASE_IDENTITY_SHA256: DATABASE_IDENTITY_SHA256,
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
assert.equal(verifyPrepared.migration.checksum, AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256);
assert.deepEqual(
  verifyPrepared.migrations.map((migration) => `${migration.namespace}/${migration.version}`),
  ['backend/018', 'backend/019', 'backend/020'],
);
assert.doesNotMatch(verifyPrepared.migration.sql, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu);
assert.match(verifyPrepared.migration.sql, /agent_context_cutover:backend\/018/u);
assert.match(verifyPrepared.migration.sql, /agent_context_cutover:backend\/020/u);
assert.match(
  captureError(() => prepared({
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '?? unrelated' },
  })).message,
  /dirty worktree/u,
);
assert.match(
  captureError(() => prepared({ expectedBundleSha256: 'b'.repeat(64) })).message,
  /bundle checksum drifted/u,
);
assert.match(
  captureError(() => prepared({
    migrationSqlByIdentity: {
      ...migrationSqlByIdentity,
      'backend/019': `${migrationSqlByIdentity['backend/019']}\n-- drift`,
    },
  })).message,
  /bytes differ/u,
);

const readyClient = new FakeAgentContextCutoverClient();
const readyVerify = await verifyAgentContextCutover({
  client: readyClient,
  now: () => new Date('2026-09-07T02:00:00.000Z'),
  prepared: verifyPrepared,
});
assert.equal(readyVerify.status, 'ready_for_apply');
assert.equal(readyVerify.ready, true);
assert.equal(readyVerify.policy.transactionIdAssigned, false);
assertVerifySqlSafe(readyClient);

const completeVerify = await verifyAgentContextCutover({
  client: new FakeAgentContextCutoverClient({ state: completeState() }),
  prepared: verifyPrepared,
});
assert.equal(completeVerify.status, 'catalog_complete');
assert.equal(completeVerify.ready, true);

for (const [options, expectedStatus] of [
  [{ ledgerExists: true }, 'blocked_ledger_present'],
  [{ state: readyState({ prerequisite: false }) }, 'blocked_prerequisite_topology'],
  [{ state: readyState({ relations: 1 }) }, 'blocked_partial_topology'],
  [{ state: completeState({ permissions: 6 }) }, 'blocked_partial_topology'],
]) {
  const blocked = await verifyAgentContextCutover({
    client: new FakeAgentContextCutoverClient(options),
    prepared: verifyPrepared,
  });
  assert.equal(blocked.status, expectedStatus);
  assert.equal(blocked.ready, false);
}

const rollbackClient = new FakeAgentContextCutoverClient({ healthCheckHealthy: false });
const rollbackError = await captureAsyncError(() => applyAgentContextCutover({
  client: rollbackClient,
  prepared: applyPrepared,
}));
assert.equal(rollbackError.cutoverStage, 'execute_independent_health_check');
assert.equal(rollbackError.cutoverCommitted, false);
assert.equal(rollbackError.cutoverMigrationBodyExecuted, true);
assert.deepEqual(rollbackClient.state, readyState());

const applyClient = new FakeAgentContextCutoverClient();
const applied = await applyAgentContextCutover({
  client: applyClient,
  now: () => new Date('2026-09-07T02:01:00.000Z'),
  prepared: applyPrepared,
});
assert.equal(applied.status, 'applied');
assert.equal(applied.policy.committed, true);
assert.equal(applied.policy.migrationBodyExecuted, true);
assert.equal(applied.policy.ledgerWrites, false);
assert.equal(applied.topology.after.catalogComplete, true);
const lockQuery = applyClient.queries.find((query) => query.sql.includes(':advisory_locks'));
assert.ok(lockQuery);
assert.match(lockQuery.sql, /ORDER BY lock_key/u);
assert.ok(lockQuery.params[0].includes(AGENT_CONTEXT_CUTOVER_ADVISORY_LOCK));

const noOpClient = new FakeAgentContextCutoverClient({ state: completeState() });
const noOp = await applyAgentContextCutover({ client: noOpClient, prepared: applyPrepared });
assert.equal(noOp.status, 'already_applied_healthy');
assert.equal(noOp.policy.migrationBodyExecuted, false);
assert.equal(noOp.policy.databaseWrites, false);
assert.equal(
  noOpClient.queries.filter((query) => query.sql.includes('agent_context_cutover:backend/018')).length,
  0,
);

const helpRun = spawnSync(process.execPath, [ENTRY_PATH, '--help'], { encoding: 'utf8' });
assert.equal(helpRun.status, 0);
assert.match(helpRun.stdout, /targets only backend\/018, backend\/019, and backend\/020/u);
assert.match(helpRun.stdout, /one runner-managed serializable transaction/u);
assert.match(helpRun.stdout, /never[\s\S]*applies backend\/001-017 or warehouse migrations/u);
assert.doesNotMatch(helpRun.stdout, /AIOS_MIGRATION_WRITE_ACK|baseline --confirm/u);

const preconnectRoot = mkdtempSync(path.join(tmpdir(), 'agent-context-cutover-'));
try {
  const outputPath = path.join(preconnectRoot, 'must-not-exist.json');
  const rejectedRun = spawnSync(process.execPath, [
    ENTRY_PATH,
    'apply',
    '--expected-bundle-sha256',
    AGENT_CONTEXT_CUTOVER_BUNDLE_SHA256,
    '--output',
    outputPath,
    '--confirm-agent-context-cutover',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...baseEnv,
      DATABASE_URL: 'postgresql://user:secret@example.invalid/aios',
    },
  });
  assert.equal(rejectedRun.status, 1);
  assert.match(rejectedRun.stderr, /apply-backend-018-020-v1/u);
  assert.doesNotMatch(rejectedRun.stderr, /example\.invalid|secret/u);
  assert.equal(existsSync(outputPath), false);
} finally {
  rmSync(preconnectRoot, { force: true, recursive: true });
}

console.log(
  '[aios-agent-context-cutover-behavior] OK: pins, unwrap contract, read-only verify, blocked partial states, sorted locks, rollback, atomic apply, no-op, and entrypoint safety passed.',
);
