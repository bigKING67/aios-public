import { request } from '@/lib/request';
import type {
  DashboardTrafficApiResponse,
  DashboardTrafficGoodsApiResponse,
} from './dashboard-types';
import type {
  DashboardComparisonQueryParams,
  DashboardFetchOptions,
} from './dashboard-fetcher-types';

export function fetchDashboardTraffic(
  params: DashboardComparisonQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardTrafficApiResponse> {
  return request.get<DashboardTrafficApiResponse>('/dashboard/traffic', {
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

export function fetchDashboardTrafficGoods(
  params: DashboardComparisonQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardTrafficGoodsApiResponse> {
  return request.get<DashboardTrafficGoodsApiResponse>('/dashboard/traffic/goods', {
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
