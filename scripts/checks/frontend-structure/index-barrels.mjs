#!/usr/bin/env node

/**
 * Frontend index barrel file audit.
 *
 * Production frontend source should expose modules through concrete files, not
 * directory-level index barrels. Barrel files make ownership and import cost
 * harder to reason about and tend to grow into implicit public APIs.
 */

import path from 'node:path';
import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  listGitFiles,
} from '../../lib/shared/guard-utils.mjs';

const GUARD_NAME = 'frontend-index-barrels';
const FRONTEND_SOURCE_ROOTS = Object.freeze(['apps/web-vite/src']);
const INDEX_BARREL_PATTERN = /(?:^|\/)index\.(?:ts|tsx)$/;

const { fail, reportOk } = createCheckGuard(GUARD_NAME);

export function isIndexBarrel(file) {
  return INDEX_BARREL_PATTERN.test(file);
}

export function listFrontendIndexBarrels(repoRoot) {
  return listGitFiles(FRONTEND_SOURCE_ROOTS, {
    cwd: repoRoot,
    filter: isIndexBarrel,
  });
}

export function frontendIndexBarrelSuggestion(file) {
  const dir = path.dirname(file).replaceAll(path.sep, '/');
  return `import from a concrete file under ${dir}/... instead of adding ${file}`;
}

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const findings = listFrontendIndexBarrels(repoRoot);

  if (findings.length > 0) {
    console.error(`[${GUARD_NAME}] Production frontend index barrel files are not allowed:`);
    for (const file of findings) {
      console.error(`- ${file}`);
      console.error(`  ${frontendIndexBarrelSuggestion(file)}`);
    }
    console.error('\nUse concrete module files so import ownership stays explicit.');
    process.exit(1);
  }

  reportOk('no production frontend index barrel files found.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
