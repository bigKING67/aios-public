'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AIOS_API_PATHS, type RoleListResponse } from '@/lib/generated-api-contract';
import { parseListPayload } from '@/lib/list-payload';
import type { Role } from './roles-types';

const EMPTY_ROLE_ITEMS: Role[] = [];
const EMPTY_ROLE_LIST_RESULT = { items: EMPTY_ROLE_ITEMS, total: 0 };

export interface UseRolesPageListStateArgs {
  supportsRolesApi: boolean;
}

export function useRolesPageListState({
  supportsRolesApi,
}: UseRolesPageListStateArgs) {
  const {
    data: roleList,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const response = await apiClient.get<RoleListResponse>(AIOS_API_PATHS.roles);
      return parseListPayload<Role>(response.data);
    },
    enabled: supportsRolesApi,
  });

  const roleListResult = roleList ?? EMPTY_ROLE_LIST_RESULT;
  const roleItems = roleListResult.items;
  const roleTotal = roleListResult.total;
  const [mobilePage, setMobilePage] = useState(1);
  const [mobilePageSize, setMobilePageSize] = useState(10);
  const mobilePaginationCurrent = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(roleTotal / mobilePageSize));
    return Math.min(mobilePage, totalPages);
  }, [mobilePage, mobilePageSize, roleTotal]);
  const mobilePagedRoles = useMemo(() => {
    const start = (mobilePaginationCurrent - 1) * mobilePageSize;
    return roleItems.slice(start, start + mobilePageSize);
  }, [mobilePaginationCurrent, mobilePageSize, roleItems]);
  const handleMobilePaginationChange = useCallback(
    (page: number, pageSize: number) => {
      setMobilePageSize(pageSize);
      setMobilePage(pageSize !== mobilePageSize ? 1 : page);
    },
    [mobilePageSize]
  );

  return {
    roleItems,
    roleTotal,
    isLoading,
    isFetching,
    refetch,
    mobilePageSize,
    mobilePaginationCurrent,
    mobilePagedRoles,
    handleMobilePaginationChange,
  };
}
