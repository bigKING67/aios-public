#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { writeExclusiveMigrationAuditJson } from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  parseQianchuanProductionMigrationP1dLineageArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-lineage-cli.mjs';
import {
  buildQianchuanProductionMigrationP1dLineagePacket,
  QIANCHUAN_P1D_LINEAGE_FAMILIES,
  validateQianchuanProductionMigrationP1dLineagePacket,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-lineage.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function artifact(value, artifactPath) {
  const content = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  return { path: artifactPath, bytes: content.length, sha256: sha256(content) };
}

const sourceBuffers = new Map();

function sourceEntry(version, content, { classification = 'unknown' } = {}) {
  const relativePath = `scripts/fixtures/${version}__p1d-lineage.sql`;
  const bytes = Buffer.from(content);
  sourceBuffers.set(path.resolve(process.cwd(), relativePath), bytes);
  return {
    namespace: 'warehouse',
    version,
    checksum: sha256(bytes),
    relativePath,
    classification,
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState: classification === 'unknown' ? 'schema_effects_absent' : 'schema_effects_present',
    schemaEvidence: { currentEffects: 1, satisfiedEffects: 0, supersededEffects: 0 },
    unsupportedSignals: classification === 'unknown' ? ['dml_or_backfill', 'procedural_body'] : [],
    catalogEffects: [{
      expectedPresent: true,
      kind: 'relation',
      name: `missing_${version}`,
      relationType: 'table',
      schema: 'ads',
      key: `relation:ads.missing_${version}`,
      supersededBy: null,
      present: false,
      satisfied: false,
    }],
    reviewer: null,
  };
}

const p1dVersions = QIANCHUAN_P1D_LINEAGE_FAMILIES.flatMap((family) => (
  family.entries.map((entry) => entry.version)
));
const relatedDefinitions = QIANCHUAN_P1D_LINEAGE_FAMILIES.flatMap((family) => family.relatedMigrations);
const relatedByVersion = new Map();
for (const definition of relatedDefinitions) {
  const existing = relatedByVersion.get(definition.version) ?? [];
  relatedByVersion.set(definition.version, [...existing, ...definition.needles]);
}
const manifestEntries = [
  ...p1dVersions.map((version) => sourceEntry(version, `-- ${version}\nSELECT 1;\n`)),
  ...[...relatedByVersion].map(([version, needles]) => sourceEntry(
    version,
    `-- ${version}\n${[...new Set(needles)].join('\n')}\n`,
    { classification: 'applied_and_verified' },
  )),
  sourceEntry('20260618_1430', '-- qianchuan target\nSELECT 1;\n', { classification: 'partially_applied' }),
].sort((left, right) => left.version.localeCompare(right.version));
const manifest = {
  schemaVersion: 1,
  auditedAt: '2026-07-24T07:00:00.000Z',
  mode: 'live_readonly',
  readOnlyTransaction: true,
  inventory: { total: manifestEntries.length },
  ledger: { exists: false, recordedRows: 0 },
  summary: { classifications: {} },
  entries: manifestEntries,
};
const manifestArtifact = artifact(manifest, '/tmp/p1d-lineage-reconciliation.json');
const p1Entries = p1dVersions.map((version) => {
  const entry = manifestEntries.find((candidate) => candidate.version === version);
  return {
    namespace: entry.namespace,
    version: entry.version,
    checksum: entry.checksum,
    relativePath: entry.relativePath,
    source: { bytes: sourceBuffers.get(path.resolve(process.cwd(), entry.relativePath)).length, path: entry.relativePath, sha256: entry.checksum },
    authoritativeClassification: entry.classification,
    schemaEvidenceState: entry.schemaEvidenceState,
    executionEvidenceState: entry.executionEvidenceState,
    ledgerEvidenceState: entry.ledgerEvidence.state,
    effects: { current: 1, satisfied: 0, unsatisfied: 1, superseded: 0 },
    unsupportedSignals: [...entry.unsupportedSignals],
    reviewWave: 'absent_procedural_or_data',
    reviewWaveLabel: 'P1D',
    reviewPriority: 3,
    reviewHypothesis: 'missing_superseded_or_unobservable_runtime_effects',
    reviewRationale: 'fixture',
    recommendedProbes: [],
    review: {
      decision: null,
      evidenceLinks: [],
      notes: null,
      reviewedAt: null,
      reviewer: null,
    },
  };
});
const p1Packet = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T07:01:00.000Z',
  mode: 'offline_readonly_reviewed_p1_overlay',
  sourceArtifact: manifestArtifact,
  policy: {
    authoritativeClassificationUnchanged: true,
    humanReviewerRequired: true,
    liveCatalogEvidenceReused: true,
    networkAccess: false,
    productionWritesAuthorized: false,
    sourceChecksumsVerified: true,
    ledgerWritesAuthorized: false,
    ownerReviewOverlayApplied: true,
  },
  summary: { entries: p1Entries.length },
  entries: p1Entries,
};
const p1Artifact = artifact(p1Packet, '/tmp/p1d-lineage-reviewed-p1.json');

