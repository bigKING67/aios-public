import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { buildDashboardCompareQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveTrafficLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { fetchDashboardTraffic } from './dashboard-fetchers';
import type { DashboardTrafficApiResponse } from './dashboard-types';

type DashboardTrafficRequestEffectArgs = {
  isEnabled: boolean;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  previousRange: DashboardDateRangeLike;
  setTrafficData: Dispatch<SetStateAction<DashboardTrafficApiResponse | null>>;
  setTrafficLoadError: Dispatch<SetStateAction<string | null>>;
  setTrafficLoading: Dispatch<SetStateAction<boolean>>;
  resetTrafficExpansionState: () => void;
  resetTrafficRowsData: () => void;
  resetTrafficState: () => void;
  resetTrafficGoodsState: () => void;
};

export function useDashboardTrafficRequestEffect({
  isEnabled,
  messageApi,
  currentRange,
  previousRange,
  setTrafficData,
  setTrafficLoadError,
  setTrafficLoading,
  resetTrafficExpansionState,
  resetTrafficRowsData,
  resetTrafficState,
  resetTrafficGoodsState,
}: DashboardTrafficRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;
  const { start: previousStart, end: previousEnd } = previousRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
      resetTrafficState();
      resetTrafficGoodsState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate, prevStartDate, prevEndDate } = buildDashboardCompareQueryDateRangeParams(
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd }
    );

    setTrafficLoading(true);
    setTrafficLoadError(null);
    fetchDashboardTraffic(
      {
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        platform: 'taobao',
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-traffic',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setTrafficLoadError(null);
        setTrafficData(payload);
        // 默认收起所有层级，避免首屏信息过载；用户按需手动展开。
        resetTrafficExpansionState();
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetTrafficRowsData();
        setTrafficLoadError(resolveTrafficLoadErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setTrafficLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    currentEnd,
    currentStart,
    isEnabled,
    messageApi,
    previousEnd,
    previousStart,
    resetTrafficExpansionState,
    resetTrafficGoodsState,
    resetTrafficRowsData,
    resetTrafficState,
    setTrafficData,
    setTrafficLoadError,
    setTrafficLoading,
  ]);
}
