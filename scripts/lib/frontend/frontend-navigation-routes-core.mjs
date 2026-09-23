/**
 * Frontend navigation route registry audit.
 *
 * The Vite route registry proves page modules are mounted. This companion
 * guard proves high-signal first-party navigation targets still resolve to
 * registered Vite routes, including dynamic docs reference routes and login
 * redirect targets.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  listGitFiles,
  readRequiredFile,
  repoFileExists,
} from '../shared/guard-utils.mjs';
import {
  loadRoutePaths,
  parseViteRoutePaths,
} from './vite-route-paths.mjs';

const GUARD_NAME = 'navigation-route-registry';
const ROUTES_FILE = 'apps/web-vite/src/routes.tsx';

const FRONTEND_SOURCE_ROOTS = Object.freeze([
  'apps/web-vite/src',
  'apps/web-vite/src/app',
  'apps/web-vite/src/components',
  'apps/web-vite/src/lib',
]);
const FRONTEND_SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx)$/;
const IGNORED_SOURCE_PATH_PATTERN = /(?:^|\/)(?:api|__tests__|test-results|dist|build)\//;
const CORE_NAVIGATION_SOURCE_FILES = Object.freeze([
  ROUTES_FILE,
  'apps/web-vite/src/components/organisms/layout.tsx',
  'apps/web-vite/src/components/organisms/layout-navigation-model.tsx',
  'apps/web-vite/src/components/organisms/layout-route-selection.ts',
  'apps/web-vite/src/components/user-menu.tsx',
  'apps/web-vite/src/components/protected-route.tsx',
  'apps/web-vite/src/lib/auth-navigation.ts',
  'apps/web-vite/src/app/_components/home-page.tsx',
  'apps/web-vite/src/app/docs/docs-workspace.tsx',
  'apps/web-vite/src/app/login/_components/login-page-client.tsx',
  'apps/web-vite/src/app/marketing/_components/marketing-page-content.tsx',
  'apps/web-vite/src/app/marketing/_components/marketing-module-shell.tsx',
  'apps/web-vite/src/app/reports/weekly/_components/compact-header.tsx',
  'apps/web-vite/src/app/dashboard/_components/dashboard-filter-header.tsx',
  'apps/web-vite/src/app/dashboard/_components/dashboard-shell-handlers.ts',
  'apps/web-vite/src/app/dashboard/creator/_components/creator-login-redirect.ts',
  'apps/web-vite/src/app/dashboard/creator/_components/creator-tabs.ts',
  'apps/web-vite/src/app/dashboard/creator/_components/creator-dashboard-top-bar.tsx',
  'apps/web-vite/src/app/dashboard/creator/_components/creator-dashboard-shell.tsx',
]);

const JSX_NAV_ATTR_PATTERN = /\b(?:to|href)\s*=\s*["']([^"']+)["']/g;
const OBJECT_NAV_PROP_PATTERN = /\b(?:href|to|key)\s*:\s*['"]([^'"]+)['"]/g;
const OBJECT_LINK_PROP_DISCOVERY_PATTERN = /\b(?:href|to)\s*:\s*['"]\/[^'"]*['"]/;
const JSX_NAV_DISCOVERY_PATTERN = /\b(?:to|href)\s*=\s*["'](?:\/|#)[^"']*["']/;
const ROUTER_NAVIGATION_DISCOVERY_PATTERN =
  /react-router-dom|\bnavigate\(|\b(?:buildLoginRedirectHref|resolveSafeEntryPath|canAccess|canAccessPath)\(|\b(?:AUTH_NAVIGATION_)?FALLBACK_PATHS\b/;
const STATIC_NAV_CALL_PATTERN =
  /\b(?:navigate|buildLoginRedirectHref|resolveSafeEntryPath|canAccess|canAccessPath)\(\s*['"]([^'"]+)['"]/g;
const LOGIN_REDIRECT_TEMPLATE_PATTERN = /`(\/login\?redirect=\$\{[^`]+\})`/g;
const AUTH_NAVIGATION_FALLBACK_PATHS_PATTERN = /\bAUTH_NAVIGATION_FALLBACK_PATHS\s*=\s*\[([\s\S]*?)\]/m;
const QUOTED_VALUE_PATTERN = /['"]([^'"]+)['"]/g;

const { fail, reportOk } = createCheckGuard(GUARD_NAME);

export function lineNumberForIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}

export function stripQueryAndHash(target) {
  return target.split('?')[0].split('#')[0] || '/';
}

export function isIgnorableNavigationTarget(target) {
  const trimmed = target.trim();
  return (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  );
}

export function normalizeNavigationTarget(target) {
  const trimmed = target.trim();
  if (!trimmed || trimmed.includes('${')) {
    return trimmed;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function routePathToRegex(routePath) {
  const pattern = routePath
    .split('/')
    .map((segment) => {
      if (!segment) {
        return '';
      }
      if (segment.startsWith(':')) {
        return '[^/]+';
      }
      return escapeRegex(segment);
    })
    .join('/');

  return new RegExp(`^${pattern}$`);
}

export function parseNavigationRoutePatterns(routesSource, routePaths) {
  const routes = [];

  for (const routePath of parseViteRoutePaths(routesSource, routePaths).paths) {
    if (!routePath) {
      continue;
    }

    routes.push({
      path: routePath,
      regex: routePath.includes(':') ? routePathToRegex(routePath) : null,
    });
  }

  return routes;
}

export function isRegisteredNavigationRoute(target, routePatterns) {
  if (isIgnorableNavigationTarget(target)) {
    return true;
  }

  const normalizedTarget = normalizeNavigationTarget(target);
  const pathname = stripQueryAndHash(normalizedTarget);

  return routePatterns.some((route) => (
    route.path === pathname ||
    (route.regex ? route.regex.test(pathname) : false)
  ));
}

export function validateLoginRedirect(target, routePatterns, routePaths) {
  const normalizedTarget = normalizeNavigationTarget(target);
  const loginPath = routePaths.login ?? '/login';

  if (!normalizedTarget.startsWith(`${loginPath}?`)) {
    return [];
  }

  if (!isRegisteredNavigationRoute(loginPath, routePatterns)) {
    return [`login redirect target uses ${loginPath}, but ${loginPath} is not registered.`];
  }

  if (normalizedTarget.includes('${')) {
    return [];
  }

  const query = normalizedTarget.split('?')[1] ?? '';
  const params = new URLSearchParams(query);
  const redirect = params.get('redirect');
  if (!redirect) {
    return [];
  }

  const decodedRedirect = decodeURIComponent(redirect);
  if (!isRegisteredNavigationRoute(decodedRedirect, routePatterns)) {
    return [`login redirect points to unregistered route: ${decodedRedirect}`];
  }

  return [];
}

export function isNavigationSourceFile(filePath) {
  return (
    FRONTEND_SOURCE_FILE_PATTERN.test(filePath) &&
    !IGNORED_SOURCE_PATH_PATTERN.test(filePath)
  );
}

export function looksLikeNavigationSource(source) {
  return (
    ROUTER_NAVIGATION_DISCOVERY_PATTERN.test(source) ||
    JSX_NAV_DISCOVERY_PATTERN.test(source) ||
    OBJECT_LINK_PROP_DISCOVERY_PATTERN.test(source)
  );
}

export function discoverNavigationSourceFiles(repoRoot) {
  const discoveredFiles = listGitFiles(FRONTEND_SOURCE_ROOTS, {
    cwd: repoRoot,
    filter: isNavigationSourceFile,
  }).filter((filePath) => {
    const source = readRequiredFile(repoRoot, filePath, fail);
    return looksLikeNavigationSource(source);
  });

  return [...new Set([
    ...CORE_NAVIGATION_SOURCE_FILES.filter((filePath) => repoFileExists(repoRoot, filePath)),
    ...discoveredFiles,
  ])].sort();
}

export function addNavigationMatchReferences(references, source, filePath, pattern, kind) {
  pattern.lastIndex = 0;

  let match;
  while ((match = pattern.exec(source)) !== null) {
    const rawTarget = match[1];
    if (!rawTarget || (!rawTarget.startsWith('/') && !rawTarget.startsWith('#'))) {
      continue;
    }

    references.push({
      filePath,
      kind,
      line: lineNumberForIndex(source, match.index),
      target: rawTarget,
    });
  }
}

export function addFallbackPathReferences(references, source, filePath) {
  const match = AUTH_NAVIGATION_FALLBACK_PATHS_PATTERN.exec(source);
  if (!match) {
    return;
  }

  QUOTED_VALUE_PATTERN.lastIndex = 0;
  const valueOffset = match[0].indexOf(match[1]);

  let valueMatch;
  while ((valueMatch = QUOTED_VALUE_PATTERN.exec(match[1])) !== null) {
    const rawTarget = valueMatch[1];
    if (!rawTarget.startsWith('/')) {
      continue;
    }

    references.push({
      filePath,
      kind: 'fallback-path',
      line: lineNumberForIndex(source, match.index + valueOffset + valueMatch.index),
      target: rawTarget,
    });
  }
}

export function extractNavigationReferences(source, filePath) {
  const references = [];
  addNavigationMatchReferences(references, source, filePath, JSX_NAV_ATTR_PATTERN, 'jsx-nav-attr');
  addNavigationMatchReferences(references, source, filePath, OBJECT_NAV_PROP_PATTERN, 'object-nav-prop');
  addNavigationMatchReferences(references, source, filePath, STATIC_NAV_CALL_PATTERN, 'static-nav-call');
  addNavigationMatchReferences(references, source, filePath, LOGIN_REDIRECT_TEMPLATE_PATTERN, 'login-redirect-template');
  addFallbackPathReferences(references, source, filePath);
  return references;
}

export function formatNavigationReference(reference) {
  return `${reference.filePath}:${reference.line} ${reference.kind} ${JSON.stringify(reference.target)}`;
}

export function auditNavigationRouteRegistry({
  routePaths,
  routesSource,
  sourceFiles,
}) {
  const { unresolved } = parseViteRoutePaths(routesSource, routePaths);
  const routePatterns = parseNavigationRoutePatterns(routesSource, routePaths);
  const findings = unresolved.map((reference) => (
    `${ROUTES_FILE}:${reference.line} cannot resolve route path expression ${reference.expression}`
  ));
  const references = [];

  for (const { filePath, source } of sourceFiles) {
    references.push(...extractNavigationReferences(source, filePath));
  }

  for (const reference of references) {
    for (const loginFinding of validateLoginRedirect(reference.target, routePatterns, routePaths)) {
      findings.push(`${formatNavigationReference(reference)}: ${loginFinding}`);
    }

    if (!isRegisteredNavigationRoute(reference.target, routePatterns)) {
      findings.push(`${formatNavigationReference(reference)} does not resolve to a registered Vite route.`);
    }
  }

  return {
    findings,
    references,
    routePatterns,
    scannedFiles: sourceFiles,
  };
}

function printFailures(findings) {
  if (findings.length === 0) {
    return;
  }

  console.error(`[${GUARD_NAME}] Frontend navigation route drift was detected:`);
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  console.error(
    `\nKeep navigation targets synchronized with ${ROUTES_FILE}. First-party links should resolve to registered Vite routes or approved hash/external targets.`,
  );
  process.exit(1);
}

export function runNavigationRouteRegistryCheck() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const routesSource = readRequiredFile(repoRoot, ROUTES_FILE, fail, {
    missingMessage: `${ROUTES_FILE} not found.`,
  });
  const routePaths = loadRoutePaths(repoRoot);
  const scannedFiles = discoverNavigationSourceFiles(repoRoot);
  const result = auditNavigationRouteRegistry({
    routePaths,
    routesSource,
    sourceFiles: scannedFiles.map((filePath) => ({
      filePath,
      source: readRequiredFile(repoRoot, filePath, fail),
    })),
  });

  printFailures(result.findings);
  reportOk(
    `scanned ${result.scannedFiles.length} navigation source files; ${result.references.length} first-party navigation targets verified against ${result.routePatterns.length} Vite route patterns.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runNavigationRouteRegistryCheck();
}
