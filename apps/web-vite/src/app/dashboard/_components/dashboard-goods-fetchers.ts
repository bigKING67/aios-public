import { request } from '@/lib/request';
import type {
  DashboardGoodsApiResponse,
  DashboardGoodsCardApiResponse,
  DashboardGoodsCardTrafficApiResponse,
} from './dashboard-types';
import type {
  DashboardComparisonQueryParams,
  DashboardFetchOptions,
  DashboardGoodsCardTrafficQueryParams,
  DashboardGoodsQueryParams,
} from './dashboard-fetcher-types';

export function fetchDashboardGoods(
  params: DashboardGoodsQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardGoodsApiResponse> {
  return request.get<DashboardGoodsApiResponse>('/dashboard/goods', {
    params: {
      start_date: params.startDate,
      end_date: params.endDate,
      prev_start_date: params.prevStartDate,
      prev_end_date: params.prevEndDate,
      platform: params.platform,
      top_n: String(params.topN),
    },
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
}

export function fetchDashboardGoodsCard(
  params: DashboardComparisonQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardGoodsCardApiResponse> {
  return request.get<DashboardGoodsCardApiResponse>('/dashboard/goods-card', {
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

export function fetchDashboardGoodsCardTraffic(
  params: DashboardGoodsCardTrafficQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardGoodsCardTrafficApiResponse> {
  return request.get<DashboardGoodsCardTrafficApiResponse>('/dashboard/goods-card/traffic', {
    params: {
      start_date: params.startDate,
      end_date: params.endDate,
      prev_start_date: params.prevStartDate,
      prev_end_date: params.prevEndDate,
      platform: params.platform,
      product_id: params.productId,
      shop_id: params.shopId,
    },
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
}
