/**
 * Protected route and navigation policy consistency check helpers.
 *
 * Route registration, page-level ProtectedRoute wrappers, Layout menu
 * visibility, and auth-navigation policy must describe the same protected
 * surface. This guard catches drift where a route is visible but not protected,
 * protected but not menu-tested, or auth-navigation silently defaults to allow.
 */

import { pathToFileURL } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

import {
  loadRoutePaths,
  parseViteRoutePaths,
} from './vite-route-paths.mjs';
import {
  allowedContextForKind,
  canAccessPathFactory,
  collectLayoutMenuKeyTargetFindings,
  collectLayoutPathLiterals,
  collectNavigationPolicySourceFindings,
  collectProtectedRoutePolicyPropFindings,
  collectProtectedRouteSourceRouteConstantFindings,
  identity,
  protectedComponentImportName,
  resolveRoutePathExpression,
  routePathConstantNameForValue,
} from './protected-navigation-consistency-core.mjs';

const LAYOUT_NAVIGATION_SOURCE_FILES = Object.freeze([
  'apps/web-vite/src/components/organisms/layout.tsx',
  'apps/web-vite/src/components/organisms/layout-navigation-model.tsx',
  'apps/web-vite/src/components/organisms/layout-route-selection.ts',
]);

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Protected navigation consistency check requires guard assertions.');
  }
  return activeAssertions;
}

function assert(...args) {
  currentAssertions().assert(...args);
}

function assertDeepEqual(...args) {
  currentAssertions().assertDeepEqual(...args);
}

function assertFalse(...args) {
  currentAssertions().assertFalse(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

function assertTrue(...args) {
  currentAssertions().assertTrue(...args);
}

async function bundleEntry(entryPoint, name) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'aios-protected-navigation-'));
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

function readSource(filePath) {
  return readFileSync(filePath, 'utf8');
}

function readLayoutNavigationSource() {
  return LAYOUT_NAVIGATION_SOURCE_FILES.map((filePath) => readSource(filePath)).join('\n');
}

function parseRegisteredViteRoutePaths() {
  const routeSource = readSource('apps/web-vite/src/routes.tsx');
  const parsedRoutes = parseViteRoutePaths(routeSource, loadRoutePaths(process.cwd()));

  assertDeepEqual(
    parsedRoutes.unresolved.map((reference) => ({
      expression: reference.expression,
      line: reference.line,
    })),
    [],
    'apps/web-vite/src/routes.tsx route path expressions must resolve',
  );

  return parsedRoutes.paths;
}

function assertRegisteredRoute(routePath, registeredViteRoutePaths) {
  assert(
    registeredViteRoutePaths.has(routePath),
    `${routePath} must be registered in apps/web-vite/src/routes.tsx`,
  );
}

function assertProtectedRoute(expectation) {
  assert(
    existsSync(expectation.page),
    `${expectation.route} expected page file is missing: ${expectation.page}`,
  );
  const pageSource = readSource(expectation.page);
  const protectedSource = expectation.importedProtectedComponent
    ? readSource(expectation.importedProtectedComponent)
    : pageSource;

  if (expectation.importedProtectedComponent) {
    assert(
      existsSync(expectation.importedProtectedComponent),
      `${expectation.route} expected protected component is missing: ${expectation.importedProtectedComponent}`,
    );
    const importedName = protectedComponentImportName(expectation.importedProtectedComponent);
    assert(
      Boolean(importedName) && pageSource.includes(importedName),
      `${expectation.route} page should import its protected client component`,
    );
  }

  assertIncludes(
    protectedSource,
    '<ProtectedRoute',
    `${expectation.route} must render through ProtectedRoute`,
  );
  assertProtectedRoutePolicyProps(expectation, protectedSource);
}

function assertProtectedRoutePolicyProps(expectation, protectedSource) {
  const findings = collectProtectedRoutePolicyPropFindings(expectation, protectedSource);
  assertDeepEqual(
    findings,
    [],
    findings[0] ?? `${expectation.route} ProtectedRoute policy props must match route policy kind`,
  );
}

