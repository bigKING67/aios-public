/**
 * React Query (TanStack Query) 配置
 *
 * 职责：
 * - 服务器状态管理（API 数据）
 * - 数据缓存、同步、背景更新
 * - 乐观更新支持
 * - 离线支持
 *
 * 版本：v5.36.0
 * 更新时间：2026-02-11
 */

import {
  QueryClient,
  DefaultOptions,
  QueryCache,
  MutationCache,
  type QueryKey,
} from '@tanstack/react-query';
import { shouldBypassQueryCache } from './frontend-env';
import { asRecord } from './unknown-data';

export interface APIError extends Error {
  code?: string;
  status?: number;
  statusCode?: number;
  method?: string;
  url?: string;
  requestId?: string;
  config?: {
    method?: string;
    url?: string;
    baseURL?: string;
    headers?: Record<string, unknown> | unknown;
  };
  originalError?: {
    config?: {
      method?: string;
      url?: string;
      baseURL?: string;
      headers?: Record<string, unknown> | unknown;
    };
  };
}

function isAuthError(error: APIError): boolean {
  const status = resolveHttpStatus(error);
  return (
    error.code === 'UNAUTHORIZED' ||
    error.code === 'FORBIDDEN' ||
    status === 401 ||
    status === 403
  );
}

function resolveHttpStatus(error: APIError): number | undefined {
  if (typeof error.status === 'number') {
    return error.status;
  }
  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return undefined;
}

function resolveRequestId(headers: Record<string, unknown> | unknown): string | undefined {
  const headerRecord = asRecord(headers);
  if (!headerRecord) {
    return undefined;
  }

  const direct = headerRecord['X-Request-ID'] || headerRecord['x-request-id'];
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  // Preserve compatibility with Headers-like request metadata.
  const getter = (headers as { get?: (name: string) => unknown }).get;
  if (typeof getter === 'function') {
    const viaGetter = getter('x-request-id');
    if (typeof viaGetter === 'string' && viaGetter.trim()) {
      return viaGetter.trim();
    }
  }

  return undefined;
}

function resolveRequestContext(error: APIError): {
  method?: string;
  url?: string;
  requestId?: string;
} {
  const config = error.config || error.originalError?.config;
  if (!config) {
    return {
      method: error.method,
      url: error.url,
      requestId: error.requestId,
    };
  }

  const method =
    error.method ||
    (typeof config.method === 'string' ? config.method.toUpperCase() : undefined);
  const url =
    error.url ||
    (() => {
      const baseURL = typeof config.baseURL === 'string' ? config.baseURL : '';
      const path = typeof config.url === 'string' ? config.url : '';
      if (baseURL && path) {
        return `${baseURL}${path}`;
      }
      return path || undefined;
    })();
  const requestId = error.requestId || resolveRequestId(config.headers);

  return { method, url, requestId };
}

const SHOULD_BYPASS_QUERY_CACHE = shouldBypassQueryCache();

// ============ 缓存配置 ============
const queryConfig: DefaultOptions = {
  queries: {
    // 开发态默认拿新数据，生产态使用缓存策略
    staleTime: SHOULD_BYPASS_QUERY_CACHE ? 0 : 5 * 60 * 1000,
    gcTime: SHOULD_BYPASS_QUERY_CACHE ? 5 * 60 * 1000 : 10 * 60 * 1000,
    // Phase 1.2: 生产环境禁用挂载时重复拉取，优化 Tab 切换时的重复请求
    refetchOnMount: SHOULD_BYPASS_QUERY_CACHE ? 'always' : false,
    refetchOnWindowFocus: SHOULD_BYPASS_QUERY_CACHE,
    refetchOnReconnect: true,
    // 重试配置
    retry: 1,
    retryDelay: (attemptIndex) =>
      Math.min(1000 * 2 ** attemptIndex, 30000),
  },
  mutations: {
    retry: 1,
    retryDelay: (attemptIndex) =>
      Math.min(1000 * 2 ** attemptIndex, 30000),
  },
};

// ============ Query Cache 处理 ============
export const queryClient = new QueryClient({
  defaultOptions: queryConfig,
  queryCache: new QueryCache({
    onError: (error, query) => {
      // 全局错误处理
      const err = error as APIError;
      const logger = isAuthError(err) ? console.warn : console.error;
      const { method, url, requestId } = resolveRequestContext(err);
      logger('[Query Error]', {
        code: err.code,
        message: err.message,
        status: resolveHttpStatus(err),
        method,
        url,
        requestId,
        queryKey: query.queryKey,
        queryHash: query.queryHash,
        error: err,
      });
    },
    onSuccess: (_data) => {
      // 可选：成功后的全局处理（日志、分析等）
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const err = error as APIError;
      const logger = isAuthError(err) ? console.warn : console.error;
      if (err.code) {
        logger(`[Mutation Error] ${err.code}: ${err.message}`);
      } else {
        logger('[Mutation Error]', error);
      }
    },
  }),
});

// ============ Query Key Factory ============
/**
 * 集中管理 Query Key，避免字符串魔法数字
 * 参考：https://tanstack.com/query/latest/docs/react/query-keys
 */
export const queryKeys = {
  all: ['reports'] as const,

  weekly: () => [...queryKeys.all, 'weekly'] as const,
  weeklyDetail: (reportId: string, weekPeriod?: string) =>
    weekPeriod
      ? [...queryKeys.weekly(), reportId, weekPeriod] as const
      : [...queryKeys.weekly(), reportId] as const,
  weeklyMetadata: (reportId: string) =>
    [...queryKeys.weekly(), 'metadata', reportId] as const,

  monthly: () => [...queryKeys.all, 'monthly'] as const,
  monthlyDetail: (reportId: string, monthPeriod?: string) =>
    monthPeriod
      ? [...queryKeys.monthly(), reportId, monthPeriod] as const
      : [...queryKeys.monthly(), reportId] as const,
  monthlyMetadata: (reportId: string) =>
    [...queryKeys.monthly(), 'metadata', reportId] as const,

  dashboard: () => [...queryKeys.all, 'dashboard'] as const,
  dashboardDetail: (dashboardId: string) =>
    [...queryKeys.dashboard(), dashboardId] as const,

  list: () => [...queryKeys.all, 'list'] as const,
};

// ============ 工具函数 ============

/**
 * 刷新特定查询的缓存
 */
export const invalidateQuery = async (queryKey: QueryKey) => {
  await queryClient.invalidateQueries({ queryKey });
};

/**
 * 预取查询数据（用于服务器端）
 */
export const prefetchQuery = async <TData>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>
) => {
  await queryClient.prefetchQuery({
    queryKey,
    queryFn,
  });
};

/**
 * 手动设置查询数据（用于乐观更新）
 */
export const setQueryData = <TData>(queryKey: QueryKey, data: TData) => {
  queryClient.setQueryData(queryKey, data);
};

/**
 * 获取查询数据（用于访问缓存数据）
 */
export const getQueryData = (queryKey: QueryKey) => {
  return queryClient.getQueryState(queryKey);
};
