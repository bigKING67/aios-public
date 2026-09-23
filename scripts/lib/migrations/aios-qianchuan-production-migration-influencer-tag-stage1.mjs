import { createHash } from 'node:crypto';

import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';
import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
} from './aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs';
import {
  validateQianchuanInfluencerTagForwardFunctionSql,
  validateQianchuanInfluencerTagRepairPlan,
} from './aios-qianchuan-production-migration-influencer-tag-repair-plan.mjs';
import {
  runQianchuanInfluencerTagReadonlyProbe,
  validateQianchuanInfluencerTagReadonlyProbe,
} from './aios-qianchuan-production-migration-influencer-tag-readonly-probe.mjs';
import {
  QIANCHUAN_INFLUENCER_TAG_STAGE1_ADVISORY_LOCK,
  QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE,
  STAGE1_BACKUP_ROWS_SQL,
  STAGE1_BACKUP_TABLE_SHAPE_SQL,
  STAGE1_BACKUP_TABLE_SQL,
  STAGE1_CANARY_UPDATE_SQL,
  STAGE1_EXACT_BACKUP_SQL,
  STAGE1_EXISTING_BACKUP_RUN_SQL,
  STAGE1_FUNCTION_CATALOG_SQL,
  STAGE1_POSTCHECK_CANARY_SQL,
  STAGE1_POSTCHECK_IMPACT_ROWS_SQL,
  STAGE1_POSTCHECK_SUMMARY_SQL,
} from './aios-qianchuan-production-migration-influencer-tag-stage1-sql.mjs';

const EXPECTED_BACKUP_COLUMN_TYPES = Object.freeze({
  repair_run_id: 'text',
  backed_up_at: 'timestamptz',
  id: 'int8',
  source_xmin: 'text',
  source_updated_at: 'timestamp',
  tags: '_text',
  anchor_desc: 'text',
  before_sha256: 'text',
  expected_sha256: 'text',
});

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Json(value) {
  return sha256(JSON.stringify(value));
}

function normalizedDefinition(value) {
  return String(value ?? '')
    .replaceAll('"', '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractFunctionBody(sql) {
  const match = /\bAS\s+\$([a-z0-9_]*)\$([\s\S]*?)\$\1\$\s*;/i.exec(sql ?? '');
  if (!match) throw new Error('Influencer-tag function body cannot be identified.');
  return match[2].replace(/\s+/g, ' ').trim();
}

function extractFunctionComment(sql) {
  const match = /COMMENT\s+ON\s+FUNCTION\s+ads\.fn_influencer_library_normalize_anchor_tag\s*\(\s*TEXT\s*\)\s+IS\s+'((?:''|[^'])*)'\s*;/i.exec(sql ?? '');
  if (!match) throw new Error('Influencer-tag function comment cannot be identified.');
  return match[1].replaceAll("''", "'");
}

function normalizePlanChange(row) {
  return {
    id: row.id,
    sourceRowVersion: row.sourceRowVersion,
    sourceUpdatedAt: row.sourceUpdatedAt,
    before: row.before,
    expected: row.expected,
    beforeSha256: row.beforeSha256,
    expectedSha256: row.expectedSha256,
  };
}

function normalizeProbeChange(row) {
  return {
    id: row.id,
    sourceRowVersion: row.rowVersion,
    sourceUpdatedAt: row.updatedAt,
    before: row.before,
    expected: row.expected,
    beforeSha256: row.beforeSha256,
    expectedSha256: row.expectedSha256,
  };
}

function normalizeBackupRows(rows) {
  return rows.map((row) => ({
    id: String(row.id),
    sourceRowVersion: String(row.source_xmin),
    sourceUpdatedAt: String(row.source_updated_at),
    before: {
      tags: row.tags,
      anchorDesc: row.anchor_desc,
    },
    beforeSha256: row.before_sha256,
    expectedSha256: row.expected_sha256,
  }));
}

function impactEvidence(row) {
  const before = { tags: row.before_tags, anchorDesc: row.before_anchor_desc };
  const expected = { tags: row.expected_tags, anchorDesc: row.expected_anchor_desc };
  return {
    id: row.id,
    sourceRowVersion: row.row_version,
    sourceUpdatedAt: row.updated_at,
    before,
    expected,
    beforeSha256: sha256Json(before),
    expectedSha256: sha256Json(expected),
  };
}

