import { readFileSync } from 'node:fs';

import {
  DEFAULT_ACCESS_COOKIE_NAME,
  DEFAULT_BASE_URL,
  DEFAULT_BODY_TEXT_MIN_LENGTH,
  DEFAULT_REFRESH_COOKIE_NAME,
  SMOKE_ROUTES_PATH,
} from './constants.mjs';

export function parseIntegerEnv(name, fallback) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeBaseUrl(rawBaseUrl) {
  const value = (rawBaseUrl || DEFAULT_BASE_URL).trim();
  if (!value) {
    return DEFAULT_BASE_URL;
  }

  try {
    const parsed = new URL(value);
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`Invalid FRONTEND_SMOKE_BASE_URL: ${value}`);
  }
}

export function normalizeRoutePath(route) {
  const trimmedRoute = typeof route === 'string' ? route.trim() : '';
  if (!trimmedRoute) {
    return '/';
  }
  return trimmedRoute.startsWith('/') ? trimmedRoute : `/${trimmedRoute}`;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

const PERFORMANCE_BUDGET_KEYS = Object.freeze([
  'maxLcpMs',
  'maxInpMs',
  'maxCls',
  'maxDomContentLoadedMs',
  'maxLoadMs',
  'maxResponseEndMs',
  'maxResourceTransferKb',
  'maxScriptTransferKb',
  'maxResourceCount',
  'maxDomNodeCount',
]);

function normalizePerformanceBudget(value, routePath) {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${SMOKE_ROUTES_PATH} ${routePath} performanceBudget must be an object when provided.`);
  }

  const budget = {};
  for (const key of PERFORMANCE_BUDGET_KEYS) {
    if (value[key] === undefined) {
      continue;
    }
    const budgetValue = value[key];
    const isValid = key === 'maxCls'
      ? Number.isFinite(budgetValue) && budgetValue > 0 && budgetValue <= 1
      : Number.isInteger(budgetValue) && budgetValue > 0;
    if (!isValid) {
      const expectation = key === 'maxCls'
        ? 'a number greater than 0 and at most 1'
        : 'a positive integer';
      throw new Error(`${SMOKE_ROUTES_PATH} ${routePath} performanceBudget.${key} must be ${expectation}.`);
    }
    budget[key] = budgetValue;
  }

  return budget;
}

function normalizePerformanceInteractionSelector(value, routePath) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${SMOKE_ROUTES_PATH} ${routePath} performanceInteractionSelector must be a non-empty string when provided.`);
  }
  return value.trim();
}

