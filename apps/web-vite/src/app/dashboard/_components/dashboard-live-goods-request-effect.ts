import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { buildDashboardQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveLiveGoodsLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { fetchDashboardLiveGoods } from './dashboard-fetchers';
import type {
  DashboardLiveGoodsApiResponse,
  LiveScope,
} from './dashboard-types';

type DashboardLiveGoodsRequestEffectArgs = {
  isEnabled: boolean;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  liveScope: LiveScope;
  setLiveGoodsData: Dispatch<SetStateAction<DashboardLiveGoodsApiResponse | null>>;
  setLiveGoodsLoadError: Dispatch<SetStateAction<string | null>>;
  setLiveGoodsLoading: Dispatch<SetStateAction<boolean>>;
  resetLiveGoodsData: () => void;
  resetLiveGoodsExpansionState: () => void;
  resetLiveGoodsState: () => void;
};

export function useDashboardLiveGoodsRequestEffect({
  isEnabled,
  messageApi,
  currentRange,
  liveScope,
  setLiveGoodsData,
  setLiveGoodsLoadError,
  setLiveGoodsLoading,
  resetLiveGoodsData,
  resetLiveGoodsExpansionState,
  resetLiveGoodsState,
}: DashboardLiveGoodsRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
      resetLiveGoodsState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate } = buildDashboardQueryDateRangeParams({
      start: currentStart,
      end: currentEnd,
    });

    setLiveGoodsLoading(true);
    setLiveGoodsLoadError(null);
    fetchDashboardLiveGoods(
      {
        startDate,
        endDate,
        platform: 'douyin',
        scope: liveScope,
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-live-goods',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setLiveGoodsLoadError(null);
        setLiveGoodsData(payload);
        resetLiveGoodsExpansionState();
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetLiveGoodsData();
        setLiveGoodsLoadError(resolveLiveGoodsLoadErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setLiveGoodsLoading(false);
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
    liveScope,
    messageApi,
    resetLiveGoodsData,
    resetLiveGoodsExpansionState,
    resetLiveGoodsState,
    setLiveGoodsData,
    setLiveGoodsLoadError,
    setLiveGoodsLoading,
  ]);
}
