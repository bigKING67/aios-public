#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  parseQianchuanCardRatioRepairPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-repair-plan-cli.mjs';
import {
  buildQianchuanCardRatioRepairPlan,
  validateQianchuanCardRatioRepairPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-repair-plan.mjs';

const TARGET_CHECKSUM = '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const mainDaily = [
  { date: '2025-11-01', mismatchRows: 2 },
  { date: '2026-02-22', mismatchRows: 3 },
  { date: '2026-07-22', mismatchRows: 31 },
];
const detailDaily = [
  { date: '2025-12-25', mismatchRows: 8 },
  { date: '2026-02-22', mismatchRows: 2 },
  { date: '2026-07-22', mismatchRows: 7 },
];

function impact(tableName, rows, mismatchRows, backupBytes, dailyMismatches) {
  return {
    daily_mismatches: dailyMismatches,
    estimated_backup_bytes: String(backupBytes),
    field_mismatches: { card_click_rate_user: mismatchRows },
    max_date: '2026-07-22',
    max_mismatch_date: '2026-07-22',
    min_date: '2025-11-01',
    min_mismatch_date: dailyMismatches[0].date,
    mismatch_dates: String(dailyMismatches.length),
    mismatch_rows: String(mismatchRows),
    rows: String(rows),
    table_name: tableName,
  };
}

const refreshRoutines = [
  'ads.refresh_douyin_trade_sale_card(date,date)',
  'ads.refresh_douyin_trade_sale_card_detail(date,date)',
  'ads.refresh_douyin_trade_sale_card_dashboard_incremental(integer,boolean)',
].map((signature, index) => ({
  definitionBytes: 100 + index,
  definitionSha256: String(index + 1).repeat(64),
  oid: String(index + 1),
  present: true,
  routine_kind: 'p',
  signature,
}));

const probe = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T08:49:00.222Z',
  mode: 'live_readonly_card_ratio_repair_readiness_probe',
  target: {
    checksum: TARGET_CHECKSUM,
    identity: 'warehouse/20260609_2045',
    source: {
      bytes: 12662,
      path: 'etl/groland_postgres/sql/migrations/20260609_2045__recompute_douyin_trade_sale_card_ratio_fields.sql',
      sha256: TARGET_CHECKSUM,
    },
  },
  policy: {
    arkInvoked: false,
    backupCreated: false,
    deployAuthorized: false,
    ledgerWritesAuthorized: false,
    networkAccess: true,
    ownerDecisionRecorded: false,
    productionWritesAuthorized: false,
    repairExecutionAuthorized: false,
    statementTimeoutMs: 15000,
    transaction: 'BEGIN READ ONLY / ROLLBACK',
  },
  summary: {
    adsMismatchRows: 9902,
    exactPrimaryKeys: 2,
    odsMismatchRows: 9902,
    ratioTriggersPresent: 0,
    recomputeFunctionsPresent: 0,
    refreshRoutinesPresent: 3,
    relationsPresent: 4,
    repairPlanReady: false,
    waitingLocks: 0,
  },
  catalog: {
    routines: [
      ...refreshRoutines,
      {
        definitionBytes: null,
        definitionSha256: null,
        oid: null,
        present: false,
        routine_kind: null,
        signature: 'ads.fn_recompute_douyin_trade_sale_card_ratio_fields()',
      },
      {
        definitionBytes: null,
        definitionSha256: null,
        oid: null,
        present: false,
        routine_kind: null,
        signature: 'ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()',
      },
    ],
    triggers: [],
  },
  impact: [
    impact('ads.douyin_trade_sale_card', 4577, 4576, 2715152, mainDaily),
    impact('ads.douyin_trade_sale_card_detail', 6173, 5326, 1163293, detailDaily),
    impact('ods.douyin_trade_sale_card_detail_raw', 6173, 5326, 1163293, detailDaily),
    impact('ods.douyin_trade_sale_card_raw', 4577, 4576, 2715152, mainDaily),
  ],
  parity: [
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
  ],
};
const probeContent = `${JSON.stringify(probe, null, 2)}\n`;
const probeArtifact = {
  bytes: Buffer.byteLength(probeContent),
  path: '/tmp/card-ratio-readiness.json',
  sha256: sha256(probeContent),
};

