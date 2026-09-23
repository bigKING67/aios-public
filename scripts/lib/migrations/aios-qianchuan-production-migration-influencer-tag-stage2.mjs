import { createHash } from 'node:crypto';

import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';
import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { validateQianchuanInfluencerTagRepairPlan } from './aios-qianchuan-production-migration-influencer-tag-repair-plan.mjs';
import {
  QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE,
  STAGE1_BACKUP_ROWS_SQL,
  STAGE1_FUNCTION_CATALOG_SQL,
  STAGE1_POSTCHECK_IMPACT_ROWS_SQL,
  STAGE1_POSTCHECK_SUMMARY_SQL,
} from './aios-qianchuan-production-migration-influencer-tag-stage1-sql.mjs';
import {
  validateQianchuanInfluencerTagBackupRows,
  validateQianchuanInfluencerTagInstalledFunctionCatalog,
  validateQianchuanInfluencerTagStage1Result,
} from './aios-qianchuan-production-migration-influencer-tag-stage1.mjs';
import {
  QIANCHUAN_INFLUENCER_TAG_STAGE2_ADVISORY_LOCK,
  STAGE2_BATCH_UPDATE_SQL,
  STAGE2_CURRENT_PLANNED_ROWS_SQL,
} from './aios-qianchuan-production-migration-influencer-tag-stage2-sql.mjs';

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sameArtifact(left, right) {
  return left?.path === right?.path
    && left?.bytes === right?.bytes
    && left?.sha256 === right?.sha256;
}

function compareIds(left, right) {
  const leftId = BigInt(left.id);
  const rightId = BigInt(right.id);
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  return 0;
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

function normalizeImpactRow(row) {
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

function normalizeCompletedEvidence(row) {
  return {
    id: row.id,
    postUpdateRowVersion: row.postUpdateRowVersion,
    postUpdateUpdatedAt: row.postUpdateUpdatedAt,
    expectedSha256: row.expectedSha256,
  };
}

function stage1CanaryEvidence(stage1) {
  return {
    id: stage1.canary.id,
    postUpdateRowVersion: stage1.postcheck.canaryPostUpdateRowVersion,
    postUpdateUpdatedAt: stage1.postcheck.canaryPostUpdateUpdatedAt,
    expectedSha256: stage1.canary.expectedSha256,
  };
}

function assertEvidenceRow(row, label) {
  if (!/^\d+$/.test(row?.id ?? '')
    || !/^\d+$/.test(row?.postUpdateRowVersion ?? '')
    || typeof row?.postUpdateUpdatedAt !== 'string' || !row.postUpdateUpdatedAt
    || !/^[a-f0-9]{64}$/.test(row?.expectedSha256 ?? '')) {
    throw new Error(`${label} is invalid.`);
  }
  return row;
}

function assertCompletedRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error('Influencer-tag Stage 2 completedRows must contain the canary and one real batch row.');
  }
  let previousId = null;
  for (const row of rows) {
    assertEvidenceRow(row, 'Influencer-tag Stage 2 completed row evidence');
    const id = BigInt(row.id);
    if (previousId != null && id <= previousId) {
      throw new Error('Influencer-tag Stage 2 completed row identities must be strictly increasing.');
    }
    previousId = id;
  }
  return rows;
}

