#!/usr/bin/env node

/**
 * Blocks historical project phase labels from production frontend source.
 *
 * Comments such as "v2.0 P1 Task 3" or "Day 5 新增" describe migration
 * history rather than current ownership. Production comments should explain
 * behavior, contracts, or domain intent.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  listGitFiles,
  readRequiredFile,
} from '../../lib/shared/guard-utils.mjs';

const GUARD_NAME = 'frontend-stale-phase-comments';
const FRONTEND_SOURCE_ROOTS = Object.freeze(['apps/web-vite/src']);
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|css)$/;
const STALE_PHASE_PATTERNS = Object.freeze([
  {
    name: 'versioned priority label',
    pattern: /\bv\d+(?:\.\d+)*\s+P\d+\b/u,
  },
  {
    name: 'priority task label',
    pattern: /\bP\d+\s+(?:Task|任务|改进|新增|已完成|更新|支持|实现)/u,
  },
  {
    name: 'day-by-day changelog label',
    pattern: /\bDay\s+\d+\s+新增/u,
  },
  {
    name: 'parenthesized priority marker',
    pattern: /（P\d+）/u,
  },
]);

const { fail, reportOk } = createCheckGuard(GUARD_NAME);

export function listFrontendStalePhaseCommentSourceFiles(repoRoot) {
  return listGitFiles(FRONTEND_SOURCE_ROOTS, {
    cwd: repoRoot,
    filter: (file) => SOURCE_FILE_PATTERN.test(file),
  });
}

export function auditFrontendStalePhaseCommentSource(file, source) {
  const findings = [];

  source.split(/\r?\n/).forEach((line, index) => {
    for (const rule of STALE_PHASE_PATTERNS) {
      if (rule.pattern.test(line)) {
        findings.push({
          file,
          lineNumber: index + 1,
          reason: rule.name,
          line: line.trim(),
        });
        break;
      }
    }
  });

  return findings;
}

export function auditFrontendStalePhaseCommentFile(repoRoot, file) {
  return auditFrontendStalePhaseCommentSource(file, readRequiredFile(repoRoot, file, fail));
}

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const files = listFrontendStalePhaseCommentSourceFiles(repoRoot);
  const findings = files.flatMap((file) => auditFrontendStalePhaseCommentFile(repoRoot, file));

  if (findings.length > 0) {
    console.error(`[${GUARD_NAME}] Stale project phase comments were found:`);
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.lineNumber} ${finding.reason}`);
      console.error(`  ${finding.line}`);
    }
    console.error(
      '\nRewrite phase/changelog comments into current behavior, contract, or domain intent.',
    );
    process.exit(1);
  }

  reportOk(`scanned ${files.length} frontend source files; no stale project phase comments found.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
