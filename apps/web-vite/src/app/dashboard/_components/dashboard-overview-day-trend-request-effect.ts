import { useEffect } from 'react';
import type { Dayjs } from 'dayjs';

import { TAB_TO_QUERY_PLATFORM, type DateMode, type PlatformTabKey } from './dashboard-config';
import type {
  DashboardOverviewTrendSeriesSetter,
  DashboardOverviewWithCacheFetcher,
} from './dashboard-overview-ytd-trend-request';
import { requestDashboardOverviewYtdTrend } from './dashboard-overview-ytd-trend-request';

type DashboardOverviewDayTrendRequestEffectArgs = {
  isEnabled: boolean;
  activeTab: PlatformTabKey;
  dateMode: DateMode;
  dayValue: Dayjs;
  fetchOverviewWithCache: DashboardOverviewWithCacheFetcher;
  setDayYearTrendSeries: DashboardOverviewTrendSeriesSetter;
  resetDayYearTrendSeriesState: () => void;
};

export function useDashboardOverviewDayTrendRequestEffect({
  isEnabled,
  activeTab,
  dateMode,
  dayValue,
  fetchOverviewWithCache,
  setDayYearTrendSeries,
  resetDayYearTrendSeriesState,
}: DashboardOverviewDayTrendRequestEffectArgs) {
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled || dateMode !== 'day') {
      resetDayYearTrendSeriesState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const targetPlatform = TAB_TO_QUERY_PLATFORM[activeTab];
    const yearStartDate = dayValue.startOf('year').format('YYYY-MM-DD');
    const selectedDate = dayValue.startOf('day').format('YYYY-MM-DD');

    requestDashboardOverviewYtdTrend({
      fetchOverviewWithCache,
      signal: controller.signal,
      requestKey: 'dashboard-overview-day-ytd-trend',
      platform: targetPlatform,
      startDate: yearStartDate,
      endDate: selectedDate,
      isCancelled: () => cancelled,
      setTrendSeries: setDayYearTrendSeries,
      resetTrendSeriesState: resetDayYearTrendSeriesState,
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeTab,
    dateMode,
    dayValue,
    fetchOverviewWithCache,
    isEnabled,
    resetDayYearTrendSeriesState,
    setDayYearTrendSeries,
  ]);
}
