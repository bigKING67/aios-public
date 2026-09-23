export function routePathConstantNameForValue(routePaths, routePath) {
  return Object.entries(routePaths)
    .find(([, value]) => value === routePath)?.[0];
}

export function resolveRoutePathExpression(expression, routePaths) {
  const routePathConstantMatch = /^ROUTE_PATHS\.([A-Za-z0-9_]+)$/.exec(expression.trim());
  if (routePathConstantMatch) {
    return routePaths[routePathConstantMatch[1]];
  }

  return expression;
}

export function collectLayoutMenuRouteItems(layoutSource, routePaths) {
  const itemPattern = /\{\s*key:\s*(ROUTE_PATHS\.[A-Za-z0-9_]+)[\s\S]*?\n\s*\}/g;
  const items = [];

  let match;
  while ((match = itemPattern.exec(layoutSource)) !== null) {
    const itemSource = match[0];
    const keyPath = resolveRoutePathExpression(match[1], routePaths);
    if (!keyPath?.startsWith('/')) {
      continue;
    }

    const toConstantMatch = /\bto=\{(ROUTE_PATHS\.[A-Za-z0-9_]+)\}/.exec(itemSource);
    const loginRedirectMatch = /\bto=\{buildLoginRedirectHref\((ROUTE_PATHS\.[A-Za-z0-9_]+)\)\}/.exec(itemSource);

    items.push({
      keyExpression: match[1],
      keyPath,
      loginRedirectPath: loginRedirectMatch
        ? resolveRoutePathExpression(loginRedirectMatch[1], routePaths)
        : undefined,
      toPath: toConstantMatch
        ? resolveRoutePathExpression(toConstantMatch[1], routePaths)
        : undefined,
    });
  }

  return items;
}

export function collectLayoutMenuKeyTargetFindings(layoutSource, routePaths) {
  const findings = [];
  const routeItems = collectLayoutMenuRouteItems(layoutSource, routePaths);

  for (const item of routeItems) {
    if (item.toPath && item.toPath !== item.keyPath) {
      findings.push(`${item.keyExpression} key resolves to ${item.keyPath}, but Link to resolves to ${item.toPath}`);
    }
    if (item.loginRedirectPath && item.loginRedirectPath !== item.keyPath) {
      findings.push(
        `${item.keyExpression} login redirect key resolves to ${item.keyPath}, but redirect target resolves to ${item.loginRedirectPath}`,
      );
    }
    if (!item.toPath && !item.loginRedirectPath) {
      findings.push(`${item.keyExpression} route menu item is missing a Link to target`);
    }
  }

  return findings;
}

export function collectLayoutPathLiterals(layoutSource, routePaths) {
  const patterns = [
    /\bcanAccess\(\s*(['"][^'"]+['"]|ROUTE_PATHS\.[A-Za-z0-9_]+)\s*\)/g,
    /\bbuildLoginRedirectHref\(\s*(['"][^'"]+['"]|ROUTE_PATHS\.[A-Za-z0-9_]+)\s*\)/g,
    /\bkey:\s*(['"][^'"]+['"]|ROUTE_PATHS\.[A-Za-z0-9_]+)/g,
    /\bto=\{(ROUTE_PATHS\.[A-Za-z0-9_]+)\}/g,
    /\bto=["']([^"']+)["']/g,
  ];
  const paths = new Set();

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(layoutSource)) !== null) {
      const pathLiteral = resolveRoutePathExpression(
        match[1].replace(/^['"]|['"]$/g, ''),
        routePaths,
      );
      if (pathLiteral.startsWith('/')) {
        paths.add(pathLiteral);
      }
    }
  }

  return [...paths].sort();
}

export function protectedComponentImportName(componentPath) {
  return componentPath
    .split('/')
    .at(-1)
    ?.replace(/\.(tsx|ts)$/, '');
}

