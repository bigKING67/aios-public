#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  parseQianchuanCardRatioReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-readonly-probe-cli.mjs';
import {
  runQianchuanCardRatioReadonlyProbe,
  validateQianchuanCardRatioReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-readonly-probe.mjs';

const TARGET_CHECKSUM = '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function artifact(path, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return {
    bytes: Buffer.byteLength(content),
    path,
    sha256: sha256(content),
  };
}

const p1Packet = {
  mode: 'offline_readonly_reviewed_p1_overlay',
  policy: {
    ledgerWritesAuthorized: false,
    productionWritesAuthorized: false,
  },
  summary: { byWave: { P1D: 5 } },
  entries: [{
    authoritativeClassification: 'unknown',
    checksum: TARGET_CHECKSUM,
    effects: { unsatisfied: 4 },
    namespace: 'warehouse',
    review: { decision: null },
    reviewWaveLabel: 'P1D',
    source: {
      bytes: 12662,
      path: 'etl/groland_postgres/sql/migrations/20260609_2045__recompute_douyin_trade_sale_card_ratio_fields.sql',
      sha256: TARGET_CHECKSUM,
    },
    version: '20260609_2045',
  }],
};
const p1Artifact = artifact('/tmp/reviewed-p1.json', p1Packet);

const p1dProbe = {
  schemaVersion: 1,
  mode: 'live_readonly_p1d_catalog_data_shape_probe',
  policy: {
    arkInvoked: false,
    deployAuthorized: false,
    ledgerWritesAuthorized: false,
    ownerDecisionRecorded: false,
    productionWritesAuthorized: false,
    transaction: 'BEGIN READ ONLY / ROLLBACK',
  },
  summary: {
    entries: 8,
    families: 1,
    ownerDecisionReady: false,
  },
  entryEvidence: [{
    decision: null,
    entries: ['warehouse/20260609_2045'],
    evidenceState: 'missing_runtime_contract_with_data_drift',
    family: 'card_ratio_enforcement',
    reviewer: null,
  }],
  dataShapes: {
    cardRatio: {
      card: { mismatchRows: '4576', rows: '4577', shape: 'card' },
      cardDetail: { mismatchRows: '5326', rows: '6173', shape: 'card_detail' },
    },
  },
};
const p1dProbeArtifact = artifact('/tmp/p1d-probe.json', p1dProbe);

const tableRows = [
  'ads.douyin_trade_sale_card',
  'ads.douyin_trade_sale_card_detail',
  'ods.douyin_trade_sale_card_raw',
  'ods.douyin_trade_sale_card_detail_raw',
].map((qualifiedName, index) => ({
  estimated_dead_rows: '0',
  estimated_live_rows: String(index + 10),
  granted_locks: index === 0 ? '1' : '0',
  heap_bytes: '8192',
  index_bytes: index < 2 ? '8192' : '0',
  last_analyze: '2026-07-24T00:00:00.000Z',
  last_autoanalyze: null,
  last_autovacuum: null,
  last_vacuum: null,
  oid: String(index + 1),
  qualified_name: qualifiedName,
  relation_kind: 'r',
  total_bytes: '16384',
  waiting_locks: '0',
}));

