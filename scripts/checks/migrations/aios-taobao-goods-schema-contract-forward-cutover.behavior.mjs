#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import { ledgerFreeSha256 } from '../../lib/migrations/aios-ledger-free-forward-cutover-engine.mjs';
import {
  parseTaobaoGoodsSchemaContractForwardCutoverArgs,
  resolveTaobaoGoodsSchemaContractForwardCutoverAuthorization,
} from '../../lib/migrations/aios-taobao-goods-schema-contract-forward-cutover-cli.mjs';
import {
  applyTaobaoGoodsSchemaContractForwardCutover,
  prepareTaobaoGoodsSchemaContractForwardCutover,
  taobaoGoodsSchemaContractDatabaseIdentitySha256,
  TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_HEALTH_CHECK_PATH,
  TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET,
  TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE,
  verifyTaobaoGoodsSchemaContractForwardCutover,
} from '../../lib/migrations/aios-taobao-goods-schema-contract-forward-cutover.mjs';


const GIT_SHA = 'a'.repeat(40);
const DATABASE_IDENTITY_SHA256 = taobaoGoodsSchemaContractDatabaseIdentitySha256({
  databaseName: 'aios_fixture',
  serverAddress: '127.0.0.1',
  serverPort: '5432',
});
const migrationSql = readFileSync(
  TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET.relativePath,
  'utf8',
);
const prerequisiteMigrationSql = readFileSync(
  TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE.relativePath,
  'utf8',
);
const healthCheckSql = readFileSync(
  TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_HEALTH_CHECK_PATH,
  'utf8',
);
const records = discoverAiosMigrations({ descriptor: readAiosMigrationDescriptor() });
const OLD_FULL = 'CREATE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(date,date) AS old_full';
const OLD_INCREMENTAL =
  'CREATE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily_incremental(integer,boolean) AS old_incremental';
const HEALTHY_FULL = `CREATE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(date,date)
SECURITY DEFINER AS $$ PERFORM ads.assert_taobao_trade_sale_goods_daily_schema_contract();
CALL ads.refresh_taobao_trade_sale_goods_daily_unchecked($1, $2); $$`;
const HEALTHY_INCREMENTAL =
  `CREATE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily_incremental(integer,boolean)
SECURITY DEFINER AS $$ PERFORM ads.assert_taobao_trade_sale_goods_daily_schema_contract();
CALL ads.refresh_taobao_trade_sale_goods_daily_incremental_unchecked($1, $2); $$`;
const HEALTHY_ASSERTION = [
  'character_maximum_length',
  'numeric_precision',
  'numeric_scale',
  'datetime_precision',
  'etl_loaded_at',
].join(' ');
const OLD_RUNTIME_SHA256 = ledgerFreeSha256(`${OLD_FULL}\0${OLD_INCREMENTAL}`);
const HEALTHY_RUNTIME_SHA256 = ledgerFreeSha256(`${HEALTHY_FULL}\0${HEALTHY_INCREMENTAL}`);


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
  return prepareTaobaoGoodsSchemaContractForwardCutover({
    command: 'verify',
    expectedDatabase: 'aios_fixture',
    expectedGitSha: GIT_SHA,
    expectedMigrationSha256: TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET.checksum,
    expectedPrerequisiteMigrationSha256:
      TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE.checksum,
    git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: '' },
    healthCheckSql,
    migrationAdvisoryLockKey: 'aios-schema-migrations-v1',
    migrationSql,
    prerequisiteMigrationSql,
    records,
    ...overrides,
  });
}


class FakeClient {
  constructor({ failOn = '', ledgerExists = false, state = 'metadata' } = {}) {
    this.failOn = failOn;
    this.ledgerExists = ledgerExists;
    this.queries = [];
    this.readOnly = false;
    this.snapshot = null;
    this.state = state;
  }

