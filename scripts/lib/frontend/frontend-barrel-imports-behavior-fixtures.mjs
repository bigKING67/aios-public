import {
  auditFrontendBarrelImportSource,
  formatFrontendBarrelImportsResult,
  isFrontendBarrelImportSourceFile,
} from './frontend-barrel-imports-core.mjs';

function runAudit(files) {
  const sourceFiles = Object.keys(files).filter(isFrontendBarrelImportSourceFile);
  const findings = Object.entries(files)
    .filter(([file]) => isFrontendBarrelImportSourceFile(file))
    .flatMap(([file, source]) => auditFrontendBarrelImportSource(file, source));

  return formatFrontendBarrelImportsResult({
    files: sourceFiles,
    findings,
  });
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

export function runFrontendBarrelImportsBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  withFixture(
    {
      'apps/web-vite/src/app/page.tsx': `
import { Layout } from '@/components/organisms/layout';
import { FilterProvider } from '@/context/filter-context';
import { useFilter } from '@/hooks/use-filter';
import { request } from '@/lib/request';
import { queryClient } from '@/lib/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { aiosBrandTheme } from '@/theme/ant-theme';
import type { WaterfallStepItem } from '@/components/organisms/waterfall-chart';
import type { DataOpsStatus } from '@/config/dataops-hub';
import type { KPICard } from '@/types/report';
import '@/styles/globals.css';

const docs = "import { Layout } from '@/components'";
// import { Layout } from '@/components'
export const ok = Boolean(Layout) || Boolean(docs);
export const providers = [FilterProvider, useFilter, request, queryClient, useAuthStore, aiosBrandTheme];
export type Example = WaterfallStepItem | KPICard | DataOpsStatus;
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'direct frontend imports and comment/string mentions should pass');
      assertIncludes(result.stdout, 'no frontend barrel imports found', 'passing output should confirm no findings');
      assertNotIncludes(result.stderr, 'Frontend barrel imports', 'passing audit should not report findings');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/app/root-component.tsx': `
import { Layout } from '@/components';
export const bad = Layout;
`,
      'apps/web-vite/src/components/index.ts': `
export { Layout } from '@/components';
`,
      'apps/web-vite/src/routes.tsx': `
const components = import('@/components');
export const bad = components;
`,
      'apps/web-vite/src/app/organisms.tsx': `
import { Layout } from '@/components/organisms';
export const bad = Layout;
`,
      'apps/web-vite/src/app/states.tsx': `
import { ErrorState } from '@/components/states';
export const bad = ErrorState;
`,
      'apps/web-vite/src/app/lib.tsx': `
import { request } from '@/lib';
export const bad = request;
`,
      'apps/web-vite/src/app/config.tsx': `
import type { DataOpsStatus } from '@/config';
export type Bad = DataOpsStatus;
`,
      'apps/web-vite/src/app/stores.tsx': `
import { useAuthStore } from '@/stores';
export const bad = useAuthStore;
`,
      'apps/web-vite/src/app/theme.tsx': `
import { aiosBrandTheme } from '@/theme';
export const bad = aiosBrandTheme;
`,
      'apps/web-vite/src/app/styles.tsx': `
import '@/styles';
export const bad = true;
`,
      'apps/web-vite/src/app/hooks.tsx': `
import { useFilter } from '@/hooks';
export const bad = useFilter;
`,
      'apps/web-vite/src/app/types.tsx': `
import type { KPICard } from '@/types';
export type Bad = KPICard;
`,
      'apps/web-vite/src/ViteProviders.tsx': `
import { FilterProvider } from '@/context';
export const bad = FilterProvider;
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'all blocked frontend barrel import forms should fail in one fixture');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/root-component.tsx:2 imports @/components', 'root import location should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/components/index.ts:2 imports @/components', 'root export location should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/routes.tsx:2 imports @/components', 'dynamic root import should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/organisms.tsx:2 imports @/components/organisms', 'organisms barrel import should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/states.tsx:2 imports @/components/states', 'states barrel import should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/lib.tsx:2 imports @/lib', 'lib barrel import should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/config.tsx:2 imports @/config', 'config barrel import should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/stores.tsx:2 imports @/stores', 'stores barrel import should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/theme.tsx:2 imports @/theme', 'theme barrel import should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/styles.tsx:2 imports @/styles', 'styles barrel import should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/hooks.tsx:2 imports @/hooks', 'hooks barrel import should be reported');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/types.tsx:2 imports @/types', 'types barrel import should be reported');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/ViteProviders.tsx:2 imports @/context',
        'context barrel import should be reported',
      );
      assertIncludes(result.stderr, '@/components/organisms/layout', 'component direct import suggestion should be reported');
      assertIncludes(result.stderr, '@/lib/request', 'lib direct import suggestion should be reported');
      assertIncludes(result.stderr, '@/hooks/use-filter', 'hooks direct import suggestion should be reported');
      assertIncludes(result.stderr, '@/types/report', 'types direct import suggestion should be reported');
      assertIncludes(result.stderr, '@/context/filter-context', 'context direct import suggestion should be reported');
    },
  );

  return 'direct imports pass; frontend root and layer barrel import/export/dynamic imports fail.';
}