export function assertQianchuanInfluencerTagStage1Authorization({ env, confirmed }) {
  if (confirmed !== true
    || env.AIOS_QC_ALLOW_LIVE_WRITE !== '1'
    || env.AIOS_QC_INFLUENCER_TAG_WRITE_ACK !== 'stage1') {
    throw new Error('Influencer-tag Stage 1 requires --confirm-stage1, AIOS_QC_ALLOW_LIVE_WRITE=1, and AIOS_QC_INFLUENCER_TAG_WRITE_ACK=stage1.');
  }
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required for influencer-tag Stage 1 production execution.');
  }
  return {
    connectionString: env.DATABASE_URL.trim(),
    expectedGitSha: env.AIOS_QC_EXPECTED_GIT_SHA?.trim() ?? '',
  };
}

export function assertQianchuanInfluencerTagStage1GitState({
  branch,
  expectedGitSha,
  head,
  originMain,
  status,
}) {
  if (branch !== 'main') throw new Error('Influencer-tag Stage 1 production execution requires branch main.');
  if (!/^[a-f0-9]{40}$/.test(expectedGitSha ?? '')) {
    throw new Error('AIOS_QC_EXPECTED_GIT_SHA must be an explicit 40-character SHA.');
  }
  if (head !== expectedGitSha || originMain !== expectedGitSha) {
    throw new Error('Influencer-tag Stage 1 requires HEAD, origin/main, and the explicit expected SHA to match.');
  }
  if (String(status ?? '').trim()) {
    throw new Error('Influencer-tag Stage 1 refuses a dirty Git worktree. Commit and push the scoped repair first.');
  }
  return true;
}

export function validateQianchuanInfluencerTagInstalledFunctionCatalog(
  row,
  functionSql = QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
) {
  const definition = row?.definition;
  if (row?.oid == null || row.routine_kind !== 'f'
    || typeof definition !== 'string' || Buffer.byteLength(definition) < 500
    || row.description !== extractFunctionComment(functionSql)
    || extractFunctionBody(definition) !== extractFunctionBody(functionSql)) {
    throw new Error('Influencer-tag normalize function catalog definition is incomplete or changed.');
  }
  const normalized = normalizedDefinition(definition);
  for (const token of [
    'create or replace function ads.fn_influencer_library_normalize_anchor_tag(p_raw text)',
    'returns text',
    'language plpgsql',
    'immutable',
  ]) {
    if (!normalized.includes(token)) {
      throw new Error(`Influencer-tag installed function is missing ${token}.`);
    }
  }
  return {
    definitionBytes: Buffer.byteLength(definition),
    definitionSha256: sha256(definition),
  };
}

export function assertQianchuanInfluencerTagStage1Preflight(probe, plan) {
  validateQianchuanInfluencerTagReadonlyProbe(probe);
  const observed = probe.summary;
  const plannedChanges = plan.execution.changes.map(normalizePlanChange);
  const freshChanges = probe.impactRows.map(normalizeProbeChange);
  if (probe.target?.identity !== plan.target?.identity
    || probe.target?.checksum !== plan.target?.checksum
    || observed.activeRows !== plan.observed.activeRows
    || observed.rowsWithNormalizedTags !== plan.observed.rowsWithNormalizedTags
    || observed.mismatchRows !== plan.observed.mismatchRows
    || observed.tagsOnlyMismatchRows !== plan.observed.mismatchBreakdown.tagsOnly
    || observed.anchorDescOnlyMismatchRows !== plan.observed.mismatchBreakdown.anchorDescOnly
    || observed.bothMismatchRows !== plan.observed.mismatchBreakdown.both
    || observed.estimatedBackupBytes !== plan.observed.estimatedBackupBytes
    || observed.waitingLocks !== 0
    || observed.normalizeFunctionPresent !== false
    || JSON.stringify(freshChanges) !== JSON.stringify(plannedChanges)) {
    throw new Error('Influencer-tag Stage 1 preflight differs from the pinned repair plan.');
  }
  return probe;
}

function assertFunctionAbsent(row) {
  if (row?.oid != null || row?.definition != null || row?.description != null) {
    throw new Error('Influencer-tag Stage 1 requires the normalize function to remain absent before backup.');
  }
}

