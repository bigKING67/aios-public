import {
  validateQianchuanCardRatioPostrepairReadonlyProbe,
} from './aios-qianchuan-production-migration-card-ratio-readonly-probe.mjs';
import {
  validateQianchuanCardRatioStage2Checkpoint,
} from './aios-qianchuan-production-migration-card-ratio-stage2.mjs';
import {
  validateQianchuanProductionMigrationP1dReadonlyProbe,
} from './aios-qianchuan-production-migration-p1d-readonly-probe.mjs';
import {
  QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS,
  validateQianchuanProductionMigrationP1dReviewDecisions,
} from './aios-qianchuan-production-migration-p1d-review-decisions.mjs';
import {
  assertPinnedMigrationReviewArtifact,
  QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS,
} from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS,
} from './aios-qianchuan-production-migration-p1c-review-decisions.mjs';

const REVIEWER = 'repository-owner';
const DECISION_COHORT = 'P1D_FORWARD_REPAIR';
const AUTHORIZATION_EVIDENCE = 'explicit_card_ratio_forward_repair_owner_review';
const TARGET = Object.freeze({
  checksum: '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290',
  identity: 'warehouse/20260609_2045',
  lineageFamily: 'card_ratio_enforcement',
  namespace: 'warehouse',
  version: '20260609_2045',
});
const MAIN_TABLE = 'ads.douyin_trade_sale_card';
const DETAIL_TABLE = 'ads.douyin_trade_sale_card_detail';
const EXPECTED_SOURCE_PATH = 'etl/groland_postgres/sql/migrations/20260609_2045__recompute_douyin_trade_sale_card_ratio_fields.sql';
const EXPECTED_EVIDENCE_KINDS = Object.freeze([
  'prior_owner_review_decisions',
  'p1d_owner_review_readonly_probe',
  'card_ratio_stage2_completed_checkpoint',
  'card_ratio_independent_postcheck',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function identity(value) {
  return `${value.namespace}/${value.version}`;
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp with milliseconds.`);
  }
}

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function artifactLink(kind, artifact) {
  return { bytes: artifact.bytes, kind, path: artifact.path, sha256: artifact.sha256 };
}

function assertSameArtifact(actual, expected, label) {
  if (actual?.path !== expected?.path
    || actual?.bytes !== expected?.bytes
    || actual?.sha256 !== expected?.sha256) {
    throw new Error(`${label} differs from the pinned source artifact.`);
  }
}

function priorDecisionContract(priorDecisions) {
  const contract = clone(priorDecisions);
  delete contract.decisions;
  return contract;
}

function reconstructPriorDecisions(contract, rows) {
  return { ...clone(contract), decisions: clone(rows) };
}

function assertEvidenceTimestampBeforeReview(evidence, reviewedAt, label) {
  assertIsoTimestamp(evidence?.generatedAt, `${label} generatedAt`);
  if (Date.parse(evidence.generatedAt) > Date.parse(reviewedAt)) {
    throw new Error(`${label} must predate the owner review decision.`);
  }
}

function assertOwnerReviewProbe(ownerReviewProbe, lineageArtifact) {
  validateQianchuanProductionMigrationP1dReadonlyProbe(ownerReviewProbe);
  assertSameArtifact(ownerReviewProbe.sourceArtifact, lineageArtifact, 'P1D owner-review probe lineage');
  const evidence = ownerReviewProbe.entryEvidence.find((entry) => (
    entry.family === TARGET.lineageFamily
  ));
  if (!evidence
    || JSON.stringify(evidence.entries) !== JSON.stringify([TARGET.identity])
    || evidence.evidenceState !== 'card_ratio_postcondition_requires_owner_review'
    || evidence.decision !== null
    || evidence.reviewer !== null) {
    throw new Error('P1D owner-review probe does not contain the exact card-ratio postcondition.');
  }
  const routines = new Map((ownerReviewProbe.catalog?.routines ?? []).map((row) => [row.signature, row]));
  const triggers = new Map((ownerReviewProbe.catalog?.triggers ?? []).map((row) => [row.identity, row]));
  const requiredRoutines = [
    'ads.fn_recompute_douyin_trade_sale_card_ratio_fields()',
    'ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()',
  ];
  const requiredTriggers = [
    'ads.douyin_trade_sale_card.trg_recompute_douyin_trade_sale_card_ratio_fields',
    'ads.douyin_trade_sale_card_detail.trg_recompute_douyin_trade_sale_card_detail_ratio_fields',
  ];
  if (requiredRoutines.some((signature) => routines.get(signature)?.present !== true)
    || requiredTriggers.some((trigger) => (
      triggers.get(trigger)?.present !== true || triggers.get(trigger)?.enabled !== 'O'
    ))) {
    throw new Error('P1D owner-review probe does not prove both card-ratio guards are enabled.');
  }
  const main = ownerReviewProbe.dataShapes?.cardRatio?.card;
  const detail = ownerReviewProbe.dataShapes?.cardRatio?.cardDetail;
  if (asCount(main?.rows, 'Owner-review main rows') < 1
    || asCount(detail?.rows, 'Owner-review detail rows') < 1
    || asCount(main?.mismatchRows, 'Owner-review main mismatches') !== 0
    || asCount(detail?.mismatchRows, 'Owner-review detail mismatches') !== 0) {
    throw new Error('P1D owner-review probe does not prove zero card-ratio mismatch.');
  }
  return {
    [MAIN_TABLE]: asCount(main.rows, 'Owner-review main rows'),
    [DETAIL_TABLE]: asCount(detail.rows, 'Owner-review detail rows'),
  };
}

function assertStage2Completion(stage2Checkpoint, expectedRows) {
  validateQianchuanCardRatioStage2Checkpoint(stage2Checkpoint);
  if (stage2Checkpoint.schemaVersion !== 3
    || stage2Checkpoint.status !== 'completed'
    || stage2Checkpoint.target?.identity !== TARGET.identity
    || stage2Checkpoint.target?.checksum !== TARGET.checksum
    || stage2Checkpoint.target?.source?.path !== EXPECTED_SOURCE_PATH
    || stage2Checkpoint.target?.source?.sha256 !== TARGET.checksum
    || stage2Checkpoint.policy?.historicalMigrationReplayed !== false
    || stage2Checkpoint.policy?.ledgerWritten !== false
    || stage2Checkpoint.remainingTotalMismatchRows !== 0
    || stage2Checkpoint.postcheck?.adsMismatchRows !== 0
    || stage2Checkpoint.postcheck?.waitingLocks !== 0
    || stage2Checkpoint.guards?.functionsPresent !== 2
    || stage2Checkpoint.guards?.enabledTriggersPresent !== 2
    || stage2Checkpoint.sourceRowsByTable?.[MAIN_TABLE] !== expectedRows[MAIN_TABLE]
    || stage2Checkpoint.sourceRowsByTable?.[DETAIL_TABLE] !== expectedRows[DETAIL_TABLE]) {
    throw new Error('Completed Stage 2 checkpoint does not prove the exact forward-repair boundary.');
  }
  for (const [label, artifact] of Object.entries(stage2Checkpoint.sourceArtifacts ?? {})) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Stage 2 ${label} artifact`);
  }
}

