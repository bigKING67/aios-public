import { isAppPageFile } from './app-route-paths.mjs';
import { parseRoutePathsObject } from './vite-route-paths.mjs';
import {
  auditViteRouteRegistry,
  formatViteRouteRegistryFailure,
  resolveLazyPageImportWithExists,
  summarizeViteRouteRegistryAudit,
} from './vite-route-registry-core.mjs';

function routePathsForFiles(files) {
  const source = files['apps/web-vite/src/lib/route-policy-registry.ts'];
  return source ? parseRoutePathsObject(source) : {};
}

function runAudit(files) {
  const routesSource = files['apps/web-vite/src/routes.tsx'];
  if (!routesSource) {
    return {
      status: 1,
      stdout: '',
      stderr: 'apps/web-vite/src/routes.tsx not found.\n',
    };
  }

  const fileSet = new Set(Object.keys(files));
  const result = auditViteRouteRegistry({
    pageFiles: Object.keys(files).filter(isAppPageFile),
    routePaths: routePathsForFiles(files),
    routesSource,
    resolveLazyPageImport: (specifier) =>
      resolveLazyPageImportWithExists((candidate) => fileSet.has(candidate), specifier),
  });

  if (result.findings.length === 0) {
    return {
      status: 0,
      stdout: `[vite-route-registry] OK: ${summarizeViteRouteRegistryAudit(result)}\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatViteRouteRegistryFailure(result.findings)}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

function routesSource({ includeDashboard = true, dashboardPath = '/dashboard', includeUnused = false } = {}) {
  return `
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const HomePage = lazy(() => import('@/app/page'));
${includeDashboard ? "const DashboardPage = lazy(() => import('@/app/dashboard/page'));" : ''}
${includeUnused ? "const UnusedPage = lazy(() => import('@/app/unused/page'));" : ''}

export function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        ${includeDashboard ? `<Route path="${dashboardPath}" element={<DashboardPage />} />` : ''}
        <Route path="/docs/references/:slug" element={<Navigate to="/docs#references" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
`;
}

function constantRoutesSource() {
  return `
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';

const HomePage = lazy(() => import('@/app/page'));
const DashboardPage = lazy(
  () => import('@/app/dashboard/page'),
);

export function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path={ROUTE_PATHS.home} element={<HomePage />} />
        <Route path={ROUTE_PATHS.dashboard} element={<DashboardPage />} />
        <Route path={\`\${ROUTE_PATHS.docs}/references/:slug\`} element={<Navigate to={\`\${ROUTE_PATHS.docs}#references\`} replace />} />
        <Route path="*" element={<Navigate to={ROUTE_PATHS.home} replace />} />
      </Routes>
    </Suspense>
  );
}
`;
}

const baseFiles = {
  'apps/web-vite/src/app/page.tsx': 'export default function HomePage() { return null; }\n',
  'apps/web-vite/src/app/dashboard/page.tsx': 'export default function DashboardPage() { return null; }\n',
};

export function runViteRouteRegistryBehaviorFixtures(assertions) {
  const {
    assertEqual,
    assertIncludes,
  } = assertions;

  withFixture(
  {
    ...baseFiles,
    'apps/web-vite/src/routes.tsx': routesSource(),
  },
  (result) => {
    assertEqual(result.status, 0, 'matching Vite route registry should pass');
    assertIncludes(
      result.stdout,
      'scanned 2 app page files; 2 lazy page imports verified.',
      'passing output should report page and lazy import counts',
    );
  },
  );

  withFixture(
  {
    ...baseFiles,
    'apps/web-vite/src/lib/route-policy-registry.ts': `
export const ROUTE_PATHS = {
  home: '/',
  dashboard: '/dashboard',
  docs: '/docs',
} as const;
`,
    'apps/web-vite/src/routes.tsx': constantRoutesSource(),
  },
  (result) => {
    assertEqual(result.status, 0, 'ROUTE_PATHS-based Vite route registry should pass');
    assertIncludes(
      result.stdout,
      'scanned 2 app page files; 2 lazy page imports verified.',
      'constant route output should report page and lazy import counts',
    );
  },
  );

  withFixture(
  {
    ...baseFiles,
    'apps/web-vite/src/app/profile/page.tsx': 'export default function ProfilePage() { return null; }\n',
    'apps/web-vite/src/routes.tsx': routesSource(),
  },
  (result) => {
    assertEqual(result.status, 1, 'unregistered app page should fail');
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/profile/page.tsx is missing from apps/web-vite/src/routes.tsx; expected route /profile.',
      'missing page should report expected route path',
    );
  },
  );

  withFixture(
  {
    ...baseFiles,
    'apps/web-vite/src/routes.tsx': routesSource({ includeDashboard: false }),
  },
  (result) => {
    assertEqual(result.status, 1, 'missing lazy import for app page should fail');
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/page.tsx is missing from apps/web-vite/src/routes.tsx; expected route /dashboard.',
      'missing lazy import should report source page file',
    );
  },
  );

  withFixture(
  {
    ...baseFiles,
    'apps/web-vite/src/routes.tsx': routesSource({ dashboardPath: '/dashboard-old' }),
  },
  (result) => {
    assertEqual(result.status, 1, 'wrong route path for imported app page should fail');
    assertIncludes(
      result.stderr,
      'DashboardPage imports @/app/dashboard/page; expected route /dashboard, got /dashboard-old',
      'wrong route path should report expected and actual paths',
    );
  },
  );

  withFixture(
  {
    ...baseFiles,
    'apps/web-vite/src/routes.tsx': routesSource({ includeUnused: true }),
  },
  (result) => {
    assertEqual(result.status, 1, 'lazy import to missing page module should fail');
    assertIncludes(
      result.stderr,
      'UnusedPage imports missing or non-app page module: @/app/unused/page',
      'missing lazy import target should be reported',
    );
  },
  );

  withFixture(
  {
    ...baseFiles,
  },
  (result) => {
    assertEqual(result.status, 1, 'missing routes.tsx should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/routes.tsx not found.', 'missing routes file should be reported');
  },
  );

  return 'pass, multiline lazy import, missing page, missing import, wrong path, missing target, and missing routes file checks passed.';
}
