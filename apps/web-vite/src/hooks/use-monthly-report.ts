'use client';

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';
import reportApi from '@/lib/api';
import { asRecord, readString, readStringArray } from '@/lib/unknown-data';
import type { MonthlyReportResponse } from '@/types/reports';

/**
 * 月报 API 响应格式 - 复用统一的类型定义
 */
export type { MonthlyReportResponse };

export interface UseMonthlyReportOptions {
  /** 月报 ID，格式：YYYY-MM（如 2026-02） */
  reportId: string;
  /** 月份筛选，格式：YYYY-MM（可选） */
  monthPeriod?: string;
  /** 是否启用自动查询，默认 true */
  enabled?: boolean;
}

function normalizeMonthlyReport(raw: unknown): MonthlyReportResponse {
  const report = asRecord(raw);

  if (!report) {
    throw new Error('月报数据为空或格式不正确');
  }

  if (typeof report.detail === 'string' && !report.meta && !report.metadata) {
    throw new Error(report.detail);
  }

  const metaSource = asRecord(report.meta) ?? asRecord(report.metadata) ?? {};
  const chartsSource = asRecord(report.charts) ?? {};
  const rawConclusions = report.conclusions;
  const conclusionSource = asRecord(rawConclusions);

  const trendNd = Array.isArray(chartsSource.trend_nd)
    ? chartsSource.trend_nd
    : Array.isArray(chartsSource.trend_30d)
      ? chartsSource.trend_30d
      : [];

  const dimensions = Array.isArray(chartsSource.dimensions)
    ? chartsSource.dimensions
    : Array.isArray(chartsSource.platforms)
      ? chartsSource.platforms
      : [];

  const normalizedConclusions =
    conclusionSource
      ? {
          overall: readString(conclusionSource.overall),
          highlights: readStringArray(conclusionSource.highlights),
          risks: readStringArray(conclusionSource.risks),
        }
      : {
          overall: Array.isArray(rawConclusions) ? String(rawConclusions[0] ?? '') : '',
          highlights: [],
          risks: [],
        };

  return {
    meta: {
      report_type: 'monthly',
      report_id:
        readString(metaSource.report_id) || readString(report.report_id),
      period_start: readString(metaSource.period_start),
      period_end: readString(metaSource.period_end),
      generated_at: readString(metaSource.generated_at),
    },
    kpis: Array.isArray(report.kpis) ? report.kpis : [],
    charts: {
      trend_nd: trendNd,
      dimensions,
    },
    conclusions: normalizedConclusions,
  } as MonthlyReportResponse;
}

/**
 * Hook：获取月报数据
 *
 * 特性：
 * - React Query 自动缓存（1 分钟）
 * - 自动重试（最多 1 次）
 * - 加载/错误状态管理
 * - 由 React Query 统一管理缓存与失效
 *
 * @example
 * const { data, isLoading, error } = useMonthlyReport({
 *   reportId: '2026-02',
 * });
 *
 * if (error) return <ErrorState error={error} />;
 * if (isLoading && !data) return <LoadingState />;
 *
 * return <MonthlyReportDisplay report={data} />;
 */
export function useMonthlyReport(
  options: UseMonthlyReportOptions
): UseQueryResult<MonthlyReportResponse, Error> {
  const { reportId, monthPeriod, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.monthlyDetail(reportId, monthPeriod),
    queryFn: async ({ signal }) => {
      const raw = await reportApi.getMonthlyReport(
        reportId,
        monthPeriod,
        {
          signal,
          cancelPrevious: true,
          requestKey: 'monthly-report-detail',
        }
      );
      return normalizeMonthlyReport(raw);
    },
    enabled: enabled && !!reportId,
    // 缓存 1 分钟，降低月报数据滞后窗口
    staleTime: 60 * 1000,
    // 缓存保留 30 分钟（避免频繁重复构建）
    gcTime: 30 * 60 * 1000,
    // 每次重新进入页面都触发拉取，确保尽快拿到最新数据
    refetchOnMount: 'always',
    // 自动重试 1 次
    retry: 1,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}
