import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('auth session recovery behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertDeepEqual(...args) {
  currentAssertions().assertDeepEqual(...args);
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

async function bundleEntry(entryPoint, name) {
  const result = await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    entryPoints: [entryPoint],
    format: 'esm',
    logLevel: 'silent',
    platform: 'node',
    target: 'node20',
    write: false,
  });
  const bundledSource = result.outputFiles[0]?.text;
  if (!bundledSource) {
    throw new Error(`${name} bundle output is empty`);
  }

  return {
    moduleUrl: `data:text/javascript;base64,${Buffer.from(bundledSource).toString('base64')}`,
  };
}

function ok(data) {
  return { data };
}

function httpError(status) {
  return { response: { status } };
}

function createApiClient({ get = [], post = [] } = {}) {
  const calls = [];
  const queues = {
    get: [...get],
    post: [...post],
  };

  async function next(method, url) {
    calls.push(`${method.toUpperCase()} ${url}`);
    const handler = queues[method].shift();
    if (!handler) {
      throw new Error(`No ${method.toUpperCase()} fixture handler for ${url}`);
    }
    if (typeof handler === 'function') {
      return handler(url);
    }
    return handler;
  }

  return {
    calls,
    client: {
      get: (url) => next('get', url),
      post: (url) => next('post', url),
    },
  };
}

function createAuthActions() {
  const calls = [];
  return {
    calls,
    auth: {
      login: (user, permissions, token) => calls.push({ type: 'login', user, permissions, token }),
      logout: () => calls.push({ type: 'logout' }),
      setLoading: (value) => calls.push({ type: 'setLoading', value }),
      setSessionChecked: (value) => calls.push({ type: 'setSessionChecked', value }),
      setTokens: (token, refreshToken) => calls.push({ type: 'setTokens', token, refreshToken }),
    },
  };
}

