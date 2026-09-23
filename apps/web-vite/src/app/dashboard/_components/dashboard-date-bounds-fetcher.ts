import { request } from '@/lib/request';
import { AIOS_API_PATHS } from '@/lib/generated-api-contract';
import type {
  DashboardDateBoundsApiResponse,
  DashboardDateBoundsQueryParams,
  DashboardFetchOptions,
} from './dashboard-fetcher-types';
import { normalizeDashboardDateBounds } from './dashboard-api-normalizers';

export async function fetchDashboardDateBounds(
  params: DashboardDateBoundsQueryParams,
  options: DashboardFetchOptions
): Promise<DashboardDateBoundsApiResponse> {
  const response = await request.get<unknown>(AIOS_API_PATHS.dashboardDateBounds, {
    params: {
      platform: params.platform,
      dimension: params.dimension,
    },
    signal: options.signal,
    cancelPrevious: true,
    requestKey: options.requestKey,
  });
  return normalizeDashboardDateBounds(response);
}
