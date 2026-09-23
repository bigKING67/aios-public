import { createHash } from 'node:crypto';

import { summarizeAiosMigrations } from './aios-migration-discovery.mjs';
import { AIOS_MIGRATION_LEDGER_V2_EXECUTION_MODES } from './aios-migration-ledger-contract.mjs';
import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { validateQianchuanProductionMigrationManifest } from './aios-qianchuan-production-migration-review-queue.mjs';
import {
  indexQianchuanProductionMigrationLedgerExceptionOwnerOverlay,
  QIANCHUAN_LEDGER_EXCEPTION_RUNNER_CONTRACT_VERSION,
  validateQianchuanLedgerExceptionSourceDecisions,
} from './aios-qianchuan-production-migration-ledger-exception-owner-overlay.mjs';
import {
  QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION,
} from './aios-qianchuan-production-migration-platform-video-identity-readonly-probe.mjs';

export const QIANCHUAN_LEDGER_BOOTSTRAP_RUNNER_SOURCE_PATHS = Object.freeze({
  bootstrapManifest: 'scripts/lib/migrations/aios-migration-ledger-bootstrap-manifest.mjs',
  bootstrapSql: 'scripts/lib/migrations/aios-migration-ledger-bootstrap-sql.mjs',
  bootstrapWriter: 'scripts/lib/migrations/aios-migration-ledger-bootstrap-writer.mjs',
  historyComparator: 'scripts/lib/migrations/aios-migration-history.mjs',
  ledgerContract: 'scripts/lib/migrations/aios-migration-ledger-contract.mjs',
  ledgerDdl: 'scripts/config/migrations/aios-schema-migrations.sql',
  ledgerV1ToV2Ddl: 'scripts/config/migrations/aios-schema-migrations-v1-to-v2.sql',
});

const LEDGER_ELIGIBLE_ACTIONS = new Set(['eligible_for_selective_recording', 'retain_matching_record']);
const EXPECTED_EXECUTION_MODES = AIOS_MIGRATION_LEDGER_V2_EXECUTION_MODES;
const TARGET = Object.freeze({
  checksum: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.sha256,
  identity: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.identity,
  relativePath: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.path,
});

function identity(value) {
  return `${value.namespace}/${value.version}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp with milliseconds.`);
  }
}

function repositoryInventory(records) {
  const namespaces = summarizeAiosMigrations(records);
  return {
    total: records.length,
    namespaces: Object.fromEntries(Object.entries(namespaces).map(([namespace, summary]) => [
      namespace,
      { bytes: summary.bytes, modes: summary.modes, total: summary.total },
    ])),
  };
}

function assertManifestMatchesRepository(manifest, records) {
  validateQianchuanProductionMigrationManifest(manifest);
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Ledger bootstrap plan requires the discovered repository migration inventory.');
  }
  const expectedInventory = repositoryInventory(records);
  if (JSON.stringify(manifest.inventory) !== JSON.stringify(expectedInventory)) {
    throw new Error('Reconciliation manifest inventory differs from the current repository.');
  }
  if (manifest.entries.length !== records.length) {
    throw new Error('Reconciliation manifest entry count differs from the current repository.');
  }
  for (const [index, record] of records.entries()) {
    const entry = manifest.entries[index];
    if (identity(entry) !== identity(record)) {
      throw new Error(`Reconciliation manifest order or identity differs at repository position ${index + 1}.`);
    }
    if (entry.checksum !== record.checksum) {
      throw new Error(`${identity(record)} reconciliation checksum differs from the current repository.`);
    }
    if (entry.relativePath !== record.relativePath
      || entry.executionMode !== record.executionMode
      || entry.sizeBytes !== record.sizeBytes) {
      throw new Error(`${identity(record)} reconciliation source metadata differs from the current repository.`);
    }
  }
  return expectedInventory;
}

