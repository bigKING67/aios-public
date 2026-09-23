import {
  isAppPageFile,
  routePathForPageFile,
} from './app-route-paths.mjs';

export const AUTH_NAVIGATION_FILE = 'apps/web-vite/src/lib/auth-navigation.ts';
export const ROUTE_POLICY_REGISTRY_FILE = 'apps/web-vite/src/lib/route-policy-registry.ts';
export const ROUTE_POLICY_GOVERNANCE_FILE = 'apps/web-vite/src/lib/route-policy-governance.ts';
export const VITE_ROUTES_FILE = 'apps/web-vite/src/routes.tsx';

const PROTECTED_ROUTE_PATTERN = /<ProtectedRoute\b/;

export function extractImportedRelativeModules(source, pageFile) {
  const modules = [];
  const importPattern = /\bimport\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
  const pageDir = pageFile.split('/').slice(0, -1).join('/');

  let match;
  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1];
    const normalized = `${pageDir}/${specifier}`.split('/');
    const parts = [];
    for (const part of normalized) {
      if (!part || part === '.') {
        continue;
      }
      if (part === '..') {
        parts.pop();
        continue;
      }
      parts.push(part);
    }
    modules.push(parts.join('/'));
  }

  return modules;
}

export function readExistingModuleSourceWithAccess(modulePath, { fileExists, readFile }) {
  const candidates = [
    `${modulePath}.tsx`,
    `${modulePath}.ts`,
    `${modulePath}.jsx`,
    `${modulePath}.js`,
    `${modulePath}/index.tsx`,
    `${modulePath}/index.ts`,
    `${modulePath}/index.jsx`,
    `${modulePath}/index.js`,
  ];

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return readFile(candidate);
    }
  }

  return '';
}

export function isProtectedPageWithAccess(pageFile, { fileExists, readFile }) {
  const pageSource = readFile(pageFile);
  if (PROTECTED_ROUTE_PATTERN.test(pageSource)) {
    return true;
  }

  return extractImportedRelativeModules(pageSource, pageFile).some((modulePath) => {
    const moduleSource = readExistingModuleSourceWithAccess(modulePath, { fileExists, readFile });
    return PROTECTED_ROUTE_PATTERN.test(moduleSource);
  });
}

export function findFunctionSource(source, signature) {
  const start = source.indexOf(signature);
  if (start === -1) {
    return null;
  }

  const bodyStart = source.indexOf('{', start);
  if (bodyStart === -1) {
    return null;
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          source: source.slice(start, index + 1),
          start,
        };
      }
    }
  }

  return null;
}

export function collectAuthNavigationRegistryFindings(authNavigationSource) {
  const findings = [];

  if (!authNavigationSource.includes('findRoutePolicyEntry')) {
    findings.push(`${AUTH_NAVIGATION_FILE} must resolve access through findRoutePolicyEntry().`);
  }

  if (!authNavigationSource.includes('switch (policyEntry.kind)')) {
    findings.push(`${AUTH_NAVIGATION_FILE} must dispatch canAccessPath() by route policy kind.`);
  }

  if (!authNavigationSource.includes("from './route-policy-registry'")) {
    findings.push(`${AUTH_NAVIGATION_FILE} must import ${ROUTE_POLICY_REGISTRY_FILE}.`);
  }

  return findings;
}

export function collectPolicyPageDriftWithExists(routePolicyEntries, viteRoutePaths, fileExists) {
  const findings = [];

  for (const entry of routePolicyEntries) {
    if (!entry || typeof entry.page !== 'string' || !entry.page) {
      continue;
    }

    if (!fileExists(entry.page)) {
      findings.push(`${entry.path} policy page is missing: ${entry.page}`);
      continue;
    }

    if (!isAppPageFile(entry.page)) {
      findings.push(`${entry.path} policy page is not a apps/web-vite/src/app page file: ${entry.page}`);
      continue;
    }

    const pageRoutePath = routePathForPageFile(entry.page);
    if (pageRoutePath !== entry.path) {
      findings.push(`${entry.path} policy page ${entry.page} resolves to ${pageRoutePath}`);
    }

    if (!viteRoutePaths.has(entry.path)) {
      findings.push(`${entry.path} policy page ${entry.page} is not mounted in ${VITE_ROUTES_FILE}`);
    }
  }

  return findings;
}

