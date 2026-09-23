#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import {
  discoverAiosMigrations,
  summarizeAiosMigrations,
} from '../../lib/migrations/aios-migration-discovery.mjs';
import {
  formatQianchuanProductionMigrationLedgerBootstrapPlan,
  parseQianchuanProductionMigrationLedgerBootstrapPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-ledger-bootstrap-plan-cli.mjs';
import {
  formatQianchuanProductionMigrationLedgerExceptionOwnerOverlay,
  parseQianchuanProductionMigrationLedgerExceptionOwnerOverlayArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-ledger-exception-owner-overlay-cli.mjs';
import {
  buildQianchuanProductionMigrationLedgerExceptionOwnerOverlay,
  validateQianchuanProductionMigrationLedgerExceptionOwnerOverlay,
} from '../../lib/migrations/aios-qianchuan-production-migration-ledger-exception-owner-overlay.mjs';
import {
  buildQianchuanProductionMigrationLedgerBootstrapPlan,
  QIANCHUAN_LEDGER_BOOTSTRAP_RUNNER_SOURCE_PATHS,
  validateQianchuanProductionMigrationLedgerBootstrapPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-ledger-bootstrap-plan.mjs';

const GENERATED_AT = '2026-07-26T03:00:00.000Z';
const REVIEWED_AT = '2026-07-25T13:09:40.683Z';
const OVERLAY_REVIEWED_AT = '2026-07-26T03:00:00.000Z';
const ENTRY_PATH = 'scripts/checks/marketing/content-assets-qianchuan-production-migration-ledger-bootstrap-plan.mjs';
const OVERLAY_ENTRY_PATH = 'scripts/checks/marketing/content-assets-qianchuan-production-migration-ledger-exception-owner-overlay.mjs';

function artifact(value, artifactPath) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return {
    bytes: Buffer.byteLength(content),
    path: artifactPath,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function inventory(records) {
  const namespaces = summarizeAiosMigrations(records);
  return {
    total: records.length,
    namespaces: Object.fromEntries(Object.entries(namespaces).map(([namespace, summary]) => [
      namespace,
      { bytes: summary.bytes, modes: summary.modes, total: summary.total },
    ])),
  };
}

function manifestEntry(record) {
  return {
    namespace: record.namespace,
    version: record.version,
    checksum: record.checksum,
    relativePath: record.relativePath,
    executionMode: record.executionMode,
    sizeBytes: record.sizeBytes,
    signals: {},
    unsupportedSignals: [],
    catalogEffects: [],
    ledgerEvidence: { recordedChecksum: null, state: 'ledger_missing' },
    executionEvidenceState: 'unknown',
    schemaEvidenceState: 'unprobeable',
    schemaEvidence: {
      currentEffects: 0,
      satisfiedEffects: 0,
      state: 'unprobeable',
      supersededEffects: 0,
    },
    explicitEvidence: null,
    candidateClassification: 'unknown',
    classification: 'unknown',
    rationale: 'Fixture execution is unresolved.',
    reviewStatus: 'manual_review_required',
    reviewer: null,
    ledgerAction: 'withhold_pending_proof',
  };
}

function buildManifest(records) {
  return {
    schemaVersion: 1,
    auditedAt: GENERATED_AT,
    mode: 'live_readonly',
    readOnlyTransaction: true,
    statementTimeoutMs: 15000,
    inventory: inventory(records),
    ledger: {
      exists: false,
      recordedRows: 0,
      historyFailures: [],
      namespaceSummaries: [],
    },
    entries: records.map(manifestEntry),
    summary: {
      classifications: { unknown: records.length },
      ledgerActions: { withhold_pending_proof: records.length },
      reviewStatuses: { manual_review_required: records.length },
      schemaEvidenceStates: { unprobeable: records.length },
      unknown: records.length,
    },
    reconciled: false,
    readyForLedgerBootstrap: false,
    target: null,
  };
}

function ownerDecision(record, decision, evidence) {
  return {
    namespace: record.namespace,
    version: record.version,
    checksum: record.checksum,
    decision,
    evidenceLinks: [evidence],
    historicalExecution: false,
    ledgerAction: 'do_not_record',
    rationale: 'Fixture owner decision.',
    reviewStatus: decision === 'not_applicable'
      ? 'verified_not_applicable'
      : 'verified_forward_repaired',
    reviewedAt: REVIEWED_AT,
    reviewer: 'repository-owner',
    sourceClassification: 'unknown',
  };
}

function buildDecisions(records) {
  const warehouse = records.filter((record) => record.namespace === 'warehouse');
  const evidence = artifact({ fixture: true }, '/tmp/ledger-bootstrap-decision-evidence.json');
  const rows = [
    ownerDecision(warehouse[0], 'not_applicable', evidence),
    ownerDecision(warehouse[1], 'verified_forward_repaired', evidence),
  ];
  delete rows[0].historicalExecution;
  return {
    schemaVersion: 4,
    generatedAt: GENERATED_AT,
    mode: 'offline_owner_review_decisions',
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      deployAuthorized: false,
    },
    sourceArtifacts: { fixture: evidence },
    summary: {
      decisions: rows.length,
      ledgerActions: { do_not_record: rows.length },
    },
    decisions: rows,
  };
}

function writeFixtureJson(value, outputPath) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(outputPath, content, 'utf8');
  return {
    path: outputPath,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
const manifest = buildManifest(records);
const decisions = buildDecisions(records);
const manifestArtifact = artifact(manifest, '/tmp/ledger-bootstrap-manifest.json');
const decisionsArtifact = artifact(decisions, '/tmp/ledger-bootstrap-decisions.json');
const exceptionOverlay = buildQianchuanProductionMigrationLedgerExceptionOwnerOverlay({
  confirmed: true,
  decisions,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  generatedAt: GENERATED_AT,
  reviewedAt: OVERLAY_REVIEWED_AT,
  reviewer: 'repository-owner',
});
const exceptionOverlayArtifact = artifact(
  exceptionOverlay,
  '/tmp/ledger-bootstrap-exception-overlay.json',
);
const runnerSources = Object.fromEntries(Object.entries(
  QIANCHUAN_LEDGER_BOOTSTRAP_RUNNER_SOURCE_PATHS,
).map(([key, sourcePath]) => [key, readFileSync(sourcePath, 'utf8')]));

function planArgs(overrides = {}) {
  return {
    generatedAt: GENERATED_AT,
    manifest,
    manifestArtifact,
    manifestSha256: manifestArtifact.sha256,
    decisions,
    decisionsArtifact,
    decisionsSha256: decisionsArtifact.sha256,
    exceptionOverlay,
    exceptionOverlayArtifact,
    exceptionOverlaySha256: exceptionOverlayArtifact.sha256,
    records,
    runnerSources,
    ...overrides,
  };
}

assert.equal(
  validateQianchuanProductionMigrationLedgerExceptionOwnerOverlay(exceptionOverlay, {
    decisions,
    decisionsArtifact,
    records,
  }),
  exceptionOverlay,
);
assert.equal(exceptionOverlay.summary.resolutions, 2);
assert.deepEqual(exceptionOverlay.summary.exceptionKinds, {
  forward_repaired: 1,
  not_applicable: 1,
});
assert.deepEqual(exceptionOverlay.summary.sourceHistoricalExecutionStates, {
  explicit_false: 1,
  legacy_unspecified: 1,
});
assert.equal(
  exceptionOverlay.resolutions.every((row) => (
    row.sourceDecisionArtifactSha256 === decisionsArtifact.sha256
    && row.ledgerResolutionAction === 'record_exception'
    && row.runnerContractVersion === 2
  )),
  true,
);
assert.doesNotMatch(JSON.stringify(exceptionOverlay), /"decisionArtifactSha256"/u);

const plan = buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs());
assert.equal(validateQianchuanProductionMigrationLedgerBootstrapPlan(plan), plan);
assert.equal(plan.schemaVersion, 3);
assert.equal(plan.summary.bootstrapPrefixReady, true);
assert.equal(plan.summary.writePlanReady, false);
assert.equal(plan.summary.targetedApplyReady, false);
assert.equal(plan.summary.targetedApplyReadyAfterBootstrap, false);
assert.equal(plan.summary.categories.ledger_eligible, 0);
assert.equal(plan.summary.categories.exception_eligible, 2);
assert.equal(plan.summary.categories.unresolved, records.length - 2);
assert.deepEqual(plan.strictPrefix, { backend: 0, warehouse: 2 });
assert.equal(plan.ledgerRows.length, 2);
assert.equal(plan.ledgerRows.every((row) => (
  row.executionMode === 'exception'
  && row.decisionArtifactSha256 === exceptionOverlayArtifact.sha256
)), true);
assert.equal(plan.summary.runnerExceptionChannelSupported, true);
assert.equal(plan.target.identity, 'warehouse/20260726_1000');
assert.equal(plan.target.predecessorsByCategory.exception_eligible, 2);
assert.deepEqual(plan.blockers.map((value) => value.code), [
  'unresolved_first_migration',
  'reconciliation_not_complete',
]);
assert.equal(plan.architectureOptions.filter((option) => option.status.startsWith('accepted')).length, 1);
assert.deepEqual(plan.outputContract.sqlStatements, []);
assert.deepEqual(plan.outputContract.productionCommands, []);

const eligibleManifest = structuredClone(manifest);
for (const namespace of ['backend', 'warehouse']) {
  const entry = eligibleManifest.entries.find((value) => value.namespace === namespace);
  entry.classification = 'applied_and_verified';
  entry.candidateClassification = 'applied_and_verified';
  entry.executionEvidenceState = 'verified';
  entry.ledgerAction = 'eligible_for_selective_recording';
}
const eligibleManifestArtifact = artifact(eligibleManifest, '/tmp/ledger-bootstrap-eligible-manifest.json');
const eligiblePlan = buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  manifest: eligibleManifest,
  manifestArtifact: eligibleManifestArtifact,
  manifestSha256: eligibleManifestArtifact.sha256,
}));
assert.deepEqual(eligiblePlan.strictPrefix, { backend: 1, warehouse: 2 });
assert.equal(eligiblePlan.ledgerRows.length, 3);
assert.equal(eligiblePlan.summary.writePlanReady, false);

