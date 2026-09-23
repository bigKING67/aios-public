import {
  auditRetiredFrontendLeftovers,
  formatRetiredFrontendLeftoversAudit,
} from './retired-frontend-leftovers-core.mjs';

function runAudit(files) {
  return formatRetiredFrontendLeftoversAudit(auditRetiredFrontendLeftovers('__fixture__', {
    files: Object.keys(files).sort(),
    fileExists: (file) => Object.prototype.hasOwnProperty.call(files, file),
    readFile: (file) => files[file],
  }));
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

export function runRetiredFrontendLeftoversBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  withFixture(
    {
      'apps/web-vite/src/app/dashboard/_components/dashboard-page-client.tsx': `
import { selectIsAuthenticated, useAuthStore } from '@/stores/auth.store';

export function DashboardPageClient() {
  return useAuthStore.getState().user?.username ?? String(selectIsAuthenticated);
}
`,
      'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard-client.tsx': `
export function CreatorLiveDashboardClient() {
  return null;
}
`,
      'apps/web-vite/src/app/dashboard/creator/live/page.tsx': `
import { CreatorLiveDashboardClient } from '../_components/creator-live-dashboard-client';

export default function Page() {
  return <CreatorLiveDashboardClient />;
}
`,
      'apps/web-vite/src/app/reports/weekly/page.tsx': `
import { WeeklyReportClient } from './_components/weekly-report-client';

export default function WeeklyReportPage() {
  return <WeeklyReportClient />;
}
`,
      'docs/DESIGN_RAW_COLOR_INVENTORY.md': 'Current chart inventory only.\n',
    },
    (result) => {
      assertEqual(result.status, 0, 'current Vite dashboard, creator, and report page entries should pass');
      assertIncludes(result.stdout, 'no retired leftovers found', 'passing output should confirm no leftovers');
      assertNotIncludes(result.stderr, 'Retired frontend leftovers found', 'passing audit should not report violations');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/app/dashboard/_components/DashboardClient.tsx': `
export function DashboardClient() {
  return null;
}
`,
      'apps/web-vite/src/app/dashboard/BadImport.tsx': `
import Link from 'next/link';
import { DashboardGrid } from '@/components/dashboard-grid';
import { oldStore } from '@/store';

export const metadata = { title: 'Old dashboard' };

export function BadImport() {
  return <Link href="/">{String(DashboardGrid)}{String(oldStore)}</Link>;
}
`,
      'apps/web-vite/src/hooks/use-report.ts': `
export function useReport() {
  return null;
}
`,
      'package.json': JSON.stringify(
        {
          name: 'retired-leftovers-fixture',
          private: true,
          dependencies: {
            next: '^15.0.0',
          },
          scripts: {
            build: 'next build',
          },
        },
        null,
        2,
      ),
      'next-env.d.ts': '/// <reference types="next" />\n',
      'apps/web-vite/src/app/api/report/route.ts': `
export async function GET() {
  return new Response('retired');
}
`,
      'apps/web-vite/src/app/UsesNextEnv.ts': `
const endpoint = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_INTERNAL_API_URL;

export function UsesNextEnv() {
  return endpoint;
}
`,
      'tsconfig.json': JSON.stringify(
        {
          include: ['next-env.d.ts', 'apps/web-vite/src/**/*.ts'],
          compilerOptions: {
            types: ['next'],
          },
        },
        null,
        2,
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'retired paths, references, config, and env names should fail in one batched fixture');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/dashboard/_components/DashboardClient.tsx', 'retired dashboard client path should be reported');
      assertIncludes(result.stderr, 'retired path exists', 'retired path reason should be reported');
      assertIncludes(result.stderr, 'Next/App Router leftovers', 'Next leftovers should be reported');
      assertIncludes(result.stderr, 'retired dashboard grid demo', 'retired DashboardGrid should be reported');
      assertIncludes(result.stderr, '@/store alias was removed', 'retired store alias should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/hooks/use-report.ts', 'retired report hook should be reported');
      assertIncludes(result.stderr, 'retired Next dependency in dependencies', 'Next dependency should be reported');
      assertIncludes(result.stderr, 'retired Next command in script build', 'Next script command should be reported');
      assertIncludes(result.stderr, 'next-env.d.ts', 'next-env.d.ts should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/api', 'apps/web-vite/src/app/api should be reported');
      assertIncludes(result.stderr, 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC env should be reported');
      assertIncludes(result.stderr, 'retired Next TypeScript configuration reference', 'tsconfig drift should be reported');
      assertIncludes(result.stderr, 'next-env.d.ts', 'tsconfig next-env include should be reported');
    },
  );

  withFixture(
    {
      'README.md': `
# Current notes

Recommended Next Rounds should focus on quality.
Default Web runtime is Vite + nginx and no longer starts the retired SSR process.
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'ordinary prose mentioning next rounds should not fail');
      assertIncludes(result.stdout, 'no retired leftovers found', 'ordinary docs prose should pass');
    },
  );

  return 'current-path pass, retired path/reference/config/env/docs, and route/hook reintroduction checks passed.';
}
