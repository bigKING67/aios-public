#!/usr/bin/env node

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  FRONTEND_MODULE_NAMES_GUARD_NAME,
  auditFrontendModuleNames,
  formatFrontendModuleNamesResult,
} from '../../lib/frontend/frontend-module-names-core.mjs';

export * from '../../lib/frontend/frontend-module-names-core.mjs';

const { fail } = createCheckGuard(FRONTEND_MODULE_NAMES_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const output = formatFrontendModuleNamesResult(auditFrontendModuleNames(repoRoot));
  if (output.stdout) {
    process.stdout.write(output.stdout);
  }
  if (output.stderr) {
    process.stderr.write(output.stderr);
  }
  if (output.status !== 0) {
    process.exit(output.status);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