function assertCheckpointSources({ checkpoint, plan, planArtifact, stage1, stage1Artifact }) {
  if (!sameArtifact(checkpoint.sourceArtifacts?.plan, planArtifact)
    || !sameArtifact(checkpoint.sourceArtifacts?.stage1, stage1Artifact)
    || checkpoint.target?.identity !== plan.target.identity
    || checkpoint.target?.checksum !== plan.target.checksum
    || checkpoint.backupRunId !== stage1.backup.runId
    || checkpoint.initialRemainingRows !== plan.execution.batching.remainingRows
    || checkpoint.forwardFunctionSourceSha256 !== plan.execution.forwardFunction.definitionSha256) {
    throw new Error('Influencer-tag Stage 2 checkpoint source boundary differs from the pinned inputs.');
  }
  const expectedRows = plan.execution.changes
    .slice(0, checkpoint.cumulativeUpdatedRows + 1);
  if (checkpoint.completedRows.length !== expectedRows.length) {
    throw new Error('Influencer-tag Stage 2 checkpoint completed-row count is inconsistent.');
  }
  for (let index = 0; index < expectedRows.length; index += 1) {
    const actual = checkpoint.completedRows[index];
    const expected = expectedRows[index];
    if (actual.id !== expected.id || actual.expectedSha256 !== expected.expectedSha256) {
      throw new Error('Influencer-tag Stage 2 checkpoint completed-row identity drifted.');
    }
  }
  if (JSON.stringify(checkpoint.completedRows[0]) !== JSON.stringify(stage1CanaryEvidence(stage1))) {
    throw new Error('Influencer-tag Stage 2 checkpoint canary evidence differs from Stage 1.');
  }
}

function resolveExecutionState({ checkpoint, checkpointArtifact, plan, planArtifact, stage1, stage1Artifact }) {
  if (!checkpoint) {
    if (checkpointArtifact) throw new Error('Influencer-tag Stage 2 checkpoint metadata requires checkpoint data.');
    if (plan.execution.batching.remainingRows < 1) {
      throw new Error('Influencer-tag repair plan has no Stage 2 rows after the canary.');
    }
    return {
      batchNumber: 1,
      completedRows: [stage1CanaryEvidence(stage1)],
      cumulativeUpdatedRows: 0,
      previousCheckpoint: null,
      remainingChanges: plan.execution.changes.slice(1),
    };
  }
  validateQianchuanInfluencerTagStage2Checkpoint(checkpoint);
  assertCheckpointSources({ checkpoint, plan, planArtifact, stage1, stage1Artifact });
  if (checkpoint.status === 'completed') {
    throw new Error('Influencer-tag Stage 2 checkpoint is already completed.');
  }
  if (!checkpointArtifact) throw new Error('Influencer-tag Stage 2 checkpoint metadata is required.');
  return {
    batchNumber: checkpoint.batchNumber + 1,
    completedRows: checkpoint.completedRows.map(normalizeCompletedEvidence),
    cumulativeUpdatedRows: checkpoint.cumulativeUpdatedRows,
    previousCheckpoint: checkpointArtifact,
    remainingChanges: plan.execution.changes.slice(checkpoint.cumulativeUpdatedRows + 1),
  };
}

function assertCurrentRows(rows, plan, completedRows, remainingChanges) {
  if (!Array.isArray(rows) || rows.length !== plan.execution.changes.length) {
    throw new Error('Influencer-tag Stage 2 cannot read every pinned plan row.');
  }
  const completedById = new Map(completedRows.map((row) => [row.id, row]));
  const remainingById = new Map(remainingChanges.map((row) => [row.id, row]));
  for (const row of rows) {
    const current = { tags: row.current_tags, anchorDesc: row.current_anchor_desc };
    if (row.current_id !== row.planned_id || row.is_deleted !== false) {
      throw new Error(`Influencer-tag Stage 2 planned row ${row.planned_id} is absent or deleted.`);
    }
    const completed = completedById.get(row.planned_id);
    if (completed) {
      if (row.current_xmin !== completed.postUpdateRowVersion
        || row.current_updated_at !== completed.postUpdateUpdatedAt
        || sha256Json(current) !== completed.expectedSha256) {
        throw new Error(`Influencer-tag Stage 2 completed row ${row.planned_id} changed after commit.`);
      }
      continue;
    }
    const planned = remainingById.get(row.planned_id);
    if (!planned
      || row.current_xmin !== planned.sourceRowVersion
      || row.current_updated_at !== planned.sourceUpdatedAt
      || sha256Json(current) !== planned.beforeSha256) {
      throw new Error(`Influencer-tag Stage 2 pending row ${row.planned_id} guard drifted.`);
    }
  }
}

