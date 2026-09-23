import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { buildDashboardCompareQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveGoodsCardLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { fetchDashboardGoodsCard } from './dashboard-fetchers';
import type { DashboardGoodsCardApiResponse } from './dashboard-types';

type DashboardGoodsCardRequestEffectArgs = {
  isEnabled: boolean;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  previousRange: DashboardDateRangeLike;
  setGoodsCardData: Dispatch<SetStateAction<DashboardGoodsCardApiResponse | null>>;
  setGoodsCardLoadError: Dispatch<SetStateAction<string | null>>;
  setGoodsCardLoading: Dispatch<SetStateAction<boolean>>;
  resetGoodsCardData: () => void;
  resetGoodsCardState: () => void;
};

export function useDashboardGoodsCardRequestEffect({
  isEnabled,
  messageApi,
  currentRange,
  previousRange,
  setGoodsCardData,
  setGoodsCardLoadError,
  setGoodsCardLoading,
  resetGoodsCardData,
  resetGoodsCardState,
}: DashboardGoodsCardRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;
  const { start: previousStart, end: previousEnd } = previousRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
      resetGoodsCardState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate, prevStartDate, prevEndDate } = buildDashboardCompareQueryDateRangeParams(
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd }
    );

    setGoodsCardLoading(true);
    setGoodsCardLoadError(null);
    fetchDashboardGoodsCard(
      {
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        platform: 'douyin',
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-goods-card',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setGoodsCardLoadError(null);
        setGoodsCardData(payload);
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetGoodsCardData();
        setGoodsCardLoadError(resolveGoodsCardLoadErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setGoodsCardLoading(false);
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
    resetGoodsCardData,
    resetGoodsCardState,
    setGoodsCardData,
    setGoodsCardLoadError,
    setGoodsCardLoading,
  ]);
}
