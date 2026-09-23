'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { request } from '@/lib/request';
import type { DataOpsRuntimeResponse } from '@/types/dataops';

const DATAOPS_RUNTIME_QUERY_KEY = ['dataops', 'runtime'] as const;
const DEFAULT_REFETCH_INTERVAL_MS = 60_000;
const ACTIVE_REFETCH_INTERVAL_MS = 15_000;
const MIN_REFETCH_INTERVAL_MS = 5_000;
const MAX_REFETCH_INTERVAL_MS = 5 * 60_000;
const ACTIVE_FLOW_RUN_STATES = new Set(['RUNNING', 'PENDING', 'LATE', 'SCHEDULED']);

export interface UseDataOpsRuntimeOptions {
  enabled?: boolean;
  refetchIntervalMs?: number;
  refetchOnWindowFocus?: boolean;
}

export const dataOpsQueryKeys = {
  runtime: () => DATAOPS_RUNTIME_QUERY_KEY,
};

export function useDataOpsRuntime(
  options: UseDataOpsRuntimeOptions = {}
): UseQueryResult<DataOpsRuntimeResponse, Error> {
  const {
    enabled = true,
    refetchIntervalMs = DEFAULT_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus = false,
  } = options;
  const normalizedRefetchIntervalMs = Number.isFinite(refetchIntervalMs)
    ? Math.floor(refetchIntervalMs)
    : DEFAULT_REFETCH_INTERVAL_MS;
  const safeRefetchIntervalMs = Math.min(
    Math.max(normalizedRefetchIntervalMs, MIN_REFETCH_INTERVAL_MS),
    MAX_REFETCH_INTERVAL_MS
  );
  const activeRefetchIntervalMs = Math.min(safeRefetchIntervalMs, ACTIVE_REFETCH_INTERVAL_MS);

  return useQuery({
    queryKey: dataOpsQueryKeys.runtime(),
    queryFn: ({ signal }) =>
      request.get<DataOpsRuntimeResponse>('/dataops/runtime', {
        signal,
        cancelPrevious: true,
        requestKey: 'dataops-runtime',
        suppressErrorLog: true,
      }),
    enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      const payload = query.state.data as DataOpsRuntimeResponse | undefined;
      if (!payload?.pipelines?.length) {
        return safeRefetchIntervalMs;
      }

      const hasActivePipelines = payload.pipelines.some((pipeline) => {
        const rawStateType = pipeline.runtime?.flowRunStateType;
        if (!rawStateType) {
          return false;
        }
        return ACTIVE_FLOW_RUN_STATES.has(rawStateType.toUpperCase());
      });

      return hasActivePipelines ? activeRefetchIntervalMs : safeRefetchIntervalMs;
    },
    refetchOnWindowFocus,
    refetchOnReconnect: true,
    retry: 1,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}
