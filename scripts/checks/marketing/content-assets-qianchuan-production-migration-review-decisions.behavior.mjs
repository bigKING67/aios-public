#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import './content-assets-qianchuan-production-migration-p1c-review-decisions.behavior.mjs';

import {
  readExternalMigrationAuditJson,
  writeExclusiveMigrationAuditJson,
} from '../../lib/migrations/aios-migration-audit-artifact.mjs';
import { qianchuanProductionMigrationP1ReviewExitCode } from '../../lib/migrations/aios-qianchuan-production-migration-p1-review-cli.mjs';
import { buildQianchuanProductionMigrationP1ReviewPacket } from '../../lib/migrations/aios-qianchuan-production-migration-p1-review.mjs';
import {
  parseQianchuanProductionMigrationReviewDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-review-decisions-cli.mjs';
import {
  buildQianchuanProductionMigrationReviewDecisions,
  QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS,
  validateQianchuanProductionMigrationReviewDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-review-decisions.mjs';
import { buildQianchuanProductionMigrationReviewQueue } from '../../lib/migrations/aios-qianchuan-production-migration-review-queue.mjs';
import {
  buildReviewedQianchuanProductionMigrationP1Packet,
  buildReviewedQianchuanProductionMigrationReviewQueue,
} from '../../lib/migrations/aios-qianchuan-production-migration-reviewed-overlay.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const generatedSources = new Map();

function effect(version, satisfied = false) {
  return {
    expectedPresent: true,
    key: `relation:fixture.${version}`,
    kind: 'relation',
    name: version,
    present: satisfied,
    satisfied,
    schema: 'fixture',
    supersededBy: null,
  };
}

function allowlistedEntry(expected, index) {
  const catalogEffects = index === 1
    ? Array.from({ length: 4 }, (_, effectIndex) => ({
      ...effect(`${expected.version}_${effectIndex}`),
      supersededBy: '20260430_1200',
    }))
    : [effect(expected.version, index === 2)];
  return {
    namespace: expected.namespace,
    version: expected.version,
    checksum: expected.checksum,
    relativePath: [
      'etl/groland_postgres/sql/migrations/20260212_1530__create_dwd_alimama_goods_marketing_di.sql',
      'etl/groland_postgres/sql/migrations/20260213_1345__add_contribution_rate_columns_to_ads_attribution_week.sql',
      'etl/groland_postgres/sql/migrations/20260331_2350__creator_live_platform_anchor_join_indexes.sql',
    ][index],
    classification: 'unknown',
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState: index === 1
      ? 'unprobeable'
      : index === 2 ? 'schema_effects_partial' : 'schema_effects_absent',
    schemaEvidence: index === 1
      ? { currentEffects: 0, satisfiedEffects: 0, supersededEffects: 4 }
      : { currentEffects: index === 2 ? 3 : 1, satisfiedEffects: index === 2 ? 1 : 0, supersededEffects: 0 },
    unsupportedSignals: [],
    catalogEffects,
  };
}

function generatedP1Entry(index, partial) {
  const version = `202604${String(index + 1).padStart(2, '0')}_${partial ? '1000' : '2000'}`;
  const relativePath = `scripts/fixtures/${version}__review-decision.sql`;
  const content = Buffer.from(`-- ${version}\nSELECT 1;\n`);
  generatedSources.set(path.resolve(process.cwd(), relativePath), content);
  return {
    namespace: 'warehouse',
    version,
    checksum: sha256(content),
    relativePath,
    classification: 'unknown',
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState: partial ? 'schema_effects_partial' : 'schema_effects_absent',
    schemaEvidence: { currentEffects: 2, satisfiedEffects: partial ? 1 : 0, supersededEffects: 0 },
    unsupportedSignals: [partial ? 'dml_or_backfill' : 'procedural_body'],
    catalogEffects: [effect(version, partial), effect(`${version}_2`, false)],
  };
}

const p1Entries = [
  ...QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.map(allowlistedEntry),
  ...Array.from({ length: 17 }, (_, index) => generatedP1Entry(index, true)),
  ...Array.from({ length: 17 }, (_, index) => generatedP1Entry(index, false)),
];
const target = {
  ...generatedP1Entry(20, true),
  version: '20260618_1430',
  classification: 'partially_applied',
};
const entries = [...p1Entries, target].sort((left, right) => left.version.localeCompare(right.version));
const manifest = {
  schemaVersion: 1,
  auditedAt: '2026-07-24T05:01:28.000Z',
  mode: 'live_readonly',
  readOnlyTransaction: true,
  inventory: { total: entries.length },
  ledger: { exists: false, recordedRows: 0 },
  summary: { classifications: { partially_applied: 1, unknown: p1Entries.length } },
  entries,
};

function absentRelation(qualifiedName) {
  return { qualified_name: qualifiedName, oid: null, schema_name: null, relation_name: null };
}

function presentRelation(qualifiedName) {
  const [schemaName, relationName] = qualifiedName.split('.');
  return { qualified_name: qualifiedName, oid: '1', schema_name: schemaName, relation_name: relationName };
}

function absentIndex(qualifiedName) {
  return { qualified_name: qualifiedName, oid: null, index_name: null, definition: null };
}

function presentIndex(qualifiedName, tableName) {
  return {
    qualified_name: qualifiedName,
    oid: '1',
    index_name: qualifiedName.split('.')[1],
    table_schema: 'ads',
    table_name: tableName,
    definition: `CREATE INDEX ${qualifiedName.split('.')[1]}`,
  };
}

const evidence = {
  schemaVersion: 1,
  mode: 'live_readonly',
  generatedAt: '2026-07-24T05:09:24.019Z',
  migrations: QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.map((entry) => `${entry.namespace}/${entry.version}`),
  policy: {
    transaction: 'BEGIN READ ONLY / ROLLBACK',
    statementTimeoutMs: 15000,
    networkAccess: true,
    productionWritesAuthorized: false,
    classificationChanged: false,
    reviewerChanged: false,
  },
  relations: [
    absentRelation('dwd.dwd_alimama_goods_marketing_di'),
    absentRelation('dwd.taobao_alimama_goods_marketingscene'),
    absentRelation('ads.taobao_alimama_goods_marketingscene_attribution_week'),
    absentRelation('ads.creator_live_trade_daily'),
    absentRelation('ads.creator_live_influencer_roster'),
    presentRelation('ads.influencer_live_detail'),
    presentRelation('ads.influencer_live_roster'),
  ],
  indexes: [
    absentIndex('ads.idx_creator_live_trade_daily_platform_anchor_date'),
    absentIndex('ads.idx_creator_live_influencer_roster_platform_influencer_id'),
    absentIndex('ads.idx_influencer_live_detail_platform_anchor_date'),
    presentIndex('ads.idx_influencer_live_detail_platform_influencer_date', 'influencer_live_detail'),
    presentIndex('ads.idx_influencer_live_roster_platform_influencer_id', 'influencer_live_roster'),
  ],
};

function artifact(value, artifactPath) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  return { path: artifactPath, bytes: bytes.length, sha256: sha256(bytes) };
}

const manifestArtifact = artifact(manifest, '/tmp/reconciliation.json');
const evidenceArtifact = artifact(evidence, '/tmp/p1b-evidence.json');
const manifestBefore = JSON.stringify(manifest);
const decisions = buildQianchuanProductionMigrationReviewDecisions({
  evidence,
  evidenceArtifact,
  evidenceSha256: evidenceArtifact.sha256,
  generatedAt: '2026-07-24T06:00:00.000Z',
  manifest,
  manifestArtifact,
  manifestSha256: manifestArtifact.sha256,
  reviewedAt: '2026-07-24T05:58:00.000Z',
  reviewer: 'repository-owner',
});
assert.equal(JSON.stringify(manifest), manifestBefore, 'decision generation must not mutate the source manifest');
assert.equal(validateQianchuanProductionMigrationReviewDecisions(decisions), decisions);
assert.equal(decisions.summary.decisions, 3);
assert.ok(decisions.decisions.every((entry) => entry.decision === 'not_applicable'));
assert.ok(decisions.decisions.every((entry) => entry.ledgerAction === 'do_not_record'));
assert.equal(decisions.policy.productionWritesAuthorized, false);
assert.equal(decisions.policy.ledgerWritesAuthorized, false);

assert.throws(
  () => buildQianchuanProductionMigrationReviewDecisions({
    evidence,
    evidenceArtifact,
    evidenceSha256: '0'.repeat(64),
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    reviewedAt: '2026-07-24T05:58:00.000Z',
    reviewer: 'repository-owner',
  }),
  /evidence SHA-256 differs/,
);
assert.throws(
  () => buildQianchuanProductionMigrationReviewDecisions({
    evidence,
    evidenceArtifact,
    evidenceSha256: evidenceArtifact.sha256,
    manifest: { ...manifest, entries: manifest.entries.map((entry) => (
      entry.version === '20260212_1530' ? { ...entry, checksum: '0'.repeat(64) } : entry
    )) },
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    reviewedAt: '2026-07-24T05:58:00.000Z',
    reviewer: 'repository-owner',
  }),
  /checksum differs from the owner-review allowlist/,
);
assert.throws(
  () => buildQianchuanProductionMigrationReviewDecisions({
    evidence,
    evidenceArtifact,
    evidenceSha256: evidenceArtifact.sha256,
    manifest: { ...manifest, entries: manifest.entries.map((entry) => (
      entry.version === '20260212_1530' ? { ...entry, namespace: 'backend' } : entry
    )) },
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    reviewedAt: '2026-07-24T05:58:00.000Z',
    reviewer: 'repository-owner',
  }),
  /missing or its checksum differs/,
);
assert.throws(
  () => buildQianchuanProductionMigrationReviewDecisions({
    evidence,
    evidenceArtifact,
    evidenceSha256: evidenceArtifact.sha256,
    manifest: { ...manifest, entries: manifest.entries.map((entry) => (
      entry.version === '20260213_1345'
        ? {
          ...entry,
          catalogEffects: entry.catalogEffects.map((catalogEffect, index) => (
            index === 0 ? { ...catalogEffect, supersededBy: null } : catalogEffect
          )),
        }
        : entry
    )) },
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    reviewedAt: '2026-07-24T05:58:00.000Z',
    reviewer: 'repository-owner',
  }),
  /owner-reviewed DDL-only boundary/,
);
assert.throws(
  () => buildQianchuanProductionMigrationReviewDecisions({
    evidence,
    evidenceArtifact,
    evidenceSha256: evidenceArtifact.sha256,
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    reviewedAt: '2026-07-24T05:58:00.000Z',
    reviewer: 'someone-else',
  }),
  /reviewer must be the neutral identity/,
);
assert.throws(
  () => buildQianchuanProductionMigrationReviewDecisions({
    evidence,
    evidenceArtifact,
    evidenceSha256: evidenceArtifact.sha256,
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    reviewedAt: '2026-07-23T05:58:00.000Z',
    reviewer: 'repository-owner',
  }),
  /must record the 2026-07-24 owner continuation/,
);
assert.throws(
  () => validateQianchuanProductionMigrationReviewDecisions({
    ...decisions,
    decisions: decisions.decisions.map((entry, index) => (
      index === 0 ? { ...entry, decision: 'applied_and_verified' } : entry
    )),
  }),
  /owner review decision is invalid/,
);
for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger']) {
  assert.throws(
    () => parseQianchuanProductionMigrationReviewDecisionArgs([option]),
    /Unknown qianchuan migration review decision option/,
  );
}
assert.throws(
  () => parseQianchuanProductionMigrationReviewDecisionArgs([]),
  /--evidence is required/,
);

