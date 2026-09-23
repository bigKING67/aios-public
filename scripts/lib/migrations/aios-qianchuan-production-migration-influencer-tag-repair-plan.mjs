import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
} from './aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs';
import {
  validateQianchuanInfluencerTagReadonlyProbe,
} from './aios-qianchuan-production-migration-influencer-tag-readonly-probe.mjs';

const TARGET_IDENTITY = 'warehouse/20260510_1800';
const TARGET_CHECKSUM = '8d94ae900ab7ece5f389cd93f1a7510597556b7022f9cddbe32884af82430a6a';
const TARGET_TABLE = 'ads.influencer_library';
const NORMALIZE_SIGNATURE = 'ads.fn_influencer_library_normalize_anchor_tag(text)';
const MAX_ROWS_PER_TRANSACTION = 50;
const MEBIBYTE = 1024 * 1024;
const REQUIRED_FORWARD_FUNCTION_SQL_TOKENS = Object.freeze([
  'CREATE OR REPLACE FUNCTION ads.fn_influencer_library_normalize_anchor_tag(p_raw TEXT)',
  'RETURNS TEXT',
  'LANGUAGE plpgsql',
  'IMMUTABLE',
  "RETURN '服饰主播';",
  'COMMENT ON FUNCTION ads.fn_influencer_library_normalize_anchor_tag(TEXT)',
]);
const PHASE_ORDER = Object.freeze([
  'preflight',
  'exact_backup',
  'forward_function',
  'single_row_canary',
  'bounded_exact_update',
  'postcondition',
]);

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

export function validateQianchuanInfluencerTagForwardFunctionSql(sql) {
  if (typeof sql !== 'string' || Buffer.byteLength(sql) < 500) {
    throw new Error('Influencer-tag forward function SQL is missing or unexpectedly small.');
  }
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)
    || /\b(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\s+|CALL\s+|COPY\s+)\b/i.test(sql)) {
    throw new Error('Influencer-tag forward function SQL must remain DDL-only.');
  }
  const createStatements = sql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+ads\.fn_influencer_library_normalize_anchor_tag\s*\(/gi,
  ) ?? [];
  if (createStatements.length !== 1) {
    throw new Error('Influencer-tag forward function SQL must define exactly one normalizer overload.');
  }
  for (const token of REQUIRED_FORWARD_FUNCTION_SQL_TOKENS) {
    if (!sql.includes(token)) {
      throw new Error(`Influencer-tag forward function SQL is missing required token ${token}.`);
    }
  }
  return {
    bytes: Buffer.byteLength(sql),
    sha256: sha256(sql),
  };
}

function normalizeImpactRows(probe) {
  const ids = new Set();
  let previousId = null;
  return probe.impactRows.map((row) => {
    if (!/^\d+$/.test(row.id ?? '') || !/^\d+$/.test(row.rowVersion ?? '')
      || typeof row.updatedAt !== 'string' || !row.updatedAt
      || !Array.isArray(row.before?.tags) || !Array.isArray(row.expected?.tags)) {
      throw new Error('Influencer-tag readiness probe has an invalid exact-row guard.');
    }
    const id = BigInt(row.id);
    if (id < 1n || ids.has(row.id) || (previousId != null && id <= previousId)) {
      throw new Error('Influencer-tag readiness probe row identities must be unique and ordered.');
    }
    if (sha256Json(row.before) !== row.beforeSha256
      || sha256Json(row.expected) !== row.expectedSha256
      || row.beforeSha256 === row.expectedSha256) {
      throw new Error(`Influencer-tag readiness probe row ${row.id} hash evidence is inconsistent.`);
    }
    ids.add(row.id);
    previousId = id;
    return {
      id: row.id,
      sourceRowVersion: row.rowVersion,
      sourceUpdatedAt: row.updatedAt,
      before: structuredClone(row.before),
      expected: structuredClone(row.expected),
      beforeSha256: row.beforeSha256,
      expectedSha256: row.expectedSha256,
    };
  });
}

