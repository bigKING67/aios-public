#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  APP_PAGE_EXTENSIONS,
  APP_PAGE_FILE_PATTERN,
  isAppPageFile,
  listAppPageFiles,
  routePathForPageFile,
} from '../../lib/frontend/app-route-paths.mjs';

const {
  assertDeepEqual,
  assertEqual,
  assertFalse,
  assertTrue,
  reportOk,
} = createCheckGuard('app-route-paths-behavior');

assertEqual(routePathForPageFile('apps/web-vite/src/app/page.tsx'), '/', 'root app page should resolve to home route');
assertEqual(
  routePathForPageFile('apps/web-vite/src/app/dashboard/creator/live/page.tsx'),
  '/dashboard/creator/live',
  'nested app page should resolve to nested route path',
);
assertEqual(
  routePathForPageFile('apps/web-vite/src/app/reports/monthly/page.jsx'),
  '/reports/monthly',
  'jsx app page should resolve with the same route semantics',
);
assertEqual(
  routePathForPageFile('apps/web-vite/src/app/marketing/content-assets/[assetId]/page.tsx'),
  '/marketing/content-assets/:assetId',
  'dynamic app page segments should resolve to React Router params',
);
assertEqual(routePathForPageFile('apps/web-vite/src/app/profile/not-page.tsx'), null, 'non-page app file should not resolve');
assertEqual(routePathForPageFile('apps/web-vite/src/components/Button.tsx'), null, 'non-app file should not resolve');

assertTrue(isAppPageFile('apps/web-vite/src/app/admin/users/page.ts'), 'ts app page should match');
assertFalse(isAppPageFile('apps/web-vite/src/app/admin/users/Page.tsx'), 'case-drifted page filename should not match');
assertFalse(isAppPageFile('apps/web-vite/src/routes.tsx'), 'runtime route registry is not an app page');
assertTrue(APP_PAGE_FILE_PATTERN.test('apps/web-vite/src/app/docs/page.js'), 'shared app page pattern should support js pages');
assertDeepEqual([...APP_PAGE_EXTENSIONS], ['tsx', 'ts', 'jsx', 'js'], 'app page extensions should stay ordered');

const listedFiles = listAppPageFiles('/fixture', {
  listGitFiles: (pathspecs, options) => {
    assertDeepEqual(pathspecs, ['apps/web-vite/src/app'], 'listAppPageFiles should scan only apps/web-vite/src/app');
    assertEqual(options.cwd, '/fixture', 'listAppPageFiles should pass repo root as cwd');
    return [
      'apps/web-vite/src/app/page.tsx',
      'apps/web-vite/src/app/dashboard/page.tsx',
      'apps/web-vite/src/app/dashboard/_components/dashboard-page-client.tsx',
      'apps/web-vite/src/app/admin/users/page.ts',
      'apps/web-vite/src/components/Widget.tsx',
    ].filter(options.filter);
  },
});

assertDeepEqual(
  listedFiles,
  [
    'apps/web-vite/src/app/page.tsx',
    'apps/web-vite/src/app/dashboard/page.tsx',
    'apps/web-vite/src/app/admin/users/page.ts',
  ],
  'listAppPageFiles should delegate filtering to the shared app page predicate',
);

assertEqual(
  routePathForPageFile(listedFiles[2]),
  '/admin/users',
  'listed app page files should be compatible with routePathForPageFile',
);

try {
  listAppPageFiles('/fixture');
  assertTrue(false, 'listAppPageFiles should require listGitFiles injection');
} catch (error) {
  assertEqual(
    error instanceof TypeError ? error.message : String(error),
    'listAppPageFiles requires options.listGitFiles',
    'missing listGitFiles should fail explicitly',
  );
}

reportOk('app page file detection, route path derivation, extension order, and listing delegation passed.');