function assertBackupTableShape(row) {
  const columnTypes = row?.column_types ?? {};
  const exactColumns = Object.keys(columnTypes).length === Object.keys(EXPECTED_BACKUP_COLUMN_TYPES).length
    && Object.entries(EXPECTED_BACKUP_COLUMN_TYPES).every(([column, type]) => (
      columnTypes[column] === type
    ));
  if (asCount(row?.column_count, 'backup table column count') !== 9
    || !exactColumns
    || normalizedDefinition(row.primary_key) !== 'primary key (repair_run_id, id)') {
    throw new Error(`${QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE} has an incompatible schema.`);
  }
}

export function validateQianchuanInfluencerTagBackupRows(rows, plan) {
  const normalized = normalizeBackupRows(rows);
  const expected = plan.execution.changes.map((row) => ({
    id: row.id,
    sourceRowVersion: row.sourceRowVersion,
    sourceUpdatedAt: row.sourceUpdatedAt,
    before: row.before,
    beforeSha256: row.beforeSha256,
    expectedSha256: row.expectedSha256,
  }));
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    throw new Error('Influencer-tag Stage 1 backup rows differ from the pinned repair plan.');
  }
  for (const row of normalized) {
    if (sha256Json(row.before) !== row.beforeSha256) {
      throw new Error(`Influencer-tag Stage 1 backup row ${row.id} hash verification failed.`);
    }
  }
  return {
    rows: normalized.length,
    rowsSha256: sha256Json(normalized),
  };
}

function assertCanaryUpdate(rows, canary) {
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== canary.id) {
    throw new Error('Influencer-tag Stage 1 canary update did not affect exactly the pinned row.');
  }
  const stored = { tags: rows[0].tags, anchorDesc: rows[0].anchor_desc };
  if (sha256Json(stored) !== canary.expectedSha256) {
    throw new Error('Influencer-tag Stage 1 canary stored values differ from expectedSha256.');
  }
  return {
    id: rows[0].id,
    postUpdateRowVersion: rows[0].row_version,
    postUpdateUpdatedAt: rows[0].updated_at,
    expectedSha256: canary.expectedSha256,
  };
}

async function runStage1Postcheck({
  client,
  functionCatalogEvidence,
  functionSql,
  plan,
  repairRunId,
}) {
  return withAiosReadOnlyTransaction(
    client,
    { statementTimeoutMs: plan.execution.batching.statementTimeoutMs },
    async () => {
      const functionCatalog = validateQianchuanInfluencerTagInstalledFunctionCatalog(
        (await client.query(STAGE1_FUNCTION_CATALOG_SQL)).rows[0],
        functionSql,
      );
      if (functionCatalog.definitionSha256 !== functionCatalogEvidence.definitionSha256) {
        throw new Error('Influencer-tag normalize function changed between commit and postcheck.');
      }

      const backupEvidence = validateQianchuanInfluencerTagBackupRows(
        (await client.query(STAGE1_BACKUP_ROWS_SQL, [repairRunId])).rows,
        plan,
      );
      const summary = (await client.query(STAGE1_POSTCHECK_SUMMARY_SQL)).rows[0] ?? {};
      const remainingChanges = (await client.query(STAGE1_POSTCHECK_IMPACT_ROWS_SQL)).rows
        .map(impactEvidence);
      const expectedRemaining = plan.execution.changes.slice(1).map(normalizePlanChange);
      const canaryRows = (await client.query(STAGE1_POSTCHECK_CANARY_SQL, [
        plan.execution.canary.id,
      ])).rows;
      const mismatchRows = asCount(summary.mismatch_rows, 'postcheck mismatch rows');
      const mismatchBreakdown = asCount(summary.tags_only_mismatch_rows, 'postcheck tags-only mismatch rows')
        + asCount(summary.anchor_desc_only_mismatch_rows, 'postcheck anchor-desc-only mismatch rows')
        + asCount(summary.both_mismatch_rows, 'postcheck both-field mismatch rows');
      if (asCount(summary.active_rows, 'postcheck active rows') !== plan.observed.activeRows
        || asCount(summary.waiting_locks, 'postcheck waiting locks') !== 0
        || mismatchRows !== plan.execution.batching.remainingRows
        || mismatchBreakdown !== mismatchRows
        || JSON.stringify(remainingChanges) !== JSON.stringify(expectedRemaining)) {
        throw new Error('Influencer-tag Stage 1 postcheck did not preserve the exact remaining repair boundary.');
      }
      if (canaryRows.length !== 1) {
        throw new Error('Influencer-tag Stage 1 postcheck cannot find the committed canary row.');
      }
      const canaryStored = {
        tags: canaryRows[0].tags,
        anchorDesc: canaryRows[0].anchor_desc,
      };
      if (canaryRows[0].id !== plan.execution.canary.id
        || sha256Json(canaryStored) !== plan.execution.canary.expectedSha256
        || remainingChanges.some((row) => row.id === plan.execution.canary.id)) {
        throw new Error('Influencer-tag Stage 1 postcheck canary evidence is invalid.');
      }
      return {
        activeRows: asCount(summary.active_rows, 'postcheck active rows'),
        backupRows: backupEvidence.rows,
        backupRowsSha256: backupEvidence.rowsSha256,
        canaryPostUpdateRowVersion: canaryRows[0].row_version,
        canaryPostUpdateUpdatedAt: canaryRows[0].updated_at,
        functionCatalogDefinitionSha256: functionCatalog.definitionSha256,
        remainingIdsSha256: sha256Json(remainingChanges.map((row) => row.id)),
        remainingMismatchRows: mismatchRows,
        waitingLocks: 0,
      };
    },
  );
}