function assertMismatchBoundary(rows, remainingChanges) {
  const actual = rows.map(normalizeImpactRow);
  const expected = remainingChanges.map(normalizePlanChange);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Influencer-tag Stage 2 mismatch rows differ from the expected checkpoint boundary.');
  }
}

async function inspectStage2State({ client, completedRows, functionSha256, plan, repairRunId, remainingChanges }) {
  const functionCatalog = validateQianchuanInfluencerTagInstalledFunctionCatalog(
    (await client.query(STAGE1_FUNCTION_CATALOG_SQL)).rows[0],
  );
  if (functionCatalog.definitionSha256 !== functionSha256) {
    throw new Error('Influencer-tag normalize function differs from the pinned Stage 1 definition.');
  }
  const backup = validateQianchuanInfluencerTagBackupRows(
    (await client.query(STAGE1_BACKUP_ROWS_SQL, [repairRunId])).rows,
    plan,
  );
  const summary = (await client.query(STAGE1_POSTCHECK_SUMMARY_SQL)).rows[0] ?? {};
  const mismatchRows = (await client.query(STAGE1_POSTCHECK_IMPACT_ROWS_SQL)).rows;
  const currentRows = (await client.query(
    STAGE2_CURRENT_PLANNED_ROWS_SQL,
    [JSON.stringify(plan.execution.changes)],
  )).rows;
  const mismatchCount = asCount(summary.mismatch_rows, 'Stage 2 mismatch rows');
  const mismatchBreakdown = asCount(summary.tags_only_mismatch_rows, 'Stage 2 tags-only rows')
    + asCount(summary.anchor_desc_only_mismatch_rows, 'Stage 2 anchor-desc-only rows')
    + asCount(summary.both_mismatch_rows, 'Stage 2 both-field rows');
  if (asCount(summary.active_rows, 'Stage 2 active rows') !== plan.observed.activeRows
    || asCount(summary.waiting_locks, 'Stage 2 waiting locks') !== 0
    || mismatchCount !== remainingChanges.length
    || mismatchBreakdown !== mismatchCount) {
    throw new Error('Influencer-tag Stage 2 summary differs from the expected checkpoint boundary.');
  }
  assertMismatchBoundary(mismatchRows, remainingChanges);
  assertCurrentRows(currentRows, plan, completedRows, remainingChanges);
  return {
    activeRows: plan.observed.activeRows,
    backupRows: backup.rows,
    backupRowsSha256: backup.rowsSha256,
    completedRowsSha256: sha256Json(completedRows),
    functionCatalogDefinitionSha256: functionCatalog.definitionSha256,
    remainingIdsSha256: sha256Json(remainingChanges.map((row) => row.id)),
    remainingMismatchRows: mismatchCount,
    waitingLocks: 0,
  };
}

async function inspectStage2StateReadOnly(input) {
  return withAiosReadOnlyTransaction(
    input.client,
    { statementTimeoutMs: input.plan.execution.batching.statementTimeoutMs },
    () => inspectStage2State(input),
  );
}

function validateUpdatedRows(rows, batchChanges) {
  const orderedRows = [...rows].sort(compareIds);
  if (orderedRows.length !== batchChanges.length) {
    throw new Error('Influencer-tag Stage 2 batch update missed one or more guarded rows.');
  }
  return orderedRows.map((row, index) => {
    const planned = batchChanges[index];
    const stored = { tags: row.tags, anchorDesc: row.anchor_desc };
    if (row.id !== planned.id || sha256Json(stored) !== planned.expectedSha256) {
      throw new Error('Influencer-tag Stage 2 stored batch values differ from the pinned plan.');
    }
    return {
      id: row.id,
      postUpdateRowVersion: row.row_version,
      postUpdateUpdatedAt: row.updated_at,
      expectedSha256: planned.expectedSha256,
    };
  });
}

