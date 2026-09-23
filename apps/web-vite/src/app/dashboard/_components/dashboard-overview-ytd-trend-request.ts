import type { Dispatch, SetStateAction } from 'react';

import { isRequestCanceled } from './dashboard-errors';
import type {
  DashboardOverviewApiResponse,
  DashboardOverviewQueryParams,
  DashboardOverviewSeriesRow,
} from './dashboard-types';

export type DashboardOverviewWithCacheFetcher = (
  params: DashboardOverviewQueryParams,
  options: { signal: AbortSignal; requestKey: string }
) => Promise<DashboardOverviewApiResponse>;

export type DashboardOverviewTrendSeriesSetter = Dispatch<SetStateAction<DashboardOverviewSeriesRow[]>>;

type RequestDashboardOverviewYtdTrendArgs = {
  fetchOverviewWithCache: DashboardOverviewWithCacheFetcher;
  signal: AbortSignal;
  requestKey: string;
  platform: DashboardOverviewQueryParams['platform'];
  startDate: string;
  endDate: string;
  isCancelled: () => boolean;
  setTrendSeries: DashboardOverviewTrendSeriesSetter;
  resetTrendSeriesState: () => void;
};

export function requestDashboardOverviewYtdTrend({
  fetchOverviewWithCache,
  signal,
  requestKey,
  platform,
  startDate,
  endDate,
  isCancelled,
  setTrendSeries,
  resetTrendSeriesState,
}: RequestDashboardOverviewYtdTrendArgs) {
  return fetchOverviewWithCache(
    {
      startDate,
      endDate,
      prevStartDate: startDate,
      prevEndDate: endDate,
      platform,
      includePlatformShare: false,
    },
    {
      signal,
      requestKey,
    }
  )
    .then((payload) => {
      if (isCancelled()) {
        return;
      }
      const ytdSeries = Array.isArray(payload.currentSeries) ? payload.currentSeries : [];
      setTrendSeries(ytdSeries);
    })
    .catch((error) => {
      if (isCancelled() || isRequestCanceled(error)) {
        return;
      }
      resetTrendSeriesState();
    });
}
