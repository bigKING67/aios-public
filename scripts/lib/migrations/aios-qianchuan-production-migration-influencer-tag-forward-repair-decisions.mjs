import {
  validateQianchuanAlimamaRuntimeRetirementDecisions,
} from './aios-qianchuan-production-migration-alimama-runtime-retirement-decisions.mjs';
import {
  validateQianchuanInfluencerTagPostrepairReadonlyProbe,
} from './aios-qianchuan-production-migration-influencer-tag-readonly-probe.mjs';
import {
  validateQianchuanInfluencerTagRepairPlan,
} from './aios-qianchuan-production-migration-influencer-tag-repair-plan.mjs';
import {
  validateQianchuanInfluencerTagStage1Result,
} from './aios-qianchuan-production-migration-influencer-tag-stage1.mjs';
import {
  validateQianchuanInfluencerTagStage2Checkpoint,
} from './aios-qianchuan-production-migration-influencer-tag-stage2.mjs';
import {
  assertPinnedMigrationReviewArtifact,
} from './aios-qianchuan-production-migration-review-decisions.mjs';

const REVIEWER = 'repository-owner';
const DECISION_COHORT = 'P1D_INFLUENCER_TAG_FORWARD_REPAIR';
const AUTHORIZATION_EVIDENCE = 'explicit_influencer_tag_forward_repair_owner_review';
const TARGET = Object.freeze({
  checksum: '8d94ae900ab7ece5f389cd93f1a7510597556b7022f9cddbe32884af82430a6a',
  identity: 'warehouse/20260510_1800',
  lineageFamily: 'influencer_tag_normalization',
  namespace: 'warehouse',
  sourcePath: 'etl/groland_postgres/sql/migrations/20260510_1800__normalize_influencer_library_anchor_tags.sql',
  version: '20260510_1800',
});
const EVIDENCE_KINDS = Object.freeze([
  'prior_owner_review_decisions',
  'influencer_tag_repair_plan',
  'influencer_tag_stage1',
  'influencer_tag_stage2_completed_checkpoint',
  'influencer_tag_independent_postrepair_probe',
]);
const RATIONALE = 'The pinned exact backup, normalizer installation, canary, completed bounded Stage 2 repair and later independent read-only zero-drift probe prove the equivalent forward repair; this does not claim the historical migration executed.';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function identity(value) {
  return `${value.namespace}/${value.version}`;
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp with milliseconds.`);
  }
}

function assertSameArtifact(actual, expected, label) {
  if (actual?.path !== expected?.path
    || actual?.bytes !== expected?.bytes
    || actual?.sha256 !== expected?.sha256) {
    throw new Error(`${label} differs from the pinned source artifact.`);
  }
}

function artifactLink(kind, artifact) {
  return { bytes: artifact.bytes, kind, path: artifact.path, sha256: artifact.sha256 };
}

function priorDecisionContract(priorDecisions) {
  const contract = clone(priorDecisions);
  delete contract.decisions;
  return contract;
}

function reconstructPriorDecisions(contract, rows) {
  return { ...clone(contract), decisions: clone(rows) };
}

function assertEvidencePredatesReview(evidence, reviewedAt, label) {
  assertIsoTimestamp(evidence?.generatedAt, `${label} generatedAt`);
  if (Date.parse(evidence.generatedAt) > Date.parse(reviewedAt)) {
    throw new Error(`${label} must predate the influencer-tag owner review decision.`);
  }
}

function evidenceLinks(sourceArtifacts) {
  const artifacts = {
    prior_owner_review_decisions: sourceArtifacts.priorDecisions,
    influencer_tag_repair_plan: sourceArtifacts.plan,
    influencer_tag_stage1: sourceArtifacts.stage1,
    influencer_tag_stage2_completed_checkpoint: sourceArtifacts.stage2Checkpoint,
    influencer_tag_independent_postrepair_probe: sourceArtifacts.postrepairProbe,
  };
  return EVIDENCE_KINDS.map((kind) => artifactLink(kind, artifacts[kind]));
}

function buildSummary(priorDecisions) {
  const priorTotal = priorDecisions.decisions.length;
  return {
    decisions: priorTotal + 1,
    priorDecisions: priorTotal,
    newDecisions: 1,
    unresolvedP1dEntries: priorDecisions.summary.unresolvedP1dEntries - 1,
    byCohort: {
      ...clone(priorDecisions.summary.byCohort),
      P1D: priorDecisions.summary.byCohort.P1D + 1,
    },
    decisionsByType: {
      ...clone(priorDecisions.summary.decisionsByType),
      verified_forward_repaired:
        (priorDecisions.summary.decisionsByType.verified_forward_repaired ?? 0) + 1,
    },
    ledgerActions: { do_not_record: priorTotal + 1 },
    reviewStatuses: {
      ...clone(priorDecisions.summary.reviewStatuses),
      verified_forward_repaired:
        (priorDecisions.summary.reviewStatuses.verified_forward_repaired ?? 0) + 1,
    },
  };
}

function assertForwardRepairEvidence({
  plan,
  planArtifact,
  planSha256,
  postrepairProbe,
  postrepairProbeArtifact,
  postrepairProbeSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
  stage1,
  stage1Artifact,
  stage1Sha256,
  stage2Checkpoint,
  stage2CheckpointArtifact,
  stage2CheckpointSha256,
}) {
  validateQianchuanAlimamaRuntimeRetirementDecisions(priorDecisions);
  validateQianchuanInfluencerTagRepairPlan(plan);
  validateQianchuanInfluencerTagStage1Result(stage1);
  validateQianchuanInfluencerTagStage2Checkpoint(stage2Checkpoint, {
    plan,
    planArtifact,
    stage1,
    stage1Artifact,
  });
  validateQianchuanInfluencerTagPostrepairReadonlyProbe(postrepairProbe);
  for (const [artifact, sha256, label] of [
    [priorDecisionsArtifact, priorDecisionsSha256, 'Prior owner decisions'],
    [planArtifact, planSha256, 'Influencer-tag repair plan'],
    [stage1Artifact, stage1Sha256, 'Influencer-tag Stage 1'],
    [stage2CheckpointArtifact, stage2CheckpointSha256, 'Influencer-tag completed Stage 2'],
    [postrepairProbeArtifact, postrepairProbeSha256, 'Influencer-tag independent postrepair'],
  ]) {
    assertPinnedMigrationReviewArtifact(artifact, sha256, label);
  }
  if (priorDecisions.summary?.unresolvedP1dEntries !== 3
    || priorDecisions.decisions.some((entry) => identity(entry) === TARGET.identity)) {
    throw new Error('Prior owner decisions no longer expose the exact unresolved influencer-tag entry.');
  }
  if (plan.target?.identity !== TARGET.identity
    || plan.target?.checksum !== TARGET.checksum
    || plan.target?.source?.path !== TARGET.sourcePath
    || plan.target?.source?.sha256 !== TARGET.checksum
    || stage1.target?.identity !== TARGET.identity
    || stage1.target?.checksum !== TARGET.checksum
    || stage2Checkpoint.target?.identity !== TARGET.identity
    || stage2Checkpoint.target?.checksum !== TARGET.checksum
    || postrepairProbe.target?.identity !== TARGET.identity
    || postrepairProbe.target?.checksum !== TARGET.checksum
    || postrepairProbe.target?.source?.path !== TARGET.sourcePath
    || postrepairProbe.target?.source?.sha256 !== TARGET.checksum) {
    throw new Error('Influencer-tag forward-repair evidence target drifted.');
  }
  assertSameArtifact(stage1.sourceArtifacts?.plan, planArtifact, 'Influencer-tag Stage 1 plan');
  assertSameArtifact(
    stage1.sourceArtifacts?.readinessProbe,
    plan.sourceArtifact,
    'Influencer-tag Stage 1 readiness probe',
  );
  if (stage1.backup?.rows !== plan.execution?.changes?.length
    || stage1.backup?.rowsSha256 !== stage2Checkpoint.postcheck?.backupRowsSha256
    || stage1.canary?.id !== plan.execution?.canary?.id
    || stage1.canary?.expectedSha256 !== plan.execution?.canary?.expectedSha256
    || stage1.forwardFunction?.sourceSha256
      !== plan.execution?.forwardFunction?.definitionSha256
    || stage2Checkpoint.status !== 'completed'
    || stage2Checkpoint.remainingMismatchRows !== 0
    || stage2Checkpoint.initialRemainingRows !== plan.execution?.batching?.remainingRows
    || stage2Checkpoint.cumulativeUpdatedRows !== plan.execution?.batching?.remainingRows
    || stage2Checkpoint.completedRows?.length !== plan.execution?.changes?.length
    || stage2Checkpoint.postcheck?.activeRows !== plan.observed?.activeRows
    || stage2Checkpoint.postcheck?.backupRows !== plan.execution?.changes?.length
    || stage2Checkpoint.forwardFunctionSourceSha256 !== stage1.forwardFunction.sourceSha256
    || stage2Checkpoint.forwardFunctionCatalogSha256
      !== stage1.forwardFunction.catalogDefinitionSha256
    || stage2Checkpoint.policy?.fullBackfillExecuted !== true
    || stage2Checkpoint.policy?.independentPostrepairVerified !== false
    || stage2Checkpoint.policy?.ledgerWritten !== false
    || stage2Checkpoint.policy?.ownerDecisionRecorded !== false) {
    throw new Error('Influencer-tag Stage 1/2 evidence is not complete for owner review.');
  }
  const normalizeRoutine = postrepairProbe.catalog?.routines?.find((routine) => (
    routine.signature === 'ads.fn_influencer_library_normalize_anchor_tag(text)'
  ));
  if (Date.parse(postrepairProbe.generatedAt) <= Date.parse(stage2Checkpoint.generatedAt)
    || postrepairProbe.summary?.activeRows !== plan.observed?.activeRows
    || postrepairProbe.summary?.mismatchRows !== 0
    || postrepairProbe.summary?.waitingLocks !== 0
    || normalizeRoutine?.definitionSha256 !== stage2Checkpoint.forwardFunctionCatalogSha256) {
    throw new Error('Independent influencer-tag postrepair does not prove the completed Stage 2 result.');
  }
}

export function buildQianchuanInfluencerTagForwardRepairDecisions({
  confirmed = false,
  generatedAt = new Date().toISOString(),
  plan,
  planArtifact,
  planSha256,
  postrepairProbe,
  postrepairProbeArtifact,
  postrepairProbeSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
  reviewedAt,
  reviewer,
  stage1,
  stage1Artifact,
  stage1Sha256,
  stage2Checkpoint,
  stage2CheckpointArtifact,
  stage2CheckpointSha256,
}) {
  if (confirmed !== true) {
    throw new Error('Influencer-tag forward-repair owner decision requires the explicit confirmation flag.');
  }
  assertIsoTimestamp(generatedAt, 'Influencer-tag decision artifact generatedAt');
  assertIsoTimestamp(reviewedAt, 'Influencer-tag decision reviewedAt');
  if (reviewer !== REVIEWER) {
    throw new Error(`Influencer-tag decision reviewer must be the neutral identity ${REVIEWER}.`);
  }
  if (Date.parse(generatedAt) < Date.parse(reviewedAt)) {
    throw new Error('Influencer-tag decision artifact cannot predate the owner review.');
  }
  const evidence = {
    plan,
    planArtifact,
    planSha256,
    postrepairProbe,
    postrepairProbeArtifact,
    postrepairProbeSha256,
    priorDecisions,
    priorDecisionsArtifact,
    priorDecisionsSha256,
    stage1,
    stage1Artifact,
    stage1Sha256,
    stage2Checkpoint,
    stage2CheckpointArtifact,
    stage2CheckpointSha256,
  };
  assertForwardRepairEvidence(evidence);
  for (const [artifact, label] of [
    [priorDecisions, 'Prior owner decisions'],
    [plan, 'Influencer-tag repair plan'],
    [stage1, 'Influencer-tag Stage 1'],
    [stage2Checkpoint, 'Influencer-tag completed Stage 2'],
    [postrepairProbe, 'Influencer-tag independent postrepair'],
  ]) {
    assertEvidencePredatesReview(artifact, reviewedAt, label);
  }
  const sourceArtifacts = {
    priorDecisions: priorDecisionsArtifact,
    plan: planArtifact,
    stage1: stage1Artifact,
    stage2Checkpoint: stage2CheckpointArtifact,
    postrepairProbe: postrepairProbeArtifact,
  };
  const newDecision = {
    checksum: TARGET.checksum,
    decision: 'verified_forward_repaired',
    decisionCohort: DECISION_COHORT,
    evidenceLinks: evidenceLinks(sourceArtifacts),
    executionEvidence: 'verified_bounded_forward_repair',
    historicalExecution: false,
    ledgerAction: 'do_not_record',
    lineageFamily: TARGET.lineageFamily,
    namespace: TARGET.namespace,
    rationale: RATIONALE,
    reviewStatus: 'verified_forward_repaired',
    reviewWave: 'P1D',
    reviewedAt,
    reviewer,
    sourceClassification: 'unknown',
    version: TARGET.version,
  };
  const result = {
    schemaVersion: 5,
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
      historicalMigrationReplayed: false,
      ledgerWritesAuthorized: false,
      networkAccess: false,
      ownerDecisionRecorded: true,
      priorDecisionArtifactMutated: false,
      productionWritesAuthorized: false,
      unrelatedP1dOwnerDecisionsRecorded: false,
    },
    summary: buildSummary(priorDecisions),
    decisions: [...clone(priorDecisions.decisions), newDecision],
  };
  return validateQianchuanInfluencerTagForwardRepairDecisions(result, {
    plan,
    postrepairProbe,
    priorDecisions,
    stage1,
    stage2Checkpoint,
  });
}

export function validateQianchuanInfluencerTagForwardRepairDecisions(decisions, {
  manifest,
  manifestArtifact,
  plan,
  postrepairProbe,
  priorDecisions,
  stage1,
  stage2Checkpoint,
} = {}) {
  if (decisions?.schemaVersion !== 5
    || decisions.mode !== 'offline_owner_review_decisions'
    || decisions.authorization?.reviewer !== REVIEWER
    || decisions.authorization?.evidence !== AUTHORIZATION_EVIDENCE
    || decisions.authorization?.newDecisionCohort !== DECISION_COHORT
    || decisions.policy?.decision !== 'verified_forward_repaired'
    || decisions.policy?.forwardRepairVerified !== true
    || decisions.policy?.historicalExecution !== false
    || decisions.policy?.historicalMigrationReplayed !== false
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
    throw new Error('Influencer-tag forward-repair owner decision policy or authorization is invalid.');
  }
  assertIsoTimestamp(decisions.generatedAt, 'Influencer-tag decision artifact generatedAt');
  const priorCount = decisions.summary?.priorDecisions;
  if (!Number.isSafeInteger(priorCount) || priorCount < 1
    || !Array.isArray(decisions.decisions)
    || decisions.decisions.length !== priorCount + 1) {
    throw new Error('Influencer-tag forward-repair owner decision count is invalid.');
  }
  const priorRows = decisions.decisions.slice(0, priorCount);
  const priorArtifact = reconstructPriorDecisions(decisions.priorDecisionContract, priorRows);
  validateQianchuanAlimamaRuntimeRetirementDecisions(priorArtifact, {
    manifest,
    manifestArtifact,
  });
  if (JSON.stringify(decisions.summary) !== JSON.stringify(buildSummary(priorArtifact))) {
    throw new Error('Influencer-tag forward-repair owner decision summary is inconsistent.');
  }
  if (priorDecisions && JSON.stringify(priorArtifact) !== JSON.stringify(priorDecisions)) {
    throw new Error('Influencer-tag decision artifact mutated prior owner decisions.');
  }
  for (const [label, artifact] of Object.entries(decisions.sourceArtifacts ?? {})) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Influencer-tag ${label} artifact`);
  }
  const row = decisions.decisions.at(-1);
  assertIsoTimestamp(row?.reviewedAt, 'Influencer-tag owner decision reviewedAt');
  if (Date.parse(decisions.generatedAt) < Date.parse(row.reviewedAt)
    || identity(row ?? {}) !== TARGET.identity
    || row.checksum !== TARGET.checksum
    || row.lineageFamily !== TARGET.lineageFamily
    || row.decision !== 'verified_forward_repaired'
    || row.reviewStatus !== 'verified_forward_repaired'
    || row.executionEvidence !== 'verified_bounded_forward_repair'
    || row.historicalExecution !== false
    || row.ledgerAction !== 'do_not_record'
    || row.reviewer !== REVIEWER
    || row.sourceClassification !== 'unknown'
    || row.decisionCohort !== DECISION_COHORT
    || row.reviewWave !== 'P1D'
    || row.rationale !== RATIONALE
    || decisions.authorization.acceptedOn !== row.reviewedAt.slice(0, 10)
    || JSON.stringify(row.evidenceLinks) !== JSON.stringify(evidenceLinks(decisions.sourceArtifacts))) {
    throw new Error('Influencer-tag forward-repair owner decision is invalid.');
  }
  if (manifest) {
    const entry = manifest.entries.find((value) => identity(value) === TARGET.identity);
    if (!entry || entry.checksum !== TARGET.checksum || entry.classification !== 'unknown') {
      throw new Error('Influencer-tag migration no longer matches the owner-decision manifest.');
    }
  }
  if (plan || stage1 || stage2Checkpoint || postrepairProbe) {
    if (!plan || !stage1 || !stage2Checkpoint || !postrepairProbe) {
      throw new Error('Influencer-tag decision evidence validation requires all repair artifacts.');
    }
    assertForwardRepairEvidence({
      plan,
      planArtifact: decisions.sourceArtifacts.plan,
      planSha256: decisions.sourceArtifacts.plan.sha256,
      postrepairProbe,
      postrepairProbeArtifact: decisions.sourceArtifacts.postrepairProbe,
      postrepairProbeSha256: decisions.sourceArtifacts.postrepairProbe.sha256,
      priorDecisions: priorArtifact,
      priorDecisionsArtifact: decisions.sourceArtifacts.priorDecisions,
      priorDecisionsSha256: decisions.sourceArtifacts.priorDecisions.sha256,
      stage1,
      stage1Artifact: decisions.sourceArtifacts.stage1,
      stage1Sha256: decisions.sourceArtifacts.stage1.sha256,
      stage2Checkpoint,
      stage2CheckpointArtifact: decisions.sourceArtifacts.stage2Checkpoint,
      stage2CheckpointSha256: decisions.sourceArtifacts.stage2Checkpoint.sha256,
    });
    for (const [artifact, label] of [
      [priorArtifact, 'Prior owner decisions'],
      [plan, 'Influencer-tag repair plan'],
      [stage1, 'Influencer-tag Stage 1'],
      [stage2Checkpoint, 'Influencer-tag completed Stage 2'],
      [postrepairProbe, 'Influencer-tag independent postrepair'],
    ]) {
      assertEvidencePredatesReview(artifact, row.reviewedAt, label);
    }
  }
  return decisions;
}
