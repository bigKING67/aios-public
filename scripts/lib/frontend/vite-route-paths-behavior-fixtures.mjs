import {
  extractRoutePathExpression,
  parseRoutePathsObject,
  parseViteRoutePathReferences,
  parseViteRoutePaths,
  resolveRoutePathExpression,
} from './vite-route-paths.mjs';

function sortedPaths(paths) {
  return [...paths].sort();
}

function loadRoutePathsFromFiles(files, filePath = 'apps/web-vite/src/lib/route-policy-registry.ts') {
  return files[filePath] ? parseRoutePathsObject(files[filePath]) : {};
}

const routePathsSource = `
export const ROUTE_PATHS = {
  home: '/',
  dashboard: "/dashboard",
  docs:
    '/docs',
  order_1: "/orders/:id",
} as const;
`;

const routePaths = {
  dashboard: '/dashboard',
  docs: '/docs',
  home: '/',
};

const viteRoutesSource = [
  '<Routes>',
  '  <Route',
  '    path={ROUTE_PATHS.home}',
  '    element={<Home />}',
  '  />',
  '  <Route path="/literal" element={<Literal />} />',
  '  <Route path={`${ROUTE_PATHS.docs}/references/:slug`} element={<Docs />} />',
  '  <Route path={ROUTE_PATHS.missing} element={<Missing />} />',
  '  <Route element={<NoPath />} />',
  '</Routes>',
].join('\n');

const wildcardRoutesSource = [
  '<Routes>',
  '  <Route path={ROUTE_PATHS.home} element={<Home />} />',
  '  <Route path="*" element={<NotFound />} />',
  '</Routes>',
].join('\n');

export function runViteRoutePathsBehaviorFixtures({
  assertDeepEqual,
  assertEqual,
}) {
  assertDeepEqual(
    parseRoutePathsObject(routePathsSource),
    {
      dashboard: '/dashboard',
      docs: '/docs',
      home: '/',
      order_1: '/orders/:id',
    },
    'ROUTE_PATHS parser should support single quotes, double quotes, multiline values, and identifier keys',
  );

  assertDeepEqual(parseRoutePathsObject('export const OTHER = {} as const;'), {}, 'missing ROUTE_PATHS block should return empty map');

  assertEqual(resolveRoutePathExpression('"/literal"', routePaths), '/literal', 'quoted route literal should resolve');
  assertEqual(resolveRoutePathExpression("'/'", routePaths), '/', 'single-quoted route literal should resolve');
  assertEqual(
    resolveRoutePathExpression('ROUTE_PATHS.dashboard', routePaths),
    '/dashboard',
    'ROUTE_PATHS constant should resolve',
  );
  assertEqual(
    resolveRoutePathExpression('`${ROUTE_PATHS.docs}/references/:slug`', routePaths),
    '/docs/references/:slug',
    'template route using ROUTE_PATHS should resolve',
  );
  assertEqual(resolveRoutePathExpression('ROUTE_PATHS.missing', routePaths), null, 'missing ROUTE_PATHS key should be unresolved');
  assertEqual(resolveRoutePathExpression('buildRoutePath()', routePaths), null, 'unsupported route expression should be unresolved');
  assertEqual(
    resolveRoutePathExpression('`${ROUTE_PATHS.docs}/${dynamic}`', routePaths),
    null,
    'template route with non-ROUTE_PATHS interpolation should be unresolved',
  );

  assertEqual(
    extractRoutePathExpression('<Route path="/literal" element={<Literal />} />'),
    '"/literal"',
    'literal Route path expression should be extracted',
  );
  assertEqual(
    extractRoutePathExpression('<Route path={ROUTE_PATHS.dashboard} element={<Dashboard />} />'),
    'ROUTE_PATHS.dashboard',
    'constant Route path expression should be extracted',
  );
  assertEqual(
    extractRoutePathExpression('<Route path={`${ROUTE_PATHS.docs}/references/:slug`} element={<Docs />} />'),
    '`${ROUTE_PATHS.docs}/references/:slug`',
    'template Route path expression should be extracted',
  );
  assertEqual(
    extractRoutePathExpression('<Route element={<NoPath />} />'),
    null,
    'Route without path should not produce a path expression',
  );

  const parsedReferences = parseViteRoutePathReferences(viteRoutesSource, routePaths);

  assertDeepEqual(
    parsedReferences.references.map((reference) => reference.path),
    ['/', '/literal', '/docs/references/:slug'],
    'Vite route references should include resolved literal, constant, and template paths',
  );
  assertDeepEqual(
    parsedReferences.references.map((reference) => reference.line),
    [2, 6, 7],
    'Vite route references should preserve source line numbers',
  );
  assertEqual(parsedReferences.unresolved.length, 1, 'unresolved route references should be reported separately');
  assertEqual(
    parsedReferences.unresolved[0].expression,
    'ROUTE_PATHS.missing',
    'unresolved route reference should preserve original expression',
  );
  assertEqual(parsedReferences.unresolved[0].line, 8, 'unresolved route reference should preserve line number');

  assertDeepEqual(
    sortedPaths(parseViteRoutePaths(wildcardRoutesSource, routePaths).paths),
    ['/'],
    'parseViteRoutePaths should exclude wildcard paths by default',
  );
  assertDeepEqual(
    sortedPaths(parseViteRoutePaths(wildcardRoutesSource, routePaths, { includeWildcard: true }).paths),
    ['*', '/'],
    'parseViteRoutePaths should include wildcard paths when requested',
  );

  assertDeepEqual(
    loadRoutePathsFromFiles({
      'apps/web-vite/src/lib/route-policy-registry.ts': routePathsSource,
    }),
    {
      dashboard: '/dashboard',
      docs: '/docs',
      home: '/',
      order_1: '/orders/:id',
    },
    'in-memory route path loader should mirror the default route policy registry file',
  );
  assertDeepEqual(
    loadRoutePathsFromFiles({
      'apps/web-vite/src/lib/route-policy-registry.ts': routePathsSource,
    }, 'apps/web-vite/src/lib/missing.ts'),
    {},
    'missing route path file should return empty map',
  );

  return 'ROUTE_PATHS parsing, expression resolution, route extraction, wildcard filtering, and file loading passed.';
}
