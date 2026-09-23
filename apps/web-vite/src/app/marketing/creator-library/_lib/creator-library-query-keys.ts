import type { CreatorLibraryQueryParams } from './creator-library-types';

const CREATOR_LIBRARY_ROOT_QUERY_KEY = ['marketing', 'creator-library'] as const;

export const creatorLibraryQueryKeys = {
  root: CREATOR_LIBRARY_ROOT_QUERY_KEY,
  lists: () => [...CREATOR_LIBRARY_ROOT_QUERY_KEY, 'list'] as const,
  list: (params: CreatorLibraryQueryParams) =>
    [...CREATOR_LIBRARY_ROOT_QUERY_KEY, 'list', params] as const,
  filterOptions: () => [...CREATOR_LIBRARY_ROOT_QUERY_KEY, 'filter-options'] as const,
  followLogs: (creatorId: number) =>
    [...CREATOR_LIBRARY_ROOT_QUERY_KEY, 'follow-logs', creatorId] as const,
};