const impactRows = [
  {
    daily_mismatches: [{ date: '2026-06-01', mismatchRows: 4576 }],
    distinct_products: '80',
    distinct_shops: '2',
    estimated_backup_bytes: '640000',
    field_mismatches: { card_click_rate_user: 4576 },
    max_date: '2026-07-23',
    max_mismatch_date: '2026-07-23',
    min_date: '2026-01-01',
    min_mismatch_date: '2026-01-01',
    mismatch_dates: '204',
    mismatch_rows: '4576',
    rows: '4577',
    table_name: 'ads.douyin_trade_sale_card',
  },
  {
    daily_mismatches: [{ date: '2026-06-01', mismatchRows: 5326 }],
    distinct_products: '90',
    distinct_shops: '2',
    estimated_backup_bytes: '480000',
    field_mismatches: { card_click_rate_user: 5326 },
    max_date: '2026-07-23',
    max_mismatch_date: '2026-07-23',
    min_date: '2026-01-01',
    min_mismatch_date: '2026-01-01',
    mismatch_dates: '204',
    mismatch_rows: '5326',
    rows: '6173',
    table_name: 'ads.douyin_trade_sale_card_detail',
  },
  {
    daily_mismatches: [{ date: '2026-06-01', mismatchRows: 4576 }],
    distinct_products: '80',
    distinct_shops: '2',
    estimated_backup_bytes: '640000',
    field_mismatches: { card_click_rate_user: 4576 },
    max_date: '2026-07-23',
    max_mismatch_date: '2026-07-23',
    min_date: '2026-01-01',
    min_mismatch_date: '2026-01-01',
    mismatch_dates: '204',
    mismatch_rows: '4576',
    rows: '4577',
    table_name: 'ods.douyin_trade_sale_card_raw',
  },
  {
    daily_mismatches: [{ date: '2026-06-01', mismatchRows: 5326 }],
    distinct_products: '90',
    distinct_shops: '2',
    estimated_backup_bytes: '480000',
    field_mismatches: { card_click_rate_user: 5326 },
    max_date: '2026-07-23',
    max_mismatch_date: '2026-07-23',
    min_date: '2026-01-01',
    min_mismatch_date: '2026-01-01',
    mismatch_dates: '204',
    mismatch_rows: '5326',
    rows: '6173',
    table_name: 'ods.douyin_trade_sale_card_detail_raw',
  },
];

class FakeClient {
  constructor({ failOn = null } = {}) {
    this.failOn = failOn;
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ params, sql });
    if (this.failOn && sql.includes(this.failOn)) throw new Error('fixture query failure');
    if (sql === 'BEGIN READ ONLY' || sql.startsWith('SET LOCAL') || sql === 'ROLLBACK') {
      return { rows: [] };
    }
    if (sql.includes('aios_qianchuan_card_ratio:table_stats')) return { rows: tableRows };
    if (sql.includes('aios_qianchuan_card_ratio:primary_keys')) {
      return { rows: [
        {
          constraint_name: 'douyin_trade_sale_card_pkey',
          definition: 'PRIMARY KEY (shop_name, shop_id, "date", product_id)',
          table_name: 'ads.douyin_trade_sale_card',
        },
        {
          constraint_name: 'douyin_trade_sale_card_detail_pkey',
          definition: 'PRIMARY KEY (shop_id, stat_date, product_id, source_level1)',
          table_name: 'ads.douyin_trade_sale_card_detail',
        },
      ] };
    }
    if (sql.includes('aios_qianchuan_card_ratio:indexes')) {
      return { rows: [
        {
          definition: 'CREATE UNIQUE INDEX douyin_trade_sale_card_pkey ON ads.douyin_trade_sale_card USING btree (shop_name, shop_id, date, product_id)',
          index_bytes: '8192',
          index_name: 'ads.douyin_trade_sale_card_pkey',
          is_primary: true,
          is_unique: true,
          table_name: 'ads.douyin_trade_sale_card',
        },
      ] };
    }
    if (sql.includes('aios_qianchuan_card_ratio:routines')) {
      return { rows: params[0].map((signature, index) => ({
        definition: index < 3 ? `CREATE PROCEDURE ${signature}` : null,
        oid: index < 3 ? String(index + 20) : null,
        routine_kind: index < 3 ? 'p' : null,
        signature,
      })) };
    }
    if (sql.includes('aios_qianchuan_card_ratio:triggers')) return { rows: [] };
    if (sql.includes('aios_qianchuan_card_ratio:impact')) return { rows: impactRows };
    if (sql.includes('aios_qianchuan_card_ratio:source_target_parity')) {
      return { rows: [
        {
          base_metric_mismatch_rows: '0',
          extra_target_rows: '0',
          missing_target_rows: '0',
          shape: 'detail',
          source_rows: '6173',
          target_rows: '6173',
        },
        {
          base_metric_mismatch_rows: '0',
          extra_target_rows: '0',
          missing_target_rows: '0',
          shape: 'main',
          source_rows: '4577',
          target_rows: '4577',
        },
      ] };
    }
    throw new Error(`Unexpected fixture SQL: ${sql.slice(0, 100)}`);
  }
}