function impactRows(probe) {
  return new Map(probe.impact.map((row) => [row.table_name, asCount(row.rows, `${row.table_name} rows`)]));
}

function assertIndependentPostcheck(postcheckProbe, stage2Checkpoint, expectedRows) {
  validateQianchuanCardRatioPostrepairReadonlyProbe(postcheckProbe);
  if (postcheckProbe.target?.identity !== TARGET.identity
    || postcheckProbe.target?.checksum !== TARGET.checksum
    || postcheckProbe.target?.source?.path !== EXPECTED_SOURCE_PATH
    || postcheckProbe.target?.source?.sha256 !== TARGET.checksum
    || postcheckProbe.summary?.odsMismatchRows !== stage2Checkpoint.postcheck?.odsMismatchRows) {
    throw new Error('Independent postcheck does not match the completed Stage 2 target.');
  }
  const rows = impactRows(postcheckProbe);
  for (const table of [MAIN_TABLE, DETAIL_TABLE]) {
    if (rows.get(table) !== expectedRows[table]) {
      throw new Error(`Independent postcheck row count differs for ${table}.`);
    }
  }
  for (const [label, artifact] of Object.entries(postcheckProbe.sourceArtifacts ?? {})) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Independent postcheck ${label} artifact`);
  }
}

function validateForwardRepairEvidence({
  ownerReviewProbe,
  ownerReviewProbeArtifact,
  ownerReviewProbeSha256,
  postcheckProbe,
  postcheckProbeArtifact,
  postcheckProbeSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
  stage2Checkpoint,
  stage2CheckpointArtifact,
  stage2CheckpointSha256,
}) {
  validateQianchuanProductionMigrationP1dReviewDecisions(priorDecisions);
  for (const [artifact, sha256, label] of [
    [priorDecisionsArtifact, priorDecisionsSha256, 'Prior P1D owner decisions'],
    [ownerReviewProbeArtifact, ownerReviewProbeSha256, 'P1D owner-review probe'],
    [stage2CheckpointArtifact, stage2CheckpointSha256, 'Completed Stage 2 checkpoint'],
    [postcheckProbeArtifact, postcheckProbeSha256, 'Independent card-ratio postcheck'],
  ]) {
    assertPinnedMigrationReviewArtifact(artifact, sha256, label);
  }
  const expectedRows = assertOwnerReviewProbe(
    ownerReviewProbe,
    priorDecisions.sourceArtifacts.lineage,
  );
  assertStage2Completion(stage2Checkpoint, expectedRows);
  assertIndependentPostcheck(postcheckProbe, stage2Checkpoint, expectedRows);
}

function evidenceLinks(sourceArtifacts) {
  return EXPECTED_EVIDENCE_KINDS.map((kind) => {
    const artifact = {
      prior_owner_review_decisions: sourceArtifacts.priorDecisions,
      p1d_owner_review_readonly_probe: sourceArtifacts.ownerReviewProbe,
      card_ratio_stage2_completed_checkpoint: sourceArtifacts.stage2Checkpoint,
      card_ratio_independent_postcheck: sourceArtifacts.postcheckProbe,
    }[kind];
    return artifactLink(kind, artifact);
  });
}

export function buildQianchuanProductionMigrationP1dForwardRepairDecisions({
  confirmed = false,
  generatedAt = new Date().toISOString(),
  ownerReviewProbe,
  ownerReviewProbeArtifact,
  ownerReviewProbeSha256,
  postcheckProbe,
  postcheckProbeArtifact,
  postcheckProbeSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
  reviewedAt,
  reviewer,
  stage2Checkpoint,
  stage2CheckpointArtifact,
  stage2CheckpointSha256,
}) {
  if (confirmed !== true) {
    throw new Error('Card-ratio forward-repair owner decision requires the explicit confirmation flag.');
  }
  assertIsoTimestamp(generatedAt, 'Forward-repair decision artifact generatedAt');
  assertIsoTimestamp(reviewedAt, 'Forward-repair decision reviewedAt');
  if (reviewer !== REVIEWER) {
    throw new Error(`Forward-repair decision reviewer must be the neutral identity ${REVIEWER}.`);
  }
  if (Date.parse(generatedAt) < Date.parse(reviewedAt)) {
    throw new Error('Forward-repair decision artifact cannot predate the owner review.');
  }
  validateForwardRepairEvidence({
    ownerReviewProbe,
    ownerReviewProbeArtifact,
    ownerReviewProbeSha256,
    postcheckProbe,
    postcheckProbeArtifact,
    postcheckProbeSha256,
    priorDecisions,
    priorDecisionsArtifact,
    priorDecisionsSha256,
    stage2Checkpoint,
    stage2CheckpointArtifact,
    stage2CheckpointSha256,
  });
  for (const [evidence, label] of [
    [priorDecisions, 'Prior P1D owner decisions'],
    [ownerReviewProbe, 'P1D owner-review probe'],
    [stage2Checkpoint, 'Completed Stage 2 checkpoint'],
    [postcheckProbe, 'Independent card-ratio postcheck'],
  ]) {
    assertEvidenceTimestampBeforeReview(evidence, reviewedAt, label);
  }
  const sourceArtifacts = {
    priorDecisions: priorDecisionsArtifact,
    ownerReviewProbe: ownerReviewProbeArtifact,
    stage2Checkpoint: stage2CheckpointArtifact,
    postcheckProbe: postcheckProbeArtifact,
  };
  const newDecision = {
    checksum: TARGET.checksum,
    decision: 'verified_forward_repaired',
    decisionCohort: DECISION_COHORT,
    evidenceLinks: evidenceLinks(sourceArtifacts),
    executionEvidence: 'verified_equivalent_forward_repair',
    historicalExecution: false,
    ledgerAction: 'do_not_record',
    lineageFamily: TARGET.lineageFamily,
    namespace: TARGET.namespace,
    rationale: 'The completed guard-first Stage 1/2 forward repair and independent read-only postcheck prove both enabled ratio guards and zero ADS formula mismatch; this does not claim the historical migration executed.',
    reviewStatus: 'verified_forward_repaired',
    reviewWave: 'P1D',
    reviewedAt,
    reviewer,
    sourceClassification: 'unknown',
    version: TARGET.version,
  };
  const decisions = [...clone(priorDecisions.decisions), newDecision];
  return {
    schemaVersion: 3,
    generatedAt,
    mode: 'offline_owner_review_decisions',
    authorization: {
      acceptedOn: reviewedAt.slice(0, 10),
      evidence: AUTHORIZATION_EVIDENCE,
      newDecisionCohort: DECISION_COHORT,
      reviewer,
    },
    priorDecisionContract: priorDecisionContract(priorDecisions),
    sourceArtifacts,
    policy: {
      arkInvoked: false,
      authoritativeClassificationChanged: false,
      authoritativeManifestMutated: false,
      decision: 'verified_forward_repaired',
      deployAuthorized: false,
      forwardRepairVerified: true,
      historicalExecution: false,
      ledgerWritesAuthorized: false,
      networkAccess: false,
      ownerDecisionRecorded: true,
      priorDecisionArtifactMutated: false,
      productionWritesAuthorized: false,
      unrelatedP1dOwnerDecisionsRecorded: false,
    },
    summary: {
      decisions: decisions.length,
      priorDecisions: priorDecisions.decisions.length,
      newDecisions: 1,
      unresolvedP1dEntries: 4,
      byCohort: {
        P1B: QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length,
        P1C: QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length,
        P1D: QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS.length + 1,
      },
      decisionsByType: {
        not_applicable: priorDecisions.decisions.length,
        verified_forward_repaired: 1,
      },
      ledgerActions: { do_not_record: decisions.length },
      reviewStatuses: {
        verified_forward_repaired: 1,
        verified_not_applicable: priorDecisions.decisions.length,
      },
    },
    decisions,
  };
}

export function validateQianchuanProductionMigrationP1dForwardRepairDecisions(decisions, {
  manifest,
  manifestArtifact,
  ownerReviewProbe,
  postcheckProbe,
  priorDecisions,
  stage2Checkpoint,
} = {}) {
  if (decisions?.schemaVersion !== 3
    || decisions.mode !== 'offline_owner_review_decisions'
    || decisions.authorization?.reviewer !== REVIEWER
    || decisions.authorization?.evidence !== AUTHORIZATION_EVIDENCE
    || decisions.authorization?.newDecisionCohort !== DECISION_COHORT
    || decisions.policy?.decision !== 'verified_forward_repaired'
    || decisions.policy?.forwardRepairVerified !== true
    || decisions.policy?.historicalExecution !== false
    || decisions.policy?.ownerDecisionRecorded !== true
    || decisions.policy?.unrelatedP1dOwnerDecisionsRecorded !== false
    || decisions.policy?.authoritativeManifestMutated !== false
    || decisions.policy?.authoritativeClassificationChanged !== false
    || decisions.policy?.priorDecisionArtifactMutated !== false
    || decisions.policy?.productionWritesAuthorized !== false
    || decisions.policy?.ledgerWritesAuthorized !== false
    || decisions.policy?.deployAuthorized !== false
    || decisions.policy?.networkAccess !== false
    || decisions.policy?.arkInvoked !== false) {
    throw new Error('P1D forward-repair owner decision policy or authorization is invalid.');
  }
  assertIsoTimestamp(decisions.generatedAt, 'Forward-repair decision artifact generatedAt');
  const priorCount = QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length
    + QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length
    + QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS.length;
  if (!Array.isArray(decisions.decisions)
    || decisions.decisions.length !== priorCount + 1
    || decisions.summary?.decisions !== priorCount + 1
    || decisions.summary?.priorDecisions !== priorCount
    || decisions.summary?.newDecisions !== 1
    || decisions.summary?.unresolvedP1dEntries !== 4
    || decisions.summary?.byCohort?.P1B !== QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.byCohort?.P1C !== QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.byCohort?.P1D !== QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS.length + 1
    || decisions.summary?.decisionsByType?.not_applicable !== priorCount
    || decisions.summary?.decisionsByType?.verified_forward_repaired !== 1
    || decisions.summary?.ledgerActions?.do_not_record !== priorCount + 1
    || decisions.summary?.reviewStatuses?.verified_not_applicable !== priorCount
    || decisions.summary?.reviewStatuses?.verified_forward_repaired !== 1) {
    throw new Error('P1D forward-repair owner decision summary is inconsistent.');
  }
  const priorRows = decisions.decisions.slice(0, priorCount);
  const priorArtifact = reconstructPriorDecisions(decisions.priorDecisionContract, priorRows);
  validateQianchuanProductionMigrationP1dReviewDecisions(priorArtifact, {
    manifest,
    manifestArtifact,
  });
  if (priorDecisions && JSON.stringify(priorArtifact) !== JSON.stringify(priorDecisions)) {
    throw new Error('P1D forward-repair artifact mutated prior owner decisions.');
  }
  for (const [label, artifact] of Object.entries(decisions.sourceArtifacts ?? {})) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Forward-repair ${label} artifact`);
  }
  const row = decisions.decisions.at(-1);
  const expectedLinks = evidenceLinks(decisions.sourceArtifacts);
  assertIsoTimestamp(row?.reviewedAt, 'Card-ratio forward-repair reviewedAt');
  if (Date.parse(decisions.generatedAt) < Date.parse(row.reviewedAt)
    || identity(row ?? {}) !== TARGET.identity
    || row.checksum !== TARGET.checksum
    || row.lineageFamily !== TARGET.lineageFamily
    || row.decision !== 'verified_forward_repaired'
    || row.reviewStatus !== 'verified_forward_repaired'
    || row.executionEvidence !== 'verified_equivalent_forward_repair'
    || row.historicalExecution !== false
    || row.ledgerAction !== 'do_not_record'
    || row.reviewer !== REVIEWER
    || row.sourceClassification !== 'unknown'
    || row.decisionCohort !== DECISION_COHORT
    || row.reviewWave !== 'P1D'
    || decisions.authorization.acceptedOn !== row.reviewedAt.slice(0, 10)
    || JSON.stringify(row.evidenceLinks) !== JSON.stringify(expectedLinks)) {
    throw new Error('Card-ratio forward-repair owner decision is invalid.');
  }
  if (manifest) {
    const entry = manifest.entries.find((value) => identity(value) === TARGET.identity);
    if (!entry || entry.checksum !== TARGET.checksum || entry.classification !== 'unknown') {
      throw new Error('Card-ratio migration no longer matches the owner-decision manifest.');
    }
  }
  if (ownerReviewProbe || stage2Checkpoint || postcheckProbe) {
    if (!ownerReviewProbe || !stage2Checkpoint || !postcheckProbe) {
      throw new Error('Forward-repair evidence validation requires all three runtime artifacts.');
    }
    const expectedRows = assertOwnerReviewProbe(
      ownerReviewProbe,
      priorArtifact.sourceArtifacts.lineage,
    );
    assertStage2Completion(stage2Checkpoint, expectedRows);
    assertIndependentPostcheck(postcheckProbe, stage2Checkpoint, expectedRows);
    for (const [evidence, label] of [
      [priorArtifact, 'Prior P1D owner decisions'],
      [ownerReviewProbe, 'P1D owner-review probe'],
      [stage2Checkpoint, 'Completed Stage 2 checkpoint'],
      [postcheckProbe, 'Independent card-ratio postcheck'],
    ]) {
      assertEvidenceTimestampBeforeReview(evidence, row.reviewedAt, label);
    }
  }
  return decisions;
}
