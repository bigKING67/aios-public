import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyTrellisRuntimeCleanup,
  auditTrellisRuntime,
  DEFAULT_TRELLIS_RUNTIME_PREVIEW_COUNT,
  DEFAULT_TRELLIS_RUNTIME_RETENTION_DAYS,
  formatTrellisRuntimeReport,
  MAX_TRELLIS_RUNTIME_RETENTION_DAYS,
} from './trellis-runtime-hygiene-core.mjs';
import {
  auditTrellisSpecFiles,
  listTrellisSpecMarkdownFiles,
  summarizeTrellisSpecFiles,
} from './trellis-spec-compact-core.mjs';

export const OBSOLETE_ROOT_ARTIFACTS = Object.freeze([
  '.git-commit-checklist.md',
  'INTEGRATION_TEST_PHASE1.sh',
]);
export const CANONICAL_CARGO_TARGET = '.cache/cargo-target/backend-rust';
export const CARGO_CACHE_POLICY = Object.freeze(JSON.parse(fs.readFileSync(
  new URL('../../config/backend-cargo-cache.json', import.meta.url), 'utf8',
)));
export const LEGACY_CARGO_TARGET = 'backend-rust/target';
export const BACKEND_CARGO_WRAPPER = 'scripts/backend-rust/cargo-with-cache.sh';
export const CANONICAL_BACKEND_BINARY = `${CANONICAL_CARGO_TARGET}/debug/aios-backend-rust`;
export const LEGACY_BACKEND_BINARY = `${LEGACY_CARGO_TARGET}/debug/aios-backend-rust`;
export const REQUIRED_WRAPPED_BACKEND_GATES = Object.freeze([
  'verify:backend:fmt',
  'verify:backend:check',
  'verify:backend:test',
  'verify:backend:clippy',
]);
export const REQUIRED_WRAPPED_BACKEND_ENTRYPOINTS = Object.freeze([
  'scripts/dev/start-backend.sh',
]);
export const REQUIRED_CANONICAL_BACKEND_BINARY_CONSUMERS = Object.freeze([
]);
export const REQUIRED_TRANSITIONAL_BACKEND_BINARY_DISCOVERY = Object.freeze([
  'scripts/lib/deploy/aios-service-processes.sh',
]);
export const BACKEND_CARGO_GOVERNED_FILES = Object.freeze([
  ...REQUIRED_WRAPPED_BACKEND_ENTRYPOINTS,
  ...REQUIRED_CANONICAL_BACKEND_BINARY_CONSUMERS,
  ...REQUIRED_TRANSITIONAL_BACKEND_BINARY_DISCOVERY,
]);

