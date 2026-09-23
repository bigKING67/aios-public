import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchIndustryMaterialInspiration } from './industry-material-inspiration-transport';
import type { IndustryMaterialTab } from './industry-material-inspiration-types';

const BRAND_AI_POLL_INTERVAL_MS = 5_000;
const BRAND_AI_POLL_MAX_DURATION_MS = 2 * 60_000;

interface BrandAiPollingState {
  scopeKey: string;
  startedAt: number;
}

interface UseIndustryMaterialInspirationQueryOptions {
  activeTab: IndustryMaterialTab;
  month: string | null;
  selectedBrandKey: string;
  apiBrand: string | null;
  isDouyinTab: boolean;
}

export function useIndustryMaterialInspirationQuery({
  activeTab,
  month,
  selectedBrandKey,
  apiBrand,
  isDouyinTab,
}: UseIndustryMaterialInspirationQueryOptions) {
  const [brandAiPolling, setBrandAiPolling] = useState<BrandAiPollingState | null>(null);
  const dashboardQueryKey = [
    'dashboard',
    'industry-material-inspiration',
    activeTab,
    month ?? 'latest',
    selectedBrandKey,
  ] as const;
  const dashboardScopeKey = dashboardQueryKey.join(':');
  const query = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: ({ signal }) => fetchIndustryMaterialInspiration({ tab: activeTab, month, brand: apiBrand, signal }),
    enabled: isDouyinTab,
    staleTime: 60_000,
    refetchInterval: () =>
      brandAiPolling?.scopeKey === dashboardScopeKey &&
      Date.now() - brandAiPolling.startedAt < BRAND_AI_POLL_MAX_DURATION_MS
        ? BRAND_AI_POLL_INTERVAL_MS
        : false,
  });
  const activeStructuredVideoUnderstandingJobs =
    (query.data?.brandInsight?.coverage.queuedStructuredVideoUnderstanding ?? 0) +
    (query.data?.brandInsight?.coverage.runningStructuredVideoUnderstanding ?? 0);

  useEffect(() => {
    if (!isDouyinTab || !apiBrand || activeStructuredVideoUnderstandingJobs <= 0) {
      setBrandAiPolling(null);
      return;
    }
    setBrandAiPolling((current) =>
      current?.scopeKey === dashboardScopeKey
        ? current
        : { scopeKey: dashboardScopeKey, startedAt: Date.now() }
    );
  }, [activeStructuredVideoUnderstandingJobs, apiBrand, dashboardScopeKey, isDouyinTab]);

  const startBrandAiPolling = useCallback(() => {
    setBrandAiPolling({ scopeKey: dashboardScopeKey, startedAt: Date.now() });
  }, [dashboardScopeKey]);

  return {
    ...query,
    dashboardQueryKey,
    startBrandAiPolling,
  };
}
