'use client';

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import reportApi from '@/lib/api';
import { queryKeys } from '@/lib/react-query';

export type WeeklyPeriodOption = {
  value: string;
  label: string;
};

export interface UseWeeklyPeriodsOptions {
  enabled?: boolean;
}

const weeklyPeriodsQueryKey = [...queryKeys.weekly(), 'periods'] as const;

/**
 * Hook：获取周报周期列表
 *
 * 特性：
 * - React Query 缓存管理（stale 1 分钟，gc 60 分钟）
 * - 支持 enabled 控制是否触发查询
 * - 自动重试 1 次
 */
export function useWeeklyPeriods(
  options: UseWeeklyPeriodsOptions = {}
): UseQueryResult<WeeklyPeriodOption[], Error> {
  const { enabled = true } = options;

  return useQuery({
    queryKey: weeklyPeriodsQueryKey,
    queryFn: async () => reportApi.getAllWeeklyPeriods(),
    enabled,
    staleTime: 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });
}
