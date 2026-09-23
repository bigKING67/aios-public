#!/usr/bin/env node

import {
  applyWorkspaceCleanup,
  auditBackendCargoGovernance,
  auditWorkspace,
  BACKEND_CARGO_WRAPPER,
  CANONICAL_CARGO_TARGET,
  CARGO_CACHE_POLICY,
  CANONICAL_BACKEND_BINARY,
  formatWorkspaceDoctorReport,
  LEGACY_BACKEND_BINARY,
  parseWorkspaceDoctorArgs,
  REQUIRED_CANONICAL_BACKEND_BINARY_CONSUMERS,
  REQUIRED_TRANSITIONAL_BACKEND_BINARY_DISCOVERY,
  REQUIRED_WRAPPED_BACKEND_ENTRYPOINTS,
} from '../../lib/repo/workspace-doctor-core.mjs';
import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';

const {
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('workspace-doctor-behavior');

function assertThrows(callback, message) {
  let thrown = false;
  try {
    callback();
  } catch {
    thrown = true;
  }
  assertTrue(thrown, message);
}

const wrapperContent = `export CARGO_TARGET_DIR="${CANONICAL_CARGO_TARGET}"`;
const wrappedScripts = {
  'verify:backend:check': `bash ${BACKEND_CARGO_WRAPPER} check`,
  'verify:backend:clippy': `bash ${BACKEND_CARGO_WRAPPER} clippy`,
  'verify:backend:fmt': `bash ${BACKEND_CARGO_WRAPPER} fmt --check`,
  'verify:backend:test': `bash ${BACKEND_CARGO_WRAPPER} test`,
};
const wrappedEntrypoint = REQUIRED_WRAPPED_BACKEND_ENTRYPOINTS[0];
const transitionalBinaryDiscovery = REQUIRED_TRANSITIONAL_BACKEND_BINARY_DISCOVERY[0];
const governedBackendFileContents = {
  ...Object.fromEntries(REQUIRED_CANONICAL_BACKEND_BINARY_CONSUMERS.map((file) => [
    file, `const backendBinary = '${CANONICAL_BACKEND_BINARY}';`,
  ])),
  [transitionalBinaryDiscovery]: `${CANONICAL_BACKEND_BINARY}\n${LEGACY_BACKEND_BINARY}`,
  [wrappedEntrypoint]: `exec bash "${BACKEND_CARGO_WRAPPER}" run --bin aios-backend-rust`,
};
const runtimeCandidate = {
  absolutePath: '/fixture/.trellis/.runtime/update-check-old.marker',
  bytes: 4,
  file: '.trellis/.runtime/update-check-old.marker',
  mtimeMs: 1,
};
const trellisRuntime = {
  candidateBytes: 4,
  candidates: [runtimeCandidate],
  cutoffMs: 2,
  errors: [],
  protectedBytes: 0,
  protectedFiles: [],
  retentionDays: 30,
  scannedBytes: 4,
  scannedCount: 1,
};
const presentPaths = new Set([
  '.git-commit-checklist.md',
  '.trellis/workspace/Codex CLI/index.md',
  CANONICAL_CARGO_TARGET,
  'backend-rust/target',
]);
const audit = auditWorkspace('/fixture', {
  packageJson: { scripts: wrappedScripts },
  pathExists: (file) => presentPaths.has(file),
  pathSizeBytes: (file) => (file === CANONICAL_CARGO_TARGET ? 8192 : 4096),
  specEntries: [{ content: '# fixture\n', file: '.trellis/spec/repo/fixture.md' }],
  trackedFiles: [
    '.trellis/workspace/Codex CLI/index.md',
    '.trellis/workspace/Codex CLI/journal-removed.md',
    '.trellis/workspace/Codex CLI/qianchuan-analysis-plan-polish-route.json',
  ],
  trellisRuntime,
  governedBackendFileContents,
  wrapperContent,
});

assertEqual(audit.obsoleteRootArtifacts.length, 1, 'obsolete root artifacts should be detected');
assertEqual(audit.trackedHistoryPresent.length, 1, 'present tracked workspace history should be detected');
assertEqual(audit.trackedHistoryPendingDeletion.length, 1, 'deleted tracked history should be reported separately');
assertTrue(audit.cargoTargets.canonical.present, 'canonical Cargo target should be observed');
assertEqual(audit.cargoTargets.canonical.bytes, 8192, 'canonical Cargo target bytes should be measured');
assertTrue(audit.cargoTargets.legacy.present, 'legacy Cargo target should be observed');
assertEqual(audit.cargoTargets.legacy.bytes, 4096, 'legacy Cargo target bytes should be measured');
assertIncludes(
  audit.findings.map(({ kind }) => kind).join('\n'),
  'legacy-cargo-target-present',
  'legacy Cargo target presence should be a doctor finding',
);
assertIncludes(formatWorkspaceDoctorReport(audit, { previewCount: 1 }), '... +', 'doctor previews should be bounded');
assertIncludes(formatWorkspaceDoctorReport(audit), 'read-only audit complete', 'default report should state dry-run behavior');
assertIncludes(formatWorkspaceDoctorReport(audit), 'bytes=8192', 'doctor should report canonical Cargo bytes');
assertIncludes(formatWorkspaceDoctorReport(audit), 'bytes=4096', 'doctor should report legacy Cargo bytes');
assertIncludes(formatWorkspaceDoctorReport(audit), 'overBudget=false', 'small caches should be under budget');
const overBudgetAudit = {
  ...audit,
  cargoTargets: {
    ...audit.cargoTargets,
    canonical: { ...audit.cargoTargets.canonical,
      bytes: CARGO_CACHE_POLICY.totalBudgetBytes + 1,
      incrementalBytes: CARGO_CACHE_POLICY.incrementalBudgetBytes + 1 },
  },
};
assertIncludes(formatWorkspaceDoctorReport(overBudgetAudit), 'overBudget=true', 'oversized caches should warn');

const oversizedSpecAudit = auditWorkspace('/fixture', {
  packageJson: { scripts: wrappedScripts },
  pathExists: () => false,
  specEntries: [{
    content: `${'x'.repeat(5001)}\n`,
    file: '.trellis/spec/repo/oversized.md',
  }],
  trackedFiles: [],
  trellisRuntime: {
    ...trellisRuntime,
    candidateBytes: 0,
    candidates: [],
    scannedBytes: 0,
    scannedCount: 0,
  },
  governedBackendFileContents,
  wrapperContent,
});
const oversizedSpecReport = formatWorkspaceDoctorReport(oversizedSpecAudit);
assertIncludes(
  oversizedSpecAudit.findings.map(({ kind }) => kind).join('\n'),
  'trellis-spec-compact',
  'doctor should reuse the production compactness audit for per-file failures',
);
assertIncludes(
  oversizedSpecReport,
  '.trellis/spec/repo/oversized.md',
  'doctor should report the concrete oversized spec path',
);
assertIncludes(
  oversizedSpecReport,
  'file-size-budget',
  'doctor should preserve the compactness finding kind',
);
assertIncludes(
  oversizedSpecReport,
  'compactFindings=1',
  'doctor summary should expose the compactness finding count',
);

const removed = [];
const applyResult = applyWorkspaceCleanup(audit, {
  removeFile: (file) => removed.push(file),
  statFile: () => ({
    isFile: () => true,
    isSymbolicLink: () => false,
    mtimeMs: runtimeCandidate.mtimeMs,
  }),
});
assertEqual(applyResult.trellisRuntime.deleted.length, 1, 'apply should delegate audited runtime candidates');
assertEqual(removed[0], runtimeCandidate.absolutePath, 'apply should remove only the runtime candidate');
assertNotIncludes(removed.join('\n'), '.cache/', 'apply must not remove cache paths');
assertNotIncludes(removed.join('\n'), 'backend-rust/target', 'apply must not remove Cargo targets');

assertTrue(parseWorkspaceDoctorArgs([]).apply === false, 'doctor should default to dry-run');
assertTrue(parseWorkspaceDoctorArgs(['--apply']).apply, 'apply must be explicit');
assertEqual(parseWorkspaceDoctorArgs(['--retention-days', '45']).retentionDays, 45, 'retention should parse');
assertThrows(() => parseWorkspaceDoctorArgs(['--unknown']), 'unknown arguments should fail closed');

assertEqual(
  auditBackendCargoGovernance(wrappedScripts, wrapperContent, governedBackendFileContents).findings.length,
  0,
  'wrapped backend gates and governed runtime files should pass',
);
assertIncludes(
  auditBackendCargoGovernance(
    { ...wrappedScripts, 'verify:backend:test': 'cargo test' },
    wrapperContent,
    governedBackendFileContents,
  )
    .findings.map(({ kind }) => kind).join('\n'),
  'direct-cargo-package-script',
  'direct Cargo package scripts should fail',
);
assertIncludes(
  auditBackendCargoGovernance(
    { ...wrappedScripts, 'verify:backend:test': 'RUSTFLAGS="-D warnings" cargo test' },
    wrapperContent,
    governedBackendFileContents,
  )
    .findings.map(({ kind }) => kind).join('\n'),
  'direct-cargo-package-script',
  'env-prefixed direct Cargo package scripts should fail',
);
assertIncludes(
  auditBackendCargoGovernance(wrappedScripts, wrapperContent, {
    ...governedBackendFileContents,
    [wrappedEntrypoint]: 'cargo run --bin aios-backend-rust',
  }).findings.map(({ kind }) => kind).join('\n'),
  'direct-cargo-entrypoint',
  'direct Cargo runtime entrypoints should fail',
);
assertIncludes(
  auditBackendCargoGovernance(wrappedScripts, wrapperContent, {
    ...governedBackendFileContents,
    [wrappedEntrypoint]: 'printf "cargo run fixture only\\n"',
  }).findings.map(({ kind }) => kind).join('\n'),
  'backend-entrypoint-bypasses-wrapper',
  'runtime entrypoints that omit the wrapper should fail without scanning fixture text broadly',
);
assertIncludes(
  auditBackendCargoGovernance(wrappedScripts, wrapperContent, {
    ...governedBackendFileContents,
    [wrappedEntrypoint]: `bash "${BACKEND_CARGO_WRAPPER}" run --bin aios-backend-rust`,
  }).findings.map(({ kind }) => kind).join('\n'),
  'backend-entrypoint-must-exec-wrapper',
  'runtime entrypoints must exec the wrapper so signals and exit status are preserved',
);
// Agent UI fixture retirement leaves no direct binary consumers. Exercise every
// declared consumer, without inventing an undefined file when the list is empty.
for (const canonicalBinaryConsumer of REQUIRED_CANONICAL_BACKEND_BINARY_CONSUMERS) {
  assertIncludes(
    auditBackendCargoGovernance(wrappedScripts, wrapperContent, {
      ...governedBackendFileContents,
      [canonicalBinaryConsumer]: `const backendBinary = '${LEGACY_BACKEND_BINARY}';`,
    }).findings.map(({ kind }) => kind).join('\n'),
    'legacy-backend-binary',
    'legacy runtime binary consumers should fail',
  );
}
assertIncludes(
  auditBackendCargoGovernance(wrappedScripts, wrapperContent, {
    ...governedBackendFileContents,
    [transitionalBinaryDiscovery]: LEGACY_BACKEND_BINARY,
  }).findings.map(({ kind }) => kind).join('\n'),
  'backend-binary-discovery-drift',
  'process discovery must retain canonical and legacy target recognition during transition',
);

reportOk('dry-run byte reporting, bounded previews, full spec audit, tracked history, runtime-only deletion, and governed Cargo entrypoint drift are covered.');
