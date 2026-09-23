import { auditFrontendLayerBoundarySource } from './frontend-layer-boundaries-core.mjs';

function runAudit(files) {
  const findings = Object.entries(files)
    .filter(([file]) => file.startsWith('apps/web-vite/src/') && /\.(?:ts|tsx|js|jsx)$/.test(file))
    .flatMap(([file, source]) => auditFrontendLayerBoundarySource(file, source));

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[frontend-layer-boundaries] OK: scanned ${Object.keys(files).length} frontend TS/JS files; no layer boundary violations found.\n`,
      stderr: '',
    };
  }

  const lines = ['[frontend-layer-boundaries] Frontend layer boundary violations found:'];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} imports ${finding.specifier}`);
    lines.push(`  rule: ${finding.ruleName}`);
    lines.push(`  blocked prefix: ${finding.blockedPrefix}`);
    lines.push(`  fix: ${finding.suggestion}`);
  }
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

export function runFrontendLayerBoundariesBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  withFixture(
    {
      'apps/web-vite/src/lib/request.ts': `
import { buildApiGatewayPath } from '@/lib/api-gateway';
import type { WeeklyReportResponse } from '@/types/weekly-report';
export const ok = buildApiGatewayPath('/health');
export type Example = WeeklyReportResponse;
`,
      'apps/web-vite/src/hooks/use-thing.ts': `
import { request } from '@/lib/request';
export const ok = request;
`,
      'apps/web-vite/src/components/widget.tsx': `
import { useThing } from '@/hooks/use-thing';
export const Widget = () => useThing;
`,
      'apps/web-vite/src/routes.tsx': `
const HomePage = import('@/app/page');
const DashboardPage = import('@/app/dashboard/page');
export const ok = HomePage;
`,
      'apps/web-vite/src/app/dashboard/page.tsx': `
import { pickQueryValue } from '@/app/_shared/route-query';
export const ok = pickQueryValue;
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'allowed upward/shared dependencies should pass');
      assertIncludes(result.stdout, 'no layer boundary violations found', 'passing output should confirm no findings');
      assertNotIncludes(result.stderr, 'Frontend layer boundary violations', 'passing audit should not report findings');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/lib/request.ts': `
import { useAuthStore } from '@/stores/auth.store';
export const bad = useAuthStore;
`,
      'apps/web-vite/src/lib/formatter.ts': `
import { Button } from '@/components/atoms/button';
export const bad = Button;
`,
      'apps/web-vite/src/lib/request-relative.ts': `
import { useAuthStore } from '../stores/auth.store';
export const bad = useAuthStore;
`,
      'apps/web-vite/src/hooks/use-route-thing.ts': `
const page = import('@/app/dashboard/page');
export const bad = page;
`,
      'apps/web-vite/src/hooks/use-private-thing.ts': `
import { privateHelper } from '../app/dashboard/_components/private-helper';
export const bad = privateHelper;
`,
      'apps/web-vite/src/components/widget.tsx': `
import { privateHelper } from '@/app/dashboard/_components/private-helper';
export const bad = privateHelper;
`,
      'apps/web-vite/src/theme/ant-theme.ts': `
import { useAuthStore } from '@/stores/auth.store';
export const bad = useAuthStore;
`,
      'apps/web-vite/src/lib/url.ts': `
import { pickQueryValue } from '@/app/_shared/route-query';
export const bad = pickQueryValue;
`,
      'apps/web-vite/src/ViteProviders.tsx': `
import { pickQueryValue } from './app/_shared/route-query';
export const bad = pickQueryValue;
`,
      'apps/web-vite/src/routes.tsx': `
const DashboardPageClient = import('@/app/dashboard/_components/dashboard-page-client');
const RelativeDashboardPageClient = import('./app/dashboard/_components/dashboard-page-client');
export const bad = [DashboardPageClient, RelativeDashboardPageClient];
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'shared layer boundary violations should fail in one batched fixture');
      assertIncludes(result.stderr, 'apps/web-vite/src/lib/request.ts:2 imports @/stores/auth.store', 'lib/store finding should be reported');
      assertIncludes(result.stderr, 'lib must not depend on UI or state layers', 'lib rule should be reported');
      assertIncludes(result.stderr, 'bridge/callback', 'bridge suggestion should be reported');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/lib/formatter.ts:2 imports @/components/atoms/button',
        'lib/component finding should be reported',
      );
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/lib/request-relative.ts:2 imports ../stores/auth.store',
        'relative lib/store finding should be reported',
      );
      assertIncludes(result.stderr, 'blocked prefix: apps/web-vite/src/stores/', 'resolved target layer should be reported');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/hooks/use-route-thing.ts:2 imports @/app/dashboard/page',
        'hook/app finding should be reported',
      );
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/hooks/use-private-thing.ts:2 imports ../app/dashboard/_components/private-helper',
        'relative hook/app finding should be reported',
      );
      assertIncludes(result.stderr, 'blocked prefix: apps/web-vite/src/app/', 'resolved app layer should be reported');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/components/widget.tsx:2 imports @/app/dashboard/_components/private-helper',
        'component/app finding should be reported',
      );
      assertIncludes(result.stderr, 'apps/web-vite/src/theme/ant-theme.ts:2 imports @/stores/auth.store', 'theme/store finding should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/lib/url.ts:2 imports @/app/_shared/route-query', 'app shared helper finding should be reported');
      assertIncludes(result.stderr, 'app shared route helpers are private to apps/web-vite/src/app', 'app shared helper rule should be reported');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/ViteProviders.tsx:2 imports ./app/_shared/route-query',
        'relative app shared helper finding should be reported',
      );
      assertIncludes(result.stderr, 'blocked prefix: apps/web-vite/src/app/_shared/', 'resolved app shared helper layer should be reported');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/routes.tsx:2 imports @/app/dashboard/_components/dashboard-page-client',
        'router private component finding should be reported',
      );
      assertIncludes(result.stderr, 'Vite router must load app page modules', 'router rule should be reported');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/routes.tsx:3 imports ./app/dashboard/_components/dashboard-page-client',
        'relative router private component finding should be reported',
      );
    },
  );

  return 'allowed shared imports pass; lib/theme/hooks/components layer violations fail.';
}
