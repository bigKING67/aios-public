#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  readExternalMigrationAuditJson,
  resolveExternalMigrationAuditArtifactPath,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import {
  parseQianchuanProductionMigrationReviewQueueArgs,
  qianchuanProductionMigrationReviewQueueExitCode,
} from '../../lib/migrations/aios-qianchuan-production-migration-review-queue-cli.mjs';
import {
  buildQianchuanProductionMigrationReviewQueue,
  validateQianchuanProductionMigrationManifest,
} from '../../lib/migrations/aios-qianchuan-production-migration-review-queue.mjs';

function fixtureEntry({
  checksumCharacter,
  classification = 'unknown',
  namespace = 'warehouse',
  schemaEvidenceState = 'unprobeable',
  unsupportedSignals = [],
  version,
}) {
  const currentEffects = schemaEvidenceState === 'unprobeable' ? 0 : 2;
  const satisfiedEffects = schemaEvidenceState === 'schema_effects_present'
    ? currentEffects
    : schemaEvidenceState === 'schema_effects_partial'
      ? 1
      : 0;
  return {
    namespace,
    version,
    checksum: checksumCharacter.repeat(64),
    relativePath: `/fixture/${namespace}/${version}.sql`,
    classification,
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState,
    schemaEvidence: { currentEffects, satisfiedEffects, supersededEffects: 0 },
    unsupportedSignals,
    catalogEffects: currentEffects ? [{ key: `relation:fixture.${version}` }] : [],
  };
}

