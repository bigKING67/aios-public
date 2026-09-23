/**
 * CSS Modules typography raw-value audit.
 *
 * New CSS Modules should use AIOS typography tokens for font-size,
 * line-height, and letter-spacing. Existing legacy raw declarations are frozen
 * by file and property so the count can go down, but not up.
 */

import {
  assertRepoRoot,
  getRepoRoot,
  listCssModuleFiles,
  readRepoFileLines,
  readRequiredJsonFile,
  reportCappedCountAllowlistMaintenanceFailures,
} from '../shared/guard-utils.mjs';

const CONFIG_PATH = 'scripts/config/allowlists/css-module-typography-allowlist.json';
const TYPOGRAPHY_DECLARATION_PATTERN = /^\s*(font-size|line-height|letter-spacing)\s*:\s*(.*)$/;
const TYPOGRAPHY_PROPERTIES = ['font-size', 'line-height', 'letter-spacing'];
const TABLE_DETAIL_FONT_SIZE_TOKEN_PATTERN = /^var\(--component-table-detail-(?:header|body)-font-size\)$/;
const TABLE_DETAIL_LINE_HEIGHT_TOKEN_PATTERN = /^var\(--component-table-detail-(?:header|body)-line-height\)$/;
const TABLE_DETAIL_LETTER_SPACING_TOKEN_PATTERN = /^var\(--component-table-detail-(?:header|body|numeric)-letter-spacing\)$/;
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

