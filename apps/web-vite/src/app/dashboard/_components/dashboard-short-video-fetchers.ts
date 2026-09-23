import { request } from '@/lib/request';
import type { DashboardShortVideoApiResponse } from './dashboard-types';
import type {
  DashboardComparisonQueryParams,
  DashboardFetchOptions,
} from './dashboard-fetcher-types';

export function fetchDashboardShortVideo(
  params: DashboardComparisonQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardShortVideoApiResponse> {
  return request.get<DashboardShortVideoApiResponse>('/dashboard/short-video', {
    params: {
      start_date: params.startDate,
      end_date: params.endDate,
      prev_start_date: params.prevStartDate,
      prev_end_date: params.prevEndDate,
      platform: params.platform,
    },
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
}
