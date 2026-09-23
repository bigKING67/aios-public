#!/usr/bin/env node

/**
 * Blocks unowned TODO/FIXME/HACK/XXX markers in production frontend source.
 *
 * These markers are useful locally but poor long-term contracts in shipped
 * source. Convert them into issue-backed work, behavior comments, or tests
 * before merging.
 */

import ts from 'typescript';
import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  lineNumberForOffset,
  listGitFiles,
  readRequiredFile,
} from '../../lib/shared/guard-utils.mjs';

const GUARD_NAME = 'frontend-unowned-debt-comments';
const FRONTEND_SOURCE_ROOTS = Object.freeze(['apps/web-vite/src']);
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|css)$/;
const DEBT_MARKER_PATTERN = /\b(?:TODO|FIXME|HACK|XXX)\b/u;

const { fail, reportOk } = createCheckGuard(GUARD_NAME);

export function listFrontendUnownedDebtCommentSourceFiles(repoRoot) {
  return listGitFiles(FRONTEND_SOURCE_ROOTS, {
    cwd: repoRoot,
    filter: (file) => SOURCE_FILE_PATTERN.test(file),
  });
}

export function frontendUnownedDebtCommentSourceKind(file) {
  if (file.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  return file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

export function frontendCommentRanges(sourceText, file) {
  if (file.endsWith('.css')) {
    return [...sourceText.matchAll(/\/\*[\s\S]*?\*\//g)].map((match) => ({
      pos: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }));
  }

  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, frontendUnownedDebtCommentSourceKind(file));
  const ranges = [];
  const seen = new Set();

  function addRanges(pos) {
    const comments = [
      ...(ts.getLeadingCommentRanges(sourceText, pos) ?? []),
      ...(ts.getTrailingCommentRanges(sourceText, pos) ?? []),
    ];

    for (const range of comments) {
      const key = `${range.pos}:${range.end}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      ranges.push({ pos: range.pos, end: range.end });
    }
  }

  function visit(node) {
    addRanges(node.pos);
    addRanges(node.end);
    ts.forEachChild(node, visit);
  }

  addRanges(0);
  visit(sourceFile);
  return ranges;
}

export function auditFrontendUnownedDebtCommentSource(file, sourceText) {
  const lineStarts = ts.computeLineStarts(sourceText);
  const findings = [];

  for (const range of frontendCommentRanges(sourceText, file)) {
    const comment = sourceText.slice(range.pos, range.end);
    const match = DEBT_MARKER_PATTERN.exec(comment);
    if (!match) {
      continue;
    }

    const markerOffset = range.pos + match.index;
    const lineEnd = sourceText.indexOf('\n', markerOffset);
    findings.push({
      file,
      lineNumber: lineNumberForOffset(lineStarts, markerOffset),
      marker: match[0],
      line: sourceText.slice(markerOffset, lineEnd === -1 ? sourceText.length : lineEnd).trim(),
    });
  }

  return findings;
}

export function auditFrontendUnownedDebtCommentFile(repoRoot, file) {
  return auditFrontendUnownedDebtCommentSource(file, readRequiredFile(repoRoot, file, fail));
}

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const files = listFrontendUnownedDebtCommentSourceFiles(repoRoot);
  const findings = files.flatMap((file) => auditFrontendUnownedDebtCommentFile(repoRoot, file));

  if (findings.length > 0) {
    console.error(`[${GUARD_NAME}] Unowned debt markers were found in frontend source comments:`);
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.lineNumber} ${finding.marker}`);
      console.error(`  ${finding.line}`);
    }
    console.error(
      '\nReplace TODO/FIXME/HACK/XXX comments with behavior comments, tests, or issue-backed work outside production source.',
    );
    process.exit(1);
  }

  reportOk(`scanned ${files.length} frontend source files; no unowned TODO/FIXME/HACK/XXX comments found.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
