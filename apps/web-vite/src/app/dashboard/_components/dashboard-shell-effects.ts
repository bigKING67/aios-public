import { useEffect, type MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { MessageInstance } from 'antd/es/message/interface';

import { MAX_DASHBOARD_QUERY_DAYS } from './dashboard-config';
import type { DashboardDimension, DateMode, PlatformTabKey } from './dashboard-config';
import { showDashboardRangeLimitWarning } from './dashboard-errors';

type DashboardInitialCustomRangeLimitWarningEffectArgs = {
  dateMode: DateMode;
  customRangeExceededLimit: boolean;
  hasShownInitialCustomRangeLimitHintRef: MutableRefObject<boolean>;
  messageApi: MessageInstance;
};

export function useDashboardInitialCustomRangeLimitWarningEffect({
  dateMode,
  customRangeExceededLimit,
  hasShownInitialCustomRangeLimitHintRef,
  messageApi,
}: DashboardInitialCustomRangeLimitWarningEffectArgs) {
  useEffect(() => {
    if (dateMode !== 'custom' || !customRangeExceededLimit) {
      return;
    }
    if (hasShownInitialCustomRangeLimitHintRef.current) {
      return;
    }

    hasShownInitialCustomRangeLimitHintRef.current = true;
    showDashboardRangeLimitWarning(
      messageApi,
      `自定义时间最多支持 ${MAX_DASHBOARD_QUERY_DAYS} 天，已自动调整为最近 ${MAX_DASHBOARD_QUERY_DAYS} 天。`
    );
  }, [customRangeExceededLimit, dateMode, hasShownInitialCustomRangeLimitHintRef, messageApi]);
}

type DashboardSearchParamsLike = {
  get: (name: string) => string | null;
  toString: () => string;
};

type DashboardDimensionSearchParamsSyncEffectArgs = {
  activeDimension: DashboardDimension;
  activeTab: PlatformTabKey;
  pathname: string;
  navigate: NavigateFunction;
  searchParams: DashboardSearchParamsLike;
};

export function useDashboardDimensionSearchParamsSyncEffect({
  activeDimension,
  activeTab,
  pathname,
  navigate,
  searchParams,
}: DashboardDimensionSearchParamsSyncEffectArgs) {
  useEffect(() => {
    const currentDimension = searchParams.get('dimension');
    const currentTab = searchParams.get('tab');
    if (currentDimension === activeDimension && currentTab === activeTab) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('dimension', activeDimension);
    nextParams.set('tab', activeTab);
    const nextQuery = nextParams.toString();
    navigate(nextQuery ? `${pathname}?${nextQuery}` : pathname, { replace: true });
  }, [activeDimension, activeTab, navigate, pathname, searchParams]);
}