for (const definition of QIANCHUAN_P1D_LINEAGE_FAMILIES.flatMap((family) => family.runtimeFiles)) {
  sourceBuffers.set(
    path.resolve(process.cwd(), definition.path),
    Buffer.from(`${definition.needles.join('\n')}\n`),
  );
}
const sourceOptions = {
  readFile: (filePath) => sourceBuffers.get(filePath),
  realpath: (filePath) => filePath,
  sourceRoot: process.cwd(),
};
const manifestBefore = JSON.stringify(manifest);
const p1Before = JSON.stringify(p1Packet);
const packet = buildQianchuanProductionMigrationP1dLineagePacket({
  generatedAt: '2026-07-24T07:02:00.000Z',
  manifest,
  manifestArtifact,
  manifestSha256: manifestArtifact.sha256,
  p1Packet,
  p1Artifact,
  p1Sha256: p1Artifact.sha256,
  sourceOptions,
});

assert.equal(JSON.stringify(manifest), manifestBefore, 'lineage generation must not mutate the manifest');
assert.equal(JSON.stringify(p1Packet), p1Before, 'lineage generation must not mutate reviewed P1');
assert.equal(validateQianchuanProductionMigrationP1dLineagePacket(packet), packet);
assert.equal(packet.summary.entries, 8);
assert.equal(packet.summary.families, 8);
assert.equal(packet.summary.relatedMigrationChecksumsVerified, 10);
assert.equal(packet.summary.runtimeFilesVerified, 3);
assert.equal(packet.summary.sourceChecksumsVerified, 8);
assert.ok(packet.entries.every((entry) => entry.authoritativeClassification === 'unknown'));
assert.ok(packet.entries.every((entry) => entry.currentReviewWaveLabel === 'P1D'));
assert.ok(packet.entries.every((entry) => entry.review.decision === null && entry.review.reviewer === null));
assert.equal(packet.policy.productionWritesAuthorized, false);
assert.equal(packet.policy.ledgerWritesAuthorized, false);
assert.equal(packet.policy.deployAuthorized, false);
assert.equal(packet.policy.ownerDecisionRecorded, false);

assert.throws(
  () => buildQianchuanProductionMigrationP1dLineagePacket({
    manifest,
    manifestArtifact,
    manifestSha256: '0'.repeat(64),
    p1Packet,
    p1Artifact,
    p1Sha256: p1Artifact.sha256,
    sourceOptions,
  }),
  /manifest SHA-256 differs/,
);
assert.throws(
  () => buildQianchuanProductionMigrationP1dLineagePacket({
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    p1Packet: { ...p1Packet, entries: p1Packet.entries.slice(1) },
    p1Artifact,
    p1Sha256: p1Artifact.sha256,
    sourceOptions,
  }),
  /differ from the pinned lineage-family inventory/,
);
assert.throws(
  () => buildQianchuanProductionMigrationP1dLineagePacket({
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    p1Packet: {
      ...p1Packet,
      entries: p1Packet.entries.map((entry, index) => (
        index === 0 ? { ...entry, review: { ...entry.review, decision: 'missing' } } : entry
      )),
    },
    p1Artifact,
    p1Sha256: p1Artifact.sha256,
    sourceOptions,
  }),
  /unreviewed null decision boundary/,
);

assert.deepEqual(
  parseQianchuanProductionMigrationP1dLineageArgs([
    '--manifest', '/tmp/manifest.json',
    '--manifest-sha256', 'a'.repeat(64),
    '--p1=/tmp/p1.json',
    `--p1-sha256=${'b'.repeat(64)}`,
    '--output', '/tmp/p1d.json',
    '--json',
  ]),
  {
    help: false,
    json: true,
    manifestPath: '/tmp/manifest.json',
    manifestSha256: 'a'.repeat(64),
    outputPath: '/tmp/p1d.json',
    p1Path: '/tmp/p1.json',
    p1Sha256: 'b'.repeat(64),
  },
);
assert.throws(
  () => parseQianchuanProductionMigrationP1dLineageArgs(['--manifest', '/tmp/manifest.json']),
  /--manifest-sha256 is required/,
);
for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger', '--record-decision']) {
  assert.throws(
    () => parseQianchuanProductionMigrationP1dLineageArgs([option]),
    /Unknown qianchuan migration P1D lineage option/,
  );
}

let writeOptions;
writeExclusiveMigrationAuditJson(packet, '/tmp/p1d-lineage.json', {
  writeFile: (_filePath, _content, options) => { writeOptions = options; },
});
assert.equal(writeOptions.flag, 'wx');

console.log('[qianchuan-production-migration-p1d-lineage-behavior] OK: exact 8-entry P1D inventory, dual SHA pins, migration/runtime lineage, null decisions, and write denial passed.');
