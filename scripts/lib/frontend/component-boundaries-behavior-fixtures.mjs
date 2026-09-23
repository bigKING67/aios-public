import { withFixtureWorkspace } from '../shared/gate-fixture-utils.mjs';
import {
  checkComponentBoundaries,
  formatComponentBoundariesResult,
} from './component-boundaries-core.mjs';

function componentSourceFiles(files) {
  return Object.keys(files)
    .filter((file) => file.startsWith('apps/web-vite/src/components/') && /\.(?:ts|tsx|js|jsx)$/.test(file))
    .sort();
}

export function runComponentBoundariesBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  {
    const files = {
      'apps/web-vite/src/components/CardTitle.tsx': `
export function CardTitle(value: string) {
  return value;
}
`,
      'apps/web-vite/src/components/MetricCard.tsx': `
import { formatMetric } from '@/lib/formatMetric';
import { CardTitle } from './CardTitle';

export function MetricCard() {
  return CardTitle(formatMetric(12));
}
`,
      'apps/web-vite/src/app/RouteOnly.tsx': `
import { routeOwnedCopy } from '@/app/route-owned/copy';

export function RouteOnly() {
  return routeOwnedCopy;
}
`,
      'apps/web-vite/src/components/StringLiteral.tsx': `
const routeSpecifier = '@/app/dashboard/copy';

export function StringLiteral() {
  return routeSpecifier;
}
`,
    };

    withFixtureWorkspace(
      {
        files,
        git: false,
        packageJson: null,
        prefix: 'aios-shared-component-boundary-',
      },
      ({ repoRoot }) => {
        const result = formatComponentBoundariesResult(
          checkComponentBoundaries({ files: componentSourceFiles(files), repoRoot }),
        );
        assertEqual(result.status, 0, 'safe shared imports, out-of-scope app files, and string literals should pass');
        assertIncludes(
          result.stdout,
          'no apps/web-vite/src/app dependencies found.',
          'passing output should include scoped shared component file count',
        );
        assertNotIncludes(
          result.stderr,
          'Shared component imports from apps/web-vite/src/app are forbidden',
          'string literal false positive should not report violations',
        );
      },
    );
  }

  {
    const files = {
      'apps/web-vite/src/components/BadAlias.tsx': `
import { dashboardCopy } from '@/app/dashboard/copy';

export function BadAlias() {
  return dashboardCopy;
}
`,
      'apps/web-vite/src/components/BadAbsolute.tsx': `
import { reportCopy } from 'apps/web-vite/src/app/reports/copy';

export function BadAbsolute() {
  return reportCopy;
}
`,
      'apps/web-vite/src/components/charts/BadRelative.tsx': `
import { dashboardCopy } from '../../app/dashboard/copy';

export function BadRelative() {
  return dashboardCopy;
}
`,
      'apps/web-vite/src/components/BadTypeImport.tsx': `
import type { DashboardCopy } from '@/app/dashboard/types';

export function BadTypeImport(_copy: DashboardCopy) {
  return null;
}
`,
      'apps/web-vite/src/components/BadReExportAndDynamic.tsx': `
export { routeCopy } from '@/app/dashboard/copy';

export async function loadRouteCopy() {
  return import('@/app/dashboard/loader');
}
`,
    };

    withFixtureWorkspace(
      {
        files,
        git: false,
        packageJson: null,
        prefix: 'aios-shared-component-boundary-',
      },
      ({ repoRoot }) => {
        const failResult = formatComponentBoundariesResult(
          checkComponentBoundaries({ files: componentSourceFiles(files), repoRoot }),
        );
        assertEqual(failResult.status, 1, 'all shared component imports from app modules should fail');
        assertIncludes(
          failResult.stderr,
          '[component-boundary] Shared component imports from apps/web-vite/src/app are forbidden:',
          'forbidden boundary header should be reported',
        );
        assertIncludes(
          failResult.stderr,
          '- apps/web-vite/src/components/BadAlias.tsx:2 imports @/app/dashboard/copy',
          'alias import violation should be reported with source location',
        );
        assertIncludes(
          failResult.stderr,
          "import { dashboardCopy } from '@/app/dashboard/copy';",
          'alias import source line should be reported',
        );
        assertIncludes(
          failResult.stderr,
          '- apps/web-vite/src/components/BadAbsolute.tsx:2 imports apps/web-vite/src/app/reports/copy',
          'absolute apps/web-vite/src/app import violation should be reported',
        );
        assertIncludes(
          failResult.stderr,
          '- apps/web-vite/src/components/charts/BadRelative.tsx:2 imports ../../app/dashboard/copy',
          'relative apps/web-vite/src/app import violation should be reported',
        );
        assertIncludes(
          failResult.stderr,
          '- apps/web-vite/src/components/BadTypeImport.tsx:2 imports @/app/dashboard/types',
          'type-only app import violation should be reported',
        );
        assertIncludes(
          failResult.stderr,
          '- apps/web-vite/src/components/BadReExportAndDynamic.tsx:2 imports @/app/dashboard/copy',
          're-export app dependency should be reported',
        );
        assertIncludes(
          failResult.stderr,
          '- apps/web-vite/src/components/BadReExportAndDynamic.tsx:5 imports @/app/dashboard/loader',
          'dynamic app dependency should be reported',
        );
      },
    );
  }

  return 'pass, alias, absolute, relative, type-only, re-export, dynamic, scope, and false-positive checks passed.';
}
