/**
 * Freezes AntD table deep selectors behind an explicit allowlist.
 *
 * New table styling should use Table column hooks (`onHeaderCell`, `onCell`),
 * `rowClassName`, or custom components instead of styling AntD's internal
 * `thead` / `tbody` / expand-icon structure directly.
 */

import {
  listGitFiles,
  readRequiredJsonFile,
  readRepoFile,
  repoFileExists,
} from '../shared/guard-utils.mjs';

export const ANTD_TABLE_SELECTOR_ALLOWLIST_PATH = 'scripts/config/allowlists/antd-table-selector-allowlist.json';
const DEFAULT_EXCEPTION_KIND = 'migration-debt';
const VALID_EXCEPTION_KINDS = new Set([DEFAULT_EXCEPTION_KIND, 'framework-internal']);

const STRUCTURAL_ANTD_TABLE_PATTERN =
  /:global\([^)]*\.ant-table-(?:thead|tbody|row|row-expand-icon)[^)]*\)/;
const WRAPPER_SCOPED_FIXED_CELL_PATTERN = /\s:global\(\.ant-table-cell-fix-(?:left|right)[^)]*\)/;

function throwFailure(message) {
  throw new Error(message);
}

export function listCssFiles(repoRoot) {
  return listGitFiles(['apps/web-vite/src'], {
    cwd: repoRoot,
    filter: (file) => file.endsWith('.css'),
  });
}

export function countAntdTableDeepSelectors(repoRoot, file) {
  const text = readRepoFile(repoRoot, file);
  const findings = [];
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const sourceLine = lines[index];
    if (
      STRUCTURAL_ANTD_TABLE_PATTERN.test(sourceLine) ||
      WRAPPER_SCOPED_FIXED_CELL_PATTERN.test(sourceLine)
    ) {
      findings.push({
        line: index + 1,
        selector: sourceLine.trim(),
      });
    }
  }

  findings.sort((left, right) => left.line - right.line || left.selector.localeCompare(right.selector));
  return {
    count: findings.length,
    file,
    findings,
  };
}

export function readSelectorAllowlist(repoRoot, options = {}) {
  const fail = options.fail ?? throwFailure;
  const config = readRequiredJsonFile(repoRoot, ANTD_TABLE_SELECTOR_ALLOWLIST_PATH, fail, {
    missingMessage: `missing ${ANTD_TABLE_SELECTOR_ALLOWLIST_PATH}`,
  });
  if (config.version !== 2) {
    fail(`${ANTD_TABLE_SELECTOR_ALLOWLIST_PATH} must use version 2`);
  }
  if (!Array.isArray(config.allowed)) {
    fail(`${ANTD_TABLE_SELECTOR_ALLOWLIST_PATH} allowed must be an array`);
  }

  const allowlist = new Map();
  const duplicatePaths = new Set();
  for (const entry of config.allowed) {
    if (!entry || typeof entry.path !== 'string' || !entry.path) {
      fail(`${ANTD_TABLE_SELECTOR_ALLOWLIST_PATH} contains an allowlist entry without a path`);
    }
    if (!Array.isArray(entry.allowedSelectors) || entry.allowedSelectors.length === 0) {
      fail(`${entry.path} allowedSelectors must be a non-empty array`);
    }
    if (allowlist.has(entry.path)) {
      duplicatePaths.add(entry.path);
    }

    const selectors = new Map();
    const duplicateSelectors = new Set();
    for (const selectorEntry of entry.allowedSelectors) {
      if (!selectorEntry || typeof selectorEntry.selector !== 'string' || !selectorEntry.selector) {
        fail(`${entry.path} contains an allowedSelectors entry without a selector`);
      }
      const exceptionKind = selectorEntry.exceptionKind ?? DEFAULT_EXCEPTION_KIND;
      if (!VALID_EXCEPTION_KINDS.has(exceptionKind)) {
        fail(
          `${entry.path} selector ${selectorEntry.selector} exceptionKind must be one of ${Array.from(VALID_EXCEPTION_KINDS).join(', ')}`,
        );
      }
      if (typeof selectorEntry.reason !== 'string' || !selectorEntry.reason.trim()) {
        fail(`${entry.path} selector ${selectorEntry.selector} must include a reason`);
      }
      if (selectors.has(selectorEntry.selector)) {
        duplicateSelectors.add(selectorEntry.selector);
      }
      selectors.set(selectorEntry.selector, {
        ...selectorEntry,
        exceptionKind,
      });
    }
    if (duplicateSelectors.size > 0) {
      fail(`${entry.path} contains duplicate allowed selectors: ${Array.from(duplicateSelectors).join(', ')}`);
    }

    allowlist.set(entry.path, {
      ...entry,
      allowedSelectors: selectors,
    });
  }

  if (duplicatePaths.size > 0) {
    fail(`${ANTD_TABLE_SELECTOR_ALLOWLIST_PATH} contains duplicate path ${Array.from(duplicatePaths).join(', ')}`);
  }

  return allowlist;
}