function validatePlanChanges(changes) {
  const ids = new Set();
  let previousId = null;
  for (const row of changes) {
    if (!/^\d+$/.test(row?.id ?? '') || !/^\d+$/.test(row?.sourceRowVersion ?? '')
      || typeof row?.sourceUpdatedAt !== 'string' || !row.sourceUpdatedAt
      || !Array.isArray(row.before?.tags) || !Array.isArray(row.expected?.tags)) {
      throw new Error('Influencer-tag repair plan has an invalid exact-row guard.');
    }
    const id = BigInt(row.id);
    if (id < 1n || ids.has(row.id) || (previousId != null && id <= previousId)) {
      throw new Error('Influencer-tag repair plan row identities must be unique and ordered.');
    }
    if (sha256Json(row.before) !== row.beforeSha256
      || sha256Json(row.expected) !== row.expectedSha256
      || row.beforeSha256 === row.expectedSha256) {
      throw new Error(`Influencer-tag repair plan row ${row.id} hash evidence is inconsistent.`);
    }
    ids.add(row.id);
    previousId = id;
  }
  return changes.length;
}

function validateObservedBoundary(probe, changes) {
  const mismatchRows = asCount(probe.summary.mismatchRows, 'Mismatch rows');
  const mismatchBreakdown = asCount(probe.summary.tagsOnlyMismatchRows, 'Tags-only mismatch rows')
    + asCount(probe.summary.anchorDescOnlyMismatchRows, 'Anchor-desc-only mismatch rows')
    + asCount(probe.summary.bothMismatchRows, 'Both-field mismatch rows');
  if (probe.target?.identity !== TARGET_IDENTITY || probe.target?.checksum !== TARGET_CHECKSUM
    || probe.summary.waitingLocks !== 0 || probe.summary.normalizeFunctionPresent !== false
    || mismatchRows !== changes.length || mismatchBreakdown !== mismatchRows
    || probe.summary.impactRowsCaptured !== mismatchRows) {
    throw new Error('Influencer-tag readiness probe differs from the exact forward-repair boundary.');
  }
  return mismatchRows;
}

