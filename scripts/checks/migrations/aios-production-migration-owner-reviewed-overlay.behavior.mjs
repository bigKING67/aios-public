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
  parseAiosProductionMigrationOwnerReviewedOverlayArgs,
} from '../../lib/migrations/aios-production-migration-owner-reviewed-overlay-cli.mjs';
import {
  buildAiosProductionMigrationExceptionDecisions,
  buildAiosProductionMigrationOwnerDecisions,
  buildAiosProductionMigrationReviewedManifest,
  validateAiosProductionMigrationExceptionDecisions,
  validateAiosProductionMigrationOwnerDecisions,
  validateAiosProductionMigrationOwnerReviewSpec,
  validateAiosProductionMigrationReviewedManifest,
} from '../../lib/migrations/aios-production-migration-owner-reviewed-overlay.mjs';
import {
  QIANCHUAN_CUTOVER_TARGET_MIGRATION,
} from '../../lib/migrations/aios-qianchuan-production-cutover-readiness.mjs';

const ENTRY_PATH = 'scripts/checks/migrations/aios-production-migration-owner-reviewed-overlay.mjs';
const REVIEWED_AT = '2026-07-26T01:00:00.000Z';
const SPEC_GENERATED_AT = '2026-07-26T01:01:00.000Z';
const GENERATED_AT = '2026-07-26T01:02:00.000Z';

function artifact(value, artifactPath) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return {
    path: artifactPath,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
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
  const entries = records.map(manifestEntry);
  const namespaces = summarizeAiosMigrations(records);
  const target = entries.find((entry) => (
    entry.namespace === QIANCHUAN_CUTOVER_TARGET_MIGRATION.namespace
    && entry.version === QIANCHUAN_CUTOVER_TARGET_MIGRATION.version
  ));
  assert.ok(target, 'fixture must include the Qianchuan target migration');
  return {
    schemaVersion: 1,
    auditedAt: '2026-07-26T00:00:00.000Z',
    mode: 'live_readonly',
    readOnlyTransaction: true,
    statementTimeoutMs: 15000,
    inventory: {
      total: records.length,
      namespaces: Object.fromEntries(Object.entries(namespaces).map(([namespace, summary]) => [
        namespace,
        { bytes: summary.bytes, modes: summary.modes, total: summary.total },
      ])),
    },
    ledger: {
      exists: false,
      recordedRows: 0,
      historyFailures: [],
      namespaceSummaries: [],
    },
    entries,
    summary: {
      classifications: { unknown: records.length },
      ledgerActions: { withhold_pending_proof: records.length },
      reviewStatuses: { manual_review_required: records.length },
      schemaEvidenceStates: { unprobeable: records.length },
      unknown: records.length,
    },
    reconciled: false,
    readyForLedgerBootstrap: false,
    target,
  };
}

function buildReviewSpec({ appliedRecord, evidenceArtifact, notApplicableRecord }) {
  return {
    schemaVersion: 1,
    generatedAt: SPEC_GENERATED_AT,
    mode: 'offline_owner_review_spec',
    authorization: {
      confirmation: 'accept_reviewed_migration_decisions',
      reviewer: 'repository-owner',
      reviewedAt: REVIEWED_AT,
      source: 'explicit_current_user_authorization',
    },
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      migrationApplyAuthorized: false,
      deployAuthorized: false,
      sourceManifestMutationAuthorized: false,
    },
    sourceArtifacts: { evidencePack: evidenceArtifact },
    decisions: [
      {
        namespace: notApplicableRecord.namespace,
        version: notApplicableRecord.version,
        checksum: notApplicableRecord.checksum,
        decision: 'not_applicable',
        historicalExecution: null,
        rationale: 'Fixture topology does not contain this migration family.',
      },
      {
        namespace: appliedRecord.namespace,
        version: appliedRecord.version,
        checksum: appliedRecord.checksum,
        decision: 'applied_and_verified',
        historicalExecution: true,
        rationale: 'Fixture migration-specific evidence proves historical execution.',
      },
    ],
  };
}

