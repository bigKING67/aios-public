'use client';

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AIOS_API_PATHS, type AuditLogListResponse } from '@/lib/generated-api-contract';
import { parseListPayload } from '@/lib/list-payload';
import type { AuditFilters, AuditLog } from './audit-logs-types';

export interface UseAuditLogsListStateArgs {
  supportsAuditLogsApi: boolean;
}

export function useAuditLogsListState({
  supportsAuditLogsApi,
}: UseAuditLogsListStateArgs) {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'audit-logs', filters, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page,
        page_size: pageSize,
      };

      if (filters.module) {
        params.module = filters.module;
      }

      if (filters.action) {
        params.action = filters.action;
      }

      if (filters.keyword) {
        params.keyword = filters.keyword;
      }

      const response = await apiClient.get<AuditLogListResponse>(AIOS_API_PATHS.auditLogs, { params });
      return parseListPayload<AuditLog>(response.data);
    },
    enabled: supportsAuditLogsApi,
  });

  const handleSearch = useCallback((values: AuditFilters) => {
    setPage(1);
    setFilters(values);
  }, []);

  const handleReset = useCallback(() => {
    setPage(1);
    setFilters({});
  }, []);

  const handlePageChange = useCallback(
    (nextPage: number, nextSize?: number) => {
      setPage(nextPage);
      if (nextSize && nextSize !== pageSize) {
        setPageSize(nextSize);
      }
    },
    [pageSize]
  );

  return {
    auditItems: data?.items || [],
    auditTotal: data?.total || 0,
    isLoading,
    isFetching,
    page,
    pageSize,
    refetch,
    handleSearch,
    handleReset,
    handlePageChange,
    setPage,
    setPageSize,
  };
}