export async function runQianchuanInfluencerTagStage1({
  client,
  functionSql = QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
  git,
  now = () => new Date(),
  onEvent = () => {},
  plan,
  planArtifact,
  planSha256,
  readonlyInputs,
  repairRunId,
  runReadonlyProbe = runQianchuanInfluencerTagReadonlyProbe,
}) {
  validateQianchuanInfluencerTagRepairPlan(plan);
  assertPinnedMigrationReviewArtifact(planArtifact, planSha256, 'Influencer-tag repair plan');
  const functionSource = validateQianchuanInfluencerTagForwardFunctionSql(functionSql);
  if (functionSource.sha256 !== plan.execution.forwardFunction.definitionSha256) {
    throw new Error('Influencer-tag Stage 1 function source differs from the pinned repair plan.');
  }
  if (!/^qit-\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(repairRunId ?? '')) {
    throw new Error('repairRunId must use qit-YYYYMMDDTHHMMSSZ-xxxxxxxx.');
  }

  const preflight = assertQianchuanInfluencerTagStage1Preflight(
    await runReadonlyProbe({ ...readonlyInputs, client }),
    plan,
  );
  onEvent({ at: now().toISOString(), stage: 'preflight_passed' });

  let transactionStarted = false;
  let committed = false;
  let backupEvidence;
  let canaryEvidence;
  let functionCatalogEvidence;
  const canary = plan.execution.changes[0];
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    transactionStarted = true;
    await client.query(`SET LOCAL lock_timeout = '${plan.execution.batching.lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${plan.execution.batching.statementTimeoutMs}ms'`);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      QIANCHUAN_INFLUENCER_TAG_STAGE1_ADVISORY_LOCK,
    ]);

    assertFunctionAbsent((await client.query(STAGE1_FUNCTION_CATALOG_SQL)).rows[0]);
    await client.query(STAGE1_BACKUP_TABLE_SQL);
    assertBackupTableShape((await client.query(STAGE1_BACKUP_TABLE_SHAPE_SQL, [
      QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE,
    ])).rows[0]);
    const existingRows = asCount(
      (await client.query(STAGE1_EXISTING_BACKUP_RUN_SQL, [repairRunId])).rows[0]?.rows,
      'existing repair run rows',
    );
    if (existingRows !== 0) throw new Error(`Repair run ${repairRunId} already exists.`);

    const backupInsert = await client.query(STAGE1_EXACT_BACKUP_SQL, [
      repairRunId,
      JSON.stringify(plan.execution.changes),
    ]);
    if (backupInsert.rowCount !== plan.execution.backup.estimatedRows) {
      throw new Error('Influencer-tag Stage 1 exact backup row count differs from the pinned plan.');
    }
    backupEvidence = validateQianchuanInfluencerTagBackupRows(
      (await client.query(STAGE1_BACKUP_ROWS_SQL, [repairRunId])).rows,
      plan,
    );
    onEvent({
      at: now().toISOString(),
      rows: backupEvidence.rows,
      stage: 'backup_verified_in_transaction',
    });

    await client.query(functionSql);
    functionCatalogEvidence = validateQianchuanInfluencerTagInstalledFunctionCatalog(
      (await client.query(STAGE1_FUNCTION_CATALOG_SQL)).rows[0],
      functionSql,
    );
    onEvent({ at: now().toISOString(), stage: 'forward_function_verified_in_transaction' });

    const canaryUpdate = await client.query(STAGE1_CANARY_UPDATE_SQL, [
      JSON.stringify(canary),
    ]);
    canaryEvidence = assertCanaryUpdate(canaryUpdate.rows, canary);
    if (canaryUpdate.rowCount !== 1) {
      throw new Error('Influencer-tag Stage 1 canary row count is not exactly one.');
    }
    onEvent({ at: now().toISOString(), stage: 'canary_verified_in_transaction' });

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
    postcheck = await runStage1Postcheck({
      client,
      functionCatalogEvidence,
      functionSql,
      plan,
      repairRunId,
    });
  } catch (error) {
    const postcheckError = error instanceof Error ? error : new Error(String(error));
    postcheckError.stage1Committed = true;
    throw postcheckError;
  }
  onEvent({ at: now().toISOString(), stage: 'postcheck_passed' });

  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    mode: 'live_write_influencer_tag_stage1_canary',
    status: 'succeeded',
    target: { ...plan.target },
    sourceArtifacts: {
      plan: planArtifact,
      readinessProbe: plan.sourceArtifact,
    },
    git,
    policy: {
      transaction: 'atomic repeatable-read exact backup + forward function + one-row canary',
      productionWritesAuthorized: true,
      repairExecutionAuthorized: true,
      backupCreated: true,
      forwardFunctionApplied: true,
      canaryCommitted: true,
      fullBackfillExecuted: false,
      ledgerWritten: false,
      ownerDecisionRecorded: false,
      deployAuthorized: false,
      arkInvoked: false,
    },
    backup: {
      runId: repairRunId,
      table: QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE,
      rows: backupEvidence.rows,
      rowsSha256: backupEvidence.rowsSha256,
      sourceProbeSha256: plan.sourceArtifact.sha256,
    },
    forwardFunction: {
      signature: plan.execution.forwardFunction.signature,
      sourceBytes: functionSource.bytes,
      sourceSha256: functionSource.sha256,
      catalogDefinitionBytes: functionCatalogEvidence.definitionBytes,
      catalogDefinitionSha256: functionCatalogEvidence.definitionSha256,
    },
    canary: canaryEvidence,
    preflight: {
      generatedAt: preflight.generatedAt,
      activeRows: preflight.summary.activeRows,
      mismatchRows: preflight.summary.mismatchRows,
      waitingLocks: preflight.summary.waitingLocks,
    },
    postcheck,
  };
}