function priorDecision(record, evidenceArtifact) {
  return {
    schemaVersion: 4,
    generatedAt: '2026-07-25T01:00:00.000Z',
    mode: 'offline_owner_review_decisions',
    policy: {
      networkAccess: false,
      productionWritesAuthorized: false,
      ledgerWritesAuthorized: false,
      deployAuthorized: false,
    },
    sourceArtifacts: { fixtureEvidence: evidenceArtifact },
    summary: {
      decisions: 1,
      ledgerActions: { do_not_record: 1 },
    },
    decisions: [{
      namespace: record.namespace,
      version: record.version,
      checksum: record.checksum,
      decision: 'not_applicable',
      reviewStatus: 'verified_not_applicable',
      ledgerAction: 'do_not_record',
      sourceClassification: 'unknown',
      historicalExecution: null,
      rationale: 'Fixture prior topology exception.',
      reviewer: 'repository-owner',
      reviewedAt: '2026-07-25T00:59:00.000Z',
      evidenceLinks: [evidenceArtifact],
    }],
  };
}

function coreFixture(records) {
  const backend = records.filter((record) => record.namespace === 'backend');
  const warehouse = records.filter((record) => record.namespace === 'warehouse');
  assert.ok(backend.length >= 1 && warehouse.length >= 2);
  const manifest = buildManifest(records);
  const evidence = { schemaVersion: 1, mode: 'offline_fixture_evidence' };
  const evidenceArtifact = artifact(evidence, '/tmp/owner-review-evidence.json');
  const reviewSpec = buildReviewSpec({
    appliedRecord: warehouse[0],
    evidenceArtifact,
    notApplicableRecord: backend[0],
  });
  const reviewSpecArtifact = artifact(reviewSpec, '/tmp/owner-review-spec.json');
  const manifestArtifact = artifact(manifest, '/tmp/owner-review-manifest.json');
  const priorDecisions = priorDecision(warehouse[1], evidenceArtifact);
  const priorDecisionsArtifact = artifact(priorDecisions, '/tmp/prior-decisions.json');
  return {
    appliedRecord: warehouse[0],
    evidence,
    evidenceArtifact,
    manifest,
    manifestArtifact,
    notApplicableRecord: backend[0],
    priorDecisions,
    priorDecisionsArtifact,
    reviewSpec,
    reviewSpecArtifact,
  };
}

function buildCoreOutputs(records, fixture) {
  const ownerDecisions = buildAiosProductionMigrationOwnerDecisions({
    evidenceArtifact: fixture.evidenceArtifact,
    evidenceSha256: fixture.evidenceArtifact.sha256,
    generatedAt: GENERATED_AT,
    manifest: fixture.manifest,
    manifestArtifact: fixture.manifestArtifact,
    manifestSha256: fixture.manifestArtifact.sha256,
    records,
    reviewSpec: fixture.reviewSpec,
    reviewSpecArtifact: fixture.reviewSpecArtifact,
    reviewSpecSha256: fixture.reviewSpecArtifact.sha256,
  });
  const ownerDecisionsArtifact = artifact(ownerDecisions, '/tmp/owner-decisions.json');
  const reviewedManifest = buildAiosProductionMigrationReviewedManifest({
    decisions: ownerDecisions,
    decisionsArtifact: ownerDecisionsArtifact,
    decisionsSha256: ownerDecisionsArtifact.sha256,
    generatedAt: GENERATED_AT,
    manifest: fixture.manifest,
    manifestArtifact: fixture.manifestArtifact,
    manifestSha256: fixture.manifestArtifact.sha256,
    records,
  });
  const exceptionDecisions = buildAiosProductionMigrationExceptionDecisions({
    generatedAt: GENERATED_AT,
    manifest: fixture.manifest,
    manifestArtifact: fixture.manifestArtifact,
    ownerDecisions,
    ownerDecisionsArtifact,
    ownerDecisionsSha256: ownerDecisionsArtifact.sha256,
    priorDecisions: fixture.priorDecisions,
    priorDecisionsArtifact: fixture.priorDecisionsArtifact,
    priorDecisionsSha256: fixture.priorDecisionsArtifact.sha256,
    records,
  });
  return {
    exceptionDecisions,
    ownerDecisions,
    ownerDecisionsArtifact,
    reviewedManifest,
  };
}

const records = discoverAiosMigrations({ descriptor: readAiosMigrationDescriptor() });
const fixture = coreFixture(records);
const sourceManifestSnapshot = JSON.stringify(fixture.manifest);
assert.equal(validateAiosProductionMigrationOwnerReviewSpec(fixture.reviewSpec, {
  evidenceArtifact: fixture.evidenceArtifact,
  manifest: fixture.manifest,
  records,
}), fixture.reviewSpec);

