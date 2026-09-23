import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { buildDashboardCompareQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveTrafficGoodsLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { fetchDashboardTrafficGoods } from './dashboard-fetchers';
import type { DashboardTrafficGoodsApiResponse } from './dashboard-types';

type DashboardTrafficGoodsRequestEffectArgs = {
  isEnabled: boolean;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  previousRange: DashboardDateRangeLike;
  setTrafficGoodsData: Dispatch<SetStateAction<DashboardTrafficGoodsApiResponse | null>>;
  setTrafficGoodsLoadError: Dispatch<SetStateAction<string | null>>;
  setTrafficGoodsLoading: Dispatch<SetStateAction<boolean>>;
  resetTrafficGoodsExpansionState: () => void;
  resetTrafficGoodsRowsData: () => void;
  resetTrafficGoodsState: () => void;
};

export function useDashboardTrafficGoodsRequestEffect({
  isEnabled,
  messageApi,
  currentRange,
  previousRange,
  setTrafficGoodsData,
  setTrafficGoodsLoadError,
  setTrafficGoodsLoading,
  resetTrafficGoodsExpansionState,
  resetTrafficGoodsRowsData,
  resetTrafficGoodsState,
}: DashboardTrafficGoodsRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;
  const { start: previousStart, end: previousEnd } = previousRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
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

    setTrafficGoodsLoading(true);
    setTrafficGoodsLoadError(null);
    fetchDashboardTrafficGoods(
      {
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        platform: 'taobao',
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-traffic-goods',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setTrafficGoodsLoadError(null);
        setTrafficGoodsData(payload);
        // 默认收起所有层级，避免首屏信息过载；用户按需手动展开。
        resetTrafficGoodsExpansionState();
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetTrafficGoodsRowsData();
        setTrafficGoodsLoadError(resolveTrafficGoodsLoadErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setTrafficGoodsLoading(false);
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
    resetTrafficGoodsExpansionState,
    resetTrafficGoodsRowsData,
    resetTrafficGoodsState,
    setTrafficGoodsData,
    setTrafficGoodsLoadError,
    setTrafficGoodsLoading,
  ]);
}
