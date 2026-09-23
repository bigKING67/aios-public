#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  formatQianchuanCardRatioStage2Result,
  parseQianchuanCardRatioStage2Args,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-stage2-cli.mjs';
import {
  assertQianchuanCardRatioStage2Authorization,
  assertQianchuanCardRatioStage2GitState,
  runQianchuanCardRatioStage2Batch,
  validateQianchuanCardRatioStage2Checkpoint,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-stage2.mjs';
import {
  STAGE2_DETAIL_BATCH_SQL,
  STAGE2_MAIN_BATCH_SQL,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-stage2-sql.mjs';
import {
  QIANCHUAN_CARD_RATIO_DETAIL_TABLE as DETAIL_TABLE,
  QIANCHUAN_CARD_RATIO_MAIN_TABLE as MAIN_TABLE,
} from '../../lib/migrations/aios-qianchuan-production-migration-card-ratio-stage2-source-growth.mjs';

const PLAN_SHA = 'a'.repeat(64);
const STAGE1_SHA = 'b'.repeat(64);
const TARGET_CHECKSUM = '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290';

function artifact(path, sha256, bytes = 1000) {
  return { bytes, path, sha256 };
}

function asLegacyCheckpoint(checkpoint, schemaVersion) {
  const legacy = structuredClone(checkpoint);
  legacy.schemaVersion = schemaVersion;
  for (const field of [
    'sourceRows',
    'sourceRowsByTable',
    'sourceGrowthRows',
    'sourceGrowthRowsByTable',
    'cumulativeSourceGrowthRows',
    'cumulativeSourceGrowthRowsByTable',
    'odsMismatchRows',
    'odsMismatchDelta',
    'cumulativeOdsMismatchDelta',
  ]) delete legacy[field];
  for (const boundary of [legacy.preflight, legacy.postcheck]) {
    delete boundary.sourceRowsByTable;
    delete boundary.sourceGrowthRows;
    delete boundary.sourceGrowthRowsByTable;
    delete boundary.odsMismatchDelta;
  }
  if (schemaVersion === 1) {
    delete legacy.externallyRepairedRows;
    delete legacy.externallyRepairedRowsByTable;
    delete legacy.cumulativeExternallyRepairedRows;
    delete legacy.cumulativeExternallyRepairedRowsByTable;
  }
  return legacy;
}

const readinessArtifact = artifact('/tmp/card-ratio-readiness.json', 'c'.repeat(64), 2000);
const planArtifact = artifact('/tmp/card-ratio-plan.json', PLAN_SHA, 3000);
const stage1Artifact = artifact('/tmp/card-ratio-stage1.json', STAGE1_SHA, 4000);

const plan = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T09:55:53.000Z',
  mode: 'offline_card_ratio_forward_repair_plan',
  target: {
    identity: 'warehouse/20260609_2045',
    checksum: TARGET_CHECKSUM,
    source: { bytes: 12662, path: 'fixture.sql', sha256: TARGET_CHECKSUM },
  },
  sourceArtifact: readinessArtifact,
  policy: {
    networkAccess: false,
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    repairExecutionAuthorized: false,
    backupCreated: false,
    ownerDecisionRecorded: false,
    deployAuthorized: false,
    arkInvoked: false,
    historicalMigrationReplayRecommended: false,
    newForwardMigrationRequired: true,
  },
  decision: {
    repairPlanReady: true,
    recommendedStrategy: 'forward_guard_then_canary_refresh_then_batched_backfill',
  },
  observed: {
    adsMismatchRows: 10,
    odsMismatchRows: 10,
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
    backup: { created: false, estimatedRows: 10 },
    canary: {
      date: '2026-02-22',
      mismatchRows: 5,
      mismatchRowsByTable: {
        [MAIN_TABLE]: 4,
        [DETAIL_TABLE]: 1,
      },
      outsideActiveRefreshWindow: true,
    },
    batching: {
      maxRowsPerTransaction: 500,
      skipLocked: false,
      tables: [
        { mismatchRows: 6, rows: 6, table: MAIN_TABLE },
        { mismatchRows: 4, rows: 4, table: DETAIL_TABLE },
      ],
    },
  },
  rollback: { guardRemovalFirst: true },
  authorizationBoundaries: {
    applicationDeployRequiresSeparateAuthorization: true,
    arkRequiresSeparateAuthorization: true,
  },
};

const stage1 = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T09:56:35.000Z',
  mode: 'live_write_card_ratio_stage1_canary',
  status: 'succeeded',
  target: { ...plan.target },
  sourceArtifacts: {
    plan: planArtifact,
    readinessProbe: readinessArtifact,
    migration: artifact('/repo/guard.sql', 'd'.repeat(64), 6682),
  },
  git: {
    branch: 'main',
    head: '1'.repeat(40),
    originMain: '1'.repeat(40),
    worktreeClean: true,
  },
  policy: {
    transaction: 'atomic repeatable-read backup + DDL guard + canary',
    productionWritesAuthorized: true,
    repairExecutionAuthorized: true,
    backupCreated: true,
    forwardGuardApplied: true,
    canaryCommitted: true,
    fullBackfillExecuted: false,
    ledgerWritten: false,
    deployAuthorized: false,
    arkInvoked: false,
  },
  backup: {
    runId: 'qcr-20260724T095617Z-deadbeef',
    table: 'etl.aios_goods_card_ratio_repair_backup',
    rows: 10,
    sourceProbeSha256: readinessArtifact.sha256,
  },
  guard: {
    functionsPresent: 2,
    enabledTriggersPresent: 2,
    migrationSha256: 'd'.repeat(64),
  },
  canary: { plannedMismatchRows: 5 },
  preflight: { adsMismatchRows: 10, odsMismatchRows: 10, waitingLocks: 0 },
  postcheck: { adsMismatchRows: 5, odsMismatchRows: 10, waitingLocks: 0 },
};