function normalizeSettleTimeoutMs(value, routePath) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${SMOKE_ROUTES_PATH} ${routePath} settleTimeoutMs must be a positive integer when provided.`);
  }
  return value;
}

function normalizeRouteProfile(profile, fallbackPath, fallbackMinBodyTextLength, fallbackPerformanceBudget = {}) {
  const expectedFinalPath = typeof profile.expectedFinalPath === 'string'
    ? normalizeRoutePath(profile.expectedFinalPath)
    : undefined;
  const minBodyTextLength = Number.isInteger(profile.minBodyTextLength)
    ? profile.minBodyTextLength
    : fallbackMinBodyTextLength;
  const performanceBudget = normalizePerformanceBudget(profile.performanceBudget, fallbackPath);

  if (minBodyTextLength <= 0) {
    throw new Error(`${SMOKE_ROUTES_PATH} ${fallbackPath} authenticatedProfile.minBodyTextLength must be a positive integer.`);
  }

  return {
    authState: typeof profile.authState === 'string' ? profile.authState : 'authenticated',
    expectedCssVariables: normalizeStringArray(profile.expectedCssVariables),
    expectedFinalPath,
    expectedFinalSearchIncludes: normalizeStringArray(profile.expectedFinalSearchIncludes),
    expectedText: normalizeStringArray(profile.expectedText),
    minBodyTextLength,
    performanceInteractionSelector: normalizePerformanceInteractionSelector(
      profile.performanceInteractionSelector,
      fallbackPath,
    ),
    performanceBudget: Object.keys(performanceBudget).length > 0
      ? performanceBudget
      : fallbackPerformanceBudget,
    settleTimeoutMs: normalizeSettleTimeoutMs(profile.settleTimeoutMs, fallbackPath),
  };
}

function readDefaultRouteExpectations() {
  let config;
  try {
    config = JSON.parse(readFileSync(SMOKE_ROUTES_PATH, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${SMOKE_ROUTES_PATH}: ${detail}`);
  }

  if (config?.version !== 1 || !Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error(`${SMOKE_ROUTES_PATH} must contain version=1 and a non-empty routes array.`);
  }

  return config.routes.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${SMOKE_ROUTES_PATH} routes must contain JSON objects.`);
    }
    if (typeof entry.path !== 'string' || entry.path.trim() === '') {
      throw new Error(`${SMOKE_ROUTES_PATH} route entries must include a non-empty path.`);
    }

    const minBodyTextLength = Number.isInteger(entry.minBodyTextLength)
      ? entry.minBodyTextLength
      : DEFAULT_BODY_TEXT_MIN_LENGTH;
    if (minBodyTextLength <= 0) {
      throw new Error(`${SMOKE_ROUTES_PATH} ${entry.path} minBodyTextLength must be a positive integer.`);
    }

    const authProfile = entry.authenticatedProfile;
    if (authProfile !== undefined && (!authProfile || typeof authProfile !== 'object' || Array.isArray(authProfile))) {
      throw new Error(`${SMOKE_ROUTES_PATH} ${entry.path} authenticatedProfile must be an object when provided.`);
    }

    const performanceBudget = normalizePerformanceBudget(entry.performanceBudget, entry.path);
    const settleTimeoutMs = normalizeSettleTimeoutMs(entry.settleTimeoutMs, entry.path);

    return {
      path: normalizeRoutePath(entry.path),
      description: typeof entry.description === 'string' ? entry.description : '',
      authState: typeof entry.authState === 'string' ? entry.authState : 'public',
      authenticatedProfile: authProfile
        ? normalizeRouteProfile(authProfile, entry.path, minBodyTextLength, performanceBudget)
        : undefined,
      enabledByDefault: entry.enabledByDefault !== false,
      expectedFinalPath: typeof entry.expectedFinalPath === 'string'
        ? normalizeRoutePath(entry.expectedFinalPath)
        : undefined,
      expectedCssVariables: normalizeStringArray(entry.expectedCssVariables),
      expectedFinalSearchIncludes: normalizeStringArray(entry.expectedFinalSearchIncludes),
      expectedText: normalizeStringArray(entry.expectedText),
      minBodyTextLength,
      performanceInteractionSelector: normalizePerformanceInteractionSelector(
        entry.performanceInteractionSelector,
        entry.path,
      ),
      performanceBudget,
      settleTimeoutMs,
    };
  });
}

function applyAuthenticatedRouteProfile(routeExpectation) {
  if (!routeExpectation.authenticatedProfile) {
    return routeExpectation;
  }

  const profile = routeExpectation.authenticatedProfile;
  return {
    ...routeExpectation,
    authState: profile.authState,
    expectedCssVariables: profile.expectedCssVariables.length > 0
      ? profile.expectedCssVariables
      : routeExpectation.expectedCssVariables,
    expectedFinalPath: profile.expectedFinalPath,
    expectedFinalSearchIncludes: profile.expectedFinalSearchIncludes,
    expectedText: profile.expectedText,
    minBodyTextLength: profile.minBodyTextLength,
    performanceInteractionSelector: profile.performanceInteractionSelector
      ?? routeExpectation.performanceInteractionSelector,
    performanceBudget: profile.performanceBudget,
    settleTimeoutMs: profile.settleTimeoutMs ?? routeExpectation.settleTimeoutMs,
  };
}

function isAuthenticatedSmokeProfile(env = process.env) {
  return env.FRONTEND_SMOKE_AUTH_PROFILE === '1';
}

function applyPerformanceBudgetMode(routeExpectations, env = process.env) {
  if (env.FRONTEND_SMOKE_PERFORMANCE_BUDGET === '1') {
    return routeExpectations;
  }

  return routeExpectations.map((route) => ({
    ...route,
    performanceInteractionSelector: undefined,
    performanceBudget: {},
  }));
}

export function parseRouteExpectations() {
  const defaultExpectations = readDefaultRouteExpectations();
  const rawRoutes = process.env.FRONTEND_SMOKE_ROUTES;
  if (!rawRoutes) {
    if (isAuthenticatedSmokeProfile()) {
      return applyPerformanceBudgetMode(defaultExpectations
        .filter((route) => route.enabledByDefault || route.authenticatedProfile)
        .map(applyAuthenticatedRouteProfile));
    }

    const selectedRoutes = process.env.FRONTEND_SMOKE_INCLUDE_OPTIONAL === '1'
      ? defaultExpectations
      : defaultExpectations.filter((route) => route.enabledByDefault);
    return applyPerformanceBudgetMode(selectedRoutes);
  }

  const routes = rawRoutes
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean)
    .map(normalizeRoutePath);

  if (routes.length === 0) {
    return defaultExpectations;
  }

  return routes.map((route) => ({
    path: route,
    description: 'Custom smoke route from FRONTEND_SMOKE_ROUTES.',
    authState: 'custom',
    expectedCssVariables: [],
    expectedFinalSearchIncludes: [],
    expectedText: [],
    minBodyTextLength: DEFAULT_BODY_TEXT_MIN_LENGTH,
    performanceInteractionSelector: undefined,
    performanceBudget: {},
  }));
}

export function parseSmokeCookieHeader(rawCookieHeader = '') {
  const rawValue = typeof rawCookieHeader === 'string' ? rawCookieHeader.trim() : '';
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) {
        throw new Error('FRONTEND_SMOKE_COOKIE_HEADER contains an invalid cookie pair. Expected "name=value; other=value".');
      }

      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (!name) {
        throw new Error('FRONTEND_SMOKE_COOKIE_HEADER contains a cookie with an empty name.');
      }

      return { name, value };
    });
}

export function readSmokeCookiesFromEnv() {
  return parseSmokeCookieHeader(
    process.env.FRONTEND_SMOKE_COOKIE_HEADER || process.env.FRONTEND_SMOKE_AUTH_COOKIE || '',
  );
}

function readRawSmokeCookieHeaderFromEnv(env = process.env) {
  return env.FRONTEND_SMOKE_COOKIE_HEADER || env.FRONTEND_SMOKE_AUTH_COOKIE || '';
}

export function validateSmokeAuthProfileConfig(env = process.env) {
  if (!isAuthenticatedSmokeProfile(env)) {
    return { enabled: false, rawCookieHeader: '' };
  }

  const rawCookieHeader = readRawSmokeCookieHeaderFromEnv(env);
  const cookies = parseSmokeCookieHeader(rawCookieHeader);
  if (cookies.length === 0) {
    throw new Error(
      [
        'FRONTEND_SMOKE_AUTH_PROFILE=1 requires authenticated browser state.',
        'Provide a temporary Cookie header through FRONTEND_SMOKE_COOKIE_HEADER, for example:',
        `  FRONTEND_SMOKE_COOKIE_HEADER="${DEFAULT_ACCESS_COOKIE_NAME}=...; ${DEFAULT_REFRESH_COOKIE_NAME}=..." npm run test:frontend:smoke:authenticated`,
        'Do not commit cookies or credentials to repository files.',
      ].join('\n'),
    );
  }

  return { enabled: true, rawCookieHeader };
}

export function buildRouteUrl(baseUrl, routePath) {
  const normalizedRoute = normalizeRoutePath(routePath);
  const base = normalizeBaseUrl(baseUrl);
  const parsedBase = new URL(base);
  const basePath = parsedBase.pathname.replace(/\/+$/, '');
  const routeUrl = new URL(`${basePath}${normalizedRoute}`, parsedBase);
  routeUrl.hash = '';
  return routeUrl.toString();
}
