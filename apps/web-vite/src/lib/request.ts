/**
 * Request governance for timeouts, retries, session recovery, and normalized errors.
 */

import {
  clearAuthSession,
  readSessionAccessToken,
  writeSessionAccessToken,
} from './auth-session-bridge';
import { shouldForceLogoutAfterRefreshFailure } from './auth-refresh-failure';
import { buildApiGatewayPath, resolveApiGatewayPrefix } from './api-gateway';
import { frontendEnv, shouldBypassFrontendCache } from './frontend-env';
import { AIOS_API_PATHS } from './generated-api-contract';
import {
  RETRYABLE_STATUS_CODES,
  shouldRetryRequest,
  type RequestRetryMode,
} from './request-retry-policy';
import { asRecord } from './unknown-data';

export { shouldForceLogoutAfterRefreshFailure };

type HTTPMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
type RequestResponseType = 'json' | 'text' | 'blob' | 'arraybuffer';
type RequestHeaders = Record<string, unknown>;
type RequestParams = URLSearchParams | Record<string, unknown>;

export type RequestErrorConfig = {
  method: HTTPMethod;
  url: string;
  baseURL: string;
  headers: Record<string, string>;
};

export type RequestResponse<T = unknown> = {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: RequestErrorConfig;
};

export class RequestTransportError extends Error {
  readonly isRequestTransportError = true;

  constructor(
    message: string,
    public code: string,
    public config: RequestErrorConfig,
    public response?: RequestResponse<unknown>
  ) {
    super(message);
    this.name = 'RequestTransportError';
  }
}

export function isRequestTransportError(error: unknown): error is RequestTransportError {
  if (error instanceof RequestTransportError) {
    return true;
  }
  return asRecord(error)?.isRequestTransportError === true;
}

export class APIError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public originalError?: RequestTransportError
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export const REQUEST_CONFIG = {
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 1000,
  RETRYABLE_STATUS_CODES: [...RETRYABLE_STATUS_CODES],
};

export type RequestConfig = {
  params?: RequestParams;
  headers?: RequestHeaders;
  timeout?: number;
  responseType?: RequestResponseType;
  data?: unknown;
  /** External cancellation signal, for example the signal provided by React Query. */
  signal?: AbortSignal;
  /** Cancel an older in-flight request with the same request key. */
  cancelPrevious?: boolean;
  /** Request grouping key. Defaults to method plus URL. */
  requestKey?: string;
  /** Suppress request-layer error logs for expected polling failures. */
  suppressErrorLog?: boolean;
  /** Automatic retry policy. Safe mode retries idempotent requests only. */
  retryMode?: RequestRetryMode;
  /** Maximum automatic retry count for this request. */
  retryAttempts?: number;
};

type PreparedRequestConfig = {
  method: HTTPMethod;
  url: string;
  baseURL: string;
  headers: Record<string, string>;
  params?: RequestParams;
  timeout: number;
  responseType?: RequestResponseType;
  data?: unknown;
  signal?: AbortSignal;
  retryLimit: number;
  retryMode: RequestRetryMode;
  suppressErrorLog: boolean;
};

export type RequestClient = {
  get<T = unknown>(url: string, config?: RequestConfig): Promise<RequestResponse<T>>;
  post<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<RequestResponse<T>>;
  put<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<RequestResponse<T>>;
  delete<T = unknown>(url: string, config?: RequestConfig): Promise<RequestResponse<T>>;
  patch<T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<RequestResponse<T>>;
};

const SHOULD_BYPASS_HTTP_CACHE = shouldBypassFrontendCache();
const SHOULD_LOG_HTTP_DEBUG = frontendEnv.isDevelopment && frontendEnv.apiDebugLogs;
const pendingRequestControllers = new Map<string, AbortController>();
const AUTH_ENDPOINT_SEGMENTS = [
  '/auth/login',
  '/auth/logout',
  '/auth/refresh',
  AIOS_API_PATHS.sessionLogin,
  AIOS_API_PATHS.sessionLogout,
  AIOS_API_PATHS.sessionRefresh,
  AIOS_API_PATHS.sessionMe,
] as const;
const SESSION_REFRESH_ENDPOINT = buildApiGatewayPath(AIOS_API_PATHS.sessionRefresh);

