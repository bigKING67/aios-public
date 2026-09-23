import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  listGitFiles,
  readRepoFile,
} from '../shared/guard-utils.mjs';

const GUARD_NAME = 'trellis-spec-compact';
const TRELLIS_SPEC_FILE_PATTERN = /^\.trellis\/spec\/.+\.md$/u;
const DEFAULT_SPEC_BUDGET = Object.freeze({
  bytes: 5000,
  lines: 120,
});
const LARGE_GUIDE_BUDGET = Object.freeze({
  bytes: 8000,
  lines: 180,
});
const TOTAL_SPEC_BYTES_BUDGET = 58000;
const TOTAL_SPEC_HEADROOM_WARNING_BYTES = 8000;
const LARGEST_SPEC_PREVIEW_COUNT = 5;
const LARGE_GUIDE_BUDGETS_BY_FILE = Object.freeze(new Map([
  ['.trellis/spec/guides/cross-layer-thinking-guide.md', LARGE_GUIDE_BUDGET],
]));
const PLACEHOLDER_VALUE_PATTERN = /^(?:\[redacted\]|\[placeholder\]|\.\.\.|<[^>]+>|redacted|placeholder|example|fake)$/iu;
const TOKEN_VALUE_PATTERN = /^[A-Za-z0-9._~+/=-]+$/u;

function byteLength(text) {
  return Buffer.byteLength(text, 'utf8');
}

function lineCount(text) {
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r?\n/u).length;
}