const plan = buildQianchuanCardRatioRepairPlan({
  now: () => new Date('2026-07-24T09:00:00.000Z'),
  probe,
  probeArtifact,
  probeSha256: probeArtifact.sha256,
});
assert.equal(validateQianchuanCardRatioRepairPlan(plan), plan);
assert.equal(plan.policy.productionWritesAuthorized, false);
assert.equal(plan.policy.historicalMigrationReplayRecommended, false);
assert.equal(plan.policy.newForwardMigrationRequired, true);
assert.equal(plan.decision.repairPlanReady, true);
assert.deepEqual(plan.observed.activeRefreshWindow, {
  end: '2026-07-22',
  start: '2026-07-09',
});
assert.equal(plan.execution.canary.date, '2026-02-22');
assert.equal(plan.execution.canary.mismatchRows, 5);
assert.deepEqual(plan.execution.canary.mismatchRowsByTable, {
  'ads.douyin_trade_sale_card': 3,
  'ads.douyin_trade_sale_card_detail': 2,
});
assert.equal(plan.execution.backup.estimatedRows, 9902);
assert.equal(plan.execution.backup.rawPayloadBytes, 3878445);
assert.equal(plan.execution.backup.created, false);
assert.equal(plan.execution.batching.maxRowsPerTransaction, 500);
assert.equal(plan.execution.batching.expectedBatches, 21);
assert.equal(plan.execution.batching.skipLocked, false);
assert.deepEqual(plan.execution.batching.tables[0].cursor, [
  'date',
  'shop_name',
  'shop_id',
  'product_id',
]);
assert.equal(plan.execution.forwardGuard.fullTableDmlAllowed, false);
assert.equal(plan.rollback.guardRemovalFirst, true);
assert.equal(plan.authorizationBoundaries.applicationDeployRequiresSeparateAuthorization, true);
assert.equal(plan.authorizationBoundaries.arkRequiresSeparateAuthorization, true);

await assert.rejects(
  async () => buildQianchuanCardRatioRepairPlan({
    probe,
    probeArtifact,
    probeSha256: '0'.repeat(64),
  }),
  /Card-ratio readiness probe SHA-256 differs/,
);

const unsafeParityProbe = structuredClone(probe);
unsafeParityProbe.parity[0].base_metric_mismatch_rows = '1';
assert.throws(
  () => buildQianchuanCardRatioRepairPlan({
    probe: unsafeParityProbe,
    probeArtifact,
    probeSha256: probeArtifact.sha256,
  }),
  /detail ODS-to-ADS base-metric parity is not clean enough/,
);

assert.deepEqual(
  parseQianchuanCardRatioRepairPlanArgs([
    '--probe', '/tmp/card-ratio-readiness.json',
    `--probe-sha256=${'a'.repeat(64)}`,
    '--output', '/tmp/card-ratio-plan.json',
    '--json',
  ]),
  {
    help: false,
    json: true,
    outputPath: '/tmp/card-ratio-plan.json',
    probePath: '/tmp/card-ratio-readiness.json',
    probeSha256: 'a'.repeat(64),
  },
);
for (const option of [
  '--apply',
  '--backfill',
  '--baseline',
  '--create-backup',
  '--deploy',
  '--execute',
  '--repair',
  '--write-ledger',
]) {
  assert.throws(
    () => parseQianchuanCardRatioRepairPlanArgs([option]),
    /Unknown qianchuan card-ratio repair-plan option/,
  );
}

console.log('[qianchuan-card-ratio-repair-plan-behavior] OK: forward-only guard, shared canary, 500-row batches, exact backup, rollback ordering, artifact pins, parity gate, and authorization separation passed.');
