import type { Dispatch, SetStateAction } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import type { FormInstance } from 'antd';
import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type CreateRoleRequest,
  type RoleListItem,
  type RoleMessageResponse,
  type UpdateRoleRequest,
} from '@/lib/generated-api-contract';
import { useDefaultRoleBootstrapMutation } from './roles-default-role-bootstrap';
import { getRoleErrorMessage } from './roles-error-message';
import type { Role, RoleFormValues } from './roles-types';

export interface UseRolesPageActionsParams {
  form: FormInstance<RoleFormValues>;
  editingRole: Role | null;
  setIsModalOpen: Dispatch<SetStateAction<boolean>>;
  setEditingRole: Dispatch<SetStateAction<Role | null>>;
}

export function useRolesPageActions({
  form,
  editingRole,
  setIsModalOpen,
  setEditingRole,
}: UseRolesPageActionsParams) {
  const queryClient = useQueryClient();

  const createRoleMutation = useMutation({
    mutationFn: async (values: RoleFormValues) => {
      const request: CreateRoleRequest = {
        name: values.name,
        code: values.code ?? '',
        description: values.description ?? null,
        is_active: values.is_active,
      };
      const response = await apiClient.post<RoleListItem>(AIOS_API_PATHS.roles, request);
      return response.data;
    },
    onSuccess: () => {
      message.success('角色创建成功');
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      setIsModalOpen(false);
      form.resetFields();
    },
    onError: (error: unknown) => {
      message.error(getRoleErrorMessage(error, '角色创建失败'));
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (values: RoleFormValues) => {
      if (!editingRole) {
        throw new Error('角色不存在');
      }
      const request: UpdateRoleRequest = {
        name: values.name,
        ...(values.code !== undefined ? { code: values.code } : {}),
        ...(values.description !== undefined ? { description: values.description } : {}),
        is_active: values.is_active,
      };
      const response = await apiClient.put<RoleListItem>(
        AIOS_API_PATHS.role(editingRole.id),
        request,
      );
      return response.data;
    },
    onSuccess: () => {
      message.success('角色更新成功');
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      setIsModalOpen(false);
      setEditingRole(null);
      form.resetFields();
    },
    onError: (error: unknown) => {
      message.error(getRoleErrorMessage(error, '角色更新失败'));
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string | number) => {
      await apiClient.delete<RoleMessageResponse>(AIOS_API_PATHS.role(roleId));
    },
    onSuccess: () => {
      message.success('角色删除成功');
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (error: unknown) => {
      message.error(getRoleErrorMessage(error, '角色删除失败'));
    },
  });

  const bootstrapDefaultRolesMutation = useDefaultRoleBootstrapMutation(queryClient);

  return {
    createRoleMutation,
    updateRoleMutation,
    deleteRoleMutation,
    bootstrapDefaultRolesMutation,
  };
}