let tokenRefreshPromise: Promise<string> | null = null;

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined';
}

function getBaseURL(): string {
  return isBrowserRuntime() ? resolveApiGatewayPrefix() : frontendEnv.serverApiUrl;
}

function normalizeLegacyApiPath(url: string): string {
  return url.startsWith('/v1/') ? url.slice(3) : url;
}

function shouldSkipTokenRefresh(url: string): boolean {
  return AUTH_ENDPOINT_SEGMENTS.some((segment) => url.includes(segment));
}

function shouldAttachAuthorization(url: string): boolean {
  return !AUTH_ENDPOINT_SEGMENTS.some((segment) => url.includes(segment));
}

function findHeaderKey(headers: Record<string, string>, name: string): string | undefined {
  const normalizedName = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === normalizedName);
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  const existingKey = findHeaderKey(headers, name);
  if (existingKey && existingKey !== name) {
    delete headers[existingKey];
  }
  headers[name] = value;
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  const existingKey = findHeaderKey(headers, name);
  if (existingKey) {
    delete headers[existingKey];
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return findHeaderKey(headers, name) !== undefined;
}

function normalizeHeaders(headers?: RequestHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    setHeader(normalized, name, String(value));
  }
  return normalized;
}

function cloneParams(params?: RequestParams): RequestParams | undefined {
  if (!params) {
    return undefined;
  }
  if (params instanceof URLSearchParams) {
    return new URLSearchParams(params);
  }
  return { ...params };
}

function appendQueryValue(search: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(search, `${key}[]`, item);
    }
    return;
  }
  if (value instanceof Date) {
    search.append(key, value.toISOString());
    return;
  }

  const nested = asRecord(value);
  if (nested) {
    for (const [nestedKey, nestedValue] of Object.entries(nested)) {
      appendQueryValue(search, `${key}[${nestedKey}]`, nestedValue);
    }
    return;
  }
  search.append(key, String(value));
}

function serializeParams(params?: RequestParams): string {
  if (!params) {
    return '';
  }
  if (params instanceof URLSearchParams) {
    return params.toString();
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    appendQueryValue(search, key, value);
  }
  return search.toString();
}

function joinBaseURL(baseURL: string, url: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(url)) {
    return url;
  }
  const normalizedBase = baseURL.replace(/\/+$/, '');
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return normalizedBase ? `${normalizedBase}${normalizedPath}` : normalizedPath;
}

function buildRequestURL(config: PreparedRequestConfig): string {
  const requestURL = joinBaseURL(config.baseURL, config.url);
  const query = serializeParams(config.params);
  if (!query) {
    return requestURL;
  }
  return `${requestURL}${requestURL.includes('?') ? '&' : '?'}${query}`;
}

function buildRequestKey(method: HTTPMethod, url: string, customKey?: string): string {
  return customKey || `${method.toUpperCase()}:${url}`;
}

function resolveRetryLimit(value: number | undefined): number {
  return Number.isInteger(value) && (value ?? -1) >= 0
    ? (value as number)
    : REQUEST_CONFIG.RETRY_ATTEMPTS;
}

function resolveTimeout(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : REQUEST_CONFIG.TIMEOUT;
}

