import { QIANCHUAN_SCHEMA_CONFLICT_STATES } from './aios-qianchuan-production-migration-review-policy.mjs';
import {
  assertPinnedMigrationReviewArtifact,
  isQianchuanOwnerReviewedDdlBoundary,
} from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  validateQianchuanProductionMigrationOwnerDecisionArtifact,
} from './aios-qianchuan-production-migration-owner-decision-artifact.mjs';
import { buildQianchuanProductionMigrationReviewQueue } from './aios-qianchuan-production-migration-review-queue.mjs';
import { buildQianchuanProductionMigrationP1ReviewPacket } from './aios-qianchuan-production-migration-p1-review.mjs';

function identity(value) {
  return `${value.namespace}/${value.version}`;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function decisionMap(decisions) {
  return new Map(decisions.decisions.map((decision) => [identity(decision), decision]));
}

function reviewedEntry(entry, decision) {
  return {
    ...entry,
    ledgerAction: decision.ledgerAction,
    review: {
      decision: decision.decision,
      evidenceLinks: decision.evidenceLinks.map((link) => ({ ...link })),
      notes: decision.rationale,
      reviewedAt: decision.reviewedAt,
      reviewer: decision.reviewer,
      ...(typeof decision.historicalExecution === 'boolean'
        ? { historicalExecution: decision.historicalExecution }
        : {}),
      ...(decision.executionEvidence
        ? { executionEvidence: decision.executionEvidence }
        : {}),
    },
    reviewStatus: decision.reviewStatus,
  };
}

function prepareOverlay({
  decisions,
  decisionsArtifact,
  decisionsSha256,
  manifest,
  sourceArtifact,
}) {
  validateQianchuanProductionMigrationOwnerDecisionArtifact(decisions, {
    manifest,
    manifestArtifact: sourceArtifact,
  });
  assertPinnedMigrationReviewArtifact(decisionsArtifact, decisionsSha256, 'Owner review decisions');
  return decisionMap(decisions);
}

function reviewQueueTargetPrefix(entries) {
  const targetPrefix = entries.filter((entry) => entry.targetPrefix);
  return {
    total: targetPrefix.length,
    schemaConflict: targetPrefix.filter((entry) => (
      QIANCHUAN_SCHEMA_CONFLICT_STATES.has(entry.schemaEvidenceState)
    )).length,
    schemaPresentCandidate: targetPrefix.filter((entry) => (
      entry.schemaEvidenceState === 'schema_effects_present'
    )).length,
    manualProof: targetPrefix.filter((entry) => entry.schemaEvidenceState === 'unprobeable').length,
  };
}

export function buildReviewedQianchuanProductionMigrationReviewQueue({
  decisions,
  decisionsArtifact,
  decisionsSha256,
  generatedAt = new Date().toISOString(),
  manifest,
  sourceArtifact,
}) {
  const reviews = prepareOverlay({
    decisions,
    decisionsArtifact,
    decisionsSha256,
    manifest,
    sourceArtifact,
  });
  const base = buildQianchuanProductionMigrationReviewQueue({ generatedAt, manifest, sourceArtifact });
  const reviewedEntries = base.entries
    .filter((entry) => reviews.has(identity(entry)))
    .map((entry) => reviewedEntry(entry, reviews.get(identity(entry))));
  if (reviewedEntries.length !== reviews.size) {
    throw new Error('Owner review decisions do not match the current unresolved review queue.');
  }
  const entries = base.entries.filter((entry) => !reviews.has(identity(entry)));
  const byReviewDecision = countBy(reviewedEntries, (entry) => entry.review.decision);
  const waves = base.waves.map((wave) => ({
    ...wave,
    count: entries.filter((entry) => entry.lane === wave.lane).length,
  }));
  return {
    ...base,
    mode: 'offline_readonly_reviewed_queue_overlay',
    decisionArtifact: decisionsArtifact,
    policy: {
      ...base.policy,
      ledgerWritesAuthorized: false,
      ownerReviewOverlayApplied: true,
    },
    summary: {
      ...base.summary,
      resolvedEntries: base.summary.resolvedEntries + reviewedEntries.length,
      queuedEntries: entries.length,
      reviewedEntries: reviewedEntries.length,
      reviewedNotApplicableEntries: byReviewDecision.not_applicable ?? 0,
      reviewedForwardRepairedEntries: byReviewDecision.verified_forward_repaired ?? 0,
      byReviewDecision,
      byNamespace: countBy(entries, (entry) => entry.namespace),
      byPriority: countBy(entries, (entry) => `P${entry.priority}`),
      byLane: countBy(entries, (entry) => entry.lane),
      byPrimaryProbe: countBy(entries, (entry) => entry.primaryProbe),
      targetPrefix: reviewQueueTargetPrefix(entries),
    },
    waves,
    reviewedEntries,
    entries,
  };
}

function p1WaveCounts(entries, waves) {
  return Object.fromEntries(waves.map((wave) => [
    wave.label,
    entries.filter((entry) => entry.reviewWaveLabel === wave.label).length,
  ]));
}

export function buildReviewedQianchuanProductionMigrationP1Packet({
  decisions,
  decisionsArtifact,
  decisionsSha256,
  generatedAt = new Date().toISOString(),
  manifest,
  sourceArtifact,
  sourceOptions,
}) {
  const reviews = prepareOverlay({
    decisions,
    decisionsArtifact,
    decisionsSha256,
    manifest,
    sourceArtifact,
  });
  const base = buildQianchuanProductionMigrationP1ReviewPacket({
    generatedAt,
    manifest,
    sourceArtifact,
    sourceOptions,
  });
  const selected = base.entries.filter((entry) => reviews.has(identity(entry)));
  const selectedIds = new Set(selected.map(identity));
  const manifestEntries = new Map(manifest.entries.map((entry) => [identity(entry), entry]));
  const decisionsOutsideCurrentP1 = decisions.decisions.filter((decision) => (
    !selectedIds.has(identity(decision))
  ));
  if (selected.some((entry) => {
    const decision = reviews.get(identity(entry));
    return entry.reviewWaveLabel !== (decision.reviewWave ?? 'P1B');
  })
    || decisionsOutsideCurrentP1.some((decision) => {
      if ((decision.reviewWave ?? 'P1B') !== 'P1B') return true;
      const entry = manifestEntries.get(identity(decision));
      return entry?.schemaEvidenceState !== 'unprobeable'
        || !isQianchuanOwnerReviewedDdlBoundary(entry);
    })) {
    throw new Error('Owner review decisions no longer match the current review waves.');
  }
  const reviewedEntries = selected.map((entry) => reviewedEntry(entry, reviews.get(identity(entry))));
  const entries = base.entries.filter((entry) => !reviews.has(identity(entry)));
  const byReviewDecision = countBy(reviewedEntries, (entry) => entry.review.decision);
  const waves = base.waves.map((wave) => ({
    ...wave,
    count: entries.filter((entry) => entry.reviewWave === wave.wave).length,
  }));
  return {
    ...base,
    mode: 'offline_readonly_reviewed_p1_overlay',
    decisionArtifact: decisionsArtifact,
    policy: {
      ...base.policy,
      ledgerWritesAuthorized: false,
      ownerReviewOverlayApplied: true,
    },
    summary: {
      ...base.summary,
      sourceEntries: base.summary.entries,
      entries: entries.length,
      queuedEntries: entries.length,
      resolvedEntries: reviewedEntries.length,
      reviewedEntries: reviewedEntries.length,
      reviewedNotApplicableEntries: byReviewDecision.not_applicable ?? 0,
      reviewedForwardRepairedEntries: byReviewDecision.verified_forward_repaired ?? 0,
      byReviewDecision,
      decisionsOutsideCurrentP1: decisionsOutsideCurrentP1.length,
      bySchemaEvidenceState: countBy(entries, (entry) => entry.schemaEvidenceState),
      byUnsupportedSignal: countBy(
        entries.flatMap((entry) => entry.unsupportedSignals),
        (signal) => signal,
      ),
      byWave: p1WaveCounts(entries, waves),
      targetPrefixBoundary: {
        targetPosition: base.summary.targetPrefixBoundary.targetPosition,
        queuedBeforeTarget: entries.length,
        resolvedBeforeTarget: reviewedEntries.length,
        sourceBeforeTarget: base.summary.entries,
      },
    },
    waves,
    reviewedEntries,
    entries,
  };
}
