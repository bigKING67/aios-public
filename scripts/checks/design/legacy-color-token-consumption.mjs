#!/usr/bin/env node

/**
 * Legacy color token consumption audit.
 *
 * `--color-success|danger|warning|info` remain as low-level compatibility
 * definitions only. The shared v1 color names (`--bg-*`, `--text-*`,
 * `--brand-primary`, `--border-color*`, `--divider-color`, `--status-*`,
 * `--trend-*`, `--chart-series-*`) are the token layer behind Tailwind
 * utilities and the ECharts CSS variables; pages and components write the
 * lobe (`--lobe-*`) and AIOS v2 (`--aios-*`) names directly (DESIGN.md).
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

const SHARED_COLOR_NAME_PATTERN =
  /var\(--(bg-(?:global|card|hover|subtle|disabled|input)|text-(?:primary|secondary|tertiary|disabled|inverse)|brand-[a-z-]+|border-color(?:-hover)?|divider-color|status-(?:success|warning|danger|info|neutral)(?:-(?:strong|bg|border))?|trend-(?:up|down|neutral)|chart-series-[a-z0-9]+)(?=[,)\s])/g;

const ALLOWED_DEFINITION_FILES = new Set([
  'apps/web-vite/src/styles/design-tokens.css',
]);

// The token layer that defines or maps the shared names.
const SHARED_NAME_TOKEN_LAYER_FILES = new Set([
  'apps/web-vite/src/styles/design-tokens.css',
  'apps/web-vite/src/styles/aios-theme.css',
  'apps/web-vite/src/styles/echarts.css',
  'apps/web-vite/src/test/tailwind-css-pipeline.test.ts',
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
  const patterns = SHARED_NAME_TOKEN_LAYER_FILES.has(normalizeRepoPath(file))
    ? [LEGACY_STATUS_TOKEN_PATTERN]
    : [LEGACY_STATUS_TOKEN_PATTERN, SHARED_COLOR_NAME_PATTERN];

  lines.forEach((line, index) => {
    const cleanedLine = stripComments(line, commentState);

    for (const pattern of patterns) {
      for (const match of cleanedLine.matchAll(pattern)) {
        violations.push({
          file,
          lineNumber: index + 1,
          token: match[0],
          line: line.trim(),
        });
      }
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
    console.error('[legacy-color-token-consumption] Legacy color token usage found outside the token layer.');
    console.error('[legacy-color-token-consumption] Use --lobe-* and --aios-* names (e.g. --lobe-color-text, --aios-status-success, --aios-chart-1) or domain aliases.\n');

    for (const violation of violations) {
      console.error(`${violation.file}:${violation.lineNumber}: ${violation.token}`);
      console.error(`  ${violation.line}`);
    }

    process.exit(1);
  }

  reportOk(`scanned ${files.length} source files; no legacy color token usage outside the token layer found.`);
}

main();