function assertReadOnlyQueries(client) {
  const forbidden = /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|PERFORM|COMMIT|pg_advisory_lock|baseline|apply|Ark)\b/i;
  for (const { sql } of client.queries) {
    const allowed = sql === 'BEGIN READ ONLY'
      || sql === 'ROLLBACK'
      || /^SET LOCAL statement_timeout = '\d+ms'$/.test(sql)
      || /^\/\*[\s\S]*?\*\/\s*(?:SELECT|WITH)\b/i.test(sql);
    assert.equal(allowed, true, `unexpected SQL outside the read-only allowlist: ${sql}`);
    if (sql !== 'BEGIN READ ONLY' && sql !== 'ROLLBACK') {
      assert.equal(forbidden.test(sql), false, `write-like SQL token found: ${sql}`);
    }
  }
}

const client = new FakeClient();
const result = await runQianchuanCardRatioReadonlyProbe({
  client,
  now: () => new Date('2026-07-24T08:30:00.000Z'),
  p1Artifact,
  p1Packet,
  p1Sha256: p1Artifact.sha256,
  p1dProbe,
  p1dProbeArtifact,
  p1dProbeSha256: p1dProbeArtifact.sha256,
});
assert.equal(validateQianchuanCardRatioReadonlyProbe(result), result);
assert.equal(result.summary.relationsPresent, 4);
assert.equal(result.summary.exactPrimaryKeys, 2);
assert.equal(result.summary.refreshRoutinesPresent, 3);
assert.equal(result.summary.recomputeFunctionsPresent, 0);
assert.equal(result.summary.ratioTriggersPresent, 0);
assert.equal(result.summary.adsMismatchRows, 9902);
assert.equal(result.summary.odsMismatchRows, 9902);
assert.equal(result.summary.waitingLocks, 0);
assert.equal(result.catalog.routines.filter((routine) => routine.present).length, 3);
assert.deepEqual(result.parity.map((row) => row.shape), ['detail', 'main']);
assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(client);

const badPinClient = new FakeClient();
await assert.rejects(
  runQianchuanCardRatioReadonlyProbe({
    client: badPinClient,
    p1Artifact,
    p1Packet,
    p1Sha256: '0'.repeat(64),
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256: p1dProbeArtifact.sha256,
  }),
  /Reviewed P1 overlay SHA-256 differs/,
);
assert.equal(badPinClient.queries.length, 0);

const failingClient = new FakeClient({ failOn: 'aios_qianchuan_card_ratio:impact' });
await assert.rejects(
  runQianchuanCardRatioReadonlyProbe({
    client: failingClient,
    p1Artifact,
    p1Packet,
    p1Sha256: p1Artifact.sha256,
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256: p1dProbeArtifact.sha256,
  }),
  /fixture query failure/,
);
assert.equal(failingClient.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(failingClient);

assert.deepEqual(
  parseQianchuanCardRatioReadonlyProbeArgs([
    '--p1', '/tmp/reviewed-p1.json',
    `--p1-sha256=${'a'.repeat(64)}`,
    '--p1d-probe', '/tmp/p1d-probe.json',
    `--p1d-probe-sha256=${'b'.repeat(64)}`,
    '--output', '/tmp/card-ratio-probe.json',
    '--json',
  ]),
  {
    help: false,
    json: true,
    outputPath: '/tmp/card-ratio-probe.json',
    p1Path: '/tmp/reviewed-p1.json',
    p1Sha256: 'a'.repeat(64),
    p1dProbePath: '/tmp/p1d-probe.json',
    p1dProbeSha256: 'b'.repeat(64),
  },
);
for (const option of [
  '--apply',
  '--backfill',
  '--baseline',
  '--create-backup',
  '--deploy',
  '--repair',
  '--write-ledger',
]) {
  assert.throws(
    () => parseQianchuanCardRatioReadonlyProbeArgs([option]),
    /Unknown qianchuan card-ratio read-only probe option/,
  );
}

console.log('[qianchuan-card-ratio-readonly-probe-behavior] OK: exact unresolved boundary, quoted primary key normalization, ODS/ADS drift, parity, rollback, SHA pinning, and write denial passed.');