export function assertQianchuanInfluencerTagStage2Authorization({ env, confirmed }) {
  if (confirmed !== true
    || env.AIOS_QC_ALLOW_LIVE_WRITE !== '1'
    || env.AIOS_QC_INFLUENCER_TAG_WRITE_ACK !== 'stage2-batch') {
    throw new Error('Influencer-tag Stage 2 requires --confirm-stage2-batch, AIOS_QC_ALLOW_LIVE_WRITE=1, and AIOS_QC_INFLUENCER_TAG_WRITE_ACK=stage2-batch.');
  }
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required for influencer-tag Stage 2 production execution.');
  }
  return {
    connectionString: env.DATABASE_URL.trim(),
    expectedGitSha: env.AIOS_QC_EXPECTED_GIT_SHA?.trim() ?? '',
  };
}

export function assertQianchuanInfluencerTagStage2GitState({
  branch,
  expectedGitSha,
  head,
  originMain,
  status,
}) {
  if (branch !== 'main') throw new Error('Influencer-tag Stage 2 production execution requires branch main.');
  if (!/^[a-f0-9]{40}$/.test(expectedGitSha ?? '')) {
    throw new Error('AIOS_QC_EXPECTED_GIT_SHA must be an explicit 40-character SHA.');
  }
  if (head !== expectedGitSha || originMain !== expectedGitSha) {
    throw new Error('Influencer-tag Stage 2 requires HEAD, origin/main, and the explicit expected SHA to match.');
  }
  if (String(status ?? '').trim()) {
    throw new Error('Influencer-tag Stage 2 refuses a dirty Git worktree. Commit and push the scoped repair first.');
  }
  return true;
}

