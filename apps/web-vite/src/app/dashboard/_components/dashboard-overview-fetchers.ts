import { request } from '@/lib/request';
import type {
  DashboardOverviewApiResponse,
  DashboardOverviewDetailExportApiResponse,
  DashboardOverviewQueryParams,
} from './dashboard-types';
import type { DashboardFetchOptions, DashboardRangeQueryParams } from './dashboard-fetcher-types';

export function buildOverviewCacheKey(params: DashboardOverviewQueryParams): string {
  return [
    params.startDate,
    params.endDate,
    params.prevStartDate,
    params.prevEndDate,
    params.platform,
    params.includePlatformShare ? 'share=1' : 'share=0',
  ].join('|');
}

export function fetchDashboardOverview(
  params: DashboardOverviewQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardOverviewApiResponse> {
  return request.get<DashboardOverviewApiResponse>('/dashboard/overview', {
    params: {
      start_date: params.startDate,
      end_date: params.endDate,
      prev_start_date: params.prevStartDate,
      prev_end_date: params.prevEndDate,
      platform: params.platform,
      include_platform_share: params.includePlatformShare ? '1' : '0',
    },
    // 组件层负责同参数 promise 复用；request 层负责同 requestKey 的旧请求取消。
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
}

export function fetchDashboardOverviewDetails(
  params: DashboardRangeQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardOverviewDetailExportApiResponse> {
  return request.get<DashboardOverviewDetailExportApiResponse>('/dashboard/overview/details', {
    params: {
      start_date: params.startDate,
      end_date: params.endDate,
      platform: params.platform,
    },
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
}
