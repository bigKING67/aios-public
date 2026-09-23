#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseQianchuanCardRatioStage1Args,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-stage1-cli.mjs';
import {
  assertQianchuanCardRatioStage1Authorization,
  assertQianchuanCardRatioStage1GitState,
  QIANCHUAN_CARD_RATIO_STAGE1_MIGRATION,
  runQianchuanCardRatioStage1,
  validateQianchuanCardRatioStage1MigrationSql,
  validateQianchuanCardRatioStage1Result,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-stage1.mjs';

const TARGET_CHECKSUM = '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290';
const PROBE_SHA = 'a'.repeat(64);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const plan = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T08:55:30.000Z',
  mode: 'offline_card_ratio_forward_repair_plan',
  target: {
    checksum: TARGET_CHECKSUM,
    identity: 'warehouse/20260609_2045',
    source: { bytes: 12662, path: 'fixture.sql', sha256: TARGET_CHECKSUM },
  },
  sourceArtifact: {
    bytes: 102644,
    path: '/tmp/card-ratio-readiness.json',
    sha256: PROBE_SHA,
  },
  policy: {
    arkInvoked: false,
    backupCreated: false,
    deployAuthorized: false,
    historicalMigrationReplayRecommended: false,
    ledgerWritesAuthorized: false,
    networkAccess: false,
    newForwardMigrationRequired: true,
    ownerDecisionRecorded: false,
    productionWritesAuthorized: false,
    repairExecutionAuthorized: false,
  },
  decision: {
    recommendedStrategy: 'forward_guard_then_canary_refresh_then_batched_backfill',
    repairPlanReady: true,
  },
  observed: {
    adsMismatchRows: 9902,
    odsMismatchRows: 9902,
  },
  execution: {
    phaseOrder: [
      'preflight',
      'backup',
      'forward_guard',
      'canary_refresh',
      'batched_backfill',
      'postcondition',
    ],
    backup: { created: false, estimatedRows: 9902 },
    canary: {
      date: '2026-02-22',
      mismatchRows: 5,
      mismatchRowsByTable: {
        'ads.douyin_trade_sale_card': 4,
        'ads.douyin_trade_sale_card_detail': 1,
      },
      outsideActiveRefreshWindow: true,
    },
    batching: {
      maxRowsPerTransaction: 500,
      skipLocked: false,
      tables: [
        { mismatchRows: 4576, table: 'ads.douyin_trade_sale_card' },
        { mismatchRows: 5326, table: 'ads.douyin_trade_sale_card_detail' },
      ],
    },
  },
  rollback: { guardRemovalFirst: true },
  authorizationBoundaries: {
    applicationDeployRequiresSeparateAuthorization: true,
    arkRequiresSeparateAuthorization: true,
  },
};
const planContent = `${JSON.stringify(plan, null, 2)}\n`;
const planArtifact = {
  bytes: Buffer.byteLength(planContent),
  path: '/tmp/card-ratio-repair-plan.json',
  sha256: sha256(planContent),
};

function parityRows() {
  return [
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
  ];
}

function probe({ post = false } = {}) {
  return {
    generatedAt: post ? '2026-07-24T09:02:00.000Z' : '2026-07-24T09:00:00.000Z',
    summary: {
      adsMismatchRows: post ? 9897 : 9902,
      exactPrimaryKeys: 2,
      odsMismatchRows: 9902,
      ratioTriggersPresent: post ? 2 : 0,
      recomputeFunctionsPresent: post ? 2 : 0,
      refreshRoutinesPresent: 3,
      relationsPresent: 4,
      waitingLocks: 0,
    },
    impact: [
      {
        daily_mismatches: post ? [] : [{ date: '2026-02-22', mismatchRows: 4 }],
        mismatch_rows: post ? '4572' : '4576',
        table_name: 'ads.douyin_trade_sale_card',
      },
      {
        daily_mismatches: post ? [] : [{ date: '2026-02-22', mismatchRows: 1 }],
        mismatch_rows: post ? '5325' : '5326',
        table_name: 'ads.douyin_trade_sale_card_detail',
      },
    ],
    parity: parityRows(),
  };
}

function canaryRows({ after = false, invalid = false } = {}) {
  return [
    {
      base_metric_mismatch_rows: '0',
      extra_target_rows: '0',
      formula_mismatch_rows: after ? (invalid ? '1' : '0') : '4',
      missing_target_rows: '0',
      source_rows: '11',
      table_name: 'ads.douyin_trade_sale_card',
      target_rows: '11',
    },
    {
      base_metric_mismatch_rows: '0',
      extra_target_rows: '0',
      formula_mismatch_rows: after ? '0' : '1',
      missing_target_rows: '0',
      source_rows: '13',
      table_name: 'ads.douyin_trade_sale_card_detail',
      target_rows: '13',
    },
  ];
}

