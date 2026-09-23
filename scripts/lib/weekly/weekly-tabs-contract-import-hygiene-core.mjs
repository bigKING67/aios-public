/**
 * Weekly tabs contract import hygiene audit core.
 *
 * Contract modules are the reusable type surface between adapters and render
 * modules. They should stay type-only and must not depend on routing helpers,
 * adapters, or TSX render modules.
 */

import path from 'node:path';
import {
  createLineStartOffsets,
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
  resolveRelativeImport,
} from '../shared/guard-utils.mjs';

export const WEEKLY_TABS_CONTRACT_IMPORT_HYGIENE_GUARD_NAME = 'weekly-tabs-contract-import-hygiene';

const WEEKLY_TABS_ROOT = 'apps/web-vite/src/app/reports/weekly/_components/tabs';
const IMPORT_DECLARATION_PATTERN = /^\s*import\s+(type\s+)?[\s\S]*?\bfrom\s+['"]([^'"]+)['"];?/gm;
const SIDE_EFFECT_IMPORT_PATTERN = /^\s*import\s+['"]([^'"]+)['"];?/gm;

export function listWeeklyContractImportHygieneFiles(repoRoot) {
  return listGitFiles([WEEKLY_TABS_ROOT], {
    cwd: repoRoot,
    filter: (file) => file.endsWith('-contracts.ts'),
  });
}

export function isWeeklyContractRoutingImport(specifier, resolvedImport) {
  return specifier.endsWith('-routing') || resolvedImport?.endsWith('-routing.ts');
}

export function isWeeklyContractAdapterImport(specifier, resolvedImport) {
  return specifier.endsWith('-adapter') || resolvedImport?.endsWith('-adapter.ts');
}

export function isWeeklyContractViewModelImport(specifier, resolvedImport) {
  return (
    specifier.includes('platform-tab-view-model') ||
    path.basename(resolvedImport ?? '').startsWith('platform-tab-view-model')
  );
}

export function auditWeeklyContractImportHygieneFile(repoRoot, file) {
  const sourceText = readRepoFile(repoRoot, file);
  const lineStartOffsets = createLineStartOffsets(sourceText);
  const findings = [];

  IMPORT_DECLARATION_PATTERN.lastIndex = 0;
  let match;
  while ((match = IMPORT_DECLARATION_PATTERN.exec(sourceText)) !== null) {
    const [, typeModifier, specifier] = match;
    const resolvedImport = resolveRelativeImport(repoRoot, file, specifier);

    if (!typeModifier) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: 'contract files must use import type only',
        line: match[0].trim().replace(/\s+/g, ' '),
      });
      continue;
    }

    if (isWeeklyContractRoutingImport(specifier, resolvedImport)) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: `contract files must not import routing helpers (${resolvedImport ?? specifier})`,
        line: match[0].trim().replace(/\s+/g, ' '),
      });
      continue;
    }

    if (isWeeklyContractAdapterImport(specifier, resolvedImport)) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: `contract files must not import adapters (${resolvedImport ?? specifier})`,
        line: match[0].trim().replace(/\s+/g, ' '),
      });
      continue;
    }

    if (isWeeklyContractViewModelImport(specifier, resolvedImport)) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: `contract files must not import platform view-model aggregates (${resolvedImport ?? specifier})`,
        line: match[0].trim().replace(/\s+/g, ' '),
      });
      continue;
    }

    if (resolvedImport?.endsWith('.tsx')) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: `contract files must not import TSX render modules (${resolvedImport})`,
        line: match[0].trim().replace(/\s+/g, ' '),
      });
    }
  }

  SIDE_EFFECT_IMPORT_PATTERN.lastIndex = 0;
  while ((match = SIDE_EFFECT_IMPORT_PATTERN.exec(sourceText)) !== null) {
    findings.push({
      file,
      lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
      reason: 'contract files must not use side-effect imports',
      line: match[0].trim().replace(/\s+/g, ' '),
    });
  }

  return findings;
}

export function auditWeeklyContractImportHygiene(repoRoot) {
  const contractFiles = listWeeklyContractImportHygieneFiles(repoRoot);
  return {
    contractFiles,
    findings: contractFiles.flatMap((file) => auditWeeklyContractImportHygieneFile(repoRoot, file)),
  };
}

export function formatWeeklyContractImportHygieneResult({ contractFiles, findings }) {
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[${WEEKLY_TABS_CONTRACT_IMPORT_HYGIENE_GUARD_NAME}] OK: scanned ${contractFiles.length} contract files; imports stay type-only, routing-free, and view-model-free.\n`,
      stderr: '',
    };
  }

  const lines = [`[${WEEKLY_TABS_CONTRACT_IMPORT_HYGIENE_GUARD_NAME}] Weekly contract import hygiene was violated:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} ${finding.reason}`);
    lines.push(`  ${finding.line}`);
  }
  lines.push(
    '',
    'Keep routing descriptors and reusable props in *-contracts.ts, and keep contracts type-only.',
  );

  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}
