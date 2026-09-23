/**
 * Non-CSS-Module raw color audit.
 *
 * This gate keeps page/component TS/TSX/CSS files from introducing fixed raw
 * colors. Raw colors should live in token sources, theme adapters, or dedicated
 * chart color source files; ordinary component usage should reference those
 * constants or CSS variables.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  listGitFiles,
  readRepoFileLines,
} from '../shared/guard-utils.mjs';
import { readRawColorSourceAllowlist } from './raw-color-source-allowlist.mjs';

const COLOR_PATTERN = /#[0-9A-Fa-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/g;
const ALLOWLIST_CONFIG_PATH = 'scripts/config/allowlists/design-raw-color-allowlist.json';
const { fail, reportOk } = createCheckGuard('raw-color-audit:non-module', { errorPrefix: '' });

function failConfig(message) {
  fail(`Invalid ${ALLOWLIST_CONFIG_PATH}: ${message}`);
}

function loadRawColorSourceFiles(repoRoot) {
  return readRawColorSourceAllowlist(repoRoot, failConfig);
}

function getCandidateFiles(repoRoot, rawColorSourceFiles) {
  return listGitFiles(
    [
      ':(glob)apps/web-vite/src/**/*.css',
      ':(glob)apps/web-vite/src/**/*.ts',
      ':(glob)apps/web-vite/src/**/*.tsx',
    ],
    {
      cwd: repoRoot,
      filter: (file) => !file.endsWith('.module.css') && !rawColorSourceFiles.has(file),
    },
  );
}

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

    const blockStart = line.indexOf('/*', index);
    if (blockStart === -1) {
      result += line.slice(index);
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

function skipQuotedString(line, index) {
  const quote = line[index];
  let cursor = index + 1;

  while (cursor < line.length) {
    if (line[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (line[cursor] === quote) {
      return cursor + 1;
    }
    cursor += 1;
  }

  return line.length;
}

function stripCodeComments(line, state) {
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

    if (state.inTemplateString) {
      const char = line[index];
      result += char;
      if (char === '\\') {
        result += line[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (char === '`') {
        state.inTemplateString = false;
      }
      index += 1;
      continue;
    }

    const char = line[index];
    const next = line[index + 1];

    if (char === '"' || char === "'") {
      const end = skipQuotedString(line, index);
      result += line.slice(index, end);
      index = end;
      continue;
    }
    if (char === '`') {
      state.inTemplateString = true;
      result += char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      return result;
    }
    if (char === '/' && next === '*') {
      state.inBlockComment = true;
      index += 2;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function startsUrlFunction(line, index) {
  return (
    line.slice(index, index + 4).toLowerCase() === 'url(' &&
    !/[A-Za-z0-9_-]/.test(line[index - 1] ?? '')
  );
}

function skipFunctionCall(line, index) {
  let cursor = index;
  let depth = 0;

  while (cursor < line.length) {
    const char = line[cursor];

    if (char === '"' || char === "'") {
      cursor = skipQuotedString(line, cursor);
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth <= 0) {
        return cursor + 1;
      }
    }

    cursor += 1;
  }

  return line.length;
}

function stripCssStringsAndUrls(line) {
  let result = '';
  let cursor = 0;

  while (cursor < line.length) {
    const char = line[cursor];

    if (char === '"' || char === "'") {
      cursor = skipQuotedString(line, cursor);
      continue;
    }
    if (startsUrlFunction(line, cursor)) {
      cursor = skipFunctionCall(line, cursor);
      continue;
    }

    result += char;
    cursor += 1;
  }

  return result;
}

function quotedStringValue(text) {
  const quote = text[0];
  if ((quote !== '"' && quote !== "'" && quote !== '`') || text[text.length - 1] !== quote) {
    return text;
  }
  return text.slice(1, -1).trim();
}

function isUrlLikeString(text) {
  return /^(?:https?:\/\/|data:image\/|blob:|url\()/i.test(quotedStringValue(text));
}

function stripUrlLikeStringsAndFunctions(line) {
  let result = '';
  let cursor = 0;

  while (cursor < line.length) {
    const char = line[cursor];

    if (char === '"' || char === "'" || char === '`') {
      const end = skipQuotedString(line, cursor);
      const segment = line.slice(cursor, end);
      if (!isUrlLikeString(segment)) {
        result += segment;
      }
      cursor = end;
      continue;
    }
    if (startsUrlFunction(line, cursor)) {
      cursor = skipFunctionCall(line, cursor);
      continue;
    }

    result += char;
    cursor += 1;
  }

  return result;
}

function rawColorSearchSurface(line, file, state) {
  if (file.endsWith('.css')) {
    const cssLine = stripCssComments(line, state);
    return stripCssStringsAndUrls(cssLine);
  }

  const codeLine = stripCodeComments(line, state);
  return stripUrlLikeStringsAndFunctions(codeLine);
}

function findRawColors(line) {
  COLOR_PATTERN.lastIndex = 0;
  return Array.from(line.matchAll(COLOR_PATTERN), (match) => match[0]);
}

function isDynamicColorFactory(rawColor) {
  return rawColor.includes('${');
}

export function auditNonModuleRawColorLines(file, lines) {
  const violations = [];
  const parseState = { inBlockComment: false, inTemplateString: false };

  lines.forEach((line, index) => {
    const colorSurfaceLine = rawColorSearchSurface(line, file, parseState);
    const rawColors = findRawColors(colorSurfaceLine).filter((rawColor) => !isDynamicColorFactory(rawColor));

    for (const rawColor of rawColors) {
      violations.push({
        file,
        lineNumber: index + 1,
        rawColor,
        line: line.trim(),
      });
    }
  });

  return violations;
}

function auditFile(repoRoot, file) {
  return auditNonModuleRawColorLines(file, readRepoFileLines(repoRoot, file, { lineEndingPattern: '\n' }));
}

export function auditNonModuleRawColorFiles(files, options = {}) {
  const { readLines } = options;
  return files.flatMap((file) => auditNonModuleRawColorLines(file, readLines(file)));
}

export function formatNonModuleRawColorFailure(violations) {
  const lines = [
    '[raw-color-audit:non-module] Raw color violations found outside approved color sources.',
    '[raw-color-audit:non-module] Move values to DESIGN.md-backed tokens, theme adapters, or dedicated chart color sources.',
    '',
  ];

  for (const violation of violations) {
    lines.push(`${violation.file}:${violation.lineNumber}: ${violation.rawColor}`);
    lines.push(`  ${violation.line}`);
  }

  return lines.join('\n');
}

export function summarizeNonModuleRawColorAudit(filesCount, approvedSourceCount) {
  return `scanned ${filesCount} non-module TS/TSX/CSS files; ${approvedSourceCount} approved sources; no raw colors outside approved sources found.`;
}

export function runNonModuleRawColorAuditCheck() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const rawColorSourceFiles = loadRawColorSourceFiles(repoRoot);
  const files = getCandidateFiles(repoRoot, rawColorSourceFiles);
  const violations = files.flatMap((file) => auditFile(repoRoot, file));

  if (violations.length > 0) {
    console.error(formatNonModuleRawColorFailure(violations));
    process.exit(1);
  }

  reportOk(summarizeNonModuleRawColorAudit(files.length, rawColorSourceFiles.size));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runNonModuleRawColorAuditCheck();
}
