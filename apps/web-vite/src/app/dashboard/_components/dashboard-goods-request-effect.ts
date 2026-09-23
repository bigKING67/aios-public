import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { buildDashboardCompareQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveGoodsLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { fetchDashboardGoods } from './dashboard-fetchers';
import type { DashboardGoodsApiResponse } from './dashboard-types';

type DashboardGoodsRequestEffectArgs = {
  isEnabled: boolean;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  previousRange: DashboardDateRangeLike;
  setGoodsData: Dispatch<SetStateAction<DashboardGoodsApiResponse | null>>;
  setGoodsLoadError: Dispatch<SetStateAction<string | null>>;
  setGoodsLoading: Dispatch<SetStateAction<boolean>>;
  resetGoodsData: () => void;
  resetGoodsState: () => void;
};

export function useDashboardGoodsRequestEffect({
  isEnabled,
  messageApi,
  currentRange,
  previousRange,
  setGoodsData,
  setGoodsLoadError,
  setGoodsLoading,
  resetGoodsData,
  resetGoodsState,
}: DashboardGoodsRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;
  const { start: previousStart, end: previousEnd } = previousRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
      resetGoodsState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate, prevStartDate, prevEndDate } = buildDashboardCompareQueryDateRangeParams(
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd }
    );

    setGoodsLoading(true);
    setGoodsLoadError(null);
    fetchDashboardGoods(
      {
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        platform: 'taobao',
        topN: 20,
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-goods',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setGoodsLoadError(null);
        setGoodsData(payload);
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetGoodsData();
        setGoodsLoadError(resolveGoodsLoadErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setGoodsLoading(false);
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
    resetGoodsData,
    resetGoodsState,
    setGoodsData,
    setGoodsLoadError,
    setGoodsLoading,
  ]);
}
