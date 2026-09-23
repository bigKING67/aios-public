import {
  assertPinnedMigrationReviewArtifact,
  QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS,
} from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS,
  validateQianchuanProductionMigrationP1cReviewDecisions,
} from './aios-qianchuan-production-migration-p1c-review-decisions.mjs';
import {
  validateQianchuanProductionMigrationP1dLineagePacket,
} from './aios-qianchuan-production-migration-p1d-lineage.mjs';
import {
  validateQianchuanProductionMigrationP1dReadonlyProbe,
} from './aios-qianchuan-production-migration-p1d-readonly-probe.mjs';
import {
  validateQianchuanProductionMigrationManifest,
} from './aios-qianchuan-production-migration-review-queue.mjs';

const REVIEWER = 'repository-owner';
const REVIEW_DATE = '2026-07-24';
const AUTHORIZATION_EVIDENCE = 'current_user_authorized_exact_three_entry_p1d_replacement_owner_review';

function decision(checksum, version, lineageFamily, evidenceState, rationale) {
  return Object.freeze({
    checksum,
    evidenceState,
    lineageFamily,
    namespace: 'warehouse',
    rationale,
    version,
  });
}

export const QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS = Object.freeze([
  decision(
    '6635348bb216c6c7cc3fec9124d2f562eaa38095f6b016910c02c00bc52d1444',
    '20260302_1810',
    'report_channel_localization_rename',
    'replacement_catalog_and_localized_data_observed',
    'The pinned P1D lineage and read-only production probe prove the current localized report relation, refresh routine, constraint, and valid channel data shape are present; this does not claim the historical migration executed.',
  ),
  decision(
    'c0265899e10b9de9e83309aa5d0baf9d9b025a4df3447412df7f074f5ef7cd50',
    '20260331_1530',
    'creator_live_refund_rename',
    'replacement_catalog_and_refund_data_observed',
    'The pinned P1D lineage and read-only production probe prove the current influencer-live refund column, constraint, refresh routine, and non-empty refund data shape are present; this does not claim the historical migration executed.',
  ),
  decision(
    '3bf2391a3f909e8f6d2bdaed0a623c1836318ab1933782a9d41a6445b8cc5faa',
    '20260424_1730',
    'shortvideo_detail_rebuild',
    'replacement_catalog_and_multigrain_data_observed',
    'The pinned P1D lineage and read-only production probe prove the current short-video detail topology and trade/qianchuan multi-grain data shape are present; this does not claim the historical migration executed.',
  ),
]);

export const QIANCHUAN_P1D_UNRESOLVED_EVIDENCE = Object.freeze([
  Object.freeze({
    evidenceState: 'source_data_present_without_old_or_replacement_runtime',
    family: 'alimama_incremental_rename',
    identity: 'warehouse/20260212_1600',
  }),
  Object.freeze({
    evidenceState: 'missing_runtime_contract_with_data_drift',
    family: 'influencer_tag_normalization',
    identity: 'warehouse/20260510_1800',
  }),
  Object.freeze({
    evidenceState: 'missing_runtime_contract_on_dormant_data_path',
    family: 'qianchuan_parse_helpers',
    identity: 'warehouse/20260525_1730',
  }),
  Object.freeze({
    evidenceState: 'missing_runtime_contract_with_data_drift',
    family: 'card_ratio_enforcement',
    identity: 'warehouse/20260609_2045',
  }),
  Object.freeze({
    evidenceState: 'clean_current_data_without_exact_unique_guard',
    family: 'platform_video_identity_dedupe',
    identity: 'warehouse/20260617_1900',
  }),
]);