function parityRows({
  baseMetricMismatchRows = 0,
  extraTargetRows = 0,
  missingTargetRows = 0,
  sourceRowsByTable = { [MAIN_TABLE]: 6, [DETAIL_TABLE]: 4 },
  targetRowsByTable = sourceRowsByTable,
} = {}) {
  return [
    {
      base_metric_mismatch_rows: String(baseMetricMismatchRows),
      extra_target_rows: String(extraTargetRows),
      missing_target_rows: String(missingTargetRows),
      shape: 'main',
      source_rows: String(sourceRowsByTable[MAIN_TABLE]),
      target_rows: String(targetRowsByTable[MAIN_TABLE]),
    },
    {
      base_metric_mismatch_rows: String(baseMetricMismatchRows),
      extra_target_rows: String(extraTargetRows),
      missing_target_rows: String(missingTargetRows),
      shape: 'detail',
      source_rows: String(sourceRowsByTable[DETAIL_TABLE]),
      target_rows: String(targetRowsByTable[DETAIL_TABLE]),
    },
  ];
}

function probe(counts, {
  guards = 2,
  odsMismatchRows = 10,
  parity = parityRows(),
  waitingLocks = 0,
} = {}) {
  const total = counts[MAIN_TABLE] + counts[DETAIL_TABLE];
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-24T10:00:00.000Z',
    mode: 'live_readonly_card_ratio_repair_readiness_probe',
    target: { ...plan.target },
    policy: {
      transaction: 'BEGIN READ ONLY / ROLLBACK',
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      repairExecutionAuthorized: false,
      deployAuthorized: false,
      arkInvoked: false,
    },
    summary: {
      relationsPresent: 4,
      exactPrimaryKeys: 2,
      refreshRoutinesPresent: 3,
      recomputeFunctionsPresent: guards,
      ratioTriggersPresent: guards,
      adsMismatchRows: total,
      odsMismatchRows,
      waitingLocks,
    },
    impact: [
      { mismatch_rows: String(counts[MAIN_TABLE]), table_name: MAIN_TABLE },
      { mismatch_rows: String(counts[DETAIL_TABLE]), table_name: DETAIL_TABLE },
    ],
    parity,
  };
}

function guardRow() {
  return {
    functions_present: '2',
    enabled_triggers_present: '2',
    user_triggers_present: '2',
    main_function_definition: `CREATE OR REPLACE FUNCTION ads.fn_recompute_douyin_trade_sale_card_ratio_fields()
      RETURNS trigger AS $$ BEGIN NEW.card_click_to_pay_rate_count := 0; RETURN NEW; END $$ LANGUAGE plpgsql`,
    detail_function_definition: `CREATE OR REPLACE FUNCTION ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()
      RETURNS trigger AS $$ BEGIN NEW.card_click_to_pay_rate_user := 0; RETURN NEW; END $$ LANGUAGE plpgsql`,
    main_trigger_definition: `CREATE TRIGGER trg_recompute_douyin_trade_sale_card_ratio_fields
      BEFORE INSERT OR UPDATE ON ads.douyin_trade_sale_card
      FOR EACH ROW EXECUTE FUNCTION ads.fn_recompute_douyin_trade_sale_card_ratio_fields()`,
    detail_trigger_definition: `CREATE TRIGGER trg_recompute_douyin_trade_sale_card_detail_ratio_fields
      BEFORE INSERT OR UPDATE ON ads.douyin_trade_sale_card_detail
      FOR EACH ROW EXECUTE FUNCTION ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()`,
  };
}