export function buildQianchuanInfluencerTagRepairPlan({
  now = () => new Date(),
  probe,
  probeArtifact,
  probeSha256,
}) {
  assertPinnedMigrationReviewArtifact(probeArtifact, probeSha256, 'Influencer-tag readiness probe');
  validateQianchuanInfluencerTagReadonlyProbe(probe);
  const changes = normalizeImpactRows(probe);
  const mismatchRows = validateObservedBoundary(probe, changes);
  const canary = changes[0];
  const remainingRows = mismatchRows - 1;
  const functionDefinition = validateQianchuanInfluencerTagForwardFunctionSql(
    QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
  );
  const estimatedBackupBytes = asCount(
    probe.summary.estimatedBackupBytes,
    'Estimated backup bytes',
  );

  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    mode: 'offline_influencer_tag_forward_repair_plan',
    target: { ...probe.target },
    sourceArtifact: probeArtifact,
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
      recommendedStrategy: 'forward_function_then_single_row_canary_then_bounded_exact_update',
      rationale: 'The exact active-row drift is bounded and row-version captured, the support catalog is intact, and only the canonical normalize function plus mismatch-only data repair are absent.',
    },
    observed: {
      snapshotAt: probe.generatedAt,
      table: TARGET_TABLE,
      activeRows: asCount(probe.summary.activeRows, 'Active rows'),
      rowsWithNormalizedTags: asCount(
        probe.summary.rowsWithNormalizedTags,
        'Rows with normalized tags',
      ),
      mismatchRows,
      mismatchBreakdown: {
        tagsOnly: asCount(probe.summary.tagsOnlyMismatchRows, 'Tags-only mismatch rows'),
        anchorDescOnly: asCount(
          probe.summary.anchorDescOnlyMismatchRows,
          'Anchor-desc-only mismatch rows',
        ),
        both: asCount(probe.summary.bothMismatchRows, 'Both-field mismatch rows'),
      },
      estimatedBackupBytes,
      waitingLocks: 0,
      normalizeFunctionPresent: false,
      supportRoutinesPresent: probe.summary.supportRoutinesPresent,
      touchTriggerPresent: probe.summary.touchTriggerPresent,
    },
    execution: {
      phaseOrder: [...PHASE_ORDER],
      preflight: {
        repeatReadOnlyProbe: true,
        requireExactArtifactSha256: probeArtifact.sha256,
        requireCleanPushedMainAndShaParity: true,
        requireExplicitProductionWriteAuthorization: true,
        abortOnWaitingLocks: true,
        abortOnAnyRowIdentityVersionOrHashDrift: true,
        expectedMismatchRows: mismatchRows,
      },
      backup: {
        created: false,
        exactMismatchedRowsOnly: true,
        estimatedRows: mismatchRows,
        rawPayloadBytes: estimatedBackupBytes,
        recommendedCapacityBytes: Math.max(MEBIBYTE, estimatedBackupBytes * 4),
        evidenceColumns: [
          'repair_run_id',
          'backed_up_at',
          'id',
          'source_xmin',
          'source_updated_at',
          'tags',
          'anchor_desc',
          'before_sha256',
          'expected_sha256',
        ],
        requireRowCountAndHashParityBeforeFunctionInstall: true,
        retainUntilOwnerSignoff: true,
      },
      forwardFunction: {
        ddlOnlyForwardMigration: true,
        historicalMigrationReplay: false,
        signature: NORMALIZE_SIGNATURE,
        repositorySource: 'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs',
        repositoryExport: 'QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL',
        knownRepositoryDependentRoutine: 'ads.initialize_influencer_library_from_feishu_sources()',
        dependencySource: 'etl/groland_postgres/sql/migrations/20260509_1500__create_ads_influencer_library.sql',
        definitionBytes: functionDefinition.bytes,
        definitionSha256: functionDefinition.sha256,
        installBeforeDataWrite: true,
        fullTableDmlAllowed: false,
        postcondition: 'exact function overload exists with the pinned definition hash before canary update',
      },
      canary: {
        rows: 1,
        id: canary.id,
        sourceRowVersion: canary.sourceRowVersion,
        beforeSha256: canary.beforeSha256,
        expectedSha256: canary.expectedSha256,
        transaction: 'one exact row guarded by id, xmin and pre-update value hash',
        commitOnlyAfter: [
          'exactly one row was backed up and updated',
          'the source xmin and before hash still match the pinned artifact',
          'the stored tags and anchor_desc hash equals expectedSha256',
          'no non-target row changed',
        ],
      },
      batching: {
        maxRowsPerTransaction: MAX_ROWS_PER_TRANSACTION,
        remainingRows,
        expectedBatches: Math.ceil(remainingRows / MAX_ROWS_PER_TRANSACTION),
        transaction: 'one ascending-id exact batch per transaction',
        skipLocked: false,
        lockTimeoutMs: 2000,
        statementTimeoutMs: 30000,
        maxDeadlockOrSerializationRetries: 3,
        optimisticGuard: {
          identityFields: ['id'],
          versionField: 'xmin',
          preupdateHashRequired: true,
          abortBatchOnAnyGuardMiss: true,
        },
      },
      changes,
      postcondition: {
        independentReadOnlyProcessRequired: true,
        reuseProbeWithPostrepairFlag: true,
        normalizeFunctionPresent: true,
        normalizeFunctionDefinitionSha256: functionDefinition.sha256,
        activeRows: asCount(probe.summary.activeRows, 'Active rows'),
        mismatchRows: 0,
        impactRowsCaptured: 0,
        waitingLocks: 0,
        reviewedP1dRemains: 5,
      },
    },
    rollback: {
      separateForwardRollbackArtifactRequired: true,
      writeQuiescenceFirst: true,
      restoreExactRowsFromBackup: true,
      requireCurrentExpectedHashAndPostupdateRowVersion: true,
      functionRemovalDefault: false,
      functionRemovalRequiresDependencyProofAndSeparateAuthorization: true,
      order: [
        'stop the repair executor and coordinate influencer-library writers',
        'verify each current row still matches the committed expected hash and post-update xmin',
        'restore exact tags and anchor_desc values from the pinned backup in one bounded transaction',
        'verify every restored row against beforeSha256 and retain the backup',
        'leave the normalize function installed unless dependency-safe removal is separately approved',
      ],
      neverMutateHistoricalMigrationOrLedger: true,
    },
    authorizationBoundaries: {
      backupFunctionAndDataWriteRequireNewProductionAuthorization: true,
      migrationApplyRequiresNewProductionWriteAuthorization: true,
      ownerDecisionRequiresSeparateAcceptance: true,
      applicationDeployRequiresSeparateAuthorization: true,
      arkRequiresSeparateAuthorization: true,
    },
  };
}

