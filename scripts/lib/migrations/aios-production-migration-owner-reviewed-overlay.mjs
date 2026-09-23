import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  validateQianchuanLedgerExceptionSourceDecisions,
} from './aios-qianchuan-production-migration-ledger-exception-owner-overlay.mjs';
import {
  validateQianchuanProductionMigrationManifest,
} from './aios-qianchuan-production-migration-review-queue.mjs';

const REVIEWER = 'repository-owner';
const REVIEW_CONFIRMATION = 'accept_reviewed_migration_decisions';
const REVIEW_AUTHORIZATION_SOURCE = 'explicit_current_user_authorization';
const REVIEW_SPEC_MODE = 'offline_owner_review_spec';
const OWNER_DECISIONS_MODE = 'offline_owner_reviewed_migration_decisions';
const REVIEW_OVERLAY_MODE = 'offline_owner_reviewed_manifest_overlay';
const EXCEPTION_COHORT = 'FIRST_BLOCKER_TOPOLOGY';

const DECISION_CONTRACTS = new Map([
  ['applied_and_verified', {
    ledgerAction: 'eligible_for_selective_recording',
    reviewStatus: 'verified',
  }],
  ['not_applicable', {
    ledgerAction: 'do_not_record',
    reviewStatus: 'verified_not_applicable',
  }],
]);

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

function assertTimestampOrder(earlier, later, label) {
  if (Date.parse(later) < Date.parse(earlier)) {
    throw new Error(`${label} cannot precede its source review.`);
  }
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => (
    left.localeCompare(right)
  )));
}

function artifactLink(kind, artifact) {
  return {
    kind,
    path: artifact.path,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
  };
}

function manifestEntries(manifest) {
  return new Map(manifest.entries.map((entry) => [identity(entry), entry]));
}

function repositoryEntries(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Owner review requires the current repository migration inventory.');
  }
  const entries = new Map();
  for (const record of records) {
    const recordIdentity = identity(record ?? {});
    if (entries.has(recordIdentity)) {
      throw new Error(`Repository migration inventory contains duplicate ${recordIdentity}.`);
    }
    if (!['backend', 'warehouse'].includes(record?.namespace)
      || typeof record.version !== 'string' || !record.version
      || !/^[a-f0-9]{64}$/u.test(record.checksum ?? '')) {
      throw new Error(`Repository migration inventory contains invalid ${recordIdentity}.`);
    }
    entries.set(recordIdentity, record);
  }
  return entries;
}

function requireRepositoryRecords(records) {
  repositoryEntries(records);
  return records;
}

function decisionContract(decision, label) {
  const contract = DECISION_CONTRACTS.get(decision);
  if (!contract) throw new Error(`${label} has an unsupported owner decision.`);
  return contract;
}

function validateDecisionIntent(row, label) {
  if (!['backend', 'warehouse'].includes(row?.namespace)
    || typeof row.version !== 'string' || !row.version
    || !/^[a-f0-9]{64}$/u.test(row.checksum ?? '')
    || typeof row.rationale !== 'string' || !row.rationale.trim()) {
    throw new Error(`${label} identity, checksum, or rationale is invalid.`);
  }
  decisionContract(row.decision, label);
  if (row.decision === 'applied_and_verified' && row.historicalExecution !== true) {
    throw new Error(`${label} applied_and_verified requires historicalExecution=true.`);
  }
  if (row.decision === 'not_applicable'
    && ![false, null].includes(row.historicalExecution ?? null)) {
    throw new Error(`${label} not_applicable cannot claim historical execution.`);
  }
}

function assertDecisionMatchesManifest(row, entries, label) {
  const entry = entries.get(identity(row));
  if (!entry || entry.checksum !== row.checksum) {
    throw new Error(`${identity(row)} ${label} differs from the pinned reconciliation manifest.`);
  }
  if (entry.classification !== 'unknown'
    || entry.executionEvidenceState !== 'unknown'
    || entry.ledgerAction !== 'withhold_pending_proof') {
    throw new Error(`${identity(row)} is no longer an unresolved owner-review candidate.`);
  }
  return entry;
}

