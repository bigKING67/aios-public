import { QIANCHUAN_CUTOVER_TARGET_MIGRATION } from './aios-qianchuan-production-cutover-readiness.mjs';
import {
  QIANCHUAN_SCHEMA_CONFLICT_STATES,
  qianchuanMigrationReviewProbeKinds,
} from './aios-qianchuan-production-migration-review-policy.mjs';

const RESOLVED_CLASSIFICATIONS = new Set(['applied_and_verified', 'not_applicable']);
const ALLOWED_CLASSIFICATIONS = new Set([
  ...RESOLVED_CLASSIFICATIONS,
  'missing',
  'partially_applied',
  'unknown',
]);

const REVIEW_LANES = Object.freeze({
  target_cutover_decision: {
    priority: 0,
    description: 'Target migration requires an explicit isolated-apply or forward-repair decision.',
  },
  target_prefix_schema_conflict: {
    priority: 1,
    description: 'Pre-target warehouse history has absent or partial current postconditions.',
  },
  target_prefix_present_candidate: {
    priority: 2,
    description: 'Pre-target catalog effects look present but still need decisive migration proof.',
  },
  target_prefix_manual_proof: {
    priority: 3,
    description: 'Pre-target history is not catalog-probeable and needs source/runtime/data evidence.',
  },
  remaining_schema_conflict: {
    priority: 4,
    description: 'Non-prefix history has absent or partial current postconditions.',
  },
  remaining_present_candidate: {
    priority: 5,
    description: 'Non-prefix catalog effects look present but do not prove execution.',
  },
  remaining_manual_proof: {
    priority: 6,
    description: 'Non-prefix history needs manual source/runtime/data evidence.',
  },
});

function assertManifestEntry(entry, seen) {
  if (!['backend', 'warehouse'].includes(entry?.namespace)) {
    throw new Error('Migration review source contains an invalid namespace.');
  }
  if (typeof entry.version !== 'string' || !entry.version) {
    throw new Error('Migration review source contains an invalid version.');
  }
  const identity = `${entry.namespace}/${entry.version}`;
  if (seen.has(identity)) throw new Error(`Migration review source contains duplicate ${identity}.`);
  seen.add(identity);
  if (!/^[a-f0-9]{64}$/.test(entry.checksum ?? '')) {
    throw new Error(`${identity} has an invalid repository checksum.`);
  }
  if (!ALLOWED_CLASSIFICATIONS.has(entry.classification)) {
    throw new Error(`${identity} has an invalid classification.`);
  }
  if (typeof entry.schemaEvidenceState !== 'string' || !entry.ledgerEvidence?.state) {
    throw new Error(`${identity} is missing schema or ledger evidence state.`);
  }
  if (!Array.isArray(entry.unsupportedSignals) || !Array.isArray(entry.catalogEffects)) {
    throw new Error(`${identity} is missing static evidence arrays.`);
  }
}

export function validateQianchuanProductionMigrationManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest.mode !== 'live_readonly') {
    throw new Error('Migration review source must be a schemaVersion=1 live_readonly manifest.');
  }
  if (manifest.readOnlyTransaction !== true || !Array.isArray(manifest.entries)) {
    throw new Error('Migration review source must prove a read-only transaction and contain entries.');
  }
  if (manifest.inventory?.total !== manifest.entries.length) {
    throw new Error('Migration review source inventory total must equal entry count.');
  }
  const seen = new Set();
  for (const entry of manifest.entries) assertManifestEntry(entry, seen);
  const target = manifest.entries.find((entry) => (
    entry.namespace === QIANCHUAN_CUTOVER_TARGET_MIGRATION.namespace
    && entry.version === QIANCHUAN_CUTOVER_TARGET_MIGRATION.version
  ));
  if (!target) throw new Error('Migration review source is missing the qianchuan target migration.');
  return manifest;
}

function isTarget(entry) {
  return entry.namespace === QIANCHUAN_CUTOVER_TARGET_MIGRATION.namespace
    && entry.version === QIANCHUAN_CUTOVER_TARGET_MIGRATION.version;
}

function isTargetPrefix(entry) {
  return entry.namespace === QIANCHUAN_CUTOVER_TARGET_MIGRATION.namespace
    && entry.version <= QIANCHUAN_CUTOVER_TARGET_MIGRATION.version;
}

function laneFor(entry) {
  if (isTarget(entry)) return 'target_cutover_decision';
  const schemaConflict = QIANCHUAN_SCHEMA_CONFLICT_STATES.has(entry.schemaEvidenceState);
  if (isTargetPrefix(entry)) {
    if (schemaConflict) return 'target_prefix_schema_conflict';
    if (entry.schemaEvidenceState === 'schema_effects_present') return 'target_prefix_present_candidate';
    return 'target_prefix_manual_proof';
  }
  if (schemaConflict) return 'remaining_schema_conflict';
  if (entry.schemaEvidenceState === 'schema_effects_present') return 'remaining_present_candidate';
  return 'remaining_manual_proof';
}

