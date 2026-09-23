import { useCallback, useRef } from 'react';

import {
  DASHBOARD_OVERVIEW_CACHE_MAX_ENTRIES,
  DASHBOARD_OVERVIEW_CACHE_TTL_MS,
} from './dashboard-config';
import {
  buildOverviewCacheKey,
  fetchDashboardOverview,
} from './dashboard-fetchers';
import type {
  DashboardOverviewCacheEntry,
  DashboardOverviewInFlightRequest,
} from './dashboard-types';
import type { DashboardOverviewWithCacheFetcher } from './dashboard-overview-ytd-trend-request';

export function useDashboardOverviewCacheFetcher(): DashboardOverviewWithCacheFetcher {
  const overviewResponseCacheRef = useRef<Map<string, DashboardOverviewCacheEntry>>(new Map());
  const overviewInFlightRequestsRef = useRef<Map<string, DashboardOverviewInFlightRequest>>(new Map());

  return useCallback<DashboardOverviewWithCacheFetcher>(
    async (params, options) => {
      const cacheKey = buildOverviewCacheKey(params);
      const cacheStore = overviewResponseCacheRef.current;
      const inFlightStore = overviewInFlightRequestsRef.current;
      const now = Date.now();
      const cached = cacheStore.get(cacheKey);

      if (cached && cached.expiresAt > now) {
        return cached.payload;
      }
      if (cached) {
        cacheStore.delete(cacheKey);
      }

      const inFlight = inFlightStore.get(cacheKey);
      if (inFlight) {
        return inFlight;
      }

      const removeInFlightIfCurrent = () => {
        if (inFlightStore.get(cacheKey) === requestPromise) {
          inFlightStore.delete(cacheKey);
        }
      };

      const requestPromise: DashboardOverviewInFlightRequest = fetchDashboardOverview(params, {
        signal: options.signal,
        requestKey: options.requestKey,
      })
        .then((payload) => {
          cacheStore.set(cacheKey, {
            expiresAt: Date.now() + DASHBOARD_OVERVIEW_CACHE_TTL_MS,
            payload,
          });

          if (cacheStore.size > DASHBOARD_OVERVIEW_CACHE_MAX_ENTRIES) {
            const oldestKey = cacheStore.keys().next().value as string | undefined;
            if (oldestKey) {
              cacheStore.delete(oldestKey);
            }
          }

          return payload;
        })
        .finally(() => {
          options.signal.removeEventListener('abort', removeInFlightIfCurrent);
          removeInFlightIfCurrent();
        });

      if (!options.signal.aborted) {
        // React StrictMode may abort the first mount before the second mount starts.
        // Remove aborted in-flight promises immediately so the remount does not reuse a canceled request.
        options.signal.addEventListener('abort', removeInFlightIfCurrent, { once: true });
        inFlightStore.set(cacheKey, requestPromise);
      }

      return requestPromise;
    },
    []
  );
}