function assertDecisionMatchesRepository(row, entries, label) {
  const entry = entries.get(identity(row));
  if (!entry || entry.checksum !== row.checksum) {
    throw new Error(`${identity(row)} ${label} differs from the current repository inventory.`);
  }
  return entry;
}

export function validateAiosProductionMigrationOwnerReviewSpec(
  reviewSpec,
  { evidenceArtifact, manifest, records } = {},
) {
  assertIsoTimestamp(reviewSpec?.generatedAt, 'Owner review spec generatedAt');
  assertIsoTimestamp(reviewSpec?.authorization?.reviewedAt, 'Owner review spec reviewedAt');
  if (reviewSpec.schemaVersion !== 1
    || reviewSpec.mode !== REVIEW_SPEC_MODE
    || reviewSpec.authorization.confirmation !== REVIEW_CONFIRMATION
    || reviewSpec.authorization.reviewer !== REVIEWER
    || reviewSpec.authorization.source !== REVIEW_AUTHORIZATION_SOURCE
    || reviewSpec.policy?.networkAccess !== false
    || reviewSpec.policy?.productionWritesAuthorized !== false
    || reviewSpec.policy?.ledgerWritesAuthorized !== false
    || reviewSpec.policy?.migrationApplyAuthorized !== false
    || reviewSpec.policy?.deployAuthorized !== false
    || reviewSpec.policy?.sourceManifestMutationAuthorized !== false
    || !Array.isArray(reviewSpec.decisions)
    || reviewSpec.decisions.length === 0) {
    throw new Error('Owner review spec policy, authorization, or decision list is invalid.');
  }
  assertTimestampOrder(
    reviewSpec.authorization.reviewedAt,
    reviewSpec.generatedAt,
    'Owner review spec generatedAt',
  );
  const pinnedEvidence = reviewSpec.sourceArtifacts?.evidencePack;
  assertPinnedMigrationReviewArtifact(
    pinnedEvidence,
    pinnedEvidence?.sha256,
    'Owner review spec evidence pack',
  );
  if (evidenceArtifact
    && (pinnedEvidence.sha256 !== evidenceArtifact.sha256
      || pinnedEvidence.bytes !== evidenceArtifact.bytes)) {
    throw new Error('Owner review spec evidence pack differs from the explicit pin.');
  }
  const entries = manifest ? manifestEntries(validateQianchuanProductionMigrationManifest(manifest)) : null;
  const repository = records ? repositoryEntries(records) : null;
  const seen = new Set();
  for (const row of reviewSpec.decisions) {
    const rowIdentity = identity(row ?? {});
    if (seen.has(rowIdentity)) throw new Error(`Owner review spec contains duplicate ${rowIdentity}.`);
    seen.add(rowIdentity);
    validateDecisionIntent(row, `${rowIdentity} review spec`);
    if (entries) assertDecisionMatchesManifest(row, entries, 'review spec');
    if (repository) assertDecisionMatchesRepository(row, repository, 'review spec');
  }
  return reviewSpec;
}

function expectedOwnerDecision(row, reviewSpec, evidenceLinks) {
  const contract = decisionContract(row.decision, identity(row));
  return {
    namespace: row.namespace,
    version: row.version,
    checksum: row.checksum,
    decision: row.decision,
    reviewStatus: contract.reviewStatus,
    ledgerAction: contract.ledgerAction,
    sourceClassification: 'unknown',
    historicalExecution: row.historicalExecution ?? null,
    rationale: row.rationale,
    reviewer: reviewSpec.authorization.reviewer,
    reviewedAt: reviewSpec.authorization.reviewedAt,
    evidenceLinks: evidenceLinks.map((link) => ({ ...link })),
    ...(row.decision === 'applied_and_verified' ? {
      executionEvidence: {
        kind: 'migration_specific_owner_review',
        evidenceArtifactSha256: reviewSpec.sourceArtifacts.evidencePack.sha256,
      },
    } : {}),
  };
}

