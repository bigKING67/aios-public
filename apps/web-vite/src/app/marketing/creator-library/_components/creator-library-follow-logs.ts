import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCreatorFollowLogs } from '../_lib/creator-library-api';
import { creatorLibraryQueryKeys } from '../_lib/creator-library-query-keys';

export function useCreatorLibraryFollowLogs(creatorId: number | undefined) {
  const queryKey = useMemo(
    () => (
      creatorId !== undefined
        ? creatorLibraryQueryKeys.followLogs(creatorId)
        : [...creatorLibraryQueryKeys.root, 'follow-logs', 'empty']
    ),
    [creatorId]
  );

  return useQuery({
    queryKey,
    queryFn: () => {
      if (creatorId === undefined) {
        throw new Error('creatorId is required to load creator follow logs');
      }
      return fetchCreatorFollowLogs(creatorId);
    },
    enabled: creatorId !== undefined,
  });
}
