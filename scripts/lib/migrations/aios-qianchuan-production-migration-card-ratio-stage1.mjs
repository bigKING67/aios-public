import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { runQianchuanCardRatioReadonlyProbe } from './aios-qianchuan-production-migration-card-ratio-readonly-probe.mjs';
import { validateQianchuanCardRatioRepairPlan } from './aios-qianchuan-production-migration-card-ratio-repair-plan.mjs';
import {
  QIANCHUAN_CARD_RATIO_BACKUP_TABLE,
  QIANCHUAN_CARD_RATIO_STAGE1_ADVISORY_LOCK,
  STAGE1_BACKUP_COUNTS_SQL,
  STAGE1_BACKUP_TABLE_SHAPE_SQL,
  STAGE1_BACKUP_TABLE_SQL,
  STAGE1_CALL_DETAIL_REFRESH_SQL,
  STAGE1_CALL_MAIN_REFRESH_SQL,
  STAGE1_CANARY_SNAPSHOT_SQL,
  STAGE1_DETAIL_BACKUP_SQL,
  STAGE1_EXISTING_BACKUP_RUN_SQL,
  STAGE1_GUARD_CATALOG_SQL,
  STAGE1_MAIN_BACKUP_SQL,
} from './aios-qianchuan-production-migration-card-ratio-stage1-sql.mjs';

export const QIANCHUAN_CARD_RATIO_STAGE1_MIGRATION = Object.freeze({
  identity: 'warehouse/20260724_1715',
  relativePath: 'etl/groland_postgres/sql/migrations/20260724_1715__enforce_douyin_trade_sale_card_ratio_fields.sql',
});

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

const REQUIRED_MIGRATION_TOKENS = Object.freeze([
  'ads.fn_recompute_douyin_trade_sale_card_ratio_fields()',
  'ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()',
  'trg_recompute_douyin_trade_sale_card_ratio_fields',
  'trg_recompute_douyin_trade_sale_card_detail_ratio_fields',
]);

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function indexBy(values, field) {
  return new Map(values.map((value) => [value[field], value]));
}

function normalizedDefinition(value) {
  return String(value ?? '')
    .replaceAll('"', '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function expectedTablePlans(plan) {
  const tables = plan.execution?.batching?.tables;
  if (!Array.isArray(tables) || tables.length !== 2) {
    throw new Error('Stage 1 requires exactly two planned ADS table repairs.');
  }
  return indexBy(tables, 'table');
}

function impactMismatchRows(probe, tableName) {
  const impact = probe.impact?.find((row) => row.table_name === tableName);
  if (!impact) throw new Error(`Read-only probe is missing impact for ${tableName}.`);
  return asCount(impact.mismatch_rows, `${tableName} mismatch rows`);
}

function dailyMismatchRows(probe, tableName, date) {
  const impact = probe.impact?.find((row) => row.table_name === tableName);
  const daily = impact?.daily_mismatches?.find((row) => row.date === date);
  return daily ? asCount(daily.mismatchRows, `${tableName} ${date} mismatch rows`) : 0;
}

function assertCleanParity(rows, label) {
  if (!Array.isArray(rows) || rows.length !== 2) {
    throw new Error(`${label} must contain main and detail parity rows.`);
  }
  for (const row of rows) {
    if (asCount(row.source_rows ?? row.sourceRows, `${label} source rows`)
        !== asCount(row.target_rows ?? row.targetRows, `${label} target rows`)
      || asCount(row.missing_target_rows ?? row.missingTargetRows, `${label} missing rows`) !== 0
      || asCount(row.extra_target_rows ?? row.extraTargetRows, `${label} extra rows`) !== 0
      || asCount(
        row.base_metric_mismatch_rows ?? row.baseMetricMismatchRows,
        `${label} base metric mismatches`,
      ) !== 0) {
      throw new Error(`${label} is not clean.`);
    }
  }
}

export function validateQianchuanCardRatioStage1MigrationSql(migrationSql) {
  if (typeof migrationSql !== 'string' || migrationSql.trim().length < 1000) {
    throw new Error('Stage 1 migration SQL is missing or unexpectedly small.');
  }
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(migrationSql)) {
    throw new Error('Stage 1 migration must rely on the caller transaction and contain no transaction boundary.');
  }
  if (/\b(?:INSERT\s+INTO|UPDATE\s+ads\.|DELETE\s+FROM|CALL\s+)\b/i.test(migrationSql)) {
    throw new Error('Stage 1 migration must remain DDL-only and contain no table data write or refresh call.');
  }
  for (const token of REQUIRED_MIGRATION_TOKENS) {
    if (!migrationSql.includes(token)) {
      throw new Error(`Stage 1 migration is missing required contract token ${token}.`);
    }
  }
  return {
    bytes: Buffer.byteLength(migrationSql),
    sha256: createHash('sha256').update(migrationSql).digest('hex'),
  };
}

