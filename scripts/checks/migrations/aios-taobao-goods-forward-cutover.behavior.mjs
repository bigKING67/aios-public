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
  parseTaobaoGoodsForwardCutoverArgs,
  resolveTaobaoGoodsForwardCutoverAuthorization,
} from '../../lib/migrations/aios-taobao-goods-forward-cutover-cli.mjs';
import {
  applyTaobaoGoodsForwardCutover,
  prepareTaobaoGoodsForwardCutover,
  taobaoGoodsDatabaseIdentitySha256,
  TAOBAO_GOODS_FORWARD_CUTOVER_HEALTH_CHECK_PATH,
  TAOBAO_GOODS_FORWARD_CUTOVER_TARGET,
  verifyTaobaoGoodsForwardCutover,
} from '../../lib/migrations/aios-taobao-goods-forward-cutover.mjs';

const GIT_SHA = 'a'.repeat(40);
const ENTRY_PATH = 'scripts/migrations/aios-taobao-goods-forward-cutover.mjs';
const migrationSql = readFileSync(TAOBAO_GOODS_FORWARD_CUTOVER_TARGET.relativePath, 'utf8');
const healthCheckSql = readFileSync(TAOBAO_GOODS_FORWARD_CUTOVER_HEALTH_CHECK_PATH, 'utf8');
const records = discoverAiosMigrations({ descriptor: readAiosMigrationDescriptor() });
const DATABASE_IDENTITY_SHA256 = taobaoGoodsDatabaseIdentitySha256({
  databaseName: 'aios_fixture',
  serverAddress: '127.0.0.1',
  serverPort: '5432',
});
const OLD_PROCEDURE = `CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(date,date)
LANGUAGE plpgsql AS $$ BEGIN INSERT INTO ads.taobao_trade_sale_goods_daily SELECT src.*, NOW(); END $$`;
const NEW_PROCEDURE = `CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(date,date)
LANGUAGE plpgsql AS $$ BEGIN SELECT src.crowd_ad_favorite_cart_cost FROM ods.taobao_trade_sale_goods_raw src; END $$`;
const GOVERNED_WRAPPER_PROCEDURE = `CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(date,date)
LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
PERFORM ads.assert_taobao_trade_sale_goods_daily_schema_contract();
CALL ads.refresh_taobao_trade_sale_goods_daily_unchecked($1, $2); END $$`;
const OLD_PROCEDURE_SHA256 = await import('node:crypto').then(({ createHash }) => (
  createHash('sha256').update(OLD_PROCEDURE).digest('hex')
));
const GOVERNED_WRAPPER_PROCEDURE_SHA256 = await import('node:crypto').then(({ createHash }) => (
  createHash('sha256').update(GOVERNED_WRAPPER_PROCEDURE).digest('hex')
));

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
  return prepareTaobaoGoodsForwardCutover({
    command: 'verify',
    expectedDatabase: 'aios_fixture',
    expectedGitSha: GIT_SHA,
    expectedMigrationSha256: TAOBAO_GOODS_FORWARD_CUTOVER_TARGET.checksum,
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
    failOn = '',
    healthCheckHealthy = true,
    ledgerExists = false,
    state = 'ready',
  } = {}) {
    this.databaseName = databaseName;
    this.failOn = failOn;
    this.healthCheckHealthy = healthCheckHealthy;
    this.ledgerExists = ledgerExists;
    this.queries = [];
    this.readOnly = false;
    this.snapshot = null;
    this.state = state;
  }

  topologyRow() {
    const governed = this.state === 'governed';
    const healthy = this.state === 'healthy' || governed;
    const partial = this.state === 'partial';
    const prerequisite = this.state === 'prerequisite';
    return {
      business_column_mismatches: healthy ? 0 : partial ? 2 : 1,
      database_name: this.databaseName,
      ledger_exists: this.ledgerExists,
      operational_column_valid: !prerequisite,
      mapping_procedure_definition: governed ? NEW_PROCEDURE : undefined,
      procedure_definition: governed
        ? GOVERNED_WRAPPER_PROCEDURE
        : healthy
          ? NEW_PROCEDURE
          : OLD_PROCEDURE,
      procedure_exists: !prerequisite,
      refresh_state_exists: !prerequisite,
      server_address: '127.0.0.1',
      server_port: '5432',
      source_column_valid: !prerequisite,
      source_table_exists: !prerequisite,
      target_column_present: healthy || partial,
      target_column_valid: healthy || partial,
      target_table_exists: !prerequisite,
      transaction_id: null,
      transaction_read_only: this.readOnly ? 'on' : 'off',
    };
  }

  async query(sql, params = []) {
    const text = String(sql);
    this.queries.push({ params, sql: text });
    if (text.startsWith('BEGIN')) {
      this.snapshot = { ledgerExists: this.ledgerExists, state: this.state };
      this.readOnly = text.includes('READ ONLY');
      return { rows: [] };
    }
    if (text === 'ROLLBACK') {
      this.ledgerExists = this.snapshot.ledgerExists;
      this.state = this.snapshot.state;
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
    if (text.includes('taobao_goods_forward_cutover:topology')) {
      return { rows: [this.topologyRow()] };
    }
    if (text.includes('taobao_goods_forward_cutover:transaction_id')) {
      return { rows: [{ transaction_id: null }] };
    }
    if (text === migrationSql) {
      this.state = 'healthy';
      return { rows: [] };
    }
    if (text === healthCheckSql) {
      if (!this.healthCheckHealthy) throw new Error('fixture health check failed');
      return { rows: [] };
    }
    return { rows: [] };
  }
}