function identity(value) {
  return `${value.namespace}/${value.version}`;
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp with milliseconds.`);
  }
}

function artifactLink(kind, artifact) {
  return { bytes: artifact.bytes, kind, path: artifact.path, sha256: artifact.sha256 };
}

function assertSameArtifact(actual, expected, label) {
  if (actual?.path !== expected?.path
    || actual?.bytes !== expected?.bytes
    || actual?.sha256 !== expected?.sha256) {
    throw new Error(`${label} differs from the pinned source artifact.`);
  }
}

function assertArtifactLinks(links, kinds, label) {
  if (!Array.isArray(links) || links.length !== kinds.length) {
    throw new Error(`${label} evidence links are invalid.`);
  }
  for (const [index, kind] of kinds.entries()) {
    if (links[index]?.kind !== kind) throw new Error(`${label} evidence links are invalid.`);
    assertPinnedMigrationReviewArtifact(links[index], links[index].sha256, `${label} ${kind}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectedP1dEvidence() {
  return [
    ...QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS.map((entry) => ({
      evidenceState: entry.evidenceState,
      family: entry.lineageFamily,
      identity: identity(entry),
    })),
    ...QIANCHUAN_P1D_UNRESOLVED_EVIDENCE,
  ];
}

function validateP1dEvidence({
  lineage,
  lineageArtifact,
  lineageSha256,
  manifest,
  manifestArtifact,
  manifestSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
  readonlyProbe,
  readonlyProbeArtifact,
  readonlyProbeSha256,
}) {
  validateQianchuanProductionMigrationManifest(manifest);
  validateQianchuanProductionMigrationP1cReviewDecisions(priorDecisions, {
    manifest,
    manifestArtifact,
  });
  validateQianchuanProductionMigrationP1dLineagePacket(lineage);
  validateQianchuanProductionMigrationP1dReadonlyProbe(readonlyProbe);
  assertPinnedMigrationReviewArtifact(manifestArtifact, manifestSha256, 'Reconciliation manifest');
  assertPinnedMigrationReviewArtifact(
    priorDecisionsArtifact,
    priorDecisionsSha256,
    'Prior owner review decisions',
  );
  assertPinnedMigrationReviewArtifact(lineageArtifact, lineageSha256, 'P1D lineage packet');
  assertPinnedMigrationReviewArtifact(
    readonlyProbeArtifact,
    readonlyProbeSha256,
    'P1D read-only production probe',
  );
  assertSameArtifact(lineage.sourceArtifacts?.manifest, manifestArtifact, 'P1D lineage manifest');
  assertSameArtifact(readonlyProbe.sourceArtifact, lineageArtifact, 'P1D probe lineage');

  const manifestByIdentity = new Map(manifest.entries.map((entry) => [identity(entry), entry]));
  const lineageByIdentity = new Map(lineage.entries.map((entry) => [identity(entry), entry]));
  const probeByFamily = new Map(readonlyProbe.entryEvidence.map((entry) => [entry.family, entry]));
  const expected = expectedP1dEvidence();
  if (lineage.entries.length !== expected.length
    || readonlyProbe.entryEvidence.length !== expected.length
    || lineageByIdentity.size !== expected.length
    || probeByFamily.size !== expected.length) {
    throw new Error('P1D evidence no longer contains the exact eight-entry split-review inventory.');
  }
  for (const definition of expected) {
    const lineageEntry = lineageByIdentity.get(definition.identity);
    const manifestEntry = manifestByIdentity.get(definition.identity);
    const probeEntry = probeByFamily.get(definition.family);
    if (!lineageEntry || !manifestEntry || !probeEntry
      || lineageEntry.checksum !== manifestEntry.checksum
      || lineageEntry.lineageFamily !== definition.family
      || lineageEntry.authoritativeClassification !== 'unknown'
      || lineageEntry.currentReviewWaveLabel !== 'P1D'
      || manifestEntry.classification !== 'unknown'
      || lineageEntry.review?.decision !== null
      || lineageEntry.review?.reviewer !== null
      || probeEntry.evidenceState !== definition.evidenceState
      || probeEntry.decision !== null
      || probeEntry.reviewer !== null
      || JSON.stringify(probeEntry.entries) !== JSON.stringify([definition.identity])) {
      throw new Error(`${definition.identity} differs from the exact P1D split-review evidence.`);
    }
  }
  for (const decisionEntry of QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS) {
    if (lineageByIdentity.get(identity(decisionEntry))?.checksum !== decisionEntry.checksum) {
      throw new Error(`${identity(decisionEntry)} checksum differs from the P1D decision allowlist.`);
    }
  }
}

export function buildQianchuanProductionMigrationP1dReviewDecisions({
  generatedAt = new Date().toISOString(),
  lineage,
  lineageArtifact,
  lineageSha256,
  manifest,
  manifestArtifact,
  manifestSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
  readonlyProbe,
  readonlyProbeArtifact,
  readonlyProbeSha256,
  reviewedAt,
  reviewer,
}) {
  validateP1dEvidence({
    lineage,
    lineageArtifact,
    lineageSha256,
    manifest,
    manifestArtifact,
    manifestSha256,
    priorDecisions,
    priorDecisionsArtifact,
    priorDecisionsSha256,
    readonlyProbe,
    readonlyProbeArtifact,
    readonlyProbeSha256,
  });
  assertIsoTimestamp(generatedAt, 'P1D decision artifact generatedAt');
  assertIsoTimestamp(reviewedAt, 'P1D decision reviewedAt');
  if (!reviewedAt.startsWith(`${REVIEW_DATE}T`)) {
    throw new Error(`P1D decision reviewedAt must record the ${REVIEW_DATE} owner authorization.`);
  }
  if (reviewer !== REVIEWER) {
    throw new Error(`P1D decision reviewer must be the neutral identity ${REVIEWER}.`);
  }

  const evidenceLinks = [
    artifactLink('reconciliation_manifest', manifestArtifact),
    artifactLink('prior_owner_review_decisions', priorDecisionsArtifact),
    artifactLink('p1d_lineage_packet', lineageArtifact),
    artifactLink('p1d_live_readonly_probe', readonlyProbeArtifact),
  ];
  const newDecisions = QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS.map((entry) => ({
    checksum: entry.checksum,
    decision: 'not_applicable',
    decisionCohort: 'P1D',
    evidenceLinks: evidenceLinks.map((link) => ({ ...link })),
    ledgerAction: 'do_not_record',
    lineageFamily: entry.lineageFamily,
    namespace: entry.namespace,
    rationale: entry.rationale,
    reviewStatus: 'verified_not_applicable',
    reviewWave: 'P1D',
    reviewedAt,
    reviewer,
    sourceClassification: 'unknown',
    version: entry.version,
  }));
  const decisions = [...clone(priorDecisions.decisions), ...newDecisions];
  return {
    schemaVersion: 2,
    generatedAt,
    mode: 'offline_owner_review_decisions',
    authorization: {
      acceptedOn: REVIEW_DATE,
      evidence: AUTHORIZATION_EVIDENCE,
      newDecisionCohort: 'P1D',
      reviewer,
    },
    sourceArtifacts: {
      lineage: lineageArtifact,
      manifest: manifestArtifact,
      priorDecisions: priorDecisionsArtifact,
      readonlyProbe: readonlyProbeArtifact,
    },
    policy: {
      arkInvoked: false,
      authoritativeClassificationChanged: false,
      authoritativeManifestMutated: false,
      decision: 'not_applicable',
      deployAuthorized: false,
      ledgerWritesAuthorized: false,
      networkAccess: false,
      priorDecisionArtifactMutated: false,
      productionWritesAuthorized: false,
      unresolvedP1dOwnerDecisionsRecorded: false,
    },
    summary: {
      decisions: decisions.length,
      priorDecisions: priorDecisions.decisions.length,
      newDecisions: newDecisions.length,
      unresolvedP1dEntries: QIANCHUAN_P1D_UNRESOLVED_EVIDENCE.length,
      byCohort: {
        P1B: QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length,
        P1C: QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length,
        P1D: newDecisions.length,
      },
      ledgerActions: { do_not_record: decisions.length },
      reviewStatuses: { verified_not_applicable: decisions.length },
    },
    decisions,
  };
}

function validatePreservedPriorRows(rows, sourceManifest) {
  const p1bCount = QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length;
  const p1cCount = QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length;
  if (rows.length !== p1bCount + p1cCount) {
    throw new Error('P1D owner review artifact does not preserve the exact 16 prior decisions.');
  }
  for (const [index, expected] of QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.entries()) {
    const row = rows[index];
    assertIsoTimestamp(row?.reviewedAt, `${identity(expected)} reviewedAt`);
    assertArtifactLinks(
      row?.evidenceLinks,
      ['reconciliation_manifest', 'p1b_live_readonly_probe'],
      identity(expected),
    );
    assertSameArtifact(row.evidenceLinks[0], sourceManifest, `${identity(expected)} manifest link`);
    if (identity(row ?? {}) !== identity(expected) || row.checksum !== expected.checksum
      || row.rationale !== expected.rationale || row.decision !== 'not_applicable'
      || row.reviewStatus !== 'verified_not_applicable' || row.ledgerAction !== 'do_not_record'
      || row.reviewer !== REVIEWER || row.sourceClassification !== 'unknown') {
      throw new Error(`${identity(expected)} prior P1B owner decision was not preserved.`);
    }
  }
  const p1cRows = rows.slice(p1bCount);
  const sharedLinks = p1cRows[0]?.evidenceLinks;
  assertArtifactLinks(
    sharedLinks,
    ['reconciliation_manifest', 'p1c_lineage_packet', 'p1c_live_readonly_catalog_probe'],
    'Prior P1C decisions',
  );
  assertSameArtifact(sharedLinks[0], sourceManifest, 'Prior P1C manifest link');
  for (const [index, expected] of QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.entries()) {
    const row = p1cRows[index];
    assertIsoTimestamp(row?.reviewedAt, `${identity(expected)} reviewedAt`);
    if (identity(row ?? {}) !== identity(expected) || row.checksum !== expected.checksum
      || row.lineageFamily !== expected.lineageFamily || row.rationale !== expected.rationale
      || row.decision !== 'not_applicable' || row.reviewStatus !== 'verified_not_applicable'
      || row.ledgerAction !== 'do_not_record' || row.reviewer !== REVIEWER
      || row.sourceClassification !== 'unknown' || row.decisionCohort !== 'P1C'
      || row.reviewWave !== 'P1C'
      || JSON.stringify(row.evidenceLinks) !== JSON.stringify(sharedLinks)) {
      throw new Error(`${identity(expected)} prior P1C owner decision was not preserved.`);
    }
  }
}

export function validateQianchuanProductionMigrationP1dReviewDecisions(decisions, {
  manifest,
  manifestArtifact,
  priorDecisions,
} = {}) {
  if (decisions?.schemaVersion !== 2 || decisions.mode !== 'offline_owner_review_decisions') {
    throw new Error('P1D owner review decisions must be schemaVersion=2 offline_owner_review_decisions.');
  }
  assertIsoTimestamp(decisions.generatedAt, 'P1D decision artifact generatedAt');
  if (decisions.authorization?.reviewer !== REVIEWER
    || decisions.authorization?.acceptedOn !== REVIEW_DATE
    || decisions.authorization?.evidence !== AUTHORIZATION_EVIDENCE
    || decisions.authorization?.newDecisionCohort !== 'P1D'
    || decisions.policy?.authoritativeManifestMutated !== false
    || decisions.policy?.authoritativeClassificationChanged !== false
    || decisions.policy?.priorDecisionArtifactMutated !== false
    || decisions.policy?.productionWritesAuthorized !== false
    || decisions.policy?.ledgerWritesAuthorized !== false
    || decisions.policy?.deployAuthorized !== false
    || decisions.policy?.networkAccess !== false
    || decisions.policy?.arkInvoked !== false
    || decisions.policy?.unresolvedP1dOwnerDecisionsRecorded !== false
    || decisions.policy?.decision !== 'not_applicable') {
    throw new Error('P1D owner review decision policy or authorization is invalid.');
  }

  const sourceManifest = decisions.sourceArtifacts?.manifest;
  const sourcePriorDecisions = decisions.sourceArtifacts?.priorDecisions;
  const sourceLineage = decisions.sourceArtifacts?.lineage;
  const sourceReadonlyProbe = decisions.sourceArtifacts?.readonlyProbe;
  for (const [label, artifact] of [
    ['Decision source manifest', sourceManifest],
    ['Decision source prior decisions', sourcePriorDecisions],
    ['Decision source P1D lineage', sourceLineage],
    ['Decision source P1D read-only probe', sourceReadonlyProbe],
  ]) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, label);
  }

  const priorCount = QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length
    + QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length;
  const newCount = QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS.length;
  const expectedTotal = priorCount + newCount;
  if (decisions.summary?.decisions !== expectedTotal
    || decisions.summary?.priorDecisions !== priorCount
    || decisions.summary?.newDecisions !== newCount
    || decisions.summary?.unresolvedP1dEntries !== QIANCHUAN_P1D_UNRESOLVED_EVIDENCE.length
    || decisions.summary?.byCohort?.P1B !== QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.byCohort?.P1C !== QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.byCohort?.P1D !== newCount
    || decisions.summary?.ledgerActions?.do_not_record !== expectedTotal
    || decisions.summary?.reviewStatuses?.verified_not_applicable !== expectedTotal
    || !Array.isArray(decisions.decisions)
    || decisions.decisions.length !== expectedTotal) {
    throw new Error('P1D owner review decision summary is inconsistent.');
  }

  const priorRows = decisions.decisions.slice(0, priorCount);
  validatePreservedPriorRows(priorRows, sourceManifest);
  if (priorDecisions) {
    validateQianchuanProductionMigrationP1cReviewDecisions(priorDecisions, {
      manifest,
      manifestArtifact,
    });
    if (JSON.stringify(priorRows) !== JSON.stringify(priorDecisions.decisions)) {
      throw new Error('P1D owner review artifact mutated prior owner decisions.');
    }
  }

  const expectedLinks = [
    artifactLink('reconciliation_manifest', sourceManifest),
    artifactLink('prior_owner_review_decisions', sourcePriorDecisions),
    artifactLink('p1d_lineage_packet', sourceLineage),
    artifactLink('p1d_live_readonly_probe', sourceReadonlyProbe),
  ];
  const newRows = decisions.decisions.slice(priorCount);
  for (const [index, expected] of QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS.entries()) {
    const row = newRows[index];
    assertIsoTimestamp(row?.reviewedAt, `${identity(expected)} reviewedAt`);
    if (identity(row ?? {}) !== identity(expected) || row.checksum !== expected.checksum
      || row.lineageFamily !== expected.lineageFamily || row.rationale !== expected.rationale
      || row.decision !== 'not_applicable' || row.reviewStatus !== 'verified_not_applicable'
      || row.ledgerAction !== 'do_not_record' || row.reviewer !== REVIEWER
      || row.sourceClassification !== 'unknown' || row.decisionCohort !== 'P1D'
      || row.reviewWave !== 'P1D' || !row.reviewedAt.startsWith(`${REVIEW_DATE}T`)
      || JSON.stringify(row.evidenceLinks) !== JSON.stringify(expectedLinks)) {
      throw new Error(`${identity(expected)} P1D owner review decision is invalid.`);
    }
  }

  if (manifest) {
    validateQianchuanProductionMigrationManifest(manifest);
    const manifestByIdentity = new Map(manifest.entries.map((entry) => [identity(entry), entry]));
    for (const expected of QIANCHUAN_P1D_NOT_APPLICABLE_DECISIONS) {
      const entry = manifestByIdentity.get(identity(expected));
      if (!entry || entry.checksum !== expected.checksum || entry.classification !== 'unknown') {
        throw new Error(`${identity(expected)} no longer matches the P1D owner decision manifest.`);
      }
    }
  }
  if (manifestArtifact) assertSameArtifact(sourceManifest, manifestArtifact, 'P1D owner decision manifest');
  return decisions;
}
