'use client';

import { useEffect } from 'react';
import { useFilter } from './use-filter';
import { useWeeklyPeriods } from './use-weekly-periods';

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
 * Hook: 初始化周报的默认周期
 *
 * 功能：
 * - 页面加载时，如果 FilterContext 中没有设置 weekPeriod
 * - 则读取周周期列表缓存并使用第一项作为默认值
 * - 自动设置到 FilterContext 中
 *
 * 这样可以复用 React Query 缓存，避免与 Header 重复请求周期列表
 *
 * 用法：
 * ```tsx
 * export function WeeklyReportClient() {
 *   useInitialWeekPeriod();
 *   // ... 其他代码
 * }
 * ```
 */
export interface InitialWeekPeriodState {
  isInitializing: boolean;
  isEmpty: boolean;
  hasError: boolean;
  errorMessage?: string;
}

export function useInitialWeekPeriod(preferredWeekPeriod?: string): InitialWeekPeriodState {
  const { filters, updateFilter } = useFilter();
  const normalizedPreferredWeekPeriod = normalizeQueryValue(preferredWeekPeriod);
  const shouldInitialize = !filters.weekPeriod && !normalizedPreferredWeekPeriod;
  const {
    data: periodOptions,
    isLoading,
    isFetching,
    isFetched,
    isError,
    error,
  } = useWeeklyPeriods({ enabled: shouldInitialize });

  useEffect(() => {
    if (!shouldInitialize) {
      return;
    }

    const initialWeekPeriod = periodOptions?.[0]?.value;
    if (!initialWeekPeriod) {
      return;
    }

    updateFilter('weekPeriod', initialWeekPeriod);
  }, [periodOptions, shouldInitialize, updateFilter]);

  const hasOptions = Boolean(periodOptions && periodOptions.length > 0);
  const isInitializing =
    shouldInitialize &&
    !hasOptions &&
    (isLoading || isFetching || !isFetched);
  const isEmpty =
    shouldInitialize &&
    isFetched &&
    !isError &&
    !isLoading &&
    !isFetching &&
    !hasOptions;
  const hasError =
    shouldInitialize &&
    isError;
  const errorMessage = error?.message;

  return {
    isInitializing,
    isEmpty,
    hasError,
    errorMessage,
  };
}
