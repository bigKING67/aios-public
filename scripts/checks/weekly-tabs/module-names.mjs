#!/usr/bin/env node

/**
 * Weekly tabs module naming audit.
 *
 * Files named "*-copy" look like accidental duplicates, and generic
 * "*-template" files hide their real responsibility. Use precise names such
 * as "*-diagnostics", "*-copywriting", or "*-template-resolver" instead.
 */

import path from 'node:path';
import {
  assertRepoRoot,
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
  listGitFiles,
} from '../../lib/shared/guard-utils.mjs';

const GUARD_NAME = 'weekly-tabs-misleading-module-names';
const WEEKLY_TABS_ROOT = 'apps/web-vite/src/app/reports/weekly/_components/tabs';
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx)$/;

const { fail, reportOk } = createWeeklyGuard(GUARD_NAME);

export function listWeeklyModuleNameSourceFiles(repoRoot) {
  return listGitFiles([WEEKLY_TABS_ROOT], {
    cwd: repoRoot,
    filter: (file) => SOURCE_FILE_PATTERN.test(file),
  });
}

export function auditWeeklyModuleNameFile(file) {
  const basename = path.basename(file);

  if (/-copy\.(?:ts|tsx)$/.test(basename)) {
    return {
      file,
      reason: '"*-copy" reads as a duplicate artifact, not a durable module responsibility',
      suggestion: 'rename to "*-diagnostics" for diagnostic text builders, or "*-copywriting" for literal copy assets',
    };
  }

  if (/-template\.(?:ts|tsx)$/.test(basename)) {
    return {
      file,
      reason: '"*-template" is too vague for weekly tab production modules',
      suggestion: 'rename to a responsibility-specific suffix such as "*-template-resolver" or "*-template-builder"',
    };
  }

  return null;
}

export function formatWeeklyModuleNameFailure(findings) {
  const lines = [`[${GUARD_NAME}] Weekly tabs module names are misleading:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}`);
    lines.push(`  reason: ${finding.reason}`);
    lines.push(`  suggestion: ${finding.suggestion}`);
  }
  lines.push(
    '',
    'Keep weekly tabs filenames aligned to module responsibility so cleanup audits do not confuse active code with stale copies/templates.',
  );
  return lines.join('\n');
}

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const files = listWeeklyModuleNameSourceFiles(repoRoot);
  const findings = files.map(auditWeeklyModuleNameFile).filter(Boolean);

  if (findings.length > 0) {
    console.error(formatWeeklyModuleNameFailure(findings));
    process.exit(1);
  }

  reportOk(`scanned ${files.length} weekly TS/TSX files; no misleading copy/template module names found.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