export function auditSelectorAllowlist(repoRoot, files, allowlist, options = {}) {
  const fail = options.fail ?? throwFailure;
  const fileSet = new Set(files);
  const missingAllowlistFiles = [];
  const staleSelectors = [];
  const violations = [];
  const allowedFindings = [];

  for (const file of allowlist.keys()) {
    if (!fileSet.has(file) || !repoFileExists(repoRoot, file)) {
      missingAllowlistFiles.push(file);
    }
  }

  for (const file of files) {
    const audit = countAntdTableDeepSelectors(repoRoot, file);
    const allowedEntry = allowlist.get(file);
    const currentSelectors = new Set(audit.findings.map((finding) => finding.selector));

    if (allowedEntry) {
      for (const [selector, selectorEntry] of allowedEntry.allowedSelectors.entries()) {
        if (!currentSelectors.has(selector)) {
          staleSelectors.push({
            file,
            selector,
          });
        }
        if (selectorEntry.path) {
          fail(`${file} selector entries must not include nested path fields`);
        }
      }
    }

    for (const finding of audit.findings) {
      const allowedSelector = allowedEntry?.allowedSelectors.get(finding.selector);
      if (allowedSelector) {
        allowedFindings.push({
          ...finding,
          exceptionKind: allowedSelector.exceptionKind,
          file,
        });
        continue;
      }

      violations.push({
        ...finding,
        file,
      });
    }
  }

  return {
    allowedFindings,
    missingAllowlistFiles,
    staleSelectors,
    violations,
  };
}

export function formatAntdTableSelectorAuditFailures(auditResult) {
  const lines = [];

  if (auditResult.missingAllowlistFiles.length > 0) {
    lines.push('[antd-table-selector-audit] Found allowlist entries for missing files:');
    for (const file of auditResult.missingAllowlistFiles) {
      lines.push(`- ${file}`);
    }
    lines.push('', `Remove stale entries from ${ANTD_TABLE_SELECTOR_ALLOWLIST_PATH}.`);
    return `${lines.join('\n')}\n`;
  }

  if (auditResult.staleSelectors.length > 0) {
    lines.push('[antd-table-selector-audit] Found stale allowed AntD table selectors:');
    for (const finding of auditResult.staleSelectors) {
      lines.push(`- ${finding.file}: ${finding.selector}`);
    }
    lines.push('', `Remove these selector entries from ${ANTD_TABLE_SELECTOR_ALLOWLIST_PATH}.`);
    return `${lines.join('\n')}\n`;
  }

  if (auditResult.violations.length > 0) {
    lines.push('[antd-table-selector-audit] AntD table deep selector violations found.');
    lines.push(
      '[antd-table-selector-audit] Prefer explicit column/row/component classes. If an AntD internal selector is unavoidable, add a frozen selector-level allowlist entry with a reason.\n',
    );
    for (const finding of auditResult.violations.slice(0, 24)) {
      lines.push(`- ${finding.file}:${finding.line}: ${finding.selector}`);
    }
    if (auditResult.violations.length > 24) {
      lines.push(`... ${auditResult.violations.length - 24} more`);
    }
    return `${lines.join('\n')}\n`;
  }

  return '';
}

export function summarizeFrozenSelectorBudget(allowedFindings) {
  const summary = {
    frameworkInternal: 0,
    migrationDebt: 0,
    total: 0,
  };

  for (const finding of allowedFindings) {
    summary.total += 1;
    if (finding.exceptionKind === 'framework-internal') {
      summary.frameworkInternal += 1;
    } else {
      summary.migrationDebt += 1;
    }
  }

  return summary;
}

export function formatSelectorBudgetSummary(filesCount, allowlistFileCount, frozenSelectorBudget) {
  const prefix = `scanned ${filesCount} CSS files; ${allowlistFileCount} allowlisted files;`;

  if (frozenSelectorBudget.total === 0) {
    return `${prefix} clean baseline; no frozen AntD table deep selectors.`;
  }

  if (frozenSelectorBudget.migrationDebt === 0) {
    return `${prefix} no migration-debt selectors; ${frozenSelectorBudget.frameworkInternal} framework-internal AntD table deep selectors accepted.`;
  }

  return `${prefix} ${frozenSelectorBudget.total} frozen AntD table deep selectors (${frozenSelectorBudget.frameworkInternal} accepted framework-internal, ${frozenSelectorBudget.migrationDebt} migration-debt).`;
}

export function runAntdTableSelectorAudit(repoRoot, options = {}) {
  const allowlist = readSelectorAllowlist(repoRoot, options);
  const files = listCssFiles(repoRoot);
  const auditResult = auditSelectorAllowlist(repoRoot, files, allowlist, options);

  const frozenSelectorBudget = summarizeFrozenSelectorBudget(auditResult.allowedFindings);
  return {
    allowlist,
    auditResult,
    files,
    frozenSelectorBudget,
    summary: formatSelectorBudgetSummary(files.length, allowlist.size, frozenSelectorBudget),
  };
}
