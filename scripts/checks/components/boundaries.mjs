#!/usr/bin/env node

/**
 * Shared component boundary audit.
 *
 * Components under apps/web-vite/src/components must not depend on route/domain modules under
 * apps/web-vite/src/app. Domain pages may compose shared components, but shared components
 * cannot reach back into app-level routes, hooks, copy, or CSS Modules.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  checkComponentBoundaries,
  formatComponentBoundariesResult,
} from '../../lib/frontend/component-boundaries-core.mjs';

export * from '../../lib/frontend/component-boundaries-core.mjs';

const { fail } = createCheckGuard('component-boundary');

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const output = formatComponentBoundariesResult(checkComponentBoundaries({ repoRoot }));
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
