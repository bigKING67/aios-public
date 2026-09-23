import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';

export const QIANCHUAN_LEDGER_EXCEPTION_RUNNER_CONTRACT_VERSION = 2;

const DECISION_TO_EXCEPTION_KIND = new Map([
  ['not_applicable', 'not_applicable'],
  ['verified_forward_repaired', 'forward_repaired'],
]);
const FORBIDDEN_SELF_HASH_FIELDS = new Set([
  'decisionArtifactSha256',
  'overlayArtifactSha256',
  'overlaySha256',
  'selfSha256',
]);

function identity(value) {
  return `${value.namespace}/${value.version}`;
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp with milliseconds.`);
  }
}

function assertDecisionEvidenceLinks(row) {
  if (!Array.isArray(row.evidenceLinks) || row.evidenceLinks.length === 0) {
    throw new Error(`${identity(row)} owner decision is missing evidence links.`);
  }
  for (const [index, artifact] of row.evidenceLinks.entries()) {
    assertPinnedMigrationReviewArtifact(
      artifact,
      artifact?.sha256,
      `${identity(row)} owner decision evidence ${index + 1}`,
    );
  }
}

export function validateQianchuanLedgerExceptionSourceDecisions(decisions) {
  if (!Number.isSafeInteger(decisions?.schemaVersion) || decisions.schemaVersion < 1
    || decisions.mode !== 'offline_owner_review_decisions'
    || decisions.policy?.networkAccess !== false
    || decisions.policy?.productionWritesAuthorized !== false
    || decisions.policy?.ledgerWritesAuthorized !== false
    || decisions.policy?.deployAuthorized !== false
    || !Array.isArray(decisions.decisions)
    || decisions.decisions.length === 0) {
    throw new Error('Owner decision artifact policy or shape is invalid.');
  }
  assertIsoTimestamp(decisions.generatedAt, 'Owner decision artifact generatedAt');
  if (decisions.summary?.decisions !== decisions.decisions.length
    || decisions.summary?.ledgerActions?.do_not_record !== decisions.decisions.length) {
    throw new Error('Owner decision artifact summary is inconsistent.');
  }
  const seen = new Set();
  for (const row of decisions.decisions) {
    const rowIdentity = identity(row ?? {});
    const expectedReviewStatus = row?.decision === 'not_applicable'
      ? 'verified_not_applicable'
      : 'verified_forward_repaired';
    if (!['backend', 'warehouse'].includes(row?.namespace)
      || typeof row.version !== 'string' || !row.version
      || !/^[a-f0-9]{64}$/u.test(row.checksum ?? '')) {
      throw new Error('Owner decision artifact contains an invalid migration identity.');
    }
    if (seen.has(rowIdentity)) throw new Error(`Owner decision artifact contains duplicate ${rowIdentity}.`);
    seen.add(rowIdentity);
    if (!DECISION_TO_EXCEPTION_KIND.has(row.decision)) {
      throw new Error(`${rowIdentity} contains an unsupported owner decision.`);
    }
    if (row.reviewStatus !== expectedReviewStatus
      || row.ledgerAction !== 'do_not_record'
      || row.sourceClassification !== 'unknown'
      || row.reviewer !== 'repository-owner'
      || ![false, null].includes(row.historicalExecution ?? null)
      || ((row.historicalExecution ?? null) === null && row.decision !== 'not_applicable')) {
      throw new Error(`${rowIdentity} owner decision cannot authorize a v2 exception resolution.`);
    }
    assertIsoTimestamp(row.reviewedAt, `${rowIdentity} owner decision reviewedAt`);
    assertDecisionEvidenceLinks(row);
  }
  for (const [label, artifact] of Object.entries(decisions.sourceArtifacts ?? {})) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Owner decision ${label} source artifact`);
  }
  return decisions;
}

function assertNoSelfHashFields(value, path = 'overlay') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SELF_HASH_FIELDS.has(key)) {
      throw new Error(`Ledger exception owner overlay must not contain self-hash field ${path}.${key}.`);
    }
    assertNoSelfHashFields(child, `${path}.${key}`);
  }
}

function expectedResolution(row, sourceDecisionArtifactSha256, reviewer, reviewedAt) {
  return {
    namespace: row.namespace,
    version: row.version,
    checksum: row.checksum,
    exceptionKind: DECISION_TO_EXCEPTION_KIND.get(row.decision),
    sourceDecision: row.decision,
    sourceDecisionReviewStatus: row.reviewStatus,
    sourceDecisionArtifactSha256,
    sourceHistoricalExecution: row.historicalExecution ?? null,
    historicalExecution: false,
    sourceClassification: row.sourceClassification,
    ledgerResolutionAction: 'record_exception',
    runnerContractVersion: QIANCHUAN_LEDGER_EXCEPTION_RUNNER_CONTRACT_VERSION,
    reviewer,
    reviewedAt,
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
  };
}

