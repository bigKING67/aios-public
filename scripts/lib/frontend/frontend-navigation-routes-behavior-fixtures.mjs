import {
  auditNavigationRouteRegistry,
  isNavigationSourceFile,
  looksLikeNavigationSource,
} from './frontend-navigation-routes-core.mjs';
import { parseRoutePathsObject } from './vite-route-paths.mjs';

function routePathsForFiles(files) {
  const source = files['apps/web-vite/src/lib/route-policy-registry.ts'];
  return source ? parseRoutePathsObject(source) : {};
}

function discoverNavigationSources(files) {
  return Object.entries(files)
    .filter(([filePath, source]) => isNavigationSourceFile(filePath) && looksLikeNavigationSource(source))
    .map(([filePath, source]) => ({ filePath, source }))
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
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

  const result = auditNavigationRouteRegistry({
    routePaths: routePathsForFiles(files),
    routesSource,
    sourceFiles: discoverNavigationSources(files),
  });

  if (result.findings.length === 0) {
    return {
      status: 0,
      stdout: `[navigation-route-registry] OK: scanned ${result.scannedFiles.length} navigation source files; ${result.references.length} first-party navigation targets verified against ${result.routePatterns.length} Vite route patterns.\n`,
      stderr: '',
    };
  }

  const lines = ['[navigation-route-registry] Frontend navigation route drift was detected:'];
  for (const finding of result.findings) {
    lines.push(`- ${finding}`);
  }
  lines.push(
    '',
    'Keep navigation targets synchronized with apps/web-vite/src/routes.tsx. First-party links should resolve to registered Vite routes or approved hash/external targets.',
  );
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

function routesSource() {
  return `
import { Navigate, Route, Routes } from 'react-router-dom';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={null} />
      <Route path="/login" element={null} />
      <Route path="/dashboard" element={null} />
      <Route path="/reports/weekly" element={null} />
      <Route path="/docs" element={null} />
      <Route path="/docs/references/:slug" element={null} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
`;
}

function constantRoutesSource() {
  return `
import { Navigate, Route, Routes } from 'react-router-dom';

import { ROUTE_PATHS } from '@/lib/route-policy-registry';

export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTE_PATHS.home} element={null} />
      <Route path={ROUTE_PATHS.login} element={null} />
      <Route path={ROUTE_PATHS.dashboard} element={null} />
      <Route path={ROUTE_PATHS.reportsWeekly} element={null} />
      <Route path={ROUTE_PATHS.docs} element={null} />
      <Route path={\`\${ROUTE_PATHS.docs}/references/:slug\`} element={null} />
      <Route path="*" element={<Navigate to={ROUTE_PATHS.home} replace />} />
    </Routes>
  );
}
`;
}

export function runFrontendNavigationRoutesBehaviorFixtures(assertions) {
  const { assertEqual, assertIncludes } = assertions;
  const baseFiles = {
    'apps/web-vite/src/routes.tsx': routesSource(),
  };

  withFixture(
    {
      ...baseFiles,
      'apps/web-vite/src/app/_components/home-page.tsx': `
import { Link } from 'react-router-dom';
import { Button } from 'antd';

const entryItems = [
  { href: '/dashboard' },
  { href: '/reports/weekly' },
  { href: '#references' },
];

export function HomePage() {
  return (
    <>
      <Button href="/dashboard" />
      <Link to="/docs/references/tmall-channel-diagnosis">Doc</Link>
      <Link to="/login?redirect=%2Freports%2Fweekly">Login</Link>
      {entryItems.map((item) => <Link key={item.href} to={item.href} />)}
    </>
  );
}
`,
      'apps/web-vite/src/components/protected-route.tsx': `
export function ProtectedRoute() {
  navigate(\`/login?redirect=\${encodeURIComponent('/dashboard')}\`);
}
`,
      'apps/web-vite/src/lib/auth-navigation.ts': `
export const AUTH_NAVIGATION_FALLBACK_PATHS = ['/dashboard', '/reports/weekly', '/'] as const;
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'registered static, dynamic, hash, and login redirect targets should pass');
      assertIncludes(
        result.stdout,
        'first-party navigation targets verified',
        'passing output should report verified navigation targets',
      );
    },
  );

  withFixture(
    {
      'apps/web-vite/src/lib/route-policy-registry.ts': `
export const ROUTE_PATHS = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  reportsWeekly: '/reports/weekly',
  docs: '/docs',
} as const;
`,
      'apps/web-vite/src/routes.tsx': constantRoutesSource(),
      'apps/web-vite/src/app/_components/home-page.tsx': `
import { Link } from 'react-router-dom';

export function HomePage() {
  return <Link to="/docs/references/tmall-channel-diagnosis">Doc</Link>;
}
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'ROUTE_PATHS-based Vite routes should validate navigation references');
      assertIncludes(
        result.stdout,
        'first-party navigation targets verified',
        'constant route output should report verified navigation targets',
      );
    },
  );

  withFixture(
    {
      ...baseFiles,
      'apps/web-vite/src/app/new-entry/NewEntry.tsx': `
import { Link } from 'react-router-dom';

export function NewEntry() {
  return <Link to="/missing-auto-discovered">Missing</Link>;
}
`,
      'apps/web-vite/src/components/organisms/layout.tsx': `
import { Link } from 'react-router-dom';

export function Layout() {
  return <Link to="/missing">Missing</Link>;
}
`,
      'apps/web-vite/src/app/_components/home-page.tsx': `
const entryItems = [
  { href: '/reports/monthly' },
];
`,
      'apps/web-vite/src/components/user-menu.tsx': `
export function UserMenu() {
  navigate('/profile');
}
`,
      'apps/web-vite/src/components/organisms/login-redirect.tsx': `
import { Link } from 'react-router-dom';

export function LoginRedirect() {
  return <Link to="/login?redirect=%2Freports%2Fmonthly">Report</Link>;
}
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'unregistered navigation targets should fail in one batched fixture');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/app/new-entry/NewEntry.tsx:5 jsx-nav-attr "/missing-auto-discovered" does not resolve to a registered Vite route.',
        'auto-discovered JSX target should report file and target',
      );
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/components/organisms/layout.tsx:5 jsx-nav-attr "/missing" does not resolve to a registered Vite route.',
        'missing JSX target should report file and target',
      );
      assertIncludes(
        result.stderr,
        'object-nav-prop "/reports/monthly" does not resolve to a registered Vite route.',
        'missing object target should report object prop source',
      );
      assertIncludes(
        result.stderr,
        'static-nav-call "/profile" does not resolve to a registered Vite route.',
        'missing static navigate target should be reported',
      );
      assertIncludes(
        result.stderr,
        'login redirect points to unregistered route: /reports/monthly',
        'invalid login redirect target should be reported',
      );
    },
  );
}
