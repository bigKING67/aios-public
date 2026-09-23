#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { writeExclusiveMigrationAuditJson } from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  parseQianchuanProductionMigrationP1ReviewArgs,
  qianchuanProductionMigrationP1ReviewExitCode,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1-review-cli.mjs';
import {
  buildQianchuanProductionMigrationP1ReviewPacket,
  validateQianchuanProductionMigrationP1ReviewPacket,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1-review.mjs';

const sourceRoot = '/repo';
const sourceContents = new Map();

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

function fixtureEffects({ current, satisfied, superseded = 0, schema = 'ads' }) {
  return [
    ...Array.from({ length: current }, (_, index) => ({
      expectedPresent: true,
      key: `column:${schema}.fixture_${index}.value`,
      kind: 'column',
      name: 'value',
      present: index < satisfied,
      relation: `fixture_${index}`,
      satisfied: index < satisfied,
      schema,
      supersededBy: null,
    })),
    ...Array.from({ length: superseded }, (_, index) => ({
      expectedPresent: true,
      key: `relation:${schema}.superseded_${index}`,
      kind: 'relation',
      name: `superseded_${index}`,
      present: true,
      satisfied: true,
      schema,
      supersededBy: '20260701_0000',
    })),
  ];
}

function fixtureEntry({
  classification = 'unknown',
  current = 1,
  satisfied = 0,
  schemaEvidenceState = 'schema_effects_absent',
  superseded = 0,
  unsupportedSignals = [],
  version,
}) {
  const relativePath = `etl/groland_postgres/sql/migrations/${version}__fixture.sql`;
  const content = Buffer.from(`-- ${version}\nSELECT 1;\n`);
  sourceContents.set(path.join(sourceRoot, relativePath), content);
  return {
    namespace: 'warehouse',
    version,
    checksum: checksum(content),
    relativePath,
    classification,
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState,
    schemaEvidence: { currentEffects: current, satisfiedEffects: satisfied, supersededEffects: superseded },
    unsupportedSignals,
    catalogEffects: fixtureEffects({ current, satisfied, superseded }),
    recommendedProbes: ['migration_specific_postcondition_and_supersession_review'],
  };
}

const entries = [
  fixtureEntry({
    current: 5,
    satisfied: 4,
    schemaEvidenceState: 'schema_effects_partial',
    unsupportedSignals: ['procedural_body'],
    version: '20260101_0000',
  }),
  fixtureEntry({ current: 2, satisfied: 0, version: '20260102_0000' }),
  fixtureEntry({
    current: 3,
    satisfied: 1,
    schemaEvidenceState: 'schema_effects_partial',
    unsupportedSignals: ['dml_or_backfill'],
    version: '20260103_0000',
  }),
  fixtureEntry({
    current: 2,
    satisfied: 0,
    unsupportedSignals: ['dynamic_sql', 'procedural_body'],
    version: '20260104_0000',
  }),
  fixtureEntry({
    current: 1,
    satisfied: 1,
    schemaEvidenceState: 'schema_effects_present',
    version: '20260105_0000',
  }),
  fixtureEntry({
    classification: 'partially_applied',
    current: 2,
    satisfied: 1,
    schemaEvidenceState: 'schema_effects_partial',
    version: '20260618_1430',
  }),
  fixtureEntry({ current: 1, satisfied: 0, version: '20260720_0000' }),
];

const manifest = {
  schemaVersion: 1,
  auditedAt: '2026-07-24T03:40:05.060Z',
  mode: 'live_readonly',
  readOnlyTransaction: true,
  inventory: { total: entries.length },
  ledger: { exists: false, recordedRows: 0 },
  summary: { classifications: { partially_applied: 1, unknown: entries.length - 1 } },
  entries,
};
const sourceArtifact = {
  path: '/tmp/reconciliation.json',
  bytes: 1234,
  sha256: 'a'.repeat(64),
};
const sourceOptions = {
  readFile: (filePath) => sourceContents.get(filePath),
  realpath: (filePath) => filePath,
  sourceRoot,
};

const packet = buildQianchuanProductionMigrationP1ReviewPacket({
  generatedAt: '2026-07-24T05:00:00.000Z',
  manifest,
  sourceArtifact,
  sourceOptions,
});
assert.equal(validateQianchuanProductionMigrationP1ReviewPacket(packet), packet, 'valid packet should pass');
assert.equal(packet.mode, 'offline_readonly_p1_review_packet', 'packet should declare offline mode');
assert.equal(packet.summary.entries, 4, 'only pre-target schema conflicts should enter P1');
assert.deepEqual(
  packet.summary.byWave,
  { P1A: 1, P1B: 1, P1C: 1, P1D: 1 },
  'P1 waves should be deterministic',
);
assert.deepEqual(
  packet.entries.map((entry) => entry.reviewWaveLabel),
  ['P1A', 'P1B', 'P1C', 'P1D'],
  'P1 entries should be ordered by review priority',
);
assert.equal(packet.summary.sourceChecksumsVerified, 4, 'every selected source checksum should be verified');
assert.equal(packet.summary.targetPrefixBoundary.targetPosition, 6, 'target position should use warehouse order');
assert.equal(packet.policy.authoritativeClassificationUnchanged, true, 'packet must preserve classifications');
assert.equal(packet.policy.productionWritesAuthorized, false, 'packet must not authorize writes');
assert.equal(packet.entries[0].authoritativeClassification, 'unknown', 'entry classification must remain unchanged');
assert.equal(packet.entries[0].review.reviewer, null, 'packet must not invent a reviewer');
assert.equal(packet.entries[0].effects.unsatisfied, 1, 'effect summary should expose remaining drift');
assert.equal(packet.entries[1].reviewHypothesis, 'missing_partial_or_superseded_ddl', 'pure DDL should use the DDL hypothesis');
assert.ok(
  packet.entries[2].recommendedProbes.includes('data_shape_or_backfill_reconciliation'),
  'DML entries should retain data-shape review',
);
assert.ok(
  packet.entries[3].recommendedProbes.includes('dynamic_sql_target_and_callsite_review'),
  'dynamic SQL entries should retain callsite review',
);

const mismatchedSources = new Map(sourceContents);
mismatchedSources.set(path.join(sourceRoot, entries[0].relativePath), Buffer.from('changed'));
assert.throws(
  () => buildQianchuanProductionMigrationP1ReviewPacket({
    manifest,
    sourceArtifact,
    sourceOptions: { ...sourceOptions, readFile: (filePath) => mismatchedSources.get(filePath) },
  }),
  /source checksum differs from the manifest/,
  'source checksum drift should fail closed',
);

const escapingEntry = { ...entries[0], relativePath: '../escape.sql' };
const escapingManifest = { ...manifest, entries: [escapingEntry, ...entries.slice(1)] };
assert.throws(
  () => buildQianchuanProductionMigrationP1ReviewPacket({
    manifest: escapingManifest,
    sourceArtifact,
    sourceOptions,
  }),
  /source escapes the repository/,
  'manifest paths must not escape the repository',
);

assert.throws(
  () => buildQianchuanProductionMigrationP1ReviewPacket({
    manifest,
    sourceArtifact,
    sourceOptions: { ...sourceOptions, maxBytes: 1 },
  }),
  /source exceeds 1 bytes/,
  'source reads should be size bounded',
);

let written;
const writtenMetadata = writeExclusiveMigrationAuditJson(packet, '/tmp/p1-review.json', {
  writeFile: (filePath, content, options) => { written = { filePath, content, options }; },
});
assert.equal(written.options.flag, 'wx', 'P1 output must not overwrite an existing artifact');
assert.equal(writtenMetadata.bytes, Buffer.byteLength(written.content), 'artifact byte metadata should match');

assert.deepEqual(
  parseQianchuanProductionMigrationP1ReviewArgs([
    '--manifest=/tmp/source.json', '--output', '/tmp/p1.json', '--json', '--require-reviewed',
  ]),
  {
    decisionsPath: null,
    decisionsSha256: null,
    help: false,
    json: true,
    manifestPath: '/tmp/source.json',
    outputPath: '/tmp/p1.json',
    requireReviewed: true,
  },
  'P1 CLI options should parse deterministically',
);
assert.equal(
  parseQianchuanProductionMigrationP1ReviewArgs([
    '--manifest=/tmp/source.json',
    '--decisions=/tmp/decisions.json',
    `--decisions-sha256=${'a'.repeat(64)}`,
  ]).decisionsPath,
  '/tmp/decisions.json',
  'P1 CLI should accept an explicitly pinned decision overlay',
);
assert.throws(
  () => parseQianchuanProductionMigrationP1ReviewArgs([
    '--manifest=/tmp/source.json', '--decisions=/tmp/decisions.json',
  ]),
  /must be provided together/,
  'P1 CLI should reject an unpinned decision overlay',
);
assert.throws(
  () => parseQianchuanProductionMigrationP1ReviewArgs(['--apply']),
  /Unknown qianchuan migration P1 review option/,
  'write-like CLI options should fail closed',
);
assert.throws(
  () => parseQianchuanProductionMigrationP1ReviewArgs([]),
  /--manifest is required/,
  'P1 CLI should require a source manifest',
);
assert.equal(qianchuanProductionMigrationP1ReviewExitCode(packet, false), 0, 'diagnostic mode should pass');
assert.equal(qianchuanProductionMigrationP1ReviewExitCode(packet, true), 1, 'strict mode should fail before human review');

console.log('[qianchuan-production-migration-p1-review-behavior] OK: selection, P1A-D ordering, checksum/path safety, review boundaries, artifact writes, and strict exits passed.');
