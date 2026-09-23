import path from 'node:path';

import { QIANCHUAN_SCHEMA_CONFLICT_STATES } from './aios-qianchuan-production-migration-review-policy.mjs';
import { validateQianchuanProductionMigrationManifest } from './aios-qianchuan-production-migration-review-queue.mjs';

const REVIEWER = 'repository-owner';
const REVIEW_DATE = '2026-07-24';

export const QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS = Object.freeze([
  Object.freeze({
    checksum: '7ee717eefd0825b51b595cd7a5e0ba0e66fec9209ae8631e239baa92abd08f30',
    namespace: 'warehouse',
    rationale: 'The original and renamed DWD relations are absent after the documented rename and later drop chain.',
    version: '20260212_1530',
  }),
  Object.freeze({
    checksum: '9dd65284b8a04c9971e4bd7dae981227a87b9414f6f56152f3e883b91f4a9a9e',
    namespace: 'warehouse',
    rationale: 'The later data-model rebuild dropped the owning attribution-week relation.',
    version: '20260213_1345',
  }),
  Object.freeze({
    checksum: '2f0033721a9c335df526d24ed4c580653031e19c4f5657034bc3bad7070aceac',
    namespace: 'warehouse',
    rationale: 'The old creator-live relations and indexes are absent while the renamed replacement relations and indexes are present.',
    version: '20260331_2350',
  }),
]);