const outputs = buildCoreOutputs(records, fixture);
assert.equal(JSON.stringify(fixture.manifest), sourceManifestSnapshot);
assert.equal(outputs.ownerDecisions.authorization.source, 'explicit_current_user_authorization');
assert.deepEqual(outputs.ownerDecisions.summary.decisionsByType, {
  applied_and_verified: 1,
  not_applicable: 1,
});
assert.equal(validateAiosProductionMigrationOwnerDecisions(outputs.ownerDecisions, {
  evidenceArtifact: fixture.evidenceArtifact,
  manifest: fixture.manifest,
  manifestArtifact: fixture.manifestArtifact,
  records,
  reviewSpec: fixture.reviewSpec,
  reviewSpecArtifact: fixture.reviewSpecArtifact,
}), outputs.ownerDecisions);

const notApplicableSource = fixture.manifest.entries.find((entry) => (
  entry.namespace === fixture.notApplicableRecord.namespace
  && entry.version === fixture.notApplicableRecord.version
));
const notApplicableReviewed = outputs.reviewedManifest.entries.find((entry) => (
  entry.namespace === fixture.notApplicableRecord.namespace
  && entry.version === fixture.notApplicableRecord.version
));
const { ownerReview: notApplicableReview, ...notApplicableWithoutReview } = notApplicableReviewed;
assert.deepEqual(notApplicableWithoutReview, notApplicableSource);
assert.equal(notApplicableReview.decision, 'not_applicable');

const appliedReviewed = outputs.reviewedManifest.entries.find((entry) => (
  entry.namespace === fixture.appliedRecord.namespace
  && entry.version === fixture.appliedRecord.version
));
assert.equal(appliedReviewed.classification, 'applied_and_verified');
assert.equal(appliedReviewed.executionEvidenceState, 'owner_reviewed_migration_specific_evidence');
assert.equal(appliedReviewed.ledgerAction, 'eligible_for_selective_recording');
assert.equal(outputs.reviewedManifest.mode, 'live_readonly');
assert.equal(outputs.reviewedManifest.summary.unknown, records.length - 1);
assert.equal(outputs.reviewedManifest.reconciled, false);
assert.equal(outputs.reviewedManifest.readyForLedgerBootstrap, false);
assert.equal(validateAiosProductionMigrationReviewedManifest(outputs.reviewedManifest, {
  decisions: outputs.ownerDecisions,
  decisionsArtifact: outputs.ownerDecisionsArtifact,
  manifest: fixture.manifest,
  manifestArtifact: fixture.manifestArtifact,
  records,
}), outputs.reviewedManifest);

assert.deepEqual(
  outputs.exceptionDecisions.decisions.slice(0, fixture.priorDecisions.decisions.length),
  fixture.priorDecisions.decisions,
);
assert.equal(outputs.exceptionDecisions.decisions.length, 2);
assert.equal(outputs.exceptionDecisions.decisions.some((row) => (
  row.namespace === fixture.appliedRecord.namespace
  && row.version === fixture.appliedRecord.version
)), false);
assert.equal(outputs.exceptionDecisions.decisions.at(-1).decision, 'not_applicable');
assert.equal(validateAiosProductionMigrationExceptionDecisions(outputs.exceptionDecisions, {
  manifest: fixture.manifest,
  ownerDecisions: outputs.ownerDecisions,
  ownerDecisionsArtifact: outputs.ownerDecisionsArtifact,
  priorDecisions: fixture.priorDecisions,
  priorDecisionsArtifact: fixture.priorDecisionsArtifact,
  records,
}), outputs.exceptionDecisions);

const invalidApplied = structuredClone(fixture.reviewSpec);
invalidApplied.decisions[1].historicalExecution = false;
assert.throws(
  () => validateAiosProductionMigrationOwnerReviewSpec(invalidApplied),
  /applied_and_verified requires historicalExecution=true/u,
);
const invalidNotApplicable = structuredClone(fixture.reviewSpec);
invalidNotApplicable.decisions[0].historicalExecution = true;
assert.throws(
  () => validateAiosProductionMigrationOwnerReviewSpec(invalidNotApplicable),
  /not_applicable cannot claim historical execution/u,
);
const duplicateSpec = structuredClone(fixture.reviewSpec);
duplicateSpec.decisions.push(structuredClone(duplicateSpec.decisions[0]));
assert.throws(
  () => validateAiosProductionMigrationOwnerReviewSpec(duplicateSpec),
  /contains duplicate/u,
);
const checksumDriftSpec = structuredClone(fixture.reviewSpec);
checksumDriftSpec.decisions[0].checksum = 'a'.repeat(64);
assert.throws(
  () => validateAiosProductionMigrationOwnerReviewSpec(checksumDriftSpec, {
    manifest: fixture.manifest,
    records,
  }),
  /differs from the pinned reconciliation manifest/u,
);
const repositoryDrift = structuredClone(records);
const driftedRecord = repositoryDrift.find((record) => (
  record.namespace === fixture.notApplicableRecord.namespace
  && record.version === fixture.notApplicableRecord.version
));
driftedRecord.checksum = 'b'.repeat(64);
assert.throws(
  () => validateAiosProductionMigrationOwnerReviewSpec(fixture.reviewSpec, {
    manifest: fixture.manifest,
    records: repositoryDrift,
  }),
  /differs from the current repository inventory/u,
);
assert.throws(
  () => validateAiosProductionMigrationOwnerReviewSpec(fixture.reviewSpec, {
    evidenceArtifact: { ...fixture.evidenceArtifact, sha256: 'c'.repeat(64) },
  }),
  /evidence pack differs from the explicit pin/u,
);

