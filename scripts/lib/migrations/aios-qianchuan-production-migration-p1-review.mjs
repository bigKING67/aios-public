import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { QIANCHUAN_CUTOVER_TARGET_MIGRATION } from './aios-qianchuan-production-cutover-readiness.mjs';
import {
  QIANCHUAN_SCHEMA_CONFLICT_STATES,
  qianchuanMigrationReviewProbeKinds,
} from './aios-qianchuan-production-migration-review-policy.mjs';
import { validateQianchuanProductionMigrationManifest } from './aios-qianchuan-production-migration-review-queue.mjs';

const MAX_MIGRATION_SOURCE_BYTES = 5 * 1024 * 1024;

const REVIEW_WAVES = Object.freeze({
  near_complete_current_drift: {
    priority: 0,
    label: 'P1A',
    hypothesis: 'applied_or_superseded_with_current_drift',
    rationale: 'At least 80% of current catalog effects are satisfied; review the remaining drift first.',
  },
  ddl_only_conflict: {
    priority: 1,
    label: 'P1B',
    hypothesis: 'missing_partial_or_superseded_ddl',
    rationale: 'Catalog-only DDL can be reviewed without procedural or data-shape proof.',
  },
  partial_procedural_or_data: {
    priority: 2,
    label: 'P1C',
    hypothesis: 'partial_or_superseded_with_unproven_runtime_effects',
    rationale: 'Some current effects are satisfied, but procedural or data effects remain unproven.',
  },
  absent_procedural_or_data: {
    priority: 3,
    label: 'P1D',
    hypothesis: 'missing_superseded_or_unobservable_runtime_effects',
    rationale: 'Current catalog effects are absent and runtime/data history needs manual proof.',
  },
});

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function isP1Entry(entry) {
  return entry.namespace === QIANCHUAN_CUTOVER_TARGET_MIGRATION.namespace
    && entry.version < QIANCHUAN_CUTOVER_TARGET_MIGRATION.version
    && QIANCHUAN_SCHEMA_CONFLICT_STATES.has(entry.schemaEvidenceState);
}

function waveFor(entry) {
  const currentEffects = entry.schemaEvidence?.currentEffects ?? 0;
  const satisfiedEffects = entry.schemaEvidence?.satisfiedEffects ?? 0;
  if (currentEffects > 0 && satisfiedEffects / currentEffects >= 0.8) {
    return 'near_complete_current_drift';
  }
  if (entry.unsupportedSignals.length === 0) return 'ddl_only_conflict';
  if (entry.schemaEvidenceState === 'schema_effects_partial') return 'partial_procedural_or_data';
  return 'absent_procedural_or_data';
}

function safeSourcePath(relativePath, sourceRoot, realpath = realpathSync) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error('P1 review source paths must be repository-relative.');
  }
  const root = path.resolve(sourceRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`P1 review source escapes the repository: ${relativePath}.`);
  }
  const actual = realpath(resolved);
  if (actual === root || !actual.startsWith(`${root}${path.sep}`)) {
    throw new Error(`P1 review source resolves outside the repository: ${relativePath}.`);
  }
  return actual;
}

export function readVerifiedQianchuanMigrationSource(entry, {
  maxBytes = MAX_MIGRATION_SOURCE_BYTES,
  readFile = readFileSync,
  realpath = realpathSync,
  sourceRoot = process.cwd(),
} = {}) {
  const actualPath = safeSourcePath(entry.relativePath, sourceRoot, realpath);
  const content = readFile(actualPath);
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (bytes.length > maxBytes) throw new Error(`${entry.namespace}/${entry.version} source exceeds ${maxBytes} bytes.`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== entry.checksum) {
    throw new Error(`${entry.namespace}/${entry.version} source checksum differs from the manifest.`);
  }
  return { bytes: bytes.length, path: entry.relativePath, sha256 };
}

export function summarizeQianchuanMigrationEffects(entry) {
  const current = entry.catalogEffects.filter((effect) => !effect.supersededBy);
  const superseded = entry.catalogEffects.filter((effect) => effect.supersededBy);
  const unsatisfied = current.filter((effect) => effect.satisfied !== true);
  return {
    current: current.length,
    satisfied: current.length - unsatisfied.length,
    unsatisfied: unsatisfied.length,
    superseded: superseded.length,
    byKind: countBy(current, (effect) => effect.kind),
    bySchema: countBy(current.filter((effect) => effect.schema), (effect) => effect.schema),
    unsatisfiedCurrentEffects: unsatisfied.map((effect) => ({
      expectedPresent: effect.expectedPresent,
      key: effect.key,
      kind: effect.kind,
      present: effect.present,
    })),
    supersededEffects: superseded.map((effect) => ({
      key: effect.key,
      present: effect.present,
      satisfied: effect.satisfied,
      supersededBy: effect.supersededBy,
    })),
  };
}

