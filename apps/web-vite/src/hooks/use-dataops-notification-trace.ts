'use client';

import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { request } from '@/lib/request';
import type { DataOpsNotificationTraceResponse } from '@/types/dataops';

const DEFAULT_LIMIT = 400;
const MAX_LIMIT = 1200;

export interface UseDataOpsNotificationTraceOptions {
  retryGroupId: string;
  enabled?: boolean;
  limit?: number;
  refetchIntervalMs?: number;
  refetchOnWindowFocus?: boolean;
}

function normalizeTraceLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  const parsed = Math.floor(limit || 0);
  if (parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

export function useDataOpsNotificationTrace(
  options: UseDataOpsNotificationTraceOptions
): UseQueryResult<DataOpsNotificationTraceResponse, Error> {
  const {
    retryGroupId,
    enabled = true,
    limit,
    refetchIntervalMs = 30_000,
    refetchOnWindowFocus = false,
  } = options;
  const normalizedRetryGroupId = retryGroupId.trim();
  const normalizedLimit = useMemo(() => normalizeTraceLimit(limit), [limit]);

  return useQuery({
    queryKey: ['dataops', 'runtime', 'notification-trace', normalizedRetryGroupId, normalizedLimit],
    queryFn: ({ signal }) =>
      request.get<DataOpsNotificationTraceResponse>('/dataops/runtime/notification-trace', {
        params: {
          retryGroupId: normalizedRetryGroupId,
          limit: normalizedLimit,
        },
        signal,
        cancelPrevious: true,
        requestKey: `dataops-notification-trace:${normalizedRetryGroupId}`,
        suppressErrorLog: true,
      }),
    enabled: enabled && Boolean(normalizedRetryGroupId),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchInterval: refetchIntervalMs,
    refetchOnWindowFocus,
    refetchOnReconnect: true,
    retry: 1,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}
