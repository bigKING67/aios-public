import type { DashboardDimension, QueryPlatform } from './dashboard-config';
import type { LiveScope } from './dashboard-types';

export interface DashboardFetchOptions {
  signal: AbortSignal;
  requestKey: string;
}

export interface DashboardComparisonQueryParams {
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  platform: QueryPlatform;
}

export interface DashboardDateBoundsQueryParams {
  platform: QueryPlatform;
  dimension: DashboardDimension;
}

export interface DashboardDateBoundsApiResponse {
  minDate: string | null;
  maxDate: string | null;
}

export interface DashboardRangeQueryParams {
  startDate: string;
  endDate: string;
  platform: QueryPlatform;
}

export interface DashboardGoodsQueryParams extends DashboardComparisonQueryParams {
  topN: number;
}

export interface DashboardGoodsCardTrafficQueryParams extends DashboardComparisonQueryParams {
  productId: string;
  shopId: string;
}

export interface DashboardLiveGoodsQueryParams {
  startDate: string;
  endDate: string;
  platform: QueryPlatform;
  scope: LiveScope;
}

export interface DashboardNotesForDateQueryParams {
  noteDate: string;
  platform: QueryPlatform;
}

export interface DashboardCreateNotePayload {
  noteDate: string;
  platform: QueryPlatform;
  metricKey: string | null;
  actionText: string;
  reasonText: string;
  summaryText: string;
}

export interface DashboardUpdateNotePayload {
  metricKey: string | null;
  actionText: string;
  reasonText: string;
  summaryText: string;
}