function stripWrappingQuotes(value) {
  return value.trim().replace(/^["'`]|["'`]$/gu, '').trim();
}

function isPlaceholderValue(rawValue) {
  const value = stripWrappingQuotes(rawValue);
  return PLACEHOLDER_VALUE_PATTERN.test(value) || value.includes('[redacted]');
}

function budgetForFile(file) {
  return LARGE_GUIDE_BUDGETS_BY_FILE.get(file) ?? DEFAULT_SPEC_BUDGET;
}

function finding({
  file,
  kind,
  line = null,
  reason,
  suggestion,
}) {
  return {
    file,
    kind,
    line,
    reason,
    suggestion,
  };
}

function lineFinding(file, kind, lineIndex, reason, suggestion) {
  return finding({
    file,
    kind,
    line: lineIndex + 1,
    reason,
    suggestion,
  });
}

function detectCookieHeaderValue(value) {
  const cookieValue = stripWrappingQuotes(value);
  if (isPlaceholderValue(cookieValue)) {
    return false;
  }

  return /(?:^|;\s*)[A-Za-z0-9_.-]{2,}=([^\s;]{12,})/u.test(cookieValue);
}

function detectBearerTokenValue(value) {
  const token = stripWrappingQuotes(value);
  return !isPlaceholderValue(token)
    && token.length >= 24
    && TOKEN_VALUE_PATTERN.test(token);
}

function detectAssignmentSecretValue(value, minimumLength) {
  const secret = stripWrappingQuotes(value);
  return !isPlaceholderValue(secret)
    && secret.length >= minimumLength
    && TOKEN_VALUE_PATTERN.test(secret);
}

function auditSecretLikeLines(file, lines) {
  const findings = [];

  for (const [lineIndex, line] of lines.entries()) {
    const cookieMatch = line.match(/\b(?:Cookie|Set-Cookie):\s*(?<value>.+)$/iu);
    if (cookieMatch?.groups?.value && detectCookieHeaderValue(cookieMatch.groups.value)) {
      findings.push(lineFinding(
        file,
        'secret-cookie-header',
        lineIndex,
        'specs must not persist actual Cookie or Set-Cookie header values',
        'replace the value with [redacted] and keep only the validation boundary in the spec',
      ));
      continue;
    }

    const smokeCookieMatch = line.match(/\bFRONTEND_SMOKE_COOKIE_HEADER\s*=\s*(?<value>.+)$/iu);
    if (smokeCookieMatch?.groups?.value && detectCookieHeaderValue(smokeCookieMatch.groups.value)) {
      findings.push(lineFinding(
        file,
        'secret-cookie-env',
        lineIndex,
        'specs must not persist actual FRONTEND_SMOKE_COOKIE_HEADER values',
        'store only the variable name and document that values stay in host-local private files',
      ));
      continue;
    }

    const bearerMatch = line.match(/\bAuthorization:\s*Bearer\s+(?<value>[^\s"'`]+|["'`][^"'`]+["'`])/iu);
    if (bearerMatch?.groups?.value && detectBearerTokenValue(bearerMatch.groups.value)) {
      findings.push(lineFinding(
        file,
        'secret-bearer-token',
        lineIndex,
        'specs must not persist bearer token values',
        'replace the token with [redacted] and keep only the auth-state category',
      ));
      continue;
    }

    const tokenMatch = line.match(/\b(?:aios_(?:access|refresh)_token|(?:access|refresh)_token|token)\s*=\s*(?<value>[^\s"'`]+|["'`][^"'`]+["'`])/iu);
    if (tokenMatch?.groups?.value && detectAssignmentSecretValue(tokenMatch.groups.value, 24)) {
      findings.push(lineFinding(
        file,
        'secret-token-assignment',
        lineIndex,
        'specs must not persist token assignments',
        'store only the env/key name and redact the value',
      ));
      continue;
    }

    const passwordMatch = line.match(/\bpassword\s*=\s*(?<value>[^\s"'`]+|["'`][^"'`]+["'`])/iu);
    if (passwordMatch?.groups?.value && detectAssignmentSecretValue(passwordMatch.groups.value, 10)) {
      findings.push(lineFinding(
        file,
        'secret-password-assignment',
        lineIndex,
        'specs must not persist password assignments',
        'move host-local credentials outside the repo and keep specs value-free',
      ));
      continue;
    }

    if (/\/(?:Users\/[^/\s]+\/Library\/Application Support\/Google\/Chrome|home\/[^/\s]+\/\.config\/google-chrome)\/[^\s]+/u.test(line)) {
      findings.push(lineFinding(
        file,
        'browser-profile-path',
        lineIndex,
        'specs must not persist concrete Chrome profile or session-store paths',
        'state the browser validation boundary without recording user-profile paths',
      ));
    }
  }

  return findings;
}

function fencedBlockLanguage(openingLine) {
  return openingLine.replace(/^```\s*/u, '').trim().toLowerCase();
}

function listFencedBlocks(lines) {
  const blocks = [];
  let current = null;

  for (const [lineIndex, line] of lines.entries()) {
    if (!line.startsWith('```')) {
      if (current) {
        current.lines.push(line);
      }
      continue;
    }

    if (!current) {
      current = {
        language: fencedBlockLanguage(line),
        lines: [],
        startLine: lineIndex + 1,
      };
      continue;
    }

    blocks.push({
      ...current,
      endLine: lineIndex + 1,
    });
    current = null;
  }

  if (current) {
    blocks.push({
      ...current,
      endLine: lines.length,
    });
  }

  return blocks;
}

function countDiffLikeLines(lines) {
  return lines.filter((line) => (
    /^(?:diff --git|@@\s|[+-](?![+-]{2}\s*$).+)/u.test(line)
  )).length;
}

function countStackTraceLines(lines) {
  return lines.filter((line) => (
    /^\s+at\s+\S+/u.test(line) || /^\s*File ".+", line \d+/u.test(line)
  )).length;
}

function auditDumpBlocks(file, lines) {
  const findings = [];

  for (const [lineIndex, line] of lines.entries()) {
    if (/^diff --git\s/u.test(line)) {
      findings.push(lineFinding(
        file,
        'large-diff-dump',
        lineIndex,
        'specs must not persist raw git diffs',
        'move diffs to git history or a focused artifact and keep specs as short pointers',
      ));
    }
  }

  for (const block of listFencedBlocks(lines)) {
    const language = block.language.split(/\s+/u)[0] ?? '';
    const blockLineCount = block.lines.length;
    const diffLikeLines = countDiffLikeLines(block.lines);
    const stackTraceLines = countStackTraceLines(block.lines);

    if ((language === 'diff' && blockLineCount >= 12) || diffLikeLines >= 12) {
      findings.push(finding({
        file,
        kind: 'large-diff-block',
        line: block.startLine,
        reason: `fenced block contains ${diffLikeLines} diff-like lines`,
        suggestion: 'replace large diffs with a commit, artifact path, or short summary',
      }));
      continue;
    }

    if (['log', 'logs', 'output', 'trace'].includes(language) && blockLineCount >= 25) {
      findings.push(finding({
        file,
        kind: 'large-log-block',
        line: block.startLine,
        reason: `fenced ${language} block has ${blockLineCount} lines`,
        suggestion: 'store long logs in artifacts and keep only decisive lines in specs',
      }));
      continue;
    }

    if (language === 'json' && blockLineCount >= 35) {
      findings.push(finding({
        file,
        kind: 'large-json-block',
        line: block.startLine,
        reason: `fenced json block has ${blockLineCount} lines`,
        suggestion: 'summarize shape/keys or point to an artifact instead of persisting full JSON',
      }));
      continue;
    }

    if (stackTraceLines >= 5) {
      findings.push(finding({
        file,
        kind: 'stack-dump-block',
        line: block.startLine,
        reason: `fenced block contains ${stackTraceLines} stack-trace lines`,
        suggestion: 'keep the exception type and decisive frame only; move full traces to artifacts',
      }));
    }
  }

  return findings;
}

export function isTrellisSpecMarkdownFile(file) {
  return TRELLIS_SPEC_FILE_PATTERN.test(file);
}

export function listTrellisSpecMarkdownFiles(repoRoot) {
  return listGitFiles(['.trellis/spec'], {
    cwd: repoRoot,
    filter: isTrellisSpecMarkdownFile,
  });
}

export function auditTrellisSpecFile(file, content) {
  const lines = content.split(/\r?\n/u);
  const budget = budgetForFile(file);
  const fileLineCount = lineCount(content);
  const fileByteLength = byteLength(content);
  const findings = [];

  if (fileLineCount > budget.lines || fileByteLength > budget.bytes) {
    findings.push(finding({
      file,
      kind: 'file-size-budget',
      reason: `${fileLineCount} lines / ${fileByteLength} bytes exceeds ${budget.lines} lines / ${budget.bytes} bytes`,
      suggestion: 'keep specs pointer-based; move procedural detail to docs/runbooks or artifacts',
    }));
  }

  findings.push(...auditSecretLikeLines(file, lines));
  findings.push(...auditDumpBlocks(file, lines));
  return findings;
}

export function auditTrellisSpecFiles(files) {
  const specEntries = normalizeSpecEntries(files);
  const findings = specEntries.flatMap(({ file, content }) => (
    auditTrellisSpecFile(file, content)
  ));
  const totalBytes = specEntries.reduce((sum, { content }) => sum + byteLength(content), 0);

  if (totalBytes > TOTAL_SPEC_BYTES_BUDGET) {
    findings.push(finding({
      file: '.trellis/spec',
      kind: 'total-size-budget',
      reason: `${totalBytes} bytes exceeds ${TOTAL_SPEC_BYTES_BUDGET} bytes`,
      suggestion: 'trim duplicated guidance and move large operational detail to docs/runbooks',
    }));
  }

  return findings;
}

function normalizeSpecEntries(files) {
  const entries = Array.isArray(files)
    ? files
    : Object.entries(files).map(([file, content]) => ({ file, content }));
  return entries
    .filter(({ file }) => isTrellisSpecMarkdownFile(file))
    .sort((left, right) => left.file.localeCompare(right.file));
}

export function summarizeTrellisSpecFiles(files) {
  const entries = normalizeSpecEntries(files);
  const largestFiles = entries
    .map(({ file, content }) => ({
      bytes: byteLength(content),
      file,
    }))
    .sort((left, right) => right.bytes - left.bytes || left.file.localeCompare(right.file))
    .slice(0, LARGEST_SPEC_PREVIEW_COUNT);
  const totalBytes = entries.reduce((sum, { content }) => sum + byteLength(content), 0);

  return {
    fileCount: entries.length,
    hardBudgetBytes: TOTAL_SPEC_BYTES_BUDGET,
    headroomBytes: TOTAL_SPEC_BYTES_BUDGET - totalBytes,
    largestFiles,
    lowHeadroom: totalBytes > TOTAL_SPEC_BYTES_BUDGET - TOTAL_SPEC_HEADROOM_WARNING_BYTES,
    totalBytes,
    warningHeadroomBytes: TOTAL_SPEC_HEADROOM_WARNING_BYTES,
  };
}

export function formatTrellisSpecCompactWarning(summary) {
  if (!summary.lowHeadroom || summary.totalBytes > summary.hardBudgetBytes) {
    return '';
  }

  const largest = summary.largestFiles
    .map(({ file, bytes }) => `${file}:${bytes}`)
    .join(', ');
  return [
    `[${GUARD_NAME}] WARN: low total spec headroom: ${summary.totalBytes}/${summary.hardBudgetBytes} bytes; remaining=${summary.headroomBytes}; warningBelow=${summary.warningHeadroomBytes}.`,
    `[${GUARD_NAME}] Largest specs: ${largest}`,
  ].join('\n');
}

export function formatTrellisSpecCompactFindings(findings) {
  const lines = [`[${GUARD_NAME}] Trellis spec compactness violations were found:`];
  for (const item of findings) {
    lines.push(`- ${item.file}${item.line ? `:${item.line}` : ''}`);
    lines.push(`  kind: ${item.kind}`);
    lines.push(`  reason: ${item.reason}`);
    lines.push(`  suggestion: ${item.suggestion}`);
  }
  lines.push('');
  lines.push(`Default budget: <= ${DEFAULT_SPEC_BUDGET.lines} lines and <= ${DEFAULT_SPEC_BUDGET.bytes} bytes per spec.`);
  lines.push(`Large guide exception: <= ${LARGE_GUIDE_BUDGET.lines} lines and <= ${LARGE_GUIDE_BUDGET.bytes} bytes for ${[...LARGE_GUIDE_BUDGETS_BY_FILE.keys()].join(', ')}.`);
  lines.push(`Total .trellis/spec budget: <= ${TOTAL_SPEC_BYTES_BUDGET} bytes.`);
  return lines.join('\n');
}

export function runTrellisSpecCompactCheck() {
  const { fail, reportOk } = createCheckGuard(GUARD_NAME);
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const files = listTrellisSpecMarkdownFiles(repoRoot);
  const entries = files.map((file) => ({
    content: readRepoFile(repoRoot, file),
    file,
  }));
  const findings = auditTrellisSpecFiles(entries);
  const summary = summarizeTrellisSpecFiles(entries);

  if (findings.length > 0) {
    console.error(formatTrellisSpecCompactFindings(findings));
    process.exit(1);
  }

  const warning = formatTrellisSpecCompactWarning(summary);
  if (warning) {
    console.warn(warning);
  }

  reportOk(`scanned ${files.length} Trellis spec files; total=${summary.totalBytes} bytes; headroom=${summary.headroomBytes} bytes; compactness contract holds.`);
}
