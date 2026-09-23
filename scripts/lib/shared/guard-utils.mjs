/**
 * Backward-compatible facade for repository check guard helpers.
 *
 * Keep existing imports stable while the implementation is split by concern.
 */

export {
  createCheckGuard,
} from './guard-assertions.mjs';

export {
  auditCappedCountFiles,
  auditLineBudgetFiles,
  buildCappedCountAllowlist,
  buildLineBudgetAllowlist,
  readCappedCountAllowlistConfig,
  readLineBudgetConfig,
  reportCappedCountAllowlistMaintenanceFailures,
  reportLineBudgetFailures,
} from './guard-budgets.mjs';

export {
  assertRepoRoot,
  assertRequiredFile,
  countFileLines,
  getRepoRoot,
  listCssModuleFiles,
  listGitFiles,
  readFileLines,
  readRepoFile,
  readRepoFileLines,
  readRequiredFile,
  readRequiredJsonFile,
  readRequiredPackageJson,
  readTextFile,
  repoFileExists,
} from './guard-files.mjs';

export {
  assertGateRunOrder,
  assertRepoRelativePath,
  createLineStartOffsets,
  lineNumberForOffset,
  lineNumbersForExactLine,
  lineNumbersForNeedle,
  normalizeRepoPath,
  previousNonEmptyLine,
  requireExactLineNumber,
  requireVerifyCiRunWithAdjacentLabel,
  resolveRelativeImport,
  toPosixPath,
} from './guard-paths.mjs';
