import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { runQianchuanCardRatioReadonlyProbe } from './aios-qianchuan-production-migration-card-ratio-readonly-probe.mjs';
import { validateQianchuanCardRatioRepairPlan } from './aios-qianchuan-production-migration-card-ratio-repair-plan.mjs';
import {
  QIANCHUAN_CARD_RATIO_BACKUP_TABLE,
  STAGE1_BACKUP_TABLE_SHAPE_SQL,
} from './aios-qianchuan-production-migration-card-ratio-stage1-sql.mjs';
import { validateQianchuanCardRatioStage1Result } from './aios-qianchuan-production-migration-card-ratio-stage1.mjs';
import {
  assertQianchuanCardRatioCleanParity,
  assertQianchuanCardRatioSourceCounts,
  initialQianchuanCardRatioSourceRows,
  QIANCHUAN_CARD_RATIO_DETAIL_TABLE,
  QIANCHUAN_CARD_RATIO_MAIN_TABLE,
  QIANCHUAN_CARD_RATIO_STAGE2_TABLES,
  resolveQianchuanCardRatioCheckpointSourceProgress,
  resolveQianchuanCardRatioProbeSourceBoundary,
} from './aios-qianchuan-production-migration-card-ratio-stage2-source-growth.mjs';
import {
  QIANCHUAN_CARD_RATIO_STAGE2_ADVISORY_LOCK,
  STAGE2_BACKUP_RUN_SQL,
  STAGE2_DETAIL_BATCH_SQL,
  STAGE2_DETAIL_CONFLICTS_SQL,
  STAGE2_GUARD_CATALOG_SQL,
  STAGE2_LOCK_BACKUP_SQL,
  STAGE2_LOCK_TARGETS_SQL,
  STAGE2_MAIN_BATCH_SQL,
  STAGE2_MAIN_CONFLICTS_SQL,
  STAGE2_MISMATCH_COUNTS_SQL,
  STAGE2_PARITY_SQL,
} from './aios-qianchuan-production-migration-card-ratio-stage2-sql.mjs';

const MAIN_TABLE = QIANCHUAN_CARD_RATIO_MAIN_TABLE;
const DETAIL_TABLE = QIANCHUAN_CARD_RATIO_DETAIL_TABLE;
const TABLES = QIANCHUAN_CARD_RATIO_STAGE2_TABLES;
const MAX_BATCH_SIZE = 500;

const EXPECTED_BACKUP_COLUMN_TYPES = Object.freeze({
  backup_run_id: 'text',
  source_table: 'text',
  row_key: 'jsonb',
  ratio_values: 'jsonb',
  source_xmin: 'text',
  source_updated_at: 'timestamp',
  backed_up_at: 'timestamptz',
  source_probe_sha256: 'text',
});

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function indexBy(values, field) {
  return new Map((values ?? []).map((value) => [value[field], value]));
}

function sameArtifact(left, right) {
  return left?.sha256 === right?.sha256 && left?.bytes === right?.bytes;
}