function ownerDecisionSummary(rows) {
  return {
    decisions: rows.length,
    decisionsByType: countBy(rows, (row) => row.decision),
    ledgerActions: countBy(rows, (row) => row.ledgerAction),
    reviewStatuses: countBy(rows, (row) => row.reviewStatus),
  };
}

export function buildAiosProductionMigrationOwnerDecisions({
  evidenceArtifact,
  evidenceSha256,
  generatedAt = new Date().toISOString(),
  manifest,
  manifestArtifact,
  manifestSha256,
  records,
  reviewSpec,
  reviewSpecArtifact,
  reviewSpecSha256,
}) {
  validateQianchuanProductionMigrationManifest(manifest);
  assertPinnedMigrationReviewArtifact(manifestArtifact, manifestSha256, 'Owner review manifest');
  assertPinnedMigrationReviewArtifact(evidenceArtifact, evidenceSha256, 'Owner review evidence pack');
  assertPinnedMigrationReviewArtifact(reviewSpecArtifact, reviewSpecSha256, 'Owner review spec');
  validateAiosProductionMigrationOwnerReviewSpec(reviewSpec, {
    evidenceArtifact,
    manifest,
    records: requireRepositoryRecords(records),
  });
  assertIsoTimestamp(generatedAt, 'Owner decisions generatedAt');
  assertTimestampOrder(reviewSpec.authorization.reviewedAt, generatedAt, 'Owner decisions generatedAt');

  const evidenceLinks = [
    artifactLink('reconciliation_manifest', manifestArtifact),
    artifactLink('owner_review_evidence_pack', evidenceArtifact),
    artifactLink('owner_review_spec', reviewSpecArtifact),
  ];
  const rows = reviewSpec.decisions.map((row) => expectedOwnerDecision(
    row,
    reviewSpec,
    evidenceLinks,
  ));
  const decisions = {
    schemaVersion: 1,
    generatedAt,
    mode: OWNER_DECISIONS_MODE,
    authorization: {
      confirmation: reviewSpec.authorization.confirmation,
      reviewer: reviewSpec.authorization.reviewer,
      reviewedAt: reviewSpec.authorization.reviewedAt,
      source: reviewSpec.authorization.source,
    },
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      migrationApplyAuthorized: false,
      deployAuthorized: false,
      sourceManifestMutated: false,
    },
    sourceArtifacts: {
      manifest: manifestArtifact,
      evidencePack: evidenceArtifact,
      reviewSpec: reviewSpecArtifact,
    },
    summary: ownerDecisionSummary(rows),
    decisions: rows,
  };
  return validateAiosProductionMigrationOwnerDecisions(decisions, {
    evidenceArtifact,
    manifest,
    manifestArtifact,
    reviewSpec,
    reviewSpecArtifact,
    records,
  });
}

