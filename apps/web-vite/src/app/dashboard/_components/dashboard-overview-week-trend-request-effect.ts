import { useEffect } from 'react';

import { TAB_TO_QUERY_PLATFORM, type DateMode, type PlatformTabKey } from './dashboard-config';
import type { DashboardDateRangeLike } from './dashboard-date-range';
import type {
  DashboardOverviewTrendSeriesSetter,
  DashboardOverviewWithCacheFetcher,
} from './dashboard-overview-ytd-trend-request';
import { requestDashboardOverviewYtdTrend } from './dashboard-overview-ytd-trend-request';

type DashboardOverviewWeekTrendRequestEffectArgs = {
  isEnabled: boolean;
  activeTab: PlatformTabKey;
  dateMode: DateMode;
  currentRange: DashboardDateRangeLike;
  fetchOverviewWithCache: DashboardOverviewWithCacheFetcher;
  setWeekYearTrendSeries: DashboardOverviewTrendSeriesSetter;
  resetWeekYearTrendSeriesState: () => void;
};

export function useDashboardOverviewWeekTrendRequestEffect({
  isEnabled,
  activeTab,
  dateMode,
  currentRange,
  fetchOverviewWithCache,
  setWeekYearTrendSeries,
  resetWeekYearTrendSeriesState,
}: DashboardOverviewWeekTrendRequestEffectArgs) {
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled || dateMode !== 'week') {
      resetWeekYearTrendSeriesState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const targetPlatform = TAB_TO_QUERY_PLATFORM[activeTab];
    const trendEndDate = currentRange.end.startOf('day');
    const yearStartDate = trendEndDate.startOf('year').startOf('day');
    const trendEndDateText = trendEndDate.format('YYYY-MM-DD');
    const yearStartDateText = yearStartDate.format('YYYY-MM-DD');

    requestDashboardOverviewYtdTrend({
      fetchOverviewWithCache,
      signal: controller.signal,
      requestKey: 'dashboard-overview-week-ytd-trend',
      platform: targetPlatform,
      startDate: yearStartDateText,
      endDate: trendEndDateText,
      isCancelled: () => cancelled,
      setTrendSeries: setWeekYearTrendSeries,
      resetTrendSeriesState: resetWeekYearTrendSeriesState,
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeTab,
    currentRange.end,
    dateMode,
    fetchOverviewWithCache,
    isEnabled,
    resetWeekYearTrendSeriesState,
    setWeekYearTrendSeries,
  ]);
}