function normalizedDefinition(value) {
  return String(value ?? '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function planTables(plan) {
  const tables = plan.execution?.batching?.tables;
  if (!Array.isArray(tables) || tables.length !== TABLES.length) {
    throw new Error('Stage 2 requires exactly two planned ADS table repairs.');
  }
  const byTable = indexBy(tables, 'table');
  if (TABLES.some((table) => !byTable.has(table))) {
    throw new Error('Stage 2 plan table identities are incomplete.');
  }
  return byTable;
}

function initialMismatchCounts(plan) {
  const tables = planTables(plan);
  return Object.fromEntries(TABLES.map((table) => [
    table,
    asCount(tables.get(table).mismatchRows, `${table} planned mismatch rows`)
      - asCount(plan.execution.canary.mismatchRowsByTable[table], `${table} canary rows`),
  ]));
}

function backupCounts(plan) {
  const tables = planTables(plan);
  return Object.fromEntries(TABLES.map((table) => [
    table,
    asCount(tables.get(table).mismatchRows, `${table} planned backup rows`),
  ]));
}

function totalCounts(counts) {
  return TABLES.reduce((sum, table) => sum + asCount(counts[table], `${table} count`), 0);
}

function emptyCounts() {
  return Object.fromEntries(TABLES.map((table) => [table, 0]));
}

function countDecrease(expected, actual, label) {
  return Object.fromEntries(TABLES.map((table) => {
    const expectedCount = asCount(expected[table], `${label} expected ${table}`);
    const actualCount = asCount(actual[table], `${label} ${table}`);
    if (actualCount > expectedCount) {
      throw new Error(`${label} mismatch count increased for ${table}.`);
    }
    return [table, expectedCount - actualCount];
  }));
}

function checkpointExternalProgress(checkpoint) {
  if ((checkpoint?.schemaVersion ?? 0) < 2) {
    return {
      cumulativeRows: 0,
      cumulativeRowsByTable: emptyCounts(),
    };
  }
  return {
    cumulativeRows: checkpoint.cumulativeExternallyRepairedRows,
    cumulativeRowsByTable: { ...checkpoint.cumulativeExternallyRepairedRowsByTable },
  };
}

function assertCursor(cursor, table, { nullable = false } = {}) {
  if (cursor == null && nullable) return null;
  if (!Array.isArray(cursor) || cursor.length !== 4
    || cursor.some((value) => typeof value !== 'string' || value.length === 0)
    || !/^\d{4}-\d{2}-\d{2}$/.test(cursor[0])) {
    throw new Error(`${table} checkpoint cursor must be [date, key, key, key].`);
  }
  return cursor;
}

function assertCheckpointSources(checkpoint, plan, planArtifact, stage1Artifact) {
  if (!sameArtifact(checkpoint.sourceArtifacts?.plan, planArtifact)
    || !sameArtifact(checkpoint.sourceArtifacts?.stage1, stage1Artifact)
    || checkpoint.target?.identity !== plan.target.identity
    || checkpoint.target?.checksum !== plan.target.checksum) {
    throw new Error('Stage 2 checkpoint source artifacts differ from the pinned inputs.');
  }
}

function resolveExecutionState({ checkpoint, checkpointArtifact, plan, planArtifact, stage1Artifact }) {
  const initial = initialMismatchCounts(plan);
  if (!checkpoint) {
    if (checkpointArtifact) throw new Error('Stage 2 checkpoint metadata requires checkpoint data.');
    const sourceProgress = resolveQianchuanCardRatioCheckpointSourceProgress(null, plan);
    return {
      batchNumber: 1,
      cumulativeExternallyRepairedRows: 0,
      cumulativeExternallyRepairedRowsByTable: emptyCounts(),
      cumulativeOdsMismatchDelta: sourceProgress.cumulativeOdsMismatchDelta,
      cumulativeSourceGrowthRowsByTable: sourceProgress.cumulativeSourceGrowthRowsByTable,
      cumulativeUpdatedRows: 0,
      expectedCounts: initial,
      expectedOdsMismatchRows: sourceProgress.odsMismatchRows,
      expectedSourceRowsByTable: sourceProgress.sourceRowsByTable,
      previousCursor: null,
      table: MAIN_TABLE,
    };
  }
  validateQianchuanCardRatioStage2Checkpoint(checkpoint);
  assertCheckpointSources(checkpoint, plan, planArtifact, stage1Artifact);
  if (checkpoint.status === 'completed') {
    throw new Error('Stage 2 checkpoint is already completed; no further batch is allowed.');
  }
  if (checkpoint.backupRunId !== checkpoint.stage1?.backupRunId) {
    throw new Error('Stage 2 checkpoint backup identity is internally inconsistent.');
  }
  const table = checkpoint.nextTable;
  const externalProgress = checkpointExternalProgress(checkpoint);
  const sourceProgress = resolveQianchuanCardRatioCheckpointSourceProgress(checkpoint, plan);
  let derivedUpdatedRows = 0;
  for (const plannedTable of TABLES) {
    if (checkpoint.remainingMismatchRowsByTable[plannedTable] > initial[plannedTable]) {
      throw new Error(`Stage 2 checkpoint exceeds the initial boundary for ${plannedTable}.`);
    }
    const tableUpdatedRows = initial[plannedTable]
      - externalProgress.cumulativeRowsByTable[plannedTable]
      - checkpoint.remainingMismatchRowsByTable[plannedTable];
    if (!Number.isSafeInteger(tableUpdatedRows) || tableUpdatedRows < 0) {
      throw new Error(`Stage 2 checkpoint progress is inconsistent for ${plannedTable}.`);
    }
    derivedUpdatedRows += tableUpdatedRows;
  }
  if (checkpoint.cumulativeUpdatedRows !== derivedUpdatedRows
    || externalProgress.cumulativeRows
      !== totalCounts(externalProgress.cumulativeRowsByTable)
    || checkpoint.cumulativeUpdatedRows + externalProgress.cumulativeRows
      + checkpoint.remainingTotalMismatchRows !== totalCounts(initial)) {
    throw new Error('Stage 2 checkpoint cumulative progress is inconsistent.');
  }
  if (table === DETAIL_TABLE && checkpoint.remainingMismatchRowsByTable[MAIN_TABLE] !== 0) {
    throw new Error('Stage 2 cannot advance to detail while main mismatches remain.');
  }
  return {
    batchNumber: checkpoint.batchNumber + 1,
    cumulativeExternallyRepairedRows: externalProgress.cumulativeRows,
    cumulativeExternallyRepairedRowsByTable: externalProgress.cumulativeRowsByTable,
    cumulativeOdsMismatchDelta: sourceProgress.cumulativeOdsMismatchDelta,
    cumulativeSourceGrowthRowsByTable: sourceProgress.cumulativeSourceGrowthRowsByTable,
    cumulativeUpdatedRows: checkpoint.cumulativeUpdatedRows,
    expectedCounts: { ...checkpoint.remainingMismatchRowsByTable },
    expectedOdsMismatchRows: sourceProgress.odsMismatchRows,
    expectedSourceRowsByTable: sourceProgress.sourceRowsByTable,
    previousCursor: assertCursor(checkpoint.nextCursor, table, { nullable: true }),
    table,
  };
}

function assertStage1Boundary(stage1, plan, planArtifact) {
  validateQianchuanCardRatioStage1Result(stage1);
  const initial = initialMismatchCounts(plan);
  if (!sameArtifact(stage1.sourceArtifacts?.plan, planArtifact)
    || stage1.target?.identity !== plan.target.identity
    || stage1.target?.checksum !== plan.target.checksum
    || stage1.backup?.table !== QIANCHUAN_CARD_RATIO_BACKUP_TABLE
    || stage1.backup?.rows !== plan.execution.backup.estimatedRows
    || stage1.backup?.sourceProbeSha256 !== plan.sourceArtifact.sha256
    || stage1.postcheck?.adsMismatchRows !== totalCounts(initial)
    || stage1.postcheck?.odsMismatchRows !== plan.observed.odsMismatchRows) {
    throw new Error('Stage 1 artifact does not match the approved Stage 2 starting boundary.');
  }
  return stage1;
}

function impactCounts(probe) {
  const impact = indexBy(probe.impact, 'table_name');
  return Object.fromEntries(TABLES.map((table) => {
    const row = impact.get(table);
    if (!row) throw new Error(`Stage 2 probe is missing impact for ${table}.`);
    return [table, asCount(row.mismatch_rows, `${table} probe mismatch rows`)];
  }));
}

function assertCounts(actual, expected, label) {
  for (const table of TABLES) {
    if (asCount(actual[table], `${label} ${table}`) !== asCount(expected[table], `${label} expected ${table}`)) {
      throw new Error(`${label} mismatch count changed for ${table}.`);
    }
  }
  return actual;
}

function assertStage2Probe(
  probe,
  plan,
  expectedCounts,
  expectedSourceRowsByTable,
  expectedOdsMismatchRows,
  label,
  { allowDecrease = false, allowSourceGrowth = false } = {},
) {
  if (probe?.schemaVersion !== 1
    || probe.mode !== 'live_readonly_card_ratio_repair_readiness_probe'
    || probe.target?.identity !== plan.target.identity
    || probe.target?.checksum !== plan.target.checksum
    || probe.policy?.transaction !== 'BEGIN READ ONLY / ROLLBACK'
    || probe.policy?.productionWritesAuthorized !== false
    || probe.policy?.ledgerWritesAuthorized !== false
    || probe.policy?.repairExecutionAuthorized !== false
    || probe.policy?.deployAuthorized !== false
    || probe.policy?.arkInvoked !== false
    || probe.summary?.relationsPresent !== 4
    || probe.summary?.exactPrimaryKeys !== 2
    || probe.summary?.refreshRoutinesPresent !== 3
    || probe.summary?.recomputeFunctionsPresent !== 2
    || probe.summary?.ratioTriggersPresent !== 2
    || asCount(probe.summary?.waitingLocks, `${label} waiting locks`) !== 0) {
    throw new Error(`${label} topology, policy, source drift, or lock state is unsafe.`);
  }
  const counts = impactCounts(probe);
  if (allowDecrease) countDecrease(expectedCounts, counts, label);
  else assertCounts(counts, expectedCounts, label);
  if (asCount(probe.summary.adsMismatchRows, `${label} ADS mismatches`) !== totalCounts(counts)) {
    throw new Error(`${label} ADS mismatch total is inconsistent.`);
  }
  return {
    probe,
    ...resolveQianchuanCardRatioProbeSourceBoundary(
      probe,
      expectedSourceRowsByTable,
      expectedOdsMismatchRows,
      label,
      { allowGrowth: allowSourceGrowth },
    ),
  };
}

function assertBackupTableShape(row) {
  const columnTypes = row?.column_types ?? {};
  const exactColumns = Object.keys(columnTypes).length === Object.keys(EXPECTED_BACKUP_COLUMN_TYPES).length
    && Object.entries(EXPECTED_BACKUP_COLUMN_TYPES).every(([column, type]) => (
      columnTypes[column] === type
    ));
  if (asCount(row?.column_count, 'backup table column count') !== 8
    || !exactColumns
    || normalizedDefinition(row.primary_key)
      !== 'primary key (backup_run_id, source_table, row_key)') {
    throw new Error(`${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} has an incompatible schema.`);
  }
}

function assertBackupRun(rows, expectedCounts, sourceProbeSha256) {
  const byTable = indexBy(rows, 'source_table');
  for (const table of TABLES) {
    const row = byTable.get(table);
    if (!row
      || asCount(row.rows, `${table} backup rows`) !== expectedCounts[table]
      || asCount(row.source_probe_mismatch_rows, `${table} backup source mismatches`) !== 0) {
      throw new Error(`${table} backup run is incomplete or not pinned to ${sourceProbeSha256}.`);
    }
  }
}

function assertGuardCatalog(row) {
  const mainFunction = normalizedDefinition(row?.main_function_definition);
  const detailFunction = normalizedDefinition(row?.detail_function_definition);
  const mainTrigger = normalizedDefinition(row?.main_trigger_definition);
  const detailTrigger = normalizedDefinition(row?.detail_trigger_definition);
  if (asCount(row?.functions_present, 'Stage 2 guard functions') !== 2
    || asCount(row?.enabled_triggers_present, 'Stage 2 enabled guard triggers') !== 2
    || asCount(row?.user_triggers_present, 'Stage 2 user triggers') !== 2
    || !mainFunction.includes('fn_recompute_douyin_trade_sale_card_ratio_fields')
    || !mainFunction.includes('new.card_click_to_pay_rate_count')
    || !detailFunction.includes('fn_recompute_douyin_trade_sale_card_detail_ratio_fields')
    || !detailFunction.includes('new.card_click_to_pay_rate_user')
    || !mainTrigger.includes('before insert or update')
    || !mainTrigger.includes('fn_recompute_douyin_trade_sale_card_ratio_fields')
    || !detailTrigger.includes('before insert or update')
    || !detailTrigger.includes('fn_recompute_douyin_trade_sale_card_detail_ratio_fields')) {
    throw new Error('Stage 2 requires exactly the two canonical enabled ratio guards.');
  }
}

async function readMismatchCounts(client) {
  const rows = (await client.query(STAGE2_MISMATCH_COUNTS_SQL)).rows;
  const byTable = indexBy(rows, 'table_name');
  return Object.fromEntries(TABLES.map((table) => [
    table,
    asCount(byTable.get(table)?.mismatch_rows, `${table} transactional mismatches`),
  ]));
}

function resolveRebasedBoundary(state, counts) {
  const externallyRepairedRowsByTable = countDecrease(
    state.expectedCounts,
    counts,
    'Stage 2 transaction rebase',
  );
  if (totalCounts(counts) === 0) {
    throw new Error('Stage 2 has no mismatch left for a real checkpoint batch after safe rebase.');
  }
  if (state.table === MAIN_TABLE && counts[MAIN_TABLE] === 0) {
    return {
      externallyRepairedRowsByTable,
      previousCursor: null,
      table: DETAIL_TABLE,
    };
  }
  if (counts[state.table] < 1) {
    throw new Error(`Stage 2 rebased boundary selected completed table ${state.table}.`);
  }
  return {
    externallyRepairedRowsByTable,
    previousCursor: state.previousCursor,
    table: state.table,
  };
}

async function assertRemainingRowsSafe(client, backupRunId, state) {
  for (const table of TABLES) {
    const conflictsSql = table === MAIN_TABLE
      ? STAGE2_MAIN_CONFLICTS_SQL
      : STAGE2_DETAIL_CONFLICTS_SQL;
    const cursor = table === state.table ? state.previousCursor : null;
    const conflict = (await client.query(
      conflictsSql,
      cursorParams(backupRunId, cursor),
    )).rows[0];
    if (asCount(conflict?.outside_backup_rows, `${table} Stage 2 rows outside backup`) !== 0
      || asCount(conflict?.version_conflict_rows, `${table} Stage 2 version conflicts`) !== 0
      || asCount(conflict?.cursor_gap_rows, `${table} Stage 2 cursor gaps`) !== 0) {
      throw new Error(`Stage 2 detected rows outside backup, version drift, or mismatch before the checkpoint cursor for ${table}.`);
    }
  }
}

function cursorParams(backupRunId, cursor, batchSize = null) {
  const params = [backupRunId, cursor != null, ...(cursor ?? [null, null, null, null])];
  if (batchSize != null) params.push(batchSize);
  return params;
}

function normalizeUpdatedRows(rows, table) {
  const normalized = rows.map((row) => ({
    cursor: [row.cursor_1, row.cursor_2, row.cursor_3, row.cursor_4].map(String),
    formulaOk: row.formula_ok === true,
  }));
  if (normalized.some((row) => !row.formulaOk)) {
    throw new Error(`${table} Stage 2 guard did not repair every selected row.`);
  }
  return normalized;
}

function nextProgress(table, lastCursor, counts) {
  const remainingTotalMismatchRows = totalCounts(counts);
  if (remainingTotalMismatchRows === 0) {
    return { nextCursor: null, nextTable: null, status: 'completed' };
  }
  if (counts[table] > 0) {
    return { nextCursor: lastCursor, nextTable: table, status: 'progress' };
  }
  if (table === MAIN_TABLE && counts[DETAIL_TABLE] > 0) {
    return { nextCursor: null, nextTable: DETAIL_TABLE, status: 'progress' };
  }
  throw new Error('Stage 2 checkpoint cannot advance across an inconsistent table boundary.');
}

export function assertQianchuanCardRatioStage2GitState({
  branch,
  expectedGitSha,
  head,
  originMain,
  status,
}) {
  if (branch !== 'main') throw new Error('Stage 2 production execution requires branch main.');
  if (!/^[a-f0-9]{40}$/.test(expectedGitSha ?? '')) {
    throw new Error('AIOS_QC_EXPECTED_GIT_SHA must be an explicit 40-character SHA.');
  }
  if (head !== expectedGitSha || originMain !== expectedGitSha) {
    throw new Error('Stage 2 requires HEAD, origin/main, and the explicit expected SHA to match.');
  }
  if (String(status ?? '').trim()) {
    throw new Error('Stage 2 refuses a dirty Git worktree. Commit and push the scoped runner first.');
  }
  return true;
}

export function assertQianchuanCardRatioStage2Authorization({ env, confirmed }) {
  if (confirmed !== true
    || env.AIOS_QC_ALLOW_LIVE_WRITE !== '1'
    || env.AIOS_QC_CARD_RATIO_WRITE_ACK !== 'stage2-batch') {
    throw new Error('Stage 2 requires --confirm-stage2-batch, AIOS_QC_ALLOW_LIVE_WRITE=1, and AIOS_QC_CARD_RATIO_WRITE_ACK=stage2-batch.');
  }
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required for Stage 2 production execution.');
  }
  return {
    connectionString: env.DATABASE_URL.trim(),
    expectedGitSha: env.AIOS_QC_EXPECTED_GIT_SHA?.trim() ?? '',
  };
}