const writeReadyManifest = structuredClone(eligibleManifest);
writeReadyManifest.reconciled = true;
writeReadyManifest.readyForLedgerBootstrap = true;
const writeReadyManifestArtifact = artifact(
  writeReadyManifest,
  '/tmp/ledger-bootstrap-write-ready-manifest.json',
);
const writeReadyPlan = buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  manifest: writeReadyManifest,
  manifestArtifact: writeReadyManifestArtifact,
  manifestSha256: writeReadyManifestArtifact.sha256,
}));
assert.equal(writeReadyPlan.summary.writePlanReady, true);
assert.equal(
  writeReadyPlan.blockers.some((value) => value.code === 'reconciliation_not_complete'),
  false,
);

const targetReadyManifest = structuredClone(manifest);
const targetIndex = targetReadyManifest.entries.findIndex(
  (entry) => `${entry.namespace}/${entry.version}` === 'warehouse/20260726_1000',
);
for (const entry of targetReadyManifest.entries.slice(0, targetIndex)) {
  if (entry.namespace !== 'warehouse') continue;
  entry.classification = 'applied_and_verified';
  entry.candidateClassification = 'applied_and_verified';
  entry.executionEvidenceState = 'verified';
  entry.ledgerAction = 'eligible_for_selective_recording';
}
const targetReadyManifestArtifact = artifact(
  targetReadyManifest,
  '/tmp/ledger-bootstrap-target-ready-manifest.json',
);
const targetReadyPlan = buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  manifest: targetReadyManifest,
  manifestArtifact: targetReadyManifestArtifact,
  manifestSha256: targetReadyManifestArtifact.sha256,
}));
assert.equal(targetReadyPlan.target.predecessorsResolved, true);
assert.equal(targetReadyPlan.summary.targetedApplyReadyAfterBootstrap, true);
assert.equal(targetReadyPlan.summary.targetedApplyReady, false);
assert.equal(targetReadyPlan.strictPrefix.warehouse, targetReadyPlan.target.namespacePosition - 1);
assert.equal(targetReadyPlan.summary.categories.unresolved > 0, true, 'later migrations may remain unresolved');

