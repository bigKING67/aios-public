import { shouldBypassFrontendCache } from '../frontend-env';
import {
  APIError,
  isRequestTransportError,
  type RequestConfig,
  type RequestTransportError,
} from '../request';

const SHOULD_BYPASS_BACKEND_CACHE = shouldBypassFrontendCache();

export const CACHE_CONFIG = {
  WEEKLY_REPORT: {
    revalidate: 60,
    tags: ['weekly-report'],
  },
  WEEKLY_METADATA: {
    revalidate: 300,
    tags: ['weekly-metadata'],
  },
  REPORT_LIST: {
    revalidate: 60,
    tags: ['report-list'],
  },
} as const;

export function getBackendCacheControl(maxAge: number): string {
  return SHOULD_BYPASS_BACKEND_CACHE ? 'no-cache' : `max-age=${maxAge}`;
}

export function getRequestTransportError(error: unknown): RequestTransportError | undefined {
  return isRequestTransportError(error) ? error : undefined;
}

export function getRequestErrorCode(error: unknown): string | undefined {
  if (error instanceof APIError) {
    return error.code;
  }
  return getRequestTransportError(error)?.code;
}

export function createApiClientError(
  code: string,
  message: string,
  error: unknown
): APIError {
  return new APIError(code, 0, message, getRequestTransportError(error));
}

export function mergeRequestConfig(
  config: RequestConfig | undefined,
  incomingConfig: RequestConfig
): RequestConfig {
  return {
    ...config,
    ...incomingConfig,
    headers: {
      ...(config?.headers ?? {}),
      ...(incomingConfig.headers ?? {}),
    },
  };
}
