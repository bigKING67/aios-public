#!/usr/bin/env node

/**
 * Legacy status color token consumption audit.
 *
 * `--color-success|danger|warning|info` remain as low-level compatibility
 * definitions only. Runtime components/pages should consume DESIGN.md semantic
 * aliases such as `--status-*` or `--trend-*` instead.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  listGitFiles,
  normalizeRepoPath,
  readRepoFileLines,
} from '../../lib/shared/guard-utils.mjs';

const LEGACY_STATUS_TOKEN_PATTERN = /--color-(success|danger|warning|info)\b/g;

const ALLOWED_DEFINITION_FILES = new Set([
  'apps/web-vite/src/styles/design-tokens.css',
]);
const { fail, reportOk } = createCheckGuard('legacy-color-token-consumption', { errorPrefix: '' });

function getCandidateFiles(repoRoot) {
  return listGitFiles([
    ':(glob)apps/web-vite/src/**/*.css',
    ':(glob)apps/web-vite/src/**/*.ts',
    ':(glob)apps/web-vite/src/**/*.tsx',
  ], {
    cwd: repoRoot,
    filter: (file) => !ALLOWED_DEFINITION_FILES.has(normalizeRepoPath(file)),
  });
}

function stripComments(line, state) {
  let result = '';
  let index = 0;

  while (index < line.length) {
    if (state.inBlockComment) {
      const end = line.indexOf('*/', index);
      if (end === -1) return result;
      state.inBlockComment = false;
      index = end + 2;
      continue;
    }

    const blockStart = line.indexOf('/*', index);
    const lineStart = line.indexOf('//', index);
    const hasLineComment = lineStart !== -1;
    const hasBlockComment = blockStart !== -1;

    if (!hasLineComment && !hasBlockComment) {
      result += line.slice(index);
      return result;
    }

    if (hasLineComment && (!hasBlockComment || lineStart < blockStart)) {
      result += line.slice(index, lineStart);
      return result;
    }

    result += line.slice(index, blockStart);
    const blockEnd = line.indexOf('*/', blockStart + 2);
    if (blockEnd === -1) {
      state.inBlockComment = true;
      return result;
    }

    index = blockEnd + 2;
  }

  return result;
}

function auditFile(repoRoot, file) {
  const lines = readRepoFileLines(repoRoot, file, { lineEndingPattern: '\n' });
  const commentState = { inBlockComment: false };
  const violations = [];

  lines.forEach((line, index) => {
    const cleanedLine = stripComments(line, commentState);
    LEGACY_STATUS_TOKEN_PATTERN.lastIndex = 0;

    for (const match of cleanedLine.matchAll(LEGACY_STATUS_TOKEN_PATTERN)) {
      violations.push({
        file,
        lineNumber: index + 1,
        token: match[0],
        line: line.trim(),
      });
    }
  });

  return violations;
}

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const files = getCandidateFiles(repoRoot);
  const violations = files.flatMap((file) => auditFile(repoRoot, file));

  if (violations.length > 0) {
    console.error('[legacy-color-token-consumption] Legacy --color-* status token usage found outside token definition files.');
    console.error('[legacy-color-token-consumption] Use --status-*, --trend-*, or domain-specific aliases instead.\n');

    for (const violation of violations) {
      console.error(`${violation.file}:${violation.lineNumber}: ${violation.token}`);
      console.error(`  ${violation.line}`);
    }

    process.exit(1);
  }

  reportOk(`scanned ${files.length} source files; no legacy status color token usage outside token definitions found.`);
}

main();