const duplicateDecisions = structuredClone(decisions);
duplicateDecisions.decisions.push(structuredClone(duplicateDecisions.decisions[0]));
duplicateDecisions.summary.decisions += 1;
duplicateDecisions.summary.ledgerActions.do_not_record += 1;
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  decisions: duplicateDecisions,
})), /duplicate/);

const unsupportedDecisions = structuredClone(decisions);
unsupportedDecisions.decisions[0].decision = 'baseline';
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  decisions: unsupportedDecisions,
})), /unsupported owner decision/);

const checksumDriftDecisions = structuredClone(decisions);
checksumDriftDecisions.decisions[0].checksum = 'f'.repeat(64);
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  decisions: checksumDriftDecisions,
})), /checksum differs/);

const missingSourceDecisions = structuredClone(decisions);
missingSourceDecisions.decisions[0].version = '99999999_9999';
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  decisions: missingSourceDecisions,
})), /no source migration/);

assert.throws(() => buildQianchuanProductionMigrationLedgerExceptionOwnerOverlay({
  decisions,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  generatedAt: GENERATED_AT,
  reviewedAt: OVERLAY_REVIEWED_AT,
  reviewer: 'repository-owner',
}), /confirmation is required/);
assert.throws(() => buildQianchuanProductionMigrationLedgerExceptionOwnerOverlay({
  confirmed: true,
  decisions,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  generatedAt: GENERATED_AT,
  reviewedAt: OVERLAY_REVIEWED_AT,
  reviewer: 'operator',
}), /reviewer must be repository-owner/);
const unspecifiedForwardRepair = structuredClone(decisions);
delete unspecifiedForwardRepair.decisions[1].historicalExecution;
assert.throws(() => buildQianchuanProductionMigrationLedgerExceptionOwnerOverlay({
  confirmed: true,
  decisions: unspecifiedForwardRepair,
  decisionsArtifact,
  decisionsSha256: decisionsArtifact.sha256,
  generatedAt: GENERATED_AT,
  reviewedAt: OVERLAY_REVIEWED_AT,
  reviewer: 'repository-owner',
}), /cannot authorize a v2 exception resolution/);
assert.throws(() => buildQianchuanProductionMigrationLedgerExceptionOwnerOverlay({
  confirmed: true,
  decisions,
  decisionsArtifact,
  decisionsSha256: 'a'.repeat(64),
  generatedAt: GENERATED_AT,
  reviewedAt: OVERLAY_REVIEWED_AT,
  reviewer: 'repository-owner',
}), /SHA-256 differs/);

