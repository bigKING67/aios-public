import {
  validateQianchuanAlimamaRuntimeReplacementReadonlyProbe,
} from './aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs';
import {
  validateQianchuanAlimamaRuntimeRetirementPlan,
} from './aios-qianchuan-production-migration-alimama-runtime-retirement-plan.mjs';
import {
  validateQianchuanProductionMigrationP1dForwardRepairDecisions,
} from './aios-qianchuan-production-migration-p1d-forward-repair-decisions.mjs';
import {
  assertPinnedMigrationReviewArtifact,
} from './aios-qianchuan-production-migration-review-decisions.mjs';

const REVIEWER = 'repository-owner';
const DECISION_COHORT = 'P1D_RUNTIME_RETIREMENT';
const AUTHORIZATION_EVIDENCE = 'explicit_alimama_runtime_retirement_owner_review';
const TARGET_IDENTITY = 'warehouse/20260212_1600';
const TARGET_CHECKSUM = '092938c17614ae5ac464eb77a35828714bda5440b1b46a6b38256f56994c2d9c';
const TARGET_FAMILY = 'alimama_incremental_rename';
const EVIDENCE_KINDS = Object.freeze([
  'prior_owner_review_decisions',
  'alimama_runtime_replacement_readonly_probe',
  'alimama_runtime_retirement_plan',
]);
const RATIONALE = 'The pinned schema-v2 probe and offline retirement plan prove that the historical Alimama DWD/DWS/ADS chain is retired and fully replaced by the active, populated, watermark-covered report runtime; this does not claim the historical migration executed.';

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

function assertEvidencePredatesReview(evidence, reviewedAt, label) {
  assertIsoTimestamp(evidence?.generatedAt, `${label} generatedAt`);
  if (Date.parse(evidence.generatedAt) > Date.parse(reviewedAt)) {
    throw new Error(`${label} must predate the Alimama owner review decision.`);
  }
}

function evidenceLinks(sourceArtifacts) {
  const artifacts = {
    prior_owner_review_decisions: sourceArtifacts.priorDecisions,
    alimama_runtime_replacement_readonly_probe: sourceArtifacts.probe,
    alimama_runtime_retirement_plan: sourceArtifacts.plan,
  };
  return EVIDENCE_KINDS.map((kind) => artifactLink(kind, artifacts[kind]));
}

function assertReplacementEvidence({
  plan,
  planArtifact,
  planSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
  probe,
  probeArtifact,
  probeSha256,
}) {
  validateQianchuanProductionMigrationP1dForwardRepairDecisions(priorDecisions);
  validateQianchuanAlimamaRuntimeReplacementReadonlyProbe(probe);
  validateQianchuanAlimamaRuntimeRetirementPlan(plan);
  for (const [artifact, sha256, label] of [
    [priorDecisionsArtifact, priorDecisionsSha256, 'Prior P1D owner decisions'],
    [probeArtifact, probeSha256, 'Alimama replacement probe'],
    [planArtifact, planSha256, 'Alimama retirement plan'],
  ]) {
    assertPinnedMigrationReviewArtifact(artifact, sha256, label);
  }
  assertSameArtifact(plan.sourceArtifacts?.probe, probeArtifact, 'Alimama retirement plan probe');
  if (probe.target?.identity !== TARGET_IDENTITY
    || probe.target?.checksum !== TARGET_CHECKSUM
    || plan.target?.identity !== TARGET_IDENTITY
    || plan.target?.checksum !== TARGET_CHECKSUM
    || probe.summary?.runtimeReplacementReady !== true
    || plan.summary?.retirementRecommendationReady !== true
    || plan.recommendation?.recommendedOwnerDecision !== 'not_applicable'
    || plan.recommendation?.reviewStatus !== 'verified_not_applicable_candidate'
    || plan.recommendation?.historicalExecution !== false
    || plan.recommendation?.ledgerAction !== 'do_not_record'
    || plan.recommendation?.ownerConfirmationRequired !== true
    || plan.forwardMigration?.required !== false
    || plan.forwardMigration?.sqlStatements?.length !== 0
    || plan.forwardMigration?.dataMutationRows !== 0) {
    throw new Error('Alimama replacement evidence is not ready for an owner decision.');
  }
  if (priorDecisions.summary?.unresolvedP1dEntries !== 4
    || priorDecisions.decisions.some((entry) => identity(entry) === TARGET_IDENTITY)) {
    throw new Error('Prior owner decisions no longer expose the exact unresolved Alimama entry.');
  }
}