export async function runQianchuanInfluencerTagStage2Batch({
  batchSize,
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
  stage1,
  stage1Artifact,
  stage1Sha256,
}) {
  validateQianchuanInfluencerTagRepairPlan(plan);
  validateQianchuanInfluencerTagStage1Result(stage1);
  assertPinnedMigrationReviewArtifact(planArtifact, planSha256, 'Influencer-tag repair plan');
  assertPinnedMigrationReviewArtifact(stage1Artifact, stage1Sha256, 'Influencer-tag Stage 1 artifact');
  if (checkpoint) {
    assertPinnedMigrationReviewArtifact(
      checkpointArtifact,
      checkpointSha256,
      'Influencer-tag Stage 2 checkpoint',
    );
  } else if (checkpointArtifact || checkpointSha256) {
    throw new Error('Influencer-tag Stage 2 checkpoint data, metadata and SHA must be provided together.');
  }
  if (!sameArtifact(stage1.sourceArtifacts?.plan, planArtifact)
    || stage1.target?.identity !== plan.target.identity
    || stage1.target?.checksum !== plan.target.checksum
    || stage1.backup?.rows !== plan.execution.changes.length
    || stage1.canary?.id !== plan.execution.canary.id
    || stage1.forwardFunction?.sourceSha256 !== plan.execution.forwardFunction.definitionSha256) {
    throw new Error('Influencer-tag Stage 1 artifact differs from the pinned repair plan.');
  }
  if (!Number.isInteger(batchSize) || batchSize < 1
    || batchSize > plan.execution.batching.maxRowsPerTransaction) {
    throw new Error(`Influencer-tag Stage 2 batchSize must be 1..${plan.execution.batching.maxRowsPerTransaction}.`);
  }

  const state = resolveExecutionState({
    checkpoint,
    checkpointArtifact,
    plan,
    planArtifact,
    stage1,
    stage1Artifact,
  });
  const batchChanges = state.remainingChanges.slice(0, batchSize);
  if (batchChanges.length < 1) throw new Error('Influencer-tag Stage 2 requires one real batch.');

  const commonState = {
    client,
    completedRows: state.completedRows,
    functionSha256: stage1.forwardFunction.catalogDefinitionSha256,
    plan,
    repairRunId: stage1.backup.runId,
    remainingChanges: state.remainingChanges,
  };
  const preflight = await inspectStage2StateReadOnly(commonState);
  onEvent({ at: now().toISOString(), stage: 'preflight_passed' });

  let committed = false;
  let transactionStarted = false;
  let updatedRowsEvidence;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    transactionStarted = true;
    await client.query(`SET LOCAL lock_timeout = '${plan.execution.batching.lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL statement_timeout = '${plan.execution.batching.statementTimeoutMs}ms'`);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      QIANCHUAN_INFLUENCER_TAG_STAGE2_ADVISORY_LOCK,
    ]);
    await inspectStage2State(commonState);
    onEvent({ at: now().toISOString(), stage: 'transaction_boundary_verified' });

    const update = await client.query(STAGE2_BATCH_UPDATE_SQL, [
      JSON.stringify(batchChanges),
      stage1.backup.runId,
    ]);
    if (update.rowCount !== batchChanges.length) {
      throw new Error('Influencer-tag Stage 2 exact batch row count differs from the selected boundary.');
    }
    updatedRowsEvidence = validateUpdatedRows(update.rows, batchChanges);
    onEvent({ at: now().toISOString(), rows: updatedRowsEvidence.length, stage: 'batch_verified_in_transaction' });

    await client.query('COMMIT');
    committed = true;
    transactionStarted = false;
    onEvent({ at: now().toISOString(), stage: 'stage2_batch_committed' });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    const stage2Error = error instanceof Error ? error : new Error(String(error));
    stage2Error.stage2Committed = committed;
    throw stage2Error;
  }

  const completedRows = [...state.completedRows, ...updatedRowsEvidence];
  const remainingChanges = state.remainingChanges.slice(batchChanges.length);
  let postcheck;
  try {
    postcheck = await inspectStage2StateReadOnly({
      ...commonState,
      completedRows,
      remainingChanges,
    });
  } catch (error) {
    const postcheckError = error instanceof Error ? error : new Error(String(error));
    postcheckError.stage2Committed = true;
    throw postcheckError;
  }
  onEvent({ at: now().toISOString(), stage: 'postcheck_passed' });

  const cumulativeUpdatedRows = state.cumulativeUpdatedRows + updatedRowsEvidence.length;
  const completed = remainingChanges.length === 0;
  const result = {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    mode: 'live_write_influencer_tag_stage2_batch',
    status: completed ? 'completed' : 'in_progress',
    target: { ...plan.target },
    sourceArtifacts: {
      plan: planArtifact,
      stage1: stage1Artifact,
      previousCheckpoint: state.previousCheckpoint,
    },
    git,
    policy: {
      transaction: 'one ascending-id exact batch in repeatable-read',
      productionWritesAuthorized: true,
      repairExecutionAuthorized: true,
      stage2BatchCommitted: true,
      fullBackfillExecuted: completed,
      independentPostrepairVerified: false,
      ledgerWritten: false,
      ownerDecisionRecorded: false,
      deployAuthorized: false,
      arkInvoked: false,
    },
    batchNumber: state.batchNumber,
    batchSize,
    updatedRows: updatedRowsEvidence.length,
    cumulativeUpdatedRows,
    initialRemainingRows: plan.execution.batching.remainingRows,
    remainingMismatchRows: remainingChanges.length,
    nextCursor: completed ? null : completedRows.at(-1).id,
    backupRunId: stage1.backup.runId,
    backupTable: QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE,
    forwardFunctionSourceSha256: stage1.forwardFunction.sourceSha256,
    forwardFunctionCatalogSha256: stage1.forwardFunction.catalogDefinitionSha256,
    updatedRowsEvidence,
    completedRows,
    preflight,
    postcheck,
  };
  validateQianchuanInfluencerTagStage2Checkpoint(result, {
    plan,
    planArtifact,
    stage1,
    stage1Artifact,
  });
  return result;
}