export async function runQianchuanCardRatioStage2Batch({
  batchSize = MAX_BATCH_SIZE,
  checkpoint = null,
  checkpointArtifact = null,
  checkpointSha256 = null,
  client,
  git,
  now = () => new Date(),
  onEvent = () => {},
  plan,
  planArtifact,
  planSha256,
  readonlyInputs,
  runReadonlyProbe = runQianchuanCardRatioReadonlyProbe,
  stage1,
  stage1Artifact,
  stage1Sha256,
}) {
  validateQianchuanCardRatioRepairPlan(plan);
  assertPinnedMigrationReviewArtifact(planArtifact, planSha256, 'Card-ratio repair plan');
  assertPinnedMigrationReviewArtifact(stage1Artifact, stage1Sha256, 'Card-ratio Stage 1 artifact');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`Stage 2 batchSize must be an integer from 1 to ${MAX_BATCH_SIZE}.`);
  }
  if ((checkpoint == null) !== (checkpointArtifact == null)
    || (checkpoint == null) !== (checkpointSha256 == null)) {
    throw new Error('Stage 2 checkpoint data, metadata, and SHA-256 pin must be provided together.');
  }
  if (checkpoint) {
    assertPinnedMigrationReviewArtifact(
      checkpointArtifact,
      checkpointSha256,
      'Card-ratio Stage 2 checkpoint',
    );
  }
  assertStage1Boundary(stage1, plan, planArtifact);
  if (checkpoint && checkpoint.backupRunId !== stage1.backup.runId) {
    throw new Error('Stage 2 checkpoint backup run differs from the pinned Stage 1 artifact.');
  }
  const state = resolveExecutionState({
    checkpoint,
    checkpointArtifact,
    plan,
    planArtifact,
    stage1Artifact,
  });
  assertCursor(state.previousCursor, state.table, { nullable: true });
  if (state.expectedCounts[state.table] < 1) {
    throw new Error(`Stage 2 checkpoint selected completed table ${state.table}.`);
  }

  const preflightBoundary = assertStage2Probe(
    await runReadonlyProbe({ ...readonlyInputs, client }),
    plan,
    state.expectedCounts,
    state.expectedSourceRowsByTable,
    state.expectedOdsMismatchRows,
    'Stage 2 preflight',
    { allowDecrease: true, allowSourceGrowth: true },
  );
  const preflight = preflightBoundary.probe;
  const preflightCounts = impactCounts(preflight);
  const preflightExternallyRepairedRowsByTable = countDecrease(
    state.expectedCounts,
    preflightCounts,
    'Stage 2 preflight',
  );
  onEvent({
    at: now().toISOString(),
    externallyRepairedRows: totalCounts(preflightExternallyRepairedRowsByTable),
    odsMismatchDelta: preflightBoundary.odsMismatchDelta,
    sourceGrowthRows: preflightBoundary.sourceGrowthRows,
    stage: 'preflight_passed',
    table: state.table,
  });

  let transactionStarted = false;
  let committed = false;
  let boundary;
  let updated;
  let countsAfter;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    transactionStarted = true;
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      QIANCHUAN_CARD_RATIO_STAGE2_ADVISORY_LOCK,
    ]);
    await client.query(STAGE2_LOCK_TARGETS_SQL);
    await client.query(STAGE2_LOCK_BACKUP_SQL);
    assertGuardCatalog((await client.query(STAGE2_GUARD_CATALOG_SQL)).rows[0]);

    assertBackupTableShape((await client.query(
      STAGE1_BACKUP_TABLE_SHAPE_SQL,
      [QIANCHUAN_CARD_RATIO_BACKUP_TABLE],
    )).rows[0]);
    assertBackupRun(
      (await client.query(STAGE2_BACKUP_RUN_SQL, [
        stage1.backup.runId,
        stage1.backup.sourceProbeSha256,
      ])).rows,
      backupCounts(plan),
      stage1.backup.sourceProbeSha256,
    );

    const lockedCounts = assertCounts(
      await readMismatchCounts(client),
      preflightCounts,
      'Stage 2 transaction precheck',
    );
    assertQianchuanCardRatioSourceCounts(
      assertQianchuanCardRatioCleanParity(
        (await client.query(STAGE2_PARITY_SQL)).rows,
        'Stage 2 transaction precheck parity',
      ),
      preflightBoundary.sourceRowsByTable,
      'Stage 2 transaction precheck',
    );
    boundary = resolveRebasedBoundary(state, lockedCounts);
    await assertRemainingRowsSafe(client, stage1.backup.runId, state);

    const batchSql = boundary.table === MAIN_TABLE ? STAGE2_MAIN_BATCH_SQL : STAGE2_DETAIL_BATCH_SQL;
    updated = normalizeUpdatedRows((await client.query(
      batchSql,
      cursorParams(stage1.backup.runId, boundary.previousCursor, batchSize),
    )).rows, boundary.table);
    if (updated.length < 1 || updated.length > batchSize) {
      throw new Error('Stage 2 must update between one row and the requested batch size.');
    }

    const expectedAfter = { ...lockedCounts };
    expectedAfter[boundary.table] -= updated.length;
    countsAfter = assertCounts(
      await readMismatchCounts(client),
      expectedAfter,
      'Stage 2 transaction postcheck',
    );
    assertQianchuanCardRatioSourceCounts(
      assertQianchuanCardRatioCleanParity(
        (await client.query(STAGE2_PARITY_SQL)).rows,
        'Stage 2 transaction postcheck parity',
      ),
      preflightBoundary.sourceRowsByTable,
      'Stage 2 transaction postcheck',
    );
    assertGuardCatalog((await client.query(STAGE2_GUARD_CATALOG_SQL)).rows[0]);

    await client.query('COMMIT');
    committed = true;
    transactionStarted = false;
    onEvent({
      at: now().toISOString(),
      rows: updated.length,
      stage: 'single_batch_committed',
      table: boundary.table,
    });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    const stage2Error = error instanceof Error ? error : new Error(String(error));
    stage2Error.stage2Committed = committed;
    throw stage2Error;
  }

  let postcheck;
  try {
    postcheck = assertStage2Probe(
      await runReadonlyProbe({ ...readonlyInputs, client }),
      plan,
      countsAfter,
      preflightBoundary.sourceRowsByTable,
      preflightBoundary.odsMismatchRows,
      'Stage 2 postcheck',
    ).probe;
  } catch (error) {
    const postcheckError = error instanceof Error ? error : new Error(String(error));
    postcheckError.stage2Committed = true;
    throw postcheckError;
  }
  onEvent({ at: now().toISOString(), stage: 'postcheck_passed', table: boundary.table });

  const lastCursor = updated.at(-1).cursor;
  const progress = nextProgress(boundary.table, lastCursor, countsAfter);
  const remainingTotalMismatchRows = totalCounts(countsAfter);
  const externallyRepairedRows = totalCounts(boundary.externallyRepairedRowsByTable);
  const cumulativeExternallyRepairedRowsByTable = Object.fromEntries(TABLES.map((table) => [
    table,
    state.cumulativeExternallyRepairedRowsByTable[table]
      + boundary.externallyRepairedRowsByTable[table],
  ]));
  const cumulativeExternallyRepairedRows = totalCounts(cumulativeExternallyRepairedRowsByTable);
  const cumulativeUpdatedRows = state.cumulativeUpdatedRows + updated.length;
  const cumulativeSourceGrowthRowsByTable = Object.fromEntries(TABLES.map((table) => [
    table,
    state.cumulativeSourceGrowthRowsByTable[table]
      + preflightBoundary.sourceGrowthRowsByTable[table],
  ]));
  const cumulativeSourceGrowthRows = totalCounts(cumulativeSourceGrowthRowsByTable);
  const cumulativeOdsMismatchDelta = state.cumulativeOdsMismatchDelta
    + preflightBoundary.odsMismatchDelta;
  if (cumulativeUpdatedRows + cumulativeExternallyRepairedRows + remainingTotalMismatchRows
      !== totalCounts(initialMismatchCounts(plan))) {
    throw new Error('Stage 2 produced an inconsistent runner/external/remaining progress boundary.');
  }
  const plannedSourceRowsByTable = initialQianchuanCardRatioSourceRows(plan);
  if (TABLES.some((table) => (
    plannedSourceRowsByTable[table] + cumulativeSourceGrowthRowsByTable[table]
      !== preflightBoundary.sourceRowsByTable[table]
  )) || asCount(plan.observed.odsMismatchRows, 'planned ODS mismatches')
      + cumulativeOdsMismatchDelta !== preflightBoundary.odsMismatchRows) {
    throw new Error('Stage 2 produced an inconsistent source-growth progress boundary.');
  }
  return {
    schemaVersion: 3,
    generatedAt: now().toISOString(),
    mode: 'live_write_card_ratio_stage2_batch',
    status: progress.status,
    target: { ...plan.target },
    sourceArtifacts: {
      plan: planArtifact,
      stage1: stage1Artifact,
      previousCheckpoint: checkpointArtifact,
    },
    git,
    policy: {
      transaction: 'one repeatable-read ordered cursor batch',
      productionWritesAuthorized: true,
      repairExecutionAuthorized: true,
      singleBatchOnly: true,
      maxRowsPerTransaction: MAX_BATCH_SIZE,
      skipLocked: false,
      historicalMigrationReplayed: false,
      ledgerWritten: false,
      deployAuthorized: false,
      arkInvoked: false,
    },
    stage1: {
      backupRunId: stage1.backup.runId,
      artifactSha256: stage1Artifact.sha256,
    },
    backupRunId: stage1.backup.runId,
    batchNumber: state.batchNumber,
    batchSize,
    table: boundary.table,
    previousCursor: boundary.previousCursor,
    nextTable: progress.nextTable,
    nextCursor: progress.nextCursor,
    updatedRows: updated.length,
    cumulativeUpdatedRows,
    externallyRepairedRows,
    externallyRepairedRowsByTable: { ...boundary.externallyRepairedRowsByTable },
    cumulativeExternallyRepairedRows,
    cumulativeExternallyRepairedRowsByTable,
    sourceRows: totalCounts(preflightBoundary.sourceRowsByTable),
    sourceRowsByTable: { ...preflightBoundary.sourceRowsByTable },
    sourceGrowthRows: preflightBoundary.sourceGrowthRows,
    sourceGrowthRowsByTable: { ...preflightBoundary.sourceGrowthRowsByTable },
    cumulativeSourceGrowthRows,
    cumulativeSourceGrowthRowsByTable,
    odsMismatchRows: preflightBoundary.odsMismatchRows,
    odsMismatchDelta: preflightBoundary.odsMismatchDelta,
    cumulativeOdsMismatchDelta,
    remainingTableMismatchRows: countsAfter[boundary.table],
    remainingTotalMismatchRows,
    remainingMismatchRowsByTable: { ...countsAfter },
    guards: {
      functionsPresent: 2,
      enabledTriggersPresent: 2,
    },
    preflight: {
      generatedAt: preflight.generatedAt,
      adsMismatchRows: preflight.summary.adsMismatchRows,
      mismatchRowsByTable: { ...preflightCounts },
      odsMismatchRows: preflight.summary.odsMismatchRows,
      odsMismatchDelta: preflightBoundary.odsMismatchDelta,
      sourceRowsByTable: { ...preflightBoundary.sourceRowsByTable },
      sourceGrowthRows: preflightBoundary.sourceGrowthRows,
      sourceGrowthRowsByTable: { ...preflightBoundary.sourceGrowthRowsByTable },
      waitingLocks: preflight.summary.waitingLocks,
    },
    postcheck: {
      generatedAt: postcheck.generatedAt,
      adsMismatchRows: postcheck.summary.adsMismatchRows,
      mismatchRowsByTable: { ...countsAfter },
      odsMismatchRows: postcheck.summary.odsMismatchRows,
      odsMismatchDelta: 0,
      sourceRowsByTable: { ...preflightBoundary.sourceRowsByTable },
      sourceGrowthRows: 0,
      sourceGrowthRowsByTable: emptyCounts(),
      waitingLocks: postcheck.summary.waitingLocks,
    },
  };
}

