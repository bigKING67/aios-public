import {
  assertPinnedMigrationReviewArtifact,
  QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS,
  validateQianchuanProductionMigrationReviewDecisions,
} from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  validateQianchuanProductionMigrationP1cCatalogProbe,
} from './aios-qianchuan-production-migration-p1c-catalog-probe.mjs';
import {
  validateQianchuanProductionMigrationP1cLineagePacket,
} from './aios-qianchuan-production-migration-p1c-lineage.mjs';
import {
  validateQianchuanProductionMigrationManifest,
} from './aios-qianchuan-production-migration-review-queue.mjs';

const REVIEWER = 'repository-owner';
const REVIEW_DATE = '2026-07-24';
const AUTHORIZATION_EVIDENCE = 'current_user_authorized_exact_p1c_cohort_after_pinned_lineage_and_catalog_proof';

const FAMILY_RATIONALES = Object.freeze({
  creator_live_rename: 'The pinned lineage and read-only catalog probe prove the legacy creator-live topology is absent and the mapped influencer-live replacement relations, routines, indexes, columns, and row counts are present.',
  dynamic_report_rename: 'The pinned lineage and read-only catalog probe prove the legacy report topology is absent and the exact mapped report replacement relations, refresh state, routines, indexes, columns, and row counts are present.',
  live_dashboard_replacement: 'The pinned lineage and read-only catalog probe prove the legacy live-dashboard topology is absent and the mapped live-detail and self-anchor replacement relations, routines, indexes, columns, and row counts are present.',
  shortvideo_detail_evolution: 'The pinned lineage and read-only catalog probe prove the legacy short-video detail topology is absent and the mapped current relation, routines, indexes, columns, and row counts are present.',
});

function decision(checksum, version, lineageFamily) {
  return Object.freeze({
    checksum,
    lineageFamily,
    namespace: 'warehouse',
    rationale: FAMILY_RATIONALES[lineageFamily],
    version,
  });
}