export function extractProtectedRouteOpenings(source) {
  return [...source.matchAll(/<ProtectedRoute\b[\s\S]*?(?:>|\/>)/g)].map((match) => match[0]);
}

function hasPermissionProtectedRoute(openings, permissionConstantName) {
  return openings.some((opening) => (
    opening.includes(`requiredPermission={${permissionConstantName}}`) &&
    opening.includes('permissionMode="any"')
  ));
}

function collectPermissionProtectedRouteFindings(openings, expectation, permissionConstantName) {
  return hasPermissionProtectedRoute(openings, permissionConstantName)
    ? []
    : [`${expectation.route} ${expectation.kind} ProtectedRoute must use ${permissionConstantName} with permissionMode="any"`];
}

export function collectProtectedRoutePolicyPropFindings(expectation, protectedSource) {
  const protectedRouteOpenings = extractProtectedRouteOpenings(protectedSource);
  if (protectedRouteOpenings.length === 0) {
    return [`${expectation.route} must include a ProtectedRoute opening tag`];
  }

  switch (expectation.kind) {
    case 'authenticated':
    case 'sample_inventory':
    case 'creator_dashboard':
    case 'content_assets':
    case 'content_assets_write':
      return protectedRouteOpenings.some((opening) => opening.includes('requiredPermission='))
        ? [`${expectation.route} ${expectation.kind} ProtectedRoute must rely on route policy access without extra requiredPermission`]
        : [];
    case 'report_read':
      return collectPermissionProtectedRouteFindings(protectedRouteOpenings, expectation, 'REPORT_READ_PERMISSIONS');
    case 'report_export':
      return collectPermissionProtectedRouteFindings(protectedRouteOpenings, expectation, 'REPORT_EXPORT_PERMISSIONS');
    case 'agent_workspace':
      return collectPermissionProtectedRouteFindings(protectedRouteOpenings, expectation, 'AGENT_WORKSPACE_ACCESS_PERMISSIONS');
    case 'marketing_workspace':
      return collectPermissionProtectedRouteFindings(protectedRouteOpenings, expectation, 'MARKETING_WORKSPACE_READ_PERMISSIONS');
    case 'creator_library':
      return collectPermissionProtectedRouteFindings(protectedRouteOpenings, expectation, 'CREATOR_LIBRARY_READ_PERMISSIONS');
    case 'dataops':
      return collectPermissionProtectedRouteFindings(protectedRouteOpenings, expectation, 'DATAOPS_READ_PERMISSIONS');
    case 'admin':
      return collectPermissionProtectedRouteFindings(protectedRouteOpenings, expectation, 'ADMIN_READ_PERMISSIONS');
    default:
      throw new Error(`Unhandled ProtectedRoute policy kind: ${expectation.kind}`);
  }
}

function pushMissingSnippetFinding(findings, source, snippet, message) {
  if (!source.includes(snippet)) {
    findings.push(message);
  }
}

function pushUnexpectedSnippetFinding(findings, source, snippet, message) {
  if (source.includes(snippet)) {
    findings.push(message);
  }
}

export function collectNavigationPolicySourceFindings(source, policyPaths) {
  const findings = [];

  pushMissingSnippetFinding(
    findings,
    source,
    "from './route-policy-registry'",
    'auth-navigation must import route policy registry',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'findRoutePolicyEntry',
    'auth-navigation access decisions must be driven by route policy registry lookup',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'type RoutePolicyEntry',
    'auth-navigation must type its policy evaluator against RoutePolicyEntry',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'switch (policyEntry.kind)',
    'auth-navigation must dispatch access decisions by route policy kind',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'isAuthenticated &&',
    'protected navigation policy must check authentication',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'resolveSafeEntryPath',
    'safe entry fallback must stay centralized in auth-navigation',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'AUTH_NAVIGATION_FALLBACK_PATHS',
    'safe entry fallback paths must be exported for behavior gates',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'ROUTE_PATHS.dashboard',
    'safe entry fallback must use route policy registry constants',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'return ROUTE_PATHS.home',
    'auth-navigation root fallback must use route policy registry constants',
  );
  pushUnexpectedSnippetFinding(
    findings,
    source,
    "return '/'",
    'auth-navigation should not reintroduce raw root fallback literals',
  );

  for (const routePath of policyPaths) {
    pushUnexpectedSnippetFinding(
      findings,
      source,
      `pathname === '${routePath}'`,
      `auth-navigation should not reintroduce hand-written path branch for ${routePath}`,
    );
    pushUnexpectedSnippetFinding(
      findings,
      source,
      `startsWith('${routePath}/')`,
      `auth-navigation should not reintroduce hand-written prefix branch for ${routePath}`,
    );
  }

  return findings;
}