function backupShape() {
  return {
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
  };
}

class FakeClient {
  constructor(counts, {
    conflict = null,
    conflicts = {},
    invalidBackup = false,
    invalidGuard = false,
    parity = parityRows(),
    transactionCountDrift = null,
    updateRows = 1,
  } = {}) {
    this.conflict = conflict;
    this.conflicts = conflicts;
    this.counts = { ...counts };
    this.invalidBackup = invalidBackup;
    this.invalidGuard = invalidGuard;
    this.mismatchReads = 0;
    this.parity = parity;
    this.queries = [];
    this.transactionCountDrift = transactionCountDrift;
    this.updateRows = updateRows;
  }

  async query(sql, params = []) {
    this.queries.push({ params, sql });
    if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ'
      || sql.startsWith('SET LOCAL')
      || sql.includes('pg_advisory_xact_lock')
      || sql.includes('aios_qianchuan_card_ratio_stage2:lock_')
      || sql === 'COMMIT'
      || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
    if (sql.includes('aios_qianchuan_card_ratio_stage2:guard_catalog')) {
      const row = guardRow();
      if (this.invalidGuard) row.enabled_triggers_present = '1';
      return { rows: [row] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage1:backup_shape')) {
      return { rows: [backupShape()] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage2:backup_run')) {
      return { rows: [
        { rows: this.invalidBackup ? '5' : '6', source_probe_mismatch_rows: '0', source_table: MAIN_TABLE },
        { rows: '4', source_probe_mismatch_rows: '0', source_table: DETAIL_TABLE },
      ] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage2:mismatch_counts')) {
      this.mismatchReads += 1;
      if (this.mismatchReads === 1 && this.transactionCountDrift) {
        this.counts = { ...this.transactionCountDrift };
      }
      return { rows: [
        { mismatch_rows: String(this.counts[MAIN_TABLE]), table_name: MAIN_TABLE },
        { mismatch_rows: String(this.counts[DETAIL_TABLE]), table_name: DETAIL_TABLE },
      ] };
    }
    if (sql.includes('aios_qianchuan_card_ratio:source_target_parity')) {
      return { rows: structuredClone(this.parity) };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage2:main_conflicts')
      || sql.includes('aios_qianchuan_card_ratio_stage2:detail_conflicts')) {
      const table = sql.includes('aios_qianchuan_card_ratio_stage2:main_conflicts')
        ? MAIN_TABLE
        : DETAIL_TABLE;
      const conflict = this.conflicts[table] ?? this.conflict;
      return { rows: [{
        cursor_gap_rows: conflict === 'cursor' ? '1' : '0',
        outside_backup_rows: conflict === 'backup' ? '1' : '0',
        version_conflict_rows: conflict === 'version' ? '1' : '0',
      }] };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage2:main_batch')) {
      const rows = Array.from({ length: this.updateRows }, (_, index) => ({
        cursor_1: '2026-03-01',
        cursor_2: `shop-${index + 1}`,
        cursor_3: 'shop-id',
        cursor_4: `product-${index + 1}`,
        formula_ok: true,
      }));
      this.counts[MAIN_TABLE] -= rows.length;
      return { rows };
    }
    if (sql.includes('aios_qianchuan_card_ratio_stage2:detail_batch')) {
      const rows = Array.from({ length: this.updateRows }, (_, index) => ({
        cursor_1: '2026-03-02',
        cursor_2: 'shop-id',
        cursor_3: `product-${index + 1}`,
        cursor_4: `source-${index + 1}`,
        formula_ok: true,
      }));
      this.counts[DETAIL_TABLE] -= rows.length;
      return { rows };
    }
    throw new Error(`Unexpected Stage 2 fixture SQL: ${String(sql).slice(0, 120)}`);
  }
}

const git = {
  branch: 'main',
  head: '2'.repeat(40),
  originMain: '2'.repeat(40),
  worktreeClean: true,
};

function probeRunner(client, {
  postcheckProbeOptions = null,
  probeOptions = {},
  stalePostcheck = false,
} = {}) {
  let reads = 0;
  return async () => {
    reads += 1;
    if (stalePostcheck && reads > 1) return probe({ [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 });
    return probe(client.counts, reads > 1 && postcheckProbeOptions
      ? postcheckProbeOptions
      : probeOptions);
  };
}

async function runBatch({
  batchSize,
  checkpoint = null,
  checkpointArtifact = null,
  client,
  postcheckProbeOptions = null,
  probeOptions = {},
  stalePostcheck = false,
}) {
  return runQianchuanCardRatioStage2Batch({
    batchSize,
    checkpoint,
    checkpointArtifact,
    checkpointSha256: checkpointArtifact?.sha256 ?? null,
    client,
    git,
    now: () => new Date('2026-07-24T10:00:00.000Z'),
    plan,
    planArtifact,
    planSha256: PLAN_SHA,
    readonlyInputs: {},
    runReadonlyProbe: probeRunner(client, { postcheckProbeOptions, probeOptions, stalePostcheck }),
    stage1,
    stage1Artifact,
    stage1Sha256: STAGE1_SHA,
  });
}

assert.equal(STAGE2_MAIN_BATCH_SQL.includes('SKIP LOCKED'), false);
assert.equal(STAGE2_DETAIL_BATCH_SQL.includes('SKIP LOCKED'), false);
assert.match(STAGE2_MAIN_BATCH_SQL, /LIMIT \$7[\s\S]+FOR UPDATE OF row_data/);
assert.match(STAGE2_DETAIL_BATCH_SQL, /LIMIT \$7[\s\S]+FOR UPDATE OF row_data/);

const parsed = parseQianchuanCardRatioStage2Args([
  '--plan', '/tmp/plan.json', '--plan-sha256', PLAN_SHA,
  '--stage1', '/tmp/stage1.json', '--stage1-sha256', STAGE1_SHA,
  '--checkpoint=/tmp/checkpoint.json', `--checkpoint-sha256=${'e'.repeat(64)}`,
  '--batch-size=37', '--output', '/tmp/output.json', '--confirm-stage2-batch',
]);
assert.equal(parsed.batchSize, 37);
assert.equal(parsed.confirmed, true);
assert.throws(() => parseQianchuanCardRatioStage2Args([
  '--plan', '/tmp/plan.json', '--plan-sha256', PLAN_SHA,
  '--stage1', '/tmp/stage1.json', '--stage1-sha256', STAGE1_SHA,
  '--batch-size', '501', '--output', '/tmp/output.json',
]), /1 to 500/);
assert.throws(() => parseQianchuanCardRatioStage2Args(['--unknown']), /Unknown/);

assert.equal(assertQianchuanCardRatioStage2Authorization({
  confirmed: true,
  env: {
    AIOS_QC_ALLOW_LIVE_WRITE: '1',
    AIOS_QC_CARD_RATIO_WRITE_ACK: 'stage2-batch',
    AIOS_QC_EXPECTED_GIT_SHA: '2'.repeat(40),
    DATABASE_URL: 'postgres://fixture',
  },
}).expectedGitSha, '2'.repeat(40));
assert.throws(() => assertQianchuanCardRatioStage2Authorization({ confirmed: false, env: {} }), /requires/);
assert.equal(assertQianchuanCardRatioStage2GitState({
  branch: 'main',
  expectedGitSha: '2'.repeat(40),
  head: '2'.repeat(40),
  originMain: '2'.repeat(40),
  status: '',
}), true);
assert.throws(() => assertQianchuanCardRatioStage2GitState({
  branch: 'main',
  expectedGitSha: '2'.repeat(40),
  head: '2'.repeat(40),
  originMain: '2'.repeat(40),
  status: ' M fixture',
}), /dirty/);

const firstClient = new FakeClient({ [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 }, { updateRows: 2 });
const first = await runBatch({ batchSize: 2, client: firstClient });
assert.equal(validateQianchuanCardRatioStage2Checkpoint(first), first);
assert.equal(first.schemaVersion, 3);
assert.equal(first.status, 'progress');
assert.equal(first.table, MAIN_TABLE);
assert.equal(first.nextTable, DETAIL_TABLE);
assert.equal(first.nextCursor, null);
assert.equal(first.updatedRows, 2);
assert.equal(first.externallyRepairedRows, 0);
assert.equal(first.cumulativeExternallyRepairedRows, 0);
assert.equal(first.cumulativeUpdatedRows, 2);
assert.equal(first.sourceRows, 10);
assert.equal(first.sourceGrowthRows, 0);
assert.equal(first.cumulativeSourceGrowthRows, 0);
assert.equal(first.odsMismatchRows, 10);
assert.equal(first.odsMismatchDelta, 0);
assert.equal(first.cumulativeOdsMismatchDelta, 0);
assert.equal(first.remainingTotalMismatchRows, 3);
assert.equal(first.policy.ledgerWritten, false);
assert.equal(first.policy.deployAuthorized, false);
assert.equal(first.policy.arkInvoked, false);
assert.equal(firstClient.queries.filter(({ sql }) => sql === 'COMMIT').length, 1);

const firstArtifact = artifact('/tmp/stage2-first.json', 'e'.repeat(64), 5000);
const legacyFirst = asLegacyCheckpoint(first, 1);
assert.equal(validateQianchuanCardRatioStage2Checkpoint(legacyFirst), legacyFirst);
const legacyContinuation = await runBatch({
  batchSize: 1,
  checkpoint: legacyFirst,
  checkpointArtifact: firstArtifact,
  client: new FakeClient({ [MAIN_TABLE]: 0, [DETAIL_TABLE]: 3 }, { updateRows: 1 }),
});
assert.equal(legacyContinuation.schemaVersion, 3);
assert.equal(legacyContinuation.cumulativeUpdatedRows, 3);
assert.equal(legacyContinuation.cumulativeExternallyRepairedRows, 0);

const schema2First = asLegacyCheckpoint(first, 2);
assert.equal(validateQianchuanCardRatioStage2Checkpoint(schema2First), schema2First);
const schema2Continuation = await runBatch({
  batchSize: 1,
  checkpoint: schema2First,
  checkpointArtifact: firstArtifact,
  client: new FakeClient({ [MAIN_TABLE]: 0, [DETAIL_TABLE]: 3 }, { updateRows: 1 }),
});
assert.equal(schema2Continuation.schemaVersion, 3);
assert.equal(schema2Continuation.cumulativeSourceGrowthRows, 0);

const secondClient = new FakeClient({ [MAIN_TABLE]: 0, [DETAIL_TABLE]: 3 }, { updateRows: 2 });
const second = await runBatch({
  batchSize: 2,
  checkpoint: first,
  checkpointArtifact: firstArtifact,
  client: secondClient,
});
assert.equal(second.status, 'progress');
assert.equal(second.table, DETAIL_TABLE);
assert.equal(second.nextTable, DETAIL_TABLE);
assert.deepEqual(second.nextCursor, ['2026-03-02', 'shop-id', 'product-2', 'source-2']);
assert.equal(second.remainingTotalMismatchRows, 1);

const secondArtifact = artifact('/tmp/stage2-second.json', 'f'.repeat(64), 6000);
const finalClient = new FakeClient({ [MAIN_TABLE]: 0, [DETAIL_TABLE]: 1 }, { updateRows: 1 });
const final = await runBatch({
  batchSize: 500,
  checkpoint: second,
  checkpointArtifact: secondArtifact,
  client: finalClient,
});
assert.equal(final.status, 'completed');
assert.equal(final.nextTable, null);
assert.equal(final.nextCursor, null);
assert.equal(final.remainingTotalMismatchRows, 0);
assert.equal(final.cumulativeUpdatedRows, 5);
assert.equal(final.cumulativeExternallyRepairedRows, 0);

const initialRebaseClient = new FakeClient(
  { [MAIN_TABLE]: 1, [DETAIL_TABLE]: 2 },
  { updateRows: 1 },
);
const initialRebase = await runBatch({ batchSize: 1, client: initialRebaseClient });
assert.equal(validateQianchuanCardRatioStage2Checkpoint(initialRebase), initialRebase);
assert.equal(initialRebase.table, MAIN_TABLE);
assert.equal(initialRebase.updatedRows, 1);
assert.equal(initialRebase.externallyRepairedRows, 2);
assert.deepEqual(initialRebase.externallyRepairedRowsByTable, {
  [MAIN_TABLE]: 1,
  [DETAIL_TABLE]: 1,
});
assert.equal(initialRebase.cumulativeUpdatedRows, 1);
assert.equal(initialRebase.cumulativeExternallyRepairedRows, 2);
assert.equal(initialRebase.remainingTotalMismatchRows, 2);
assert.match(
  formatQianchuanCardRatioStage2Result(initialRebase),
  /external_repaired_rows=2 cumulative_external_repaired_rows=2 cumulative_updated_rows=1/,
);
assert.equal(
  initialRebase.cumulativeUpdatedRows
    + initialRebase.cumulativeExternallyRepairedRows
    + initialRebase.remainingTotalMismatchRows,
  5,
);

const continuationRebaseClient = new FakeClient(
  { [MAIN_TABLE]: 0, [DETAIL_TABLE]: 2 },
  { updateRows: 1 },
);
const continuationRebase = await runBatch({
  batchSize: 1,
  checkpoint: first,
  checkpointArtifact: firstArtifact,
  client: continuationRebaseClient,
});
assert.equal(continuationRebase.table, DETAIL_TABLE);
assert.equal(continuationRebase.externallyRepairedRows, 1);
assert.deepEqual(continuationRebase.externallyRepairedRowsByTable, {
  [MAIN_TABLE]: 0,
  [DETAIL_TABLE]: 1,
});
assert.equal(continuationRebase.cumulativeUpdatedRows, 3);
assert.equal(continuationRebase.cumulativeExternallyRepairedRows, 1);
assert.equal(continuationRebase.remainingTotalMismatchRows, 1);

const grownSourceRows = { [MAIN_TABLE]: 7, [DETAIL_TABLE]: 5 };
const grownParity = parityRows({ sourceRowsByTable: grownSourceRows });
const sourceGrowth = await runBatch({
  batchSize: 1,
  client: new FakeClient(
    { [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 },
    { parity: grownParity, updateRows: 1 },
  ),
  probeOptions: { odsMismatchRows: 12, parity: grownParity },
});
assert.equal(validateQianchuanCardRatioStage2Checkpoint(sourceGrowth), sourceGrowth);
assert.equal(sourceGrowth.schemaVersion, 3);
assert.equal(sourceGrowth.sourceGrowthRows, 2);
assert.deepEqual(sourceGrowth.sourceGrowthRowsByTable, {
  [MAIN_TABLE]: 1,
  [DETAIL_TABLE]: 1,
});
assert.equal(sourceGrowth.cumulativeSourceGrowthRows, 2);
assert.equal(sourceGrowth.odsMismatchDelta, 2);
assert.equal(sourceGrowth.cumulativeOdsMismatchDelta, 2);
assert.equal(sourceGrowth.externallyRepairedRows, 0);
assert.equal(sourceGrowth.cumulativeUpdatedRows, 1);
assert.match(
  formatQianchuanCardRatioStage2Result(sourceGrowth),
  /source_growth_rows=2 cumulative_source_growth_rows=2 ods_mismatch_delta=2/,
);

const sourceGrowthArtifact = artifact('/tmp/stage2-source-growth.json', 'a'.repeat(64), 5000);
const stableSourceContinuation = await runBatch({
  batchSize: 1,
  checkpoint: sourceGrowth,
  checkpointArtifact: sourceGrowthArtifact,
  client: new FakeClient(
    { [MAIN_TABLE]: 1, [DETAIL_TABLE]: 3 },
    { parity: grownParity, updateRows: 1 },
  ),
  probeOptions: { odsMismatchRows: 12, parity: grownParity },
});
assert.equal(validateQianchuanCardRatioStage2Checkpoint(stableSourceContinuation), stableSourceContinuation);
assert.equal(stableSourceContinuation.sourceGrowthRows, 0);
assert.equal(stableSourceContinuation.cumulativeSourceGrowthRows, 2);
assert.equal(stableSourceContinuation.odsMismatchDelta, 0);
assert.equal(stableSourceContinuation.cumulativeOdsMismatchDelta, 2);
assert.equal(stableSourceContinuation.externallyRepairedRows, 0);
assert.equal(stableSourceContinuation.cumulativeExternallyRepairedRows, 0);
assert.equal(stableSourceContinuation.cumulativeUpdatedRows, 2);
assert.equal(stableSourceContinuation.remainingTotalMismatchRows, 3);

const stableSourceArtifact = artifact('/tmp/stage2-stable-source.json', 'b'.repeat(64), 5000);
const nextSourceRows = { [MAIN_TABLE]: 8, [DETAIL_TABLE]: 5 };
const nextSourceParity = parityRows({ sourceRowsByTable: nextSourceRows });
const repeatedSourceGrowth = await runBatch({
  batchSize: 1,
  checkpoint: stableSourceContinuation,
  checkpointArtifact: stableSourceArtifact,
  client: new FakeClient(
    { [MAIN_TABLE]: 0, [DETAIL_TABLE]: 3 },
    { parity: nextSourceParity, updateRows: 1 },
  ),
  probeOptions: { odsMismatchRows: 13, parity: nextSourceParity },
});
assert.equal(repeatedSourceGrowth.sourceGrowthRows, 1);
assert.equal(repeatedSourceGrowth.cumulativeSourceGrowthRows, 3);
assert.equal(repeatedSourceGrowth.odsMismatchDelta, 1);
assert.equal(repeatedSourceGrowth.cumulativeOdsMismatchDelta, 3);
assert.equal(repeatedSourceGrowth.externallyRepairedRows, 0);
assert.equal(repeatedSourceGrowth.cumulativeUpdatedRows, 3);
assert.equal(repeatedSourceGrowth.remainingTotalMismatchRows, 2);

const unexplainedOdsDecreaseClient = new FakeClient(
  { [MAIN_TABLE]: 1, [DETAIL_TABLE]: 3 },
  { parity: grownParity },
);
await assert.rejects(
  runBatch({
    batchSize: 1,
    checkpoint: sourceGrowth,
    checkpointArtifact: sourceGrowthArtifact,
    client: unexplainedOdsDecreaseClient,
    probeOptions: { odsMismatchRows: 11, parity: grownParity },
  }),
  /ODS mismatch drift is not explained by monotonic source growth/,
);
assert.equal(
  unexplainedOdsDecreaseClient.queries.some(({ sql }) => sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ'),
  false,
);

const laggedParity = parityRows({
  missingTargetRows: 1,
  sourceRowsByTable: { [MAIN_TABLE]: 7, [DETAIL_TABLE]: 4 },
  targetRowsByTable: { [MAIN_TABLE]: 6, [DETAIL_TABLE]: 4 },
});
const laggedClient = new FakeClient(
  { [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 },
  { parity: laggedParity },
);
await assert.rejects(
  runBatch({
    batchSize: 1,
    client: laggedClient,
    probeOptions: { odsMismatchRows: 11, parity: laggedParity },
  }),
  /ODS-to-ADS parity is not clean/,
);
assert.equal(
  laggedClient.queries.some(({ sql }) => sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ'),
  false,
);

const deletedSourceParity = parityRows({
  sourceRowsByTable: { [MAIN_TABLE]: 5, [DETAIL_TABLE]: 4 },
});
await assert.rejects(
  runBatch({
    batchSize: 1,
    client: new FakeClient({ [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 }),
    probeOptions: { odsMismatchRows: 10, parity: deletedSourceParity },
  }),
  /source row count decreased/,
);

const oneNewSourceRow = { [MAIN_TABLE]: 7, [DETAIL_TABLE]: 4 };
const oneNewSourceParity = parityRows({ sourceRowsByTable: oneNewSourceRow });
await assert.rejects(
  runBatch({
    batchSize: 1,
    client: new FakeClient({ [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 }),
    probeOptions: { odsMismatchRows: 12, parity: oneNewSourceParity },
  }),
  /ODS mismatch drift is not explained by monotonic source growth/,
);

const baseMetricDriftParity = parityRows({ baseMetricMismatchRows: 1 });
await assert.rejects(
  runBatch({
    batchSize: 1,
    client: new FakeClient({ [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 }),
    probeOptions: { parity: baseMetricDriftParity },
  }),
  /ODS-to-ADS parity is not clean/,
);

const transactionSourceDriftClient = new FakeClient(
  { [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 },
  { parity: oneNewSourceParity },
);
await assert.rejects(
  runBatch({ batchSize: 1, client: transactionSourceDriftClient }),
  /transaction precheck source row count changed/,
);
assert.equal(transactionSourceDriftClient.queries.at(-1).sql, 'ROLLBACK');

const postcheckSourceDriftClient = new FakeClient(
  { [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 },
  { updateRows: 1 },
);
await assert.rejects(
  runBatch({
    batchSize: 1,
    client: postcheckSourceDriftClient,
    postcheckProbeOptions: { odsMismatchRows: 11, parity: oneNewSourceParity },
  }),
  (error) => {
    assert.equal(error.stage2Committed, true);
    assert.match(error.message, /postcheck source row count changed/);
    return true;
  },
);
assert.equal(postcheckSourceDriftClient.queries.some(({ sql }) => sql === 'COMMIT'), true);

for (const increasedCounts of [
  { [MAIN_TABLE]: 3, [DETAIL_TABLE]: 3 },
  { [MAIN_TABLE]: 2, [DETAIL_TABLE]: 4 },
]) {
  const increasedClient = new FakeClient(increasedCounts);
  await assert.rejects(runBatch({ batchSize: 1, client: increasedClient }), /count increased/);
  assert.equal(
    increasedClient.queries.some(({ sql }) => sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ'),
    false,
  );
}

const unsafeNewTargetMismatchClient = new FakeClient(
  { [MAIN_TABLE]: 3, [DETAIL_TABLE]: 3 },
  { parity: oneNewSourceParity },
);
await assert.rejects(
  runBatch({
    batchSize: 1,
    client: unsafeNewTargetMismatchClient,
    probeOptions: { odsMismatchRows: 11, parity: oneNewSourceParity },
  }),
  /mismatch count increased/,
);

const transactionDriftClient = new FakeClient(
  { [MAIN_TABLE]: 1, [DETAIL_TABLE]: 2 },
  {
    transactionCountDrift: { [MAIN_TABLE]: 2, [DETAIL_TABLE]: 2 },
    updateRows: 1,
  },
);
await assert.rejects(
  runBatch({ batchSize: 1, client: transactionDriftClient }),
  /transaction precheck mismatch count changed/,
);
assert.equal(transactionDriftClient.queries.at(-1).sql, 'ROLLBACK');

const externallyCompletedClient = new FakeClient({ [MAIN_TABLE]: 0, [DETAIL_TABLE]: 0 });
await assert.rejects(
  runBatch({ batchSize: 1, client: externallyCompletedClient }),
  /no mismatch left for a real checkpoint batch/,
);
assert.equal(externallyCompletedClient.queries.at(-1).sql, 'ROLLBACK');

for (const [table, conflict] of [
  [DETAIL_TABLE, 'backup'],
  [DETAIL_TABLE, 'version'],
  [MAIN_TABLE, 'cursor'],
]) {
  const rebasedConflictClient = new FakeClient(
    { [MAIN_TABLE]: 1, [DETAIL_TABLE]: 2 },
    { conflicts: { [table]: conflict }, updateRows: 1 },
  );
  await assert.rejects(
    runBatch({ batchSize: 1, client: rebasedConflictClient }),
    /version drift, or mismatch/,
  );
  assert.equal(rebasedConflictClient.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(rebasedConflictClient.queries.some(({ sql }) => sql === 'COMMIT'), false);
}

const inconsistentCheckpoint = structuredClone(initialRebase);
inconsistentCheckpoint.cumulativeExternallyRepairedRowsByTable[MAIN_TABLE] += 1;
inconsistentCheckpoint.cumulativeExternallyRepairedRows += 1;
await assert.rejects(
  runBatch({
    batchSize: 1,
    checkpoint: inconsistentCheckpoint,
    checkpointArtifact: artifact('/tmp/stage2-inconsistent.json', '9'.repeat(64), 5000),
    client: new FakeClient({ [MAIN_TABLE]: 0, [DETAIL_TABLE]: 2 }),
  }),
  /checkpoint progress is inconsistent|cumulative progress is inconsistent/,
);

const inconsistentSourceCheckpoint = structuredClone(sourceGrowth);
inconsistentSourceCheckpoint.sourceRowsByTable[MAIN_TABLE] -= 1;
assert.throws(
  () => validateQianchuanCardRatioStage2Checkpoint(inconsistentSourceCheckpoint),
  /source-growth boundary is invalid/,
);

for (const conflict of ['backup', 'version', 'cursor']) {
  const conflictClient = new FakeClient(
    { [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 },
    { conflict, updateRows: 1 },
  );
  await assert.rejects(runBatch({ batchSize: 1, client: conflictClient }), /version drift, or mismatch/);
  assert.equal(conflictClient.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(conflictClient.queries.some(({ sql }) => sql === 'COMMIT'), false);
}

for (const client of [
  new FakeClient({ [MAIN_TABLE]: 1, [DETAIL_TABLE]: 2 }, { invalidGuard: true }),
  new FakeClient({ [MAIN_TABLE]: 1, [DETAIL_TABLE]: 2 }, { invalidBackup: true }),
]) {
  await assert.rejects(runBatch({ batchSize: 1, client }), /canonical enabled ratio guards|backup run/);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(client.queries.some(({ sql }) => sql === 'COMMIT'), false);
}

const committedClient = new FakeClient(
  { [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 },
  { updateRows: 1 },
);
await assert.rejects(
  runBatch({ batchSize: 1, client: committedClient, stalePostcheck: true }),
  (error) => {
    assert.equal(error.stage2Committed, true);
    assert.match(error.message, /postcheck mismatch count changed/);
    return true;
  },
);
assert.equal(committedClient.queries.some(({ sql }) => sql === 'COMMIT'), true);

await assert.rejects(
  runBatch({ batchSize: 501, client: new FakeClient({ [MAIN_TABLE]: 2, [DETAIL_TABLE]: 3 }) }),
  /1 to 500/,
);

await assert.rejects(
  runQianchuanCardRatioStage2Batch({
    batchSize: 1,
    checkpoint: first,
    checkpointArtifact: firstArtifact,
    checkpointSha256: '0'.repeat(64),
    client: new FakeClient({ [MAIN_TABLE]: 0, [DETAIL_TABLE]: 3 }),
    git,
    plan,
    planArtifact,
    planSha256: PLAN_SHA,
    readonlyInputs: {},
    runReadonlyProbe: async () => probe({ [MAIN_TABLE]: 0, [DETAIL_TABLE]: 3 }),
    stage1,
    stage1Artifact,
    stage1Sha256: STAGE1_SHA,
  }),
  /SHA-256 differs/,
);

console.log('[content-assets-qianchuan-production-migration-card-ratio-stage2.behavior] passed');
