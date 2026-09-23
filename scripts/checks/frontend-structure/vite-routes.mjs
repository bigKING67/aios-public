#!/usr/bin/env node

/**
 * Vite runtime route registry audit.
 *
 * The Vite app is the production frontend runtime. Every apps/web-vite/src/app page
 * module should be reachable through apps/web-vite/src/routes.tsx, and every
 * lazy page import in that registry must point at an existing page module.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  listGitFiles,
  readRequiredFile,
} from '../../lib/shared/guard-utils.mjs';
import {
  listAppPageFiles,
} from '../../lib/frontend/app-route-paths.mjs';
import {
  loadRoutePaths,
} from '../../lib/frontend/vite-route-paths.mjs';
import {
  ROUTES_FILE,
  VITE_ROUTE_REGISTRY_GUARD_NAME,
  auditViteRouteRegistry,
  formatViteRouteRegistryFailure,
  resolveLazyPageImport,
  summarizeViteRouteRegistryAudit,
} from '../../lib/frontend/vite-route-registry-core.mjs';

export {
  ROUTES_FILE,
  VITE_ROUTE_REGISTRY_GUARD_NAME,
  auditViteRouteRegistry,
  formatViteRouteRegistryFailure,
  normalizeAppSpecifier,
  parseLazyImports,
  parseRouteElements,
  resolveLazyPageImport,
  resolveLazyPageImportWithExists,
  summarizeViteRouteRegistryAudit,
} from '../../lib/frontend/vite-route-registry-core.mjs';

const { fail, reportOk } = createCheckGuard(VITE_ROUTE_REGISTRY_GUARD_NAME);

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const routesSource = readRequiredFile(repoRoot, ROUTES_FILE, fail, {
    missingMessage: `${ROUTES_FILE} not found.`,
  });
  const routePaths = loadRoutePaths(repoRoot);
  const pageFiles = listAppPageFiles(repoRoot, { listGitFiles });

  const result = auditViteRouteRegistry({
    pageFiles,
    routePaths,
    routesSource,
    resolveLazyPageImport: (specifier) => resolveLazyPageImport(repoRoot, specifier),
  });

  if (result.findings.length > 0) {
    console.error(formatViteRouteRegistryFailure(result.findings));
    process.exit(1);
  }

  reportOk(summarizeViteRouteRegistryAudit(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