export function validateQianchuanInfluencerTagRepairPlan(plan) {
  const functionDefinition = validateQianchuanInfluencerTagForwardFunctionSql(
    QIANCHUAN_INFLUENCER_TAG_NORMALIZE_FUNCTION_SQL,
  );
  if (plan?.schemaVersion !== 1
    || plan.mode !== 'offline_influencer_tag_forward_repair_plan'
    || plan.target?.identity !== TARGET_IDENTITY
    || plan.target?.checksum !== TARGET_CHECKSUM
    || plan.decision?.repairPlanReady !== true
    || plan.decision?.recommendedStrategy !== 'forward_function_then_single_row_canary_then_bounded_exact_update'
    || !Array.isArray(plan.execution?.changes)) {
    throw new Error('Influencer-tag repair plan structure is invalid.');
  }
  if (plan.policy?.networkAccess !== false
    || plan.policy?.productionWritesAuthorized !== false
    || plan.policy?.ledgerWritesAuthorized !== false
    || plan.policy?.repairExecutionAuthorized !== false
    || plan.policy?.backupCreated !== false
    || plan.policy?.ownerDecisionRecorded !== false
    || plan.policy?.deployAuthorized !== false
    || plan.policy?.arkInvoked !== false
    || plan.policy?.historicalMigrationReplayRecommended !== false
    || plan.policy?.newForwardMigrationRequired !== true) {
    throw new Error('Influencer-tag repair plan policy is unsafe.');
  }
  const changeCount = validatePlanChanges(plan.execution.changes);
  const mismatchBreakdown = asCount(plan.observed?.mismatchBreakdown?.tagsOnly, 'Tags-only mismatch rows')
    + asCount(plan.observed?.mismatchBreakdown?.anchorDescOnly, 'Anchor-desc-only mismatch rows')
    + asCount(plan.observed?.mismatchBreakdown?.both, 'Both-field mismatch rows');
  if (JSON.stringify(plan.execution.phaseOrder) !== JSON.stringify(PHASE_ORDER)
    || changeCount < 1 || changeCount !== plan.observed?.mismatchRows
    || mismatchBreakdown !== changeCount
    || plan.execution.backup?.created !== false
    || plan.execution.backup?.estimatedRows !== changeCount
    || plan.execution.forwardFunction?.historicalMigrationReplay !== false
    || plan.execution.forwardFunction?.definitionBytes !== functionDefinition.bytes
    || plan.execution.forwardFunction?.definitionSha256 !== functionDefinition.sha256
    || plan.execution.canary?.rows !== 1
    || plan.execution.canary?.id !== plan.execution.changes[0]?.id
    || plan.execution.canary?.sourceRowVersion !== plan.execution.changes[0]?.sourceRowVersion
    || plan.execution.canary?.beforeSha256 !== plan.execution.changes[0]?.beforeSha256
    || plan.execution.canary?.expectedSha256 !== plan.execution.changes[0]?.expectedSha256
    || plan.execution.batching?.maxRowsPerTransaction !== MAX_ROWS_PER_TRANSACTION
    || plan.execution.batching?.skipLocked !== false
    || plan.execution.batching?.remainingRows !== changeCount - 1
    || plan.execution.batching?.expectedBatches
      !== Math.ceil((changeCount - 1) / MAX_ROWS_PER_TRANSACTION)
    || plan.execution.postcondition?.mismatchRows !== 0
    || plan.execution.postcondition?.normalizeFunctionDefinitionSha256 !== functionDefinition.sha256
    || plan.execution.postcondition?.reviewedP1dRemains !== 5
    || plan.rollback?.writeQuiescenceFirst !== true
    || plan.rollback?.functionRemovalDefault !== false
    || plan.authorizationBoundaries?.ownerDecisionRequiresSeparateAcceptance !== true
    || plan.authorizationBoundaries?.applicationDeployRequiresSeparateAuthorization !== true
    || plan.authorizationBoundaries?.arkRequiresSeparateAuthorization !== true) {
    throw new Error('Influencer-tag repair plan execution or rollback boundary is incomplete.');
  }
  return plan;
}