function assertVerifySqlSafe(client) {
  for (const query of client.queries) {
    const sql = query.sql.trim();
    assert.ok(
      sql.startsWith('BEGIN TRANSACTION READ ONLY')
        || sql.startsWith('SELECT')
        || sql.startsWith('/* taobao_goods_forward_cutover:')
        || sql === 'ROLLBACK',
      `unexpected verify SQL: ${sql.slice(0, 80)}`,
    );
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|COMMIT)\b/iu);
  }
}

assert.deepEqual(
  parseTaobaoGoodsForwardCutoverArgs([
    'verify',
    '--expected-migration-sha256',
    TAOBAO_GOODS_FORWARD_CUTOVER_TARGET.checksum,
    '--output=/private/tmp/taobao-goods-forward-cutover.json',
  ]),
  {
    command: 'verify',
    confirmed: false,
    expectedMigrationSha256: TAOBAO_GOODS_FORWARD_CUTOVER_TARGET.checksum,
    help: false,
    outputPath: '/private/tmp/taobao-goods-forward-cutover.json',
  },
);
assert.match(
  captureError(() => parseTaobaoGoodsForwardCutoverArgs(['apply', '--output', '/tmp/result.json'])),
  /expected-migration-sha256/u,
);
assert.match(
  captureError(() => parseTaobaoGoodsForwardCutoverArgs([
    'verify',
    '--expected-migration-sha256',
    TAOBAO_GOODS_FORWARD_CUTOVER_TARGET.checksum,
    '--output',
    '/tmp/result.json',
    '--confirm-forward-cutover',
  ])),
  /valid only for apply/u,
);
assert.match(
  captureError(() => parseTaobaoGoodsForwardCutoverArgs(['baseline'])),
  /Unsupported Taobao goods forward cutover command/u,
);

const baseEnv = {
  AIOS_MIGRATION_EXPECTED_GIT_SHA: GIT_SHA,
  AIOS_TAOBAO_GOODS_EXPECTED_DATABASE: 'aios_fixture',
};
assert.deepEqual(
  resolveTaobaoGoodsForwardCutoverAuthorization({
    command: 'verify',
    confirmed: false,
    env: { ...baseEnv, AIOS_TAOBAO_GOODS_CUTOVER_ALLOW_LIVE_READONLY: '1' },
  }),
  {
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: null,
    expectedGitSha: GIT_SHA,
    expectedProcedureSha256: null,
  },
);
assert.match(
  captureError(() => resolveTaobaoGoodsForwardCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: baseEnv,
  })),
  /apply-warehouse-20260806-1140-v1/u,
);
assert.deepEqual(
  resolveTaobaoGoodsForwardCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: {
      ...baseEnv,
      AIOS_TAOBAO_GOODS_CUTOVER_WRITE_ACK: 'apply-warehouse-20260806-1140-v1',
      AIOS_TAOBAO_GOODS_EXPECTED_DATABASE_IDENTITY_SHA256: DATABASE_IDENTITY_SHA256,
      AIOS_TAOBAO_GOODS_EXPECTED_PROCEDURE_SHA256: OLD_PROCEDURE_SHA256,
    },
  }),
  {
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
    expectedGitSha: GIT_SHA,
    expectedProcedureSha256: OLD_PROCEDURE_SHA256,
  },
);

