#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import {
  parseQianchuanProductionMigrationP1cReviewDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-review-decisions-cli.mjs';
import {
  buildQianchuanProductionMigrationP1cReviewDecisions,
  QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS,
  validateQianchuanProductionMigrationP1cReviewDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-review-decisions.mjs';
import {
  validateQianchuanProductionMigrationOwnerDecisionArtifact,
} from '../../lib/migrations/aios-qianchuan-production-migration-owner-decision-artifact.mjs';
import {
  buildQianchuanProductionMigrationReviewDecisions,
  QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS,
} from '../../lib/migrations/aios-qianchuan-production-migration-review-decisions.mjs';
import {
  buildReviewedQianchuanProductionMigrationP1Packet,
  buildReviewedQianchuanProductionMigrationReviewQueue,
} from '../../lib/migrations/aios-qianchuan-production-migration-reviewed-overlay.mjs';

const MIGRATIONS_DIR = 'etl/groland_postgres/sql/migrations';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function artifact(value, artifactPath) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  return { path: artifactPath, bytes: bytes.length, sha256: sha256(bytes) };
}

function migrationPath(version) {
  const matches = readdirSync(MIGRATIONS_DIR).filter((name) => name.startsWith(`${version}__`));
  assert.equal(matches.length, 1, `${version} must resolve to one repository migration`);
  return `${MIGRATIONS_DIR}/${matches[0]}`;
}

function effect(key, satisfied = false, supersededBy = null) {
  return {
    expectedPresent: true,
    key: `relation:fixture.${key}`,
    kind: 'relation',
    name: key,
    present: satisfied,
    satisfied,
    schema: 'fixture',
    supersededBy,
  };
}

function p1bEntry(expected, index) {
  const relativePath = migrationPath(expected.version);
  const catalogEffects = index === 1
    ? Array.from({ length: 4 }, (_, effectIndex) => (
      effect(`${expected.version}_${effectIndex}`, false, '20260430_1200')
    ))
    : index === 2
      ? [effect(`${expected.version}_1`, true), effect(`${expected.version}_2`), effect(`${expected.version}_3`)]
      : [effect(expected.version)];
  return {
    namespace: expected.namespace,
    version: expected.version,
    checksum: expected.checksum,
    relativePath,
    classification: 'unknown',
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState: index === 1
      ? 'unprobeable'
      : index === 2 ? 'schema_effects_partial' : 'schema_effects_absent',
    schemaEvidence: index === 1
      ? { currentEffects: 0, satisfiedEffects: 0, supersededEffects: 4 }
      : { currentEffects: catalogEffects.length, satisfiedEffects: index === 2 ? 1 : 0, supersededEffects: 0 },
    unsupportedSignals: [],
    catalogEffects,
  };
}

function p1cEntry(expected) {
  const relativePath = migrationPath(expected.version);
  assert.equal(sha256(readFileSync(relativePath)), expected.checksum);
  return {
    namespace: expected.namespace,
    version: expected.version,
    checksum: expected.checksum,
    relativePath,
    classification: 'unknown',
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState: 'schema_effects_partial',
    schemaEvidence: { currentEffects: 2, satisfiedEffects: 1, supersededEffects: 0 },
    unsupportedSignals: ['procedural_body'],
    catalogEffects: [effect(`${expected.version}_1`, true), effect(`${expected.version}_2`)],
  };
}

const target = {
  namespace: 'warehouse',
  version: '20260618_1430',
  checksum: 'f'.repeat(64),
  relativePath: 'scripts/fixtures/qianchuan-target.sql',
  classification: 'partially_applied',
  executionEvidenceState: 'unknown',
  ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
  schemaEvidenceState: 'schema_effects_partial',
  schemaEvidence: { currentEffects: 10, satisfiedEffects: 2, supersededEffects: 0 },
  unsupportedSignals: ['dml_or_backfill'],
  catalogEffects: [effect('target_1', true), effect('target_2')],
};

const entries = [
  ...QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.map(p1bEntry),
  ...QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.map(p1cEntry),
  target,
].sort((left, right) => left.version.localeCompare(right.version));
const manifest = {
  schemaVersion: 1,
  auditedAt: '2026-07-24T06:20:00.000Z',
  mode: 'live_readonly',
  readOnlyTransaction: true,
  inventory: { total: entries.length },
  ledger: { exists: false, recordedRows: 0 },
  summary: { classifications: { partially_applied: 1, unknown: entries.length - 1 } },
  entries,
};
const manifestArtifact = artifact(manifest, '/tmp/p1c-owner-manifest.json');

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

