import {
  APP_PAGE_EXTENSIONS,
  isAppPageFile,
  routePathForPageFile,
} from './app-route-paths.mjs';
import {
  parseViteRoutePathReferences,
} from './vite-route-paths.mjs';
import {
  repoFileExists,
} from '../shared/guard-utils.mjs';

export const VITE_ROUTE_REGISTRY_GUARD_NAME = 'vite-route-registry';
export const ROUTES_FILE = 'apps/web-vite/src/routes.tsx';

const LAZY_IMPORT_PATTERN =
  /const\s+([A-Za-z_$][\w$]*)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)\s*,?\s*\)/g;

export function normalizeAppSpecifier(specifier) {
  if (specifier === '@/app' || specifier.startsWith('@/app/')) {
    return specifier.replace(/^@\//, 'apps/web-vite/src/');
  }

  if (specifier === 'apps/web-vite/src/app' || specifier.startsWith('apps/web-vite/src/app/')) {
    return specifier;
  }

  return null;
}

export function resolveLazyPageImportWithExists(fileExists, specifier) {
  const normalized = normalizeAppSpecifier(specifier);
  if (!normalized) {
    return null;
  }

  if (/\.(?:tsx|ts|jsx|js)$/.test(normalized)) {
    return fileExists(normalized) ? normalized : null;
  }

  for (const extension of APP_PAGE_EXTENSIONS) {
    const candidate = `${normalized}.${extension}`;
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveLazyPageImport(repoRoot, specifier) {
  return resolveLazyPageImportWithExists(
    (candidate) => repoFileExists(repoRoot, candidate),
    specifier,
  );
}

export function parseLazyImports(source) {
  const imports = new Map();
  LAZY_IMPORT_PATTERN.lastIndex = 0;

  let match;
  while ((match = LAZY_IMPORT_PATTERN.exec(source)) !== null) {
    const [, componentName, specifier] = match;
    imports.set(componentName, {
      componentName,
      specifier,
    });
  }

  return imports;
}

export function parseRouteElements(source, routePaths) {
  const routes = [];
  const { references, unresolved } = parseViteRoutePathReferences(source, routePaths);

  for (const reference of references) {
    const componentMatch = reference.lineSource.match(/\belement=\{<([A-Za-z_$][\w$]*)\b/);

    if (!componentMatch) {
      continue;
    }

    routes.push({
      componentName: componentMatch[1],
      line: reference.line,
      path: reference.path,
    });
  }

  return { routes, unresolved };
}

export function auditViteRouteRegistry({
  pageFiles,
  routePaths,
  routesSource,
  resolveLazyPageImport,
}) {
  const expectedRouteByPage = new Map(pageFiles.map((file) => [file, routePathForPageFile(file)]));
  const expectedPageByRoute = new Map(pageFiles.map((file) => [routePathForPageFile(file), file]));
  const lazyImports = parseLazyImports(routesSource);
  const { routes, unresolved } = parseRouteElements(routesSource, routePaths);
  const routePathsByComponent = new Map();
  const pageFileByComponent = new Map();
  const findings = unresolved.map((reference) => (
    `${ROUTES_FILE}:${reference.line} cannot resolve route path expression ${reference.expression}`
  ));

  for (const route of routes) {
    if (!routePathsByComponent.has(route.componentName)) {
      routePathsByComponent.set(route.componentName, []);
    }
    routePathsByComponent.get(route.componentName).push(route);
  }

  for (const lazyImport of lazyImports.values()) {
    const pageFile = resolveLazyPageImport(lazyImport.specifier);
    if (!pageFile) {
      findings.push(`${lazyImport.componentName} imports missing or non-app page module: ${lazyImport.specifier}`);
      continue;
    }

    if (!isAppPageFile(pageFile)) {
      findings.push(`${lazyImport.componentName} imports non-page module: ${lazyImport.specifier}`);
      continue;
    }

    pageFileByComponent.set(lazyImport.componentName, pageFile);

    const componentRoutes = routePathsByComponent.get(lazyImport.componentName) ?? [];
    if (componentRoutes.length === 0) {
      findings.push(`${lazyImport.componentName} imports ${lazyImport.specifier} but is not used by any <Route>.`);
      continue;
    }

    const expectedRoutePath = expectedRouteByPage.get(pageFile);
    const routePaths = componentRoutes.map((route) => route.path);
    if (expectedRoutePath && !routePaths.includes(expectedRoutePath)) {
      findings.push(
        `${lazyImport.componentName} imports ${lazyImport.specifier}; expected route ${expectedRoutePath}, got ${routePaths.join(', ')}`,
      );
    }
  }

  for (const [routePath, pageFile] of expectedPageByRoute.entries()) {
    const matchingComponent = [...pageFileByComponent.entries()]
      .find(([, importedPageFile]) => importedPageFile === pageFile)?.[0];
    if (!matchingComponent) {
      findings.push(`${pageFile} is missing from ${ROUTES_FILE}; expected route ${routePath}.`);
      continue;
    }

    const matchingRoutes = routePathsByComponent.get(matchingComponent) ?? [];
    if (!matchingRoutes.some((route) => route.path === routePath)) {
      findings.push(`${pageFile} is imported as ${matchingComponent} but route ${routePath} is missing.`);
    }
  }

  return {
    findings,
    lazyImports,
    pageFiles,
  };
}

export function formatViteRouteRegistryFailure(findings) {
  return [
    `[${VITE_ROUTE_REGISTRY_GUARD_NAME}] Vite route registry drift was detected:`,
    ...findings.map((finding) => `- ${finding}`),
    '',
    `Keep ${ROUTES_FILE} synchronized with apps/web-vite/src/app page modules. Use lazy page imports for route entries and explicit redirects only for non-page routes.`,
  ].join('\n');
}

export function summarizeViteRouteRegistryAudit(result) {
  return `scanned ${result.pageFiles.length} app page files; ${result.lazyImports.size} lazy page imports verified.`;
}
