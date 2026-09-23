/**
 * Weekly tabs contract boundary audit core.
 *
 * Adapter modules may export builders/constants, but reusable props/input
 * contracts must live in dedicated *-contracts.ts files. Contract modules must
 * also stay independent from TSX render modules and adapters.
 */

import {
  createLineStartOffsets,
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
  resolveRelativeImport,
} from '../shared/guard-utils.mjs';

export const WEEKLY_TABS_CONTRACT_BOUNDARIES_GUARD_NAME = 'weekly-tabs-contract-boundary';

const WEEKLY_TABS_ROOT = 'apps/web-vite/src/app/reports/weekly/_components/tabs';
const ADAPTER_CONTRACT_EXPORT_PATTERN = /^\s*export\s+(?:interface|type)\s+\w+/gm;
const CONTRACT_IMPORT_PATTERN = /\bfrom\s+['"]([^'"]+)['"]/g;

export function listWeeklyContractBoundaryFiles(repoRoot) {
  return listGitFiles([WEEKLY_TABS_ROOT], {
    cwd: repoRoot,
  });
}

export function auditWeeklyAdapterContractExports(repoRoot, file) {
  const sourceText = readRepoFile(repoRoot, file);
  const lineStartOffsets = createLineStartOffsets(sourceText);
  const findings = [];

  ADAPTER_CONTRACT_EXPORT_PATTERN.lastIndex = 0;
  let match;
  while ((match = ADAPTER_CONTRACT_EXPORT_PATTERN.exec(sourceText)) !== null) {
    findings.push({
      file,
      lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
      reason: 'adapter files must not export reusable interface/type contracts',
      line: match[0].trim(),
    });
  }

  return findings;
}

export function auditWeeklyAdapterImports(repoRoot, file) {
  const sourceText = readRepoFile(repoRoot, file);
  const lineStartOffsets = createLineStartOffsets(sourceText);
  const findings = [];

  CONTRACT_IMPORT_PATTERN.lastIndex = 0;
  let match;
  while ((match = CONTRACT_IMPORT_PATTERN.exec(sourceText)) !== null) {
    const specifier = match[1];
    const resolvedImport = resolveRelativeImport(repoRoot, file, specifier);
    if (resolvedImport?.endsWith('.tsx')) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: `adapter files must not import TSX render modules (${resolvedImport})`,
        line: match[0].trim(),
      });
    }
  }

  return findings;
}

export function auditWeeklyContractImports(repoRoot, file) {
  const sourceText = readRepoFile(repoRoot, file);
  const lineStartOffsets = createLineStartOffsets(sourceText);
  const findings = [];

  CONTRACT_IMPORT_PATTERN.lastIndex = 0;
  let match;
  while ((match = CONTRACT_IMPORT_PATTERN.exec(sourceText)) !== null) {
    const specifier = match[1];
    const resolvedImport = resolveRelativeImport(repoRoot, file, specifier);
    if (specifier.endsWith('-adapter') || specifier.includes('-adapter/')) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: 'contract files must not import adapters',
        line: match[0].trim(),
      });
      continue;
    }

    if (resolvedImport?.endsWith('.tsx')) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: `contract files must not import TSX render modules (${resolvedImport})`,
        line: match[0].trim(),
      });
    }
  }

  return findings;
}

export function auditWeeklyContractBoundaries(repoRoot) {
  const files = listWeeklyContractBoundaryFiles(repoRoot);
  const adapterFiles = files.filter((file) => file.endsWith('-adapter.ts'));
  const contractFiles = files.filter((file) => file.endsWith('-contracts.ts'));
  const findings = [
    ...adapterFiles.flatMap((file) => auditWeeklyAdapterContractExports(repoRoot, file)),
    ...adapterFiles.flatMap((file) => auditWeeklyAdapterImports(repoRoot, file)),
    ...contractFiles.flatMap((file) => auditWeeklyContractImports(repoRoot, file)),
  ];

  return {
    adapterFiles,
    contractFiles,
    findings,
  };
}

export function formatWeeklyContractBoundariesResult({
  adapterFiles,
  contractFiles,
  findings,
}) {
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[${WEEKLY_TABS_CONTRACT_BOUNDARIES_GUARD_NAME}] OK: scanned ${adapterFiles.length} adapters and ${contractFiles.length} contract files.\n`,
      stderr: '',
    };
  }

  const lines = [`[${WEEKLY_TABS_CONTRACT_BOUNDARIES_GUARD_NAME}] Weekly contract boundaries were violated:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} ${finding.reason}`);
    lines.push(`  ${finding.line}`);
  }
  lines.push(
    '',
    'Move reusable props/input contracts into *-contracts.ts and keep adapters/contracts independent from TSX render modules.',
  );

  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}
