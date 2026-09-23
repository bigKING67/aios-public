#!/usr/bin/env node

/**
 * Route access coverage audit.
 *
 * App pages, navigation visibility, and auth-navigation share one route policy
 * registry. This guard prevents new app routes from relying on the default
 * allow path in canAccessPath().
 */

import {
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

import {
  assertRepoRoot,
  createCheckGuard,
  createLineStartOffsets,
  getRepoRoot,
  lineNumberForOffset,
  listGitFiles,
  readRequiredFile,
  repoFileExists,
} from '../../lib/shared/guard-utils.mjs';
import {
  listAppPageFiles,
} from '../../lib/frontend/app-route-paths.mjs';
import {
  loadRoutePaths,
  parseViteRoutePaths,
} from '../../lib/frontend/vite-route-paths.mjs';
import {
  AUTH_NAVIGATION_FILE,
  ROUTE_POLICY_GOVERNANCE_FILE,
  ROUTE_POLICY_REGISTRY_FILE,
  VITE_ROUTES_FILE,
  auditRouteAccessCoverage,
  collectAuthNavigationRegistryFindings,
} from '../../lib/frontend/route-access-coverage-core.mjs';

export {
  AUTH_NAVIGATION_FILE,
  ROUTE_POLICY_GOVERNANCE_FILE,
  ROUTE_POLICY_REGISTRY_FILE,
  VITE_ROUTES_FILE,
  auditRouteAccessCoverage,
  buildRouteAccessAppRoutes,
  collectAuthNavigationRegistryFindings,
  collectPolicyPageDriftWithExists,
  extractImportedRelativeModules,
  findFunctionSource,
  isProtectedPageWithAccess,
  readExistingModuleSourceWithAccess,
} from '../../lib/frontend/route-access-coverage-core.mjs';

const GUARD_NAME = 'route-access-coverage';
const { fail, reportOk } = createCheckGuard(GUARD_NAME);

async function bundleEntry(entryPoint, name) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'aios-route-access-'));
  const outputFile = path.join(tempDir, `${name}.mjs`);

  await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    entryPoints: [entryPoint],
    external: [],
    format: 'esm',
    logLevel: 'silent',
    outfile: outputFile,
    platform: 'node',
    target: 'node20',
  });

  return {
    cleanup: () => rmSync(tempDir, { force: true, recursive: true }),
    moduleUrl: pathToFileURL(outputFile).href,
  };
}

function assertAuthNavigationUsesRegistry(authNavigationSource) {
  const [firstFinding] = collectAuthNavigationRegistryFindings(authNavigationSource);
  if (firstFinding) {
    fail(firstFinding);
  }
}

function printFindings(header, findings, footer) {
  if (findings.length === 0) {
    return;
  }

  console.error(`[${GUARD_NAME}] ${header}`);
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  console.error(`\n${footer}`);
  process.exit(1);
}

async function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const authNavigationSource = readRequiredFile(repoRoot, AUTH_NAVIGATION_FILE, fail, {
    missingMessage: `${AUTH_NAVIGATION_FILE} not found.`,
  });
  readRequiredFile(repoRoot, ROUTE_POLICY_REGISTRY_FILE, fail, {
    missingMessage: `${ROUTE_POLICY_REGISTRY_FILE} not found.`,
  });
  readRequiredFile(repoRoot, ROUTE_POLICY_GOVERNANCE_FILE, fail, {
    missingMessage: `${ROUTE_POLICY_GOVERNANCE_FILE} not found.`,
  });
  const viteRoutesSource = readRequiredFile(repoRoot, VITE_ROUTES_FILE, fail, {
    missingMessage: `${VITE_ROUTES_FILE} not found.`,
  });
  const parsedViteRoutes = parseViteRoutePaths(viteRoutesSource, loadRoutePaths(repoRoot));
  printFindings(
    `${VITE_ROUTES_FILE} contains unresolved route path expressions:`,
    parsedViteRoutes.unresolved.map((reference) => `${reference.line}: ${reference.expression}`),
    `Resolve these route path expressions before relying on route access coverage.`,
  );

  const registryBundle = await bundleEntry(ROUTE_POLICY_GOVERNANCE_FILE, 'route-policy-governance');
  const registryModule = await import(`${registryBundle.moduleUrl}?cacheBust=${Date.now()}`);
  const findRoutePolicyEntry = registryModule.findRoutePolicyEntry;
  const routePolicyEntries = [
    ...(registryModule.PUBLIC_ROUTE_POLICY_ENTRIES ?? []),
    ...(registryModule.PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES ?? []),
    ...(registryModule.PROTECTED_ROUTE_GOVERNANCE_ENTRIES ?? []),
  ];
  registryBundle.cleanup();

  const findPolicyFunction = typeof findRoutePolicyEntry === 'function';
  if (!findPolicyFunction) {
    fail(`${ROUTE_POLICY_REGISTRY_FILE} must export findRoutePolicyEntry().`);
  }
  assertAuthNavigationUsesRegistry(authNavigationSource);

  const result = auditRouteAccessCoverage({
    appPageFiles: listAppPageFiles(repoRoot, { listGitFiles }),
    authNavigationSource,
    fileExists: (filePath) => repoFileExists(repoRoot, filePath),
    findRoutePolicyEntry,
    readFile: (filePath) => readRequiredFile(repoRoot, filePath, fail),
    routePolicyEntries,
    viteRoutePaths: parsedViteRoutes.paths,
  });
  if (result.status === 'fail' && result.type === 'error') {
    fail(result.message);
  }
  if (result.status === 'fail') {
    printFindings(result.header, result.findings, result.footer);
  }

  const lineStarts = createLineStartOffsets(authNavigationSource);
  reportOk(
    `scanned ${result.appRoutes.length} app routes; canAccessPath starts at line ${lineNumberForOffset(lineStarts, result.canAccessFunction.start)} and uses explicit route policy + Vite coverage.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