function normalizeValue(value) {
  return value
    .replace(/;.*$/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function isTokenizedTypographyValue(property, value) {
  const normalizedValue = value.replace(/\s*!important$/i, '').trim();

  if (['inherit', 'normal', 'initial', 'unset', 'revert'].includes(normalizedValue)) {
    return true;
  }

  if (property === 'font-size') {
    return /^(?:var\(--(?:font-size|typography-font-size)-[\w-]+\)|clamp\(\s*var\(--font-size-[\w-]+\)\s*,\s*[^,]+\s*,\s*var\(--font-size-[\w-]+\)\s*\))$/.test(normalizedValue)
      || TABLE_DETAIL_FONT_SIZE_TOKEN_PATTERN.test(normalizedValue);
  }

  if (property === 'line-height') {
    return /^var\(--line-height-[\w-]+\)$/.test(normalizedValue)
      || /^var\(--component-control-line-height-[\w-]+\)$/.test(normalizedValue)
      || /^var\(--typography-font-size-[\w-]+-line-height\)$/.test(normalizedValue)
      || TABLE_DETAIL_LINE_HEIGHT_TOKEN_PATTERN.test(normalizedValue);
  }

  if (property === 'letter-spacing') {
    return /^var\(--letter-spacing-[\w-]+\)$/.test(normalizedValue)
      || TABLE_DETAIL_LETTER_SPACING_TOKEN_PATTERN.test(normalizedValue);
  }

  return false;
}

function emptyCounts() {
  return {
    'font-size': 0,
    'line-height': 0,
    'letter-spacing': 0,
  };
}

function auditFile(repoRoot, file) {
  const lines = readRepoFileLines(repoRoot, file, { lineEndingPattern: '\n' });
  const commentState = { inBlockComment: false };
  const rawCounts = emptyCounts();
  const rawExamples = [];
  let activeDeclaration = null;

  function finishDeclaration(endLineNumber) {
    if (!activeDeclaration) {
      return;
    }

    const value = normalizeValue(activeDeclaration.value);
    if (!isTokenizedTypographyValue(activeDeclaration.property, value)) {
      rawCounts[activeDeclaration.property] += 1;
      if (rawExamples.length < 8) {
        rawExamples.push({
          lineNumber: activeDeclaration.lineNumber,
          endLineNumber,
          property: activeDeclaration.property,
          value,
          line: activeDeclaration.sourceLine.trim(),
        });
      }
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

    const match = cleanedLine.match(TYPOGRAPHY_DECLARATION_PATTERN);
    if (!match) {
      return;
    }

    activeDeclaration = {
      lineNumber,
      sourceLine: line,
      property: match[1],
      value: match[2],
    };

    if (cleanedLine.includes(';')) {
      finishDeclaration(lineNumber);
    }
  });

  finishDeclaration(lines.length);
  return { file, rawCounts, rawExamples };
}

function readConfig(repoRoot, fail) {
  const config = readRequiredJsonFile(repoRoot, CONFIG_PATH, fail);
  if (config.version !== 1) {
    fail(`${CONFIG_PATH} must use version 1`);
  }
  if (!Array.isArray(config.allowed)) {
    fail(`${CONFIG_PATH} allowed must be an array`);
  }

  const allowlist = new Map();
  for (const entry of config.allowed) {
    if (!entry || typeof entry.path !== 'string' || !entry.path) {
      fail(`${CONFIG_PATH} contains an entry without a path`);
    }
    if (allowlist.has(entry.path)) {
      fail(`${CONFIG_PATH} contains duplicate path ${entry.path}`);
    }
    if (!entry.maxRawDeclarations || typeof entry.maxRawDeclarations !== 'object') {
      fail(`${entry.path} must include maxRawDeclarations`);
    }
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) {
      fail(`${entry.path} must include a reason`);
    }

    const caps = emptyCounts();
    for (const property of TYPOGRAPHY_PROPERTIES) {
      const value = entry.maxRawDeclarations[property] ?? 0;
      if (!Number.isInteger(value) || value < 0) {
        fail(`${entry.path} ${property} cap must be a non-negative integer`);
      }
      caps[property] = value;
    }
    allowlist.set(entry.path, caps);
  }

  return allowlist;
}

function sumCounts(counts) {
  return TYPOGRAPHY_PROPERTIES.reduce((total, property) => total + counts[property], 0);
}

export function runCssModuleTypographyValuesCheck(guard) {
  const { fail, reportOk } = guard;
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const allowlist = readConfig(repoRoot, fail);
  const files = listCssModuleFiles(repoRoot);
  const fileSet = new Set(files);
  const audits = files.map((file) => auditFile(repoRoot, file));
  const violations = [];
  const missingAllowlistEntries = [];
  const staleAllowlistEntries = [];
  const reducedAllowlistCaps = [];

  for (const file of allowlist.keys()) {
    if (!fileSet.has(file)) {
      missingAllowlistEntries.push(file);
    }
  }

  for (const audit of audits) {
    const caps = allowlist.get(audit.file);
    const rawTotal = sumCounts(audit.rawCounts);

    if (!caps) {
      if (rawTotal > 0) {
        violations.push({
          file: audit.file,
          reason: 'non-allowlisted CSS Module contains raw typography declarations',
          rawCounts: audit.rawCounts,
          rawExamples: audit.rawExamples,
        });
      }
      continue;
    }

    if (rawTotal === 0) {
      staleAllowlistEntries.push(audit.file);
      continue;
    }

    const exceeded = TYPOGRAPHY_PROPERTIES.filter((property) => audit.rawCounts[property] > caps[property]);
    if (exceeded.length > 0) {
      violations.push({
        file: audit.file,
        reason: `raw typography declarations exceeded frozen cap for ${exceeded.join(', ')}`,
        rawCounts: audit.rawCounts,
        caps,
        rawExamples: audit.rawExamples,
      });
      continue;
    }

    const reduced = TYPOGRAPHY_PROPERTIES.filter((property) => audit.rawCounts[property] < caps[property]);
    if (reduced.length > 0) {
      reducedAllowlistCaps.push({
        file: audit.file,
        reduced,
        rawCounts: audit.rawCounts,
        caps,
      });
    }
  }

  reportCappedCountAllowlistMaintenanceFailures(
    { missingAllowlistEntries, reducedAllowlistCaps, staleAllowlistEntries },
    {
      configPath: CONFIG_PATH,
      guardName: 'typography-value-audit',
      missingHeader: 'Found allowlist entries for missing files:',
      staleHeader: 'Found allowlisted files with no raw typography declarations:',
      reducedHeader: 'Found allowlist caps above the current raw typography count:',
      formatReducedEntry(entry) {
        return [
          `- ${entry.file}: reduced ${entry.reduced.join(', ')}`,
          `  current=${JSON.stringify(entry.rawCounts)} cap=${JSON.stringify(entry.caps)}`,
        ];
      },
    },
  );

  if (violations.length > 0) {
    console.error('[typography-value-audit] CSS Modules typography raw-value violations found.');
    console.error(
      '[typography-value-audit] Use --font-size-*, --line-height-*, --letter-spacing-*, or approved component typography tokens. Existing legacy raw declarations are frozen and must not grow.\n',
    );

    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.reason}`);
      console.error(`  raw=${JSON.stringify(violation.rawCounts)}${violation.caps ? ` cap=${JSON.stringify(violation.caps)}` : ''}`);
      for (const example of violation.rawExamples) {
        const location =
          example.lineNumber === example.endLineNumber
            ? `${violation.file}:${example.lineNumber}`
            : `${violation.file}:${example.lineNumber}-${example.endLineNumber}`;
        console.error(`  ${location}: ${example.property}: ${example.value}`);
        console.error(`    ${example.line}`);
      }
    }

    process.exit(1);
  }

  const rawTotal = audits.reduce((total, audit) => total + sumCounts(audit.rawCounts), 0);
  const debtSummary =
    rawTotal === 0
      ? 'clean baseline; no frozen legacy raw typography declarations'
      : `${rawTotal} frozen legacy raw typography declarations`;
  reportOk(
    `scanned ${files.length} CSS Modules; ${debtSummary}; new files must use tokens.`,
  );
}