export function validateAiosProductionMigrationOwnerDecisions(
  decisions,
  {
    evidenceArtifact,
    manifest,
    manifestArtifact,
    records,
    reviewSpec,
    reviewSpecArtifact,
  } = {},
) {
  assertIsoTimestamp(decisions?.generatedAt, 'Owner decisions generatedAt');
  assertIsoTimestamp(decisions?.authorization?.reviewedAt, 'Owner decisions reviewedAt');
  if (decisions.schemaVersion !== 1
    || decisions.mode !== OWNER_DECISIONS_MODE
    || decisions.authorization.confirmation !== REVIEW_CONFIRMATION
    || decisions.authorization.reviewer !== REVIEWER
    || decisions.authorization.source !== REVIEW_AUTHORIZATION_SOURCE
    || decisions.policy?.networkAccess !== false
    || decisions.policy?.productionWritesAuthorized !== false
    || decisions.policy?.ledgerWritesAuthorized !== false
    || decisions.policy?.migrationApplyAuthorized !== false
    || decisions.policy?.deployAuthorized !== false
    || decisions.policy?.sourceManifestMutated !== false
    || !Array.isArray(decisions.decisions)
    || decisions.decisions.length === 0) {
    throw new Error('Owner decisions policy, authorization, or rows are invalid.');
  }
  assertTimestampOrder(
    decisions.authorization.reviewedAt,
    decisions.generatedAt,
    'Owner decisions generatedAt',
  );
  const expectedArtifactKeys = ['evidencePack', 'manifest', 'reviewSpec'];
  if (JSON.stringify(Object.keys(decisions.sourceArtifacts ?? {}).sort())
    !== JSON.stringify(expectedArtifactKeys)) {
    throw new Error('Owner decisions source artifacts are incomplete.');
  }
  for (const [label, artifact] of Object.entries(decisions.sourceArtifacts)) {
    assertPinnedMigrationReviewArtifact(artifact, artifact.sha256, `Owner decisions ${label}`);
  }
  const explicitArtifacts = [
    ['evidence pack', evidenceArtifact, decisions.sourceArtifacts.evidencePack],
    ['manifest', manifestArtifact, decisions.sourceArtifacts.manifest],
    ['review spec', reviewSpecArtifact, decisions.sourceArtifacts.reviewSpec],
  ];
  for (const [label, explicit, pinned] of explicitArtifacts) {
    if (explicit && (explicit.sha256 !== pinned.sha256 || explicit.bytes !== pinned.bytes)) {
      throw new Error(`Owner decisions ${label} differs from the explicit artifact.`);
    }
  }
  const entries = manifest ? manifestEntries(validateQianchuanProductionMigrationManifest(manifest)) : null;
  const repository = records ? repositoryEntries(records) : null;
  const intents = reviewSpec
    ? new Map(validateAiosProductionMigrationOwnerReviewSpec(
      reviewSpec,
      { evidenceArtifact, manifest, records },
    ).decisions.map((row) => [identity(row), row]))
    : null;
  const seen = new Set();
  for (const row of decisions.decisions) {
    const rowIdentity = identity(row ?? {});
    if (seen.has(rowIdentity)) throw new Error(`Owner decisions contain duplicate ${rowIdentity}.`);
    seen.add(rowIdentity);
    validateDecisionIntent(row, `${rowIdentity} owner decision`);
    const contract = decisionContract(row.decision, rowIdentity);
    if (row.reviewStatus !== contract.reviewStatus
      || row.ledgerAction !== contract.ledgerAction
      || row.sourceClassification !== 'unknown'
      || row.reviewer !== decisions.authorization.reviewer
      || row.reviewedAt !== decisions.authorization.reviewedAt
      || !Array.isArray(row.evidenceLinks)
      || row.evidenceLinks.length !== 3
      || JSON.stringify(row.evidenceLinks) !== JSON.stringify([
        artifactLink('reconciliation_manifest', decisions.sourceArtifacts.manifest),
        artifactLink('owner_review_evidence_pack', decisions.sourceArtifacts.evidencePack),
        artifactLink('owner_review_spec', decisions.sourceArtifacts.reviewSpec),
      ])) {
      throw new Error(`${rowIdentity} owner decision contract is invalid.`);
    }
    if (row.decision === 'applied_and_verified'
      && (row.executionEvidence?.kind !== 'migration_specific_owner_review'
        || row.executionEvidence.evidenceArtifactSha256
          !== decisions.sourceArtifacts.evidencePack.sha256)) {
      throw new Error(`${rowIdentity} applied decision lacks pinned execution evidence.`);
    }
    if (entries) assertDecisionMatchesManifest(row, entries, 'owner decision');
    if (repository) assertDecisionMatchesRepository(row, repository, 'owner decision');
    const intent = intents?.get(rowIdentity);
    if (intents && (!intent
      || row.checksum !== intent.checksum
      || row.decision !== intent.decision
      || row.historicalExecution !== (intent.historicalExecution ?? null)
      || row.rationale !== intent.rationale)) {
      throw new Error(`${rowIdentity} owner decision differs from its review spec.`);
    }
  }
  if (intents && intents.size !== decisions.decisions.length) {
    throw new Error('Owner decisions do not exactly cover the review spec.');
  }
  if (JSON.stringify(decisions.summary) !== JSON.stringify(ownerDecisionSummary(decisions.decisions))) {
    throw new Error('Owner decisions summary is inconsistent.');
  }
  return decisions;
}

