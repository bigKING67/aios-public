import { request } from '@/lib/request';
import type {
  DashboardLiveApiResponse,
  DashboardLiveGoodsApiResponse,
  DashboardLiveGoodsDetailExportApiResponse,
} from './dashboard-types';
import type {
  DashboardComparisonQueryParams,
  DashboardFetchOptions,
  DashboardLiveGoodsQueryParams,
} from './dashboard-fetcher-types';

export function fetchDashboardLive(
  params: DashboardComparisonQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardLiveApiResponse> {
  return request.get<DashboardLiveApiResponse>('/dashboard/live', {
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

export function fetchDashboardLiveGoods(
  params: DashboardLiveGoodsQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardLiveGoodsApiResponse> {
  return request.get<DashboardLiveGoodsApiResponse>('/dashboard/live/goods', {
    params: {
      start_date: params.startDate,
      end_date: params.endDate,
      platform: params.platform,
      scope: params.scope,
    },
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
}

export function fetchDashboardLiveGoodsDetails(
  params: DashboardLiveGoodsQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardLiveGoodsDetailExportApiResponse> {
  return request.get<DashboardLiveGoodsDetailExportApiResponse>('/dashboard/live/goods/details', {
    params: {
      start_date: params.startDate,
      end_date: params.endDate,
      platform: 'douyin',
      scope: params.scope,
    },
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
}