function packetEntry(entry, namespacePosition, sourceOptions) {
  const wave = waveFor(entry);
  const policy = REVIEW_WAVES[wave];
  return {
    namespace: entry.namespace,
    version: entry.version,
    namespacePosition,
    relativePath: entry.relativePath,
    checksum: entry.checksum,
    source: readVerifiedQianchuanMigrationSource(entry, sourceOptions),
    authoritativeClassification: entry.classification,
    schemaEvidenceState: entry.schemaEvidenceState,
    executionEvidenceState: entry.executionEvidenceState,
    ledgerEvidenceState: entry.ledgerEvidence.state,
    effects: summarizeQianchuanMigrationEffects(entry),
    unsupportedSignals: entry.unsupportedSignals,
    reviewWave: wave,
    reviewWaveLabel: policy.label,
    reviewPriority: policy.priority,
    reviewHypothesis: policy.hypothesis,
    reviewRationale: policy.rationale,
    recommendedProbes: qianchuanMigrationReviewProbeKinds(entry),
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
  return Object.entries(REVIEW_WAVES).map(([wave, policy]) => ({
    count: entries.filter((entry) => entry.reviewWave === wave).length,
    description: policy.rationale,
    label: policy.label,
    priority: policy.priority,
    reviewHypothesis: policy.hypothesis,
    wave,
  }));
}

export function buildQianchuanProductionMigrationP1ReviewPacket({
  generatedAt = new Date().toISOString(),
  manifest,
  sourceArtifact,
  sourceOptions,
}) {
  validateQianchuanProductionMigrationManifest(manifest);
  if (!sourceArtifact?.sha256 || !/^[a-f0-9]{64}$/.test(sourceArtifact.sha256)) {
    throw new Error('P1 review packet requires source artifact SHA-256 metadata.');
  }
  const warehouseEntries = manifest.entries.filter((entry) => entry.namespace === 'warehouse');
  const namespacePositions = new Map(warehouseEntries.map((entry, index) => [entry.version, index + 1]));
  const entries = manifest.entries
    .filter(isP1Entry)
    .map((entry) => packetEntry(entry, namespacePositions.get(entry.version), sourceOptions))
    .sort((left, right) => (
      left.reviewPriority - right.reviewPriority
      || left.version.localeCompare(right.version)
    ));

  return {
    schemaVersion: 1,
    generatedAt,
    mode: 'offline_readonly_p1_review_packet',
    sourceArtifact,
    sourceManifest: {
      auditedAt: manifest.auditedAt,
      inventoryTotal: manifest.inventory.total,
      targetVersion: QIANCHUAN_CUTOVER_TARGET_MIGRATION.version,
    },
    policy: {
      authoritativeClassificationUnchanged: true,
      humanReviewerRequired: true,
      liveCatalogEvidenceReused: true,
      networkAccess: false,
      productionWritesAuthorized: false,
      sourceChecksumsVerified: true,
    },
    summary: {
      entries: entries.length,
      reviewedEntries: 0,
      bySchemaEvidenceState: countBy(entries, (entry) => entry.schemaEvidenceState),
      byUnsupportedSignal: countBy(
        entries.flatMap((entry) => entry.unsupportedSignals),
        (signal) => signal,
      ),
      byWave: countBy(entries, (entry) => entry.reviewWaveLabel),
      sourceChecksumsVerified: entries.length,
      targetPrefixBoundary: {
        reviewedBeforeTarget: entries.length,
        targetPosition: namespacePositions.get(QIANCHUAN_CUTOVER_TARGET_MIGRATION.version),
      },
    },
    waves: waveSummary(entries),
    entries,
  };
}

export function validateQianchuanProductionMigrationP1ReviewPacket(packet) {
  if (packet?.schemaVersion !== 1 || packet.mode !== 'offline_readonly_p1_review_packet') {
    throw new Error('P1 review packet must be schemaVersion=1 offline_readonly_p1_review_packet.');
  }
  if (!Array.isArray(packet.entries) || packet.summary?.entries !== packet.entries.length) {
    throw new Error('P1 review packet entry count is inconsistent.');
  }
  if (packet.policy?.authoritativeClassificationUnchanged !== true
    || packet.policy?.humanReviewerRequired !== true
    || packet.policy?.productionWritesAuthorized !== false) {
    throw new Error('P1 review packet policy is unsafe.');
  }
  return packet;
}