function ownerReviewMetadata(decision, decisionsArtifact) {
  return {
    decision: decision.decision,
    decisionArtifactSha256: decisionsArtifact.sha256,
    evidenceArtifactSha256: decision.executionEvidence?.evidenceArtifactSha256
      ?? decision.evidenceLinks.find((link) => link.kind === 'owner_review_evidence_pack')?.sha256,
    historicalExecution: decision.historicalExecution,
    reviewedAt: decision.reviewedAt,
    reviewer: decision.reviewer,
  };
}

function reviewedEntry(sourceEntry, decision, decisionsArtifact) {
  const ownerReview = ownerReviewMetadata(decision, decisionsArtifact);
  if (decision.decision === 'not_applicable') return { ...sourceEntry, ownerReview };
  return {
    ...sourceEntry,
    candidateClassification: 'applied_and_verified',
    classification: 'applied_and_verified',
    executionEvidenceState: 'owner_reviewed_migration_specific_evidence',
    rationale: decision.rationale,
    reviewStatus: 'verified',
    reviewer: decision.reviewer,
    ledgerAction: 'eligible_for_selective_recording',
    ownerReview,
  };
}

function manifestSummary(entries) {
  const classifications = countBy(entries, (entry) => entry.classification);
  return {
    classifications,
    ledgerActions: countBy(entries, (entry) => entry.ledgerAction),
    reviewStatuses: countBy(entries, (entry) => entry.reviewStatus),
    schemaEvidenceStates: countBy(entries, (entry) => entry.schemaEvidenceState),
    unknown: classifications.unknown ?? 0,
  };
}

function manifestReadiness(manifest, summary) {
  const reconciled = summary.unknown === 0;
  const readyForLedgerBootstrap = reconciled
    && (summary.classifications.partially_applied ?? 0) === 0
    && (summary.classifications.missing ?? 0) === 0
    && (manifest.ledger?.historyFailures?.length ?? 0) === 0;
  return { reconciled, readyForLedgerBootstrap };
}

export function buildAiosProductionMigrationReviewedManifest({
  decisions,
  decisionsArtifact,
  decisionsSha256,
  generatedAt = new Date().toISOString(),
  manifest,
  manifestArtifact,
  manifestSha256,
  records,
}) {
  validateQianchuanProductionMigrationManifest(manifest);
  assertPinnedMigrationReviewArtifact(manifestArtifact, manifestSha256, 'Reviewed manifest source');
  assertPinnedMigrationReviewArtifact(decisionsArtifact, decisionsSha256, 'Reviewed manifest decisions');
  validateAiosProductionMigrationOwnerDecisions(decisions, {
    manifest,
    manifestArtifact,
    records: requireRepositoryRecords(records),
  });
  assertIsoTimestamp(generatedAt, 'Reviewed manifest generatedAt');
  assertTimestampOrder(decisions.generatedAt, generatedAt, 'Reviewed manifest generatedAt');
  const reviews = new Map(decisions.decisions.map((row) => [identity(row), row]));
  const entries = manifest.entries.map((entry) => (
    reviews.has(identity(entry))
      ? reviewedEntry(entry, reviews.get(identity(entry)), decisionsArtifact)
      : structuredClone(entry)
  ));
  const summary = manifestSummary(entries);
  const readiness = manifestReadiness(manifest, summary);
  const targetIdentity = `${manifest.target.namespace}/${manifest.target.version}`;
  const target = entries.find((entry) => identity(entry) === targetIdentity);
  const reviewedManifest = {
    ...structuredClone(manifest),
    entries,
    target,
    summary,
    ...readiness,
    reviewOverlay: {
      schemaVersion: 1,
      mode: REVIEW_OVERLAY_MODE,
      generatedAt,
      policy: {
        networkAccess: false,
        productionWritesAuthorized: false,
        ledgerWritesAuthorized: false,
        migrationApplyAuthorized: false,
        deployAuthorized: false,
        sourceManifestMutated: false,
      },
      sourceArtifacts: {
        manifest: manifestArtifact,
        ownerDecisions: decisionsArtifact,
      },
      summary: {
        reviewedEntries: decisions.decisions.length,
        appliedAndVerified: decisions.decisions.filter(
          (row) => row.decision === 'applied_and_verified',
        ).length,
        exceptionCandidates: decisions.decisions.filter(
          (row) => row.decision === 'not_applicable',
        ).length,
      },
    },
  };
  return validateAiosProductionMigrationReviewedManifest(reviewedManifest, {
    decisions,
    decisionsArtifact,
    manifest,
    manifestArtifact,
    records,
  });
}

