import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { buildDashboardCompareQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveShortVideoLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { fetchDashboardShortVideo } from './dashboard-fetchers';
import type { DashboardShortVideoApiResponse } from './dashboard-types';

type DashboardShortVideoRequestEffectArgs = {
  isEnabled: boolean;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  previousRange: DashboardDateRangeLike;
  setShortVideoData: Dispatch<SetStateAction<DashboardShortVideoApiResponse | null>>;
  setShortVideoLoadError: Dispatch<SetStateAction<string | null>>;
  resetShortVideoData: () => void;
  resetShortVideoState: () => void;
};

export function useDashboardShortVideoRequestEffect({
  isEnabled,
  messageApi,
  currentRange,
  previousRange,
  setShortVideoData,
  setShortVideoLoadError,
  resetShortVideoData,
  resetShortVideoState,
}: DashboardShortVideoRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;
  const { start: previousStart, end: previousEnd } = previousRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
      resetShortVideoState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate, prevStartDate, prevEndDate } = buildDashboardCompareQueryDateRangeParams(
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd }
    );

    setShortVideoLoadError(null);
    fetchDashboardShortVideo(
      {
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        platform: 'douyin',
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-short-video',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setShortVideoLoadError(null);
        setShortVideoData(payload);
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetShortVideoData();
        setShortVideoLoadError(resolveShortVideoLoadErrorMessage(error));
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
    resetShortVideoData,
    resetShortVideoState,
    setShortVideoData,
    setShortVideoLoadError,
  ]);
}