function buildSummary(priorDecisions) {
  const priorTotal = priorDecisions.decisions.length;
  return {
    decisions: priorTotal + 1,
    priorDecisions: priorTotal,
    newDecisions: 1,
    unresolvedP1dEntries: 3,
    byCohort: {
      ...clone(priorDecisions.summary.byCohort),
      P1D: priorDecisions.summary.byCohort.P1D + 1,
    },
    decisionsByType: {
      ...clone(priorDecisions.summary.decisionsByType),
      not_applicable: priorDecisions.summary.decisionsByType.not_applicable + 1,
    },
    ledgerActions: { do_not_record: priorTotal + 1 },
    reviewStatuses: {
      ...clone(priorDecisions.summary.reviewStatuses),
      verified_not_applicable: priorDecisions.summary.reviewStatuses.verified_not_applicable + 1,
    },
  };
}

export function buildQianchuanAlimamaRuntimeRetirementDecisions({
  confirmed = false,
  generatedAt = new Date().toISOString(),
  plan,
  planArtifact,
  planSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
  probe,
  probeArtifact,
  probeSha256,
  reviewedAt,
  reviewer,
}) {
  if (confirmed !== true) {
    throw new Error('Alimama runtime retirement owner decision requires the explicit confirmation flag.');
  }
  assertIsoTimestamp(generatedAt, 'Alimama decision artifact generatedAt');
  assertIsoTimestamp(reviewedAt, 'Alimama decision reviewedAt');
  if (reviewer !== REVIEWER) {
    throw new Error(`Alimama decision reviewer must be the neutral identity ${REVIEWER}.`);
  }
  if (Date.parse(generatedAt) < Date.parse(reviewedAt)) {
    throw new Error('Alimama decision artifact cannot predate the owner review.');
  }
  assertReplacementEvidence({
    plan,
    planArtifact,
    planSha256,
    priorDecisions,
    priorDecisionsArtifact,
    priorDecisionsSha256,
    probe,
    probeArtifact,
    probeSha256,
  });
  for (const [evidence, label] of [
    [priorDecisions, 'Prior P1D owner decisions'],
    [probe, 'Alimama replacement probe'],
    [plan, 'Alimama retirement plan'],
  ]) {
    assertEvidencePredatesReview(evidence, reviewedAt, label);
  }
  const sourceArtifacts = {
    priorDecisions: priorDecisionsArtifact,
    probe: probeArtifact,
    plan: planArtifact,
  };
  const newDecision = {
    namespace: 'warehouse',
    version: '20260212_1600',
    checksum: TARGET_CHECKSUM,
    decision: 'not_applicable',
    decisionCohort: DECISION_COHORT,
    evidenceLinks: evidenceLinks(sourceArtifacts),
    executionEvidence: 'verified_active_runtime_replacement',
    historicalExecution: false,
    ledgerAction: 'do_not_record',
    lineageFamily: TARGET_FAMILY,
    rationale: RATIONALE,
    reviewStatus: 'verified_not_applicable',
    reviewWave: 'P1D',
    reviewedAt,
    reviewer,
    sourceClassification: 'unknown',
  };
  const result = {
    schemaVersion: 4,
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
      decision: 'not_applicable',
      deployAuthorized: false,
      historicalExecution: false,
      ledgerWritesAuthorized: false,
      networkAccess: false,
      ownerDecisionRecorded: true,
      priorDecisionArtifactMutated: false,
      productionWritesAuthorized: false,
      runtimeRetirementVerified: true,
      unrelatedP1dOwnerDecisionsRecorded: false,
    },
    summary: buildSummary(priorDecisions),
    decisions: [...clone(priorDecisions.decisions), newDecision],
  };
  return validateQianchuanAlimamaRuntimeRetirementDecisions(result, {
    plan,
    priorDecisions,
    probe,
  });
}