const p1bEvidence = {
  schemaVersion: 1,
  mode: 'live_readonly',
  generatedAt: '2026-07-24T06:21:00.000Z',
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
const p1bEvidenceArtifact = artifact(p1bEvidence, '/tmp/p1c-owner-p1b-evidence.json');
const priorDecisions = buildQianchuanProductionMigrationReviewDecisions({
  evidence: p1bEvidence,
  evidenceArtifact: p1bEvidenceArtifact,
  evidenceSha256: p1bEvidenceArtifact.sha256,
  generatedAt: '2026-07-24T06:22:00.000Z',
  manifest,
  manifestArtifact,
  manifestSha256: manifestArtifact.sha256,
  reviewedAt: '2026-07-24T06:22:00.000Z',
  reviewer: 'repository-owner',
});
const priorDecisionsArtifact = artifact(priorDecisions, '/tmp/p1c-owner-prior-decisions.json');

function pendingLineageEntry(entry, currentReviewWaveLabel, lineageFamily) {
  return {
    namespace: entry.namespace,
    version: entry.version,
    checksum: entry.checksum,
    relativePath: entry.relativePath,
    authoritativeClassification: 'unknown',
    schemaEvidenceState: entry.schemaEvidenceState,
    executionEvidenceState: 'unknown',
    ledgerEvidenceState: 'ledger_missing',
    currentReviewWaveLabel,
    lineageFamily,
    review: {
      decision: null,
      evidenceLinks: [],
      notes: null,
      reviewedAt: null,
      reviewer: null,
    },
  };
}

const staticLineageEntries = [
  ['20260211_2000', '3ebb917915846e69e00642d3eb908877a4bb3679548339fa8d0fd6ecabe442e9'],
  ['20260212_1000', 'c8d12ab44a8f4a0614cdec92fc7e0804b7ea9a7227e27f2fc15cd44dd9aab315'],
  ['20260218_1000', '192535df78dd28251d4e2bc22e0a323defead6af575e768cb4c2855b2c512014'],
  ['20260224_1600', '5daf63ebd95201752d6d6debb21220839ed66f295e7a0b98f2abd52a63af220b'],
].map(([version, checksum]) => pendingLineageEntry({
  namespace: 'warehouse',
  version,
  checksum,
  relativePath: migrationPath(version),
  schemaEvidenceState: 'unprobeable',
}, null, 'explicit_relation_drop'));
const currentLineageEntries = QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.map((expected) => (
  pendingLineageEntry(
    entries.find((entry) => entry.version === expected.version),
    'P1C',
    expected.lineageFamily,
  )
));
const lineage = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T06:23:00.000Z',
  mode: 'offline_readonly_p1c_lineage_packet',
  sourceArtifacts: {
    manifest: manifestArtifact,
    p1: { path: '/tmp/p1c-owner-reviewed-p1.json', bytes: 1, sha256: 'a'.repeat(64) },
  },
  policy: {
    authoritativeClassificationUnchanged: true,
    deployAuthorized: false,
    humanReviewerRequired: true,
    ledgerWritesAuthorized: false,
    networkAccess: false,
    ownerDecisionRecorded: false,
    productionWritesAuthorized: false,
    sourceChecksumsVerified: true,
  },
  summary: {
    entries: 17,
    staticDependencySupersessionEntries: 4,
    remainingP1cEntries: 13,
    sourceChecksumsVerified: 17,
  },
  families: [],
  entries: [...staticLineageEntries, ...currentLineageEntries],
};
const lineageArtifact = artifact(lineage, '/tmp/p1c-owner-lineage.json');
const familyStatuses = [
  { family: 'explicit_relation_drop', mappedObjects: 0, catalogTopologyComplete: null, dataShapeObserved: null },
  ...Object.keys({
    dynamic_report_rename: true,
    creator_live_rename: true,
    live_dashboard_replacement: true,
    shortvideo_detail_evolution: true,
  }).map((family) => ({
    family,
    mappedObjects: 1,
    catalogTopologyComplete: true,
    dataShapeObserved: true,
  })),
];
const catalogProbe = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T06:24:00.000Z',
  mode: 'live_readonly_p1c_catalog_probe',
  sourceArtifact: lineageArtifact,
  policy: {
    transaction: 'BEGIN READ ONLY / ROLLBACK',
    statementTimeoutMs: 15000,
    networkAccess: true,
    authoritativeClassificationChanged: false,
    reviewerChanged: false,
    ownerDecisionRecorded: false,
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    deployAuthorized: false,
  },
  summary: {
    mappedFamilies: 4,
    catalogTopologyCompleteFamilies: 4,
    dataShapeObservedFamilies: 4,
    ownerDecisionReady: false,
  },
  familyStatuses,
  relations: [],
  routines: [],
  indexes: [],
};
const catalogProbeArtifact = artifact(catalogProbe, '/tmp/p1c-owner-catalog-probe.json');