export const QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS = Object.freeze([
  decision('aa0cae472f0ae7dd50c117d1820082db78221f8e525418a40d3b2c1084bcfa93', '20260228_1500', 'dynamic_report_rename'),
  decision('2323607fef6bbc6993f2fcca28d81a735d57653adaaca3d4a3394e12f2d6df4e', '20260228_1830', 'dynamic_report_rename'),
  decision('2e1f93cf262ddd5f1d554080bf98fd32c98a9ffee486e4f1c0da448df5cb992b', '20260302_1700', 'dynamic_report_rename'),
  decision('33016577afc08ea6485488ae2fd1db641024ebd750c47596d49c1f73b7a9d110', '20260302_1900', 'dynamic_report_rename'),
  decision('6e69ef42f2a55a3ece69785c13d0bbf2408ff3a8d3b0c1ee4bc44b5c9984d4f0', '20260303_1600', 'dynamic_report_rename'),
  decision('50166faea40dc92c5c2cfe52762a6211f447b88a17123ac4589497e5c14fc038', '20260303_1900', 'dynamic_report_rename'),
  decision('8d56e81bd77024a873bc8cf97827095023d97837cdb9e00a4f9cd6d03fa02680', '20260305_1400', 'dynamic_report_rename'),
  decision('96dd52dff08a53a54f688d0e061dc00bec2b14107c74f74fbf6812b69e3d1f90', '20260305_1410', 'dynamic_report_rename'),
  decision('c1baa07f596a518dae78c28d6250914815de62b295516eedd509eb9a08a019ae', '20260305_1420', 'dynamic_report_rename'),
  decision('8e2e4a6a441eec1fa8f8767b439e4e44c60a8150706170d535633dfc57c02f16', '20260331_1130', 'creator_live_rename'),
  decision('1b88c63bbab36a7161d9dc6abb3bd2c819bdea289249d934a40f22dfac68b1a9', '20260331_2010', 'creator_live_rename'),
  decision('ab0c295f4c004aefa8b5c6bf1716b853ac399f7027f697aa8a5f29806e90c9cd', '20260422_1510', 'live_dashboard_replacement'),
  decision('49403a3349126a4cfe21fadc87a0b0cf0d0ad3c691e69f32931808bf64ea3bc3', '20260424_1100', 'shortvideo_detail_evolution'),
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateP1cEvidence({
  catalogProbe,
  catalogProbeArtifact,
  catalogProbeSha256,
  lineage,
  lineageArtifact,
  lineageSha256,
  manifest,
  manifestArtifact,
  manifestSha256,
  priorDecisions,
  priorDecisionsArtifact,
  priorDecisionsSha256,
}) {
  validateQianchuanProductionMigrationManifest(manifest);
  validateQianchuanProductionMigrationReviewDecisions(priorDecisions, {
    manifest,
    manifestArtifact,
  });
  validateQianchuanProductionMigrationP1cLineagePacket(lineage);
  validateQianchuanProductionMigrationP1cCatalogProbe(catalogProbe);
  assertPinnedMigrationReviewArtifact(manifestArtifact, manifestSha256, 'Reconciliation manifest');
  assertPinnedMigrationReviewArtifact(
    priorDecisionsArtifact,
    priorDecisionsSha256,
    'Prior owner review decisions',
  );
  assertPinnedMigrationReviewArtifact(lineageArtifact, lineageSha256, 'P1C lineage packet');
  assertPinnedMigrationReviewArtifact(
    catalogProbeArtifact,
    catalogProbeSha256,
    'P1C catalog probe',
  );
  assertSameArtifact(lineage.sourceArtifacts?.manifest, manifestArtifact, 'P1C lineage manifest');
  assertSameArtifact(catalogProbe.sourceArtifact, lineageArtifact, 'P1C catalog probe lineage');

  const lineageEntries = lineage.entries.filter((entry) => entry.currentReviewWaveLabel === 'P1C');
  const lineageByIdentity = new Map(lineageEntries.map((entry) => [identity(entry), entry]));
  const manifestByIdentity = new Map(manifest.entries.map((entry) => [identity(entry), entry]));
  if (lineage.summary?.entries !== 17
    || lineage.summary?.staticDependencySupersessionEntries !== 4
    || lineageEntries.length !== QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length
    || lineage.summary?.remainingP1cEntries !== QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length) {
    throw new Error('P1C lineage no longer contains the 17-entry lineage and exact 13-entry owner-review cohort.');
  }
  for (const expected of QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS) {
    const entry = lineageByIdentity.get(identity(expected));
    const manifestEntry = manifestByIdentity.get(identity(expected));
    if (!entry || !manifestEntry || entry.checksum !== expected.checksum
      || manifestEntry.checksum !== expected.checksum
      || entry.lineageFamily !== expected.lineageFamily
      || entry.authoritativeClassification !== 'unknown'
      || manifestEntry.classification !== 'unknown'
      || entry.schemaEvidenceState !== 'schema_effects_partial'
      || entry.review?.decision !== null
      || entry.review?.reviewer !== null) {
      throw new Error(`${identity(expected)} differs from the exact P1C owner-review allowlist.`);
    }
  }

  const requiredFamilies = new Set(QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.map((entry) => (
    entry.lineageFamily
  )));
  const familyStatuses = new Map(catalogProbe.familyStatuses.map((status) => [status.family, status]));
  if (catalogProbe.summary?.mappedFamilies !== requiredFamilies.size
    || catalogProbe.summary?.catalogTopologyCompleteFamilies !== requiredFamilies.size
    || catalogProbe.summary?.dataShapeObservedFamilies !== requiredFamilies.size) {
    throw new Error('P1C catalog probe does not cover every owner-reviewed lineage family.');
  }
  for (const family of requiredFamilies) {
    const status = familyStatuses.get(family);
    if (!status || status.mappedObjects < 1
      || status.catalogTopologyComplete !== true
      || status.dataShapeObserved !== true) {
      throw new Error(`P1C catalog probe does not prove the ${family} replacement topology.`);
    }
  }
}

export function buildQianchuanProductionMigrationP1cReviewDecisions({
  catalogProbe,
  catalogProbeArtifact,
  catalogProbeSha256,
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
  reviewedAt,
  reviewer,
}) {
  validateP1cEvidence({
    catalogProbe,
    catalogProbeArtifact,
    catalogProbeSha256,
    lineage,
    lineageArtifact,
    lineageSha256,
    manifest,
    manifestArtifact,
    manifestSha256,
    priorDecisions,
    priorDecisionsArtifact,
    priorDecisionsSha256,
  });
  assertIsoTimestamp(generatedAt, 'P1C decision artifact generatedAt');
  assertIsoTimestamp(reviewedAt, 'P1C decision reviewedAt');
  if (!reviewedAt.startsWith(`${REVIEW_DATE}T`)) {
    throw new Error(`P1C decision reviewedAt must record the ${REVIEW_DATE} owner authorization.`);
  }
  if (reviewer !== REVIEWER) {
    throw new Error(`P1C decision reviewer must be the neutral identity ${REVIEWER}.`);
  }

  const evidenceLinks = [
    artifactLink('reconciliation_manifest', manifestArtifact),
    artifactLink('p1c_lineage_packet', lineageArtifact),
    artifactLink('p1c_live_readonly_catalog_probe', catalogProbeArtifact),
  ];
  const newDecisions = QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.map((entry) => ({
    ...entry,
    decision: 'not_applicable',
    decisionCohort: 'P1C',
    evidenceLinks: evidenceLinks.map((link) => ({ ...link })),
    ledgerAction: 'do_not_record',
    reviewStatus: 'verified_not_applicable',
    reviewWave: 'P1C',
    reviewedAt,
    reviewer,
    sourceClassification: 'unknown',
  }));
  const decisions = [...clone(priorDecisions.decisions), ...newDecisions];
  return {
    schemaVersion: 2,
    generatedAt,
    mode: 'offline_owner_review_decisions',
    authorization: {
      acceptedOn: REVIEW_DATE,
      evidence: AUTHORIZATION_EVIDENCE,
      newDecisionCohort: 'P1C',
      reviewer,
    },
    sourceArtifacts: {
      catalogProbe: catalogProbeArtifact,
      lineage: lineageArtifact,
      manifest: manifestArtifact,
      priorDecisions: priorDecisionsArtifact,
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
      decisions: decisions.length,
      priorDecisions: priorDecisions.decisions.length,
      newDecisions: newDecisions.length,
      byCohort: { P1B: priorDecisions.decisions.length, P1C: newDecisions.length },
      ledgerActions: { do_not_record: decisions.length },
      reviewStatuses: { verified_not_applicable: decisions.length },
    },
    decisions,
  };
}

function validatePriorDecisionRows(rows, manifestArtifact) {
  if (rows.length !== QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length) {
    throw new Error('P1C owner review artifact does not preserve the exact prior P1B decisions.');
  }
  for (const [index, expected] of QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.entries()) {
    const row = rows[index];
    const links = row?.evidenceLinks;
    if (identity(row ?? {}) !== identity(expected) || row.checksum !== expected.checksum
      || row.rationale !== expected.rationale || row.decision !== 'not_applicable'
      || row.reviewStatus !== 'verified_not_applicable' || row.ledgerAction !== 'do_not_record'
      || row.reviewer !== REVIEWER || row.sourceClassification !== 'unknown'
      || !Array.isArray(links) || links.length !== 2
      || links[0]?.kind !== 'reconciliation_manifest'
      || links[0]?.sha256 !== manifestArtifact.sha256
      || links[1]?.kind !== 'p1b_live_readonly_probe') {
      throw new Error(`${identity(expected)} prior owner review decision was not preserved.`);
    }
    assertIsoTimestamp(row.reviewedAt, `${identity(expected)} reviewedAt`);
  }
}

export function validateQianchuanProductionMigrationP1cReviewDecisions(decisions, {
  manifest,
  manifestArtifact,
} = {}) {
  if (decisions?.schemaVersion !== 2 || decisions.mode !== 'offline_owner_review_decisions') {
    throw new Error('P1C owner review decisions must be schemaVersion=2 offline_owner_review_decisions.');
  }
  assertIsoTimestamp(decisions.generatedAt, 'P1C decision artifact generatedAt');
  if (decisions.authorization?.reviewer !== REVIEWER
    || decisions.authorization?.acceptedOn !== REVIEW_DATE
    || decisions.authorization?.evidence !== AUTHORIZATION_EVIDENCE
    || decisions.authorization?.newDecisionCohort !== 'P1C'
    || decisions.policy?.authoritativeManifestMutated !== false
    || decisions.policy?.priorDecisionArtifactMutated !== false
    || decisions.policy?.productionWritesAuthorized !== false
    || decisions.policy?.ledgerWritesAuthorized !== false
    || decisions.policy?.deployAuthorized !== false
    || decisions.policy?.networkAccess !== false
    || decisions.policy?.decision !== 'not_applicable') {
    throw new Error('P1C owner review decision policy or authorization is invalid.');
  }

  const sourceManifest = decisions.sourceArtifacts?.manifest;
  const sourcePriorDecisions = decisions.sourceArtifacts?.priorDecisions;
  const sourceLineage = decisions.sourceArtifacts?.lineage;
  const sourceCatalogProbe = decisions.sourceArtifacts?.catalogProbe;
  for (const [label, artifact] of [
    ['Decision source manifest', sourceManifest],
    ['Decision source prior decisions', sourcePriorDecisions],
    ['Decision source P1C lineage', sourceLineage],
    ['Decision source P1C catalog probe', sourceCatalogProbe],
  ]) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, label);
  }

  const expectedTotal = QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length
    + QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length;
  if (decisions.summary?.decisions !== expectedTotal
    || decisions.summary?.priorDecisions !== QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.newDecisions !== QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.byCohort?.P1B !== QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.byCohort?.P1C !== QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.length
    || decisions.summary?.ledgerActions?.do_not_record !== expectedTotal
    || decisions.summary?.reviewStatuses?.verified_not_applicable !== expectedTotal
    || !Array.isArray(decisions.decisions)
    || decisions.decisions.length !== expectedTotal) {
    throw new Error('P1C owner review decision summary is inconsistent.');
  }

  const priorRows = decisions.decisions.slice(0, QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length);
  validatePriorDecisionRows(priorRows, sourceManifest);
  const newRows = decisions.decisions.slice(QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS.length);
  const expectedLinks = [
    artifactLink('reconciliation_manifest', sourceManifest),
    artifactLink('p1c_lineage_packet', sourceLineage),
    artifactLink('p1c_live_readonly_catalog_probe', sourceCatalogProbe),
  ];
  for (const [index, expected] of QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS.entries()) {
    const row = newRows[index];
    assertIsoTimestamp(row?.reviewedAt, `${identity(expected)} reviewedAt`);
    if (identity(row ?? {}) !== identity(expected) || row.checksum !== expected.checksum
      || row.lineageFamily !== expected.lineageFamily || row.rationale !== expected.rationale
      || row.decision !== 'not_applicable' || row.reviewStatus !== 'verified_not_applicable'
      || row.ledgerAction !== 'do_not_record' || row.reviewer !== REVIEWER
      || row.sourceClassification !== 'unknown' || row.decisionCohort !== 'P1C'
      || row.reviewWave !== 'P1C' || !row.reviewedAt.startsWith(`${REVIEW_DATE}T`)
      || JSON.stringify(row.evidenceLinks) !== JSON.stringify(expectedLinks)) {
      throw new Error(`${identity(expected)} P1C owner review decision is invalid.`);
    }
  }

  if (manifest) {
    validateQianchuanProductionMigrationManifest(manifest);
    const manifestByIdentity = new Map(manifest.entries.map((entry) => [identity(entry), entry]));
    for (const expected of [
      ...QIANCHUAN_P1B_NOT_APPLICABLE_DECISIONS,
      ...QIANCHUAN_P1C_NOT_APPLICABLE_DECISIONS,
    ]) {
      const entry = manifestByIdentity.get(identity(expected));
      if (!entry || entry.checksum !== expected.checksum || entry.classification !== 'unknown') {
        throw new Error(`${identity(expected)} no longer matches the owner decision manifest.`);
      }
    }
  }
  if (manifestArtifact) assertSameArtifact(sourceManifest, manifestArtifact, 'Owner decision manifest');
  return decisions;
}

export function validateQianchuanProductionMigrationOwnerDecisionArtifact(decisions, options = {}) {
  if (decisions?.schemaVersion === 1) {
    return validateQianchuanProductionMigrationReviewDecisions(decisions, options);
  }
  return validateQianchuanProductionMigrationP1cReviewDecisions(decisions, options);
}