export function assertQianchuanCardRatioStage1GitState({
  branch,
  expectedGitSha,
  head,
  originMain,
  status,
}) {
  if (branch !== 'main') throw new Error('Stage 1 production execution requires branch main.');
  if (!/^[a-f0-9]{40}$/.test(expectedGitSha ?? '')) {
    throw new Error('AIOS_QC_EXPECTED_GIT_SHA must be an explicit 40-character SHA.');
  }
  if (head !== expectedGitSha || originMain !== expectedGitSha) {
    throw new Error('Stage 1 requires HEAD, origin/main, and the explicit expected SHA to match.');
  }
  if (String(status ?? '').trim()) {
    throw new Error('Stage 1 refuses a dirty Git worktree. Commit and push the scoped repair first.');
  }
  return true;
}

export function assertQianchuanCardRatioStage1Authorization({ env, confirmed }) {
  if (confirmed !== true
    || env.AIOS_QC_ALLOW_LIVE_WRITE !== '1'
    || env.AIOS_QC_CARD_RATIO_WRITE_ACK !== 'stage1') {
    throw new Error('Stage 1 requires --confirm-stage1, AIOS_QC_ALLOW_LIVE_WRITE=1, and AIOS_QC_CARD_RATIO_WRITE_ACK=stage1.');
  }
  if (!env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required for Stage 1 production execution.');
  return {
    connectionString: env.DATABASE_URL.trim(),
    expectedGitSha: env.AIOS_QC_EXPECTED_GIT_SHA?.trim() ?? '',
  };
}

export function assertQianchuanCardRatioStage1Preflight(probe, plan) {
  const plannedTables = expectedTablePlans(plan);
  if (probe.summary?.relationsPresent !== 4
    || probe.summary?.exactPrimaryKeys !== 2
    || probe.summary?.refreshRoutinesPresent !== 3
    || probe.summary?.recomputeFunctionsPresent !== 0
    || probe.summary?.ratioTriggersPresent !== 0
    || asCount(probe.summary?.waitingLocks, 'preflight waiting locks') !== 0) {
    throw new Error('Stage 1 preflight topology or lock state differs from the approved plan.');
  }
  const adsMismatchRows = [...plannedTables.values()].reduce((sum, table) => {
    const observed = impactMismatchRows(probe, table.table);
    if (observed !== table.mismatchRows) {
      throw new Error(`${table.table} drift changed after the approved repair plan.`);
    }
    const canaryRows = dailyMismatchRows(probe, table.table, plan.execution.canary.date);
    if (canaryRows !== plan.execution.canary.mismatchRowsByTable[table.table]) {
      throw new Error(`${table.table} canary drift changed after the approved repair plan.`);
    }
    return sum + observed;
  }, 0);
  if (adsMismatchRows !== plan.observed.adsMismatchRows
    || asCount(probe.summary.odsMismatchRows, 'preflight ODS mismatches') !== plan.observed.odsMismatchRows) {
    throw new Error('Stage 1 preflight mismatch totals differ from the approved plan.');
  }
  assertCleanParity(probe.parity, 'Stage 1 preflight ODS-to-ADS parity');
  return probe;
}

function assertBackupTableShape(row) {
  const columnTypes = row?.column_types ?? {};
  const exactColumns = Object.keys(columnTypes).length === Object.keys(EXPECTED_BACKUP_COLUMN_TYPES).length
    && Object.entries(EXPECTED_BACKUP_COLUMN_TYPES).every(([column, type]) => (
      columnTypes[column] === type
    ));
  if (asCount(row?.column_count, 'backup table column count') !== 8
    || !exactColumns
    || normalizedDefinition(row.primary_key) !== 'primary key (backup_run_id, source_table, row_key)') {
    throw new Error(`${QIANCHUAN_CARD_RATIO_BACKUP_TABLE} has an incompatible schema.`);
  }
}

function normalizeCanarySnapshot(rows) {
  return rows.map((row) => ({
    baseMetricMismatchRows: asCount(row.base_metric_mismatch_rows, 'canary base metric mismatches'),
    extraTargetRows: asCount(row.extra_target_rows, 'canary extra target rows'),
    formulaMismatchRows: asCount(row.formula_mismatch_rows, 'canary formula mismatches'),
    missingTargetRows: asCount(row.missing_target_rows, 'canary missing target rows'),
    sourceRows: asCount(row.source_rows, 'canary source rows'),
    tableName: row.table_name,
    targetRows: asCount(row.target_rows, 'canary target rows'),
  }));
}

function assertCanarySnapshot(snapshot, expectedMismatchByTable, label) {
  const byTable = indexBy(snapshot, 'tableName');
  for (const [tableName, expectedMismatchRows] of Object.entries(expectedMismatchByTable)) {
    const row = byTable.get(tableName);
    if (!row || row.sourceRows !== row.targetRows || row.missingTargetRows !== 0
      || row.extraTargetRows !== 0 || row.baseMetricMismatchRows !== 0
      || row.formulaMismatchRows !== expectedMismatchRows) {
      throw new Error(`${label} failed for ${tableName}.`);
    }
  }
}

function assertGuardCatalog(row, expected, label) {
  if (asCount(row?.functions_present, `${label} functions`) !== expected
    || asCount(row?.enabled_triggers_present, `${label} triggers`) !== expected) {
    throw new Error(`${label} expected ${expected} functions and enabled triggers.`);
  }
}

export function assertQianchuanCardRatioStage1Postcheck(probe, plan) {
  const plannedTables = expectedTablePlans(plan);
  if (probe.summary?.relationsPresent !== 4
    || probe.summary?.exactPrimaryKeys !== 2
    || probe.summary?.refreshRoutinesPresent !== 3
    || probe.summary?.recomputeFunctionsPresent !== 2
    || probe.summary?.ratioTriggersPresent !== 2
    || asCount(probe.summary?.waitingLocks, 'postcheck waiting locks') !== 0) {
    throw new Error('Stage 1 postcheck topology or lock state is incomplete.');
  }
  const maximumRemainingMismatchRows = plan.observed.adsMismatchRows
    - plan.execution.canary.mismatchRows;
  if (asCount(probe.summary.adsMismatchRows, 'postcheck ADS mismatches')
      > maximumRemainingMismatchRows) {
    throw new Error('Stage 1 postcheck did not remove the approved canary drift.');
  }
  for (const table of plannedTables.values()) {
    if (dailyMismatchRows(probe, table.table, plan.execution.canary.date) !== 0) {
      throw new Error(`${table.table} still has formula drift on the Stage 1 canary date.`);
    }
  }
  assertCleanParity(probe.parity, 'Stage 1 postcheck ODS-to-ADS parity');
  return probe;
}

export async function runQianchuanCardRatioStage1({
  backupRunId,
  client,
  git,
  migrationArtifact,
  migrationSha256,
  migrationSql,
  now = () => new Date(),
  onEvent = () => {},
  plan,
  planArtifact,
  planSha256,
  readonlyInputs,
  runReadonlyProbe = runQianchuanCardRatioReadonlyProbe,
}) {
  validateQianchuanCardRatioRepairPlan(plan);
  assertPinnedMigrationReviewArtifact(planArtifact, planSha256, 'Card-ratio repair plan');
  assertPinnedMigrationReviewArtifact(migrationArtifact, migrationSha256, 'Card-ratio Stage 1 migration');
  const migrationSource = validateQianchuanCardRatioStage1MigrationSql(migrationSql);
  if (migrationSource.sha256 !== migrationArtifact.sha256) {
    throw new Error('Card-ratio Stage 1 migration content differs from its pinned artifact.');
  }
  if (!/^qcr-\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(backupRunId ?? '')) {
    throw new Error('backupRunId must use qcr-YYYYMMDDTHHMMSSZ-xxxxxxxx.');
  }

  const preflight = assertQianchuanCardRatioStage1Preflight(
    await runReadonlyProbe({ ...readonlyInputs, client }),
    plan,
  );
  onEvent({ at: now().toISOString(), stage: 'preflight_passed' });

  let transactionStarted = false;
  let committed = false;
  let beforeCanary;
  let afterCanary;
  const plannedTables = expectedTablePlans(plan);
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    transactionStarted = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      QIANCHUAN_CARD_RATIO_STAGE1_ADVISORY_LOCK,
    ]);

    const guardBefore = (await client.query(STAGE1_GUARD_CATALOG_SQL)).rows[0];
    assertGuardCatalog(guardBefore, 0, 'Stage 1 pre-write guard catalog');

    await client.query(STAGE1_BACKUP_TABLE_SQL);
    const backupShape = (await client.query(STAGE1_BACKUP_TABLE_SHAPE_SQL, [
      QIANCHUAN_CARD_RATIO_BACKUP_TABLE,
    ])).rows[0];
    assertBackupTableShape(backupShape);
    const existingRunRows = asCount(
      (await client.query(STAGE1_EXISTING_BACKUP_RUN_SQL, [backupRunId])).rows[0]?.rows,
      'existing backup run rows',
    );
    if (existingRunRows !== 0) throw new Error(`Backup run ${backupRunId} already exists.`);

    const mainBackup = await client.query(STAGE1_MAIN_BACKUP_SQL, [
      backupRunId,
      plan.sourceArtifact.sha256,
    ]);
    const detailBackup = await client.query(STAGE1_DETAIL_BACKUP_SQL, [
      backupRunId,
      plan.sourceArtifact.sha256,
    ]);
    if (mainBackup.rowCount !== plannedTables.get('ads.douyin_trade_sale_card').mismatchRows
      || detailBackup.rowCount
        !== plannedTables.get('ads.douyin_trade_sale_card_detail').mismatchRows) {
      throw new Error('Atomic backup row counts differ from the approved repair plan.');
    }
    const backupCounts = (await client.query(STAGE1_BACKUP_COUNTS_SQL, [backupRunId])).rows;
    const backupCountByTable = indexBy(backupCounts, 'source_table');
    for (const table of plannedTables.values()) {
      if (asCount(backupCountByTable.get(table.table)?.rows, `${table.table} backup rows`)
          !== table.mismatchRows) {
        throw new Error(`${table.table} backup verification failed.`);
      }
    }
    onEvent({
      at: now().toISOString(),
      rows: mainBackup.rowCount + detailBackup.rowCount,
      stage: 'backup_verified_in_transaction',
    });

    beforeCanary = normalizeCanarySnapshot((await client.query(
      STAGE1_CANARY_SNAPSHOT_SQL,
      [plan.execution.canary.date],
    )).rows);
    assertCanarySnapshot(
      beforeCanary,
      plan.execution.canary.mismatchRowsByTable,
      'Stage 1 pre-canary snapshot',
    );

    await client.query(migrationSql);
    assertGuardCatalog(
      (await client.query(STAGE1_GUARD_CATALOG_SQL)).rows[0],
      2,
      'Stage 1 post-DDL guard catalog',
    );
    onEvent({ at: now().toISOString(), stage: 'forward_guard_verified_in_transaction' });

    await client.query(STAGE1_CALL_MAIN_REFRESH_SQL, [plan.execution.canary.date]);
    await client.query(STAGE1_CALL_DETAIL_REFRESH_SQL, [plan.execution.canary.date]);
    afterCanary = normalizeCanarySnapshot((await client.query(
      STAGE1_CANARY_SNAPSHOT_SQL,
      [plan.execution.canary.date],
    )).rows);
    assertCanarySnapshot(afterCanary, {
      'ads.douyin_trade_sale_card': 0,
      'ads.douyin_trade_sale_card_detail': 0,
    }, 'Stage 1 post-canary snapshot');
    for (const before of beforeCanary) {
      const after = afterCanary.find((row) => row.tableName === before.tableName);
      if (!after || before.sourceRows !== after.sourceRows || before.targetRows !== after.targetRows) {
        throw new Error(`${before.tableName} canary row count changed during refresh.`);
      }
    }

    await client.query('COMMIT');
    committed = true;
    transactionStarted = false;
    onEvent({ at: now().toISOString(), stage: 'atomic_stage1_committed' });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    const stage1Error = error instanceof Error ? error : new Error(String(error));
    stage1Error.stage1Committed = committed;
    throw stage1Error;
  }

  let postcheck;
  try {
    postcheck = assertQianchuanCardRatioStage1Postcheck(
      await runReadonlyProbe({ ...readonlyInputs, client }),
      plan,
    );
  } catch (error) {
    const postcheckError = error instanceof Error ? error : new Error(String(error));
    postcheckError.stage1Committed = true;
    throw postcheckError;
  }
  onEvent({ at: now().toISOString(), stage: 'postcheck_passed' });

  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    mode: 'live_write_card_ratio_stage1_canary',
    status: 'succeeded',
    target: { ...plan.target },
    sourceArtifacts: {
      plan: planArtifact,
      readinessProbe: plan.sourceArtifact,
      migration: {
        ...migrationArtifact,
        identity: QIANCHUAN_CARD_RATIO_STAGE1_MIGRATION.identity,
        relativePath: QIANCHUAN_CARD_RATIO_STAGE1_MIGRATION.relativePath,
      },
    },
    git,
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
      runId: backupRunId,
      table: QIANCHUAN_CARD_RATIO_BACKUP_TABLE,
      rows: plan.execution.backup.estimatedRows,
      sourceProbeSha256: plan.sourceArtifact.sha256,
    },
    guard: {
      functionsPresent: 2,
      enabledTriggersPresent: 2,
      migrationSha256: migrationSource.sha256,
    },
    canary: {
      date: plan.execution.canary.date,
      plannedMismatchRows: plan.execution.canary.mismatchRows,
      before: beforeCanary,
      after: afterCanary,
    },
    preflight: {
      generatedAt: preflight.generatedAt,
      adsMismatchRows: preflight.summary.adsMismatchRows,
      odsMismatchRows: preflight.summary.odsMismatchRows,
      waitingLocks: preflight.summary.waitingLocks,
    },
    postcheck: {
      generatedAt: postcheck.generatedAt,
      adsMismatchRows: postcheck.summary.adsMismatchRows,
      odsMismatchRows: postcheck.summary.odsMismatchRows,
      waitingLocks: postcheck.summary.waitingLocks,
    },
  };
}

export function validateQianchuanCardRatioStage1Result(result) {
  if (result?.schemaVersion !== 1
    || result.mode !== 'live_write_card_ratio_stage1_canary'
    || result.status !== 'succeeded'
    || result.policy?.transaction !== 'atomic repeatable-read backup + DDL guard + canary'
    || result.policy?.productionWritesAuthorized !== true
    || result.policy?.repairExecutionAuthorized !== true
    || result.policy?.backupCreated !== true
    || result.policy?.forwardGuardApplied !== true
    || result.policy?.canaryCommitted !== true
    || result.policy?.fullBackfillExecuted !== false
    || result.policy?.ledgerWritten !== false
    || result.policy?.deployAuthorized !== false
    || result.policy?.arkInvoked !== false
    || result.guard?.functionsPresent !== 2
    || result.guard?.enabledTriggersPresent !== 2
    || result.canary?.plannedMismatchRows !== 5) {
    throw new Error('Card-ratio Stage 1 execution result is invalid.');
  }
  return result;
}
