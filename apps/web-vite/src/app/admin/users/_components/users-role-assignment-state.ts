'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isReservedElevatedRoleCode } from '@/lib/role-access';
import {
  fetchRoleOptions,
  fetchUserRoles,
  usersQueryKeys,
} from '../_lib/users-api';
import type { RoleOption, User, UserRoleItem } from '../_lib/users-types';

const EMPTY_ROLES: RoleOption[] = [];
const EMPTY_USER_ROLE_ITEMS: UserRoleItem[] = [];
const EMPTY_ROLE_LIST_RESULT = { items: EMPTY_ROLES, total: 0 };
const EMPTY_USER_ROLE_LIST_RESULT = { items: EMPTY_USER_ROLE_ITEMS, total: 0 };

export interface UseUsersRoleAssignmentStateArgs {
  supportsUsersApi: boolean;
  canManageElevatedRoles: boolean;
}

export function useUsersRoleAssignmentState({
  supportsUsersApi,
  canManageElevatedRoles,
}: UseUsersRoleAssignmentStateArgs) {
  const [roleModalUser, setRoleModalUser] = useState<User | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[] | null>(null);

  const { data: roleListData, isLoading: isRoleListLoading } = useQuery({
    queryKey: usersQueryKeys.roleOptions(),
    queryFn: fetchRoleOptions,
    enabled: supportsUsersApi && !!roleModalUser,
  });
  const roleList = roleListData ?? EMPTY_ROLE_LIST_RESULT;

  const { data: roleSelectionData, isLoading: isRoleSelectionLoading } = useQuery({
    queryKey: usersQueryKeys.userRoles(roleModalUser?.id),
    queryFn: async () => {
      if (!roleModalUser) {
        return EMPTY_USER_ROLE_LIST_RESULT;
      }

      return fetchUserRoles(roleModalUser.id);
    },
    enabled: supportsUsersApi && !!roleModalUser,
  });
  const roleSelection = roleSelectionData ?? EMPTY_USER_ROLE_LIST_RESULT;
  const effectiveSelectedRoleIds = useMemo(
    () => (selectedRoleIds !== null ? selectedRoleIds : roleSelection.items.map((item) => String(item.id))),
    [roleSelection.items, selectedRoleIds]
  );

  const roleOptions = useMemo(
    () =>
      roleList.items.map((role) => ({
        label: `${role.name} (${role.code})`,
        value: String(role.id),
        disabled:
          !canManageElevatedRoles && isReservedElevatedRoleCode(role.code),
      })),
    [canManageElevatedRoles, roleList.items]
  );

  const targetHasElevatedRole = useMemo(
    () => roleSelection.items.some((role) => isReservedElevatedRoleCode(role.code)),
    [roleSelection.items]
  );
  const roleEditBlocked = !canManageElevatedRoles && targetHasElevatedRole;

  const handleOpenRoleModal = useCallback((user: User) => {
    setRoleModalUser(user);
    setSelectedRoleIds(null);
  }, []);

  const handleCancelRoleModal = useCallback(() => {
    setRoleModalUser(null);
    setSelectedRoleIds(null);
  }, []);

  return {
    roleModalUser,
    roleListItems: roleList.items,
    roleItems: roleSelection.items,
    roleOptions,
    selectedRoleIds: effectiveSelectedRoleIds,
    roleEditBlocked,
    isRoleListLoading,
    isRoleSelectionLoading,
    setSelectedRoleIds,
    setRoleModalUser,
    handleOpenRoleModal,
    handleCancelRoleModal,
  };
}
