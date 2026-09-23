import { withFixtureWorkspace } from '../shared/gate-fixture-utils.mjs';
import {
  checkComponentApiExports,
  formatComponentApiExportsResult,
} from '../../checks/components/api-exports.mjs';

function componentFiles(files) {
  return Object.keys(files)
    .filter((file) => file.startsWith('apps/web-vite/src/components/') && file.endsWith('.tsx'))
    .sort();
}

export function runComponentApiExportsBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  {
    const files = {
      'apps/web-vite/src/components/MetricCard.tsx': `
export interface MetricCardProps {
  title: string;
}

export type MetricTrendProps = {
  value: number;
};

type InternalViewModel = {
  id: string;
};

export function MetricCard(_props: MetricCardProps) {
  return null;
}
`,
      'apps/web-vite/src/app/RouteOnly.tsx': `
interface RouteOnlyProps {
  title: string;
}
`,
      'apps/web-vite/src/components/NonPropsTypes.tsx': `
interface ViewModel {
  title: string;
}

type InternalPropsValue = string;
type props = {
  title: string;
};

export function NonPropsTypes(_props: ViewModel) {
  return null;
}
`,
    };

    withFixtureWorkspace(
      {
        files,
        git: false,
        packageJson: null,
        prefix: 'aios-component-api-exports-',
      },
      ({ repoRoot }) => {
        const result = formatComponentApiExportsResult(
          checkComponentApiExports({ files: componentFiles(files), repoRoot }),
        );
        assertEqual(result.status, 0, 'exported props, out-of-scope app files, and props-like internals should pass');
        assertIncludes(
          result.stdout,
          'all Props contracts are exported',
          'passing output should confirm exported props contracts',
        );
        assertNotIncludes(
          result.stdout,
          'Found non-exported component API contracts',
          'passing output should not include failure wording',
        );
      },
    );
  }

  {
    const files = {
      'apps/web-vite/src/components/HiddenInterface.tsx': `
interface HiddenInterfaceProps {
  title: string;
}

export function HiddenInterface(_props: HiddenInterfaceProps) {
  return null;
}
`,
      'apps/web-vite/src/components/HiddenType.tsx': `
type HiddenTypeProps = {
  title: string;
};

export function HiddenType(_props: HiddenTypeProps) {
  return null;
}
`,
      'apps/web-vite/src/components/AnonymousProps.tsx': `
import type React from 'react';

type Props = {
  title: string;
};

export const AnonymousProps: React.FC<Props> = () => null;
`,
    };

    withFixtureWorkspace(
      {
        files,
        git: false,
        packageJson: null,
        prefix: 'aios-component-api-exports-',
      },
      ({ repoRoot }) => {
        const failResult = formatComponentApiExportsResult(
          checkComponentApiExports({ files: componentFiles(files), repoRoot }),
        );
        assertEqual(failResult.status, 1, 'non-exported and anonymous component API contracts should fail');
        assertIncludes(
          failResult.stderr,
          'apps/web-vite/src/components/HiddenInterface.tsx:2 Props type is not exported.',
          'non-exported interface location should be reported',
        );
        assertIncludes(
          failResult.stderr,
          'interface HiddenInterfaceProps',
          'non-exported interface source line should be reported',
        );
        assertIncludes(
          failResult.stderr,
          'apps/web-vite/src/components/HiddenType.tsx:2 Props type is not exported.',
          'non-exported type location should be reported',
        );
        assertIncludes(
          failResult.stderr,
          'type HiddenTypeProps',
          'non-exported type source line should be reported',
        );
        assertIncludes(
          failResult.stderr,
          'apps/web-vite/src/components/AnonymousProps.tsx:8 Anonymous Props interface hides the component API.',
          'anonymous Props contract location should be reported',
        );
        assertIncludes(
          failResult.stderr,
          'React.FC<Props>',
          'anonymous Props source line should be reported',
        );
      },
    );
  }

  return 'exported pass, interface/type violations, anonymous Props, scope, and false-positive checks passed.';
}