const prepared = prepare();
const applyPrepared = prepare({
  command: 'apply',
  expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
  expectedProcedureSha256: OLD_PROCEDURE_SHA256,
});
assert.equal(prepared.migration.checksum, TAOBAO_GOODS_FORWARD_CUTOVER_TARGET.checksum);
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

const readyClient = new FakeCutoverClient();
const readyVerify = await verifyTaobaoGoodsForwardCutover({
  client: readyClient,
  now: () => new Date('2026-08-06T04:00:00.000Z'),
  prepared,
});
assert.equal(readyVerify.status, 'ready_for_apply');
assert.equal(readyVerify.ready, true);
assert.equal(readyVerify.topology.procedureSha256, OLD_PROCEDURE_SHA256);
assert.equal(readyVerify.topology.serverAddress, undefined);
assert.equal(readyVerify.topology.serverPort, undefined);
assert.equal(readyVerify.policy.rolledBack, true);
assertVerifySqlSafe(readyClient);

const healthyVerify = await verifyTaobaoGoodsForwardCutover({
  client: new FakeCutoverClient({ state: 'healthy' }),
  prepared,
});
assert.equal(healthyVerify.status, 'already_applied_healthy');
assert.equal(healthyVerify.ready, true);

const governedVerify = await verifyTaobaoGoodsForwardCutover({
  client: new FakeCutoverClient({ state: 'governed' }),
  prepared,
});
assert.equal(governedVerify.status, 'already_applied_healthy');
assert.equal(governedVerify.ready, true);
assert.equal(governedVerify.topology.procedureMapsNewColumn, true);
assert.equal(governedVerify.topology.procedureSha256, GOVERNED_WRAPPER_PROCEDURE_SHA256);

const ledgerVerify = await verifyTaobaoGoodsForwardCutover({
  client: new FakeCutoverClient({ ledgerExists: true }),
  prepared,
});
assert.equal(ledgerVerify.status, 'blocked_ledger_present');
assert.equal(ledgerVerify.ready, false);

for (const [state, status] of [
  ['partial', 'blocked_partial_or_drifted'],
  ['prerequisite', 'blocked_prerequisite_drift'],
]) {
  const result = await verifyTaobaoGoodsForwardCutover({
    client: new FakeCutoverClient({ state }),
    prepared,
  });
  assert.equal(result.status, status);
  assert.equal(result.ready, false);
}

const applyClient = new FakeCutoverClient();
const applied = await applyTaobaoGoodsForwardCutover({
  client: applyClient,
  now: () => new Date('2026-08-06T04:01:00.000Z'),
  prepared: applyPrepared,
});
assert.equal(applied.status, 'applied');
assert.equal(applied.policy.committed, true);
assert.equal(applied.policy.migrationBodyExecuted, true);
assert.equal(applied.policy.businessRowsChanged, false);
assert.equal(applied.policy.ledgerWrites, false);
assert.equal(applied.topology.after.contractState, 'healthy');
assert.equal(applyClient.queries.filter((query) => query.sql === migrationSql).length, 1);
assert.equal(applyClient.queries.filter((query) => query.sql === healthCheckSql).length, 1);
assert.equal(applyClient.queries.at(-1).sql, 'COMMIT');
const lockQuery = applyClient.queries.find((query) => (
  query.sql.includes('taobao_goods_forward_cutover:advisory_locks')
));
assert.equal(lockQuery.params[0].length, 3);
assert.ok(applyClient.queries.every((query) => (
  !/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\.aios_schema_migrations\b/iu.test(query.sql)
)));

const noOpClient = new FakeCutoverClient({ state: 'healthy' });
const healthyPrepared = prepare({
  command: 'apply',
  expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
  expectedProcedureSha256: await import('node:crypto').then(({ createHash }) => (
    createHash('sha256').update(NEW_PROCEDURE).digest('hex')
  )),
});
const noOp = await applyTaobaoGoodsForwardCutover({ client: noOpClient, prepared: healthyPrepared });
assert.equal(noOp.status, 'already_applied_healthy');
assert.equal(noOp.policy.migrationBodyExecuted, false);
assert.equal(noOp.policy.databaseWrites, false);