function rebaseOwnerDecisions(decisions, records) {
  validateQianchuanLedgerExceptionSourceDecisions(decisions);
  const recordsByIdentity = new Map(records.map((record) => [identity(record), record]));
  const rebased = new Map();
  for (const row of decisions.decisions) {
    const rowIdentity = identity(row);
    const record = recordsByIdentity.get(rowIdentity);
    if (!record) throw new Error(`${rowIdentity} owner decision has no source migration in the repository.`);
    if (record.checksum !== row.checksum) {
      throw new Error(`${rowIdentity} owner decision checksum differs from the current repository.`);
    }
    rebased.set(rowIdentity, row);
  }
  return rebased;
}

function extractExecutionModes(ledgerDdl) {
  const match = ledgerDdl.match(/CHECK\s*\(\s*execution_mode\s+IN\s*\(([^)]+)\)\s*\)/iu);
  if (!match) throw new Error('Migration ledger DDL no longer exposes a parseable execution_mode contract.');
  return [...match[1].matchAll(/'([^']+)'/gu)].map((value) => value[1]);
}

function buildRunnerEvidence(sources) {
  const expectedKeys = Object.keys(QIANCHUAN_LEDGER_BOOTSTRAP_RUNNER_SOURCE_PATHS).sort();
  if (JSON.stringify(Object.keys(sources ?? {}).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('Ledger bootstrap runner sources are incomplete.');
  }
  for (const key of expectedKeys) {
    if (typeof sources[key] !== 'string' || !sources[key]) {
      throw new Error(`Ledger bootstrap runner source ${key} is empty.`);
    }
  }
  for (const needle of [
    'const expectedRecord = expected[index];',
    'expectedRecord.version !== row.version',
    'ledger history is not a filesystem prefix at ${row.version}.',
    'expectedRecord.checksum !== row.checksum',
    "mode === 'exception'",
    'exception mode requires the v2 ledger read shape',
    'decisionArtifactSha256',
  ]) {
    if (!sources.historyComparator.includes(needle)) {
      throw new Error(`Migration history comparator no longer proves strict filesystem-prefix behavior: ${needle}`);
    }
  }
  for (const needle of [
    'AIOS_MIGRATION_LEDGER_V2_COLUMNS',
    'AIOS_MIGRATION_LEDGER_CANONICAL_SCHEMA_SQL',
    "'exception_kind'",
    "'decision_artifact_sha256'",
    'read-compatible-v2',
    'detectCanonicalAiosMigrationLedgerSchema',
  ]) {
    if (!sources.ledgerContract.includes(needle)) {
      throw new Error(`Migration ledger read contract no longer proves v2 exception compatibility: ${needle}`);
    }
  }
  const executionModes = extractExecutionModes(sources.ledgerDdl);
  if (JSON.stringify(executionModes) !== JSON.stringify(EXPECTED_EXECUTION_MODES)) {
    throw new Error('Migration ledger execution_mode contract changed; refresh the bootstrap architecture review.');
  }
  for (const needle of [
    'ADD COLUMN exception_kind TEXT',
    'ADD COLUMN decision_artifact_sha256 TEXT',
    'aios_schema_migrations_exception_metadata_check',
  ]) {
    if (!sources.ledgerV1ToV2Ddl.includes(needle)) {
      throw new Error(`Migration ledger v1-to-v2 DDL no longer proves the additive upgrade: ${needle}`);
    }
  }
  for (const needle of [
    'prepareAiosMigrationLedgerBootstrap',
    'executeAiosMigrationLedgerBootstrap',
    'BEGIN ISOLATION LEVEL SERIALIZABLE',
    'AIOS_MIGRATION_LEDGER_BOOTSTRAP_LOCK_SQL',
    "await query('ROLLBACK')",
    'queryUpperBound',
  ]) {
    if (!sources.bootstrapWriter.includes(needle)) {
      throw new Error(`Migration ledger bootstrap writer no longer proves its Stage D contract: ${needle}`);
    }
  }
  for (const needle of [
    'productionWritesAuthorized',
    'ledgerWritesAuthorized',
    'schemaUpgradeAuthorized',
    'expectedRows must equal existingRows plus rowsToInsert',
  ]) {
    if (!sources.bootstrapManifest.includes(needle)) {
      throw new Error(`Migration ledger bootstrap manifest no longer proves pinned write authorization: ${needle}`);
    }
  }
  for (const needle of [
    'ON CONFLICT (namespace, version) DO NOTHING',
    'pg_advisory_xact_lock',
  ]) {
    if (!sources.bootstrapSql.includes(needle)) {
      throw new Error(`Migration ledger bootstrap SQL no longer proves bounded atomic writes: ${needle}`);
    }
  }
  const sourceEvidence = Object.fromEntries(expectedKeys.map((key) => [key, {
    path: QIANCHUAN_LEDGER_BOOTSTRAP_RUNNER_SOURCE_PATHS[key],
    bytes: Buffer.byteLength(sources[key]),
    sha256: sha256(sources[key]),
  }]));
  return {
    strictFilesystemPrefixRequired: true,
    executionModes,
    exceptionChannelSupported: true,
    runnerContractVersion: QIANCHUAN_LEDGER_EXCEPTION_RUNNER_CONTRACT_VERSION,
    ledgerSchemaWriterVersion: 2,
    ledgerSchemaMutationSupported: true,
    writerImplemented: true,
    sources: sourceEvidence,
  };
}

function isLedgerEligible(entry) {
  return entry.classification === 'applied_and_verified'
    && entry.executionEvidenceState !== 'unknown'
    && LEDGER_ELIGIBLE_ACTIONS.has(entry.ledgerAction);
}

function classifiedEntry(entry, namespacePosition, decision, exceptionResolution) {
  const category = exceptionResolution
    ? 'exception_eligible'
    : isLedgerEligible(entry)
      ? 'ledger_eligible'
      : 'unresolved';
  return {
    identity: identity(entry),
    namespace: entry.namespace,
    version: entry.version,
    checksum: entry.checksum,
    relativePath: entry.relativePath,
    executionMode: entry.executionMode,
    namespacePosition,
    category,
    manifestClassification: entry.classification,
    manifestExecutionEvidenceState: entry.executionEvidenceState,
    manifestLedgerAction: entry.ledgerAction,
    ownerDecision: decision ? {
      decision: decision.decision,
      ledgerAction: decision.ledgerAction,
      reviewStatus: decision.reviewStatus,
      reviewedAt: decision.reviewedAt,
      reviewer: decision.reviewer,
    } : null,
    exceptionResolution: exceptionResolution ? {
      exceptionKind: exceptionResolution.exceptionKind,
      ledgerResolutionAction: exceptionResolution.ledgerResolutionAction,
      runnerContractVersion: exceptionResolution.runnerContractVersion,
      reviewedAt: exceptionResolution.reviewedAt,
      reviewer: exceptionResolution.reviewer,
    } : null,
  };
}

function analyzeNamespace(entries) {
  let strictPrefixLength = 0;
  while (entries[strictPrefixLength] && entries[strictPrefixLength].category !== 'unresolved') {
    strictPrefixLength += 1;
  }
  const firstBlockerEntry = entries[strictPrefixLength] ?? null;
  const unresolved = entries.filter((entry) => entry.category === 'unresolved');
  const exceptions = entries.filter((entry) => entry.category === 'exception_eligible');
  return {
    total: entries.length,
    strictPrefixLength,
    resolvedPrefixRows: strictPrefixLength,
    exceptionRowsInPrefix: entries.slice(0, strictPrefixLength)
      .filter((entry) => entry.category === 'exception_eligible').length,
    bootstrapPrefixReady: strictPrefixLength > 0,
    firstBlocker: firstBlockerEntry ? {
      identity: firstBlockerEntry.identity,
      namespacePosition: firstBlockerEntry.namespacePosition,
      category: firstBlockerEntry.category,
      reason: 'unresolved_first_migration',
    } : null,
    unresolvedPredecessorCount: unresolved.length,
    exceptionResolutions: exceptions.map((entry) => ({
      identity: entry.identity,
      namespacePosition: entry.namespacePosition,
      exceptionKind: entry.exceptionResolution.exceptionKind,
    })),
  };
}

function blocker(code, detail) {
  return { code, detail };
}

function buildBlockers({ manifest, namespaceAnalysis, runnerEvidence }) {
  const blockers = [];
  const unresolvedFirst = Object.entries(namespaceAnalysis)
    .filter(([, analysis]) => (
      analysis.strictPrefixLength === 0 && analysis.firstBlocker?.category === 'unresolved'
    ))
    .map(([namespace, analysis]) => `${namespace}:${analysis.firstBlocker.identity}`);
  if (unresolvedFirst.length) {
    blockers.push(blocker('unresolved_first_migration', unresolvedFirst));
  }
  if (manifest.reconciled !== true || manifest.readyForLedgerBootstrap !== true) {
    blockers.push(blocker('reconciliation_not_complete', {
      reconciled: manifest.reconciled === true,
      readyForLedgerBootstrap: manifest.readyForLedgerBootstrap === true,
    }));
  }
  if (runnerEvidence.ledgerSchemaMutationSupported !== true) {
    blockers.push(blocker('v2_ledger_schema_writer_not_implemented', {
      ledgerSchemaWriterVersion: runnerEvidence.ledgerSchemaWriterVersion,
    }));
  }
  if (runnerEvidence.writerImplemented !== true) {
    blockers.push(blocker('ledger_bootstrap_writer_not_implemented', null));
  }
  return blockers;
}

function architectureOptions() {
  return [
    {
      id: 'record_do_not_record_as_baseline',
      status: 'rejected',
      tradeoff: 'Would make the ledger claim historical execution that the owner decisions explicitly reject.',
    },
    {
      id: 'extend_primary_ledger_with_exception_mode',
      status: 'accepted_with_stage_d_local_writer_fixtures',
      tradeoff: 'Preserves one strict-prefix history source; production rehearsal and writes remain separately gated.',
    },
    {
      id: 'allow_prefix_comparator_holes',
      status: 'rejected',
      tradeoff: 'Weakens the single ordered history invariant and changes targeted-apply safety semantics.',
    },
    {
      id: 'add_side_exception_ledger',
      status: 'rejected',
      tradeoff: 'Preserves the primary ledger but creates a second history source that needs atomic consistency rules.',
    },
  ];
}

function targetAnalysis(classifiedEntries, manifest, runnerEvidence) {
  const target = classifiedEntries.find((entry) => entry.identity === TARGET.identity);
  if (!target || target.checksum !== TARGET.checksum || target.relativePath !== TARGET.relativePath) {
    throw new Error(`${TARGET.identity} target identity differs from the reviewed forward migration.`);
  }
  const predecessors = classifiedEntries.filter((entry) => (
    entry.namespace === target.namespace && entry.namespacePosition < target.namespacePosition
  ));
  const byCategory = Object.fromEntries([
    'exception_eligible',
    'ledger_eligible',
    'unresolved',
  ].map((category) => [category, predecessors.filter((entry) => entry.category === category).length]));
  const targetLedgerState = manifest.entries.find(
    (entry) => identity(entry) === TARGET.identity,
  )?.ledgerEvidence?.state;
  const predecessorsResolved = predecessors.every((entry) => entry.category !== 'unresolved');
  const targetExecutionEligible = runnerEvidence.exceptionChannelSupported === true
    && predecessorsResolved
    && target.executionMode === 'transactional'
    && target.manifestLedgerAction === 'withhold_pending_proof'
    && target.category === 'unresolved'
    && ['ledger_missing', 'not_recorded'].includes(targetLedgerState);
  const ready = manifest.ledger?.exists === true
    && (manifest.ledger.historyFailures?.length ?? 0) === 0
    && targetExecutionEligible;
  return {
    identity: target.identity,
    checksum: target.checksum,
    relativePath: target.relativePath,
    namespacePosition: target.namespacePosition,
    category: target.category,
    predecessorCount: predecessors.length,
    predecessorsByCategory: byCategory,
    predecessorsResolved,
    targetedApplyReady: ready,
    targetedApplyReadyAfterBootstrap: targetExecutionEligible,
  };
}

function countByCategory(entries) {
  return Object.fromEntries([
    'exception_eligible',
    'ledger_eligible',
    'unresolved',
  ].map((category) => [category, entries.filter((entry) => entry.category === category).length]));
}

function plannedLedgerRow(entry, overlayArtifactSha256) {
  if (entry.category === 'exception_eligible') {
    return {
      namespace: entry.namespace,
      version: entry.version,
      checksum: entry.checksum,
      executionMode: 'exception',
      exceptionKind: entry.exceptionResolution.exceptionKind,
      decisionArtifactSha256: overlayArtifactSha256,
    };
  }
  return {
    namespace: entry.namespace,
    version: entry.version,
    checksum: entry.checksum,
    executionMode: entry.executionMode,
    exceptionKind: null,
    decisionArtifactSha256: null,
  };
}

export function validateQianchuanProductionMigrationLedgerBootstrapPlan(plan) {
  assertIsoTimestamp(plan?.generatedAt, 'Ledger bootstrap plan generatedAt');
  if (plan?.schemaVersion !== 3
    || plan.mode !== 'offline_readonly_migration_ledger_bootstrap_plan'
    || plan.policy?.networkAccess !== false
    || plan.policy?.productionWritesAuthorized !== false
    || plan.policy?.migrationApplyAuthorized !== false
    || plan.policy?.ledgerWritesAuthorized !== false
    || plan.policy?.baselineAuthorized !== false
    || plan.policy?.deployAuthorized !== false
    || plan.policy?.arkInvoked !== false
    || plan.policy?.sqlGenerated !== false
    || plan.policy?.runnerExceptionChannelSupported !== true
    || plan.policy?.ledgerSchemaMutationSupported !== true
    || plan.policy?.writerImplemented !== true) {
    throw new Error('Ledger bootstrap plan policy is invalid.');
  }
  for (const [label, artifact] of Object.entries(plan.sourceArtifacts ?? {})) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Ledger bootstrap ${label} source artifact`);
  }
  if (JSON.stringify(Object.keys(plan.sourceArtifacts ?? {}).sort())
    !== JSON.stringify(['decisions', 'exceptionOverlay', 'manifest'])) {
    throw new Error('Ledger bootstrap plan source artifacts are incomplete.');
  }
  if (plan.repositoryEvidence?.runner?.strictFilesystemPrefixRequired !== true
    || plan.repositoryEvidence.runner.exceptionChannelSupported !== true
    || plan.repositoryEvidence.runner.runnerContractVersion
      !== QIANCHUAN_LEDGER_EXCEPTION_RUNNER_CONTRACT_VERSION
    || plan.repositoryEvidence.runner.ledgerSchemaWriterVersion !== 2
    || plan.repositoryEvidence.runner.ledgerSchemaMutationSupported !== true
    || plan.repositoryEvidence.runner.writerImplemented !== true
    || JSON.stringify(plan.repositoryEvidence.runner.executionModes) !== JSON.stringify(EXPECTED_EXECUTION_MODES)) {
    throw new Error('Ledger bootstrap plan runner evidence is invalid.');
  }
  if (!Array.isArray(plan.entries) || plan.entries.length !== plan.repositoryEvidence?.inventory?.total) {
    throw new Error('Ledger bootstrap plan repository inventory is inconsistent.');
  }
  const seen = new Set();
  for (const entry of plan.entries) {
    if (seen.has(entry.identity)) throw new Error(`Ledger bootstrap plan contains duplicate ${entry.identity}.`);
    seen.add(entry.identity);
    if (!['exception_eligible', 'ledger_eligible', 'unresolved'].includes(entry.category)) {
      throw new Error(`${entry.identity} has an invalid bootstrap category.`);
    }
    if (entry.category === 'exception_eligible') {
      if (!entry.ownerDecision
        || !['not_applicable', 'forward_repaired'].includes(entry.exceptionResolution?.exceptionKind)
        || entry.exceptionResolution.ledgerResolutionAction !== 'record_exception'
        || entry.exceptionResolution.runnerContractVersion
          !== QIANCHUAN_LEDGER_EXCEPTION_RUNNER_CONTRACT_VERSION) {
        throw new Error(`${entry.identity} has invalid exception resolution metadata.`);
      }
    } else if (entry.exceptionResolution !== null) {
      throw new Error(`${entry.identity} carries unexpected exception resolution metadata.`);
    }
  }
  const counts = countByCategory(plan.entries);
  if (JSON.stringify(plan.summary?.categories) !== JSON.stringify(counts)
    || plan.summary.sourceEntries !== plan.entries.length
    || plan.summary.ledgerRows !== plan.ledgerRows?.length
    || plan.summary.runnerExceptionChannelSupported !== true
    || plan.summary.bootstrapPrefixReady !== (plan.ledgerRows.length > 0)
    || plan.summary.writePlanReady !== (
      plan.summary.bootstrapPrefixReady
      && plan.repositoryEvidence.runner.ledgerSchemaMutationSupported === true
      && plan.repositoryEvidence.runner.writerImplemented === true
      && plan.sourceState.manifestReconciled === true
      && plan.sourceState.manifestReadyForLedgerBootstrap === true
    )
    || plan.sourceState?.rebasedExceptionResolutions !== counts.exception_eligible
    || plan.strictPrefix?.backend !== plan.namespaceAnalysis?.backend?.strictPrefixLength
    || plan.strictPrefix?.warehouse !== plan.namespaceAnalysis?.warehouse?.strictPrefixLength) {
    throw new Error('Ledger bootstrap plan summary or strict-prefix counts are inconsistent.');
  }
  const ledgerRows = plan.entries.filter((entry) => (
    entry.category !== 'unresolved'
    && entry.namespacePosition <= plan.strictPrefix[entry.namespace]
  ));
  if (JSON.stringify(plan.ledgerRows) !== JSON.stringify(ledgerRows.map((entry) => plannedLedgerRow(
    entry,
    plan.sourceArtifacts.exceptionOverlay.sha256,
  )))) {
    throw new Error('Ledger bootstrap proposed rows are not the strict repository prefix.');
  }
  if (plan.target?.identity !== TARGET.identity
    || plan.target.checksum !== TARGET.checksum
    || plan.target.relativePath !== TARGET.relativePath
    || plan.summary.targetedApplyReady !== plan.target.targetedApplyReady
    || plan.summary.targetedApplyReadyAfterBootstrap
      !== plan.target.targetedApplyReadyAfterBootstrap) {
    throw new Error('Ledger bootstrap target analysis is invalid.');
  }
  const acceptedArchitectures = (plan.architectureOptions ?? []).filter(
    (option) => typeof option?.status === 'string' && option.status.startsWith('accepted'),
  );
  if (!Array.isArray(plan.outputContract?.sqlStatements)
    || plan.outputContract.sqlStatements.length !== 0
    || !Array.isArray(plan.outputContract?.productionCommands)
    || plan.outputContract.productionCommands.length !== 0
    || acceptedArchitectures.length !== 1
    || plan.architectureOptions.find(
      (option) => option.id === 'extend_primary_ledger_with_exception_mode',
    )?.status !== 'accepted_with_stage_d_local_writer_fixtures') {
    throw new Error('Ledger bootstrap plan architecture or output contract is invalid.');
  }
  const blockerCodes = new Set((plan.blockers ?? []).map((value) => value.code));
  if (blockerCodes.has('v2_ledger_schema_writer_not_implemented')
    || blockerCodes.has('ledger_bootstrap_writer_not_implemented')) {
    throw new Error('Ledger bootstrap plan still reports Stage D implementation blockers.');
  }
  return plan;
}

export function buildQianchuanProductionMigrationLedgerBootstrapPlan({
  decisions,
  decisionsArtifact,
  decisionsSha256,
  exceptionOverlay,
  exceptionOverlayArtifact,
  exceptionOverlaySha256,
  generatedAt = new Date().toISOString(),
  manifest,
  manifestArtifact,
  manifestSha256,
  records,
  runnerSources,
}) {
  assertPinnedMigrationReviewArtifact(manifestArtifact, manifestSha256, 'Reconciliation manifest');
  assertPinnedMigrationReviewArtifact(decisionsArtifact, decisionsSha256, 'Owner decision artifact');
  assertPinnedMigrationReviewArtifact(
    exceptionOverlayArtifact,
    exceptionOverlaySha256,
    'Ledger exception owner overlay',
  );
  const inventory = assertManifestMatchesRepository(manifest, records);
  const rebasedDecisions = rebaseOwnerDecisions(decisions, records);
  const exceptionResolutions = indexQianchuanProductionMigrationLedgerExceptionOwnerOverlay(
    exceptionOverlay,
    { decisions, decisionsArtifact, records },
  );
  const runnerEvidence = buildRunnerEvidence(runnerSources);
  const positions = new Map();
  const entries = manifest.entries.map((entry) => {
    const namespacePosition = (positions.get(entry.namespace) ?? 0) + 1;
    positions.set(entry.namespace, namespacePosition);
    return classifiedEntry(
      entry,
      namespacePosition,
      rebasedDecisions.get(identity(entry)),
      exceptionResolutions.get(identity(entry)),
    );
  });
  const namespaceAnalysis = Object.fromEntries(['backend', 'warehouse'].map((namespace) => [
    namespace,
    analyzeNamespace(entries.filter((entry) => entry.namespace === namespace)),
  ]));
  const strictPrefix = Object.fromEntries(Object.entries(namespaceAnalysis).map(([namespace, analysis]) => [
    namespace,
    analysis.strictPrefixLength,
  ]));
  const ledgerRows = entries
    .filter((entry) => entry.category !== 'unresolved'
      && entry.namespacePosition <= strictPrefix[entry.namespace])
    .map((entry) => plannedLedgerRow(entry, exceptionOverlayArtifact.sha256));
  const target = targetAnalysis(entries, manifest, runnerEvidence);
  const categories = countByCategory(entries);
  const bootstrapPrefixReady = ledgerRows.length > 0
    && runnerEvidence.exceptionChannelSupported === true;
  const writePlanReady = bootstrapPrefixReady
    && runnerEvidence.ledgerSchemaMutationSupported === true
    && runnerEvidence.writerImplemented === true
    && manifest.reconciled === true
    && manifest.readyForLedgerBootstrap === true;
  const plan = {
    schemaVersion: 3,
    generatedAt,
    mode: 'offline_readonly_migration_ledger_bootstrap_plan',
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      migrationApplyAuthorized: false,
      ledgerWritesAuthorized: false,
      baselineAuthorized: false,
      deployAuthorized: false,
      arkInvoked: false,
      sqlGenerated: false,
      runnerExceptionChannelSupported: true,
      ledgerSchemaMutationSupported: true,
      writerImplemented: true,
    },
    sourceArtifacts: {
      manifest: manifestArtifact,
      decisions: decisionsArtifact,
      exceptionOverlay: exceptionOverlayArtifact,
    },
    repositoryEvidence: {
      inventory,
      runner: runnerEvidence,
    },
    sourceState: {
      manifestAuditedAt: manifest.auditedAt,
      manifestReconciled: manifest.reconciled === true,
      manifestReadyForLedgerBootstrap: manifest.readyForLedgerBootstrap === true,
      ledgerExists: manifest.ledger?.exists === true,
      ledgerRecordedRows: manifest.ledger?.recordedRows ?? null,
      rebasedOwnerDecisions: rebasedDecisions.size,
      rebasedExceptionResolutions: exceptionResolutions.size,
    },
    entries,
    namespaceAnalysis,
    strictPrefix,
    ledgerRows,
    target,
    blockers: buildBlockers({ manifest, namespaceAnalysis, runnerEvidence }),
    architectureOptions: architectureOptions(),
    outputContract: {
      sqlStatements: [],
      productionCommands: [],
      nextDecision: 'authorize_clone_rehearsal_and_fresh_production_readonly_evidence',
    },
    summary: {
      sourceEntries: entries.length,
      categories,
      ledgerRows: ledgerRows.length,
      bootstrapPrefixReady,
      writePlanReady,
      runnerExceptionChannelSupported: true,
      targetedApplyReady: target.targetedApplyReady,
      targetedApplyReadyAfterBootstrap: target.targetedApplyReadyAfterBootstrap,
    },
  };
  return validateQianchuanProductionMigrationLedgerBootstrapPlan(plan);
}