function callsOf(calls, type) {
  return calls.filter((call) => call.type === type);
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function assertBootstrapUsesRecoveryCore() {
  const source = readFileSync('apps/web-vite/src/components/auth-session-bootstrap.tsx', 'utf8');
  assertIncludes(
    source,
    "from '@/lib/auth-session-recovery'",
    'AuthSessionBootstrap should delegate recovery state transitions to the shared recovery core',
  );
  assertIncludes(
    source,
    'recoverAuthSession({',
    'AuthSessionBootstrap should call recoverAuthSession from its effect',
  );
}

function assertRequestRefreshFailureClearsSession() {
  const source = readFileSync('apps/web-vite/src/lib/request.ts', 'utf8');
  assertIncludes(
    source,
    "from './auth-refresh-failure'",
    'request layer should use the shared refresh failure logout predicate',
  );
  assertIncludes(
    source,
    'shouldForceLogoutAfterRefreshFailure(normalizedError)',
    'request refresh failure branch should evaluate whether to clear the stale local session',
  );
  assertIncludes(
    source,
    'clearAuthSession();',
    'request refresh failure branch should clear stale local auth session when refresh cannot recover',
  );
}

function assertRequestUsesMethodAwareRetryPolicy() {
  const source = readFileSync('apps/web-vite/src/lib/request.ts', 'utf8');
  assertIncludes(
    source,
    "from './request-retry-policy'",
    'request layer should delegate transient retry decisions to the shared method-aware policy',
  );
  assertIncludes(
    source,
    'shouldRetryRequest({',
    'request interceptor should evaluate the shared retry policy before replaying a request',
  );
  assertIncludes(
    source,
    'retryMode: config.retryMode',
    'request execution should pass the caller retry mode to the shared retry policy',
  );
  assertIncludes(
    source,
    'maxRetries: config.retryLimit',
    'request execution should pass the caller retry limit to the shared retry policy',
  );
}

export async function runAuthSessionRecoveryBehaviorFixtures(assertions) {
  useAssertions(assertions);
  assertBootstrapUsesRecoveryCore();
  assertRequestRefreshFailureClearsSession();
  assertRequestUsesMethodAwareRetryPolicy();

  const bundle = await bundleEntry('apps/web-vite/src/lib/auth-session-recovery.ts', 'auth-session-recovery');
  const {
    isAuthFailureStatus,
    normalizeSessionPermissions,
    readSessionAccessToken,
    recoverAuthSession,
  } = await import(bundle.moduleUrl);
  const refreshFailureBundle = await bundleEntry('apps/web-vite/src/lib/auth-refresh-failure.ts', 'auth-refresh-failure');
  const {
    shouldForceLogoutAfterRefreshFailure,
  } = await import(refreshFailureBundle.moduleUrl);
  const retryPolicyBundle = await bundleEntry('apps/web-vite/src/lib/request-retry-policy.ts', 'request-retry-policy');
  const {
    shouldRetryRequest,
  } = await import(retryPolicyBundle.moduleUrl);

  assertEqual(isAuthFailureStatus(401), true, '401 should be treated as an auth failure');
  assertEqual(isAuthFailureStatus(403), true, '403 should be treated as an auth failure');
  assertEqual(isAuthFailureStatus(500), false, '500 should not force local logout');
  assertEqual(
    shouldForceLogoutAfterRefreshFailure({ code: 'AUTH_REFRESH_UNAVAILABLE', statusCode: 503 }),
    true,
    'request refresh outage after a protected 401 should clear stale local auth session',
  );
  assertEqual(
    shouldForceLogoutAfterRefreshFailure({ code: 'AUTH_REFRESH_FAILED', statusCode: 503 }),
    true,
    'request refresh failure after a protected 401 should clear stale local auth session',
  );
  assertEqual(
    shouldForceLogoutAfterRefreshFailure({ code: 'SERVER_ERROR', statusCode: 503 }),
    false,
    'ordinary server errors should not force auth logout outside the refresh branch',
  );
  assertEqual(
    shouldRetryRequest({ method: 'GET', statusCode: 503, retryCount: 0, maxRetries: 2, retryMode: 'safe' }),
    true,
    'safe retry mode should preserve transient GET retries',
  );
  assertEqual(
    shouldRetryRequest({ method: 'POST', statusCode: 503, retryCount: 0, maxRetries: 2, retryMode: 'safe' }),
    false,
    'safe retry mode should not replay non-idempotent POST requests',
  );
  assertEqual(
    shouldRetryRequest({ method: 'POST', statusCode: 503, retryCount: 0, maxRetries: 2, retryMode: 'never' }),
    false,
    'never retry mode should disable retries for write requests',
  );
  assertEqual(
    shouldRetryRequest({ method: 'POST', statusCode: 503, retryCount: 0, maxRetries: 2, retryMode: 'always' }),
    true,
    'always retry mode should permit an explicitly idempotent write request',
  );
  assertEqual(
    shouldRetryRequest({ method: 'GET', statusCode: 503, retryCount: 2, maxRetries: 2, retryMode: 'safe' }),
    false,
    'retry policy should stop at the configured attempt limit',
  );
  assertEqual(
    shouldRetryRequest({ method: 'GET', statusCode: 400, retryCount: 0, maxRetries: 2, retryMode: 'safe' }),
    false,
    'retry policy should reject non-transient status codes',
  );
  assertDeepEqual(
    normalizeSessionPermissions([' reports:read ', '', 7, 'dashboard:view']),
    ['reports:read', 'dashboard:view'],
    'session permissions should trim strings and drop invalid entries',
  );
  assertEqual(
    readSessionAccessToken({ access_token: '  fresh-token  ' }),
    'fresh-token',
    'session refresh token reader should trim valid access tokens',
  );

  const user = {
    id: 1,
    username: 'fixture',
    email: 'fixture@example.com',
    is_active: true,
  };

  {
    const api = createApiClient({
      get: [ok({ user, permissions: [' reports:read ', 'dashboard:view'] })],
      post: [ok({ access_token: ' background-token ' })],
    });
    const actions = createAuthActions();

    await recoverAuthSession({ apiClient: api.client, auth: actions.auth });
    await flushMicrotasks();

    assertDeepEqual(
      api.calls,
      ['GET /auth/session/me', 'POST /auth/session/refresh'],
      'valid /auth/session/me should restore user first, then refresh access token in the background',
    );
    assertDeepEqual(
      callsOf(actions.calls, 'login').map(({ permissions, token }) => ({ permissions, token })),
      [{ permissions: ['reports:read', 'dashboard:view'], token: null }],
      'valid session recovery should login immediately without waiting for refresh',
    );
    assertDeepEqual(
      callsOf(actions.calls, 'setTokens').map(({ refreshToken, token }) => ({ refreshToken, token })),
      [{ refreshToken: null, token: 'background-token' }],
      'background refresh should publish the new in-memory access token',
    );
    assertDeepEqual(
      callsOf(actions.calls, 'setLoading').map((call) => call.value),
      [true, false],
      'valid recovery should close loading state',
    );
    assertDeepEqual(
      callsOf(actions.calls, 'setSessionChecked').map((call) => call.value),
      [true],
      'valid recovery should mark the session check complete',
    );
  }

  {
    const api = createApiClient({
      get: [
        () => Promise.reject(httpError(401)),
        ok({ user, permissions: ['dashboard:view'] }),
      ],
      post: [ok({ access_token: 'retry-token' })],
    });
    const actions = createAuthActions();

    await recoverAuthSession({ apiClient: api.client, auth: actions.auth });

    assertDeepEqual(
      api.calls,
      ['GET /auth/session/me', 'POST /auth/session/refresh', 'GET /auth/session/me'],
      'expired session access should refresh once, then retry /auth/session/me',
    );
    assertDeepEqual(
      callsOf(actions.calls, 'login').map(({ permissions, token }) => ({ permissions, token })),
      [{ permissions: ['dashboard:view'], token: 'retry-token' }],
      'refresh retry recovery should login with the refreshed in-memory access token',
    );
    assertEqual(callsOf(actions.calls, 'logout').length, 0, 'successful refresh retry should not logout');
  }

  {
    const api = createApiClient({
      get: [() => Promise.reject(httpError(403))],
      post: [() => Promise.reject(httpError(401))],
    });
    const actions = createAuthActions();

    await recoverAuthSession({ apiClient: api.client, auth: actions.auth });

    assertEqual(callsOf(actions.calls, 'logout').length, 1, 'refresh auth failure should logout once');
    assertDeepEqual(
      callsOf(actions.calls, 'setSessionChecked').map((call) => call.value),
      [true],
      'refresh auth failure should still complete the session check',
    );
  }

  {
    const api = createApiClient({
      get: [() => Promise.reject(httpError(401))],
      post: [() => Promise.reject(httpError(503))],
    });
    const actions = createAuthActions();

    await recoverAuthSession({ apiClient: api.client, auth: actions.auth });

    assertDeepEqual(
      api.calls,
      ['GET /auth/session/me', 'POST /auth/session/refresh'],
      'unrecoverable startup auth should not retry /auth/session/me after refresh outage',
    );
    assertEqual(
      callsOf(actions.calls, 'logout').length,
      1,
      'refresh outage after startup auth failure should clear stale persisted login',
    );
    assertEqual(
      callsOf(actions.calls, 'login').length,
      0,
      'refresh outage after startup auth failure should not keep a recovered user',
    );
    assertDeepEqual(
      callsOf(actions.calls, 'setSessionChecked').map((call) => call.value),
      [true],
      'refresh outage after startup auth failure should still complete the session check',
    );
  }

  {
    const api = createApiClient({
      get: [ok({ permissions: ['dashboard:view'] })],
    });
    const actions = createAuthActions();

    await recoverAuthSession({ apiClient: api.client, auth: actions.auth });

    assertEqual(callsOf(actions.calls, 'logout').length, 1, 'missing user in session payload should logout');
    assertEqual(callsOf(actions.calls, 'login').length, 0, 'missing user should not login');
  }

  {
    const api = createApiClient({
      get: [() => Promise.reject(httpError(503))],
    });
    const actions = createAuthActions();

    await recoverAuthSession({ apiClient: api.client, auth: actions.auth });

    assertEqual(callsOf(actions.calls, 'logout').length, 0, 'transient non-auth session failure should not force logout');
    assertEqual(callsOf(actions.calls, 'login').length, 0, 'transient non-auth session failure should not login');
    assertDeepEqual(
      callsOf(actions.calls, 'setSessionChecked').map((call) => call.value),
      [true],
      'transient non-auth failure should release the session check gate',
    );
  }

  {
    const deferred = createDeferred();
    let cancelled = false;
    const api = createApiClient({
      get: [() => deferred.promise],
    });
    const actions = createAuthActions();

    const recovery = recoverAuthSession({
      apiClient: api.client,
      auth: actions.auth,
      isCancelled: () => cancelled,
    });
    cancelled = true;
    deferred.resolve(ok({ user, permissions: ['reports:read'] }));
    await recovery;

    assertEqual(callsOf(actions.calls, 'login').length, 0, 'cancelled recovery should not login');
    assertEqual(callsOf(actions.calls, 'logout').length, 0, 'cancelled recovery should not logout');
    assertDeepEqual(
      callsOf(actions.calls, 'setLoading').map((call) => call.value),
      [true],
      'cancelled recovery should avoid post-unmount loading updates',
    );
    assertEqual(
      callsOf(actions.calls, 'setSessionChecked').length,
      0,
      'cancelled recovery should avoid post-unmount session checked updates',
    );
  }

  return 'auth session recovery, method-aware retry, refresh, logout, transient failure, and cancellation behavior passed.';
}