function countExceptionKinds(resolutions) {
  return Object.fromEntries(['forward_repaired', 'not_applicable'].map((kind) => [
    kind,
    resolutions.filter((resolution) => resolution.exceptionKind === kind).length,
  ]));
}

function countSourceHistoricalExecutionStates(resolutions) {
  return {
    explicit_false: resolutions.filter(
      (resolution) => resolution.sourceHistoricalExecution === false,
    ).length,
    legacy_unspecified: resolutions.filter(
      (resolution) => resolution.sourceHistoricalExecution === null,
    ).length,
  };
}

export function validateQianchuanProductionMigrationLedgerExceptionOwnerOverlay(
  overlay,
  { decisions, decisionsArtifact, records } = {},
) {
  assertNoSelfHashFields(overlay);
  assertIsoTimestamp(overlay?.generatedAt, 'Ledger exception owner overlay generatedAt');
  assertIsoTimestamp(overlay?.authorization?.reviewedAt, 'Ledger exception owner overlay reviewedAt');
  if (overlay.schemaVersion !== 1
    || overlay.mode !== 'offline_migration_ledger_exception_owner_overlay'
    || overlay.authorization?.confirmation !== 'record_exception'
    || overlay.authorization?.reviewer !== 'repository-owner'
    || overlay.authorization?.runnerContractVersion !== QIANCHUAN_LEDGER_EXCEPTION_RUNNER_CONTRACT_VERSION
    || overlay.policy?.networkAccess !== false
    || overlay.policy?.productionWritesAuthorized !== false
    || overlay.policy?.ledgerWritesAuthorized !== false
    || overlay.policy?.migrationApplyAuthorized !== false
    || overlay.policy?.deployAuthorized !== false
    || overlay.policy?.arkInvoked !== false
    || !Array.isArray(overlay.resolutions)) {
    throw new Error('Ledger exception owner overlay policy or authorization is invalid.');
  }
  if (Date.parse(overlay.generatedAt) < Date.parse(overlay.authorization.reviewedAt)) {
    throw new Error('Ledger exception owner overlay generatedAt cannot precede reviewedAt.');
  }
  const sourceArtifact = overlay.sourceArtifacts?.ownerDecisions;
  assertPinnedMigrationReviewArtifact(
    sourceArtifact,
    sourceArtifact?.sha256,
    'Ledger exception owner overlay source decisions',
  );
  if (decisionsArtifact
    && (sourceArtifact.sha256 !== decisionsArtifact.sha256
      || sourceArtifact.bytes !== decisionsArtifact.bytes)) {
    throw new Error('Ledger exception owner overlay source artifact differs from the pinned owner decisions.');
  }
  const sourceDecisions = decisions ? validateQianchuanLedgerExceptionSourceDecisions(decisions) : null;
  if (sourceDecisions && (
    Date.parse(overlay.authorization.reviewedAt) < Date.parse(sourceDecisions.generatedAt)
    || sourceDecisions.decisions.some(
      (row) => Date.parse(overlay.authorization.reviewedAt) < Date.parse(row.reviewedAt),
    )
  )) {
    throw new Error('Ledger exception owner overlay reviewedAt predates its source owner decisions.');
  }
  const expectedRows = sourceDecisions?.decisions.map((row) => expectedResolution(
    row,
    sourceArtifact.sha256,
    overlay.authorization.reviewer,
    overlay.authorization.reviewedAt,
  ));
  if (expectedRows && JSON.stringify(overlay.resolutions) !== JSON.stringify(expectedRows)) {
    throw new Error('Ledger exception owner overlay does not exactly re-attest the source owner decisions.');
  }
  const seen = new Set();
  const recordsByIdentity = records
    ? new Map(records.map((record) => [identity(record), record]))
    : null;
  for (const resolution of overlay.resolutions) {
    const resolutionIdentity = identity(resolution ?? {});
    const expectedExceptionKind = DECISION_TO_EXCEPTION_KIND.get(resolution?.sourceDecision);
    const expectedReviewStatus = resolution?.sourceDecision === 'not_applicable'
      ? 'verified_not_applicable'
      : 'verified_forward_repaired';
    if (seen.has(resolutionIdentity)) {
      throw new Error(`Ledger exception owner overlay contains duplicate ${resolutionIdentity}.`);
    }
    seen.add(resolutionIdentity);
    if (!['backend', 'warehouse'].includes(resolution?.namespace)
      || typeof resolution.version !== 'string' || !resolution.version
      || !/^[a-f0-9]{64}$/u.test(resolution.checksum ?? '')
      || resolution.exceptionKind !== expectedExceptionKind
      || resolution.sourceDecisionReviewStatus !== expectedReviewStatus
      || resolution.sourceDecisionArtifactSha256 !== sourceArtifact.sha256
      || ![false, null].includes(resolution.sourceHistoricalExecution)
      || (resolution.sourceHistoricalExecution === null
        && resolution.sourceDecision !== 'not_applicable')
      || resolution.historicalExecution !== false
      || resolution.sourceClassification !== 'unknown'
      || resolution.ledgerResolutionAction !== 'record_exception'
      || resolution.runnerContractVersion !== QIANCHUAN_LEDGER_EXCEPTION_RUNNER_CONTRACT_VERSION
      || resolution.reviewer !== overlay.authorization.reviewer
      || resolution.reviewedAt !== overlay.authorization.reviewedAt
      || resolution.productionWritesAuthorized !== false
      || resolution.ledgerWritesAuthorized !== false) {
      throw new Error(`${resolutionIdentity} ledger exception resolution is invalid.`);
    }
    const record = recordsByIdentity?.get(resolutionIdentity);
    if (recordsByIdentity && (!record || record.checksum !== resolution.checksum)) {
      throw new Error(`${resolutionIdentity} exception resolution differs from the current repository.`);
    }
  }
  if (overlay.summary?.resolutions !== overlay.resolutions.length
    || overlay.summary?.ledgerResolutionActions?.record_exception !== overlay.resolutions.length
    || JSON.stringify(overlay.summary?.exceptionKinds) !== JSON.stringify(countExceptionKinds(overlay.resolutions))
    || JSON.stringify(overlay.summary?.sourceHistoricalExecutionStates)
      !== JSON.stringify(countSourceHistoricalExecutionStates(overlay.resolutions))) {
    throw new Error('Ledger exception owner overlay summary is inconsistent.');
  }
  return overlay;
}

