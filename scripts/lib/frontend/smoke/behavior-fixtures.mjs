import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildFrontendSmokeHistoryRecord,
  evaluateSnapshot,
  renderFrontendSmokeMarkdownReport,
  parseSmokeCookieHeader,
  parseRouteExpectations,
  validateAuthenticatedSessionPayload,
  validateSmokeAuthProfileConfig,
  runFrontendSmoke,
  writeFrontendSmokeEvidence,
} from '../../../frontend/smoke-frontend-routes.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('frontend smoke behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const desktopViewport = { name: 'desktop', width: 1440, height: 960, mobile: false };

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function loadRouteFixtureMaps() {
  const previousIncludeOptional = process.env.FRONTEND_SMOKE_INCLUDE_OPTIONAL;
  const previousAuthProfile = process.env.FRONTEND_SMOKE_AUTH_PROFILE;
  const previousCookieHeader = process.env.FRONTEND_SMOKE_COOKIE_HEADER;
  const previousAuthCookie = process.env.FRONTEND_SMOKE_AUTH_COOKIE;
  const previousPerformanceBudget = process.env.FRONTEND_SMOKE_PERFORMANCE_BUDGET;

  try {
    delete process.env.FRONTEND_SMOKE_INCLUDE_OPTIONAL;
    delete process.env.FRONTEND_SMOKE_AUTH_PROFILE;
    delete process.env.FRONTEND_SMOKE_COOKIE_HEADER;
    delete process.env.FRONTEND_SMOKE_AUTH_COOKIE;
    delete process.env.FRONTEND_SMOKE_PERFORMANCE_BUDGET;
    const defaultRoutes = parseRouteExpectations();

    process.env.FRONTEND_SMOKE_INCLUDE_OPTIONAL = '1';
    const allRoutes = parseRouteExpectations();

    delete process.env.FRONTEND_SMOKE_INCLUDE_OPTIONAL;
    process.env.FRONTEND_SMOKE_AUTH_PROFILE = '1';
    process.env.FRONTEND_SMOKE_COOKIE_HEADER = 'aios_access_token=abc.def==; aios_refresh_token=x.y==';
    const authenticatedRoutes = parseRouteExpectations();

    delete process.env.FRONTEND_SMOKE_INCLUDE_OPTIONAL;
    delete process.env.FRONTEND_SMOKE_AUTH_PROFILE;
    delete process.env.FRONTEND_SMOKE_COOKIE_HEADER;
    process.env.FRONTEND_SMOKE_PERFORMANCE_BUDGET = '1';
    const performanceRoutes = parseRouteExpectations();

    process.env.FRONTEND_SMOKE_AUTH_PROFILE = '1';
    process.env.FRONTEND_SMOKE_COOKIE_HEADER = 'aios_access_token=abc.def==; aios_refresh_token=x.y==';
    const authenticatedPerformanceRoutes = parseRouteExpectations();

    return {
      authenticatedPerformanceRouteByPath: new Map(authenticatedPerformanceRoutes.map((route) => [route.path, route])),
      authenticatedRouteByPath: new Map(authenticatedRoutes.map((route) => [route.path, route])),
      defaultRouteByPath: new Map(defaultRoutes.map((route) => [route.path, route])),
      performanceRouteByPath: new Map(performanceRoutes.map((route) => [route.path, route])),
      routeByPath: new Map(allRoutes.map((route) => [route.path, route])),
    };
  } finally {
    restoreEnv('FRONTEND_SMOKE_INCLUDE_OPTIONAL', previousIncludeOptional);
    restoreEnv('FRONTEND_SMOKE_AUTH_PROFILE', previousAuthProfile);
    restoreEnv('FRONTEND_SMOKE_COOKIE_HEADER', previousCookieHeader);
    restoreEnv('FRONTEND_SMOKE_AUTH_COOKIE', previousAuthCookie);
    restoreEnv('FRONTEND_SMOKE_PERFORMANCE_BUDGET', previousPerformanceBudget);
  }
}

function makeSnapshot(overrides = {}) {
  return {
    bodyText: 'Fixture page has enough route-aware text to satisfy the conservative custom route threshold.',
    bodyTextLength: 92,
    bodyTextSample: 'Fixture page has enough route-aware text to satisfy the conservative custom route threshold.',
    cssVariables: {},
    hasRoot: true,
    horizontalOverflow: false,
    locationHref: 'http://localhost:3000/',
    performance: {
      cls: 0.02,
      domContentLoadedMs: 120,
      domNodeCount: 80,
      inpEventCount: 1,
      inpMs: 24,
      inpObserverFloorMs: 16,
      interactionProbeCompleted: true,
      loadMs: 160,
      lcpMs: 420,
      resourceCount: 12,
      resourceTransferKb: 250,
      responseEndMs: 90,
      scriptTransferKb: 120,
    },
    rootChildCount: 1,
    title: 'Fixture',
    viteErrorOverlay: false,
    ...overrides,
  };
}