const missingOverlayResolution = structuredClone(exceptionOverlay);
missingOverlayResolution.resolutions.pop();
missingOverlayResolution.summary.resolutions -= 1;
missingOverlayResolution.summary.ledgerResolutionActions.record_exception -= 1;
missingOverlayResolution.summary.exceptionKinds.forward_repaired -= 1;
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  exceptionOverlay: missingOverlayResolution,
})), /does not exactly re-attest/);

const driftedOverlayResolution = structuredClone(exceptionOverlay);
driftedOverlayResolution.resolutions[0].checksum = 'f'.repeat(64);
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  exceptionOverlay: driftedOverlayResolution,
})), /does not exactly re-attest/);

const selfHashedOverlay = structuredClone(exceptionOverlay);
selfHashedOverlay.overlaySha256 = 'e'.repeat(64);
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  exceptionOverlay: selfHashedOverlay,
})), /must not contain self-hash field/);

const invalidOverlayAction = structuredClone(exceptionOverlay);
invalidOverlayAction.resolutions[0].ledgerResolutionAction = 'baseline';
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  exceptionOverlay: invalidOverlayAction,
})), /does not exactly re-attest/);

const checksumDriftManifest = structuredClone(manifest);
checksumDriftManifest.entries[0].checksum = 'e'.repeat(64);
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  manifest: checksumDriftManifest,
})), /reconciliation checksum differs/);

const pathDriftManifest = structuredClone(manifest);
pathDriftManifest.entries[0].relativePath = 'sql/migrations/drifted.sql';
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  manifest: pathDriftManifest,
})), /source metadata differs/);

assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  manifestSha256: 'a'.repeat(64),
})), /SHA-256 differs/);
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  runnerSources: {
    ...runnerSources,
    ledgerDdl: runnerSources.ledgerDdl.replace(
      "'nontransactional'",
      "'nontransactional', 'exception'",
    ),
  },
})), /execution_mode contract changed/);
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  runnerSources: {
    ...runnerSources,
    ledgerContract: runnerSources.ledgerContract.replace('read-compatible-v2', 'read-compatible-next'),
  },
})), /v2 exception compatibility/);
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  runnerSources: {
    ...runnerSources,
    historyComparator: runnerSources.historyComparator.replace(
      'const expectedRecord = expected[index];',
      'const expectedRecord = expected.find((value) => value.version === row.version);',
    ),
  },
})), /strict filesystem-prefix behavior/);
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  runnerSources: {
    ...runnerSources,
    bootstrapWriter: runnerSources.bootstrapWriter.replaceAll('queryUpperBound', 'queryBudget'),
  },
})), /Stage D contract/);
assert.throws(() => buildQianchuanProductionMigrationLedgerBootstrapPlan(planArgs({
  runnerSources: {
    ...runnerSources,
    ledgerV1ToV2Ddl: runnerSources.ledgerV1ToV2Ddl.replace(
      'ADD COLUMN exception_kind TEXT',
      'ADD COLUMN exception_type TEXT',
    ),
  },
})), /additive upgrade/);

assert.deepEqual(parseQianchuanProductionMigrationLedgerBootstrapPlanArgs([
  '--manifest', '/tmp/manifest.json',
  `--manifest-sha256=${'a'.repeat(64)}`,
  '--decisions=/tmp/decisions.json',
  '--decisions-sha256', 'b'.repeat(64),
  '--exception-overlay=/tmp/exception-overlay.json',
  '--exception-overlay-sha256', 'c'.repeat(64),
  '--output', '/tmp/plan.json',
]), {
  decisionsPath: '/tmp/decisions.json',
  decisionsSha256: 'b'.repeat(64),
  exceptionOverlayPath: '/tmp/exception-overlay.json',
  exceptionOverlaySha256: 'c'.repeat(64),
  help: false,
  manifestPath: '/tmp/manifest.json',
  manifestSha256: 'a'.repeat(64),
  outputPath: '/tmp/plan.json',
});
for (const option of ['--apply', '--baseline', '--deploy', '--execute', '--json', '--write-ledger']) {
  assert.throws(() => parseQianchuanProductionMigrationLedgerBootstrapPlanArgs([option]), /not supported/);
}
assert.throws(() => parseQianchuanProductionMigrationLedgerBootstrapPlanArgs([
  '--manifest', '/tmp/manifest.json',
]), /--decisions is required/);

assert.deepEqual(parseQianchuanProductionMigrationLedgerExceptionOwnerOverlayArgs([
  '--decisions', '/tmp/decisions.json',
  `--decisions-sha256=${'a'.repeat(64)}`,
  '--reviewer', 'repository-owner',
  '--reviewed-at', OVERLAY_REVIEWED_AT,
  '--confirm-ledger-exception-owner-overlay',
  '--output', '/tmp/exception-overlay.json',
]), {
  confirmed: true,
  decisionsPath: '/tmp/decisions.json',
  decisionsSha256: 'a'.repeat(64),
  help: false,
  outputPath: '/tmp/exception-overlay.json',
  reviewedAt: OVERLAY_REVIEWED_AT,
  reviewer: 'repository-owner',
});
assert.throws(() => parseQianchuanProductionMigrationLedgerExceptionOwnerOverlayArgs([
  '--decisions', '/tmp/decisions.json',
]), /--decisions-sha256 is required/);
assert.throws(() => parseQianchuanProductionMigrationLedgerExceptionOwnerOverlayArgs([
  '--write-ledger',
]), /not supported/);

const formatted = formatQianchuanProductionMigrationLedgerBootstrapPlan(plan, {
  path: '/tmp/plan.json',
  bytes: 1000,
  sha256: 'c'.repeat(64),
});
assert.match(formatted, /bootstrap_prefix_ready=true write_plan_ready=false/);
assert.match(formatted, /strict_prefix=backend:0\/warehouse:2 ledger_rows=2/);
assert.match(formatted, /runner_exception_channel=true/);
assert.match(formatted, /schema_writer_v=2 writer_implemented=true/);
assert.doesNotMatch(formatted, /DATABASE_URL|INSERT |CREATE TABLE|ALTER TABLE/iu);

