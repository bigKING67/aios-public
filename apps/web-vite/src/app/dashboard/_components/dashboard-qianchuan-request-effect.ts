import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { buildDashboardCompareQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveQianchuanLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { fetchDashboardQianchuan } from './dashboard-fetchers';
import type { DashboardQianchuanApiResponse } from './dashboard-types';

type DashboardQianchuanRequestEffectArgs = {
  isEnabled: boolean;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  previousRange: DashboardDateRangeLike;
  setQianchuanData: Dispatch<SetStateAction<DashboardQianchuanApiResponse | null>>;
  setQianchuanLoadError: Dispatch<SetStateAction<string | null>>;
  setQianchuanLoading: Dispatch<SetStateAction<boolean>>;
  resetQianchuanData: () => void;
  resetQianchuanState: () => void;
};

export function useDashboardQianchuanRequestEffect({
  isEnabled,
  messageApi,
  currentRange,
  previousRange,
  setQianchuanData,
  setQianchuanLoadError,
  setQianchuanLoading,
  resetQianchuanData,
  resetQianchuanState,
}: DashboardQianchuanRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;
  const { start: previousStart, end: previousEnd } = previousRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
      resetQianchuanState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate, prevStartDate, prevEndDate } = buildDashboardCompareQueryDateRangeParams(
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd }
    );

    setQianchuanLoading(true);
    setQianchuanLoadError(null);
    fetchDashboardQianchuan(
      {
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        platform: 'douyin',
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-qianchuan',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setQianchuanLoadError(null);
        setQianchuanData(payload);
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetQianchuanData();
        setQianchuanLoadError(resolveQianchuanLoadErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setQianchuanLoading(false);
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
    resetQianchuanData,
    resetQianchuanState,
    setQianchuanData,
    setQianchuanLoadError,
    setQianchuanLoading,
  ]);
}
