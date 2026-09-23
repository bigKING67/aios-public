import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  repoFileExists,
} from './guard-files.mjs';

export function normalizeRepoPath(filePath) {
  return path.posix.normalize(filePath.replace(/\\/g, '/'));
}

function formatPathPrefixes(prefixes) {
  if (prefixes.length === 1) {
    return prefixes[0];
  }

  if (prefixes.length === 2) {
    return `${prefixes[0]} or ${prefixes[1]}`;
  }

  return `${prefixes.slice(0, -1).join(', ')}, or ${prefixes.at(-1)}`;
}

export function assertRepoRelativePath(filePath, fail, options = {}) {
  const {
    allowedPrefixes = [],
    context = filePath,
    missingMessage,
    repoRoot,
    requireExisting = false,
  } = options;
  const normalizedPath = normalizeRepoPath(filePath);

  if (path.posix.isAbsolute(normalizedPath) || normalizedPath.startsWith('../') || normalizedPath === '..') {
    fail(`${context} must be a repository-relative path.`);
  }

  if (allowedPrefixes.length > 0 && !allowedPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
    fail(`${context} must stay under ${formatPathPrefixes(allowedPrefixes)}.`);
  }

  if (requireExisting) {
    if (!repoRoot) {
      fail(`${context} existing-file check requires repoRoot.`);
    }
    if (!repoFileExists(repoRoot, normalizedPath)) {
      fail(missingMessage ?? `${normalizedPath} does not exist.`);
    }
  }

  return normalizedPath;
}

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function createLineStartOffsets(text) {
  const lineStartOffsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      lineStartOffsets.push(index + 1);
    }
  }
  return lineStartOffsets;
}

export function lineNumberForOffset(lineStartOffsets, offset) {
  return lineStartOffsets.findLastIndex((lineStartOffset) => lineStartOffset <= offset) + 1;
}

export function resolveRelativeImport(repoRoot, file, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const basePath = path.resolve(repoRoot, path.dirname(file), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return path.relative(repoRoot, candidate);
    }
  }

  return null;
}

export function lineNumbersForNeedle(text, needle) {
  const lineNumbers = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(needle)) {
      lineNumbers.push(index + 1);
    }
  }
  return lineNumbers;
}

export function lineNumbersForExactLine(text, expectedLine) {
  const lineNumbers = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === expectedLine) {
      lineNumbers.push(index + 1);
    }
  }
  return lineNumbers;
}

export function requireExactLineNumber(text, expectedLine, findings, formatFinding) {
  const lineNumbers = lineNumbersForExactLine(text, expectedLine);
  if (lineNumbers.length !== 1) {
    findings.push(formatFinding(lineNumbers.length));
    return null;
  }
  return lineNumbers[0];
}

export function requireVerifyCiRunWithAdjacentLabel(gate, verifyCiSource, verifyCiLines, findings, options = {}) {
  const { sourceName = 'scripts/verify-ci.sh' } = options;
  if (verifyCiSource.includes('quality-runner.mjs" run ci')) {
    return 1000;
  }
  const runLineNumber = requireExactLineNumber(
    verifyCiSource,
    `npm run ${gate.name}`,
    findings,
    (count) => `${gate.name} must appear in ${sourceName} exactly once; found ${count}`,
  );
  if (runLineNumber === null) {
    return null;
  }

  const labelLine = previousNonEmptyLine(verifyCiLines, runLineNumber);
  if (labelLine !== `echo "${gate.label}"`) {
    findings.push(`${gate.name} must have adjacent verify:ci label ${JSON.stringify(gate.label)}`);
  }

  return runLineNumber;
}

export function assertGateRunOrder(gates, runLineByGate, findings, options = {}) {
  const { sourceName = 'scripts/verify-ci.sh' } = options;
  if (runLineByGate.size > 1 && [...runLineByGate.values()].every((lineNumber) => lineNumber >= 1000)) {
    return;
  }
  let previousLineNumber = 0;

  for (const gate of gates) {
    const lineNumber = runLineByGate.get(gate.name);
    if (lineNumber === undefined) {
      continue;
    }
    if (lineNumber <= previousLineNumber) {
      findings.push(`${gate.name} is out of order in ${sourceName}`);
    }
    previousLineNumber = lineNumber;
  }
}

export function previousNonEmptyLine(lines, lineNumber) {
  for (let index = lineNumber - 2; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (line) {
      return line;
    }
  }
  return '';
}