export function validateQianchuanAlimamaRuntimeRetirementDecisions(decisions, {
  manifest,
  manifestArtifact,
  plan,
  priorDecisions,
  probe,
} = {}) {
  if (decisions?.schemaVersion !== 4
    || decisions.mode !== 'offline_owner_review_decisions'
    || decisions.authorization?.reviewer !== REVIEWER
    || decisions.authorization?.evidence !== AUTHORIZATION_EVIDENCE
    || decisions.authorization?.newDecisionCohort !== DECISION_COHORT
    || decisions.policy?.decision !== 'not_applicable'
    || decisions.policy?.runtimeRetirementVerified !== true
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
    throw new Error('Alimama runtime retirement owner decision policy or authorization is invalid.');
  }
  assertIsoTimestamp(decisions.generatedAt, 'Alimama decision artifact generatedAt');
  const priorCount = decisions.summary?.priorDecisions;
  if (!Number.isSafeInteger(priorCount) || priorCount < 1
    || !Array.isArray(decisions.decisions)
    || decisions.decisions.length !== priorCount + 1
    || decisions.summary?.decisions !== priorCount + 1
    || decisions.summary?.newDecisions !== 1
    || decisions.summary?.unresolvedP1dEntries !== 3
    || decisions.summary?.byCohort?.P1D !== 5
    || decisions.summary?.decisionsByType?.not_applicable !== 20
    || decisions.summary?.decisionsByType?.verified_forward_repaired !== 1
    || decisions.summary?.ledgerActions?.do_not_record !== priorCount + 1
    || decisions.summary?.reviewStatuses?.verified_not_applicable !== 20
    || decisions.summary?.reviewStatuses?.verified_forward_repaired !== 1) {
    throw new Error('Alimama runtime retirement owner decision summary is inconsistent.');
  }
  const priorRows = decisions.decisions.slice(0, priorCount);
  const priorArtifact = reconstructPriorDecisions(decisions.priorDecisionContract, priorRows);
  validateQianchuanProductionMigrationP1dForwardRepairDecisions(priorArtifact, {
    manifest,
    manifestArtifact,
  });
  if (priorDecisions && JSON.stringify(priorArtifact) !== JSON.stringify(priorDecisions)) {
    throw new Error('Alimama decision artifact mutated prior owner decisions.');
  }
  for (const [label, artifact] of Object.entries(decisions.sourceArtifacts ?? {})) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Alimama ${label} artifact`);
  }
  const row = decisions.decisions.at(-1);
  assertIsoTimestamp(row?.reviewedAt, 'Alimama owner decision reviewedAt');
  if (Date.parse(decisions.generatedAt) < Date.parse(row.reviewedAt)
    || identity(row ?? {}) !== TARGET_IDENTITY
    || row.checksum !== TARGET_CHECKSUM
    || row.lineageFamily !== TARGET_FAMILY
    || row.decision !== 'not_applicable'
    || row.reviewStatus !== 'verified_not_applicable'
    || row.executionEvidence !== 'verified_active_runtime_replacement'
    || row.historicalExecution !== false
    || row.ledgerAction !== 'do_not_record'
    || row.reviewer !== REVIEWER
    || row.sourceClassification !== 'unknown'
    || row.decisionCohort !== DECISION_COHORT
    || row.reviewWave !== 'P1D'
    || row.rationale !== RATIONALE
    || decisions.authorization.acceptedOn !== row.reviewedAt.slice(0, 10)
    || JSON.stringify(row.evidenceLinks) !== JSON.stringify(evidenceLinks(decisions.sourceArtifacts))) {
    throw new Error('Alimama runtime retirement owner decision is invalid.');
  }
  if (manifest) {
    const entry = manifest.entries.find((value) => identity(value) === TARGET_IDENTITY);
    if (!entry || entry.checksum !== TARGET_CHECKSUM || entry.classification !== 'unknown') {
      throw new Error('Alimama migration no longer matches the owner-decision manifest.');
    }
  }
  if (probe || plan) {
    if (!probe || !plan) {
      throw new Error('Alimama decision evidence validation requires both probe and plan artifacts.');
    }
    assertReplacementEvidence({
      plan,
      planArtifact: decisions.sourceArtifacts.plan,
      planSha256: decisions.sourceArtifacts.plan.sha256,
      priorDecisions: priorArtifact,
      priorDecisionsArtifact: decisions.sourceArtifacts.priorDecisions,
      priorDecisionsSha256: decisions.sourceArtifacts.priorDecisions.sha256,
      probe,
      probeArtifact: decisions.sourceArtifacts.probe,
      probeSha256: decisions.sourceArtifacts.probe.sha256,
    });
    for (const [evidence, label] of [
      [priorArtifact, 'Prior P1D owner decisions'],
      [probe, 'Alimama replacement probe'],
      [plan, 'Alimama retirement plan'],
    ]) {
      assertEvidencePredatesReview(evidence, row.reviewedAt, label);
    }
  }
  return decisions;
}