class FakeClient {
  constructor({ invalidPostCanary = false } = {}) {
    this.guardReads = 0;
    this.invalidPostCanary = invalidPostCanary;
    this.queries = [];
    this.snapshotReads = 0;
  }

  async query(sql, params = []) {
    this.queries.push({ params, sql });
    if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ'
      || sql.startsWith('SET LOCAL')
      || sql.includes('pg_advisory_xact_lock')
      || sql === 'COMMIT'
      || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
    if (sql.includes('aios_qianchuan_card_ratio_stage1:guard_catalog')) {
      this.guardReads += 1;
      const count = this.guardReads === 1 ? '0' : '2';
      return { rows: [{ enabled_triggers_present: count, functions_present: count }] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage1:backup_table')) {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage1:backup_shape')) {
      return { rows: [{
        column_count: '8',
        column_types: {
          backup_run_id: 'text',
          source_table: 'text',
          row_key: 'jsonb',
          ratio_values: 'jsonb',
          source_xmin: 'text',
          source_updated_at: 'timestamp',
          backed_up_at: 'timestamptz',
          source_probe_sha256: 'text',
        },
        primary_key: 'PRIMARY KEY (backup_run_id, source_table, row_key)',
      }] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage1:existing_backup_run')) {
      return { rows: [{ rows: '0' }] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage1:backup_main')) {
      return { rowCount: 4576, rows: [] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage1:backup_detail')) {
      return { rowCount: 5326, rows: [] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage1:backup_counts')) {
      return { rows: [
        { rows: '4576', source_table: 'ads.douyin_trade_sale_card' },
        { rows: '5326', source_table: 'ads.douyin_trade_sale_card_detail' },
      ] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage1:canary_snapshot')) {
      this.snapshotReads += 1;
      return { rows: canaryRows({
        after: this.snapshotReads > 1,
        invalid: this.invalidPostCanary && this.snapshotReads > 1,
      }) };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage1:refresh_main')
      || sql.includes('aios_qianchuan_card_ratio_stage1:refresh_detail')) {
      assert.deepEqual(params, ['2026-02-22']);
      return { rowCount: null, rows: [] };
    }
    if (sql.includes('CREATE OR REPLACE FUNCTION ads.fn_recompute_douyin_trade_sale_card_ratio_fields')) {
      return { rowCount: null, rows: [] };
    }
    throw new Error(`Unexpected Stage 1 fixture SQL: ${sql.slice(0, 120)}`);
  }
}

const migrationPath = path.resolve(QIANCHUAN_CARD_RATIO_STAGE1_MIGRATION.relativePath);
const migrationSql = readFileSync(migrationPath, 'utf8');
const migrationSource = validateQianchuanCardRatioStage1MigrationSql(migrationSql);
const migrationArtifact = {
  bytes: migrationSource.bytes,
  path: migrationPath,
  sha256: migrationSource.sha256,
};

let probeReads = 0;
const client = new FakeClient();
const events = [];
const result = await runQianchuanCardRatioStage1({
  backupRunId: 'qcr-20260724T090000Z-deadbeef',
  client,
  git: {
    branch: 'main',
    head: '1'.repeat(40),
    originMain: '1'.repeat(40),
    worktreeClean: true,
  },
  migrationArtifact,
  migrationSha256: migrationArtifact.sha256,
  migrationSql,
  now: () => new Date('2026-07-24T09:00:00.000Z'),
  onEvent: (event) => events.push(event),
  plan,
  planArtifact,
  planSha256: planArtifact.sha256,
  readonlyInputs: {},
  runReadonlyProbe: async () => {
    probeReads += 1;
    return probe({ post: probeReads > 1 });
  },
});
assert.equal(validateQianchuanCardRatioStage1Result(result), result);
assert.equal(result.backup.rows, 9902);
assert.equal(result.policy.ledgerWritten, false);
assert.equal(result.policy.fullBackfillExecuted, false);
assert.equal(result.canary.after.every((row) => row.formulaMismatchRows === 0), true);
assert.deepEqual(events.map((event) => event.stage), [
  'preflight_passed',
  'backup_verified_in_transaction',
  'forward_guard_verified_in_transaction',
  'atomic_stage1_committed',
  'postcheck_passed',
]);
assert.equal(client.queries.some(({ sql }) => /^\s*UPDATE\s+/i.test(sql)), false);
assert.equal(client.queries.filter(({ sql }) => sql === 'COMMIT').length, 1);

const rollbackClient = new FakeClient({ invalidPostCanary: true });
await assert.rejects(
  runQianchuanCardRatioStage1({
    backupRunId: 'qcr-20260724T090100Z-cafebabe',
    client: rollbackClient,
    git: {},
    migrationArtifact,
    migrationSha256: migrationArtifact.sha256,
    migrationSql,
    plan,
    planArtifact,
    planSha256: planArtifact.sha256,
    readonlyInputs: {},
    runReadonlyProbe: async () => probe(),
  }),
  /Stage 1 post-canary snapshot failed/,
);
assert.equal(rollbackClient.queries.at(-1).sql, 'ROLLBACK');
assert.equal(rollbackClient.queries.some(({ sql }) => sql === 'COMMIT'), false);

const committedPostcheckClient = new FakeClient();
await assert.rejects(
  runQianchuanCardRatioStage1({
    backupRunId: 'qcr-20260724T090200Z-1234abcd',
    client: committedPostcheckClient,
    git: {},
    migrationArtifact,
    migrationSha256: migrationArtifact.sha256,
    migrationSql,
    plan,
    planArtifact,
    planSha256: planArtifact.sha256,
    readonlyInputs: {},
    runReadonlyProbe: async () => probe(),
  }),
  (error) => {
    assert.match(error.message, /Stage 1 postcheck topology or lock state is incomplete/);
    assert.equal(error.stage1Committed, true);
    return true;
  },
);
assert.equal(committedPostcheckClient.queries.filter(({ sql }) => sql === 'COMMIT').length, 1);
assert.equal(committedPostcheckClient.queries.some(({ sql }) => sql === 'ROLLBACK'), false);

assert.equal(assertQianchuanCardRatioStage1GitState({
  branch: 'main',
  expectedGitSha: '1'.repeat(40),
  head: '1'.repeat(40),
  originMain: '1'.repeat(40),
  status: '',
}), true);
assert.throws(
  () => assertQianchuanCardRatioStage1GitState({
    branch: 'main',
    expectedGitSha: '1'.repeat(40),
    head: '1'.repeat(40),
    originMain: '1'.repeat(40),
    status: ' M package.json',
  }),
  /refuses a dirty Git worktree/,
);
assert.deepEqual(
  assertQianchuanCardRatioStage1Authorization({
    confirmed: true,
    env: {
      AIOS_QC_ALLOW_LIVE_WRITE: '1',
      AIOS_QC_CARD_RATIO_WRITE_ACK: 'stage1',
      AIOS_QC_EXPECTED_GIT_SHA: '1'.repeat(40),
      DATABASE_URL: 'postgres://fixture',
    },
  }),
  {
    connectionString: 'postgres://fixture',
    expectedGitSha: '1'.repeat(40),
  },
);
assert.throws(
  () => assertQianchuanCardRatioStage1Authorization({
    confirmed: false,
    env: {
      AIOS_QC_ALLOW_LIVE_WRITE: '1',
      AIOS_QC_CARD_RATIO_WRITE_ACK: 'stage1',
      DATABASE_URL: 'postgres://fixture',
    },
  }),
  /requires --confirm-stage1/,
);

assert.deepEqual(
  parseQianchuanCardRatioStage1Args([
    '--plan', '/tmp/plan.json',
    `--plan-sha256=${'a'.repeat(64)}`,
    '--migration-sha256', 'b'.repeat(64),
    '--backup-run-id', 'qcr-20260724T090000Z-deadbeef',
    '--output', '/tmp/stage1.json',
    '--confirm-stage1',
  ]),
  {
    backupRunId: 'qcr-20260724T090000Z-deadbeef',
    confirmed: true,
    help: false,
    migrationSha256: 'b'.repeat(64),
    outputPath: '/tmp/stage1.json',
    planPath: '/tmp/plan.json',
    planSha256: 'a'.repeat(64),
  },
);
for (const option of ['--deploy', '--full-backfill', '--ark', '--write-ledger']) {
  assert.throws(
    () => parseQianchuanCardRatioStage1Args([option]),
    /Unknown qianchuan card-ratio Stage 1 option/,
  );
}

console.log('[qianchuan-card-ratio-stage1-behavior] OK: clean pushed Git gate, dual write acknowledgement, pinned DDL-only migration, atomic backup+guard+canary, rollback before commit, truthful committed-postcheck failure evidence, and no ledger/full-backfill/deploy/Ark passed.');
