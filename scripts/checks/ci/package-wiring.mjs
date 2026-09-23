#!/usr/bin/env node

/**
 * quality gate registry wiring audit.
 *
 * The old npm-run reachability graph was retired with quality-runner. This
 * guard now proves that package entrypoints, gate commands, metadata, and
 * registry reachability stay synchronized.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredPackageJson,
} from '../../lib/shared/guard-utils.mjs';
import {
  checkPackageWiring,
  formatPackageWiringFailure,
  PACKAGE_WIRING_GUARD_NAME,
} from '../../lib/ci/package-wiring-core.mjs';

export {
  checkPackageWiring,
  formatPackageWiringFailure,
  FULL_LINT_SURFACE_PATTERNS,
  isCoveredByFullLintSurface,
  LINTABLE_SOURCE_FILE_EXTENSIONS,
  LINTABLE_SOURCE_FILE_PATTERN,
  listTrackedLintableSourceFiles,
  PACKAGE_WIRING_BEHAVIOR_GUARD_NAME,
  PACKAGE_WIRING_GUARD_NAME,
  QUALITY_WORKFLOW_PATH,
  REQUIRED_ESLINT_IGNORES,
  REQUIRED_FULL_LINT_SCRIPT,
  REQUIRED_QUALITY_WORKFLOW_CACHE_PATHS,
  REQUIRED_QUALITY_WORKFLOW_REMOTE_CACHE_ENV,
} from '../../lib/ci/package-wiring-core.mjs';

const { fail, reportOk } = createCheckGuard(PACKAGE_WIRING_GUARD_NAME, { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const packageJson = readRequiredPackageJson(repoRoot, fail);
  const { findings, registry } = checkPackageWiring({ packageJson, repoRoot });

  if (findings.length > 0) {
    console.error(formatPackageWiringFailure(findings));
    process.exit(1);
  }

  reportOk(`${registry.gates.length} quality gates checked; ${registry.ciGateNames.length} gates in ci mode.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
