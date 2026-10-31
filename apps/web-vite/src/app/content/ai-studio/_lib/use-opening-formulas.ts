import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLatestCompetitorReport, isReportActive, readLatestReport, requestCompetitorReport } from './competitor-report';
import type { PeriodQuery } from './studio-period';

/** Automatic, input-versioned formula job. A failed job is sticky; retries require a user action. */
export function useOpeningFormulas(category: string, period: PeriodQuery, inputSnapshot: string | null, canWrite: boolean) {
  const client = useQueryClient();
  const queryKey = ['ai-studio', 'competitor', 'opening-formulas', category, period, inputSnapshot, canWrite] as const;
  const query = useQuery({
    queryKey,
    enabled: Boolean(inputSnapshot),
    retry: false,
    queryFn: async ({ signal }) => {
      const latest = await fetchLatestCompetitorReport(category, period, { signal, kind: 'openings' });
      const state = readLatestReport(latest);
      if (canWrite && latest.currentInputSnapshot === inputSnapshot && (latest.films ?? 0) > 0 && (!state.report || state.stale)) {
        const report = await requestCompetitorReport(category, period, { kind: 'openings' });
        return { ...latest, report };
      }
      return latest;
    },
    refetchInterval: (current) => isReportActive(readLatestReport(current.state.data).report) ? 5000 : false,
  });
  const retry = useMutation({
    mutationFn: () => requestCompetitorReport(category, period, { kind: 'openings', retry: true }),
    retry: false,
    // A lost POST response can still have queued a job; read its state before another attempt.
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  const latest = readLatestReport(query.data);
  const current = query.data?.report?.inputSnapshot === inputSnapshot && !latest.stale ? latest.report : null;
  const error = query.error ?? (!isReportActive(current) && current?.status !== 'succeeded' ? retry.error : null);
  return {
    report: current?.status === 'succeeded' ? current : null,
    pending: Boolean(inputSnapshot) && (query.isPending || isReportActive(current) || retry.isPending),
    message: error instanceof Error ? error.message : current?.status === 'failed' ? current.errorMessage ?? '公式归纳失败' : null,
    retry: query.error ? () => void query.refetch() : canWrite && (current?.status === 'failed' || retry.isError) ? () => retry.mutate() : undefined,
  };
}