export function collectProtectedRouteSourceRouteConstantFindings(source) {
  const findings = [];
  const rawPathPatterns = [
    /canAccessPath\(\s*pathname\s*\|\|\s*['"][^'"]+['"]/g,
    /const\s+currentPath\s*=\s*pathname\s*\|\|\s*['"][^'"]+['"]/g,
    /`\/login\?redirect=/g,
    /resolveSafeEntryPath\(\s*['"][^'"]+['"]/g,
  ];
  const rawRouteUsages = rawPathPatterns.flatMap((pattern) => {
    pattern.lastIndex = 0;
    return [...source.matchAll(pattern)].map((match) => match[0]);
  });

  pushMissingSnippetFinding(
    findings,
    source,
    "import { ROUTE_PATHS } from '@/lib/route-policy-registry'",
    'ProtectedRoute route paths must come from route policy registry constants',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'pathname || ROUTE_PATHS.home',
    'ProtectedRoute empty pathname fallback must use ROUTE_PATHS.home',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    '`${ROUTE_PATHS.login}?redirect=',
    'ProtectedRoute login redirect must use ROUTE_PATHS.login',
  );
  pushMissingSnippetFinding(
    findings,
    source,
    'resolveSafeEntryPath(undefined',
    'ProtectedRoute safe fallback should allow AUTH_NAVIGATION_FALLBACK_PATHS order to decide the first safe entry',
  );

  if (rawRouteUsages.length > 0) {
    findings.push(`ProtectedRoute internal navigation paths must use ROUTE_PATHS constants instead of raw path literals: ${rawRouteUsages.join(', ')}`);
  }

  return findings;
}

export function identity(overrides = {}) {
  return {
    email: 'regular@example.com',
    fullName: 'Regular User',
    username: 'regular-user',
    ...overrides,
  };
}

export function canAccessPathFactory(canAccessPath) {
  return function canAccess(pathname, options = {}) {
    return canAccessPath(
      pathname,
      options.permissions ?? [],
      options.roles ?? [],
      options.identity ?? identity(),
      options.isAuthenticated ?? true,
    );
  };
}

export function allowedContextForKind(kind) {
  switch (kind) {
    case 'authenticated':
    case 'sample_inventory':
      return { isAuthenticated: true };
    case 'creator_dashboard':
      return { roles: ['dashboard_view'] };
    case 'admin':
      return { permissions: ['user:list:all'] };
    case 'dataops':
      return { permissions: ['dataops:view'] };
    case 'agent_workspace':
      return { permissions: ['agent:read'] };
    case 'report_read':
      return { permissions: ['reports:read'] };
    case 'report_export':
      return { permissions: ['exports:create'] };
    case 'marketing_workspace':
      return { roles: ['bd'] };
    case 'creator_library':
      return { permissions: ['marketing:creator_library:read'] };
    case 'content_assets':
      return { isAuthenticated: true };
    case 'content_assets_write':
      return { roles: ['content_ops'] };
    default:
      throw new Error(`Unhandled protected route policy kind: ${kind}`);
  }
}
