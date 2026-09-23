import { useEffect } from 'react';

import { TAB_TO_QUERY_PLATFORM, type DateMode, type PlatformTabKey } from './dashboard-config';
import type { DashboardDateRangeLike } from './dashboard-date-range';
import type {
  DashboardOverviewTrendSeriesSetter,
  DashboardOverviewWithCacheFetcher,
} from './dashboard-overview-ytd-trend-request';
import { requestDashboardOverviewYtdTrend } from './dashboard-overview-ytd-trend-request';

type DashboardOverviewMonthTrendRequestEffectArgs = {
  isEnabled: boolean;
  activeTab: PlatformTabKey;
  dateMode: DateMode;
  currentRange: DashboardDateRangeLike;
  fetchOverviewWithCache: DashboardOverviewWithCacheFetcher;
  setMonthYearTrendSeries: DashboardOverviewTrendSeriesSetter;
  resetMonthYearTrendSeriesState: () => void;
};

export function useDashboardOverviewMonthTrendRequestEffect({
  isEnabled,
  activeTab,
  dateMode,
  currentRange,
  fetchOverviewWithCache,
  setMonthYearTrendSeries,
  resetMonthYearTrendSeriesState,
}: DashboardOverviewMonthTrendRequestEffectArgs) {
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled || dateMode !== 'month') {
      resetMonthYearTrendSeriesState();
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
      requestKey: 'dashboard-overview-month-ytd-trend',
      platform: targetPlatform,
      startDate: yearStartDateText,
      endDate: trendEndDateText,
      isCancelled: () => cancelled,
      setTrendSeries: setMonthYearTrendSeries,
      resetTrendSeriesState: resetMonthYearTrendSeriesState,
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
    resetMonthYearTrendSeriesState,
    setMonthYearTrendSeries,
  ]);
}