function blockingScopes(entry) {
  const scopes = ['ledger_bootstrap'];
  if (isTargetPrefix(entry)) scopes.push('warehouse_target_prefix', 'qianchuan_cutover');
  if (isTarget(entry)) scopes.push('target_forward_repair');
  if (entry.namespace === 'backend') scopes.push('backend_namespace_history');
  return scopes;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function queueEntry(entry, namespacePosition) {
  const lane = laneFor(entry);
  const probes = qianchuanMigrationReviewProbeKinds(entry, { target: isTarget(entry) });
  return {
    namespace: entry.namespace,
    version: entry.version,
    checksum: entry.checksum,
    relativePath: entry.relativePath,
    namespacePosition,
    targetPrefix: isTargetPrefix(entry),
    classification: entry.classification,
    executionEvidenceState: entry.executionEvidenceState,
    ledgerEvidenceState: entry.ledgerEvidence.state,
    schemaEvidenceState: entry.schemaEvidenceState,
    schemaEvidence: {
      currentEffects: entry.schemaEvidence?.currentEffects ?? 0,
      satisfiedEffects: entry.schemaEvidence?.satisfiedEffects ?? 0,
      supersededEffects: entry.schemaEvidence?.supersededEffects ?? 0,
    },
    unsupportedSignals: entry.unsupportedSignals,
    priority: REVIEW_LANES[lane].priority,
    lane,
    priorityReason: REVIEW_LANES[lane].description,
    blockingScopes: blockingScopes(entry),
    primaryProbe: probes[0],
    recommendedProbes: probes,
    review: {
      decision: null,
      evidenceLinks: [],
      notes: null,
      reviewedAt: null,
      reviewer: null,
    },
  };
}

function waveSummary(entries) {
  return Object.entries(REVIEW_LANES).map(([lane, policy]) => ({
    priority: policy.priority,
    lane,
    description: policy.description,
    count: entries.filter((entry) => entry.lane === lane).length,
  }));
}

export function buildQianchuanProductionMigrationReviewQueue({
  generatedAt = new Date().toISOString(),
  manifest,
  sourceArtifact,
}) {
  validateQianchuanProductionMigrationManifest(manifest);
  if (!sourceArtifact?.sha256 || !/^[a-f0-9]{64}$/.test(sourceArtifact.sha256)) {
    throw new Error('Migration review queue requires source artifact SHA-256 metadata.');
  }

  const namespacePositions = new Map();
  const queue = [];
  let resolvedEntries = 0;
  for (const entry of manifest.entries) {
    const position = (namespacePositions.get(entry.namespace) ?? 0) + 1;
    namespacePositions.set(entry.namespace, position);
    if (RESOLVED_CLASSIFICATIONS.has(entry.classification)) {
      resolvedEntries += 1;
      continue;
    }
    queue.push(queueEntry(entry, position));
  }
  queue.sort((left, right) => (
    left.priority - right.priority
    || left.namespace.localeCompare(right.namespace)
    || left.version.localeCompare(right.version)
  ));

  const targetPrefixEntries = queue.filter((entry) => entry.targetPrefix);
  return {
    schemaVersion: 1,
    generatedAt,
    mode: 'offline_readonly_review_queue',
    sourceArtifact,
    sourceManifest: {
      auditedAt: manifest.auditedAt,
      inventoryTotal: manifest.inventory.total,
      ledgerExists: manifest.ledger?.exists === true,
      classifications: manifest.summary?.classifications ?? {},
    },
    policy: {
      authoritativeClassificationUnchanged: true,
      catalogEvidenceCandidateOnly: true,
      humanReviewerRequired: true,
      productionWritesAuthorized: false,
      targetVersion: QIANCHUAN_CUTOVER_TARGET_MIGRATION.version,
    },
    summary: {
      sourceEntries: manifest.entries.length,
      resolvedEntries,
      queuedEntries: queue.length,
      byNamespace: countBy(queue, (entry) => entry.namespace),
      byPriority: countBy(queue, (entry) => `P${entry.priority}`),
      byLane: countBy(queue, (entry) => entry.lane),
      byPrimaryProbe: countBy(queue, (entry) => entry.primaryProbe),
      targetPrefix: {
        total: targetPrefixEntries.length,
        schemaConflict: targetPrefixEntries.filter((entry) => (
          QIANCHUAN_SCHEMA_CONFLICT_STATES.has(entry.schemaEvidenceState)
        )).length,
        schemaPresentCandidate: targetPrefixEntries.filter((entry) => (
          entry.schemaEvidenceState === 'schema_effects_present'
        )).length,
        manualProof: targetPrefixEntries.filter((entry) => (
          entry.schemaEvidenceState === 'unprobeable'
        )).length,
      },
    },
    waves: waveSummary(queue),
    entries: queue,
  };
}
