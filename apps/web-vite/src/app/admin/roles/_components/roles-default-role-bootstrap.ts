import { useMutation, type QueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type CreateRoleRequest,
  type PermissionsResponse,
  type RoleListItem,
  type RoleListResponse,
  type RoleMessageResponse,
  type UpdateRolePermissionsRequest,
} from '@/lib/generated-api-contract';
import { parseListPayload } from '@/lib/list-payload';
import { normalizeRole } from '@/lib/role-access';
import { DEFAULT_ROLE_TEMPLATES } from './default-role-templates';
import { parsePermissionListPayload, resolveTargetPermissionIds } from './role-permission-helpers';
import { getRoleErrorMessage } from './roles-error-message';
import type { Role } from './roles-types';

interface BootstrapDefaultRolesResult {
  createdRoleCodes: string[];
  syncedPermissionRoleCodes: string[];
  skippedPermissionRoleCodes: string[];
  failedPermissionRoleCodes: string[];
}

async function loadRoles(): Promise<Role[]> {
  const response = await apiClient.get<RoleListResponse>(AIOS_API_PATHS.roles);
  return parseListPayload<Role>(response.data).items || [];
}

async function bootstrapDefaultRoles(): Promise<BootstrapDefaultRolesResult> {
  const permissionsResponse = await apiClient.get<PermissionsResponse>(AIOS_API_PATHS.permissions, {
    params: { grouped: false },
  });
  const allPermissions = parsePermissionListPayload(permissionsResponse.data);

  let roleItems = await loadRoles();
  const createdRoleCodes: string[] = [];
  const syncedPermissionRoleCodes: string[] = [];
  const skippedPermissionRoleCodes: string[] = [];
  const failedPermissionRoleCodes: string[] = [];

  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const normalizedCode = normalizeRole(template.code);
    let existingRole = roleItems.find((item) => normalizeRole(item.code) === normalizedCode);

    if (!existingRole) {
      const request: CreateRoleRequest = {
        name: template.name,
        code: template.code,
        description: template.description,
        is_active: true,
      };
      await apiClient.post<RoleListItem>(AIOS_API_PATHS.roles, request);
      createdRoleCodes.push(template.code);
      roleItems = await loadRoles();
      existingRole = roleItems.find((item) => normalizeRole(item.code) === normalizedCode);
    }

    if (!existingRole) {
      skippedPermissionRoleCodes.push(template.code);
      continue;
    }

    const permissionIds = resolveTargetPermissionIds(template.code, allPermissions);
    if (permissionIds.length === 0) {
      skippedPermissionRoleCodes.push(template.code);
      continue;
    }

    try {
      const request: UpdateRolePermissionsRequest = {
        permission_ids: permissionIds,
      };
      await apiClient.put<RoleMessageResponse>(
        AIOS_API_PATHS.rolePermissions(existingRole.id),
        request,
      );
      syncedPermissionRoleCodes.push(template.code);
    } catch (_error) {
      failedPermissionRoleCodes.push(template.code);
    }
  }

  return {
    createdRoleCodes,
    syncedPermissionRoleCodes,
    skippedPermissionRoleCodes,
    failedPermissionRoleCodes,
  };
}

export function useDefaultRoleBootstrapMutation(queryClient: QueryClient) {
  return useMutation({
    mutationFn: bootstrapDefaultRoles,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });

      const createdText =
        result.createdRoleCodes.length > 0
          ? `已创建：${result.createdRoleCodes.join('、')}`
          : '角色已存在';
      const syncedText =
        result.syncedPermissionRoleCodes.length > 0
          ? `已同步权限：${result.syncedPermissionRoleCodes.join('、')}`
          : '未同步权限';
      const skippedText =
        result.skippedPermissionRoleCodes.length > 0
          ? `跳过权限：${result.skippedPermissionRoleCodes.join('、')}`
          : '';
      const failedText =
        result.failedPermissionRoleCodes.length > 0
          ? `权限同步失败：${result.failedPermissionRoleCodes.join('、')}`
          : '';

      const summary = [createdText, syncedText, skippedText, failedText].filter(Boolean).join('；');

      if (result.failedPermissionRoleCodes.length > 0) {
        message.warning(`默认角色补齐完成（部分异常）：${summary}`);
      } else {
        message.success(`默认角色补齐完成：${summary}`);
      }
    },
    onError: (error: unknown) => {
      message.error(getRoleErrorMessage(error, '默认角色补齐失败'));
    },
  });
}