function identity(value) {
  return `${value.namespace}/${value.version}`;
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp with milliseconds.`);
  }
}

export function assertPinnedMigrationReviewArtifact(metadata, expectedSha256, label) {
  if (!metadata || !path.isAbsolute(metadata.path ?? '') || !Number.isInteger(metadata.bytes)
    || metadata.bytes < 1 || !/^[a-f0-9]{64}$/.test(metadata.sha256 ?? '')) {
    throw new Error(`${label} metadata is invalid.`);
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? '')) {
    throw new Error(`${label} requires an explicit SHA-256 pin.`);
  }
  if (metadata.sha256 !== expectedSha256) {
    throw new Error(`${label} SHA-256 differs from the explicit pin.`);
  }
  return metadata;
}

function keyedRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`P1B evidence ${label} must be an array.`);
  const result = new Map();
  for (const row of rows) {
    if (typeof row?.qualified_name !== 'string' || result.has(row.qualified_name)) {
      throw new Error(`P1B evidence ${label} contains an invalid or duplicate qualified_name.`);
    }
    result.set(row.qualified_name, row);
  }
  return result;
}

function assertRelationState(relations, qualifiedName, present) {
  const row = relations.get(qualifiedName);
  if (!row) throw new Error(`P1B evidence is missing relation ${qualifiedName}.`);
  if (present && (row.oid == null || row.schema_name == null || row.relation_name == null)) {
    throw new Error(`P1B evidence does not prove relation ${qualifiedName} is present.`);
  }
  if (!present && (row.oid != null || row.schema_name != null || row.relation_name != null)) {
    throw new Error(`P1B evidence does not prove relation ${qualifiedName} is absent.`);
  }
}

function assertIndexState(indexes, qualifiedName, present, expectedTable = null) {
  const row = indexes.get(qualifiedName);
  if (!row) throw new Error(`P1B evidence is missing index ${qualifiedName}.`);
  if (present && (row.oid == null || row.index_name == null || row.definition == null)) {
    throw new Error(`P1B evidence does not prove index ${qualifiedName} is present.`);
  }
  if (!present && (row.oid != null || row.index_name != null || row.definition != null)) {
    throw new Error(`P1B evidence does not prove index ${qualifiedName} is absent.`);
  }
  if (present && expectedTable && `${row.table_schema}.${row.table_name}` !== expectedTable) {
    throw new Error(`P1B evidence index ${qualifiedName} belongs to an unexpected relation.`);
  }
}

export function validateQianchuanP1BReviewEvidence(evidence) {
  if (evidence?.schemaVersion !== 1 || evidence.mode !== 'live_readonly') {
    throw new Error('P1B evidence must be a schemaVersion=1 live_readonly artifact.');
  }
  assertIsoTimestamp(evidence.generatedAt, 'P1B evidence generatedAt');
  const expectedMigrations = QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.map(identity);
  if (!Array.isArray(evidence.migrations)
    || evidence.migrations.length !== expectedMigrations.length
    || evidence.migrations.some((value, index) => value !== expectedMigrations[index])) {
    throw new Error('P1B evidence migration allowlist is invalid.');
  }
  if (evidence.policy?.transaction !== 'BEGIN READ ONLY / ROLLBACK'
    || evidence.policy?.networkAccess !== true
    || !Number.isInteger(evidence.policy?.statementTimeoutMs)
    || evidence.policy.statementTimeoutMs < 1000
    || evidence.policy.statementTimeoutMs > 120000
    || evidence.policy?.productionWritesAuthorized !== false
    || evidence.policy?.classificationChanged !== false
    || evidence.policy?.reviewerChanged !== false) {
    throw new Error('P1B evidence policy does not prove the required read-only boundary.');
  }

  const relations = keyedRows(evidence.relations, 'relations');
  assertRelationState(relations, 'dwd.dwd_alimama_goods_marketing_di', false);
  assertRelationState(relations, 'dwd.taobao_alimama_goods_marketingscene', false);
  assertRelationState(relations, 'ads.taobao_alimama_goods_marketingscene_attribution_week', false);
  assertRelationState(relations, 'ads.creator_live_trade_daily', false);
  assertRelationState(relations, 'ads.creator_live_influencer_roster', false);
  assertRelationState(relations, 'ads.influencer_live_detail', true);
  assertRelationState(relations, 'ads.influencer_live_roster', true);

  const indexes = keyedRows(evidence.indexes, 'indexes');
  assertIndexState(indexes, 'ads.idx_creator_live_trade_daily_platform_anchor_date', false);
  assertIndexState(indexes, 'ads.idx_creator_live_influencer_roster_platform_influencer_id', false);
  assertIndexState(indexes, 'ads.idx_influencer_live_detail_platform_anchor_date', false);
  assertIndexState(indexes, 'ads.idx_influencer_live_detail_platform_influencer_date', true, 'ads.influencer_live_detail');
  assertIndexState(indexes, 'ads.idx_influencer_live_roster_platform_influencer_id', true, 'ads.influencer_live_roster');
  return evidence;
}

function validateAllowlistedManifestEntries(manifest) {
  const entries = new Map(manifest.entries.map((entry) => [identity(entry), entry]));
  for (const expected of QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS) {
    const entry = entries.get(identity(expected));
    if (!entry || entry.checksum !== expected.checksum) {
      throw new Error(`${identity(expected)} is missing or its checksum differs from the owner-review allowlist.`);
    }
    if (!isQianchuanOwnerReviewedDdlBoundary(entry)) {
      throw new Error(`${identity(expected)} no longer matches the owner-reviewed DDL-only boundary.`);
    }
  }
}

export function isQianchuanOwnerReviewedDdlBoundary(entry) {
  const catalogEffects = Array.isArray(entry?.catalogEffects) ? entry.catalogEffects : [];
  const fullySuperseded = entry?.schemaEvidenceState === 'unprobeable'
    && entry?.schemaEvidence?.currentEffects === 0
    && entry?.schemaEvidence?.satisfiedEffects === 0
    && Number.isInteger(entry?.schemaEvidence?.supersededEffects)
    && entry.schemaEvidence.supersededEffects > 0
    && catalogEffects.length === entry.schemaEvidence.supersededEffects
    && catalogEffects.every((effect) => typeof effect?.supersededBy === 'string');
  return entry?.classification === 'unknown'
    && Array.isArray(entry?.unsupportedSignals)
    && entry.unsupportedSignals.length === 0
    && (QIANCHUAN_SCHEMA_CONFLICT_STATES.has(entry.schemaEvidenceState) || fullySuperseded);
}

function artifactLink(kind, artifact) {
  return { bytes: artifact.bytes, kind, path: artifact.path, sha256: artifact.sha256 };
}

export function buildQianchuanProductionMigrationReviewDecisions({
  evidence,
  evidenceArtifact,
  evidenceSha256,
  generatedAt = new Date().toISOString(),
  manifest,
  manifestArtifact,
  manifestSha256,
  reviewedAt,
  reviewer,
}) {
  validateQianchuanProductionMigrationManifest(manifest);
  validateQianchuanP1BReviewEvidence(evidence);
  assertPinnedMigrationReviewArtifact(manifestArtifact, manifestSha256, 'Reconciliation manifest');
  assertPinnedMigrationReviewArtifact(evidenceArtifact, evidenceSha256, 'P1B live evidence');
  assertIsoTimestamp(generatedAt, 'Decision artifact generatedAt');
  assertIsoTimestamp(reviewedAt, 'Decision reviewedAt');
  if (!reviewedAt.startsWith(`${REVIEW_DATE}T`)) {
    throw new Error(`Decision reviewedAt must record the ${REVIEW_DATE} owner continuation.`);
  }
  if (reviewer !== REVIEWER) {
    throw new Error(`Decision reviewer must be the neutral identity ${REVIEWER}.`);
  }
  validateAllowlistedManifestEntries(manifest);

  const evidenceLinks = [
    artifactLink('reconciliation_manifest', manifestArtifact),
    artifactLink('p1b_live_readonly_probe', evidenceArtifact),
  ];
  return {
    schemaVersion: 1,
    generatedAt,
    mode: 'offline_owner_review_decisions',
    authorization: {
      acceptedOn: REVIEW_DATE,
      evidence: 'current_user_continuation_after_documented_p1b_not_applicable_recommendation',
      reviewer,
    },
    sourceArtifacts: {
      evidence: evidenceArtifact,
      manifest: manifestArtifact,
    },
    policy: {
      authoritativeManifestMutated: false,
      decision: 'not_applicable',
      deployAuthorized: false,
      ledgerWritesAuthorized: false,
      networkAccess: false,
      productionWritesAuthorized: false,
    },
    summary: {
      decisions: QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length,
      ledgerActions: { do_not_record: QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length },
      reviewStatuses: { verified_not_applicable: QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length },
    },
    decisions: QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.map((entry) => ({
      ...entry,
      decision: 'not_applicable',
      evidenceLinks: evidenceLinks.map((link) => ({ ...link })),
      ledgerAction: 'do_not_record',
      reviewStatus: 'verified_not_applicable',
      reviewedAt,
      reviewer,
      sourceClassification: 'unknown',
    })),
  };
}

export function validateQianchuanProductionMigrationReviewDecisions(decisions, {
  manifest,
  manifestArtifact,
} = {}) {
  if (decisions?.schemaVersion !== 1 || decisions.mode !== 'offline_owner_review_decisions') {
    throw new Error('Owner review decisions must be schemaVersion=1 offline_owner_review_decisions.');
  }
  assertIsoTimestamp(decisions.generatedAt, 'Decision artifact generatedAt');
  if (decisions.authorization?.reviewer !== REVIEWER
    || decisions.authorization?.acceptedOn !== REVIEW_DATE
    || decisions.authorization?.evidence !== 'current_user_continuation_after_documented_p1b_not_applicable_recommendation'
    || decisions.policy?.authoritativeManifestMutated !== false
    || decisions.policy?.productionWritesAuthorized !== false
    || decisions.policy?.ledgerWritesAuthorized !== false
    || decisions.policy?.deployAuthorized !== false
    || decisions.policy?.networkAccess !== false
    || decisions.policy?.decision !== 'not_applicable') {
    throw new Error('Owner review decision policy or authorization is invalid.');
  }
  const sourceManifest = decisions.sourceArtifacts?.manifest;
  const sourceEvidence = decisions.sourceArtifacts?.evidence;
  assertPinnedMigrationReviewArtifact(sourceManifest, sourceManifest?.sha256, 'Decision source manifest');
  assertPinnedMigrationReviewArtifact(sourceEvidence, sourceEvidence?.sha256, 'Decision source evidence');
  if (decisions.summary?.decisions !== QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.ledgerActions?.do_not_record !== QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.reviewStatuses?.verified_not_applicable !== QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length) {
    throw new Error('Owner review decision summary is inconsistent.');
  }
  if (!Array.isArray(decisions.decisions)
    || decisions.decisions.length !== QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length) {
    throw new Error('Owner review decisions must contain the exact three-entry allowlist.');
  }
  for (const [index, expected] of QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.entries()) {
    const decision = decisions.decisions[index];
    assertIsoTimestamp(decision?.reviewedAt, `${identity(expected)} reviewedAt`);
    const expectedLinks = [
      artifactLink('reconciliation_manifest', sourceManifest),
      artifactLink('p1b_live_readonly_probe', sourceEvidence),
    ];
    if (identity(decision ?? {}) !== identity(expected) || decision.checksum !== expected.checksum
      || decision.decision !== 'not_applicable' || decision.reviewStatus !== 'verified_not_applicable'
      || decision.ledgerAction !== 'do_not_record' || decision.reviewer !== REVIEWER
      || decision.sourceClassification !== 'unknown' || decision.rationale !== expected.rationale
      || !Array.isArray(decision.evidenceLinks)
      || decision.evidenceLinks.length !== 2
      || JSON.stringify(decision.evidenceLinks) !== JSON.stringify(expectedLinks)
      || !decision.reviewedAt.startsWith(`${REVIEW_DATE}T`)) {
      throw new Error(`${identity(expected)} owner review decision is invalid.`);
    }
  }
  if (manifest) {
    validateQianchuanProductionMigrationManifest(manifest);
    validateAllowlistedManifestEntries(manifest);
  }
  if (manifestArtifact && decisions.sourceArtifacts?.manifest?.sha256 !== manifestArtifact.sha256) {
    throw new Error('Owner review decisions were created from a different reconciliation manifest.');
  }
  return decisions;
}