const duplicateOwnerDecisions = structuredClone(outputs.ownerDecisions);
duplicateOwnerDecisions.decisions.push(structuredClone(duplicateOwnerDecisions.decisions[0]));
assert.throws(
  () => validateAiosProductionMigrationOwnerDecisions(duplicateOwnerDecisions),
  /contain duplicate/u,
);
const unauthorizedManifestMutation = structuredClone(outputs.reviewedManifest);
const untouchedEntry = unauthorizedManifestMutation.entries.find((entry) => (
  entry.namespace === 'warehouse'
  && entry.version !== fixture.appliedRecord.version
));
untouchedEntry.rationale = 'Unauthorized fixture mutation.';
assert.throws(
  () => validateAiosProductionMigrationReviewedManifest(unauthorizedManifestMutation, {
    decisions: outputs.ownerDecisions,
    decisionsArtifact: outputs.ownerDecisionsArtifact,
    manifest: fixture.manifest,
    manifestArtifact: fixture.manifestArtifact,
    records,
  }),
  /reviewed manifest mutation is not authorized/u,
);
const invalidSummary = structuredClone(outputs.reviewedManifest);
invalidSummary.summary.unknown += 1;
assert.throws(
  () => validateAiosProductionMigrationReviewedManifest(invalidSummary),
  /summary or readiness is inconsistent/u,
);

const duplicatePriorDecisions = priorDecision(fixture.notApplicableRecord, fixture.evidenceArtifact);
const duplicatePriorArtifact = artifact(duplicatePriorDecisions, '/tmp/duplicate-prior.json');
assert.throws(
  () => buildAiosProductionMigrationExceptionDecisions({
    generatedAt: GENERATED_AT,
    manifest: fixture.manifest,
    manifestArtifact: fixture.manifestArtifact,
    ownerDecisions: outputs.ownerDecisions,
    ownerDecisionsArtifact: outputs.ownerDecisionsArtifact,
    ownerDecisionsSha256: outputs.ownerDecisionsArtifact.sha256,
    priorDecisions: duplicatePriorDecisions,
    priorDecisionsArtifact: duplicatePriorArtifact,
    priorDecisionsSha256: duplicatePriorArtifact.sha256,
    records,
  }),
  /Merged exception decisions contain duplicate/u,
);

const requiredCliArgs = [
  '--manifest', '/tmp/manifest.json',
  '--manifest-sha256', 'a'.repeat(64),
  '--evidence', '/tmp/evidence.json',
  '--evidence-sha256', 'b'.repeat(64),
  '--review-spec', '/tmp/review-spec.json',
  '--review-spec-sha256', 'c'.repeat(64),
  '--prior-exception-decisions', '/tmp/prior.json',
  '--prior-exception-decisions-sha256', 'd'.repeat(64),
  '--owner-decisions-output', '/tmp/owner.json',
  '--reviewed-manifest-output', '/tmp/reviewed.json',
  '--exception-decisions-output', '/tmp/exceptions.json',
  '--confirm-owner-review',
];
assert.equal(
  parseAiosProductionMigrationOwnerReviewedOverlayArgs(requiredCliArgs).confirmed,
  true,
);
assert.throws(
  () => parseAiosProductionMigrationOwnerReviewedOverlayArgs(
    requiredCliArgs.map((value) => (value === '/tmp/reviewed.json' ? '/tmp/owner.json' : value)),
  ),
  /output paths must be distinct/u,
);
for (const blockedOption of [
  '--apply',
  '--baseline',
  '--commit',
  '--deploy',
  '--push',
  '--write-ledger',
]) {
  assert.throws(
    () => parseAiosProductionMigrationOwnerReviewedOverlayArgs([blockedOption]),
    /is not supported by the offline owner-review overlay/u,
  );
}

