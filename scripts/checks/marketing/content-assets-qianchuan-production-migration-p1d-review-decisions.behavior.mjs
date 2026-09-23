#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import {
  buildReadyAlimamaRuntimeRetirementFixture,
} from './content-assets-qianchuan-production-migration-alimama-runtime-retirement-fixtures.mjs';
import {
  assertInfluencerTagForwardRepairDecisionBehavior,
} from './content-assets-qianchuan-production-migration-influencer-tag-forward-repair-decisions.behavior-fixtures.mjs';
import {
  parseQianchuanAlimamaRuntimeRetirementDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-decisions-cli.mjs';
import {
  buildQianchuanAlimamaRuntimeRetirementDecisions,
  validateQianchuanAlimamaRuntimeRetirementDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-decisions.mjs';
import {
  parseQianchuanProductionMigrationP1dReviewDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-review-decisions-cli.mjs';
import {
  parseQianchuanProductionMigrationP1dForwardRepairDecisionArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-forward-repair-decisions-cli.mjs';
import {
  buildQianchuanProductionMigrationP1dForwardRepairDecisions,
  validateQianchuanProductionMigrationP1dForwardRepairDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-forward-repair-decisions.mjs';
import {
  validateQianchuanProductionMigrationOwnerDecisionArtifact,
} from '../../lib/migrations/aios-qianchuan-production-migration-owner-decision-artifact.mjs';
import {
  buildQianchuanProductionMigrationP1dReviewDecisions,
  QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS,
  QIANCHUAN_P1D_UNRESOLVED_EVIDENCE,
  validateQianchuanProductionMigrationP1dReviewDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-review-decisions.mjs';
import {
  QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS,
  validateQianchuanProductionMigrationP1cReviewDecisions,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-review-decisions.mjs';
import {
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

function artifactLink(kind, metadata) {
  return { bytes: metadata.bytes, kind, path: metadata.path, sha256: metadata.sha256 };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
    relativePath: migrationPath(expected.version),
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

const p1dDefinitions = [
  {
    checksum: '092938c17614ae5ac464eb77a35828714bda5440b1b46a6b38256f56994c2d9c',
    family: 'alimama_incremental_rename',
    state: 'source_data_present_without_old_or_replacement_runtime',
    version: '20260212_1600',
  },
  ...QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS.map((entry) => ({
    checksum: entry.checksum,
    family: entry.lineageFamily,
    state: entry.evidenceState,
    version: entry.version,
  })),
  {
    checksum: '8d94ae900ab7ece5f389cd93f1a7510597556b7022f9cddbe32884af82430a6a',
    family: 'influencer_tag_normalization',
    state: 'missing_runtime_contract_with_data_drift',
    version: '20260510_1800',
  },
  {
    checksum: '9b5e08a572a47505fa5e1215f7136e839834344d3170a20f4b259c1c17ed61ff',
    family: 'qianchuan_parse_helpers',
    state: 'missing_runtime_contract_on_dormant_data_path',
    version: '20260525_1730',
  },
  {
    checksum: '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290',
    family: 'card_ratio_enforcement',
    state: 'missing_runtime_contract_with_data_drift',
    version: '20260609_2045',
  },
  {
    checksum: '572dbc25d198cf81276866b7e2f877d258ce940a8c06b974f467527ff52d3d5e',
    family: 'platform_video_identity_dedupe',
    state: 'clean_current_data_without_exact_unique_guard',
    version: '20260617_1900',
  },
].sort((left, right) => left.version.localeCompare(right.version));

function p1dEntry(definition) {
  const relativePath = migrationPath(definition.version);
  assert.equal(sha256(readFileSync(relativePath)), definition.checksum);
  return {
    namespace: 'warehouse',
    version: definition.version,
    checksum: definition.checksum,
    relativePath,
    classification: 'unknown',
    executionEvidenceState: 'unknown',
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    schemaEvidenceState: 'schema_effects_absent',
    schemaEvidence: { currentEffects: 1, satisfiedEffects: 0, supersededEffects: 0 },
    unsupportedSignals: ['dml_or_backfill', 'procedural_body'],
    catalogEffects: [effect(definition.version)],
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
  schemaEvidence: { currentEffects: 2, satisfiedEffects: 1, supersededEffects: 0 },
  unsupportedSignals: ['dml_or_backfill'],
  catalogEffects: [effect('target_1', true), effect('target_2')],
};
const entries = [
  ...QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.map(p1bEntry),
  ...QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.map(p1cEntry),
  ...p1dDefinitions.map(p1dEntry),
  target,
].sort((left, right) => left.version.localeCompare(right.version));
const manifest = {
  schemaVersion: 1,
  auditedAt: '2026-07-24T15:20:00.000Z',
  mode: 'live_readonly',
  readOnlyTransaction: true,
  inventory: { total: entries.length },
  ledger: { exists: false, recordedRows: 0 },
  summary: { classifications: { partially_applied: 1, unknown: entries.length - 1 } },
  entries,
};
const manifestArtifact = artifact(manifest, '/tmp/p1d-owner-manifest.json');

const p1bEvidenceArtifact = artifact({ fixture: 'p1b-evidence' }, '/tmp/p1d-owner-p1b-evidence.json');
const p1bDecisionArtifact = artifact({ fixture: 'p1b-decisions' }, '/tmp/p1d-owner-p1b-decisions.json');
const p1cLineageArtifact = artifact({ fixture: 'p1c-lineage' }, '/tmp/p1d-owner-p1c-lineage.json');
const p1cProbeArtifact = artifact({ fixture: 'p1c-probe' }, '/tmp/p1d-owner-p1c-probe.json');
const reviewedAt = '2026-07-24T15:30:00.000Z';
const p1bLinks = [
  artifactLink('reconciliation_manifest', manifestArtifact),
  artifactLink('p1b_live_readonly_probe', p1bEvidenceArtifact),
];
const p1cLinks = [
  artifactLink('reconciliation_manifest', manifestArtifact),
  artifactLink('p1c_lineage_packet', p1cLineageArtifact),
  artifactLink('p1c_live_readonly_catalog_probe', p1cProbeArtifact),
];
const priorDecisions = {
  schemaVersion: 2,
  generatedAt: reviewedAt,
  mode: 'offline_owner_review_decisions',
  authorization: {
    acceptedOn: '2026-07-24',
    evidence: 'current_user_authorized_exact_p1c_cohort_after_pinned_lineage_and_catalog_proof',
    newDecisionCohort: 'P1C',
    reviewer: 'repository-owner',
  },
  sourceArtifacts: {
    catalogProbe: p1cProbeArtifact,
    lineage: p1cLineageArtifact,
    manifest: manifestArtifact,
    priorDecisions: p1bDecisionArtifact,
  },
  policy: {
    authoritativeManifestMutated: false,
    decision: 'not_applicable',
    deployAuthorized: false,
    ledgerWritesAuthorized: false,
    networkAccess: false,
    priorDecisionArtifactMutated: false,
    productionWritesAuthorized: false,
  },
  summary: {
    decisions: 16,
    priorDecisions: 3,
    newDecisions: 13,
    byCohort: { P1B: 3, P1C: 13 },
    ledgerActions: { do_not_record: 16 },
    reviewStatuses: { verified_not_applicable: 16 },
  },
  decisions: [
    ...QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.map((entry) => ({
      ...entry,
      decision: 'not_applicable',
      evidenceLinks: p1bLinks.map((link) => ({ ...link })),
      ledgerAction: 'do_not_record',
      reviewStatus: 'verified_not_applicable',
      reviewedAt,
      reviewer: 'repository-owner',
      sourceClassification: 'unknown',
    })),
    ...QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.map((entry) => ({
      ...entry,
      decision: 'not_applicable',
      decisionCohort: 'P1C',
      evidenceLinks: p1cLinks.map((link) => ({ ...link })),
      ledgerAction: 'do_not_record',
      reviewStatus: 'verified_not_applicable',
      reviewWave: 'P1C',
      reviewedAt,
      reviewer: 'repository-owner',
      sourceClassification: 'unknown',
    })),
  ],
};
assert.equal(validateQianchuanProductionMigrationP1cReviewDecisions(priorDecisions), priorDecisions);
const priorDecisionsArtifact = artifact(priorDecisions, '/tmp/p1d-owner-prior-decisions.json');

function pendingReview() {
  return {
    decision: null,
    evidenceLinks: [],
    notes: null,
    reviewedAt: null,
    reviewer: null,
  };
}

const lineage = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T15:25:00.000Z',
  mode: 'offline_readonly_p1d_lineage_packet',
  sourceArtifacts: {
    manifest: manifestArtifact,
    p1: artifact({ fixture: 'reviewed-p1' }, '/tmp/p1d-owner-reviewed-p1.json'),
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
  summary: { entries: 8, families: 8, sourceChecksumsVerified: 8 },
  families: p1dDefinitions.map((entry) => ({
    family: entry.family,
    entries: [`warehouse/${entry.version}`],
  })),
  entries: p1dDefinitions.map((definition) => {
    const entry = entries.find((value) => value.version === definition.version);
    return {
      namespace: entry.namespace,
      version: entry.version,
      checksum: entry.checksum,
      relativePath: entry.relativePath,
      authoritativeClassification: 'unknown',
      schemaEvidenceState: entry.schemaEvidenceState,
      executionEvidenceState: entry.executionEvidenceState,
      ledgerEvidenceState: 'ledger_missing',
      currentReviewWaveLabel: 'P1D',
      lineageFamily: definition.family,
      review: pendingReview(),
    };
  }),
};
const lineageArtifact = artifact(lineage, '/tmp/p1d-owner-lineage.json');
const readonlyProbe = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T15:26:00.000Z',
  mode: 'live_readonly_p1d_catalog_data_shape_probe',
  sourceArtifact: lineageArtifact,
  policy: {
    transaction: 'BEGIN READ ONLY / ROLLBACK',
    statementTimeoutMs: 30000,
    networkAccess: true,
    authoritativeClassificationChanged: false,
    reviewerChanged: false,
    ownerDecisionRecorded: false,
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    deployAuthorized: false,
    arkInvoked: false,
  },
  summary: { entries: 8, families: 8, ownerDecisionReady: false },
  entryEvidence: p1dDefinitions.map((entry) => ({
    family: entry.family,
    entries: [`warehouse/${entry.version}`],
    evidenceState: entry.state,
    decision: null,
    reviewer: null,
  })),
};
const readonlyProbeArtifact = artifact(readonlyProbe, '/tmp/p1d-owner-readonly-probe.json');

const manifestBefore = JSON.stringify(manifest);
const priorBefore = JSON.stringify(priorDecisions);
const decisions = buildQianchuanProductionMigrationP1dReviewDecisions({
  generatedAt: '2026-07-24T15:31:00.000Z',
  lineage,
  lineageArtifact,
  lineageSha256: lineageArtifact.sha256,
  manifest,
  manifestArtifact,
  manifestSha256: manifestArtifact.sha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256: priorDecisionsArtifact.sha256,
  readonlyProbe,
  readonlyProbeArtifact,
  readonlyProbeSha256: readonlyProbeArtifact.sha256,
  reviewedAt: '2026-07-24T15:31:00.000Z',
  reviewer: 'repository-owner',
});
assert.equal(JSON.stringify(manifest), manifestBefore);
assert.equal(JSON.stringify(priorDecisions), priorBefore);
assert.equal(validateQianchuanProductionMigrationP1dReviewDecisions(decisions, {
  manifest,
  manifestArtifact,
  priorDecisions,
}), decisions);
assert.equal(validateQianchuanProductionMigrationOwnerDecisionArtifact(decisions), decisions);
assert.equal(decisions.summary.decisions, 19);
assert.equal(decisions.summary.priorDecisions, 16);
assert.equal(decisions.summary.newDecisions, 3);
assert.equal(decisions.summary.unresolvedP1dEntries, 5);
assert.deepEqual(decisions.summary.byCohort, { P1B: 3, P1C: 13, P1D: 3 });
assert.ok(decisions.decisions.slice(16).every((entry) => entry.reviewWave === 'P1D'));
assert.equal(decisions.policy.productionWritesAuthorized, false);
assert.equal(decisions.policy.ledgerWritesAuthorized, false);
assert.equal(decisions.policy.deployAuthorized, false);
assert.equal(decisions.policy.arkInvoked, false);

const decisionsArtifact = artifact(decisions, '/tmp/p1d-owner-decisions.json');
const reviewedQueue = buildReviewedQianchuanProductionMigrationReviewQueue({
  decisions,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  manifest,
  sourceArtifact: manifestArtifact,
});
assert.equal(reviewedQueue.summary.resolvedEntries, 19);
assert.equal(reviewedQueue.summary.queuedEntries, 6);
const reviewedP1 = buildReviewedQianchuanProductionMigrationP1Packet({
  decisions,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  manifest,
  sourceArtifact: manifestArtifact,
});
assert.equal(reviewedP1.summary.sourceEntries, 23);
assert.equal(reviewedP1.summary.resolvedEntries, 18);
assert.equal(reviewedP1.summary.queuedEntries, 5);
assert.equal(reviewedP1.summary.decisionsOutsideCurrentP1, 1);
assert.deepEqual(reviewedP1.summary.byWave, { P1A: 0, P1B: 0, P1C: 0, P1D: 5 });
assert.deepEqual(
  reviewedP1.entries.map((entry) => `${entry.namespace}/${entry.version}`).sort(),
  QIANCHUAN_P1D_UNRESOLVED_EVIDENCE.map((entry) => entry.identity).sort(),
);

const ownerReviewProbe = {
  ...readonlyProbe,
  generatedAt: '2026-07-25T04:04:28.329Z',
  entryEvidence: readonlyProbe.entryEvidence.map((entry) => (
    entry.family === 'card_ratio_enforcement'
      ? { ...entry, evidenceState: 'card_ratio_postcondition_requires_owner_review' }
      : entry
  )),
  catalog: {
    routines: [
      {
        present: true,
        signature: 'ads.fn_recompute_douyin_trade_sale_card_ratio_fields()',
      },
      {
        present: true,
        signature: 'ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()',
      },
    ],
    triggers: [
      {
        enabled: 'O',
        identity: 'ads.douyin_trade_sale_card.trg_recompute_douyin_trade_sale_card_ratio_fields',
        present: true,
      },
      {
        enabled: 'O',
        identity: 'ads.douyin_trade_sale_card_detail.trg_recompute_douyin_trade_sale_card_detail_ratio_fields',
        present: true,
      },
    ],
  },
  dataShapes: {
    cardRatio: {
      card: { mismatchRows: '0', rows: '4654' },
      cardDetail: { mismatchRows: '0', rows: '6188' },
    },
  },
};
const ownerReviewProbeArtifact = artifact(
  ownerReviewProbe,
  '/tmp/p1d-owner-forward-repair-probe.json',
);
const forwardPlanArtifact = artifact({ fixture: 'forward-plan' }, '/tmp/card-ratio-plan.json');
const stage1Artifact = artifact({ fixture: 'stage1' }, '/tmp/card-ratio-stage1.json');
const previousCheckpointArtifact = artifact(
  { fixture: 'previous-checkpoint' },
  '/tmp/card-ratio-stage2-previous.json',
);
const stage2Checkpoint = {
  schemaVersion: 3,
  generatedAt: '2026-07-25T03:47:57.250Z',
  mode: 'live_write_card_ratio_stage2_batch',
  status: 'completed',
  target: {
    identity: 'warehouse/20260609_2045',
    checksum: '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290',
    source: {
      bytes: 12662,
      path: 'etl/groland_postgres/sql/migrations/20260609_2045__recompute_douyin_trade_sale_card_ratio_fields.sql',
      sha256: '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290',
    },
  },
  sourceArtifacts: {
    plan: forwardPlanArtifact,
    stage1: stage1Artifact,
    previousCheckpoint: previousCheckpointArtifact,
  },
  policy: {
    transaction: 'one repeatable-read ordered cursor batch',
    productionWritesAuthorized: true,
    repairExecutionAuthorized: true,
    singleBatchOnly: true,
    maxRowsPerTransaction: 500,
    skipLocked: false,
    historicalMigrationReplayed: false,
    ledgerWritten: false,
    deployAuthorized: false,
    arkInvoked: false,
  },
  stage1: {
    backupRunId: 'qcr-20260725T034700Z-deadbeef',
    artifactSha256: stage1Artifact.sha256,
  },
  backupRunId: 'qcr-20260725T034700Z-deadbeef',
  batchNumber: 3,
  batchSize: 1,
  table: 'ads.douyin_trade_sale_card_detail',
  previousCursor: null,
  nextTable: null,
  nextCursor: null,
  updatedRows: 1,
  cumulativeUpdatedRows: 1,
  externallyRepairedRows: 0,
  externallyRepairedRowsByTable: {
    'ads.douyin_trade_sale_card': 0,
    'ads.douyin_trade_sale_card_detail': 0,
  },
  cumulativeExternallyRepairedRows: 0,
  cumulativeExternallyRepairedRowsByTable: {
    'ads.douyin_trade_sale_card': 0,
    'ads.douyin_trade_sale_card_detail': 0,
  },
  sourceRows: 10842,
  sourceRowsByTable: {
    'ads.douyin_trade_sale_card': 4654,
    'ads.douyin_trade_sale_card_detail': 6188,
  },
  sourceGrowthRows: 0,
  sourceGrowthRowsByTable: {
    'ads.douyin_trade_sale_card': 0,
    'ads.douyin_trade_sale_card_detail': 0,
  },
  cumulativeSourceGrowthRows: 0,
  cumulativeSourceGrowthRowsByTable: {
    'ads.douyin_trade_sale_card': 0,
    'ads.douyin_trade_sale_card_detail': 0,
  },
  odsMismatchRows: 9994,
  odsMismatchDelta: 0,
  cumulativeOdsMismatchDelta: 0,
  remainingTableMismatchRows: 0,
  remainingTotalMismatchRows: 0,
  remainingMismatchRowsByTable: {
    'ads.douyin_trade_sale_card': 0,
    'ads.douyin_trade_sale_card_detail': 0,
  },
  guards: { functionsPresent: 2, enabledTriggersPresent: 2 },
  preflight: {
    generatedAt: '2026-07-25T03:47:00.000Z',
    adsMismatchRows: 1,
    mismatchRowsByTable: {
      'ads.douyin_trade_sale_card': 0,
      'ads.douyin_trade_sale_card_detail': 1,
    },
    odsMismatchRows: 9994,
    odsMismatchDelta: 0,
    sourceRowsByTable: {
      'ads.douyin_trade_sale_card': 4654,
      'ads.douyin_trade_sale_card_detail': 6188,
    },
    sourceGrowthRows: 0,
    sourceGrowthRowsByTable: {
      'ads.douyin_trade_sale_card': 0,
      'ads.douyin_trade_sale_card_detail': 0,
    },
    waitingLocks: 0,
  },
  postcheck: {
    generatedAt: '2026-07-25T03:47:57.000Z',
    adsMismatchRows: 0,
    mismatchRowsByTable: {
      'ads.douyin_trade_sale_card': 0,
      'ads.douyin_trade_sale_card_detail': 0,
    },
    odsMismatchRows: 9994,
    odsMismatchDelta: 0,
    sourceRowsByTable: {
      'ads.douyin_trade_sale_card': 4654,
      'ads.douyin_trade_sale_card_detail': 6188,
    },
    sourceGrowthRows: 0,
    sourceGrowthRowsByTable: {
      'ads.douyin_trade_sale_card': 0,
      'ads.douyin_trade_sale_card_detail': 0,
    },
    waitingLocks: 0,
  },
};
const stage2CheckpointArtifact = artifact(
  stage2Checkpoint,
  '/tmp/card-ratio-stage2-completed.json',
);
const postcheckProbe = {
  schemaVersion: 1,
  generatedAt: '2026-07-25T03:48:50.690Z',
  mode: 'live_readonly_card_ratio_repair_readiness_probe',
  target: clone(stage2Checkpoint.target),
  sourceArtifacts: {
    p1: artifact({ fixture: 'reviewed-p1' }, '/tmp/card-ratio-reviewed-p1.json'),
    p1dProbe: readonlyProbeArtifact,
  },
  policy: {
    transaction: 'BEGIN READ ONLY / ROLLBACK',
    statementTimeoutMs: 15000,
    networkAccess: true,
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    repairExecutionAuthorized: false,
    backupCreated: false,
    ownerDecisionRecorded: false,
    deployAuthorized: false,
    arkInvoked: false,
  },
  summary: {
    relationsPresent: 4,
    exactPrimaryKeys: 2,
    refreshRoutinesPresent: 3,
    recomputeFunctionsPresent: 2,
    ratioTriggersPresent: 2,
    adsMismatchRows: 0,
    odsMismatchRows: 9994,
    waitingLocks: 0,
    repairPlanReady: false,
  },
  catalog: {},
  impact: [
    { table_name: 'ads.douyin_trade_sale_card', rows: '4654', mismatch_rows: '0' },
    { table_name: 'ads.douyin_trade_sale_card_detail', rows: '6188', mismatch_rows: '0' },
    { table_name: 'ods.douyin_trade_sale_card_raw', rows: '4654', mismatch_rows: '4653' },
    { table_name: 'ods.douyin_trade_sale_card_detail_raw', rows: '6188', mismatch_rows: '5341' },
  ],
  parity: [
    {
      shape: 'detail',
      source_rows: '6188',
      target_rows: '6188',
      missing_target_rows: '0',
      extra_target_rows: '0',
      base_metric_mismatch_rows: '0',
    },
    {
      shape: 'main',
      source_rows: '4654',
      target_rows: '4654',
      missing_target_rows: '0',
      extra_target_rows: '0',
      base_metric_mismatch_rows: '0',
    },
  ],
};
const postcheckProbeArtifact = artifact(postcheckProbe, '/tmp/card-ratio-postcheck.json');
const forwardDecisionInput = {
  confirmed: true,
  generatedAt: '2026-07-25T04:11:00.000Z',
  ownerReviewProbe,
  ownerReviewProbeArtifact,
  ownerReviewProbeSha256: ownerReviewProbeArtifact.sha256,
  postcheckProbe,
  postcheckProbeArtifact,
  postcheckProbeSha256: postcheckProbeArtifact.sha256,
  priorDecisions: decisions,
  priorDecisionsArtifact: decisionsArtifact,
  priorDecisionsSha256: decisionsArtifact.sha256,
  reviewedAt: '2026-07-25T04:10:00.000Z',
  reviewer: 'repository-owner',
  stage2Checkpoint,
  stage2CheckpointArtifact,
  stage2CheckpointSha256: stage2CheckpointArtifact.sha256,
};
const forwardDecisions = buildQianchuanProductionMigrationP1dForwardRepairDecisions(
  forwardDecisionInput,
);
assert.equal(validateQianchuanProductionMigrationP1dForwardRepairDecisions(forwardDecisions, {
  manifest,
  manifestArtifact,
  ownerReviewProbe,
  postcheckProbe,
  priorDecisions: decisions,
  stage2Checkpoint,
}), forwardDecisions);
assert.equal(validateQianchuanProductionMigrationOwnerDecisionArtifact(forwardDecisions, {
  manifest,
  manifestArtifact,
}), forwardDecisions);
assert.equal(forwardDecisions.summary.decisions, 20);
assert.equal(forwardDecisions.summary.unresolvedP1dEntries, 4);
assert.deepEqual(forwardDecisions.summary.decisionsByType, {
  not_applicable: 19,
  verified_forward_repaired: 1,
});
assert.equal(forwardDecisions.decisions.at(-1).historicalExecution, false);
assert.equal(forwardDecisions.decisions.at(-1).ledgerAction, 'do_not_record');

const forwardDecisionsArtifact = artifact(
  forwardDecisions,
  '/tmp/p1d-forward-repair-decisions.json',
);
const forwardReviewedQueue = buildReviewedQianchuanProductionMigrationReviewQueue({
  decisions: forwardDecisions,
  decisionsArtifact: forwardDecisionsArtifact,
  decisionsSha256: forwardDecisionsArtifact.sha256,
  manifest,
  sourceArtifact: manifestArtifact,
});
assert.equal(forwardReviewedQueue.summary.resolvedEntries, 20);
assert.equal(forwardReviewedQueue.summary.queuedEntries, 5);
assert.equal(forwardReviewedQueue.summary.reviewedNotApplicableEntries, 19);
assert.equal(forwardReviewedQueue.summary.reviewedForwardRepairedEntries, 1);
assert.deepEqual(forwardReviewedQueue.summary.byReviewDecision, {
  not_applicable: 19,
  verified_forward_repaired: 1,
});
const forwardReviewedP1 = buildReviewedQianchuanProductionMigrationP1Packet({
  decisions: forwardDecisions,
  decisionsArtifact: forwardDecisionsArtifact,
  decisionsSha256: forwardDecisionsArtifact.sha256,
  manifest,
  sourceArtifact: manifestArtifact,
});
assert.equal(forwardReviewedP1.summary.resolvedEntries, 19);
assert.equal(forwardReviewedP1.summary.queuedEntries, 4);
assert.equal(forwardReviewedP1.summary.reviewedForwardRepairedEntries, 1);
assert.deepEqual(forwardReviewedP1.summary.byWave, { P1A: 0, P1B: 0, P1C: 0, P1D: 4 });
assert.equal(
  forwardReviewedP1.reviewedEntries.find((entry) => entry.version === '20260609_2045')
    ?.review.historicalExecution,
  false,
);

const alimamaFixture = await buildReadyAlimamaRuntimeRetirementFixture();
const alimamaDecisionInput = {
  confirmed: true,
  generatedAt: '2026-07-25T10:01:00.000Z',
  plan: alimamaFixture.plan,
  planArtifact: alimamaFixture.planArtifact,
  planSha256: alimamaFixture.planArtifact.sha256,
  priorDecisions: forwardDecisions,
  priorDecisionsArtifact: forwardDecisionsArtifact,
  priorDecisionsSha256: forwardDecisionsArtifact.sha256,
  probe: alimamaFixture.probe,
  probeArtifact: alimamaFixture.probeArtifact,
  probeSha256: alimamaFixture.probeArtifact.sha256,
  reviewedAt: '2026-07-25T10:00:00.000Z',
  reviewer: 'repository-owner',
};
const alimamaDecisions = buildQianchuanAlimamaRuntimeRetirementDecisions(
  alimamaDecisionInput,
);
assert.equal(validateQianchuanAlimamaRuntimeRetirementDecisions(alimamaDecisions, {
  manifest,
  manifestArtifact,
  plan: alimamaFixture.plan,
  priorDecisions: forwardDecisions,
  probe: alimamaFixture.probe,
}), alimamaDecisions);
assert.equal(validateQianchuanProductionMigrationOwnerDecisionArtifact(alimamaDecisions, {
  manifest,
  manifestArtifact,
}), alimamaDecisions);
assert.equal(alimamaDecisions.schemaVersion, 4);
assert.equal(alimamaDecisions.summary.decisions, 21);
assert.equal(alimamaDecisions.summary.unresolvedP1dEntries, 3);
assert.equal(alimamaDecisions.decisions.at(-1).decision, 'not_applicable');
assert.equal(alimamaDecisions.decisions.at(-1).historicalExecution, false);
const alimamaDecisionsArtifact = artifact(alimamaDecisions, '/tmp/alimama-decisions.json');
const alimamaReviewedP1 = buildReviewedQianchuanProductionMigrationP1Packet({
  decisions: alimamaDecisions,
  decisionsArtifact: alimamaDecisionsArtifact,
  decisionsSha256: alimamaDecisionsArtifact.sha256,
  manifest,
  sourceArtifact: manifestArtifact,
});
assert.equal(alimamaReviewedP1.summary.resolvedEntries, 20);
assert.equal(alimamaReviewedP1.summary.queuedEntries, 3);
assert.deepEqual(alimamaReviewedP1.summary.byWave, { P1A: 0, P1B: 0, P1C: 0, P1D: 3 });
assert.throws(() => buildQianchuanAlimamaRuntimeRetirementDecisions({
  ...alimamaDecisionInput,
  confirmed: false,
}), /explicit confirmation flag/);
assert.throws(() => buildQianchuanAlimamaRuntimeRetirementDecisions({
  ...alimamaDecisionInput,
  planSha256: '0'.repeat(64),
}), /Alimama retirement plan SHA-256 differs from the explicit pin/);
assert.throws(() => validateQianchuanAlimamaRuntimeRetirementDecisions({
  ...alimamaDecisions,
  decisions: alimamaDecisions.decisions.map((entry, index) => (
    index === alimamaDecisions.decisions.length - 1
      ? { ...entry, historicalExecution: true }
      : entry
  )),
}), /owner decision is invalid/);
assert.deepEqual(parseQianchuanAlimamaRuntimeRetirementDecisionArgs([
  '--prior-decisions', '/tmp/prior.json', `--prior-decisions-sha256=${'a'.repeat(64)}`,
  '--probe', '/tmp/probe.json', `--probe-sha256=${'b'.repeat(64)}`,
  '--plan', '/tmp/plan.json', `--plan-sha256=${'c'.repeat(64)}`,
  '--reviewer', 'repository-owner', '--reviewed-at', '2026-07-25T10:00:00.000Z',
  '--output', '/tmp/decisions.json', '--confirm-alimama-runtime-retirement-decision',
]), {
  confirmed: true, help: false, json: false, outputPath: '/tmp/decisions.json',
  planPath: '/tmp/plan.json', planSha256: 'c'.repeat(64),
  priorDecisionsPath: '/tmp/prior.json', priorDecisionsSha256: 'a'.repeat(64),
  probePath: '/tmp/probe.json', probeSha256: 'b'.repeat(64),
  reviewedAt: '2026-07-25T10:00:00.000Z', reviewer: 'repository-owner',
});

await assertInfluencerTagForwardRepairDecisionBehavior({
  manifest,
  manifestArtifact,
  priorDecisions: alimamaDecisions,
  priorDecisionsArtifact: alimamaDecisionsArtifact,
});

assert.throws(
  () => buildQianchuanProductionMigrationP1dForwardRepairDecisions({
    ...forwardDecisionInput,
    confirmed: false,
  }),
  /explicit confirmation flag/,
);
assert.throws(
  () => buildQianchuanProductionMigrationP1dForwardRepairDecisions({
    ...forwardDecisionInput,
    stage2CheckpointSha256: '0'.repeat(64),
  }),
  /Completed Stage 2 checkpoint SHA-256 differs from the explicit pin/,
);
assert.throws(
  () => validateQianchuanProductionMigrationP1dForwardRepairDecisions({
    ...forwardDecisions,
    generatedAt: '2026-07-25T04:09:59.999Z',
  }),
  /forward-repair owner decision is invalid/,
);
assert.throws(
  () => validateQianchuanProductionMigrationP1dForwardRepairDecisions({
    ...forwardDecisions,
    decisions: forwardDecisions.decisions.map((entry, index) => (
      index === forwardDecisions.decisions.length - 1
        ? { ...entry, historicalExecution: true }
        : entry
    )),
  }),
  /forward-repair owner decision is invalid/,
);
assert.throws(
  () => buildQianchuanProductionMigrationP1dForwardRepairDecisions({
    confirmed: true,
    generatedAt: '2026-07-25T04:11:00.000Z',
    ownerReviewProbe,
    ownerReviewProbeArtifact,
    ownerReviewProbeSha256: ownerReviewProbeArtifact.sha256,
    postcheckProbe: {
      ...postcheckProbe,
      summary: { ...postcheckProbe.summary, adsMismatchRows: 1 },
    },
    postcheckProbeArtifact,
    postcheckProbeSha256: postcheckProbeArtifact.sha256,
    priorDecisions: decisions,
    priorDecisionsArtifact: decisionsArtifact,
    priorDecisionsSha256: decisionsArtifact.sha256,
    reviewedAt: '2026-07-25T04:10:00.000Z',
    reviewer: 'repository-owner',
    stage2Checkpoint,
    stage2CheckpointArtifact,
    stage2CheckpointSha256: stage2CheckpointArtifact.sha256,
  }),
  /post-repair evidence is incomplete/,
);

assert.deepEqual(
  parseQianchuanProductionMigrationP1dForwardRepairDecisionArgs([
    '--prior-decisions', '/tmp/p1d-decisions.json',
    `--prior-decisions-sha256=${'a'.repeat(64)}`,
    '--owner-review-probe', '/tmp/p1d-owner-review.json',
    `--owner-review-probe-sha256=${'b'.repeat(64)}`,
    '--stage2-checkpoint', '/tmp/stage2.json',
    `--stage2-checkpoint-sha256=${'c'.repeat(64)}`,
    '--postcheck-probe', '/tmp/postcheck.json',
    `--postcheck-probe-sha256=${'d'.repeat(64)}`,
    '--reviewer', 'repository-owner',
    '--reviewed-at', '2026-07-25T04:10:00.000Z',
    '--output', '/tmp/forward-decisions.json',
    '--confirm-card-ratio-forward-repair-decision',
    '--json',
  ]),
  {
    confirmed: true,
    help: false,
    json: true,
    outputPath: '/tmp/forward-decisions.json',
    ownerReviewProbePath: '/tmp/p1d-owner-review.json',
    ownerReviewProbeSha256: 'b'.repeat(64),
    postcheckProbePath: '/tmp/postcheck.json',
    postcheckProbeSha256: 'd'.repeat(64),
    priorDecisionsPath: '/tmp/p1d-decisions.json',
    priorDecisionsSha256: 'a'.repeat(64),
    reviewedAt: '2026-07-25T04:10:00.000Z',
    reviewer: 'repository-owner',
    stage2CheckpointPath: '/tmp/stage2.json',
    stage2CheckpointSha256: 'c'.repeat(64),
  },
);
assert.throws(
  () => parseQianchuanProductionMigrationP1dForwardRepairDecisionArgs([
    '--prior-decisions', '/tmp/p1d-decisions.json',
  ]),
  /--output is required/,
);
for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger', '--repair']) {
  assert.throws(
    () => parseQianchuanProductionMigrationP1dForwardRepairDecisionArgs([option]),
    /Unknown qianchuan P1D forward-repair decision option/,
  );
}

assert.throws(
  () => buildQianchuanProductionMigrationP1dReviewDecisions({
    lineage,
    lineageArtifact,
    lineageSha256: lineageArtifact.sha256,
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    priorDecisions,
    priorDecisionsArtifact,
    priorDecisionsSha256: priorDecisionsArtifact.sha256,
    readonlyProbe: {
      ...readonlyProbe,
      entryEvidence: readonlyProbe.entryEvidence.map((entry) => (
        entry.family === 'card_ratio_enforcement'
          ? { ...entry, evidenceState: 'replacement_catalog_and_multigrain_data_observed' }
          : entry
      )),
    },
    readonlyProbeArtifact,
    readonlyProbeSha256: readonlyProbeArtifact.sha256,
    reviewedAt: '2026-07-24T15:31:00.000Z',
    reviewer: 'repository-owner',
  }),
  /warehouse\/20260609_2045 differs from the exact P1D split-review evidence/,
);
assert.throws(
  () => validateQianchuanProductionMigrationP1dReviewDecisions({
    ...decisions,
    decisions: [...decisions.decisions, {
      ...decisions.decisions.at(-1),
      version: '20260609_2045',
    }],
  }),
  /summary is inconsistent/,
);
for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger', '--refresh']) {
  assert.throws(
    () => parseQianchuanProductionMigrationP1dReviewDecisionArgs([option]),
    /Unknown qianchuan migration P1D review decision option/,
  );
}
assert.throws(
  () => parseQianchuanProductionMigrationP1dReviewDecisionArgs([]),
  /--lineage is required/,
);

console.log('[qianchuan-production-migration-p1d-review-decisions-behavior] OK: immutable replacement decisions, explicit card-ratio schema-v3, Alimama schema-v4 and influencer-tag schema-v5 decisions, 22-decision overlay, P1D 5->4->3->2, historical-execution denial, evidence pinning, and write denial passed.');
