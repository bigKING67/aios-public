#!/usr/bin/env node

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  FRONTEND_SAME_DIR_ALIAS_IMPORTS_GUARD_NAME,
  auditFrontendSameDirAliasImports,
  formatFrontendSameDirAliasImportsResult,
} from '../../lib/frontend/frontend-same-dir-alias-imports-core.mjs';

export * from '../../lib/frontend/frontend-same-dir-alias-imports-core.mjs';

const { fail } = createCheckGuard(FRONTEND_SAME_DIR_ALIAS_IMPORTS_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const output = formatFrontendSameDirAliasImportsResult(auditFrontendSameDirAliasImports(repoRoot));
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
