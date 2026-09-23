#!/usr/bin/env node

/**
 * Enforces that raw colors in apps/web-vite/src/styles/echarts.css stay inside the explicit
 * --echarts-fallback-* source block.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRepoFileLines,
  repoFileExists,
} from '../../lib/shared/guard-utils.mjs';

const TARGET_FILE = 'apps/web-vite/src/styles/echarts.css';
const COLOR_PATTERN = /#[0-9A-Fa-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/g;
const FALLBACK_DECLARATION_PATTERN = /^\s*--echarts-fallback-[a-z0-9-]+\s*:/;
const { fail, reportOk } = createCheckGuard('echarts-css-fallback-colors', { errorPrefix: '' });

function stripCssComments(line, state) {
  let result = '';
  let index = 0;

  while (index < line.length) {
    if (state.inBlockComment) {
      const end = line.indexOf('*/', index);
      if (end === -1) {
        return result;
      }
      state.inBlockComment = false;
      index = end + 2;
      continue;
    }

    const start = line.indexOf('/*', index);
    if (start === -1) {
      result += line.slice(index);
      return result;
    }

    result += line.slice(index, start);
    const end = line.indexOf('*/', start + 2);
    if (end === -1) {
      state.inBlockComment = true;
      return result;
    }

    index = end + 2;
  }

  return result;
}

function findRawColors(line) {
  COLOR_PATTERN.lastIndex = 0;
  return Array.from(line.matchAll(COLOR_PATTERN), (match) => match[0]);
}

export function auditEchartsFallbackRawColorLines(lines) {
  const commentState = { inBlockComment: false };
  const violations = [];
  let fallbackCount = 0;

  lines.forEach((line, index) => {
    const cleanedLine = stripCssComments(line, commentState);
    const rawColors = findRawColors(cleanedLine);
    if (rawColors.length === 0) {
      return;
    }

    if (FALLBACK_DECLARATION_PATTERN.test(cleanedLine)) {
      fallbackCount += rawColors.length;
      return;
    }

    for (const rawColor of rawColors) {
      violations.push({
        file: TARGET_FILE,
        lineNumber: index + 1,
        rawColor,
        line: line.trim(),
      });
    }
  });

  return {
    fallbackCount,
    violations,
  };
}

export function formatEchartsFallbackRawColorFailure(violations) {
  const lines = ['[echarts-css-fallback-colors] Raw colors in apps/web-vite/src/styles/echarts.css must live in --echarts-fallback-* declarations.', ''];
  for (const violation of violations) {
    lines.push(`${violation.file}:${violation.lineNumber}: ${violation.rawColor}`);
    lines.push(`  ${violation.line}`);
  }
  return lines.join('\n');
}

export function summarizeEchartsFallbackRawColors(fallbackCount) {
  return `${fallbackCount} fallback raw colors centralized in ${TARGET_FILE}.`;
}

function main() {
  const repoRoot = getRepoRoot();
  if (!repoFileExists(repoRoot, TARGET_FILE)) {
    fail(`${TARGET_FILE} not found.`);
  }

  const result = auditEchartsFallbackRawColorLines(
    readRepoFileLines(repoRoot, TARGET_FILE, { lineEndingPattern: '\n' }),
  );

  if (result.violations.length > 0) {
    console.error(formatEchartsFallbackRawColorFailure(result.violations));
    process.exit(1);
  }

  reportOk(summarizeEchartsFallbackRawColors(result.fallbackCount));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
