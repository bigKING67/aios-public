#!/usr/bin/env node

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  FRONTEND_BARREL_IMPORTS_GUARD_NAME,
  auditFrontendBarrelImports,
  formatFrontendBarrelImportsResult,
} from '../../lib/frontend/frontend-barrel-imports-core.mjs';

export * from '../../lib/frontend/frontend-barrel-imports-core.mjs';

const { fail } = createCheckGuard(FRONTEND_BARREL_IMPORTS_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const output = formatFrontendBarrelImportsResult(auditFrontendBarrelImports(repoRoot));
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