function prepareRequestConfig(
  method: HTTPMethod,
  url: string,
  data: unknown,
  config?: RequestConfig
): { requestConfig: PreparedRequestConfig; cleanup: () => void } {
  const {
    cancelPrevious = false,
    requestKey,
    retryAttempts,
    retryMode = 'safe',
    signal,
    suppressErrorLog = false,
    data: configData,
    ...transportConfig
  } = config ?? {};

  const requestConfig: PreparedRequestConfig = {
    method,
    url: normalizeLegacyApiPath(url),
    baseURL: getBaseURL(),
    headers: normalizeHeaders(transportConfig.headers),
    params: cloneParams(transportConfig.params),
    timeout: resolveTimeout(transportConfig.timeout),
    responseType: transportConfig.responseType,
    data: method === 'delete' && data === undefined ? configData : data,
    signal,
    retryLimit: resolveRetryLimit(retryAttempts),
    retryMode,
    suppressErrorLog,
  };

  if (!cancelPrevious) {
    return { requestConfig, cleanup: () => {} };
  }

  const key = buildRequestKey(method, url, requestKey);
  pendingRequestControllers.get(key)?.abort();

  const controller = new AbortController();
  pendingRequestControllers.set(key, controller);

  let detachExternalSignal: (() => void) | undefined;
  if (signal) {
    const abortFromExternalSignal = () => controller.abort(signal.reason);
    if (signal.aborted) {
      abortFromExternalSignal();
    } else {
      signal.addEventListener('abort', abortFromExternalSignal, { once: true });
      detachExternalSignal = () => signal.removeEventListener('abort', abortFromExternalSignal);
    }
  }

  requestConfig.signal = controller.signal;
  return {
    requestConfig,
    cleanup: () => {
      detachExternalSignal?.();
      if (pendingRequestControllers.get(key) === controller) {
        pendingRequestControllers.delete(key);
      }
    },
  };
}

function logHttpDebug(
  phase: 'request' | 'response',
  payload: {
    requestId?: unknown;
    method?: unknown;
    url?: unknown;
    status?: unknown;
    statusText?: unknown;
  }
): void {
  if (!SHOULD_LOG_HTTP_DEBUG) {
    return;
  }
  console.debug(`[api:${phase}]`, {
    requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
    method: typeof payload.method === 'string' ? payload.method.toUpperCase() : undefined,
    url: typeof payload.url === 'string' ? payload.url : undefined,
    status: typeof payload.status === 'number' ? payload.status : undefined,
    statusText: typeof payload.statusText === 'string' ? payload.statusText : undefined,
  });
}

function createRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function attachRuntimeHeaders(config: PreparedRequestConfig): Record<string, string> {
  const headers = { ...config.headers };

  if (isBrowserRuntime() && shouldAttachAuthorization(config.url) && !hasHeader(headers, 'Authorization')) {
    const accessToken = readSessionAccessToken();
    if (accessToken) {
      setHeader(headers, 'Authorization', `Bearer ${accessToken}`);
    }
  }

  if (config.method === 'get' && SHOULD_BYPASS_HTTP_CACHE) {
    setHeader(headers, 'Cache-Control', 'no-cache, no-store, must-revalidate');
    setHeader(headers, 'Pragma', 'no-cache');
    setHeader(headers, 'Expires', '0');
  }

  setHeader(headers, 'X-Request-ID', createRequestId());
  return headers;
}

function serializeRequestBody(data: unknown, headers: Record<string, string>): BodyInit | undefined {
  if (data === undefined) {
    return undefined;
  }
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    deleteHeader(headers, 'Content-Type');
    return data;
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    if (data.type && !hasHeader(headers, 'Content-Type')) {
      setHeader(headers, 'Content-Type', data.type);
    }
    return data;
  }
  if (data instanceof URLSearchParams) {
    if (!hasHeader(headers, 'Content-Type')) {
      setHeader(headers, 'Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
    }
    return data;
  }
  if (typeof data === 'string' || data instanceof ArrayBuffer) {
    return data;
  }
  if (!hasHeader(headers, 'Content-Type')) {
    setHeader(headers, 'Content-Type', 'application/json');
  }
  return JSON.stringify(data);
}

function readResponseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

