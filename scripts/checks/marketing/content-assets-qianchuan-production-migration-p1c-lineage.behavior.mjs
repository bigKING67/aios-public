#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { writeExclusiveMigrationAuditJson } from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { buildQianchuanProductionMigrationP1ReviewPacket } from '../../lib/migrations/aios-qianchuan-production-migration-p1-review.mjs';
import {
  parseQianchuanProductionMigrationP1cLineageArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-lineage-cli.mjs';
import {
  buildQianchuanProductionMigrationP1cLineagePacket,
  QIANCHUAN_P1C_LINEAGE_FAMILIES,
  validateQianchuanProductionMigrationP1cLineagePacket,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-lineage.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function artifact(value, artifactPath) {
  const content = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  return { path: artifactPath, bytes: content.length, sha256: sha256(content) };
}

function effectFromKey(key, { present, supersededBy = null } = {}) {
  const [kind, qualifiedName] = key.split(':');
  const parts = qualifiedName.split('.');
  const schema = parts[0];
  const relation = ['column', 'constraint', 'trigger'].includes(kind) ? parts[1] : undefined;
  const name = parts.at(-1);
  return {
    expectedPresent: true,
    kind,
    name,
    ...(relation ? { relation } : {}),
    schema,
    key,
    supersededBy,
    present,
    satisfied: present === true,
  };
}

const sourceBuffers = new Map();

function sourceIdentity(version) {
  const relativePath = `scripts/fixtures/${version}__p1c-lineage.sql`;
  const content = Buffer.from(`-- ${version}\nSELECT 1;\n`);
  sourceBuffers.set(path.resolve(process.cwd(), relativePath), content);
  return { checksum: sha256(content), relativePath };
}

function explicitEntry(definition) {
  const source = sourceIdentity(definition.version);
  const catalogEffects = [
    ...definition.supersededEffectKeys.map((key) => effectFromKey(key, {
      present: false,
      supersededBy: definition.dropVersion,
    })),
    {
      expectedPresent: true,
      identityArguments: '',
      kind: 'routine',
      name: `refresh_${definition.version}`,
      routineKind: 'procedure',
      schema: 'ads',
      key: `routine:procedure:ads.refresh_${definition.version}()`,
      supersededBy: null,
      present: true,
      satisfied: true,
    },
  ];
  return {
    namespace: 'warehouse',
    version: definition.version,
    ...source,
    classification: 'unknown',
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState: 'schema_effects_present',
    schemaEvidence: {
      currentEffects: 1,
      satisfiedEffects: 1,
      supersededEffects: definition.supersededEffectKeys.length,
    },
    unsupportedSignals: ['dml_or_backfill', 'dynamic_sql', 'procedural_body'],
    catalogEffects,
    reviewer: null,
  };
}

function unresolvedEntry(version) {
  const source = sourceIdentity(version);
  const catalogEffects = [
    effectFromKey(`relation:ads.current_${version}`, { present: true }),
    effectFromKey(`relation:ads.missing_${version}`, { present: false }),
  ];
  return {
    namespace: 'warehouse',
    version,
    ...source,
    classification: 'unknown',
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState: 'schema_effects_partial',
    schemaEvidence: { currentEffects: 2, satisfiedEffects: 1, supersededEffects: 0 },
    unsupportedSignals: ['dml_or_backfill', 'dynamic_sql', 'procedural_body'],
    catalogEffects,
    reviewer: null,
  };
}

const explicitDefinitions = QIANCHUAN_P1C_LINEAGE_FAMILIES
  .find((family) => family.family === 'explicit_relation_drop').entries;
const unresolvedDefinitions = QIANCHUAN_P1C_LINEAGE_FAMILIES
  .filter((family) => family.family !== 'explicit_relation_drop')
  .flatMap((family) => family.entries);
const target = {
  namespace: 'warehouse',
  version: '20260618_1430',
  checksum: 'f'.repeat(64),
  relativePath: 'scripts/fixtures/20260618_1430__target.sql',
  classification: 'partially_applied',
  executionEvidenceState: 'unknown',
  ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
  schemaEvidenceState: 'schema_effects_partial',
  schemaEvidence: { currentEffects: 2, satisfiedEffects: 1, supersededEffects: 0 },
  unsupportedSignals: ['dml_or_backfill'],
  catalogEffects: [
    effectFromKey('relation:ads.target_present', { present: true }),
    effectFromKey('relation:ads.target_missing', { present: false }),
  ],
  reviewer: null,
};
const manifestEntries = [
  ...explicitDefinitions.map(explicitEntry),
  ...unresolvedDefinitions.map((definition) => unresolvedEntry(definition.version)),
  target,
].sort((left, right) => left.version.localeCompare(right.version));
const manifest = {
  schemaVersion: 1,
  auditedAt: '2026-07-24T05:56:01.845Z',
  mode: 'live_readonly',
  readOnlyTransaction: true,
  inventory: { total: manifestEntries.length },
  ledger: { exists: false, recordedRows: 0 },
  summary: { classifications: { partially_applied: 1, unknown: manifestEntries.length - 1 } },
  entries: manifestEntries,
};
const sourceOptions = {
  readFile: (filePath) => sourceBuffers.get(filePath),
  realpath: (filePath) => filePath,
  sourceRoot: process.cwd(),
};
const manifestArtifact = artifact(manifest, '/tmp/p1c-lineage-reconciliation.json');
const p1Packet = buildQianchuanProductionMigrationP1ReviewPacket({
  generatedAt: '2026-07-24T06:00:00.000Z',
  manifest,
  sourceArtifact: manifestArtifact,
  sourceOptions,
});
const p1Artifact = artifact(p1Packet, '/tmp/p1c-lineage-reviewed-p1.json');
const manifestBefore = JSON.stringify(manifest);
const p1Before = JSON.stringify(p1Packet);
const packet = buildQianchuanProductionMigrationP1cLineagePacket({
  generatedAt: '2026-07-24T06:10:00.000Z',
  manifest,
  manifestArtifact,
  manifestSha256: manifestArtifact.sha256,
  p1Packet,
  p1Artifact,
  p1Sha256: p1Artifact.sha256,
  sourceOptions,
});

assert.equal(JSON.stringify(manifest), manifestBefore, 'lineage generation must not mutate the manifest');
assert.equal(JSON.stringify(p1Packet), p1Before, 'lineage generation must not mutate the P1 packet');
assert.equal(validateQianchuanProductionMigrationP1cLineagePacket(packet), packet);
assert.equal(packet.summary.entries, 17);
assert.equal(packet.summary.staticDependencySupersessionEntries, 4);
assert.equal(packet.summary.remainingP1cEntries, 13);
assert.deepEqual(packet.summary.byFamily, {
  creator_live_rename: 2,
  dynamic_report_rename: 9,
  explicit_relation_drop: 4,
  live_dashboard_replacement: 1,
  shortvideo_detail_evolution: 1,
});
assert.equal(packet.summary.sourceChecksumsVerified, 17);
assert.ok(packet.entries.every((entry) => entry.authoritativeClassification === 'unknown'));
assert.ok(packet.entries.every((entry) => entry.review.decision === null && entry.review.reviewer === null));
assert.ok(packet.entries.filter((entry) => entry.lineageFamily === 'explicit_relation_drop')
  .every((entry) => entry.staticSupersession.length > 0 && entry.currentReviewWaveLabel === null));
assert.ok(packet.entries.filter((entry) => entry.lineageFamily !== 'explicit_relation_drop')
  .every((entry) => entry.currentReviewWaveLabel === 'P1C'));
assert.equal(
  packet.families.find((family) => family.family === 'dynamic_report_rename')
    .catalogMappings.relations.length,
  18,
);
assert.equal(packet.policy.productionWritesAuthorized, false);
assert.equal(packet.policy.ledgerWritesAuthorized, false);
assert.equal(packet.policy.deployAuthorized, false);

assert.throws(
  () => buildQianchuanProductionMigrationP1cLineagePacket({
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
  () => buildQianchuanProductionMigrationP1cLineagePacket({
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    p1Packet: {
      ...p1Packet,
      entries: [...p1Packet.entries, { ...p1Packet.entries[0], version: '20260420_1200' }],
    },
    p1Artifact,
    p1Sha256: p1Artifact.sha256,
    sourceOptions,
  }),
  /differ from the pinned lineage-family inventory/,
);
assert.throws(
  () => buildQianchuanProductionMigrationP1cLineagePacket({
    manifest: {
      ...manifest,
      entries: manifest.entries.map((entry) => (
        entry.version === explicitDefinitions[0].version
          ? {
            ...entry,
            catalogEffects: entry.catalogEffects.map((catalogEffect, index) => (
              index === 0 ? { ...catalogEffect, supersededBy: null } : catalogEffect
            )),
          }
          : entry
      )),
    },
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    p1Packet,
    p1Artifact,
    p1Sha256: p1Artifact.sha256,
    sourceOptions,
  }),
  /does not prove .* was superseded/,
);
assert.throws(
  () => buildQianchuanProductionMigrationP1cLineagePacket({
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    p1Packet: {
      ...p1Packet,
      entries: p1Packet.entries.map((entry, index) => (
        index === 0 ? { ...entry, review: { ...entry.review, decision: 'not_applicable' } } : entry
      )),
    },
    p1Artifact,
    p1Sha256: p1Artifact.sha256,
    sourceOptions,
  }),
  /unreviewed null decision boundary/,
);

assert.deepEqual(
  parseQianchuanProductionMigrationP1cLineageArgs([
    '--manifest', '/tmp/manifest.json',
    '--manifest-sha256', 'a'.repeat(64),
    '--p1=/tmp/p1.json',
    `--p1-sha256=${'b'.repeat(64)}`,
    '--output', '/tmp/p1c.json',
    '--json',
  ]),
  {
    help: false,
    json: true,
    manifestPath: '/tmp/manifest.json',
    manifestSha256: 'a'.repeat(64),
    outputPath: '/tmp/p1c.json',
    p1Path: '/tmp/p1.json',
    p1Sha256: 'b'.repeat(64),
  },
);
assert.throws(
  () => parseQianchuanProductionMigrationP1cLineageArgs(['--manifest', '/tmp/manifest.json']),
  /--manifest-sha256 is required/,
);
for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger']) {
  assert.throws(
    () => parseQianchuanProductionMigrationP1cLineageArgs([option]),
    /Unknown qianchuan migration P1C lineage option/,
  );
}

let writeOptions;
writeExclusiveMigrationAuditJson(packet, '/tmp/p1c-lineage.json', {
  writeFile: (_filePath, _content, options) => { writeOptions = options; },
});
assert.equal(writeOptions.flag, 'wx');

console.log('[qianchuan-production-migration-p1c-lineage-behavior] OK: 17-entry family inventory, dual SHA pins, source checksums, explicit DROP TABLE supersession, null decisions, and write denial passed.');
