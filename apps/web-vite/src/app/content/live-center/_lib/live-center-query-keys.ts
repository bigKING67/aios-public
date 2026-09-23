import type { LiveCenterSessionQueryParams } from './live-center-types';

const LIVE_CENTER_ROOT_QUERY_KEY = ['content', 'live-center'] as const;

export const liveCenterQueryKeys = {
  root: LIVE_CENTER_ROOT_QUERY_KEY,
  dateBounds: () => [...LIVE_CENTER_ROOT_QUERY_KEY, 'date-bounds'] as const,
  lists: () => [...LIVE_CENTER_ROOT_QUERY_KEY, 'sessions'] as const,
  list: (params: LiveCenterSessionQueryParams) =>
    [...LIVE_CENTER_ROOT_QUERY_KEY, 'sessions', params] as const,
  detail: (sessionId: string) =>
    [...LIVE_CENTER_ROOT_QUERY_KEY, 'sessions', sessionId] as const,
};
