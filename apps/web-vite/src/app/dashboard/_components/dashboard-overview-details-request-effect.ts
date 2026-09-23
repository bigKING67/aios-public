import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { TAB_TO_QUERY_PLATFORM, type PlatformTabKey } from './dashboard-config';
import { buildDashboardQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import { isRequestCanceled, showDashboardDateRangeLimitWarning } from './dashboard-errors';
import { fetchDashboardOverviewDetails } from './dashboard-fetchers';
import type { DashboardOverviewDetailRow } from './dashboard-types';

type DashboardOverviewDetailsRequestEffectArgs = {
  isEnabled: boolean;
  activeTab: PlatformTabKey;
  messageApi: MessageInstance;
  currentRange: DashboardDateRangeLike;
  setDetailNowcastAsOfDate: Dispatch<SetStateAction<string | null>>;
  setDetailRows: Dispatch<SetStateAction<DashboardOverviewDetailRow[]>>;
  setDetailLoading: Dispatch<SetStateAction<boolean>>;
  resetDetailRowsState: () => void;
  resetDetailState: () => void;
};

export function useDashboardOverviewDetailsRequestEffect({
  isEnabled,
  activeTab,
  messageApi,
  currentRange,
  setDetailNowcastAsOfDate,
  setDetailRows,
  setDetailLoading,
  resetDetailRowsState,
  resetDetailState,
}: DashboardOverviewDetailsRequestEffectArgs) {
  const { start: currentStart, end: currentEnd } = currentRange;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isEnabled) {
      resetDetailState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const { startDate, endDate } = buildDashboardQueryDateRangeParams({
      start: currentStart,
      end: currentEnd,
    });
    const targetPlatform = TAB_TO_QUERY_PLATFORM[activeTab];

    setDetailLoading(true);
    fetchDashboardOverviewDetails(
      {
        startDate,
        endDate,
        platform: targetPlatform,
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-overview-details',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setDetailNowcastAsOfDate(payload.nowcastAsOfDate || null);
        setDetailRows(Array.isArray(payload.rows) ? payload.rows : []);
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        showDashboardDateRangeLimitWarning(messageApi, error);
        resetDetailRowsState();
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeTab,
    currentEnd,
    currentStart,
    isEnabled,
    messageApi,
    resetDetailRowsState,
    resetDetailState,
    setDetailLoading,
    setDetailNowcastAsOfDate,
    setDetailRows,
  ]);
}
