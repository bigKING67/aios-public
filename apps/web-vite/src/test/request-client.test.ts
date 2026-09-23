import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureAuthSessionBridge } from '@/lib/auth-session-bridge';
import {
  APIError,
  REQUEST_CONFIG,
  RequestTransportError,
  apiClient,
  request,
} from '@/lib/request';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function abortableFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const rejectAsAborted = () => reject(new DOMException('aborted', 'AbortError'));
      if (init?.signal?.aborted) {
        rejectAsAborted();
        return;
      }
      init?.signal?.addEventListener('abort', rejectAsAborted, { once: true });
    })) as typeof fetch;
}

function createClearSessionMock() {
  return vi.fn<() => void>();
}

describe('request client', () => {
  let accessToken: string | null;
  let clearSession: ReturnType<typeof createClearSessionMock>;

  beforeEach(() => {
    accessToken = null;
    clearSession = createClearSessionMock();
    configureAuthSessionBridge({
      getAccessToken: () => accessToken,
      setAccessToken: (nextAccessToken) => {
        accessToken = nextAccessToken;
      },
      clearSession,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    configureAuthSessionBridge({
      getAccessToken: () => null,
      setAccessToken: () => {},
      clearSession: () => {},
    });
  });

  it('preserves the apiClient response contract and normalizes legacy v1 paths', async () => {
    accessToken = 'session-token';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiClient.get<{ ok: boolean }>('/v1/dashboard/overview', {
      params: {
        platform: 'douyin',
        ids: [1, 2],
        ignored: undefined,
      },
    });

    expect(response).toMatchObject({
      data: { ok: true },
      status: 200,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/v1/dashboard/overview?platform=douyin&ids%5B%5D=1&ids%5B%5D=2');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer session-token');
    expect(headers.get('X-Request-ID')).toMatch(/^\d+-[a-z\d]+$/);
    expect(init?.credentials).toBe('same-origin');
  });

  it('keeps backend error payloads on APIError.originalError.response.data', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ detail: 'invalid action' }, 400)
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = request.post('/v1/dataops/actions', { action: 'invalid' }, {
      retryAttempts: 0,
      suppressErrorLog: true,
    });

    await expect(result).rejects.toMatchObject({
      name: 'APIError',
      code: 'BAD_REQUEST',
      statusCode: 400,
      message: 'invalid action',
      originalError: {
        response: {
          data: { detail: 'invalid action' },
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ action: 'invalid' }));
  });

  it('retries a safe GET without retrying the caller manually', async () => {
    const originalRetryDelay = REQUEST_CONFIG.RETRY_DELAY;
    REQUEST_CONFIG.RETRY_DELAY = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ detail: 'busy' }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(request.get('/dashboard/overview', { retryAttempts: 1 })).resolves.toEqual({ ok: true });
    } finally {
      REQUEST_CONFIG.RETRY_DELAY = originalRetryDelay;
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[重试 1/1]'));
  });

  it('maps timeout aborts to the existing ECONNABORTED and REQUEST_TIMEOUT contract', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', abortableFetch());

    const pendingRequest = request.get('/slow', {
      timeout: 25,
      retryAttempts: 0,
      suppressErrorLog: true,
    });
    const assertion = expect(pendingRequest).rejects.toMatchObject({
      name: 'APIError',
      code: 'REQUEST_TIMEOUT',
      statusCode: 408,
      originalError: { code: 'ECONNABORTED' },
    });

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it('passes caller cancellation through as ERR_CANCELED', async () => {
    vi.stubGlobal('fetch', abortableFetch());
    const controller = new AbortController();

    const pendingRequest = request.get('/cancel-me', {
      signal: controller.signal,
      retryAttempts: 0,
    });
    controller.abort();

    await expect(pendingRequest).rejects.toMatchObject({
      name: 'RequestTransportError',
      code: 'ERR_CANCELED',
    });
    await expect(pendingRequest).rejects.toBeInstanceOf(RequestTransportError);
  });

  it('uses one refresh request for concurrent 401 responses and retries with the new token', async () => {
    accessToken = 'expired-token';
    let initialProtectedRequests = 0;
    let refreshRequests = 0;
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get('Authorization');

      if (url === '/v1/auth/session/refresh') {
        refreshRequests += 1;
        return refreshResponse;
      }
      if (url === '/v1/secure/alpha' || url === '/v1/secure/beta') {
        if (authorization === 'Bearer expired-token') {
          initialProtectedRequests += 1;
          return jsonResponse({ detail: 'expired' }, 401);
        }
        if (authorization === 'Bearer fresh-token') {
          return jsonResponse({ url });
        }
      }
      return jsonResponse({ detail: 'unexpected request' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    const alphaRequest = apiClient.get<{ url: string }>('/secure/alpha');
    const betaRequest = apiClient.get<{ url: string }>('/secure/beta');

    await vi.waitFor(() => {
      expect(initialProtectedRequests).toBe(2);
      expect(refreshRequests).toBe(1);
    });
    resolveRefresh?.(jsonResponse({ access_token: 'fresh-token' }));

    const [alpha, beta] = await Promise.all([alphaRequest, betaRequest]);
    expect(alpha.data.url).toBe('/v1/secure/alpha');
    expect(beta.data.url).toBe('/v1/secure/beta');
    expect(accessToken).toBe('fresh-token');
    expect(clearSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('clears the session when refresh is unavailable', async () => {
    accessToken = 'expired-token';
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input) === '/v1/auth/session/refresh') {
        return jsonResponse({ detail: 'unavailable' }, 503);
      }
      return jsonResponse({ detail: 'expired' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = apiClient.get('/secure/profile', { retryAttempts: 0 });

    await expect(result).rejects.toBeInstanceOf(APIError);
    await expect(result).rejects.toMatchObject({
      code: 'AUTH_REFRESH_UNAVAILABLE',
      statusCode: 503,
    });
    expect(clearSession).toHaveBeenCalledTimes(1);
  });
});