export function validateQianchuanCardRatioStage2Checkpoint(checkpoint) {
  const counts = checkpoint?.remainingMismatchRowsByTable;
  if (![1, 2, 3].includes(checkpoint?.schemaVersion)
    || checkpoint.mode !== 'live_write_card_ratio_stage2_batch'
    || !['progress', 'completed'].includes(checkpoint.status)
    || !TABLES.includes(checkpoint.table)
    || !Number.isSafeInteger(checkpoint.batchNumber)
    || checkpoint.batchNumber < 1
    || !Number.isInteger(checkpoint.batchSize)
    || checkpoint.batchSize < 1
    || checkpoint.batchSize > MAX_BATCH_SIZE
    || !Number.isInteger(checkpoint.updatedRows)
    || checkpoint.updatedRows < 1
    || checkpoint.updatedRows > checkpoint.batchSize
    || !/^qcr-\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(checkpoint.backupRunId ?? '')
    || checkpoint.stage1?.backupRunId !== checkpoint.backupRunId
    || checkpoint.policy?.transaction !== 'one repeatable-read ordered cursor batch'
    || checkpoint.policy?.productionWritesAuthorized !== true
    || checkpoint.policy?.repairExecutionAuthorized !== true
    || checkpoint.policy?.singleBatchOnly !== true
    || checkpoint.policy?.maxRowsPerTransaction !== MAX_BATCH_SIZE
    || checkpoint.policy?.skipLocked !== false
    || checkpoint.policy?.historicalMigrationReplayed !== false
    || checkpoint.policy?.ledgerWritten !== false
    || checkpoint.policy?.deployAuthorized !== false
    || checkpoint.policy?.arkInvoked !== false
    || checkpoint.guards?.functionsPresent !== 2
    || checkpoint.guards?.enabledTriggersPresent !== 2
    || !Number.isSafeInteger(checkpoint.cumulativeUpdatedRows)
    || checkpoint.cumulativeUpdatedRows < checkpoint.updatedRows
    || !counts || TABLES.some((table) => !Number.isSafeInteger(counts[table]) || counts[table] < 0)
    || checkpoint.remainingTotalMismatchRows !== totalCounts(counts)
    || checkpoint.remainingTableMismatchRows !== counts[checkpoint.table]) {
    throw new Error('Card-ratio Stage 2 checkpoint structure or policy is invalid.');
  }
  if (checkpoint.schemaVersion >= 2) {
    const externalCounts = checkpoint.externallyRepairedRowsByTable;
    const cumulativeExternalCounts = checkpoint.cumulativeExternallyRepairedRowsByTable;
    const preflightCounts = checkpoint.preflight?.mismatchRowsByTable;
    const postcheckCounts = checkpoint.postcheck?.mismatchRowsByTable;
    if (!Number.isSafeInteger(checkpoint.externallyRepairedRows)
      || checkpoint.externallyRepairedRows < 0
      || !Number.isSafeInteger(checkpoint.cumulativeExternallyRepairedRows)
      || checkpoint.cumulativeExternallyRepairedRows < checkpoint.externallyRepairedRows
      || !externalCounts
      || !cumulativeExternalCounts
      || !preflightCounts
      || !postcheckCounts
      || TABLES.some((table) => (
        !Number.isSafeInteger(externalCounts[table])
        || externalCounts[table] < 0
        || !Number.isSafeInteger(cumulativeExternalCounts[table])
        || cumulativeExternalCounts[table] < externalCounts[table]
        || !Number.isSafeInteger(preflightCounts[table])
        || preflightCounts[table] < 0
        || !Number.isSafeInteger(postcheckCounts[table])
        || postcheckCounts[table] < 0
        || postcheckCounts[table] !== counts[table]
        || preflightCounts[table] - (table === checkpoint.table ? checkpoint.updatedRows : 0)
          !== postcheckCounts[table]
      ))
      || checkpoint.externallyRepairedRows !== totalCounts(externalCounts)
      || checkpoint.cumulativeExternallyRepairedRows !== totalCounts(cumulativeExternalCounts)
      || checkpoint.preflight.adsMismatchRows !== totalCounts(preflightCounts)
      || checkpoint.postcheck.adsMismatchRows !== totalCounts(postcheckCounts)) {
      throw new Error('Card-ratio Stage 2 checkpoint external-repair boundary is invalid.');
    }
  }
  if (checkpoint.schemaVersion === 3) {
    const sourceCounts = checkpoint.sourceRowsByTable;
    const sourceGrowthCounts = checkpoint.sourceGrowthRowsByTable;
    const cumulativeSourceGrowthCounts = checkpoint.cumulativeSourceGrowthRowsByTable;
    const preflightSourceCounts = checkpoint.preflight?.sourceRowsByTable;
    const preflightSourceGrowthCounts = checkpoint.preflight?.sourceGrowthRowsByTable;
    const postcheckSourceCounts = checkpoint.postcheck?.sourceRowsByTable;
    const postcheckSourceGrowthCounts = checkpoint.postcheck?.sourceGrowthRowsByTable;
    if (!sourceCounts
      || !sourceGrowthCounts
      || !cumulativeSourceGrowthCounts
      || !preflightSourceCounts
      || !preflightSourceGrowthCounts
      || !postcheckSourceCounts
      || !postcheckSourceGrowthCounts
      || TABLES.some((table) => (
        !Number.isSafeInteger(sourceCounts[table])
        || sourceCounts[table] < 0
        || !Number.isSafeInteger(sourceGrowthCounts[table])
        || sourceGrowthCounts[table] < 0
        || !Number.isSafeInteger(cumulativeSourceGrowthCounts[table])
        || cumulativeSourceGrowthCounts[table] < sourceGrowthCounts[table]
        || preflightSourceCounts[table] !== sourceCounts[table]
        || postcheckSourceCounts[table] !== sourceCounts[table]
        || preflightSourceGrowthCounts[table] !== sourceGrowthCounts[table]
        || postcheckSourceGrowthCounts[table] !== 0
      ))
      || checkpoint.sourceRows !== totalCounts(sourceCounts)
      || checkpoint.sourceGrowthRows !== totalCounts(sourceGrowthCounts)
      || checkpoint.cumulativeSourceGrowthRows !== totalCounts(cumulativeSourceGrowthCounts)
      || checkpoint.preflight.sourceGrowthRows !== checkpoint.sourceGrowthRows
      || checkpoint.postcheck.sourceGrowthRows !== 0
      || !Number.isSafeInteger(checkpoint.odsMismatchRows)
      || checkpoint.odsMismatchRows < 0
      || !Number.isSafeInteger(checkpoint.odsMismatchDelta)
      || checkpoint.odsMismatchDelta < 0
      || checkpoint.odsMismatchDelta > checkpoint.sourceGrowthRows
      || !Number.isSafeInteger(checkpoint.cumulativeOdsMismatchDelta)
      || checkpoint.cumulativeOdsMismatchDelta < checkpoint.odsMismatchDelta
      || checkpoint.preflight.odsMismatchRows !== checkpoint.odsMismatchRows
      || checkpoint.postcheck.odsMismatchRows !== checkpoint.odsMismatchRows
      || checkpoint.preflight.odsMismatchDelta !== checkpoint.odsMismatchDelta
      || checkpoint.postcheck.odsMismatchDelta !== 0) {
      throw new Error('Card-ratio Stage 2 checkpoint source-growth boundary is invalid.');
    }
  }
  assertCursor(checkpoint.previousCursor, checkpoint.table, { nullable: true });
  if (checkpoint.status === 'completed') {
    if (checkpoint.nextTable !== null || checkpoint.nextCursor !== null
      || checkpoint.remainingTotalMismatchRows !== 0) {
      throw new Error('Completed Stage 2 checkpoint has an invalid continuation boundary.');
    }
  } else if (!TABLES.includes(checkpoint.nextTable)) {
    throw new Error('Progress Stage 2 checkpoint must name the next table.');
  } else {
    assertCursor(checkpoint.nextCursor, checkpoint.nextTable, { nullable: true });
    if (checkpoint.nextTable === checkpoint.table && checkpoint.nextCursor == null) {
      throw new Error('Same-table Stage 2 continuation requires a non-null cursor.');
    }
  }
  return checkpoint;
}