export function buildRouteAccessAppRoutes({
  appPageFiles,
  fileExists,
  findRoutePolicyEntry,
  readFile,
}) {
  return appPageFiles.map((file) => {
    const routePath = routePathForPageFile(file);
    return {
      file,
      isProtected: isProtectedPageWithAccess(file, { fileExists, readFile }),
      policy: findRoutePolicyEntry(routePath),
      routePath,
    };
  });
}

export function auditRouteAccessCoverage({
  appPageFiles,
  authNavigationSource,
  fileExists,
  findRoutePolicyEntry,
  readFile,
  routePolicyEntries,
  viteRoutePaths,
}) {
  const canAccessFunction = findFunctionSource(authNavigationSource, 'export function canAccessPath');
  if (!canAccessFunction) {
    return {
      status: 'fail',
      type: 'error',
      message: `${AUTH_NAVIGATION_FILE} must export canAccessPath().`,
    };
  }

  const [authFinding] = collectAuthNavigationRegistryFindings(authNavigationSource);
  if (authFinding) {
    return {
      status: 'fail',
      type: 'error',
      message: authFinding,
    };
  }

  const appRoutes = buildRouteAccessAppRoutes({
    appPageFiles,
    fileExists,
    findRoutePolicyEntry,
    readFile,
  });

  const policyPageDrift = collectPolicyPageDriftWithExists(
    routePolicyEntries,
    viteRoutePaths,
    fileExists,
  );
  if (policyPageDrift.length > 0) {
    return {
      status: 'fail',
      type: 'findings',
      header: 'Route policy page metadata drift was detected:',
      findings: policyPageDrift,
      footer: `Keep ${ROUTE_POLICY_GOVERNANCE_FILE}, apps/web-vite/src/app page paths, and ${VITE_ROUTES_FILE} synchronized.`,
    };
  }

  const routesMissingViteRegistration = appRoutes.filter(({ routePath }) => (
    !viteRoutePaths.has(routePath)
  ));
  if (routesMissingViteRegistration.length > 0) {
    return {
      status: 'fail',
      type: 'findings',
      header: 'App routes are missing Vite route registry coverage:',
      findings: routesMissingViteRegistration.map((route) => `${route.file} -> ${route.routePath}`),
      footer: `Add these routes to ${VITE_ROUTES_FILE}.`,
    };
  }

  const routesMissingPolicy = appRoutes.filter(({ routePath }) => (
    findRoutePolicyEntry(routePath)?.path !== routePath
  ));
  if (routesMissingPolicy.length > 0) {
    return {
      status: 'fail',
      type: 'findings',
      header: 'App routes are missing route policy registry coverage:',
      findings: routesMissingPolicy.map((route) => `${route.file} -> ${route.routePath}`),
      footer: `Add these routes to ${ROUTE_POLICY_REGISTRY_FILE} before relying on canAccessPath().`,
    };
  }

  const protectedPagesWithPublicPolicy = appRoutes.filter(({ isProtected, policy }) => (
    isProtected && policy?.kind === 'public'
  ));
  if (protectedPagesWithPublicPolicy.length > 0) {
    return {
      status: 'fail',
      type: 'findings',
      header: 'Protected app pages are covered by public route policies:',
      findings: protectedPagesWithPublicPolicy.map((route) => `${route.file} -> ${route.routePath} (${route.policy.kind})`),
      footer: `Move these pages to a protected route policy kind in ${ROUTE_POLICY_REGISTRY_FILE}.`,
    };
  }

  return {
    status: 'pass',
    appRoutes,
    canAccessFunction,
  };
}