const decisionsArtifact = artifact(decisions, '/tmp/review-decisions.json');
const baseQueue = buildQianchuanProductionMigrationReviewQueue({ manifest, sourceArtifact: manifestArtifact });
const reviewedQueue = buildReviewedQianchuanProductionMigrationReviewQueue({
  decisions,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  manifest,
  sourceArtifact: manifestArtifact,
});
assert.equal(baseQueue.summary.byPriority.P1, 36);
assert.equal(reviewedQueue.summary.byPriority.P1, 34);
assert.equal(reviewedQueue.summary.resolvedEntries, 3);
assert.equal(reviewedQueue.reviewedEntries.length, 3);
assert.ok(reviewedQueue.entries.every((entry) => !decisions.decisions.some((item) => item.version === entry.version)));

const sourceOptions = {
  readFile: (filePath) => generatedSources.get(filePath) ?? readFileSync(filePath),
  realpath: (filePath) => filePath,
  sourceRoot: process.cwd(),
};
const baseP1 = buildQianchuanProductionMigrationP1ReviewPacket({
  manifest,
  sourceArtifact: manifestArtifact,
  sourceOptions,
});
const reviewedP1 = buildReviewedQianchuanProductionMigrationP1Packet({
  decisions,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  manifest,
  sourceArtifact: manifestArtifact,
  sourceOptions,
});
assert.equal(baseP1.summary.entries, 36);
assert.deepEqual(baseP1.summary.byWave, { P1B: 2, P1C: 17, P1D: 17 });
assert.equal(reviewedP1.summary.entries, 34);
assert.deepEqual(reviewedP1.summary.byWave, { P1A: 0, P1B: 0, P1C: 17, P1D: 17 });
assert.equal(reviewedP1.summary.resolvedEntries, 2);
assert.equal(reviewedP1.summary.decisionsOutsideCurrentP1, 1);
assert.equal(reviewedP1.reviewedEntries.length, 2);
assert.equal(reviewedP1.policy.productionWritesAuthorized, false);
assert.equal(reviewedP1.policy.ledgerWritesAuthorized, false);
assert.equal(qianchuanProductionMigrationP1ReviewExitCode(reviewedP1, true), 1);
assert.throws(
  () => buildReviewedQianchuanProductionMigrationP1Packet({
    decisions,
    decisionsArtifact,
    decisionsSha256: '0'.repeat(64),
    manifest,
    sourceArtifact: manifestArtifact,
    sourceOptions,
  }),
  /decisions SHA-256 differs/,
);

const loaded = readExternalMigrationAuditJson('/tmp/review-decisions.json', {
  readFile: () => Buffer.from(`${JSON.stringify(decisions)}\n`),
  realpath: (value) => value,
});
assert.equal(loaded.data.mode, decisions.mode);
assert.throws(
  () => readExternalMigrationAuditJson(`${process.cwd()}/review-decisions.json`),
  /outside the repository/,
);
assert.throws(
  () => readExternalMigrationAuditJson('/tmp/oversize-decisions.json', {
    maxBytes: 1,
    readFile: () => Buffer.from('{}'),
    realpath: (value) => value,
  }),
  /exceeds 1 bytes/,
);
let writeOptions;
writeExclusiveMigrationAuditJson(decisions, '/tmp/review-decisions.json', {
  writeFile: (_filePath, _content, options) => { writeOptions = options; },
});
assert.equal(writeOptions.flag, 'wx');

console.log('[qianchuan-production-migration-review-decisions-behavior] OK: pinned evidence, exact owner decisions, immutable overlays, fully-superseded replay, P1 36->34, P1B 2->0, and write denial passed.');