async function parseResponseData(response: Response, responseType?: RequestResponseType): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }
  if (responseType === 'blob') {
    return response.blob();
  }
  if (responseType === 'arraybuffer') {
    return response.arrayBuffer();
  }

  const text = await response.text();
  if (responseType === 'text' || !text) {
    return text || undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createErrorConfig(
  config: PreparedRequestConfig,
  headers: Record<string, string>
): RequestErrorConfig {
  return {
    method: config.method,
    url: config.url,
    baseURL: config.baseURL,
    headers,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : asRecord(error)?.name === 'AbortError';
}

async function performFetch<T>(config: PreparedRequestConfig): Promise<RequestResponse<T>> {
  const headers = attachRuntimeHeaders(config);
  const params = cloneParams(config.params);
  if (config.method === 'get' && SHOULD_BYPASS_HTTP_CACHE) {
    if (params instanceof URLSearchParams) {
      if (!params.has('__ts')) {
        params.set('__ts', String(Date.now()));
      }
    } else {
      const record = params ?? {};
      if (record.__ts === undefined) {
        record.__ts = Date.now();
      }
      config = { ...config, params: record };
    }
  }
  if (params instanceof URLSearchParams) {
    config = { ...config, params };
  }

  const body = config.method === 'get' ? undefined : serializeRequestBody(config.data, headers);
  const controller = new AbortController();
  let abortedByTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let detachExternalSignal: (() => void) | undefined;

  if (config.signal) {
    const abortFromExternalSignal = () => controller.abort(config.signal?.reason);
    if (config.signal.aborted) {
      abortFromExternalSignal();
    } else {
      config.signal.addEventListener('abort', abortFromExternalSignal, { once: true });
      detachExternalSignal = () => config.signal?.removeEventListener('abort', abortFromExternalSignal);
    }
  }
  if (config.timeout > 0) {
    timeoutId = setTimeout(() => {
      abortedByTimeout = true;
      controller.abort();
    }, config.timeout);
  }

  const requestURL = buildRequestURL(config);
  const errorConfig = createErrorConfig(config, headers);
  const requestId = headers['X-Request-ID'];
  logHttpDebug('request', {
    requestId,
    method: config.method,
    url: requestURL,
  });

  try {
    const response = await fetch(requestURL, {
      method: config.method.toUpperCase(),
      headers,
      body,
      signal: controller.signal,
      credentials: 'same-origin',
    });
    const responseData = await parseResponseData(response, config.responseType);
    const requestResponse: RequestResponse<T> = {
      data: responseData as T,
      status: response.status,
      statusText: response.statusText,
      headers: readResponseHeaders(response.headers),
      config: errorConfig,
    };

    logHttpDebug('response', {
      requestId,
      method: config.method,
      url: requestURL,
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      throw new RequestTransportError(
        `Request failed with status code ${response.status}`,
        response.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
        errorConfig,
        requestResponse as RequestResponse<unknown>
      );
    }
    return requestResponse;
  } catch (error) {
    if (isRequestTransportError(error)) {
      throw error;
    }
    if (abortedByTimeout) {
      throw new RequestTransportError(
        `timeout of ${config.timeout}ms exceeded`,
        'ECONNABORTED',
        errorConfig
      );
    }
    if (controller.signal.aborted || isAbortError(error)) {
      throw new RequestTransportError('canceled', 'ERR_CANCELED', errorConfig);
    }
    throw new RequestTransportError(
      error instanceof Error && error.message ? error.message : 'Network Error',
      'ERR_NETWORK',
      errorConfig
    );
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    detachExternalSignal?.();
  }
}

function createUnauthorizedApiError(originalError: RequestTransportError): APIError {
  return new APIError('UNAUTHORIZED', 401, '未授权，请重新登录', originalError);
}

function normalizeRefreshFailureError(
  refreshError: unknown,
  originalError: RequestTransportError
): APIError {
  if (refreshError instanceof APIError) {
    return refreshError;
  }
  if (isRequestTransportError(refreshError)) {
    const statusCode = refreshError.response?.status || 0;
    if (statusCode === 401 || statusCode === 403) {
      return createUnauthorizedApiError(originalError);
    }
    if ([408, 500, 502, 503, 504].includes(statusCode)) {
      return new APIError(
        'AUTH_REFRESH_UNAVAILABLE',
        statusCode,
        '会话刷新暂时不可用，请稍后重试',
        refreshError
      );
    }
    if (statusCode > 0) {
      return new APIError(
        'AUTH_REFRESH_FAILED',
        statusCode,
        `会话刷新失败（${statusCode}）`,
        refreshError
      );
    }
    return new APIError(
      'AUTH_REFRESH_UNAVAILABLE',
      0,
      '会话刷新请求失败，请检查网络后重试',
      refreshError
    );
  }
  if (refreshError instanceof Error) {
    return new APIError('AUTH_REFRESH_FAILED', 503, refreshError.message || '会话刷新失败');
  }
  return new APIError('AUTH_REFRESH_FAILED', 503, '会话刷新失败，请稍后重试');
}

async function refreshAccessToken(): Promise<string> {
  const response = await performFetch<{ access_token?: string }>({
    method: 'post',
    url: SESSION_REFRESH_ENDPOINT,
    baseURL: '',
    headers: normalizeHeaders(),
    timeout: REQUEST_CONFIG.TIMEOUT,
    data: undefined,
    retryLimit: 0,
    retryMode: 'never',
    suppressErrorLog: true,
  });
  const nextAccessToken = typeof response.data?.access_token === 'string'
    ? response.data.access_token
    : '';
  if (!nextAccessToken) {
    throw new Error('INVALID_REFRESH_RESPONSE');
  }
  writeSessionAccessToken(nextAccessToken);
  return nextAccessToken;
}

function getRefreshedAccessToken(): Promise<string> {
  if (!tokenRefreshPromise) {
    tokenRefreshPromise = refreshAccessToken().finally(() => {
      tokenRefreshPromise = null;
    });
  }
  return tokenRefreshPromise;
}

function extractResponseMessage(data: unknown): string | undefined {
  const record = asRecord(data);
  if (!record) {
    return undefined;
  }
  const detail = typeof record.detail === 'string' ? record.detail.trim() : '';
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  return detail || message || undefined;
}

function normalizeApiError(
  error: RequestTransportError,
  suppressErrorLog: boolean
): APIError {
  const isTimeoutError = error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout');
  const isNetworkError = error.code === 'ERR_NETWORK' || (!error.response && !isTimeoutError);
  const statusCode = error.response?.status || (isTimeoutError ? 408 : 0);
  const responseMessage = extractResponseMessage(error.response?.data);

  let errorCode = 'UNKNOWN_ERROR';
  let errorMessage = '请求失败，请重试';
  switch (statusCode) {
    case 400:
      errorCode = 'BAD_REQUEST';
      errorMessage = responseMessage || '请求参数错误';
      break;
    case 401:
      errorCode = 'UNAUTHORIZED';
      errorMessage = '未授权，请重新登录';
      break;
    case 403:
      errorCode = 'FORBIDDEN';
      errorMessage = '没有权限访问此资源';
      break;
    case 404: {
      const contentType = error.response?.headers['content-type'] || '';
      if (contentType.includes('text/html')) {
        errorCode = 'SERVICE_UNAVAILABLE';
        errorMessage = '后端服务未启动或无法访问，请联系管理员';
      } else {
        errorCode = 'NOT_FOUND';
        errorMessage = responseMessage || '请求的资源不存在';
      }
      break;
    }
    case 408:
      errorCode = 'REQUEST_TIMEOUT';
      errorMessage = '请求超时，请稍后重试';
      break;
    case 409:
      errorCode = 'CONFLICT';
      errorMessage = responseMessage || '数据已被其他人更新，请刷新后重试';
      break;
    case 429:
      errorCode = 'TOO_MANY_REQUESTS';
      errorMessage = '请求过于频繁，请稍后重试';
      break;
    case 500:
    case 502:
    case 503:
    case 504:
      errorCode = 'SERVER_ERROR';
      errorMessage = responseMessage || '服务器出错，请稍后重试';
      break;
    case 0:
      if (isNetworkError) {
        errorCode = 'NETWORK_ERROR';
        errorMessage = '网络连接失败，请检查后端服务或网络后重试';
      }
      break;
    default:
      if (statusCode >= 400 && statusCode < 500) {
        errorCode = 'CLIENT_ERROR';
        errorMessage = `客户端错误 (${statusCode})`;
      } else if (statusCode >= 500) {
        errorCode = 'SERVER_ERROR';
        errorMessage = `服务器错误 (${statusCode})`;
      }
  }

  const apiError = new APIError(errorCode, statusCode, errorMessage, error);
  if (suppressErrorLog) {
    return apiError;
  }

  const isClientError = statusCode >= 400 && statusCode < 500;
  const shouldSilenceClientLog = statusCode === 401 || statusCode === 403;
  if (!isClientError || statusCode === 0) {
    console.error(`[APIError] ${errorCode}: ${errorMessage}`, error);
  } else if (frontendEnv.isDevelopment && !shouldSilenceClientLog) {
    console.warn(`[APIError] ${errorCode}: ${errorMessage}`);
  }
  return apiError;
}

async function executeWithPolicies<T>(
  config: PreparedRequestConfig,
  retryCount = 0,
  retriedAfterRefresh = false
): Promise<RequestResponse<T>> {
  try {
    return await performFetch<T>(config);
  } catch (error) {
    if (!isRequestTransportError(error)) {
      throw error;
    }
    if (error.code === 'ERR_CANCELED') {
      throw error;
    }

    const isTimeoutError = error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout');
    const statusCode = error.response?.status || (isTimeoutError ? 408 : 0);
    const shouldHandleUnauthorized =
      isBrowserRuntime() &&
      statusCode === 401 &&
      !retriedAfterRefresh &&
      !shouldSkipTokenRefresh(config.url);

    if (shouldHandleUnauthorized) {
      try {
        const refreshedToken = await getRefreshedAccessToken();
        const headers = { ...config.headers };
        setHeader(headers, 'Authorization', `Bearer ${refreshedToken}`);
        return executeWithPolicies<T>({ ...config, headers }, retryCount, true);
      } catch (refreshError) {
        const normalizedError = normalizeRefreshFailureError(refreshError, error);
        if (shouldForceLogoutAfterRefreshFailure(normalizedError)) {
          clearAuthSession();
        }
        throw normalizedError;
      }
    }

    if (shouldRetryRequest({
      method: config.method,
      statusCode,
      retryCount,
      maxRetries: config.retryLimit,
      retryMode: config.retryMode,
    })) {
      const nextRetryCount = retryCount + 1;
      const delay = REQUEST_CONFIG.RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(
        `[重试 ${nextRetryCount}/${config.retryLimit}] ` +
        `${statusCode || 'NETWORK'} ${config.method.toUpperCase()} ${config.url}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return executeWithPolicies<T>(config, nextRetryCount, retriedAfterRefresh);
    }

    throw normalizeApiError(error, config.suppressErrorLog);
  }
}

async function executeClientRequest<T>(
  method: HTTPMethod,
  url: string,
  data?: unknown,
  config?: RequestConfig
): Promise<RequestResponse<T>> {
  const { requestConfig, cleanup } = prepareRequestConfig(method, url, data, config);
  try {
    return await executeWithPolicies<T>(requestConfig);
  } finally {
    cleanup();
  }
}

export const apiClient: RequestClient = {
  get: <T = unknown>(url: string, config?: RequestConfig) =>
    executeClientRequest<T>('get', url, undefined, config),
  post: <T = unknown>(url: string, data?: unknown, config?: RequestConfig) =>
    executeClientRequest<T>('post', url, data, config),
  put: <T = unknown>(url: string, data?: unknown, config?: RequestConfig) =>
    executeClientRequest<T>('put', url, data, config),
  delete: <T = unknown>(url: string, config?: RequestConfig) =>
    executeClientRequest<T>('delete', url, undefined, config),
  patch: <T = unknown>(url: string, data?: unknown, config?: RequestConfig) =>
    executeClientRequest<T>('patch', url, data, config),
};

export const request = {
  get: async <T = unknown>(url: string, config?: RequestConfig): Promise<T> =>
    (await apiClient.get<T>(url, config)).data,
  post: async <T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<T> =>
    (await apiClient.post<T>(url, data, config)).data,
  put: async <T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<T> =>
    (await apiClient.put<T>(url, data, config)).data,
  delete: async <T = unknown>(url: string, config?: RequestConfig): Promise<T> =>
    (await apiClient.delete<T>(url, config)).data,
  patch: async <T = unknown>(url: string, data?: unknown, config?: RequestConfig): Promise<T> =>
    (await apiClient.patch<T>(url, data, config)).data,
};

export default apiClient;
