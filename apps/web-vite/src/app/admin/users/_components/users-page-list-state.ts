'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchUsers, usersQueryKeys } from '../_lib/users-api';
import type { User } from '../_lib/users-types';

const EMPTY_USERS: User[] = [];
const EMPTY_USER_LIST_RESULT = { items: EMPTY_USERS, total: 0 };

export interface UseUsersPageListStateArgs {
  supportsUsersApi: boolean;
}

export function useUsersPageListState({
  supportsUsersApi,
}: UseUsersPageListStateArgs) {
  const { data: userListData, isLoading } = useQuery({
    queryKey: usersQueryKeys.list(),
    queryFn: fetchUsers,
    enabled: supportsUsersApi,
  });
  const userList = userListData ?? EMPTY_USER_LIST_RESULT;
  const [mobilePage, setMobilePage] = useState(1);
  const [mobilePageSize, setMobilePageSize] = useState(10);
  const mobilePaginationCurrent = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(userList.total / mobilePageSize));
    return Math.min(mobilePage, totalPages);
  }, [mobilePage, mobilePageSize, userList.total]);
  const mobilePagedUsers = useMemo(() => {
    const start = (mobilePaginationCurrent - 1) * mobilePageSize;
    return userList.items.slice(start, start + mobilePageSize);
  }, [mobilePaginationCurrent, mobilePageSize, userList.items]);
  const handleMobilePaginationChange = useCallback(
    (page: number, pageSize: number) => {
      setMobilePageSize(pageSize);
      setMobilePage(pageSize !== mobilePageSize ? 1 : page);
    },
    [mobilePageSize]
  );

  return {
    userList,
    isLoading,
    mobilePageSize,
    mobilePaginationCurrent,
    mobilePagedUsers,
    handleMobilePaginationChange,
  };
}