const commandSources = [
  ENTRY_PATH,
  'scripts/lib/migrations/aios-production-migration-owner-reviewed-overlay-cli.mjs',
  'scripts/lib/migrations/aios-production-migration-owner-reviewed-overlay.mjs',
].map((sourcePath) => readFileSync(sourcePath, 'utf8')).join('\n');
assert.doesNotMatch(commandSources, /from ['"]pg['"]/u);
assert.doesNotMatch(commandSources, /\bDATABASE_URL\b/u);
assert.doesNotMatch(commandSources, /aios-migration-ledger-bootstrap-writer/u);
assert.doesNotMatch(commandSources, /buildAiosMigrationLedgerBootstrapSql/u);
assert.doesNotMatch(commandSources, /node:child_process/u);

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'aios-owner-review-overlay-'));
try {
  const manifestPath = path.join(temporaryDirectory, 'manifest.json');
  const evidencePath = path.join(temporaryDirectory, 'evidence.json');
  const reviewSpecPath = path.join(temporaryDirectory, 'review-spec.json');
  const priorPath = path.join(temporaryDirectory, 'prior.json');
  const ownerOutputPath = path.join(temporaryDirectory, 'owner-output.json');
  const reviewedOutputPath = path.join(temporaryDirectory, 'reviewed-output.json');
  const exceptionOutputPath = path.join(temporaryDirectory, 'exception-output.json');
  const manifestFile = writeFixtureJson(fixture.manifest, manifestPath);
  const evidenceFile = writeFixtureJson(fixture.evidence, evidencePath);
  const cliReviewSpec = buildReviewSpec({
    appliedRecord: fixture.appliedRecord,
    evidenceArtifact: evidenceFile,
    notApplicableRecord: fixture.notApplicableRecord,
  });
  const reviewSpecFile = writeFixtureJson(cliReviewSpec, reviewSpecPath);
  const cliPriorDecisions = priorDecision(
    records.filter((record) => record.namespace === 'warehouse')[1],
    evidenceFile,
  );
  const priorFile = writeFixtureJson(cliPriorDecisions, priorPath);
  const cliArgs = [
    ENTRY_PATH,
    '--manifest', manifestPath,
    '--manifest-sha256', manifestFile.sha256,
    '--evidence', evidencePath,
    '--evidence-sha256', evidenceFile.sha256,
    '--review-spec', reviewSpecPath,
    '--review-spec-sha256', reviewSpecFile.sha256,
    '--prior-exception-decisions', priorPath,
    '--prior-exception-decisions-sha256', priorFile.sha256,
    '--owner-decisions-output', ownerOutputPath,
    '--reviewed-manifest-output', reviewedOutputPath,
    '--exception-decisions-output', exceptionOutputPath,
  ];
  const missingConfirmation = spawnSync(process.execPath, cliArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(missingConfirmation.status, 0);
  assert.match(missingConfirmation.stderr, /--confirm-owner-review is required/u);
  assert.equal(existsSync(ownerOutputPath), false);

  const sourceManifestFileSnapshot = readFileSync(manifestPath, 'utf8');
  const cliResult = spawnSync(process.execPath, [...cliArgs, '--confirm-owner-review'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.match(cliResult.stdout, /database_access=false sql_generated=false ledger_writes=false/u);
  assert.equal(readFileSync(manifestPath, 'utf8'), sourceManifestFileSnapshot);
  for (const outputPath of [ownerOutputPath, reviewedOutputPath, exceptionOutputPath]) {
    assert.equal(existsSync(outputPath), true);
  }
  assert.equal(
    JSON.parse(readFileSync(ownerOutputPath, 'utf8')).authorization.source,
    'explicit_current_user_authorization',
  );
  assert.equal(JSON.parse(readFileSync(reviewedOutputPath, 'utf8')).mode, 'live_readonly');
  assert.equal(JSON.parse(readFileSync(exceptionOutputPath, 'utf8')).summary.decisions, 2);

  const overwrite = spawnSync(process.execPath, [...cliArgs, '--confirm-owner-review'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /refuses to overwrite/u);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(
  '[aios-production-migration-owner-reviewed-overlay.behavior] OK: repository-pinned '
  + 'owner decisions, immutable reviewed manifest, exception merge, offline CLI, and exclusive '
  + 'outputs passed.',
);
