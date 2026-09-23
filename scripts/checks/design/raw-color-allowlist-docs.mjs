#!/usr/bin/env node

/**
 * Keeps the raw-color allowlist config and DESIGN.md governance table aligned.
 *
 * The raw color source allowlist is executable policy. DESIGN.md is the human
 * contract. They must move together so approved raw-color source boundaries stay
 * reviewable.
 */

import {
  createCheckGuard,
  getRepoRoot,
  normalizeRepoPath,
  readRepoFileLines,
  repoFileExists,
} from '../../lib/shared/guard-utils.mjs';
import { readRawColorSourceAllowlist } from '../../lib/design/raw-color-source-allowlist.mjs';

const ALLOWLIST_CONFIG_PATH = 'scripts/config/allowlists/design-raw-color-allowlist.json';
const DESIGN_DOC_PATH = 'DESIGN.md';
const RAW_COLOR_SECTION_HEADING = '## Raw Color Governance';
const { fail, reportOk } = createCheckGuard('raw-color-allowlist-docs', { errorPrefix: '' });

function readAllowlistPaths(repoRoot) {
  if (!repoFileExists(repoRoot, ALLOWLIST_CONFIG_PATH)) {
    fail(`${ALLOWLIST_CONFIG_PATH} not found.`);
  }
  return readRawColorSourceAllowlist(repoRoot, fail, {
    requireExistingFiles: false,
    requireMetadata: false,
  });
}

export function extractRawColorGovernanceTablePaths(lines, options = {}) {
  const { fail = (message) => { throw new Error(message); } } = options;
  const sectionStart = lines.findIndex((line) => line.trim() === RAW_COLOR_SECTION_HEADING);
  if (sectionStart === -1) {
    fail(`${DESIGN_DOC_PATH} is missing ${RAW_COLOR_SECTION_HEADING}.`);
  }

  const sectionEndOffset = lines
    .slice(sectionStart + 1)
    .findIndex((line) => line.startsWith('## '));
  const sectionEnd = sectionEndOffset === -1 ? lines.length : sectionStart + 1 + sectionEndOffset;
  const sectionLines = lines.slice(sectionStart + 1, sectionEnd);

  const paths = new Set();
  for (const line of sectionLines) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (!match) {
      continue;
    }

    const normalizedPath = normalizeRepoPath(match[1]);
    if (paths.has(normalizedPath)) {
      fail(`${DESIGN_DOC_PATH} Raw Color Governance table contains duplicate path: ${normalizedPath}`);
    }

    paths.add(normalizedPath);
  }

  if (paths.size === 0) {
    fail(`${DESIGN_DOC_PATH} Raw Color Governance table has no source paths.`);
  }

  return paths;
}

function readGovernanceTablePaths(repoRoot) {
  if (!repoFileExists(repoRoot, DESIGN_DOC_PATH)) {
    fail(`${DESIGN_DOC_PATH} not found.`);
  }

  return extractRawColorGovernanceTablePaths(
    readRepoFileLines(repoRoot, DESIGN_DOC_PATH, { lineEndingPattern: '\n' }),
    { fail },
  );
}

function diffSets(left, right) {
  return Array.from(left).filter((value) => !right.has(value)).sort();
}

export function auditRawColorAllowlistDocs({ allowlistPaths, documentedPaths }) {
  return {
    missingFromAllowlist: diffSets(documentedPaths, allowlistPaths),
    missingFromDocs: diffSets(allowlistPaths, documentedPaths),
  };
}

export function formatRawColorAllowlistDocsFailure({ missingFromAllowlist, missingFromDocs }) {
  const lines = ['[raw-color-allowlist-docs] Raw color source docs mismatch.'];

  if (missingFromDocs.length > 0) {
    lines.push('', `In ${ALLOWLIST_CONFIG_PATH} but missing from ${DESIGN_DOC_PATH}:`);
    for (const filePath of missingFromDocs) {
      lines.push(`  - ${filePath}`);
    }
  }

  if (missingFromAllowlist.length > 0) {
    lines.push('', `In ${DESIGN_DOC_PATH} but missing from ${ALLOWLIST_CONFIG_PATH}:`);
    for (const filePath of missingFromAllowlist) {
      lines.push(`  - ${filePath}`);
    }
  }

  return lines.join('\n');
}

export function summarizeRawColorAllowlistDocs(allowlistPaths) {
  return `${allowlistPaths.size} raw color source paths documented.`;
}

function main() {
  const repoRoot = getRepoRoot();
  const allowlistPaths = readAllowlistPaths(repoRoot);
  const documentedPaths = readGovernanceTablePaths(repoRoot);

  const result = auditRawColorAllowlistDocs({ allowlistPaths, documentedPaths });

  if (result.missingFromDocs.length > 0 || result.missingFromAllowlist.length > 0) {
    console.error(formatRawColorAllowlistDocsFailure(result));
    process.exit(1);
  }

  reportOk(summarizeRawColorAllowlistDocs(allowlistPaths));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
