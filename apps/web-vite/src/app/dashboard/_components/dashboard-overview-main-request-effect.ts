import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { TAB_TO_QUERY_PLATFORM, type DateMode, type PlatformTabKey } from './dashboard-config';
import { buildDashboardCompareQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  isRequestCanceled,
  resolveOverviewLoadErrorMessage,
  showDashboardDateRangeLimitWarning,
} from './dashboard-errors';
import { buildSnapshotFromOverviewData } from './dashboard-overview-snapshot';
import type { DashboardOverviewWithCacheFetcher } from './dashboard-overview-ytd-trend-request';
import type {
  DashboardOverviewNowcastQuality,
  DashboardSnapshot,
} from './dashboard-types';

type DashboardOverviewMainRequestEffectArgs = {
  isEnabled: boolean;
  activeTab: PlatformTabKey;
  dateMode: DateMode;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  previousRange: DashboardDateRangeLike;
  fetchOverviewWithCache: DashboardOverviewWithCacheFetcher;
  setRealSnapshot: Dispatch<SetStateAction<DashboardSnapshot | null>>;
  setOverviewLoadError: Dispatch<SetStateAction<string | null>>;
  setOverviewNowcastAsOfDate: Dispatch<SetStateAction<string | null>>;
  setOverviewNowcastQuality: Dispatch<SetStateAction<DashboardOverviewNowcastQuality | null>>;
  resetOverviewState: () => void;
};

export function useDashboardOverviewMainRequestEffect({
  isEnabled,
  activeTab,
  dateMode,
  messageApi,
  currentRange,
  previousRange,
  fetchOverviewWithCache,
  setRealSnapshot,
  setOverviewLoadError,
  setOverviewNowcastAsOfDate,
  setOverviewNowcastQuality,
  resetOverviewState,
}: DashboardOverviewMainRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;
  const { start: previousStart, end: previousEnd } = previousRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
      resetOverviewState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate, prevStartDate, prevEndDate } = buildDashboardCompareQueryDateRangeParams(
      { start: currentStart, end: currentEnd },
      { start: previousStart, end: previousEnd }
    );
    const targetPlatform = TAB_TO_QUERY_PLATFORM[activeTab];
    const includePlatformShare = activeTab === 'overview';
    setOverviewLoadError(null);

    fetchOverviewWithCache(
      {
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        platform: targetPlatform,
        includePlatformShare,
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-overview',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setOverviewLoadError(null);
        setOverviewNowcastAsOfDate(payload.nowcastAsOfDate || null);
        setOverviewNowcastQuality(payload.nowcastQuality || null);
        setRealSnapshot(buildSnapshotFromOverviewData(payload, dateMode));
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        setOverviewLoadError(resolveOverviewLoadErrorMessage(error));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeTab,
    currentEnd,
    currentStart,
    dateMode,
    fetchOverviewWithCache,
    isEnabled,
    messageApi,
    previousEnd,
    previousStart,
    resetOverviewState,
    setOverviewLoadError,
    setOverviewNowcastAsOfDate,
    setOverviewNowcastQuality,
    setRealSnapshot,
  ]);
}