for (const [client, pattern, stage] of [
  [new FakeCutoverClient({ ledgerExists: true }), /canonical migration ledger exists/u, 'inspect_before'],
  [new FakeCutoverClient({ state: 'partial' }), /partial or drifted prerequisites/u, 'inspect_before'],
  [new FakeCutoverClient({ state: 'prerequisite' }), /partial or drifted prerequisites/u, 'inspect_before'],
]) {
  const error = await captureAsyncError(() => applyTaobaoGoodsForwardCutover({
    client,
    prepared: applyPrepared,
  }));
  assert.match(error.message, pattern);
  assert.equal(error.cutoverStage, stage);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
}

const procedureDriftPrepared = prepare({
  command: 'apply',
  expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
  expectedProcedureSha256: 'b'.repeat(64),
});
const procedureDriftClient = new FakeCutoverClient();
const procedureDrift = await captureAsyncError(() => applyTaobaoGoodsForwardCutover({
  client: procedureDriftClient,
  prepared: procedureDriftPrepared,
}));
assert.match(procedureDrift.message, /current procedure differs from the verified pin/u);
assert.equal(procedureDriftClient.queries.at(-1).sql, 'ROLLBACK');

const healthFailureClient = new FakeCutoverClient({ healthCheckHealthy: false });
const healthFailure = await captureAsyncError(() => applyTaobaoGoodsForwardCutover({
  client: healthFailureClient,
  prepared: applyPrepared,
}));
assert.match(healthFailure.message, /health check failed/u);
assert.equal(healthFailure.cutoverStage, 'execute_health_check');
assert.equal(healthFailure.cutoverMigrationBodyExecuted, true);
assert.equal(healthFailureClient.state, 'ready');
assert.equal(healthFailureClient.queries.at(-1).sql, 'ROLLBACK');

const databaseMismatch = await captureAsyncError(() => verifyTaobaoGoodsForwardCutover({
  client: new FakeCutoverClient({ databaseName: 'wrong_database' }),
  prepared,
}));
assert.match(databaseMismatch.message, /database identity differs/u);

const artifactRoot = mkdtempSync(path.join(tmpdir(), 'taobao-goods-cutover-artifact-'));
try {
  const outputPath = path.join(artifactRoot, 'result.json');
  const reservation = reserveExclusiveMigrationAuditJson(outputPath);
  const artifact = writeReservedMigrationAuditJson(reservation, applied);
  assert.equal(artifact.path, outputPath);
  assert.match(captureError(() => reserveExclusiveMigrationAuditJson(outputPath)), /EEXIST|exist/iu);
} finally {
  rmSync(artifactRoot, { force: true, recursive: true });
}

const redacted = redactMigrationText(
  'postgresql://admin:secret@example.invalid/groland?password=hunter2 token=visible',
);
assert.doesNotMatch(redacted, /secret|hunter2/u);

const helpRun = spawnSync(process.execPath, [ENTRY_PATH, '--help'], { encoding: 'utf8' });
assert.equal(helpRun.status, 0);
assert.match(helpRun.stdout, /targets only warehouse\/20260806_1140/u);
const preconnectRoot = mkdtempSync(path.join(tmpdir(), 'taobao-goods-cutover-preconnect-'));
try {
  const outputPath = path.join(preconnectRoot, 'must-not-exist.json');
  const rejectedRun = spawnSync(process.execPath, [
    ENTRY_PATH,
    'apply',
    '--expected-migration-sha256',
    TAOBAO_GOODS_FORWARD_CUTOVER_TARGET.checksum,
    '--output',
    outputPath,
    '--confirm-forward-cutover',
  ], {
    encoding: 'utf8',
    env: { ...process.env, ...baseEnv, DATABASE_URL: 'postgresql://user:secret@example.invalid/aios' },
  });
  assert.equal(rejectedRun.status, 1);
  assert.match(rejectedRun.stderr, /apply-warehouse-20260806-1140-v1/u);
  assert.doesNotMatch(rejectedRun.stderr, /example\.invalid|secret/u);
  assert.equal(existsSync(outputPath), false);
} finally {
  rmSync(preconnectRoot, { force: true, recursive: true });
}

console.log('[aios-taobao-goods-forward-cutover.behavior] OK: pins, read-only verify, transactional apply, rollback, idempotency, ledger isolation, and artifact safety passed.');