function assertLayoutMentionsProtectedSurface(protectedMenuPaths, routePaths) {
  const layoutSource = readLayoutNavigationSource();

  assertIncludes(
    layoutSource,
    'canAccessPath(path, permissions, roles, routeAccessIdentity, isAuthenticated)',
    'Layout menu visibility must use auth-navigation canAccessPath',
  );

  for (const routePath of protectedMenuPaths) {
    const constantName = routePathConstantNameForValue(routePaths, routePath);
    assert(
      layoutSource.includes(routePath) ||
        (constantName && layoutSource.includes(`ROUTE_PATHS.${constantName}`)),
      `Layout should mention protected menu route ${routePath}`,
    );
  }
}

function assertLayoutRouteConstants(layoutSource) {
  assertIncludes(
    layoutSource,
    "import { ROUTE_PATHS } from '@/lib/route-policy-registry'",
    'Layout route paths must come from route policy registry constants',
  );

  const rawRouteLiteralPatterns = [
    /\bcanAccess\(\s*['"][^'"]+['"]\s*\)/g,
    /\bbuildLoginRedirectHref\(\s*['"][^'"]+['"]\s*\)/g,
    /\bkey:\s*['"]\/[^'"]*['"]/g,
    /\bto=["']\/[^"']*["']/g,
  ];
  const rawRouteLiterals = rawRouteLiteralPatterns.flatMap((pattern) => {
    pattern.lastIndex = 0;
    return [...layoutSource.matchAll(pattern)].map((match) => match[0]);
  });

  assertDeepEqual(
    rawRouteLiterals,
    [],
    'Layout menu route paths must use ROUTE_PATHS constants instead of raw route literals',
  );
}

function assertLayoutMenuKeyToConsistency(layoutSource, routePaths) {
  assertDeepEqual(
    collectLayoutMenuKeyTargetFindings(layoutSource, routePaths),
    [],
    'Layout route menu items must keep key and Link target synchronized',
  );
}