const DIRECT_CARGO_COMMAND_PATTERN = /(?:^|[\n;|]|&&|\|\|)\s*(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*cargo\s+(?:build|check|clippy|fmt|run|test)(?:\s|$)/u;
const LEGACY_WORKSPACE_HISTORY_PATTERN = /^\.trellis\/workspace\/(?:.+\/)?(?:index|journal-[^/]+)\.md$/u;

function toPosix(value) {
  return String(value).replace(/\\/gu, '/');
}

function listTrackedFiles(repoRoot) {
  return execFileSync('git', ['ls-files', '-z', '--cached'], {
    cwd: repoRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(toPosix)
    .sort();
}

function readSpecEntries(repoRoot) {
  return listTrellisSpecMarkdownFiles(repoRoot).map((file) => ({
    content: fs.readFileSync(path.join(repoRoot, file), 'utf8'),
    file,
  }));
}

export function readBackendCargoGovernedFileContents(repoRoot) {
  return Object.fromEntries(BACKEND_CARGO_GOVERNED_FILES.map((file) => [
    file,
    fs.readFileSync(path.join(repoRoot, file), 'utf8'),
  ]));
}

function measurePathBytes(repoRoot, file) {
  const output = execFileSync('du', ['-sk', path.join(repoRoot, file)], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const match = /^\s*(\d+)/u.exec(output);
  if (!match) {
    throw new Error(`unable to parse disk usage for ${file}`);
  }
  return Number.parseInt(match[1], 10) * 1024;
}

function finding(kind, detail) {
  return { detail, kind };
}

export function auditBackendCargoGovernance(packageScripts, wrapperContent, governedFileContents) {
  const findings = [];

  for (const gate of REQUIRED_WRAPPED_BACKEND_GATES) {
    const command = packageScripts?.[gate];
    if (typeof command !== 'string') {
      findings.push(finding('missing-backend-gate', `${gate} is missing from package scripts`));
      continue;
    }
    if (!command.includes(BACKEND_CARGO_WRAPPER)) {
      findings.push(finding('backend-gate-bypasses-wrapper', `${gate} must call ${BACKEND_CARGO_WRAPPER}`));
    }
  }

  for (const [name, command] of Object.entries(packageScripts ?? {})) {
    if (typeof command === 'string' && DIRECT_CARGO_COMMAND_PATTERN.test(command)) {
      findings.push(finding('direct-cargo-package-script', `${name} invokes Cargo directly`));
    }
  }

  for (const file of REQUIRED_WRAPPED_BACKEND_ENTRYPOINTS) {
    const content = governedFileContents?.[file];
    if (typeof content !== 'string') {
      findings.push(finding('missing-cargo-entrypoint', file));
      continue;
    }
    if (!content.includes(BACKEND_CARGO_WRAPPER)) {
      findings.push(finding('backend-entrypoint-bypasses-wrapper', `${file} must call ${BACKEND_CARGO_WRAPPER}`));
    }
    if (!/(?:^|\n)\s*exec\s+(?:bash\s+)?[^\n]*scripts\/backend-rust\/cargo-with-cache\.sh/u.test(content)) {
      findings.push(finding('backend-entrypoint-must-exec-wrapper', `${file} must exec the Cargo wrapper`));
    }
    if (DIRECT_CARGO_COMMAND_PATTERN.test(content)) {
      findings.push(finding('direct-cargo-entrypoint', `${file} invokes Cargo directly`));
    }
  }

  for (const file of REQUIRED_CANONICAL_BACKEND_BINARY_CONSUMERS) {
    const content = governedFileContents?.[file];
    if (typeof content !== 'string') {
      findings.push(finding('missing-backend-binary-consumer', file));
      continue;
    }
    if (!content.includes(CANONICAL_BACKEND_BINARY)) {
      findings.push(finding('noncanonical-backend-binary', `${file} must use ${CANONICAL_BACKEND_BINARY}`));
    }
    if (content.includes(LEGACY_BACKEND_BINARY)) {
      findings.push(finding('legacy-backend-binary', `${file} must not use ${LEGACY_BACKEND_BINARY}`));
    }
  }

  for (const file of REQUIRED_TRANSITIONAL_BACKEND_BINARY_DISCOVERY) {
    const content = governedFileContents?.[file];
    if (typeof content !== 'string') {
      findings.push(finding('missing-backend-binary-discovery', file));
      continue;
    }
    for (const binary of [CANONICAL_BACKEND_BINARY, LEGACY_BACKEND_BINARY]) {
      if (!content.includes(binary)) {
        findings.push(finding('backend-binary-discovery-drift', `${file} must recognize ${binary}`));
      }
    }
  }

  if (!wrapperContent.includes('CARGO_TARGET_DIR') || !wrapperContent.includes(CANONICAL_CARGO_TARGET)) {
    findings.push(finding(
      'cargo-target-contract',
      `${BACKEND_CARGO_WRAPPER} must default CARGO_TARGET_DIR to ${CANONICAL_CARGO_TARGET}`,
    ));
  }

  return {
    checkedBinaryConsumerCount: REQUIRED_CANONICAL_BACKEND_BINARY_CONSUMERS.length,
    checkedBinaryDiscoveryCount: REQUIRED_TRANSITIONAL_BACKEND_BINARY_DISCOVERY.length,
    checkedEntrypointCount: REQUIRED_WRAPPED_BACKEND_ENTRYPOINTS.length,
    checkedGateCount: REQUIRED_WRAPPED_BACKEND_GATES.length,
    findings,
  };
}

export function auditWorkspace(repoRoot, options = {}) {
  const pathExists = options.pathExists ?? ((file) => fs.existsSync(path.join(repoRoot, file)));
  const trackedFiles = options.trackedFiles ?? listTrackedFiles(repoRoot);
  const specEntries = options.specEntries ?? readSpecEntries(repoRoot);
  const packageJson = options.packageJson
    ?? JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const wrapperContent = options.wrapperContent
    ?? fs.readFileSync(path.join(repoRoot, BACKEND_CARGO_WRAPPER), 'utf8');
  const governedBackendFileContents = options.governedBackendFileContents
    ?? readBackendCargoGovernedFileContents(repoRoot);
  const pathSizeBytes = options.pathSizeBytes ?? ((file) => measurePathBytes(repoRoot, file));
  const trellisRuntime = options.trellisRuntime ?? auditTrellisRuntime(repoRoot, {
    retentionDays: options.retentionDays ?? DEFAULT_TRELLIS_RUNTIME_RETENTION_DAYS,
  });
  const specFindings = auditTrellisSpecFiles(specEntries);
  const specSummary = summarizeTrellisSpecFiles(specEntries);
  const obsoleteRootArtifacts = OBSOLETE_ROOT_ARTIFACTS.filter(pathExists);
  const trackedHistory = trackedFiles.filter((file) => LEGACY_WORKSPACE_HISTORY_PATTERN.test(file));
  const trackedHistoryPresent = trackedHistory.filter(pathExists);
  const trackedHistoryPendingDeletion = trackedHistory.filter((file) => !pathExists(file));
  const cargo = auditBackendCargoGovernance(
    packageJson.scripts,
    wrapperContent,
    governedBackendFileContents,
  );
  const canonicalTargetPresent = pathExists(CANONICAL_CARGO_TARGET);
  const legacyTargetPresent = pathExists(LEGACY_CARGO_TARGET);
  const cargoTargets = {
    canonical: {
      bytes: canonicalTargetPresent ? pathSizeBytes(CANONICAL_CARGO_TARGET) : 0,
      incrementalBytes: pathExists(`${CANONICAL_CARGO_TARGET}/debug/incremental`)
        ? pathSizeBytes(`${CANONICAL_CARGO_TARGET}/debug/incremental`) : 0,
      file: CANONICAL_CARGO_TARGET,
      present: canonicalTargetPresent,
    },
    legacy: {
      bytes: legacyTargetPresent ? pathSizeBytes(LEGACY_CARGO_TARGET) : 0,
      file: LEGACY_CARGO_TARGET,
      present: legacyTargetPresent,
    },
  };
  const findings = [
    ...obsoleteRootArtifacts.map((file) => finding('obsolete-root-artifact', file)),
    ...trackedHistoryPresent.map((file) => finding('tracked-workspace-history', file)),
    ...cargo.findings,
    ...(cargoTargets.legacy.present
      ? [finding('legacy-cargo-target-present', `${LEGACY_CARGO_TARGET} uses ${cargoTargets.legacy.bytes} bytes`)]
      : []),
    ...specFindings.map((item) => finding(
      'trellis-spec-compact',
      `${item.file}${item.line ? `:${item.line}` : ''}: ${item.kind}: ${item.reason}`,
    )),
    ...trellisRuntime.errors.map(({ file, reason }) => finding('trellis-runtime-audit', `${file}: ${reason}`)),
  ];

  return {
    cargo,
    cargoTargets,
    findings,
    obsoleteRootArtifacts,
    specFindings,
    specSummary,
    trackedHistoryPendingDeletion,
    trackedHistoryPresent,
    trellisRuntime,
  };
}

function preview(items, previewCount, render = (item) => item) {
  const visible = items.slice(0, previewCount).map(render).join(', ');
  return items.length > previewCount ? `${visible}, ... +${items.length - previewCount} more` : visible;
}

export function applyWorkspaceCleanup(audit, options = {}) {
  return {
    trellisRuntime: applyTrellisRuntimeCleanup(audit.trellisRuntime, options),
  };
}

export function formatWorkspaceDoctorReport(audit, options = {}) {
  const applyResult = options.applyResult ?? null;
  const previewCount = options.previewCount ?? DEFAULT_TRELLIS_RUNTIME_PREVIEW_COUNT;
  const mode = applyResult ? 'apply' : 'dry-run';
  const lines = [
    `[workspace-doctor] mode=${mode} findings=${audit.findings.length}`,
    `[workspace-doctor] obsoleteRoot=${audit.obsoleteRootArtifacts.length} trackedHistoryPresent=${audit.trackedHistoryPresent.length} trackedHistoryPendingDeletion=${audit.trackedHistoryPendingDeletion.length}`,
    `[workspace-doctor] specs=${audit.specSummary.fileCount} bytes=${audit.specSummary.totalBytes}/${audit.specSummary.hardBudgetBytes} headroom=${audit.specSummary.headroomBytes} compactFindings=${audit.specFindings.length}`,
    `[workspace-doctor] cargo canonical=${audit.cargoTargets.canonical.file} present=${audit.cargoTargets.canonical.present} bytes=${audit.cargoTargets.canonical.bytes} legacy=${audit.cargoTargets.legacy.file} present=${audit.cargoTargets.legacy.present} bytes=${audit.cargoTargets.legacy.bytes} wrappedGates=${audit.cargo.checkedGateCount} wrappedEntrypoints=${audit.cargo.checkedEntrypointCount} binaryConsumers=${audit.cargo.checkedBinaryConsumerCount} binaryDiscovery=${audit.cargo.checkedBinaryDiscoveryCount} cargoFindings=${audit.cargo.findings.length}`,
    `[workspace-doctor] cargo-cache totalBytes=${audit.cargoTargets.canonical.bytes}/${CARGO_CACHE_POLICY.totalBudgetBytes} incrementalBytes=${audit.cargoTargets.canonical.incrementalBytes}/${CARGO_CACHE_POLICY.incrementalBudgetBytes} otherBytes=${Math.max(0, audit.cargoTargets.canonical.bytes - audit.cargoTargets.canonical.incrementalBytes)} idleDays=${CARGO_CACHE_POLICY.idleDays} overBudget=${audit.cargoTargets.canonical.bytes > CARGO_CACHE_POLICY.totalBudgetBytes || audit.cargoTargets.canonical.incrementalBytes > CARGO_CACHE_POLICY.incrementalBudgetBytes}; inspect: npm run maintenance:cargo`,
  ];

  if (audit.obsoleteRootArtifacts.length > 0) {
    lines.push(`[workspace-doctor] obsolete-root: ${preview(audit.obsoleteRootArtifacts, previewCount)}`);
  }
  if (audit.trackedHistoryPresent.length > 0) {
    lines.push(`[workspace-doctor] tracked-history: ${preview(audit.trackedHistoryPresent, previewCount)}`);
  }
  if (audit.trackedHistoryPendingDeletion.length > 0) {
    lines.push(`[workspace-doctor] pending-untrack: ${preview(audit.trackedHistoryPendingDeletion, previewCount)}`);
  }
  if (audit.findings.length > 0) {
    lines.push(`[workspace-doctor] findings: ${preview(audit.findings, previewCount, ({ kind, detail }) => `${kind}(${detail})`)}`);
  }

  lines.push(formatTrellisRuntimeReport(audit.trellisRuntime, {
    applyResult: applyResult?.trellisRuntime ?? null,
    previewCount,
  }));
  if (!applyResult) {
    lines.push('[workspace-doctor] read-only audit complete; --apply is limited to audited Trellis runtime candidates.');
  }
  return lines.join('\n');
}

export function parseWorkspaceDoctorArgs(args) {
  const options = {
    apply: false,
    help: false,
    retentionDays: DEFAULT_TRELLIS_RUNTIME_RETENTION_DAYS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--retention-days') {
      index += 1;
      if (index >= args.length) {
        throw new Error('--retention-days requires a value');
      }
      options.retentionDays = Number(args[index]);
    } else if (arg.startsWith('--retention-days=')) {
      options.retentionDays = Number(arg.slice('--retention-days='.length));
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.retentionDays)
    || options.retentionDays < 1
    || options.retentionDays > MAX_TRELLIS_RUNTIME_RETENTION_DAYS) {
    throw new Error(`--retention-days must be an integer from 1 to ${MAX_TRELLIS_RUNTIME_RETENTION_DAYS}`);
  }
  return options;
}