  topologyRow() {
    const healthy = this.state === 'healthy';
    const metadata = this.state === 'metadata';
    const partial = this.state === 'partial';
    const prerequisite = this.state === 'prerequisite';
    return {
      assertion_definition: healthy ? HEALTHY_ASSERTION : partial ? 'numeric_precision' : '',
      assertion_exists: healthy || partial,
      business_column_mismatches: prerequisite || metadata ? 1 : 0,
      database_name: 'aios_fixture',
      full_internal_exists: healthy,
      full_wrapper_security_definer: healthy,
      full_wrapper_definition: healthy ? HEALTHY_FULL : OLD_FULL,
      full_wrapper_exists: true,
      incremental_internal_exists: healthy,
      incremental_wrapper_security_definer: healthy,
      incremental_wrapper_definition: healthy ? HEALTHY_INCREMENTAL : OLD_INCREMENTAL,
      incremental_wrapper_exists: true,
      internal_public_execute_count: 0,
      ledger_exists: this.ledgerExists,
      metadata_normalization_ready: metadata,
      operational_column_valid: !prerequisite,
      refresh_state_exists: !prerequisite,
      server_address: '127.0.0.1',
      server_port: '5432',
      source_table_exists: !prerequisite,
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
    if (text.includes('taobao_goods_schema_contract_forward_cutover:topology')) {
      return { rows: [this.topologyRow()] };
    }
    if (text.includes('taobao_goods_schema_contract_forward_cutover:transaction_id')) {
      return { rows: [{ transaction_id: null }] };
    }
    if (text === prerequisiteMigrationSql) {
      this.state = 'ready';
    }
    if (text === migrationSql) {
      this.state = 'healthy';
    }
    return { rows: [] };
  }
}


assert.deepEqual(
  parseTaobaoGoodsSchemaContractForwardCutoverArgs([
    'verify',
    '--expected-migration-sha256',
    TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET.checksum,
    '--expected-prerequisite-migration-sha256',
    TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE.checksum,
    '--output=/tmp/schema-contract.json',
  ]),
  {
    command: 'verify',
    confirmed: false,
    expectedMigrationSha256: TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET.checksum,
    expectedPrerequisiteMigrationSha256:
      TAOBAO_GOODS_SCHEMA_CONTRACT_METADATA_PREREQUISITE.checksum,
    help: false,
    outputPath: '/tmp/schema-contract.json',
  },
);
assert.match(
  captureError(() => parseTaobaoGoodsSchemaContractForwardCutoverArgs(['apply'])),
  /--output is required/u,
);

const authorizationBase = {
  AIOS_MIGRATION_EXPECTED_GIT_SHA: GIT_SHA,
  AIOS_TAOBAO_GOODS_EXPECTED_DATABASE: 'aios_fixture',
};
assert.deepEqual(
  resolveTaobaoGoodsSchemaContractForwardCutoverAuthorization({
    command: 'verify',
    confirmed: false,
    env: {
      ...authorizationBase,
      AIOS_TAOBAO_GOODS_SCHEMA_CONTRACT_ALLOW_LIVE_READONLY: '1',
    },
  }),
  {
    expectedDatabase: 'aios_fixture',
    expectedDatabaseIdentitySha256: null,
    expectedGitSha: GIT_SHA,
    expectedRuntimeContractSha256: null,
  },
);
assert.match(
  captureError(() => resolveTaobaoGoodsSchemaContractForwardCutoverAuthorization({
    command: 'apply',
    confirmed: true,
    env: authorizationBase,
  })),
  /apply-warehouse-20260806-1900-v1/u,
);

const verifyPrepared = prepare();
const applyPrepared = prepare({
  command: 'apply',
  expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
  expectedRuntimeContractSha256: OLD_RUNTIME_SHA256,
});
assert.equal(
  verifyPrepared.migration.checksum,
  TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_TARGET.checksum,
);
assert.match(
  captureError(() => prepare({ git: { branch: 'main', head: GIT_SHA, originMain: GIT_SHA, status: 'M drift' } })),
  /dirty worktree/u,
);

const verifyClient = new FakeClient();
const verified = await verifyTaobaoGoodsSchemaContractForwardCutover({
  client: verifyClient,
  prepared: verifyPrepared,
});
assert.equal(verified.status, 'ready_for_apply');
assert.equal(verified.ready, true);
assert.equal(verified.topology.metadataNormalizationReady, true);
assert.equal(verified.topology.runtimeContractSha256, OLD_RUNTIME_SHA256);
assert.equal(verified.policy.transactionIdAssigned, false);
assert.equal(verifyClient.queries.at(-1).sql, 'ROLLBACK');
assert.ok(verifyClient.queries.every(({ sql }) => !/^\s*(?:ALTER|CREATE|DELETE|INSERT|UPDATE)/iu.test(sql)));

const appliedClient = new FakeClient();
const applied = await applyTaobaoGoodsSchemaContractForwardCutover({
  client: appliedClient,
  prepared: applyPrepared,
});
assert.equal(applied.status, 'applied');
assert.equal(applied.policy.committed, true);
assert.equal(applied.policy.migrationBodyExecuted, true);
assert.equal(applied.policy.prerequisiteMigrationBodyExecuted, true);
assert.equal(applied.policy.businessRowsChanged, false);
assert.equal(appliedClient.queries.filter(({ sql }) => sql === prerequisiteMigrationSql).length, 1);
assert.equal(appliedClient.queries.filter(({ sql }) => sql === migrationSql).length, 1);
assert.equal(appliedClient.queries.filter(({ sql }) => sql === healthCheckSql).length, 1);
assert.equal(appliedClient.queries.at(-1).sql, 'COMMIT');
const lockQuery = appliedClient.queries.find(({ sql }) => (
  sql.includes('taobao_goods_schema_contract_forward_cutover:advisory_locks')
));
assert.equal(lockQuery.params[0].length, 3);

const noOpClient = new FakeClient({ state: 'healthy' });
const noOp = await applyTaobaoGoodsSchemaContractForwardCutover({
  client: noOpClient,
  prepared: prepare({
    command: 'apply',
    expectedDatabaseIdentitySha256: DATABASE_IDENTITY_SHA256,
    expectedRuntimeContractSha256: HEALTHY_RUNTIME_SHA256,
  }),
});
assert.equal(noOp.status, 'already_applied_healthy');
assert.equal(noOp.policy.migrationBodyExecuted, false);
assert.equal(noOp.policy.prerequisiteMigrationBodyExecuted, false);
assert.equal(noOp.policy.databaseWrites, false);

const rollbackClient = new FakeClient({ failOn: 'Taobao goods runtime schema contract checks passed' });
const rollbackError = await captureAsyncError(() => applyTaobaoGoodsSchemaContractForwardCutover({
  client: rollbackClient,
  prepared: applyPrepared,
}));
assert.ok(rollbackError instanceof Error);
assert.equal(rollbackError.cutoverStage, 'execute_health_check');
assert.equal(rollbackError.cutoverMigrationBodyExecuted, true);
assert.equal(rollbackClient.state, 'metadata');
assert.equal(rollbackClient.queries.at(-1).sql, 'ROLLBACK');

for (const [client, status] of [
  [new FakeClient({ ledgerExists: true }), 'blocked_ledger_present'],
  [new FakeClient({ state: 'partial' }), 'blocked_partial_or_drifted'],
  [new FakeClient({ state: 'prerequisite' }), 'blocked_prerequisite_drift'],
  [new FakeClient({ state: 'healthy' }), 'already_applied_healthy'],
]) {
  const result = await verifyTaobaoGoodsSchemaContractForwardCutover({
    client,
    prepared: verifyPrepared,
  });
  assert.equal(result.status, status);
}

const help = spawnSync(process.execPath, [
  'scripts/migrations/aios-taobao-goods-schema-contract-forward-cutover.mjs',
  '--help',
], { encoding: 'utf8' });
assert.equal(help.status, 0);
assert.match(help.stdout, /warehouse\/20260806_1900 plus its immutable/u);
assert.match(help.stdout, /warehouse\/20260806_1850 metadata prerequisite/u);

console.log(
  '[aios-taobao-goods-schema-contract-forward-cutover.behavior] OK: pins, read-only verify, runtime pin, serializable apply, sorted locks, rollback, topology states, and help contract passed.',
);