const manifestBefore = JSON.stringify(manifest);
const priorBefore = JSON.stringify(priorDecisions);
const decisions = buildQianchuanProductionMigrationP1cReviewDecisions({
  catalogProbe,
  catalogProbeArtifact,
  catalogProbeSha256: catalogProbeArtifact.sha256,
  generatedAt: '2026-07-24T06:25:00.000Z',
  lineage,
  lineageArtifact,
  lineageSha256: lineageArtifact.sha256,
  manifest,
  manifestArtifact,
  manifestSha256: manifestArtifact.sha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256: priorDecisionsArtifact.sha256,
  reviewedAt: '2026-07-24T06:25:00.000Z',
  reviewer: 'repository-owner',
});
assert.equal(JSON.stringify(manifest), manifestBefore);
assert.equal(JSON.stringify(priorDecisions), priorBefore);
assert.equal(validateQianchuanProductionMigrationP1cReviewDecisions(decisions), decisions);
assert.equal(validateQianchuanProductionMigrationOwnerDecisionArtifact(decisions), decisions);
assert.equal(decisions.summary.decisions, 16);
assert.equal(decisions.summary.priorDecisions, 3);
assert.equal(decisions.summary.newDecisions, 13);
assert.ok(decisions.decisions.slice(3).every((entry) => entry.reviewWave === 'P1C'));
assert.equal(decisions.policy.productionWritesAuthorized, false);
assert.equal(decisions.policy.ledgerWritesAuthorized, false);
assert.equal(decisions.policy.deployAuthorized, false);

const decisionsArtifact = artifact(decisions, '/tmp/p1c-owner-decisions.json');
const reviewedQueue = buildReviewedQianchuanProductionMigrationReviewQueue({
  decisions,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  manifest,
  sourceArtifact: manifestArtifact,
});
assert.equal(reviewedQueue.summary.resolvedEntries, 16);
assert.equal(reviewedQueue.summary.queuedEntries, 1);
assert.equal(reviewedQueue.reviewedEntries.length, 16);
const reviewedP1 = buildReviewedQianchuanProductionMigrationP1Packet({
  decisions,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  manifest,
  sourceArtifact: manifestArtifact,
});
assert.equal(reviewedP1.summary.sourceEntries, 15);
assert.equal(reviewedP1.summary.resolvedEntries, 15);
assert.equal(reviewedP1.summary.queuedEntries, 0);
assert.equal(reviewedP1.summary.decisionsOutsideCurrentP1, 1);
assert.deepEqual(reviewedP1.summary.byWave, { P1A: 0, P1B: 0, P1C: 0, P1D: 0 });

assert.throws(
  () => buildQianchuanProductionMigrationP1cReviewDecisions({
    catalogProbe,
    catalogProbeArtifact,
    catalogProbeSha256: '0'.repeat(64),
    lineage,
    lineageArtifact,
    lineageSha256: lineageArtifact.sha256,
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    priorDecisions,
    priorDecisionsArtifact,
    priorDecisionsSha256: priorDecisionsArtifact.sha256,
    reviewedAt: '2026-07-24T06:25:00.000Z',
    reviewer: 'repository-owner',
  }),
  /catalog probe SHA-256 differs/,
);
assert.throws(
  () => buildQianchuanProductionMigrationP1cReviewDecisions({
    catalogProbe: {
      ...catalogProbe,
      familyStatuses: catalogProbe.familyStatuses.map((status) => (
        status.family === 'dynamic_report_rename'
          ? { ...status, catalogTopologyComplete: false }
          : status
      )),
    },
    catalogProbeArtifact,
    catalogProbeSha256: catalogProbeArtifact.sha256,
    lineage,
    lineageArtifact,
    lineageSha256: lineageArtifact.sha256,
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    priorDecisions,
    priorDecisionsArtifact,
    priorDecisionsSha256: priorDecisionsArtifact.sha256,
    reviewedAt: '2026-07-24T06:25:00.000Z',
    reviewer: 'repository-owner',
  }),
  /does not prove the dynamic_report_rename replacement topology/,
);
assert.throws(
  () => validateQianchuanProductionMigrationP1cReviewDecisions({
    ...decisions,
    decisions: decisions.decisions.map((entry, index) => (
      index === 3 ? { ...entry, decision: 'applied_and_verified' } : entry
    )),
  }),
  /P1C owner review decision is invalid/,
);
for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger', '--refresh']) {
  assert.throws(
    () => parseQianchuanProductionMigrationP1cReviewDecisionArgs([option]),
    /Unknown qianchuan migration P1C review decision option/,
  );
}
assert.throws(
  () => parseQianchuanProductionMigrationP1cReviewDecisionArgs([]),
  /--catalog-probe is required/,
);

console.log('[qianchuan-production-migration-p1c-review-decisions-behavior] OK: exact 13-entry P1C authorization, prior P1B replay, pinned lineage/catalog evidence, immutable 16-decision overlay, P1C 13->0, and write denial passed.');