export function validateAiosProductionMigrationReviewedManifest(
  reviewedManifest,
  { decisions, decisionsArtifact, manifest, manifestArtifact, records } = {},
) {
  validateQianchuanProductionMigrationManifest(reviewedManifest);
  const overlay = reviewedManifest.reviewOverlay;
  assertIsoTimestamp(overlay?.generatedAt, 'Reviewed manifest overlay generatedAt');
  if (overlay.schemaVersion !== 1
    || overlay.mode !== REVIEW_OVERLAY_MODE
    || overlay.policy?.networkAccess !== false
    || overlay.policy?.productionWritesAuthorized !== false
    || overlay.policy?.ledgerWritesAuthorized !== false
    || overlay.policy?.migrationApplyAuthorized !== false
    || overlay.policy?.deployAuthorized !== false
    || overlay.policy?.sourceManifestMutated !== false) {
    throw new Error('Reviewed manifest overlay policy is invalid.');
  }
  for (const [label, artifact] of Object.entries(overlay.sourceArtifacts ?? {})) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Reviewed manifest ${label}`);
  }
  if (JSON.stringify(Object.keys(overlay.sourceArtifacts ?? {}).sort())
    !== JSON.stringify(['manifest', 'ownerDecisions'])) {
    throw new Error('Reviewed manifest source artifacts are incomplete.');
  }
  if (manifestArtifact && (overlay.sourceArtifacts.manifest.sha256 !== manifestArtifact.sha256
    || overlay.sourceArtifacts.manifest.bytes !== manifestArtifact.bytes)) {
    throw new Error('Reviewed manifest source differs from the explicit manifest.');
  }
  if (decisionsArtifact && (
    overlay.sourceArtifacts.ownerDecisions.sha256 !== decisionsArtifact.sha256
    || overlay.sourceArtifacts.ownerDecisions.bytes !== decisionsArtifact.bytes
  )) {
    throw new Error('Reviewed manifest decisions differ from the explicit artifact.');
  }
  if (manifest && decisions && decisionsArtifact) {
    validateQianchuanProductionMigrationManifest(manifest);
    validateAiosProductionMigrationOwnerDecisions(decisions, {
      manifest,
      manifestArtifact,
      records,
    });
    if (manifest.entries.length !== reviewedManifest.entries.length) {
      throw new Error('Reviewed manifest entry count differs from its source.');
    }
    const reviews = new Map(decisions.decisions.map((row) => [identity(row), row]));
    for (const [index, sourceEntry] of manifest.entries.entries()) {
      const decision = reviews.get(identity(sourceEntry));
      const expected = decision
        ? reviewedEntry(sourceEntry, decision, decisionsArtifact)
        : sourceEntry;
      if (JSON.stringify(reviewedManifest.entries[index]) !== JSON.stringify(expected)) {
        throw new Error(`${identity(sourceEntry)} reviewed manifest mutation is not authorized.`);
      }
    }
    const expectedOverlaySummary = {
      reviewedEntries: decisions.decisions.length,
      appliedAndVerified: decisions.decisions.filter(
        (row) => row.decision === 'applied_and_verified',
      ).length,
      exceptionCandidates: decisions.decisions.filter(
        (row) => row.decision === 'not_applicable',
      ).length,
    };
    if (JSON.stringify(overlay.summary) !== JSON.stringify(expectedOverlaySummary)) {
      throw new Error('Reviewed manifest overlay summary is inconsistent.');
    }
  }
  const expectedSummary = manifestSummary(reviewedManifest.entries);
  const expectedReadiness = manifestReadiness(reviewedManifest, expectedSummary);
  if (JSON.stringify(reviewedManifest.summary) !== JSON.stringify(expectedSummary)
    || reviewedManifest.reconciled !== expectedReadiness.reconciled
    || reviewedManifest.readyForLedgerBootstrap !== expectedReadiness.readyForLedgerBootstrap) {
    throw new Error('Reviewed manifest summary or readiness is inconsistent.');
  }
  return reviewedManifest;
}

function mergedExceptionSummary(rows) {
  return {
    decisions: rows.length,
    decisionsByType: countBy(rows, (row) => row.decision),
    ledgerActions: { do_not_record: rows.length },
    reviewStatuses: countBy(rows, (row) => row.reviewStatus),
  };
}

export function buildAiosProductionMigrationExceptionDecisions({
  generatedAt = new Date().toISOString(),
  manifest,
  manifestArtifact,
  ownerDecisions,
  ownerDecisionsArtifact,
  ownerDecisionsSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
  records,
}) {
  validateQianchuanProductionMigrationManifest(manifest);
  validateQianchuanLedgerExceptionSourceDecisions(priorDecisions);
  validateAiosProductionMigrationOwnerDecisions(ownerDecisions, {
    manifest,
    manifestArtifact,
    records: requireRepositoryRecords(records),
  });
  assertPinnedMigrationReviewArtifact(
    priorDecisionsArtifact,
    priorDecisionsSha256,
    'Prior exception decisions',
  );
  assertPinnedMigrationReviewArtifact(
    ownerDecisionsArtifact,
    ownerDecisionsSha256,
    'New owner decisions',
  );
  assertIsoTimestamp(generatedAt, 'Merged exception decisions generatedAt');
  assertTimestampOrder(ownerDecisions.generatedAt, generatedAt, 'Merged exception decisions generatedAt');
  const newRows = ownerDecisions.decisions
    .filter((row) => row.decision === 'not_applicable')
    .map((row) => ({
      namespace: row.namespace,
      version: row.version,
      checksum: row.checksum,
      decision: row.decision,
      reviewStatus: row.reviewStatus,
      ledgerAction: row.ledgerAction,
      sourceClassification: row.sourceClassification,
      historicalExecution: row.historicalExecution,
      rationale: row.rationale,
      reviewer: row.reviewer,
      reviewedAt: row.reviewedAt,
      evidenceLinks: row.evidenceLinks.map((link) => ({ ...link })),
    }));
  const rows = [...priorDecisions.decisions.map((row) => structuredClone(row)), ...newRows];
  const seen = new Set();
  for (const row of rows) {
    const rowIdentity = identity(row);
    if (seen.has(rowIdentity)) {
      throw new Error(`Merged exception decisions contain duplicate ${rowIdentity}.`);
    }
    seen.add(rowIdentity);
  }
  const decisions = {
    schemaVersion: 7,
    generatedAt,
    mode: 'offline_owner_review_decisions',
    authorization: {
      newDecisionCohort: EXCEPTION_COHORT,
      reviewer: REVIEWER,
      reviewedAt: ownerDecisions.authorization.reviewedAt,
    },
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      migrationApplyAuthorized: false,
      deployAuthorized: false,
      authoritativeManifestMutated: false,
    },
    sourceArtifacts: {
      manifest: manifestArtifact,
      ownerDecisions: ownerDecisionsArtifact,
      priorDecisions: priorDecisionsArtifact,
    },
    priorDecisionContract: {
      decisions: priorDecisions.decisions.length,
      sha256: priorDecisionsArtifact.sha256,
    },
    summary: mergedExceptionSummary(rows),
    decisions: rows,
  };
  return validateAiosProductionMigrationExceptionDecisions(decisions, {
    manifest,
    ownerDecisions,
    ownerDecisionsArtifact,
    priorDecisions,
    priorDecisionsArtifact,
    records,
  });
}

export function validateAiosProductionMigrationExceptionDecisions(
  decisions,
  {
    manifest,
    ownerDecisions,
    ownerDecisionsArtifact,
    priorDecisions,
    priorDecisionsArtifact,
    records,
  } = {},
) {
  validateQianchuanLedgerExceptionSourceDecisions(decisions);
  if (decisions.schemaVersion !== 7
    || decisions.authorization?.newDecisionCohort !== EXCEPTION_COHORT
    || decisions.authorization?.reviewer !== REVIEWER
    || decisions.policy?.authoritativeManifestMutated !== false) {
    throw new Error('Merged exception decision provenance is invalid.');
  }
  if (JSON.stringify(decisions.summary) !== JSON.stringify(mergedExceptionSummary(decisions.decisions))) {
    throw new Error('Merged exception decision summary is inconsistent.');
  }
  if (manifest) {
    const entries = manifestEntries(validateQianchuanProductionMigrationManifest(manifest));
    for (const row of decisions.decisions) {
      const entry = entries.get(identity(row));
      if (!entry || entry.checksum !== row.checksum) {
        throw new Error(`${identity(row)} merged exception differs from the current manifest.`);
      }
    }
  }
  if (priorDecisions && priorDecisionsArtifact) {
    validateQianchuanLedgerExceptionSourceDecisions(priorDecisions);
    if (decisions.priorDecisionContract?.decisions !== priorDecisions.decisions.length
      || decisions.priorDecisionContract.sha256 !== priorDecisionsArtifact.sha256
      || JSON.stringify(decisions.decisions.slice(0, priorDecisions.decisions.length))
        !== JSON.stringify(priorDecisions.decisions)) {
      throw new Error('Merged exception decisions do not preserve the prior contract.');
    }
  }
  if (ownerDecisions && ownerDecisionsArtifact) {
    validateAiosProductionMigrationOwnerDecisions(ownerDecisions, { manifest, records });
    const expected = ownerDecisions.decisions.filter((row) => row.decision === 'not_applicable');
    const appended = decisions.decisions.slice(decisions.decisions.length - expected.length);
    if (appended.length !== expected.length
      || appended.some((row, index) => identity(row) !== identity(expected[index])
        || row.checksum !== expected[index].checksum
        || row.evidenceLinks.some((link) => !expected[index].evidenceLinks.some(
          (expectedLink) => expectedLink.sha256 === link.sha256 && expectedLink.kind === link.kind,
        )))) {
      throw new Error('Merged exception decisions differ from new owner decisions.');
    }
    if (decisions.sourceArtifacts.ownerDecisions.sha256 !== ownerDecisionsArtifact.sha256) {
      throw new Error('Merged exception decisions pin a different owner-decision artifact.');
    }
  }
  return decisions;
}

export const AIOS_PRODUCTION_MIGRATION_OWNER_REVIEW_CONSTANTS = Object.freeze({
  exceptionCohort: EXCEPTION_COHORT,
  ownerDecisionsMode: OWNER_DECISIONS_MODE,
  reviewConfirmation: REVIEW_CONFIRMATION,
  reviewAuthorizationSource: REVIEW_AUTHORIZATION_SOURCE,
  reviewer: REVIEWER,
  reviewOverlayMode: REVIEW_OVERLAY_MODE,
  reviewSpecMode: REVIEW_SPEC_MODE,
});