export function validateQianchuanInfluencerTagStage1Result(result) {
  if (result?.schemaVersion !== 1
    || result.mode !== 'live_write_influencer_tag_stage1_canary'
    || result.status !== 'succeeded'
    || result.policy?.transaction !== 'atomic repeatable-read exact backup + forward function + one-row canary'
    || result.policy?.productionWritesAuthorized !== true
    || result.policy?.repairExecutionAuthorized !== true
    || result.policy?.backupCreated !== true
    || result.policy?.forwardFunctionApplied !== true
    || result.policy?.canaryCommitted !== true
    || result.policy?.fullBackfillExecuted !== false
    || result.policy?.ledgerWritten !== false
    || result.policy?.ownerDecisionRecorded !== false
    || result.policy?.deployAuthorized !== false
    || result.policy?.arkInvoked !== false
    || !/^[a-f0-9]{64}$/.test(result.backup?.rowsSha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(result.forwardFunction?.sourceSha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(result.forwardFunction?.catalogDefinitionSha256 ?? '')
    || result.forwardFunction.catalogDefinitionSha256
      !== result.postcheck?.functionCatalogDefinitionSha256
    || result.backup?.rows !== result.preflight?.mismatchRows
    || result.backup?.rows !== result.postcheck?.backupRows
    || result.postcheck?.remainingMismatchRows !== result.backup.rows - 1
    || result.canary?.id == null
    || result.postcheck?.waitingLocks !== 0) {
    throw new Error('Influencer-tag Stage 1 execution result is invalid.');
  }
  return result;
}
