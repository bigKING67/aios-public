import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

async function bundleEntry(entryPoint, name) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'aios-auth-navigation-policy-'));
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

function identity(overrides = {}) {
  return {
    email: null,
    fullName: null,
    username: 'regular-user',
    ...overrides,
  };
}

function canAccessPathFactory(canAccessPath) {
  return function canAccess(pathname, options = {}) {
    return canAccessPath(
      pathname,
      options.permissions ?? [],
      options.roles ?? [],
      options.identity ?? identity(),
      options.isAuthenticated ?? true,
    );
  };
}

export async function runAuthNavigationPolicyBehaviorFixtures({
  assertDeepEqual,
  assertEqual,
  assertFalse,
  assertTrue,
}) {
  const authNavigationBundle = await bundleEntry('apps/web-vite/src/lib/auth-navigation.ts', 'auth-navigation');
  const registryBundle = await bundleEntry('apps/web-vite/src/lib/route-policy-registry.ts', 'route-policy-registry');
  try {
    const {
      AUTH_NAVIGATION_FALLBACK_PATHS,
      canAccessPath,
      resolveSafeEntryPath,
    } = await import(`${authNavigationBundle.moduleUrl}?cacheBust=${Date.now()}`);
    const {
      ROUTE_PATHS,
    } = await import(`${registryBundle.moduleUrl}?cacheBust=${Date.now()}`);
    const canAccess = canAccessPathFactory(canAccessPath);

    assertDeepEqual(
      AUTH_NAVIGATION_FALLBACK_PATHS,
      [ROUTE_PATHS.marketingCreatorLibrary, ROUTE_PATHS.dashboard, ROUTE_PATHS.reportsWeekly, ROUTE_PATHS.home],
      'safe-entry fallback order should prefer creator library for eligible business users, then public dashboard, then report fallback, then root',
    );

    assertTrue(
      canAccess(ROUTE_PATHS.reportsWeekly, { permissions: ['reports:read'], roles: [] }),
      'report read permission should make weekly report navigation visible without role fallback',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.reportsMonthly, { permissions: ['report:view:shared'], roles: [] }),
      'legacy report view permission should make monthly report navigation visible without role fallback',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.exports, { permissions: ['exports:create'], roles: [] }),
      'export permission should make export navigation visible without role fallback',
    );
    assertFalse(
      canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: ['report:export'], roles: [] }),
      'legacy export permission should not grant creator library navigation',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketing, { permissions: ['report:export'], roles: [] }),
      'legacy export permission should allow marketing overview for industry-news/content-assets users',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketing, { permissions: [], roles: [] }),
      'authenticated users should allow marketing overview because industry news is a login-only module',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketing, { permissions: [], roles: ['bd'] }),
      'BD role should allow marketing overview as the creator-library parent workspace',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: ['marketing:creator_library:read'], roles: [] }),
      'creator library read permission should make creator library route visible without export role fallback',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: ['marketing:creator_library:write'], roles: [] }),
      'creator library write permission should include creator library read/navigation access',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: ['marketing:creator_library:manage'], roles: [] }),
      'creator library manage permission should include creator library read/navigation access',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingContentAssets, { permissions: ['marketing:content_assets:read'], roles: [] }),
      'content assets read permission should make content assets route visible',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingContentAssets, { permissions: ['marketing:content_assets:write'], roles: [] }),
      'content assets write permission should include content assets navigation access',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingContentAssets, { permissions: [], roles: [] }),
      'authenticated users should make content assets route visible',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.dashboardIndustryMaterialInspiration, {
        permissions: [],
        roles: ['content_ops'],
      }),
      'content_ops role should make industry material inspiration dashboard visible',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.dashboardIndustryMaterialInspiration, {
        permissions: ['marketing:content_assets:write'],
        roles: [],
      }),
      'content assets write permission should make industry material inspiration dashboard visible',
    );
    assertFalse(
      canAccess(ROUTE_PATHS.dashboardIndustryMaterialInspiration, {
        permissions: [],
        roles: ['dashboard_view'],
      }),
      'dashboard_view alone should not make industry material inspiration dashboard visible',
    );
    assertFalse(
      canAccess(ROUTE_PATHS.marketingContentAssets, {
        permissions: ['marketing:content_assets:read'],
        roles: [],
        isAuthenticated: false,
      }),
      'content assets navigation must still require authentication',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: [], roles: ['bd'] }),
      'BD role should make creator library route visible without unrelated report permissions',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingIndustryNews, { permissions: [], roles: [] }),
      'authenticated users should make industry news route visible',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingIndustryNews, { permissions: [], roles: ['bd'] }),
      'BD role should make industry news route visible',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.marketingIndustryNews, { permissions: ['exports:create'], roles: [] }),
      'export users should still see industry news because it only requires login',
    );
    assertFalse(
      canAccess(ROUTE_PATHS.marketingIndustryNews, {
        permissions: ['exports:create'],
        roles: [],
        isAuthenticated: false,
      }),
      'industry news navigation must still require authentication',
    );
    assertFalse(
      canAccess(ROUTE_PATHS.marketingCreatorLibrary, { permissions: ['reports:read'], roles: [] }),
      'report read permission should not grant creator library navigation',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.opsDataops, { permissions: ['dataops:view'], roles: [] }),
      'dataops read permission should make DataOps navigation visible without role fallback',
    );
    assertTrue(
      canAccess(ROUTE_PATHS.adminUsers, { permissions: ['user:list:all'], roles: [] }),
      'admin read permission should make admin route visible without admin role fallback',
    );

    assertFalse(
      canAccess(ROUTE_PATHS.opsDataops, { permissions: ['dataops:view'], roles: [], isAuthenticated: false }),
      'DataOps navigation must still require authentication even when permission is present',
    );
    assertFalse(
      canAccess(ROUTE_PATHS.reportsWeekly, { permissions: [], roles: [] }),
      'weekly report navigation should stay hidden when neither role nor permission allows it',
    );
    assertFalse(
      canAccess(ROUTE_PATHS.exports, { permissions: ['reports:read'], roles: [] }),
      'report read permission should not imply export navigation access',
    );
    assertFalse(
      canAccess(ROUTE_PATHS.adminUsers, { permissions: [], roles: [] }),
      'admin route should stay hidden when neither role nor admin permission allows it',
    );
    assertFalse(
      canAccess('/not-registered', { permissions: ['user:list:all'], roles: ['admin'] }),
      'unknown route should not rely on default allow policy',
    );
    assertEqual(
      resolveSafeEntryPath('/not-registered', ['user:list:all'], ['admin'], identity(), true),
      ROUTE_PATHS.marketingCreatorLibrary,
      'safe entry should fall back to the first accessible business route when preferred route is not registered',
    );
    assertEqual(
      resolveSafeEntryPath('/not-registered', [], ['bd'], identity(), true),
      ROUTE_PATHS.marketingCreatorLibrary,
      'BD users should fall back to creator library before the generic dashboard entry',
    );
    assertEqual(
      resolveSafeEntryPath(ROUTE_PATHS.opsDataops, [], [], identity(), true),
      ROUTE_PATHS.dashboard,
      'forbidden preferred protected paths should continue to the public fallback',
    );
    assertEqual(
      resolveSafeEntryPath(ROUTE_PATHS.opsDataops, ['reports:read'], [], identity(), true),
      ROUTE_PATHS.dashboard,
      'public dashboard should be preferred when passed as an explicit accessible preferred route',
    );
    assertEqual(
      resolveSafeEntryPath(undefined, [], ['bd'], identity(), true),
      ROUTE_PATHS.marketingCreatorLibrary,
      'BD users without a preferred route should use creator library as the first safe entry',
    );
    assertEqual(
      resolveSafeEntryPath(ROUTE_PATHS.opsDataops, ['dataops:view'], [], identity(), true),
      ROUTE_PATHS.opsDataops,
      'accessible preferred protected paths should be preserved before fallbacks',
    );
    assertEqual(
      resolveSafeEntryPath('https://example.invalid/admin', ['user:list:all'], ['admin'], identity(), true),
      ROUTE_PATHS.home,
      'safe entry must normalize external redirects to root before access checks',
    );

    return 'role-or-permission, unknown route, and safe-entry navigation policy cases passed.';
  } finally {
    authNavigationBundle.cleanup();
    registryBundle.cleanup();
  }
}
