'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { request } from '@/lib/request';
import type {
  DataOpsActionRequest,
  DataOpsActionResponse,
} from '@/types/dataops';
import { dataOpsQueryKeys } from './use-dataops-runtime';

export function useDataOpsActions(): UseMutationResult<
  DataOpsActionResponse,
  Error,
  DataOpsActionRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) =>
      request.post<DataOpsActionResponse>('/dataops/actions', payload, {
        cancelPrevious: false,
        requestKey: `dataops-action-${payload.action}`,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dataOpsQueryKeys.runtime(),
      });
    },
  });
}
