import {
  auditCappedCountFiles,
  listGitFiles,
  repoFileExists,
} from '../shared/guard-utils.mjs';
import {
  auditInlineVisualStyleFile,
} from './inline-visual-style-parser.mjs';

export function listInlineVisualStyleSourceFiles(repoRoot, sourceRoot) {
  return listGitFiles([sourceRoot], {
    cwd: repoRoot,
    filter: (file) => /\.(?:tsx|jsx)$/.test(file),
  });
}

export function checkInlineVisualStyleAudit({
  allowlist,
  files,
  repoRoot,
  sourceDescription,
}) {
  const auditByFile = new Map();
  const auditResult = auditCappedCountFiles(files, allowlist, {
    capField: 'maxInlineVisualStyles',
    countFindings(file) {
      const findings = auditInlineVisualStyleFile(repoRoot, file);
      const audit = { file, findings, count: findings.length };
      auditByFile.set(file, audit);
      return audit;
    },
    createViolation({ audit, count, maxCount }) {
      return {
        file: audit.file,
        count,
        maxInlineVisualStyles: maxCount,
        findings: audit.findings,
        reason:
          maxCount === 0
            ? `non-allowlisted ${sourceDescription} contains inline visual styles`
            : 'inline visual styles exceeded frozen cap',
      };
    },
  });
  const { missingAllowlistEntries } = auditResult;

  for (const file of allowlist.keys()) {
    if (!repoFileExists(repoRoot, file) && !missingAllowlistEntries.includes(file)) {
      missingAllowlistEntries.push(file);
    }
  }

  const total = files.reduce((sum, file) => sum + (auditByFile.get(file)?.count ?? 0), 0);
  return {
    ...auditResult,
    auditByFile,
    total,
  };
}

export function formatInlineVisualStyleDebtSummary(total) {
  return total === 0
    ? 'clean baseline; no frozen inline visual styles.'
    : `${total} frozen inline visual styles.`;
}
