import {
  assertRepoRoot,
  getRepoRoot,
  readCappedCountAllowlistConfig,
  reportCappedCountAllowlistMaintenanceFailures,
} from '../shared/guard-utils.mjs';
import {
  checkInlineVisualStyleAudit,
  formatInlineVisualStyleDebtSummary,
  listInlineVisualStyleSourceFiles,
} from './inline-visual-style-core.mjs';

function fail(label, message) {
  console.error(`[${label}] ERROR: ${message}`);
  process.exit(1);
}

function readConfig(repoRoot, configPath, label) {
  const { allowlist } = readCappedCountAllowlistConfig(repoRoot, configPath, (message) => fail(label, message), {
    capField: 'maxInlineVisualStyles',
    missingMessage: `missing ${configPath}`,
  });
  return allowlist;
}

export function runInlineVisualStyleAudit({
  label,
  configPath,
  sourceRoot,
  sourceDescription,
}) {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, (message) => fail(label, message));

  const allowlist = readConfig(repoRoot, configPath, label);
  const files = listInlineVisualStyleSourceFiles(repoRoot, sourceRoot);
  const auditResult = checkInlineVisualStyleAudit({
    allowlist,
    files,
    repoRoot,
    sourceDescription,
  });
  const { violations } = auditResult;

  reportCappedCountAllowlistMaintenanceFailures(auditResult, {
    configPath,
    guardName: label,
    missingHeader: 'Found allowlist entries for missing files:',
    staleHeader: 'Found allowlisted files with no inline visual styles:',
    reducedHeader: 'Found allowlist caps above current inline visual style counts:',
  });

  if (violations.length > 0) {
    console.error(`[${label}] ${sourceDescription} inline visual style violations found.`);
    console.error(
      `[${label}] Prefer CSS Modules, Tailwind token aliases, or component props. Existing legacy inline visual styles are frozen and must not grow.\n`,
    );
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.count} > ${violation.maxInlineVisualStyles}`);
      console.error(`  ${violation.reason}`);
      for (const finding of violation.findings.slice(0, 8)) {
        console.error(`  ${finding.file}:${finding.lineNumber}: ${finding.line}`);
      }
    }
    process.exit(1);
  }

  console.log(
    `[${label}] OK: scanned ${files.length} ${sourceDescription} files; ${formatInlineVisualStyleDebtSummary(auditResult.total)}`,
  );
}
