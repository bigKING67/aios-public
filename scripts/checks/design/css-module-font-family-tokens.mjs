#!/usr/bin/env node

/**
 * CSS Modules typography-family audit.
 *
 * CSS Modules must consume the documented AIOS font-family tokens instead
 * of carrying page-local font stacks. This keeps CJK UI, display headings, and
 * mono/data typography governed by DESIGN.md and apps/web-vite/src/styles/design-tokens.css.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  listCssModuleFiles,
  readRepoFileLines,
} from '../../lib/shared/guard-utils.mjs';

const FONT_FAMILY_DECLARATION_PATTERN = /^\s*font-family\s*:\s*(.*)$/;
const ALLOWED_FONT_FAMILY_VALUES = new Set([
  'var(--font-family-base)',
  'var(--font-family-display)',
  'var(--font-family-mono)',
  'inherit',
]);
const { fail, reportOk } = createCheckGuard('font-family-token-audit', { errorPrefix: '' });

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

function normalizeFontFamilyValue(value) {
  return value
    .replace(/;.*$/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function auditFile(repoRoot, file) {
  const lines = readRepoFileLines(repoRoot, file, { lineEndingPattern: '\n' });
  const commentState = { inBlockComment: false };
  const violations = [];
  let activeDeclaration = null;

  function finishDeclaration(endLineNumber) {
    if (!activeDeclaration) {
      return;
    }

    const value = normalizeFontFamilyValue(activeDeclaration.value);
    if (!ALLOWED_FONT_FAMILY_VALUES.has(value)) {
      violations.push({
        file,
        lineNumber: activeDeclaration.lineNumber,
        endLineNumber,
        value,
        line: activeDeclaration.sourceLine.trim(),
      });
    }

    activeDeclaration = null;
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const cleanedLine = stripCssComments(line, commentState);

    if (activeDeclaration) {
      activeDeclaration.value += ` ${cleanedLine}`;
      if (cleanedLine.includes(';')) {
        finishDeclaration(lineNumber);
      }
      return;
    }

    const match = cleanedLine.match(FONT_FAMILY_DECLARATION_PATTERN);
    if (!match) {
      return;
    }

    activeDeclaration = {
      lineNumber,
      sourceLine: line,
      value: match[1],
    };

    if (cleanedLine.includes(';')) {
      finishDeclaration(lineNumber);
    }
  });

  finishDeclaration(lines.length);
  return violations;
}

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const files = listCssModuleFiles(repoRoot);
  const violations = files.flatMap((file) => auditFile(repoRoot, file));

  if (violations.length > 0) {
    console.error('[font-family-token-audit] CSS Modules font-family token violations found.');
    console.error(
      '[font-family-token-audit] Use var(--font-family-base), var(--font-family-display), var(--font-family-mono), or inherit.\n',
    );

    for (const violation of violations) {
      const location =
        violation.lineNumber === violation.endLineNumber
          ? `${violation.file}:${violation.lineNumber}`
          : `${violation.file}:${violation.lineNumber}-${violation.endLineNumber}`;
      console.error(`${location}: font-family must use a design token`);
      console.error(`  ${violation.line}`);
    }

    process.exit(1);
  }

  reportOk(`scanned ${files.length} CSS Modules; all font-family declarations use design tokens.`);
}

main();
