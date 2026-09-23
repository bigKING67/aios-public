import { parseRoutePathsObject, parseViteRoutePaths } from './vite-route-paths.mjs';
import {
  collectRoutePolicyRegistryStructureFindings,
  formatRoutePolicyRegistryStructureFailure,
  summarizeRoutePolicyRegistryStructure,
  unresolvedViteRouteFindings,
} from './route-policy-registry-structure-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('route policy registry structure behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

function defaultRoutesSource(extraRoutes = '') {
  return `
export function AppRoutes() {
  return (
    <>
      <Route path="/" />
      <Route path="/dashboard" />
      <Route path="/dashboard/creator" />
      <Route path="/dashboard/creator/live" />
      <Route path="/admin/users" />
      ${extraRoutes}
    </>
  );
}
`;
}

function parseRegistryObjectSource(source, name) {
  const match = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`).exec(source);
  if (!match) {
    return [];
  }

  const entries = [];
  const objectPattern = /\{[\s\S]*?\}/g;
  let objectMatch;
  while ((objectMatch = objectPattern.exec(match[1])) !== null) {
    const objectSource = objectMatch[0];
    const pathMatch = /\bpath:\s*['"]([^'"]+)['"]/.exec(objectSource);
    const kindMatch = /\bkind:\s*['"]([^'"]+)['"]/.exec(objectSource);
    const pageMatch = /\bpage:\s*['"]([^'"]+)['"]/.exec(objectSource);
    if (!pathMatch || !kindMatch) {
      continue;
    }

    entries.push({
      path: pathMatch[1],
      kind: kindMatch[1],
      ...(pageMatch ? { page: pageMatch[1] } : {}),
    });
  }

  return entries;
}

function createRegistryFromSource(source) {
  const PUBLIC_ROUTE_POLICY_ENTRIES = parseRegistryObjectSource(source, 'PUBLIC_ROUTE_POLICY_ENTRIES');
  const PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES = parseRegistryObjectSource(source, 'PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES');
  const PROTECTED_ROUTE_POLICY_ENTRIES = parseRegistryObjectSource(source, 'PROTECTED_ROUTE_POLICY_ENTRIES');

  return {
    PUBLIC_ROUTE_POLICY_ENTRIES,
    PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES,
    PROTECTED_ROUTE_POLICY_ENTRIES,
    PROTECTED_ROUTE_GOVERNANCE_ENTRIES: PROTECTED_ROUTE_POLICY_ENTRIES,
    ROUTE_POLICY_ENTRIES: [
      ...PUBLIC_ROUTE_POLICY_ENTRIES,
      ...PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES,
      ...PROTECTED_ROUTE_POLICY_ENTRIES,
    ],
    normalizeRoutePolicyPath(pathValue = '/') {
      const normalized = pathValue.trim();
      if (!normalized) {
        return '/';
      }
      const withoutQuery = normalized.split('?')[0].split('#')[0] || '/';
      const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
      return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
    },
  };
}

function runAudit(registrySource, routesSource, registryTransform = (registry) => registry) {
  const parsedViteRoutes = parseViteRoutePaths(
    routesSource,
    parseRoutePathsObject(registrySource),
  );
  const registry = registryTransform(createRegistryFromSource(registrySource));
  const findings = [
    ...unresolvedViteRouteFindings(parsedViteRoutes.unresolved),
    ...collectRoutePolicyRegistryStructureFindings(registry, parsedViteRoutes.paths),
  ];

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[route-policy-registry-structure] OK: ${summarizeRoutePolicyRegistryStructure({
        registry,
        viteRoutePaths: parsedViteRoutes.paths,
      })}\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatRoutePolicyRegistryStructureFailure(findings)}\n`,
  };
}

function withFixture(registrySource, assertion, options = {}) {
  assertion(runAudit(
    registrySource,
    options.routesSource ?? defaultRoutesSource(options.extraRoutes ?? ''),
    options.registryTransform,
  ));
}

function constantRoutesSource() {
  return `
import { ROUTE_PATHS } from '@/lib/route-policy-registry';

export function AppRoutes() {
  return (
    <>
      <Route path={ROUTE_PATHS.home} />
      <Route path={ROUTE_PATHS.dashboard} />
      <Route path={ROUTE_PATHS.dashboardCreator} />
      <Route path={ROUTE_PATHS.dashboardCreatorLive} />
      <Route path={ROUTE_PATHS.adminUsers} />
    </>
  );
}
`;
}

function registrySource({
  aliasEntries = "{ path: '/dashboard/creator', kind: 'creator_dashboard' },",
  extraProtectedEntries = '',
} = {}) {
  return `
export const ROUTE_PATHS = {
  home: '/',
  dashboard: '/dashboard',
  dashboardCreator: '/dashboard/creator',
  dashboardCreatorLive: '/dashboard/creator/live',
  adminUsers: '/admin/users',
} as const;

export const PUBLIC_ROUTE_POLICY_ENTRIES = [
  { path: '/', kind: 'public' },
  { path: '/dashboard', kind: 'public' },
] as const;

export const PROTECTED_ROUTE_POLICY_ENTRIES = [
  {
    path: '/dashboard/creator/live',
    kind: 'creator_dashboard',
    page: 'apps/web-vite/src/app/dashboard/creator/live/page.tsx',
  },
  {
    path: '/admin/users',
    kind: 'admin',
    page: 'apps/web-vite/src/app/admin/users/page.tsx',
  },
  ${extraProtectedEntries}
] as const;

export const PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES = [
  ${aliasEntries}
] as const;

export const ROUTE_POLICY_ENTRIES = [
  ...PUBLIC_ROUTE_POLICY_ENTRIES,
  ...PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES,
  ...PROTECTED_ROUTE_POLICY_ENTRIES,
] as const;

export function normalizeRoutePolicyPath(path = '/') {
  const normalized = path.trim();
  if (!normalized) {
    return '/';
  }
  const withoutQuery = normalized.split('?')[0].split('#')[0] || '/';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : \`/\${withoutQuery}\`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\\/+$/, '') : withLeadingSlash;
}
`;
}

export function runRoutePolicyRegistryStructureBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture(registrySource(), (result) => {
    assertEqual(result.status, 0, 'valid registry structure should pass');
    assertIncludes(
      result.stdout,
      'passed structural checks',
      'passing output should report structural checks',
    );
  });

  withFixture(registrySource(), (result) => {
    assertEqual(result.status, 0, 'ROUTE_PATHS-based Vite route structure should pass');
    assertIncludes(
      result.stdout,
      'passed structural checks',
      'constant route output should report structural checks',
    );
  }, {
    routesSource: constantRoutesSource(),
  });

  withFixture(registrySource({
    extraProtectedEntries: "{ path: '/marketing/content-assets/:assetId', kind: 'admin', page: 'apps/web-vite/src/app/marketing/content-assets/[assetId]/page.tsx' },",
  }), (result) => {
    assertEqual(result.status, 0, 'dynamic app page route structure should pass');
    assertIncludes(
      result.stdout,
      'passed structural checks',
      'dynamic route output should report structural checks',
    );
  }, {
    extraRoutes: '<Route path="/marketing/content-assets/:assetId" />',
  });

  withFixture(registrySource({
    extraProtectedEntries: "{ path: '/dashboard', kind: 'admin', page: 'apps/web-vite/src/app/admin/page.tsx' },",
  }), (result) => {
    assertEqual(result.status, 1, 'duplicate normalized paths should fail');
    assertIncludes(
      result.stderr,
      '/dashboard is registered more than once',
      'duplicate route path should be reported',
    );
  });

  withFixture(registrySource({
    extraProtectedEntries: "{ path: '/profile', kind: 'admin', page: 'apps/web-vite/src/app/profile/_components/profile-page-client.tsx' },",
  }), (result) => {
    assertEqual(result.status, 1, 'protected policy page metadata must point to app page files');
    assertIncludes(
      result.stderr,
      '/profile protected policy page must be a apps/web-vite/src/app page file: apps/web-vite/src/app/profile/_components/profile-page-client.tsx.',
      'non-page policy metadata should be reported',
    );
  }, {
    extraRoutes: '<Route path="/profile" />',
  });

  withFixture(registrySource({
    extraProtectedEntries: "{ path: '/profile-old', kind: 'admin', page: 'apps/web-vite/src/app/profile/page.tsx' },",
  }), (result) => {
    assertEqual(result.status, 1, 'protected policy page metadata route drift should fail');
    assertIncludes(
      result.stderr,
      '/profile-old protected policy page apps/web-vite/src/app/profile/page.tsx resolves to /profile.',
      'page route drift should be reported',
    );
  }, {
    extraRoutes: '<Route path="/profile-old" />',
  });

  withFixture(registrySource(), (result) => {
    assertEqual(result.status, 1, 'missing protected governance metadata should fail');
    assertIncludes(
      result.stderr,
      '/admin/users protected policy entry is missing governance metadata.',
      'missing governance metadata should be reported',
    );
  }, {
    registryTransform: (registry) => ({
      ...registry,
      PROTECTED_ROUTE_GOVERNANCE_ENTRIES: registry.PROTECTED_ROUTE_GOVERNANCE_ENTRIES.filter(
        (entry) => entry.path !== '/admin/users',
      ),
    }),
  });

  withFixture(registrySource(), (result) => {
    assertEqual(result.status, 1, 'orphan protected governance metadata should fail');
    assertIncludes(
      result.stderr,
      '/ghost governance metadata has no protected policy entry.',
      'orphan governance metadata should be reported',
    );
  }, {
    registryTransform: (registry) => ({
      ...registry,
      PROTECTED_ROUTE_GOVERNANCE_ENTRIES: [
        ...registry.PROTECTED_ROUTE_GOVERNANCE_ENTRIES,
        {
          path: '/ghost',
          kind: 'admin',
          page: 'apps/web-vite/src/app/ghost/page.tsx',
        },
      ],
    }),
  });

  withFixture(registrySource({
    aliasEntries: "{ path: '/dashboard/creator', kind: 'admin' },",
  }), (result) => {
    assertEqual(result.status, 1, 'alias kind drift should fail');
    assertIncludes(
      result.stderr,
      '/dashboard/creator alias kind admin must match child /dashboard/creator/live kind creator_dashboard.',
      'alias child kind mismatch should be reported',
    );
  });

  withFixture(registrySource({
    aliasEntries: "{ path: '/ghost', kind: 'admin' },",
  }), (result) => {
    assertEqual(result.status, 1, 'orphan alias should fail');
    assertIncludes(
      result.stderr,
      '/ghost alias must be a registered Vite route or a prefix of protected children.',
      'orphan alias should be reported',
    );
  });

  withFixture(registrySource({
    aliasEntries: '',
  }), (result) => {
    assertEqual(result.status, 1, 'public parent shadowing intermediate protected redirect route should fail');
    assertIncludes(
      result.stderr,
      '/dashboard public policy would shadow descendant route /dashboard/creator; add an explicit protected or alias policy entry.',
      'public parent shadow finding should be reported',
    );
  });

  return 'valid, duplicate, page/governance metadata, alias-kind, orphan-alias, and public-shadow route policy structure fixtures passed.';
}
