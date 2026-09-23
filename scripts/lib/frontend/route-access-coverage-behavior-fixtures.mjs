import { isAppPageFile } from './app-route-paths.mjs';
import { parseViteRoutePaths } from './vite-route-paths.mjs';
import { auditRouteAccessCoverage } from './route-access-coverage-core.mjs';

function parseRegistryEntries(source) {
  const match = /export\s+const\s+ROUTE_POLICY_ENTRIES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/.exec(source);
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

function createFindRoutePolicyEntry(entries) {
  return (pathname) =>
    entries.find((entry) => pathname === entry.path || pathname.startsWith(`${entry.path}/`));
}

export function runRouteAccessCoverageAuditFixture(files) {
  const authNavigationSource = files['apps/web-vite/src/lib/auth-navigation.ts'];
  const registrySource = files['apps/web-vite/src/lib/route-policy-registry.ts'];
  const routesSource = files['apps/web-vite/src/routes.tsx'];
  if (!authNavigationSource) {
    return {
      status: 1,
      stdout: '',
      stderr: '[route-access-coverage] ERROR: apps/web-vite/src/lib/auth-navigation.ts not found.\n',
    };
  }
  if (!registrySource) {
    return {
      status: 1,
      stdout: '',
      stderr: '[route-access-coverage] ERROR: apps/web-vite/src/lib/route-policy-registry.ts not found.\n',
    };
  }
  if (!routesSource) {
    return {
      status: 1,
      stdout: '',
      stderr: '[route-access-coverage] ERROR: apps/web-vite/src/routes.tsx not found.\n',
    };
  }

  const parsedViteRoutes = parseViteRoutePaths(routesSource, {});
  if (parsedViteRoutes.unresolved.length > 0) {
    const lines = ['[route-access-coverage] apps/web-vite/src/routes.tsx contains unresolved route path expressions:'];
    for (const reference of parsedViteRoutes.unresolved) {
      lines.push(`- ${reference.line}: ${reference.expression}`);
    }
    lines.push('', 'Resolve these route path expressions before relying on route access coverage.');
    return {
      status: 1,
      stdout: '',
      stderr: `${lines.join('\n')}\n`,
    };
  }

  const routePolicyEntries = parseRegistryEntries(registrySource);
  const fileSet = new Set(Object.keys(files));
  const result = auditRouteAccessCoverage({
    appPageFiles: Object.keys(files).filter(isAppPageFile),
    authNavigationSource,
    fileExists: (filePath) => fileSet.has(filePath),
    findRoutePolicyEntry: createFindRoutePolicyEntry(routePolicyEntries),
    readFile: (filePath) => files[filePath] ?? '',
    routePolicyEntries,
    viteRoutePaths: parsedViteRoutes.paths,
  });

  if (result.status === 'pass') {
    return {
      status: 0,
      stdout: `[route-access-coverage] OK: scanned ${result.appRoutes.length} app routes; canAccessPath starts at line 1 and uses explicit route policy + Vite coverage.\n`,
      stderr: '',
    };
  }

  if (result.type === 'error') {
    return {
      status: 1,
      stdout: '',
      stderr: `[route-access-coverage] ERROR: ${result.message}\n`,
    };
  }

  const lines = [`[route-access-coverage] ${result.header}`];
  for (const finding of result.findings) {
    lines.push(`- ${finding}`);
  }
  lines.push('', result.footer);
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function authNavigationSource() {
  return `
import { findRoutePolicyEntry, type RoutePolicyEntry } from './route-policy-registry';

function canAccessPolicyEntry(policyEntry: RoutePolicyEntry | undefined): boolean {
  if (!policyEntry) {
    return true;
  }

  switch (policyEntry.kind) {
    case 'public':
    case 'authenticated':
      return true;
    default:
      return true;
  }
}

export function canAccessPath(path: string): boolean {
  return canAccessPolicyEntry(findRoutePolicyEntry(path));
}
`;
}

function routePolicyRegistrySource(routes) {
  const entries = routes
    .map((route) => {
      const routePath = typeof route === 'string' ? route : route.path;
      const page = typeof route === 'string' ? '' : route.page;
      const kind = typeof route === 'string' ? 'authenticated' : (route.kind ?? 'authenticated');
      return `  { path: '${routePath}', kind: '${kind}'${page ? `, page: '${page}'` : ''} },`;
    })
    .join('\n');

  return `
export type RoutePolicyEntry = { path: string; kind: 'public' | 'authenticated' };

export const ROUTE_POLICY_ENTRIES = [
${entries}
] as const satisfies readonly RoutePolicyEntry[];

export function findRoutePolicyEntry(pathname: string): RoutePolicyEntry | undefined {
  return ROUTE_POLICY_ENTRIES.find((entry) => pathname === entry.path || pathname.startsWith(\`\${entry.path}/\`));
}
`;
}

function viteRoutesSource(routes) {
  const entries = routes
    .map((route) => `      <Route path="${route}" element={null} />`)
    .join('\n');

  return `
export function AppRoutes() {
  return (
    <Routes>
${entries}
    </Routes>
  );
}
`;
}

function withFixture(files, assertion) {
  assertion(runRouteAccessCoverageAuditFixture(files));
}

export function runRouteAccessCoverageBehaviorFixtures({ assertEqual, assertIncludes }) {
  const baseFiles = {
    'apps/web-vite/src/lib/auth-navigation.ts': authNavigationSource(),
    'apps/web-vite/src/lib/route-policy-registry.ts': routePolicyRegistrySource([
      { path: '/', kind: 'public', page: 'apps/web-vite/src/app/page.tsx' },
      { path: '/login', kind: 'public', page: 'apps/web-vite/src/app/login/page.tsx' },
      { path: '/docs', kind: 'public', page: 'apps/web-vite/src/app/docs/page.tsx' },
      { path: '/profile', page: 'apps/web-vite/src/app/profile/page.tsx' },
      { path: '/reports/weekly', page: 'apps/web-vite/src/app/reports/weekly/page.tsx' },
      { path: '/ops/dataops', page: 'apps/web-vite/src/app/ops/dataops/page.tsx' },
    ]),
    'apps/web-vite/src/routes.tsx': viteRoutesSource([
      '/',
      '/login',
      '/docs',
      '/profile',
      '/reports/weekly',
      '/ops/dataops',
    ]),
    'apps/web-vite/src/app/page.tsx': 'export default function HomePage() { return null; }\n',
    'apps/web-vite/src/app/login/page.tsx': 'export default function LoginPage() { return null; }\n',
  };

  withFixture(
    {
      ...baseFiles,
      'apps/web-vite/src/app/docs/page.tsx': `
export default function DocsPage() {
  return 'public docs';
}
`,
      'apps/web-vite/src/app/profile/page.tsx': `
import { ProtectedRoute } from '@/components/protected-route';

export default function ProfilePage() {
  return <ProtectedRoute>profile</ProtectedRoute>;
}
`,
      'apps/web-vite/src/app/reports/weekly/page.tsx': `
import { WeeklyReportClient } from './_components/weekly-report-client';

export default function WeeklyReportPage() {
  return <WeeklyReportClient />;
}
`,
      'apps/web-vite/src/app/reports/weekly/_components/weekly-report-client.tsx': `
import { ProtectedRoute } from '@/components/protected-route';

export function WeeklyReportClient() {
  return <ProtectedRoute>weekly</ProtectedRoute>;
}
`,
      'apps/web-vite/src/app/ops/dataops/page.tsx': `
import { useAuth } from '@/hooks/use-auth';

export default function DataOpsPage() {
  const auth = useAuth();
  return String(auth.isAuthenticated);
}
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'protected routes covered directly or by parent branch should pass');
      assertIncludes(result.stdout, 'scanned 6 app routes', 'passing output should report app route count');
    },
  );

  withFixture(
    {
      ...baseFiles,
      'apps/web-vite/src/routes.tsx': viteRoutesSource([
        '/',
        '/login',
        '/profile',
        '/reports/weekly',
      ]),
      'apps/web-vite/src/app/ops/dataops/page.tsx': `
export default function DataOpsPage() {
  return 'ops';
}
`,
      'apps/web-vite/src/app/docs/page.tsx': `
export default function DocsPage() {
  return 'public docs';
}
`,
      'apps/web-vite/src/app/profile/page.tsx': `
export default function ProfilePage() {
  return 'profile';
}
`,
      'apps/web-vite/src/app/reports/weekly/page.tsx': `
export default function WeeklyReportPage() {
  return 'weekly';
}
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'app page missing Vite route registration should fail');
      assertIncludes(
        result.stderr,
        '/ops/dataops policy page apps/web-vite/src/app/ops/dataops/page.tsx is not mounted in apps/web-vite/src/routes.tsx',
        'missing Vite route should report page and route path',
      );
    },
  );

  withFixture(
    {
      ...baseFiles,
      'apps/web-vite/src/lib/route-policy-registry.ts': routePolicyRegistrySource([]),
      'apps/web-vite/src/routes.tsx': viteRoutesSource([
        '/',
        '/login',
        '/docs',
        '/ops/dataops',
      ]),
      'apps/web-vite/src/app/ops/dataops/page.tsx': `
import { ProtectedRoute } from '@/components/protected-route';

export default function DataOpsPage() {
  return <ProtectedRoute>ops</ProtectedRoute>;
}
`,
      'apps/web-vite/src/app/docs/page.tsx': `
export default function DocsPage() {
  return 'public docs';
}
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'protected route missing route policy registry entry should fail');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/app/ops/dataops/page.tsx -> /ops/dataops',
        'missing protected route should report page and route path',
      );
    },
  );

  withFixture(
    {
      ...baseFiles,
      'apps/web-vite/src/lib/route-policy-registry.ts': routePolicyRegistrySource([
        { path: '/', kind: 'public', page: 'apps/web-vite/src/app/page.tsx' },
        { path: '/login', kind: 'public', page: 'apps/web-vite/src/app/login/page.tsx' },
        { path: '/docs-old', kind: 'public', page: 'apps/web-vite/src/app/docs/page.tsx' },
        { path: '/profile', page: 'apps/web-vite/src/app/profile/page.tsx' },
        { path: '/reports/weekly', page: 'apps/web-vite/src/app/reports/weekly/page.tsx' },
        { path: '/ops/dataops', page: 'apps/web-vite/src/app/ops/dataops/page.tsx' },
      ]),
      'apps/web-vite/src/routes.tsx': viteRoutesSource([
        '/',
        '/login',
        '/docs',
        '/profile',
        '/reports/weekly',
        '/ops/dataops',
      ]),
      'apps/web-vite/src/app/docs/page.tsx': `
export default function DocsPage() {
  return 'public docs';
}
`,
      'apps/web-vite/src/app/profile/page.tsx': `
export default function ProfilePage() {
  return 'profile';
}
`,
      'apps/web-vite/src/app/reports/weekly/page.tsx': `
export default function WeeklyReportPage() {
  return 'weekly';
}
`,
      'apps/web-vite/src/app/ops/dataops/page.tsx': `
export default function DataOpsPage() {
  return 'ops';
}
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'policy page path drift should fail');
      assertIncludes(
        result.stderr,
        '/docs-old policy page apps/web-vite/src/app/docs/page.tsx resolves to /docs',
        'policy page drift should report expected route from page path',
      );
    },
  );

  withFixture(
    {
      ...baseFiles,
      'apps/web-vite/src/lib/route-policy-registry.ts': routePolicyRegistrySource([
        { path: '/', kind: 'public', page: 'apps/web-vite/src/app/page.tsx' },
        { path: '/login', kind: 'public', page: 'apps/web-vite/src/app/login/page.tsx' },
        { path: '/docs', kind: 'public', page: 'apps/web-vite/src/app/docs/page.tsx' },
        { path: '/profile', kind: 'public', page: 'apps/web-vite/src/app/profile/page.tsx' },
        { path: '/reports/weekly', page: 'apps/web-vite/src/app/reports/weekly/page.tsx' },
        { path: '/ops/dataops', page: 'apps/web-vite/src/app/ops/dataops/page.tsx' },
      ]),
      'apps/web-vite/src/app/docs/page.tsx': `
export default function DocsPage() {
  return 'public docs';
}
`,
      'apps/web-vite/src/app/profile/page.tsx': `
import { ProtectedRoute } from '@/components/protected-route';

export default function ProfilePage() {
  return <ProtectedRoute>profile</ProtectedRoute>;
}
`,
      'apps/web-vite/src/app/reports/weekly/page.tsx': `
export default function WeeklyReportPage() {
  return 'weekly';
}
`,
      'apps/web-vite/src/app/ops/dataops/page.tsx': `
export default function DataOpsPage() {
  return 'ops';
}
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'protected page covered by public policy should fail');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/app/profile/page.tsx -> /profile (public)',
        'public policy drift should report protected page and policy kind',
      );
    },
  );

  withFixture(
    {
      ...baseFiles,
      'apps/web-vite/src/lib/auth-navigation.ts': `
export function canAccessPath(path: string): boolean {
  const pathname = path.split('?')[0];
  if (pathname === '/profile' || pathname.startsWith('/profile/')) {
    return true;
  }
  return true;
}
`,
      'apps/web-vite/src/app/docs/page.tsx': `
export default function DocsPage() {
  return 'public docs';
}
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'path-branch auth-navigation should fail even when no protected app route exists');
      assertIncludes(
        result.stderr,
        'must resolve access through findRoutePolicyEntry()',
        'registry-driven auth-navigation requirement should be enforced',
      );
    },
  );

  withFixture(
    {
      ...baseFiles,
      'apps/web-vite/src/lib/route-policy-registry.ts': routePolicyRegistrySource([]),
      'apps/web-vite/src/app/docs/page.tsx': `
export default function DocsPage() {
  return 'public docs';
}
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'public app routes should require explicit route policy coverage');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/app/docs/page.tsx -> /docs',
        'public missing route policy should report page and route path',
      );
    },
  );

  withFixture(
    {
      'apps/web-vite/src/lib/auth-navigation.ts': authNavigationSource(),
      'apps/web-vite/src/lib/route-policy-registry.ts': routePolicyRegistrySource([
        { path: '/', kind: 'public', page: 'apps/web-vite/src/app/page.tsx' },
        { path: '/login', kind: 'public', page: 'apps/web-vite/src/app/login/page.tsx' },
        { path: '/docs', kind: 'public', page: 'apps/web-vite/src/app/docs/page.tsx' },
      ]),
      'apps/web-vite/src/routes.tsx': viteRoutesSource([
        '/',
        '/login',
        '/docs',
      ]),
      'apps/web-vite/src/app/page.tsx': 'export default function HomePage() { return null; }\n',
      'apps/web-vite/src/app/login/page.tsx': 'export default function LoginPage() { return null; }\n',
      'apps/web-vite/src/app/docs/page.tsx': `
export default function DocsPage() {
  return 'public docs';
}
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'public app route with explicit registry policy should pass');
      assertIncludes(result.stdout, 'scanned 3 app routes', 'public-only fixture should report app route count');
    },
  );
}