function assertLayoutPathsUseRoutePolicyRegistry(registry, protectedMenuPaths) {
  const layoutSource = readLayoutNavigationSource();
  assertLayoutRouteConstants(layoutSource);
  assertLayoutMenuKeyToConsistency(layoutSource, registry.ROUTE_PATHS);

  const routePolicyPaths = new Set(
    registry.ROUTE_POLICY_ENTRIES.map((entry) => registry.normalizeRoutePolicyPath(entry.path)),
  );
  const layoutPathLiterals = collectLayoutPathLiterals(layoutSource, registry.ROUTE_PATHS);

  const unknownLayoutPaths = layoutPathLiterals
    .map((pathLiteral) => ({
      literal: pathLiteral,
      normalized: registry.normalizeRoutePolicyPath(pathLiteral),
    }))
    .filter(({ normalized }) => !routePolicyPaths.has(normalized));

  assertDeepEqual(
    unknownLayoutPaths,
    [],
    'Layout route literals must all resolve to explicit route policy entries',
  );

  const layoutCanAccessPaths = new Set(
    [...layoutSource.matchAll(/\bcanAccess\(\s*(['"][^'"]+['"]|ROUTE_PATHS\.[A-Za-z0-9_]+)\s*\)/g)]
      .map((match) => resolveRoutePathExpression(match[1].replace(/^['"]|['"]$/g, ''), registry.ROUTE_PATHS))
      .map((pathLiteral) => registry.normalizeRoutePolicyPath(pathLiteral)),
  );

  for (const routePath of protectedMenuPaths) {
    assert(
      layoutCanAccessPaths.has(registry.normalizeRoutePolicyPath(routePath)),
      `Layout protected menu route ${routePath} must be guarded by canAccess()`,
    );
  }
}

function assertNavigationPolicySource(policyPaths) {
  const findings = collectNavigationPolicySourceFindings(
    readSource('apps/web-vite/src/lib/auth-navigation.ts'),
    policyPaths,
  );
  assertDeepEqual(findings, [], findings[0] ?? 'auth-navigation policy source should match route policy registry contract');
}

function assertProtectedRouteSourceUsesRoutePathConstants() {
  const findings = collectProtectedRouteSourceRouteConstantFindings(
    readSource('apps/web-vite/src/components/protected-route.tsx'),
  );
  assertDeepEqual(findings, [], findings[0] ?? 'ProtectedRoute internal navigation paths must use route constants');
}

function assertProtectedPolicyEntryBehavior(canAccess, entry) {
  assertFalse(
    canAccess(entry.path, { ...allowedContextForKind(entry.kind), isAuthenticated: false }),
    `${entry.path} must require authentication even when kind-specific access is present`,
  );

  if (
    entry.kind !== 'authenticated' &&
    entry.kind !== 'content_assets' &&
    entry.kind !== 'sample_inventory'
  ) {
    assertFalse(
      canAccess(entry.path, { roles: [], permissions: [] }),
      `${entry.path} must not allow regular authenticated users without kind-specific access`,
    );
  }

  assertTrue(
    canAccess(entry.path, allowedContextForKind(entry.kind)),
    `${entry.path} must allow the expected ${entry.kind} access context`,
  );
}

export async function runProtectedNavigationConsistencyCheck(assertions) {
  useAssertions(assertions);

  const registryBundle = await bundleEntry('apps/web-vite/src/lib/route-policy-governance.ts', 'route-policy-governance');
  const authNavigationBundle = await bundleEntry('apps/web-vite/src/lib/auth-navigation.ts', 'auth-navigation');
  try {
  const {
    AUTH_NAVIGATION_POLICY_PATHS,
    PROTECTED_LAYOUT_MENU_PATHS,
    PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES,
    PROTECTED_ROUTE_POLICY_ENTRIES,
    PROTECTED_ROUTE_GOVERNANCE_ENTRIES,
    ROUTE_POLICY_ENTRIES,
    ROUTE_PATHS,
    normalizeRoutePolicyPath,
  } = await import(`${registryBundle.moduleUrl}?cacheBust=${Date.now()}`);
  const {
    AUTH_NAVIGATION_FALLBACK_PATHS,
    canAccessPath,
    resolveSafeEntryPath,
  } = await import(`${authNavigationBundle.moduleUrl}?cacheBust=${Date.now()}`);
  const canAccess = canAccessPathFactory(canAccessPath);
  const explicitRoutePolicyPaths = new Set(
    ROUTE_POLICY_ENTRIES.map((entry) => normalizeRoutePolicyPath(entry.path)),
  );
  const registeredViteRoutePaths = parseRegisteredViteRoutePaths();

  for (const fallbackPath of AUTH_NAVIGATION_FALLBACK_PATHS) {
    assert(
      explicitRoutePolicyPaths.has(normalizeRoutePolicyPath(fallbackPath)),
      `auth-navigation fallback path ${fallbackPath} must have an explicit route policy entry`,
    );
  }

  assertDeepEqual(
    PROTECTED_ROUTE_GOVERNANCE_ENTRIES.map((entry) => entry.path),
    PROTECTED_ROUTE_POLICY_ENTRIES.map((entry) => entry.path),
    'protected route governance metadata must cover every runtime policy entry in order',
  );

  for (const expectation of PROTECTED_ROUTE_GOVERNANCE_ENTRIES) {
    assertRegisteredRoute(expectation.path, registeredViteRoutePaths);
    assertProtectedRoute({
      ...expectation,
      route: expectation.path,
    });
  }
  assertLayoutMentionsProtectedSurface(PROTECTED_LAYOUT_MENU_PATHS, ROUTE_PATHS);
  assertLayoutPathsUseRoutePolicyRegistry(
    {
      ROUTE_POLICY_ENTRIES,
      ROUTE_PATHS,
      normalizeRoutePolicyPath,
    },
    PROTECTED_LAYOUT_MENU_PATHS,
  );
  assertNavigationPolicySource(AUTH_NAVIGATION_POLICY_PATHS);
  assertProtectedRouteSourceUsesRoutePathConstants();

  for (const entry of [
    ...PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES,
    ...PROTECTED_ROUTE_POLICY_ENTRIES,
  ]) {
    assertProtectedPolicyEntryBehavior(canAccess, entry);
  }

  assertTrue(canAccess(ROUTE_PATHS.dashboard), 'public dashboard should remain visible');
  assertFalse(
    canAccess(ROUTE_PATHS.dashboardCreatorLive, { isAuthenticated: false, roles: ['admin'] }),
    'creator dashboard route must require authentication even for admin role',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.dashboardCreatorLive, { roles: ['dashboard_view'] }),
    'dashboard_view role should allow creator dashboard menu and route access',
  );
  assertFalse(
    canAccess(ROUTE_PATHS.dashboardCreatorLive, { roles: [], permissions: [] }),
    'regular authenticated user should not access creator dashboard without role',
  );

  assertFalse(
    canAccess(ROUTE_PATHS.reportsWeekly, { isAuthenticated: false, permissions: ['reports:read'] }),
    'report permission must not bypass authentication',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.reportsWeekly, { permissions: ['reports:read'] }),
    'report read permission should allow report navigation and route access',
  );
  assertFalse(
    canAccess(ROUTE_PATHS.exports, { permissions: ['reports:read'] }),
    'report read permission should not imply export access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.exports, { permissions: ['exports:create'] }),
    'export permission should allow exports navigation and route access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketing, { roles: ['bd'] }),
    'BD role should allow marketing overview as the creator-library parent workspace',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketing, { permissions: ['exports:create'] }),
    'export permission should allow marketing overview for industry-news/content-assets users',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketing, { roles: [], permissions: [] }),
    'regular authenticated users should allow marketing overview because industry news only requires login',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: ['marketing:creator_library:read'] }),
    'creator library permission should allow creator library route access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: ['marketing:creator_library:write'] }),
    'creator library write permission should allow creator library route access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: ['marketing:creator_library:manage'] }),
    'creator library manage permission should allow creator library route access',
  );
  assertFalse(
    canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: ['exports:create'] }),
    'export permission should not grant creator library route access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingCreatorLibrary, { roles: ['bd'] }),
    'BD role should allow creator library route access without unrelated report permissions',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingContentAssets, { permissions: ['marketing:content_assets:read'] }),
    'content assets read permission should allow content assets route access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingContentAssets, { permissions: ['marketing:content_assets:write'] }),
    'content assets write permission should allow content assets route access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingContentAssets, { roles: [], permissions: [] }),
    'regular authenticated users should allow content assets route access',
  );
  assertFalse(
    canAccess(ROUTE_PATHS.marketingContentAssets, {
      isAuthenticated: false,
      permissions: ['marketing:content_assets:read'],
    }),
    'content assets route access must still require authentication',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingIndustryNews, { roles: [], permissions: [] }),
    'regular authenticated users should allow industry news route access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingIndustryNews, { roles: ['bd'] }),
    'BD role should allow industry news route access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.marketingIndustryNews, { permissions: ['exports:create'] }),
    'export users should still allow industry news route access because it only requires login',
  );
  assertFalse(
    canAccess(ROUTE_PATHS.marketingIndustryNews, { isAuthenticated: false, permissions: ['exports:create'] }),
    'industry news route must still require authentication',
  );
  assertFalse(
    canAccess(ROUTE_PATHS.opsDataops, { isAuthenticated: false, permissions: ['dataops:view'] }),
    'DataOps permission must not bypass authentication',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.opsDataops, { permissions: ['dataops:view'] }),
    'DataOps read permission should allow DataOps navigation and route access',
  );
  assertFalse(
    canAccess(ROUTE_PATHS.adminUsers, { isAuthenticated: false, permissions: ['user:list:all'] }),
    'admin permission must not bypass authentication',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.adminUsers, { permissions: ['user:list:all'] }),
    'admin read permission should allow admin navigation and route access',
  );
  assertTrue(
    canAccess(ROUTE_PATHS.profile, { isAuthenticated: true }),
    'profile route should require only authentication',
  );

  assertTrue(
    resolveSafeEntryPath(ROUTE_PATHS.opsDataops, ['dataops:view'], [], identity(), true) === ROUTE_PATHS.opsDataops,
    'safe entry should preserve accessible preferred protected path',
  );
  assertTrue(
    resolveSafeEntryPath(ROUTE_PATHS.opsDataops, [], [], identity(), true) === ROUTE_PATHS.dashboard,
    'safe entry should fall back to dashboard when preferred protected path is forbidden',
  );
  assertTrue(
    resolveSafeEntryPath(undefined, [], ['bd'], identity(), true) === ROUTE_PATHS.marketingCreatorLibrary,
    'safe entry without a preferred path should send BD users to creator library before dashboard',
  );
  assertTrue(
    resolveSafeEntryPath('https://example.invalid/admin', ['user:list:all'], [], identity(), true) === ROUTE_PATHS.home,
    'safe entry must normalize external redirects to root',
  );

    return `${PROTECTED_ROUTE_POLICY_ENTRIES.length} protected routes, Layout menu policy, auth-navigation cases, and safe-entry redirects passed.`;
  } finally {
    registryBundle.cleanup();
    authNavigationBundle.cleanup();
  }
}
