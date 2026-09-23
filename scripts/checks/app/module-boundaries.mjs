#!/usr/bin/env node

/**
 * App module boundary audit.
 *
 * Route/domain modules under apps/web-vite/src/app may compose shared components and helpers,
 * but they should not casually import sibling or parent route internals. Existing
 * cross-module imports are frozen so they can be deliberately extracted or
 * promoted instead of silently spreading.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  reportCappedCountAllowlistMaintenanceFailures,
} from '../../lib/shared/guard-utils.mjs';
import {
  CONFIG_PATH,
  checkAppModuleBoundaries,
  formatAppModuleBoundarySummary,
  formatAppModuleBoundaryViolationFailures,
  listAppModuleBoundarySourceFiles,
  readAppModuleBoundaryConfig,
} from '../../lib/frontend/app-module-boundaries-core.mjs';

const { fail, reportOk } = createCheckGuard('app-module-boundary');

export {
  auditAppModuleBoundaryFile,
  auditAppModuleBoundarySource,
  buildAppModuleBoundaryConfig,
  checkAppModuleBoundaries,
  formatAppModuleBoundarySummary,
  getAppModuleRoot,
  listAppModuleBoundarySourceFiles,
  normalizeAppModuleBoundaryConfig,
  readAppModuleBoundaryConfig,
  resolveAppImport,
} from '../../lib/frontend/app-module-boundaries-core.mjs';

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const { moduleRoots, allowlist } = readAppModuleBoundaryConfig(repoRoot, { fail });
  const files = listAppModuleBoundarySourceFiles(repoRoot);
  const auditResult = checkAppModuleBoundaries({
    allowlist,
    files,
    moduleRoots,
    repoRoot,
  });
  const { violations } = auditResult;

  reportCappedCountAllowlistMaintenanceFailures(auditResult, {
    configPath: CONFIG_PATH,
    guardName: 'app-module-boundary',
    missingHeader: 'Found allowlist entries for missing files:',
    staleHeader: 'Found allowlisted files with no cross-module imports:',
    reducedHeader: 'Found allowlist caps above current cross-module import counts:',
  });

  const violationFailures = formatAppModuleBoundaryViolationFailures(violations);
  if (violationFailures) {
    console.error(violationFailures);
    process.exit(1);
  }

  reportOk(`scanned ${files.length} app files; ${formatAppModuleBoundarySummary(auditResult.total)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
