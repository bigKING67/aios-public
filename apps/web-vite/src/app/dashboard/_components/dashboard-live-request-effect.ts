import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { buildDashboardCompareQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveLiveLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { fetchDashboardLive } from './dashboard-fetchers';
import type { DashboardLiveApiResponse } from './dashboard-types';

type DashboardLiveRequestEffectArgs = {
  isEnabled: boolean;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  previousRange: DashboardDateRangeLike;
  setLiveData: Dispatch<SetStateAction<DashboardLiveApiResponse | null>>;
  setLiveLoadError: Dispatch<SetStateAction<string | null>>;
  resetLiveData: () => void;
  resetLiveState: () => void;
};

export function useDashboardLiveRequestEffect({
  isEnabled,
  messageApi,
  currentRange,
  previousRange,
  setLiveData,
  setLiveLoadError,
  resetLiveData,
  resetLiveState,
}: DashboardLiveRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;
  const { start: previousStart, end: previousEnd } = previousRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
      resetLiveState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate, prevStartDate, prevEndDate } = buildDashboardCompareQueryDateRangeParams(
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd }
    );

    setLiveLoadError(null);
    fetchDashboardLive(
      {
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        platform: 'douyin',
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-live',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setLiveLoadError(null);
        setLiveData(payload);
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetLiveData();
        setLiveLoadError(resolveLiveLoadErrorMessage(error));
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
    resetLiveData,
    resetLiveState,
    setLiveData,
    setLiveLoadError,
  ]);
}
