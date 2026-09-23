'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useWeeklyPeriods } from '@/hooks/use-weekly-periods';
import reportApi from '@/lib/api';
import {
  buildOverviewByWeekTrendData,
  resolveOverviewByWeekTrendLoadingState,
  resolveRecentWeekPeriods,
  type OverviewByWeekTrendItem,
} from './overview-by-week-trend-data';

interface UseOverviewByWeekTrendDataParams {
  summaryWeekPeriod?: string;
}

export interface OverviewByWeekTrendDataResult {
  byWeekBarData: OverviewByWeekTrendItem[];
  byWeekLoading: boolean;
}

export function useOverviewByWeekTrendData({
  summaryWeekPeriod,
}: UseOverviewByWeekTrendDataParams): OverviewByWeekTrendDataResult {
  const {
    data: weeklyPeriods = [],
    isLoading: periodsLoading,
    isFetching: periodsFetching,
  } = useWeeklyPeriods({ enabled: true });

  const recentWeekPeriods = useMemo(() => {
    return resolveRecentWeekPeriods(weeklyPeriods, summaryWeekPeriod);
  }, [summaryWeekPeriod, weeklyPeriods]);

  const byWeekQueries = useQueries({
    queries: recentWeekPeriods.map((weekPeriod) => ({
      queryKey: ['reports', 'weekly', 'by-week-trend', weekPeriod],
      queryFn: async () =>
        reportApi.getWeeklyReport(undefined, weekPeriod, {
          cancelPrevious: false,
          requestKey: `weekly-by-week-trend-${weekPeriod}`,
        }),
      enabled: recentWeekPeriods.length > 0,
      staleTime: 60 * 1000,
      retry: 1,
    })),
  });

  const byWeekBarData = useMemo(() => {
    return buildOverviewByWeekTrendData(
      recentWeekPeriods,
      byWeekQueries.map((query) => query.data)
    );
  }, [byWeekQueries, recentWeekPeriods]);

  const byWeekLoading = resolveOverviewByWeekTrendLoadingState({
    hasPeriodListLoading: periodsLoading || periodsFetching,
    queryStates: byWeekQueries,
    trendDataLength: byWeekBarData.length,
  });

  return {
    byWeekBarData,
    byWeekLoading,
  };
}