const formattedOverlay = formatQianchuanProductionMigrationLedgerExceptionOwnerOverlay(
  exceptionOverlay,
  { path: '/tmp/exception-overlay.json', bytes: 1000, sha256: 'd'.repeat(64) },
);
assert.match(formattedOverlay, /resolutions=2 record_exception=2/);
assert.match(formattedOverlay, /runner_contract=2 production_writes=false ledger_writes=false/);
assert.match(formattedOverlay, /source_historical_execution=explicit_false:1,legacy_unspecified:1/);
assert.doesNotMatch(formattedOverlay, /INSERT |CREATE TABLE|ALTER TABLE/iu);

for (const sourcePath of [
  ENTRY_PATH,
  OVERLAY_ENTRY_PATH,
  'scripts/lib/migrations/aios-qianchuan-production-migration-ledger-bootstrap-plan-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-ledger-bootstrap-plan.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-ledger-exception-owner-overlay-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-ledger-exception-owner-overlay.mjs',
]) {
  const source = readFileSync(sourcePath, 'utf8');
  assert.doesNotMatch(source, /from ['"]pg['"]|DATABASE_URL|new pg\.Client/iu);
}

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'aios-ledger-bootstrap-plan-'));
try {
  const manifestPath = path.join(temporaryDirectory, 'manifest.json');
  const decisionsPath = path.join(temporaryDirectory, 'decisions.json');
  const exceptionOverlayPath = path.join(temporaryDirectory, 'exception-overlay.json');
  const outputPath = path.join(temporaryDirectory, 'plan.json');
  const manifestFile = writeFixtureJson(manifest, manifestPath);
  const decisionsFile = writeFixtureJson(decisions, decisionsPath);
  const overlayCommandArgs = [
    OVERLAY_ENTRY_PATH,
    '--decisions', decisionsPath,
    '--decisions-sha256', decisionsFile.sha256,
    '--reviewer', 'repository-owner',
    '--reviewed-at', OVERLAY_REVIEWED_AT,
    '--confirm-ledger-exception-owner-overlay',
    '--output', exceptionOverlayPath,
  ];
  const overlayResult = spawnSync(process.execPath, overlayCommandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(overlayResult.status, 0, overlayResult.stderr);
  assert.equal(existsSync(exceptionOverlayPath), true);
  const writtenOverlay = JSON.parse(readFileSync(exceptionOverlayPath, 'utf8'));
  assert.equal(validateQianchuanProductionMigrationLedgerExceptionOwnerOverlay(writtenOverlay, {
    decisions,
    decisionsArtifact: decisionsFile,
    records,
  }), writtenOverlay);
  const writtenOverlayFile = artifact(writtenOverlay, exceptionOverlayPath);
  assert.match(overlayResult.stdout, /artifact=.*exception-overlay\.json bytes=\d+ sha256=[a-f0-9]{64}/u);

  const commandArgs = [
    ENTRY_PATH,
    '--manifest', manifestPath,
    '--manifest-sha256', manifestFile.sha256,
    '--decisions', decisionsPath,
    '--decisions-sha256', decisionsFile.sha256,
    '--exception-overlay', exceptionOverlayPath,
    '--exception-overlay-sha256', writtenOverlayFile.sha256,
    '--output', outputPath,
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(outputPath), true);
  const writtenPlan = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(validateQianchuanProductionMigrationLedgerBootstrapPlan(writtenPlan), writtenPlan);
  assert.match(result.stdout, /artifact=.*plan\.json bytes=\d+ sha256=[a-f0-9]{64}/u);

  const overwrite = spawnSync(process.execPath, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /EEXIST|already exists/iu);

  const overlayOverwrite = spawnSync(process.execPath, overlayCommandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(overlayOverwrite.status, 0);
  assert.match(overlayOverwrite.stderr, /EEXIST|already exists/iu);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log('[qianchuan-production-migration-ledger-bootstrap-plan.behavior] passed');
