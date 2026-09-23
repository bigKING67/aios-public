#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  frontendIndexBarrelSuggestion,
  isIndexBarrel,
} from './index-barrels.mjs';

const { assertEqual, assertIncludes, assertNotIncludes, reportOk } = createCheckGuard(
  'frontend-index-barrels-behavior',
);

function runAudit(files) {
  const findings = Object.keys(files)
    .filter((file) => (file.startsWith('apps/web-vite/src/') || file.startsWith('apps/web-vite/src/')) && isIndexBarrel(file))
    .sort();
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: '[frontend-index-barrels] OK: no production frontend index barrel files found.\n',
      stderr: '',
    };
  }
  const lines = ['[frontend-index-barrels] Production frontend index barrel files are not allowed:'];
  for (const file of findings) {
    lines.push(`- ${file}`);
    lines.push(`  ${frontendIndexBarrelSuggestion(file)}`);
  }
  lines.push('', 'Use concrete module files so import ownership stays explicit.');
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

withFixture(
  {
    'apps/web-vite/src/app/page.tsx': 'export function Page() { return null; }\n',
    'apps/web-vite/src/hooks/use-filter.ts': 'export function useFilter() { return {}; }\n',
    'apps/web-vite/src/routes.tsx': 'export const routes = [];\n',
    'scripts/index.ts': 'export const outOfScope = true;\n',
    'docs/index.ts': 'export const outOfScope = true;\n',
  },
  (result) => {
    assertEqual(result.status, 0, 'concrete frontend files and out-of-scope index files should pass');
    assertIncludes(result.stdout, 'no production frontend index barrel files found', 'passing output should confirm no findings');
    assertNotIncludes(result.stderr, 'Production frontend index barrel files', 'passing audit should not report findings');
  },
);

withFixture(
  {
    'apps/web-vite/src/hooks/index.ts': 'export { useFilter } from "./use-filter";\n',
    'apps/web-vite/src/hooks/use-filter.ts': 'export function useFilter() { return {}; }\n',
  },
  (result) => {
    assertEqual(result.status, 1, 'src index.ts barrel should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/hooks/index.ts', 'src index barrel should be reported');
    assertIncludes(result.stderr, 'concrete file under apps/web-vite/src/hooks/...', 'direct file suggestion should be reported');
  },
);

withFixture(
  {
    'apps/web-vite/src/components/states/index.tsx': 'export { ErrorState } from "./error-state";\n',
    'apps/web-vite/src/components/states/error-state.tsx': 'export function ErrorState() { return null; }\n',
  },
  (result) => {
    assertEqual(result.status, 1, 'src index.tsx barrel should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/components/states/index.tsx', 'src index.tsx barrel should be reported');
  },
);

withFixture(
  {
    'apps/web-vite/src/features/index.ts': 'export { routes } from "./routes";\n',
    'apps/web-vite/src/features/routes.ts': 'export const routes = [];\n',
  },
  (result) => {
    assertEqual(result.status, 1, 'apps/web-vite/src index.ts barrel should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/features/index.ts', 'apps web index barrel should be reported');
  },
);

reportOk('concrete files pass; src and apps/web-vite/src index barrels fail; scripts/docs are out of scope.');
