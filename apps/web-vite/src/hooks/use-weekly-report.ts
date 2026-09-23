'use client';

import { keepPreviousData, useQuery, UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';
import reportApi from '@/lib/api';
import { shouldBypassFrontendCache } from '@/lib/frontend-env';
import { normalizeWeeklyReport } from '@/lib/weekly-report-normalizer';
import type { WeeklyReportResponse } from '@/types/weekly-report';

export type { WeeklyReportResponse } from '@/types/weekly-report';

export interface UseWeeklyReportOptions {
  /** 周报 ID（可选，支持按报告 ID 查询） */
  reportId?: string;
  /** 周期筛选，格式：2025/2/7~2025/2/13（可选） */
  weekPeriod?: string;
  /** 时间窗口（天），默认 7 */
  window?: number;
  /** 是否启用自动查询，默认 true */
  enabled?: boolean;
  /** 参数缺失时是否允许自动回退到“最新可用周期” */
  allowLatestFallback?: boolean;
}

function normalizeQueryValue(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const lower = normalized.toLowerCase();
  if (lower === 'undefined' || lower === 'null') {
    return undefined;
  }

  return normalized;
}

/**
 * Hook：获取周报数据
 *
 * 特性：
 * - React Query 自动缓存（1 分钟）
 * - 自动重试（最多 1 次）
 * - 加载/错误状态管理
 * - 由 React Query 统一管理缓存与失效
 *
 * @example
 * const { data, isLoading, error } = useWeeklyReport({
 *   reportId: '2026W03',
 *   window: 7
 * });
 *
 * if (error) return <ErrorState error={error} />;
 * if (isLoading && !data) return <LoadingState />;
 *
 * return <WeeklyReportDisplay report={data} />;
 */
export function useWeeklyReport(
  options: UseWeeklyReportOptions
): UseQueryResult<WeeklyReportResponse, Error> {
  const {
    reportId,
    weekPeriod,
    enabled = true,
    allowLatestFallback = false,
  } = options;
  const normalizedReportId = normalizeQueryValue(reportId);
  const normalizedWeekPeriod = normalizeQueryValue(weekPeriod);
  const hasValidParams = Boolean(normalizedWeekPeriod || normalizedReportId);
  const canQuery = hasValidParams || allowLatestFallback;
  const shouldBypassQueryCache = shouldBypassFrontendCache();

  return useQuery({
    queryKey: queryKeys.weeklyDetail(
      normalizedReportId || 'latest',
      normalizedWeekPeriod
    ),
    queryFn: async ({ signal }) => {
      const raw = await reportApi.getWeeklyReport(
        normalizedReportId,
        normalizedWeekPeriod,
        {
          signal,
          cancelPrevious: true,
          requestKey: 'weekly-report-detail',
        }
      );
      return normalizeWeeklyReport(raw);
    },
    enabled: enabled && canQuery,
    // 生产态也缩短为 1 分钟，降低数据滞后窗口
    staleTime: shouldBypassQueryCache ? 0 : 60 * 1000,
    gcTime: shouldBypassQueryCache ? 5 * 60 * 1000 : 30 * 60 * 1000,
    // 每次重新进入页面都触发拉取，确保尽快拿到最新数据
    refetchOnMount: 'always',
    // 避免在开发态频繁切焦点触发重查，导致长查询接口容易超时。
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    // 自动重试 1 次（在格式转换失败时）
    retry: 1,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    // 周期切换时保留上一份数据，避免页面整体卸载
    placeholderData: keepPreviousData,
  });
}
