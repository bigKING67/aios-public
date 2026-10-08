import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  aiStudioQueryKeys,
  fetchStudioCapabilities,
  fetchStudioOverview,
  fetchStudioPresets,
  type StudioOverviewPeriodKey,
} from '../_lib/ai-studio-api';

export function useStudioCapabilities() {
  return useQuery({
    queryKey: aiStudioQueryKeys.capabilities(),
    queryFn: ({ signal }) => fetchStudioCapabilities({ signal }),
    staleTime: 60_000,
  });
}

export function useStudioPresets(enabled: boolean) {
  return useQuery({
    queryKey: aiStudioQueryKeys.presets(),
    queryFn: ({ signal }) => fetchStudioPresets({ signal }),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Estimated spend, live pipeline counts and recent work; keeps the previous period visible while switching. */
export function useStudioOverview(period: StudioOverviewPeriodKey, enabled: boolean) {
  return useQuery({
    queryKey: aiStudioQueryKeys.overview(period),
    queryFn: ({ signal }) => fetchStudioOverview(period, { signal }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
