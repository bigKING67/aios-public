import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { aiStudioQueryKeys } from '../_lib/ai-studio-api';
import {
  createSegmentSuggestionJobs,
  fetchOwnSegmentSuggestionJobs,
  isSuggestionJobActive,
  segmentSuggestionQueryKeys,
  type StudioSegmentSuggestionJob,
} from '../_lib/segment-suggestion-api';

export const SUGGESTION_POLL_INTERVAL_MS = 5_000;
/** Polling stops after this window even if a job still looks active; the user can refresh manually. */
export const SUGGESTION_POLL_WINDOW_MS = 20 * 60_000;

/**
 * Bounded polling: only while a job is queued/running and within the window
 * since the last explicit trigger or refresh. React Query already pauses the
 * interval while the page is hidden (`refetchIntervalInBackground: false`).
 */
export function nextSuggestionPollInterval(
  jobs: readonly Pick<StudioSegmentSuggestionJob, 'status'>[] | undefined,
  pollSince: number,
  now: number,
): number | false {
  if (!jobs?.some(isSuggestionJobActive)) return false;
  return now - pollSince < SUGGESTION_POLL_WINDOW_MS ? SUGGESTION_POLL_INTERVAL_MS : false;
}

export function useSegmentSuggestionJobs() {
  const queryClient = useQueryClient();
  const [pollSince, setPollSince] = useState(() => Date.now());

  const jobsQuery = useQuery({
    queryKey: segmentSuggestionQueryKeys.jobs(),
    queryFn: ({ signal }) => fetchOwnSegmentSuggestionJobs({ signal }),
    refetchInterval: (query) => nextSuggestionPollInterval(query.state.data, pollSince, Date.now()),
    refetchIntervalInBackground: false,
  });

  // When a job this page saw running finishes, its suggestions exist now.
  const activeIds = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const jobs = jobsQuery.data;
    if (!jobs) return;
    const finished = jobs.some((job) => job.status === 'succeeded' && activeIds.current.has(job.jobId));
    activeIds.current = new Set(jobs.filter(isSuggestionJobActive).map((job) => job.jobId));
    if (finished) {
      void queryClient.invalidateQueries({ queryKey: aiStudioQueryKeys.segments() });
      void queryClient.invalidateQueries({ queryKey: aiStudioQueryKeys.overview() });
    }
  }, [jobsQuery.data, queryClient]);

  const refresh = () => {
    setPollSince(Date.now());
    return jobsQuery.refetch();
  };

  // Creating jobs may start billable model calls; a lost response must not be replayed.
  const createMutation = useMutation({
    retry: false,
    mutationFn: createSegmentSuggestionJobs,
    onSuccess: () => {
      setPollSince(Date.now());
      void queryClient.invalidateQueries({ queryKey: segmentSuggestionQueryKeys.jobs() });
    },
  });

  return { jobsQuery, createMutation, refresh };
}