export function buildQianchuanProductionMigrationLedgerExceptionOwnerOverlay({
  confirmed = false,
  decisions,
  decisionsArtifact,
  decisionsSha256,
  generatedAt = new Date().toISOString(),
  reviewedAt,
  reviewer,
}) {
  if (!confirmed) throw new Error('Explicit record_exception owner confirmation is required.');
  if (reviewer !== 'repository-owner') {
    throw new Error('Ledger exception owner overlay reviewer must be repository-owner.');
  }
  assertIsoTimestamp(reviewedAt, 'Ledger exception owner overlay reviewedAt');
  assertPinnedMigrationReviewArtifact(decisionsArtifact, decisionsSha256, 'Owner decision artifact');
  validateQianchuanLedgerExceptionSourceDecisions(decisions);
  const resolutions = decisions.decisions.map((row) => expectedResolution(
    row,
    decisionsArtifact.sha256,
    reviewer,
    reviewedAt,
  ));
  const overlay = {
    schemaVersion: 1,
    generatedAt,
    mode: 'offline_migration_ledger_exception_owner_overlay',
    authorization: {
      confirmation: 'record_exception',
      reviewer,
      reviewedAt,
      runnerContractVersion: QIANCHUAN_LEDGER_EXCEPTION_RUNNER_CONTRACT_VERSION,
    },
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      migrationApplyAuthorized: false,
      deployAuthorized: false,
      arkInvoked: false,
    },
    sourceArtifacts: { ownerDecisions: decisionsArtifact },
    resolutions,
    summary: {
      resolutions: resolutions.length,
      exceptionKinds: countExceptionKinds(resolutions),
      sourceHistoricalExecutionStates: countSourceHistoricalExecutionStates(resolutions),
      ledgerResolutionActions: { record_exception: resolutions.length },
    },
  };
  return validateQianchuanProductionMigrationLedgerExceptionOwnerOverlay(overlay, {
    decisions,
    decisionsArtifact,
  });
}

export function indexQianchuanProductionMigrationLedgerExceptionOwnerOverlay(
  overlay,
  options,
) {
  validateQianchuanProductionMigrationLedgerExceptionOwnerOverlay(overlay, options);
  return new Map(overlay.resolutions.map((resolution) => [identity(resolution), resolution]));
}