export function validateQianchuanInfluencerTagStage2Checkpoint(
  checkpoint,
  sources = null,
) {
  if (checkpoint?.schemaVersion !== 1
    || checkpoint.mode !== 'live_write_influencer_tag_stage2_batch'
    || !['in_progress', 'completed'].includes(checkpoint.status)
    || !Number.isInteger(checkpoint.batchNumber) || checkpoint.batchNumber < 1
    || !Number.isInteger(checkpoint.batchSize) || checkpoint.batchSize < 1 || checkpoint.batchSize > 50
    || !Number.isInteger(checkpoint.updatedRows) || checkpoint.updatedRows < 1
    || checkpoint.updatedRows > checkpoint.batchSize
    || !Number.isInteger(checkpoint.cumulativeUpdatedRows)
    || checkpoint.cumulativeUpdatedRows < checkpoint.updatedRows
    || !Number.isInteger(checkpoint.initialRemainingRows) || checkpoint.initialRemainingRows < 1
    || !Number.isInteger(checkpoint.remainingMismatchRows) || checkpoint.remainingMismatchRows < 0
    || checkpoint.cumulativeUpdatedRows + checkpoint.remainingMismatchRows
      !== checkpoint.initialRemainingRows
    || !Array.isArray(checkpoint.updatedRowsEvidence)
    || checkpoint.updatedRowsEvidence.length !== checkpoint.updatedRows
    || !Array.isArray(checkpoint.completedRows)
    || checkpoint.completedRows.length !== checkpoint.cumulativeUpdatedRows + 1
    || !/^qit-\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(checkpoint.backupRunId ?? '')
    || checkpoint.backupTable !== QIANCHUAN_INFLUENCER_TAG_STAGE1_BACKUP_TABLE
    || !/^[a-f0-9]{64}$/.test(checkpoint.forwardFunctionSourceSha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(checkpoint.forwardFunctionCatalogSha256 ?? '')) {
    throw new Error('Influencer-tag Stage 2 checkpoint structure is invalid.');
  }
  assertCompletedRows(checkpoint.completedRows);
  const batchTail = checkpoint.completedRows.slice(-checkpoint.updatedRows);
  if (JSON.stringify(batchTail) !== JSON.stringify(checkpoint.updatedRowsEvidence)) {
    throw new Error('Influencer-tag Stage 2 checkpoint batch evidence is not the completed-row tail.');
  }
  const completed = checkpoint.status === 'completed';
  if (completed !== (checkpoint.remainingMismatchRows === 0)
    || checkpoint.nextCursor !== (completed ? null : checkpoint.completedRows.at(-1).id)
    || checkpoint.postcheck?.remainingMismatchRows !== checkpoint.remainingMismatchRows
    || checkpoint.postcheck?.waitingLocks !== 0
    || checkpoint.policy?.transaction !== 'one ascending-id exact batch in repeatable-read'
    || checkpoint.policy?.productionWritesAuthorized !== true
    || checkpoint.policy?.repairExecutionAuthorized !== true
    || checkpoint.policy?.stage2BatchCommitted !== true
    || checkpoint.policy?.fullBackfillExecuted !== completed
    || checkpoint.policy?.independentPostrepairVerified !== false
    || checkpoint.policy?.ledgerWritten !== false
    || checkpoint.policy?.ownerDecisionRecorded !== false
    || checkpoint.policy?.deployAuthorized !== false
    || checkpoint.policy?.arkInvoked !== false) {
    throw new Error('Influencer-tag Stage 2 checkpoint policy or progress is invalid.');
  }
  for (const evidence of checkpoint.updatedRowsEvidence) {
    assertEvidenceRow(evidence, 'Influencer-tag Stage 2 updated row evidence');
  }
  if (sources) assertCheckpointSources({ checkpoint, ...sources });
  return checkpoint;
}