function evaluate(options) {
  return evaluateSnapshot({
    viewport: desktopViewport,
    status: 200,
    consoleErrors: [],
    pageErrors: [],
    ...options,
  });
}

export async function runFrontendSmokeBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const {
    authenticatedPerformanceRouteByPath,
    authenticatedRouteByPath,
    defaultRouteByPath,
    performanceRouteByPath,
    routeByPath,
  } = loadRouteFixtureMaps();

  const customRoute = {
    path: '/custom',
    authState: 'custom',
    expectedCssVariables: [],
    expectedFinalSearchIncludes: [],
    expectedText: [],
    minBodyTextLength: 40,
  };
  assertEqual(
    evaluate({
      routeExpectation: customRoute,
      snapshot: makeSnapshot(),
    }).length,
    0,
    'custom route with enough text should pass',
  );

  const shortBodyFailures = evaluate({
    routeExpectation: customRoute,
    snapshot: makeSnapshot({
      bodyText: '短',
      bodyTextLength: 1,
      bodyTextSample: '短',
    }),
  });
  assertIncludes(shortBodyFailures.join('\n'), 'body text is too short', 'short body should fail the threshold');

  const loadingFailures = evaluate({
    routeExpectation: customRoute,
    snapshot: makeSnapshot({
      bodyText: '加载中...',
      bodyTextLength: 6,
      bodyTextSample: '加载中...',
    }),
  });
  assertIncludes(
    loadingFailures.join('\n'),
    'minimal loading/placeholder state',
    'minimal loading text should fail',
  );

  const cssVariableFailures = evaluate({
    routeExpectation: {
      ...customRoute,
      expectedCssVariables: ['--fixture-required-token'],
    },
    snapshot: makeSnapshot({
      cssVariables: {},
    }),
  });
  assertIncludes(
    cssVariableFailures.join('\n'),
    'expected CSS variable --fixture-required-token is missing or empty on :root',
    'missing expected CSS variable should fail with the variable name',
  );
  assertEqual(
    evaluate({
      routeExpectation: {
        ...customRoute,
        expectedCssVariables: ['--fixture-required-token'],
      },
      snapshot: makeSnapshot({
        cssVariables: {
          '--fixture-required-token': 'var(--fixture-value)',
        },
      }),
    }).length,
    0,
    'present expected CSS variable should pass',
  );

  assertEqual(
    defaultRouteByPath.has('/dashboard?tab=douyin&dimension=live'),
    false,
    'default smoke should exclude authenticated dashboard live route',
  );
  assertEqual(
    Object.keys(defaultRouteByPath.get('/')?.performanceBudget ?? {}).length,
    0,
    'default smoke should not enforce performance budgets unless explicitly enabled',
  );
  assertEqual(
    performanceRouteByPath.get('/')?.performanceBudget.maxLoadMs,
    5000,
    'performance smoke should load route budgets from smoke-routes config',
  );
  assertEqual(
    performanceRouteByPath.get('/dashboard')?.performanceInteractionSelector,
    'nav[aria-label="平台切换"] button',
    'dashboard performance smoke should use the safe platform-tab interaction probe',
  );
  assertEqual(
    performanceRouteByPath.get('/dashboard')?.performanceBudget.maxInpMs,
    200,
    'dashboard performance smoke should enforce the INP budget',
  );
  assertEqual(
    performanceRouteByPath.get('/dashboard')?.performanceBudget.maxCls,
    0.1,
    'dashboard performance smoke should enforce the CLS budget',
  );
  const dashboardLiveRoute = authenticatedRouteByPath.get('/dashboard?tab=douyin&dimension=live');
  if (!dashboardLiveRoute) {
    throw new Error('fixture missing authenticated /dashboard?tab=douyin&dimension=live route expectation');
  }
  assertEqual(
    dashboardLiveRoute.expectedCssVariables.includes('--dashboard-inverse-text'),
    true,
    'dashboard live smoke should assert critical dashboard CSS variables',
  );
  assertEqual(
    dashboardLiveRoute.expectedFinalPath,
    '/dashboard',
    'dashboard live smoke should keep the canonical final path assertion',
  );
  assertEqual(
    dashboardLiveRoute.expectedFinalSearchIncludes.includes('dimension=live'),
    true,
    'dashboard live smoke should assert the live dimension query string',
  );
  assertEqual(
    dashboardLiveRoute.expectedFinalSearchIncludes.includes('dimension=live'),
    true,
    'dashboard live smoke should preserve the live dimension query string in authenticated smoke assertions',
  );
  assertEqual(
    Object.keys(dashboardLiveRoute.performanceBudget ?? {}).length,
    0,
    'authenticated dashboard smoke should not enforce runtime performance budgets unless explicitly enabled',
  );
  const authenticatedPerformanceDashboardLiveRoute = authenticatedPerformanceRouteByPath.get('/dashboard?tab=douyin&dimension=live');
  if (!authenticatedPerformanceDashboardLiveRoute) {
    throw new Error('fixture missing authenticated performance /dashboard?tab=douyin&dimension=live route expectation');
  }
  assertEqual(
    authenticatedPerformanceDashboardLiveRoute.performanceBudget.maxLoadMs,
    10000,
    'authenticated performance smoke should enforce dashboard live route load budget',
  );
  assertEqual(
    authenticatedPerformanceDashboardLiveRoute.performanceBudget.maxResourceTransferKb,
    2800,
    'authenticated performance smoke should enforce dashboard live route transfer budget',
  );

  const consoleFailures = evaluateSnapshot({
    routeExpectation: customRoute,
    viewport: desktopViewport,
    status: 200,
    consoleErrors: ['fixture console failure'],
    pageErrors: [],
    snapshot: makeSnapshot(),
  });
  assertIncludes(consoleFailures.join('\n'), 'console error', 'console errors should fail by default');
  assertIncludes(
    consoleFailures.join('\n'),
    'fixture console failure',
    'console error detail should be included',
  );

  const performancePassFailures = evaluate({
    routeExpectation: {
      ...customRoute,
      performanceBudget: {
        maxCls: 0.1,
        maxDomContentLoadedMs: 200,
        maxDomNodeCount: 100,
        maxInpMs: 200,
        maxLcpMs: 2500,
        maxLoadMs: 250,
        maxResourceCount: 20,
        maxResourceTransferKb: 300,
        maxScriptTransferKb: 150,
      },
    },
    snapshot: makeSnapshot(),
  });
  assertEqual(performancePassFailures.length, 0, 'snapshot within performance budget should pass');

  const performanceFailures = evaluate({
    routeExpectation: {
      ...customRoute,
      performanceBudget: {
        maxCls: 0.01,
        maxInpMs: 20,
        maxLcpMs: 300,
        maxLoadMs: 100,
        maxResourceTransferKb: 100,
      },
    },
    snapshot: makeSnapshot(),
  });
  assertIncludes(
    performanceFailures.join('\n'),
    'largest contentful paint performance budget exceeded',
    'slow LCP should fail performance budget',
  );
  assertIncludes(
    performanceFailures.join('\n'),
    'interaction to next paint performance budget exceeded',
    'slow INP should fail performance budget',
  );
  assertIncludes(
    performanceFailures.join('\n'),
    'cumulative layout shift performance budget exceeded',
    'large CLS should fail performance budget',
  );
  assertIncludes(
    performanceFailures.join('\n'),
    'load event performance budget exceeded',
    'slow load should fail performance budget',
  );
  assertIncludes(
    performanceFailures.join('\n'),
    'resource transfer performance budget exceeded',
    'large transfer should fail performance budget',
  );

  const previousAllowConsoleErrors = process.env.FRONTEND_SMOKE_ALLOW_CONSOLE_ERRORS;
  try {
    process.env.FRONTEND_SMOKE_ALLOW_CONSOLE_ERRORS = '1';
    assertEqual(
      evaluateSnapshot({
        routeExpectation: customRoute,
        viewport: desktopViewport,
        status: 200,
        consoleErrors: ['allowed fixture console failure'],
        pageErrors: [],
        snapshot: makeSnapshot(),
      }).length,
      0,
      'explicit console error override should pass',
    );
  } finally {
    restoreEnv('FRONTEND_SMOKE_ALLOW_CONSOLE_ERRORS', previousAllowConsoleErrors);
  }

  const weeklyRoute = routeByPath.get('/reports/weekly');
  if (!weeklyRoute) {
    throw new Error('fixture missing /reports/weekly route expectation');
  }
  assertEqual(
    defaultRouteByPath.has('/reports/weekly'),
    false,
    'default backend-independent smoke should exclude protected anonymous route',
  );
  assertEqual(
    weeklyRoute.enabledByDefault,
    false,
    'protected anonymous route should be opt-in for default backend-independent smoke',
  );
  const weeklyFailures = evaluate({
    routeExpectation: weeklyRoute,
    snapshot: makeSnapshot({
      bodyText: 'Groland Aios 用户名 密码',
      bodyTextLength: 26,
      bodyTextSample: 'Groland Aios 用户名 密码',
      locationHref: 'http://localhost:3000/reports/weekly',
      rootChildCount: 1,
    }),
  });
  assertIncludes(
    weeklyFailures.join('\n'),
    'expected final path /login',
    'protected anonymous route should enforce login redirect path',
  );

  assertEqual(
    parseSmokeCookieHeader('aios_access_token=abc.def==; aios_refresh_token=x.y==').length,
    2,
    'smoke cookie header should parse multiple cookies with token values containing =',
  );
  try {
    parseSmokeCookieHeader('broken-cookie');
    throw new Error('invalid smoke cookie header should throw');
  } catch (error) {
    assertIncludes(
      error instanceof Error ? error.message : String(error),
      'invalid cookie pair',
      'invalid smoke cookie header should explain the expected format',
    );
  }

  try {
    validateSmokeAuthProfileConfig({ FRONTEND_SMOKE_AUTH_PROFILE: '1' });
    throw new Error('authenticated smoke profile without cookies should throw');
  } catch (error) {
    assertIncludes(
      error instanceof Error ? error.message : String(error),
      'requires authenticated browser state',
      'authenticated smoke profile should fail before route checks when cookies are missing',
    );
  }

  assertEqual(
    validateSmokeAuthProfileConfig({
      FRONTEND_SMOKE_AUTH_PROFILE: '1',
      FRONTEND_SMOKE_COOKIE_HEADER: 'aios_access_token=abc; aios_refresh_token=def',
    }).enabled,
    true,
    'authenticated smoke profile with cookie header should be enabled',
  );
  assertEqual(
    validateSmokeAuthProfileConfig({
      FRONTEND_SMOKE_AUTH_PROFILE: '1',
      FRONTEND_SMOKE_AUTH_COOKIE: 'aios_access_token=abc',
    }).enabled,
    true,
    'deprecated auth cookie alias should remain supported for compatibility',
  );

  const authenticatedWeeklyRoute = authenticatedRouteByPath.get('/reports/weekly');
  if (!authenticatedWeeklyRoute) {
    throw new Error('fixture missing authenticated /reports/weekly route expectation');
  }
  assertEqual(
    authenticatedRouteByPath.has('/ops/dataops'),
    false,
    'authenticated smoke should not include optional anonymous-only routes without an authenticated profile',
  );
  assertEqual(
    authenticatedWeeklyRoute.expectedFinalPath,
    '/reports/weekly',
    'authenticated weekly smoke should not reuse anonymous login redirect expectation',
  );
  assertEqual(
    authenticatedWeeklyRoute.expectedText.includes('Groland Weekly Update'),
    true,
    'authenticated weekly smoke should assert the protected business surface',
  );
  try {
    validateAuthenticatedSessionPayload({ message: '未登录' });
    throw new Error('authenticated session payload without user should throw');
  } catch (error) {
    assertIncludes(
      error instanceof Error ? error.message : String(error),
      'did not return a user',
      'authenticated session check should require a user object',
    );
  }
  validateAuthenticatedSessionPayload({ user: { username: 'fixture' }, permissions: [] });

  const smokeHistoryRecord = buildFrontendSmokeHistoryRecord({
    baseUrl: 'http://127.0.0.1:4173',
    engine: 'playwright',
    env: {
      FRONTEND_SMOKE_AUTH_PROFILE: '1',
      FRONTEND_SMOKE_PERFORMANCE_BUDGET: '1',
    },
    failures: [],
    results: [
      {
        bodyTextLength: 128,
        consoleErrorCount: 0,
        finalUrl: 'http://127.0.0.1:4173/dashboard?tab=douyin&dimension=live',
        horizontalOverflow: false,
        performance: {
          cls: 0.01,
          cssTransferKb: 10,
          domContentLoadedMs: 120,
          domNodeCount: 800,
          imageTransferKb: 20,
          inpEventCount: 1,
          inpMs: 32,
          inpObserverFloorMs: 16,
          interactionProbeCompleted: true,
          loadMs: 180,
          lcpMs: 640,
          resourceCount: 30,
          resourceTransferKb: 350,
          responseEndMs: 90,
          scriptTransferKb: 140,
        },
        route: '/dashboard?tab=douyin&dimension=live',
        status: 200,
        viewport: 'desktop',
      },
    ],
    timestamp: '2026-05-21T00:00:00.000Z',
  });
  assertEqual(smokeHistoryRecord.status, 'pass', 'frontend smoke history record should mark successful runs as pass');
  assertEqual(
    smokeHistoryRecord.profile.performanceBudget,
    true,
    'frontend smoke history record should preserve performance budget profile state',
  );
  assertEqual(
    smokeHistoryRecord.results[0].finalPath,
    '/dashboard?tab=douyin&dimension=live',
    'frontend smoke history record should strip base URL while preserving route query',
  );
  assertIncludes(
    renderFrontendSmokeMarkdownReport(smokeHistoryRecord),
    '| desktop | /dashboard?tab=douyin&dimension=live | 200 | 640ms | 32ms | 0.01 | 120ms | 180ms | 90ms | 350kB | 140kB | 30 | 800 | 0 | no | /dashboard?tab=douyin&dimension=live |',
    'frontend smoke markdown report should include route performance metrics',
  );

  const tmpDir = mkdtempSync(path.join(tmpdir(), 'frontend-smoke-history-'));
  try {
    const historyJsonl = path.join(tmpDir, 'history.jsonl');
    const reportMd = path.join(tmpDir, 'latest.md');
    const writtenRecord = writeFrontendSmokeEvidence({
      baseUrl: 'http://127.0.0.1:4173',
      engine: 'playwright',
      env: {
        FRONTEND_SMOKE_PERFORMANCE_BUDGET: '1',
      },
      failures: ['desktop /: fixture failure'],
      historyJsonl,
      reportMd,
      results: smokeHistoryRecord.results,
      timestamp: '2026-05-21T00:01:00.000Z',
    });
    assertEqual(writtenRecord.status, 'fail', 'frontend smoke evidence should record failed smoke runs');
    assertEqual(existsSync(historyJsonl), true, 'frontend smoke evidence should write JSONL history');
    assertEqual(existsSync(reportMd), true, 'frontend smoke evidence should write markdown report');
    assertIncludes(
      readFileSync(historyJsonl, 'utf8'),
      '"failureCount":1',
      'frontend smoke JSONL history should include failure count',
    );
    assertIncludes(
      readFileSync(reportMd, 'utf8'),
      'desktop /: fixture failure',
      'frontend smoke markdown report should include failure details',
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const previousBaseUrl = process.env.FRONTEND_SMOKE_BASE_URL;
  const previousHistoryJsonl = process.env.FRONTEND_SMOKE_HISTORY_JSONL;
  const previousReportMd = process.env.FRONTEND_SMOKE_REPORT_MD;
  const previousRoutes = process.env.FRONTEND_SMOKE_ROUTES;
  try {
    process.env.FRONTEND_SMOKE_BASE_URL = 'http://127.0.0.1:4173';
    process.env.FRONTEND_SMOKE_HISTORY_JSONL = '.artifacts/frontend-smoke-performance/history.jsonl';
    process.env.FRONTEND_SMOKE_REPORT_MD = '.artifacts/frontend-smoke-performance/latest.md';
    process.env.FRONTEND_SMOKE_ROUTES = '/';

    let observedEvidence = null;
    await runFrontendSmoke({
      assertFrontendServiceReachableImpl: async () => {},
      printSummaryImpl: () => {},
      runWithPlaywrightImpl: async () => ({
        engine: 'playwright',
        failures: [],
        results: smokeHistoryRecord.results,
      }),
      tryLoadPlaywrightImpl: async () => ({ fixture: true }),
      writeFrontendSmokeEvidenceImpl: (payload) => {
        observedEvidence = payload;
        return smokeHistoryRecord;
      },
    });

    assertEqual(
      observedEvidence.historyJsonl,
      '.artifacts/frontend-smoke-performance/history.jsonl',
      'frontend smoke runner should pass history JSONL path to evidence writer',
    );
    assertEqual(
      observedEvidence.reportMd,
      '.artifacts/frontend-smoke-performance/latest.md',
      'frontend smoke runner should pass markdown report path to evidence writer',
    );
    assertEqual(
      observedEvidence.results.length,
      1,
      'frontend smoke runner should pass browser route results to evidence writer',
    );
  } finally {
    restoreEnv('FRONTEND_SMOKE_BASE_URL', previousBaseUrl);
    restoreEnv('FRONTEND_SMOKE_HISTORY_JSONL', previousHistoryJsonl);
    restoreEnv('FRONTEND_SMOKE_REPORT_MD', previousReportMd);
    restoreEnv('FRONTEND_SMOKE_ROUTES', previousRoutes);
  }

  return 'route thresholds, loading placeholders, console error handling, protected redirect expectations, and authenticated smoke guards passed.';
}
