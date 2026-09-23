'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AIOS_API_PATHS, type PermissionsResponse } from '@/lib/generated-api-contract';
import { parseArrayPayload } from '@/lib/list-payload';
import type { PermissionItem } from './permissions-types';

const EMPTY_PERMISSION_ITEMS: PermissionItem[] = [];

export interface UsePermissionsPageListStateArgs {
  supportsPermissionsApi: boolean;
}

export function usePermissionsPageListState({
  supportsPermissionsApi,
}: UsePermissionsPageListStateArgs) {
  const [keyword, setKeyword] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: async () => {
      const response = await apiClient.get<PermissionsResponse>(AIOS_API_PATHS.permissions, {
        params: { grouped: false },
      });
      return parseArrayPayload<PermissionItem>(response.data);
    },
    enabled: supportsPermissionsApi,
  });

  const permissions = data ?? EMPTY_PERMISSION_ITEMS;
  const modules = useMemo(() => {
    return Array.from(
      new Set(
        permissions
          .map((permission) => permission.module)
          .filter((value): value is string => Boolean(value))
      )
    );
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return permissions.filter((permission) => {
      const matchModule = moduleFilter === 'all' || permission.module === moduleFilter;
      const searchable = [
        permission.code,
        permission.name,
        permission.display_name,
        permission.description,
        permission.action,
        permission.resource_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchKeyword =
        normalizedKeyword.length === 0 || searchable.includes(normalizedKeyword);

      return matchModule && matchKeyword;
    });
  }, [keyword, moduleFilter, permissions]);

  const [mobilePage, setMobilePage] = useState(1);
  const [mobilePageSize, setMobilePageSize] = useState(20);
  const mobilePaginationCurrent = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredPermissions.length / mobilePageSize));
    return Math.min(mobilePage, totalPages);
  }, [filteredPermissions.length, mobilePage, mobilePageSize]);
  const mobilePagedPermissions = useMemo(() => {
    const start = (mobilePaginationCurrent - 1) * mobilePageSize;
    return filteredPermissions.slice(start, start + mobilePageSize);
  }, [filteredPermissions, mobilePaginationCurrent, mobilePageSize]);
  const handleMobilePaginationChange = useCallback(
    (page: number, pageSize: number) => {
      setMobilePageSize(pageSize);
      setMobilePage(pageSize !== mobilePageSize ? 1 : page);
    },
    [mobilePageSize]
  );

  return {
    keyword,
    setKeyword,
    moduleFilter,
    setModuleFilter,
    permissions,
    modules,
    filteredPermissions,
    isLoading,
    isFetching,
    refetch,
    mobilePageSize,
    mobilePaginationCurrent,
    mobilePagedPermissions,
    handleMobilePaginationChange,
  };
}
