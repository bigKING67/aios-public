import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureAuthSessionBridge } from '@/lib/auth-session-bridge';
import defaultApiClient, {
  ApiClientError,
  apiClient as compatibilityApiClient,
} from '@/lib/api-client';
import {
  APIError,
  RequestTransportError,
  apiClient,
  isRequestTransportError,
  request,
} from '@/lib/request';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('request client compatibility', () => {
  let accessToken: string | null;
  let clearSession: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    accessToken = null;
    clearSession = vi.fn<() => void>();
    configureAuthSessionBridge({
      getAccessToken: () => accessToken,
      setAccessToken: (nextAccessToken) => {
        accessToken = nextAccessToken;
      },
      clearSession,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    configureAuthSessionBridge({
      getAccessToken: () => null,
      setAccessToken: () => {},
      clearSession: () => {},
    });
  });

  it('preserves JSON write methods and DELETE config.data', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await request.post('/writes', { method: 'post' }, {
      headers: { 'Content-Type': 'application/vnd.aios+json' },
    });
    await request.put('/writes', { method: 'put' });
    await request.patch('/writes', { method: 'patch' });
    await request.delete('/writes', { data: { method: 'delete' } });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => init?.body)).toEqual([
      JSON.stringify({ method: 'post' }),
      JSON.stringify({ method: 'put' }),
      JSON.stringify({ method: 'patch' }),
      JSON.stringify({ method: 'delete' }),
    ]);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Content-Type')).toBe(
      'application/vnd.aios+json'
    );
    for (const [, init] of fetchMock.mock.calls.slice(1)) {
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    }
  });

  it('keeps the historical api-client facade compatible', () => {
    const transportError = new RequestTransportError('fixture', 'ERR_NETWORK', {
      baseURL: '/v1',
      headers: {},
      method: 'get',
      url: '/fixture',
    });
    const error = new ApiClientError('NETWORK_ERROR', 0, 'fixture', transportError);

    expect(defaultApiClient).toBe(apiClient);
    expect(compatibilityApiClient).toBe(apiClient);
    expect(error).toBeInstanceOf(APIError);
    expect(error.name).toBe('ApiClientError');
    expect(error.status).toBe(0);
  });

  it('selects request Content-Type from the body instead of forcing JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.append('name', 'fixture');
    const blob = new Blob(['fixture'], { type: 'text/plain' });
    const search = new URLSearchParams({ page: '2' });
    const buffer = new Uint8Array([1, 2, 3]).buffer;

    await request.post('/form', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    await request.post('/blob', blob);
    await request.post('/search', search);
    await request.post('/buffer', buffer);
    await request.post('/text', 'fixture');

    const headers = fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers));
    expect(headers[0].has('Content-Type')).toBe(false);
    expect(headers[1].get('Content-Type')).toBe('text/plain');
    expect(headers[2].get('Content-Type')).toBe('application/x-www-form-urlencoded;charset=UTF-8');
    expect(headers[3].has('Content-Type')).toBe(false);
    expect(headers[4].has('Content-Type')).toBe(false);
    expect(fetchMock.mock.calls.map(([, init]) => init?.body)).toEqual([
      formData,
      blob,
      search,
      buffer,
      'fixture',
    ]);
  });

  it('supports text, blob, arraybuffer, empty, and non-JSON response bodies', async () => {
    const binary = new Uint8Array([7, 8, 9]);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('plain text'))
      .mockResolvedValueOnce(new Response('blob text'))
      .mockResolvedValueOnce(new Response(binary))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('not-json'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request.get('/text', { responseType: 'text' })).resolves.toBe('plain text');
    const blob = await request.get<Blob>('/blob', { responseType: 'blob' });
    expect(await blob.text()).toBe('blob text');
    const arrayBuffer = await request.get<ArrayBuffer>('/arraybuffer', { responseType: 'arraybuffer' });
    expect(Array.from(new Uint8Array(arrayBuffer))).toEqual([7, 8, 9]);
    await expect(request.get('/empty')).resolves.toBeUndefined();
    await expect(request.get('/fallback-text')).resolves.toBe('not-json');
  });

  it('serializes URLSearchParams, dates, nested params, and absolute URLs', async () => {
    accessToken = 'session-token';
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get('https://api.example.test/items?existing=1', {
      params: {
        at: new Date('2026-07-22T00:00:00.000Z'),
        filter: { channel: 'douyin' },
        ignored: null,
      },
      headers: {
        authorization: 'Bearer caller-token',
        'X-Fixture': 7,
        'X-Ignored-Null': null,
        'X-Ignored-Undefined': undefined,
      },
    });
    await apiClient.get('/search', {
      params: new URLSearchParams({ keyword: 'a b' }),
    });
    await apiClient.post('/v1/auth/session/login', { username: 'fixture' });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/items?existing=1&at=2026-07-22T00%3A00%3A00.000Z&filter%5Bchannel%5D=douyin'
    );
    const firstHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(firstHeaders.get('Authorization')).toBe('Bearer caller-token');
    expect(firstHeaders.get('X-Fixture')).toBe('7');
    expect(firstHeaders.has('X-Ignored-Null')).toBe(false);
    expect(firstHeaders.has('X-Ignored-Undefined')).toBe(false);
    expect(String(fetchMock.mock.calls[1][0])).toBe('/v1/search?keyword=a+b');
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).has('Authorization')).toBe(false);
  });

  it('cancels the previous request sharing a custom request key', async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (fetchMock.mock.calls.length === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          }, { once: true });
        });
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = apiClient.get('/first', {
      cancelPrevious: true,
      requestKey: 'shared',
      retryAttempts: 0,
    });
    const second = apiClient.get('/second', {
      cancelPrevious: true,
      requestKey: 'shared',
      retryAttempts: 0,
    });

    await expect(first).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await expect(second).resolves.toMatchObject({ data: { ok: true } });
  });

  it('composes cancelPrevious with caller signals and the default request key', async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject({ name: 'AbortError' });
      }
      if (fetchMock.mock.calls.length === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject({ name: 'AbortError' });
          }, { once: true });
        });
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const first = apiClient.get('/same-key', {
      cancelPrevious: true,
      retryAttempts: 0,
      signal: controller.signal,
    });
    const second = apiClient.get('/same-key', {
      cancelPrevious: true,
      retryAttempts: 0,
    });

    await expect(first).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await expect(second).resolves.toMatchObject({ data: { ok: true } });

    const abortedController = new AbortController();
    abortedController.abort('fixture');
    await expect(apiClient.get('/pre-aborted', {
      cancelPrevious: true,
      retryAttempts: 0,
      signal: abortedController.signal,
    })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  });

  it.each([
    [400, {}, 'application/json', 'BAD_REQUEST', '请求参数错误'],
    [403, { detail: 'denied' }, 'application/json', 'FORBIDDEN', '没有权限访问此资源'],
    [404, '<html>missing</html>', 'text/html', 'SERVICE_UNAVAILABLE', '后端服务未启动或无法访问，请联系管理员'],
    [404, { detail: 'missing' }, 'application/json', 'NOT_FOUND', 'missing'],
    [404, {}, 'application/json', 'NOT_FOUND', '请求的资源不存在'],
    [409, { message: 'conflict detail' }, 'application/json', 'CONFLICT', 'conflict detail'],
    [409, {}, 'application/json', 'CONFLICT', '数据已被其他人更新，请刷新后重试'],
    [429, { detail: 'busy' }, 'application/json', 'TOO_MANY_REQUESTS', '请求过于频繁，请稍后重试'],
    [500, { detail: 'server detail' }, 'application/json', 'SERVER_ERROR', 'server detail'],
    [500, {}, 'application/json', 'SERVER_ERROR', '服务器出错，请稍后重试'],
    [418, { detail: 'teapot' }, 'application/json', 'CLIENT_ERROR', '客户端错误 (418)'],
  ])('normalizes HTTP %i failures', async (status, body, contentType, code, message) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(payload, {
      status,
      headers: { 'Content-Type': contentType },
    })));

    await expect(request.get(`/status/${status}`, {
      retryAttempts: 0,
      suppressErrorLog: true,
    })).rejects.toMatchObject({ code, message, statusCode: status });
  });

  it('normalizes network failures without losing the transport cause', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('socket closed')));

    await expect(request.get('/network', { retryAttempts: 0 })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      statusCode: 0,
      originalError: {
        code: 'ERR_NETWORK',
        message: 'socket closed',
      },
    });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it('skips refresh for auth endpoints and after one successful refresh replay', async () => {
    accessToken = 'expired-token';
    let refreshCount = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/v1/auth/session/refresh') {
        refreshCount += 1;
        return jsonResponse({ access_token: 'fresh-token' });
      }
      return jsonResponse({ detail: 'still unauthorized' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.post('/v1/auth/session/login', {}, {
      retryAttempts: 0,
      suppressErrorLog: true,
    })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(refreshCount).toBe(0);

    await expect(apiClient.get('/secure/still-unauthorized', {
      retryAttempts: 0,
      suppressErrorLog: true,
    })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(refreshCount).toBe(1);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('maps refresh network failures to unavailable and clears the session', async () => {
    accessToken = 'expired-token';
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input) === '/v1/auth/session/refresh') {
        throw new TypeError('refresh network down');
      }
      return jsonResponse({ detail: 'expired' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/secure/network-refresh', {
      retryAttempts: 0,
    })).rejects.toMatchObject({
      code: 'AUTH_REFRESH_UNAVAILABLE',
      statusCode: 0,
    });
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('accepts disabled timeout and invalid retry overrides on successful requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/config-defaults', {
      retryAttempts: -1,
      timeout: 0,
    })).resolves.toMatchObject({ data: { ok: true } });
    await expect(apiClient.get('/config-fallbacks', {
      retryAttempts: Number.NaN,
      timeout: Number.NaN,
    })).resolves.toMatchObject({ data: { ok: true } });
  });

  it.each([
    [401, { detail: 'expired refresh' }, 'UNAUTHORIZED', 401],
    [409, { detail: 'refresh conflict' }, 'AUTH_REFRESH_FAILED', 409],
    [200, {}, 'AUTH_REFRESH_FAILED', 503],
  ])('normalizes refresh status %i failures and clears stale sessions', async (
    refreshStatus,
    refreshBody,
    expectedCode,
    expectedStatus,
  ) => {
    accessToken = 'expired-token';
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input) === '/v1/auth/session/refresh') {
        return jsonResponse(refreshBody, refreshStatus);
      }
      return jsonResponse({ detail: 'expired' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/secure/refresh-case', {
      retryAttempts: 0,
    })).rejects.toMatchObject({
      code: expectedCode,
      statusCode: expectedStatus,
    });
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('recognizes transport errors by class and bounded structural marker', () => {
    const config = {
      baseURL: '/v1',
      headers: {},
      method: 'get' as const,
      url: '/fixture',
    };
    const transportError = new RequestTransportError('fixture', 'ERR_NETWORK', config);
    const apiError = new APIError('NETWORK_ERROR', 0, 'fixture', transportError);

    expect(isRequestTransportError(transportError)).toBe(true);
    expect(isRequestTransportError({ isRequestTransportError: true })).toBe(true);
    expect(isRequestTransportError(apiError)).toBe(false);
  });
});
