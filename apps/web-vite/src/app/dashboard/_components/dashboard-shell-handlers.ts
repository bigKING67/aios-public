import { useCallback } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { MessageInstance } from 'antd/es/message/interface';
import type { Dayjs } from 'dayjs';

import { MAX_DASHBOARD_QUERY_DAYS } from './dashboard-config';
import type { DashboardDimension, DateMode, PlatformTabKey } from './dashboard-config';
import { buildDashboardFilterSearchParams } from './dashboard-date-range';
import { showDashboardRangeLimitWarning } from './dashboard-errors';

type DashboardShellHandlersArgs = {
  activeDimension: DashboardDimension;
  activeTab: PlatformTabKey;
  dateMode: DateMode;
  dayValue: Dayjs;
  weekValue: Dayjs;
  monthValue: Dayjs;
  yearValue: Dayjs;
  customRange: [Dayjs, Dayjs];
  messageApi: MessageInstance;
  navigate: NavigateFunction;
};

export function useDashboardShellHandlers({
  activeDimension,
  activeTab,
  dateMode,
  dayValue,
  weekValue,
  monthValue,
  yearValue,
  customRange,
  messageApi,
  navigate,
}: DashboardShellHandlersArgs) {
  const handleNavigateToLogin = useCallback(() => {
    const preservedSearch = buildDashboardFilterSearchParams({
      activeDimension,
      activeTab,
      dateMode,
      dayValue,
      weekValue,
      monthValue,
      yearValue,
      customRange,
    });

    if (typeof window === 'undefined') {
      const fallbackRedirect = preservedSearch ? `/dashboard?${preservedSearch}` : '/dashboard';
      navigate(`/login?redirect=${encodeURIComponent(fallbackRedirect)}`);
      return;
    }

    const currentPath = window.location.pathname || '/dashboard';
    const redirectTarget = preservedSearch ? `${currentPath}?${preservedSearch}` : currentPath;
    navigate(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
  }, [activeDimension, activeTab, customRange, dateMode, dayValue, monthValue, navigate, weekValue, yearValue]);

  const handleCustomRangeLimitExceeded = useCallback(
    (daySpan: number) => {
      showDashboardRangeLimitWarning(
        messageApi,
        `自定义时间最多支持 ${MAX_DASHBOARD_QUERY_DAYS} 天，当前选择 ${daySpan} 天，请缩短区间。`
      );
    },
    [messageApi]
  );

  return {
    handleNavigateToLogin,
    handleCustomRangeLimitExceeded,
  };
}
