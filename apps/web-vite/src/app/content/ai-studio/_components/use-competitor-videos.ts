import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  competitorQueryKeys,
  createCompetitorVideo,
  fetchCompetitorAnalysis,
  fetchCompetitorVideos,
  isAnalysisActive,
  type CompetitorVideoFilters,
  requestCompetitorAnalysis,
} from '../_lib/competitor-api';
import { nextSuggestionPollInterval } from './use-segment-suggestions';

/**
 * Poll active analyses quickly, then refresh the foreground catalogue every 30 seconds
 * so desktop imports appear even when no visible film is being analysed.
 */
export function useCompetitorVideos(filters: CompetitorVideoFilters) {
  const queryClient = useQueryClient();
  const [pollSince, setPollSince] = useState(() => Date.now());

  const videosQuery = useQuery({
    queryKey: [...competitorQueryKeys.videos(), filters],
    queryFn: ({ signal }) => fetchCompetitorVideos(filters, { signal }),
    refetchInterval: (query) =>
      nextSuggestionPollInterval(
        query.state.data?.items.map((video) => ({ status: video.latestAnalysis?.status ?? 'none' })),
        pollSince,
        Date.now(),
      ) || 30_000,
    refetchIntervalInBackground: false,
  });

  const refresh = () => {
    setPollSince(Date.now());
    return videosQuery.refetch();
  };

  const createMutation = useMutation({
    retry: false,
    mutationFn: createCompetitorVideo,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: competitorQueryKeys.videos() }),
  });

  // Downloads the original and queues a billable model call; a lost response must not be replayed.
  const analyzeMutation = useMutation({
    retry: false,
    mutationFn: requestCompetitorAnalysis,
    onSuccess: () => {
      setPollSince(Date.now());
      void queryClient.invalidateQueries({ queryKey: competitorQueryKeys.videos() });
    },
  });

  return { videosQuery, createMutation, analyzeMutation, refresh };
}

/**
 * One analysis with signed evidence URLs. Signed URLs expire, so the result is
 * never cached across opens; it polls only while the analysis is still active.
 */
export function useCompetitorAnalysis(analysisId: string | null) {
  return useQuery({
    queryKey: competitorQueryKeys.analysis(analysisId ?? ''),
    queryFn: ({ signal }) => fetchCompetitorAnalysis(analysisId!, { signal }),
    enabled: analysisId !== null,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (isAnalysisActive(query.state.data) ? 5_000 : false),
    refetchIntervalInBackground: false,
  });
}