function fixtureManifest(entries) {
  const classifications = {};
  for (const entry of entries) {
    classifications[entry.classification] = (classifications[entry.classification] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    auditedAt: '2026-07-24T03:31:08.249Z',
    mode: 'live_readonly',
    readOnlyTransaction: true,
    inventory: { total: entries.length },
    ledger: { exists: false, recordedRows: 0 },
    summary: { classifications },
    entries,
  };
}

const entries = [
  fixtureEntry({
    checksumCharacter: 'a',
    namespace: 'backend',
    schemaEvidenceState: 'schema_effects_present',
    version: '002',
  }),
  fixtureEntry({
    checksumCharacter: 'b',
    schemaEvidenceState: 'schema_effects_partial',
    version: '20260101_0000',
  }),
  fixtureEntry({
    checksumCharacter: 'c',
    schemaEvidenceState: 'schema_effects_present',
    unsupportedSignals: ['dml_or_backfill', 'procedural_body'],
    version: '20260201_0000',
  }),
  fixtureEntry({
    checksumCharacter: 'd',
    unsupportedSignals: ['dynamic_sql', 'procedural_body'],
    version: '20260301_0000',
  }),
  fixtureEntry({
    checksumCharacter: 'e',
    classification: 'partially_applied',
    schemaEvidenceState: 'schema_effects_partial',
    version: '20260618_1430',
  }),
  fixtureEntry({
    checksumCharacter: 'f',
    schemaEvidenceState: 'schema_effects_absent',
    version: '20260720_0000',
  }),
  fixtureEntry({
    checksumCharacter: '1',
    unsupportedSignals: ['rename'],
    version: '20260721_0000',
  }),
  fixtureEntry({
    checksumCharacter: '2',
    classification: 'applied_and_verified',
    schemaEvidenceState: 'schema_effects_present',
    version: '20260722_0000',
  }),
];
const manifest = fixtureManifest(entries);
const sourceContent = Buffer.from(`${JSON.stringify(manifest)}\n`);
const sourceArtifact = {
  path: '/tmp/source-reconciliation.json',
  bytes: sourceContent.length,
  sha256: createHash('sha256').update(sourceContent).digest('hex'),
};

assert.equal(validateQianchuanProductionMigrationManifest(manifest), manifest, 'valid manifest should pass through');
const queue = buildQianchuanProductionMigrationReviewQueue({
  generatedAt: '2026-07-24T04:00:00.000Z',
  manifest,
  sourceArtifact,
});
assert.equal(queue.mode, 'offline_readonly_review_queue', 'queue should declare its offline mode');
assert.equal(queue.policy.authoritativeClassificationUnchanged, true, 'queue must not rewrite classifications');
assert.equal(queue.policy.productionWritesAuthorized, false, 'queue must not imply production write authorization');
assert.equal(queue.summary.sourceEntries, 8, 'queue should retain source inventory count');
assert.equal(queue.summary.resolvedEntries, 1, 'resolved entries should not enter the review queue');
assert.equal(queue.summary.queuedEntries, 7, 'all unresolved entries should enter the review queue');
assert.deepEqual(
  queue.summary.byPriority,
  { P0: 1, P1: 1, P2: 1, P3: 1, P4: 1, P5: 1, P6: 1 },
  'each review lane should map to a deterministic priority',
);
assert.deepEqual(
  queue.summary.targetPrefix,
  { total: 4, schemaConflict: 2, schemaPresentCandidate: 1, manualProof: 1 },
  'target prefix should separate conflicts, present candidates, and manual proof',
);
assert.deepEqual(
  queue.entries.map((entry) => entry.priority),
  [0, 1, 2, 3, 4, 5, 6],
  'entries should be ordered by priority',
);
const target = queue.entries[0];
assert.equal(target.version, '20260618_1430', 'target partial should be reviewed first');
assert.equal(target.classification, 'partially_applied', 'review queue must preserve target classification');
assert.equal(target.review.reviewer, null, 'queue must not invent a human reviewer');
assert.ok(target.blockingScopes.includes('target_forward_repair'), 'target should block forward repair');
const dmlEntry = queue.entries.find((entry) => entry.version === '20260201_0000');
assert.ok(dmlEntry.recommendedProbes.includes('data_shape_or_backfill_reconciliation'), 'DML should require data-shape proof');
assert.ok(dmlEntry.recommendedProbes.includes('routine_definition_hash'), 'procedural DML should require routine hash proof');
const dynamicEntry = queue.entries.find((entry) => entry.version === '20260301_0000');
assert.ok(dynamicEntry.recommendedProbes.includes('dynamic_sql_target_and_callsite_review'), 'dynamic SQL should retain a manual probe');

const duplicateManifest = fixtureManifest([entries[0], { ...entries[0] }]);
assert.throws(
  () => validateQianchuanProductionMigrationManifest(duplicateManifest),
  /duplicate backend\/002/,
  'duplicate namespace/version should fail closed',
);
assert.throws(
  () => validateQianchuanProductionMigrationManifest({ ...manifest, inventory: { total: 99 } }),
  /inventory total must equal entry count/,
  'inventory drift should fail closed',
);
assert.throws(
  () => buildQianchuanProductionMigrationReviewQueue({ manifest, sourceArtifact: { sha256: 'bad' } }),
  /source artifact SHA-256/,
  'queue should require immutable source metadata',
);

const loaded = readExternalMigrationAuditJson('/tmp/source-reconciliation.json', {
  readFile: () => sourceContent,
  realpath: (value) => value,
});
assert.deepEqual(loaded.data, manifest, 'external artifact reader should parse the manifest');
assert.equal(loaded.metadata.sha256, sourceArtifact.sha256, 'external artifact reader should hash exact bytes');
assert.throws(
  () => readExternalMigrationAuditJson('/tmp/too-large.json', {
    maxBytes: 1,
    readFile: () => sourceContent,
    realpath: (value) => value,
  }),
  /exceeds 1 bytes/,
  'external artifact reader should enforce a size bound',
);
assert.throws(
  () => readExternalMigrationAuditJson('/tmp/invalid.json', {
    readFile: () => Buffer.from('{invalid'),
    realpath: (value) => value,
  }),
  /valid JSON/,
  'external artifact reader should reject invalid JSON',
);
assert.throws(
  () => resolveExternalMigrationAuditArtifactPath(`${process.cwd()}/tracked.json`),
  /outside the repository/,
  'migration audit artifacts should remain outside the repository',
);

let written;
const writtenMetadata = writeExclusiveMigrationAuditJson(queue, '/tmp/review-queue.json', {
  writeFile: (filePath, content, options) => {
    written = { filePath, content, options };
  },
});
assert.equal(written.options.flag, 'wx', 'review queue output must not overwrite existing files');
assert.equal(writtenMetadata.bytes, Buffer.byteLength(written.content), 'written byte metadata should match content');
assert.match(writtenMetadata.sha256, /^[a-f0-9]{64}$/, 'review queue output should report SHA-256');

assert.deepEqual(
  parseQianchuanProductionMigrationReviewQueueArgs([
    '--manifest=/tmp/source.json', '--output', '/tmp/queue.json', '--json', '--require-reviewed',
  ]),
  {
    decisionsPath: null,
    decisionsSha256: null,
    help: false,
    json: true,
    manifestPath: '/tmp/source.json',
    outputPath: '/tmp/queue.json',
    requireReviewed: true,
  },
  'review queue CLI options should parse deterministically',
);
assert.equal(
  parseQianchuanProductionMigrationReviewQueueArgs([
    '--manifest=/tmp/source.json',
    '--decisions=/tmp/decisions.json',
    `--decisions-sha256=${'a'.repeat(64)}`,
  ]).decisionsPath,
  '/tmp/decisions.json',
  'review queue should accept an explicitly pinned decision overlay',
);
assert.throws(
  () => parseQianchuanProductionMigrationReviewQueueArgs([
    '--manifest=/tmp/source.json', '--decisions=/tmp/decisions.json',
  ]),
  /must be provided together/,
  'review queue should reject an unpinned decision overlay',
);
assert.throws(
  () => parseQianchuanProductionMigrationReviewQueueArgs(['--apply']),
  /Unknown qianchuan migration review queue option/,
  'write-like options should fail closed',
);
assert.throws(
  () => parseQianchuanProductionMigrationReviewQueueArgs([]),
  /--manifest is required/,
  'review queue should require an explicit source manifest',
);
assert.equal(qianchuanProductionMigrationReviewQueueExitCode(queue, false), 0, 'diagnostic queue should exit zero');
assert.equal(qianchuanProductionMigrationReviewQueueExitCode(queue, true), 1, 'strict queue should fail while reviews remain');

const resolvedTargetManifest = fixtureManifest([{
  ...entries.find((entry) => entry.version === '20260618_1430'),
  classification: 'applied_and_verified',
}]);
const resolvedQueue = buildQianchuanProductionMigrationReviewQueue({
  manifest: resolvedTargetManifest,
  sourceArtifact,
});
assert.equal(resolvedQueue.summary.queuedEntries, 0, 'fully resolved source should produce an empty queue');
assert.equal(qianchuanProductionMigrationReviewQueueExitCode(resolvedQueue, true), 0, 'strict queue should pass when empty');

console.log('[qianchuan-production-migration-review-queue-behavior] OK: validation, P0-P6 ordering, probe routing, external artifact safety, and strict exits passed.');
