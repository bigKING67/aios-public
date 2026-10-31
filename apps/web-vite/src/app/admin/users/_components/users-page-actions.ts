import type { Dispatch, SetStateAction } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@lobehub/ui';
import {
  createUser,
  deleteUser,
  updateUser,
  updateUserRoles,
  usersQueryKeys,
} from '../_lib/users-api';
import type { User, UserFormValues } from '../_lib/users-types';
import { getUserErrorMessage } from './users-error-message';

interface UseUsersPageActionsParams {
  editingUser: User | null;
  setIsModalVisible: Dispatch<SetStateAction<boolean>>;
  setEditingUser: Dispatch<SetStateAction<User | null>>;
  setRoleModalUser: Dispatch<SetStateAction<User | null>>;
  setSelectedRoleIds: Dispatch<SetStateAction<string[] | null>>;
}

export function useUsersPageActions({
  editingUser,
  setIsModalVisible,
  setEditingUser,
  setRoleModalUser,
  setSelectedRoleIds,
}: UseUsersPageActionsParams) {
  const queryClient = useQueryClient();

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      toast.success('用户创建成功');
      queryClient.invalidateQueries({ queryKey: usersQueryKeys.list() });
      setIsModalVisible(false);
    },
    onError: (err: unknown) => {
      toast.error(getUserErrorMessage(err, '创建失败'));
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (values: UserFormValues) => {
      if (!editingUser) {
        throw new Error('用户不存在');
      }
      return updateUser(editingUser.id, values);
    },
    onSuccess: () => {
      toast.success('用户更新成功');
      queryClient.invalidateQueries({ queryKey: usersQueryKeys.list() });
      setIsModalVisible(false);
      setEditingUser(null);
    },
    onError: (err: unknown) => {
      toast.error(getUserErrorMessage(err, '更新失败'));
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      toast.success('用户删除成功');
      queryClient.invalidateQueries({ queryKey: usersQueryKeys.list() });
    },
    onError: (err: unknown) => {
      toast.error(getUserErrorMessage(err, '删除失败'));
    },
  });

  const updateUserRolesMutation = useMutation({
    mutationFn: updateUserRoles,
    onSuccess: (_, variables) => {
      toast.success('角色分配已更新');
      queryClient.invalidateQueries({ queryKey: usersQueryKeys.list() });
      queryClient.invalidateQueries({ queryKey: usersQueryKeys.userRoles(variables.userId) });
      setRoleModalUser(null);
      setSelectedRoleIds(null);
    },
    onError: (err: unknown) => {
      toast.error(getUserErrorMessage(err, '角色分配失败'));
    },
  });

  return {
    createUserMutation,
    deleteUserMutation,
    updateUserMutation,
    updateUserRolesMutation,
  };
}
