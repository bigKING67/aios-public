import { request } from '@/lib/request';
import type { DashboardQianchuanApiResponse } from './dashboard-types';
import type {
  DashboardComparisonQueryParams,
  DashboardFetchOptions,
} from './dashboard-fetcher-types';

export function fetchDashboardQianchuan(
  params: DashboardComparisonQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardQianchuanApiResponse> {
  return request.get<DashboardQianchuanApiResponse>('/dashboard/qianchuan', {
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
