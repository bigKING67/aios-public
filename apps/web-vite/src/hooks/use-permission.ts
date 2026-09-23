/**
 * usePermission Hook
 *
 * 提供权限检查功能：
 * - 检查单个权限
 * - 检查多个权限 (AND/OR 逻辑)
 * - 条件渲染权限保护的内容
 */

'use client';

import React from 'react';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import {
  hasEffectivePermission,
  hasAllPermissionCodes,
  hasAnyPermissionCode,
  hasPermissionCode,
  inferPermissionRole,
} from '@/lib/permission-access';

/**
 * 权限检查模式
 */
export type PermissionMode = 'all' | 'any';

/**
 * usePermission Hook
 *
 * @param permissionCode - 单个权限代码，或权限代码数组
 * @param mode - 检查模式：'all' 表示需要全部权限，'any' 表示只需任意一个
 * @returns 是否拥有相应权限
 *
 * @example
 * // 检查单个权限
 * const canEdit = usePermission('user:edit:all');
 *
 * // 检查多个权限（AND 逻辑）
 * const canManage = usePermission(['user:edit:all', 'user:delete:all'], 'all');
 *
 * // 检查多个权限（OR 逻辑）
 * const canView = usePermission(['report:view:all', 'dashboard:view:all'], 'any');
 */
export function usePermission(
  permissionCode: string | readonly string[],
  mode: PermissionMode = 'all'
): boolean {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const userRoles = useAuthStore((state) => state.user?.roles || []);

  return useMemo(() => {
    return hasEffectivePermission({
      permissionCode,
      mode,
      permissions,
      roles: userRoles,
      identity: {
        username: user?.username,
        email: user?.email,
        fullName: user?.full_name,
        roles: userRoles,
      },
    });
  }, [mode, permissionCode, permissions, user?.email, user?.full_name, user?.username, userRoles]);
}

/**
 * usePermissions Hook
 *
 * 检查多个权限，支持 AND/OR 逻辑
 *
 * @param codes - 权限代码数组
 * @param mode - 检查模式：'all' 或 'any'
 * @returns { hasAll, hasAny, has } - 各种检查方法
 *
 * @example
 * const { hasAll, hasAny, has } = usePermissions(['user:edit:all', 'role:edit:all']);
 *
 * if (hasAll) {
 *   // 用户拥有全部权限
 * }
 *
 * if (hasAny) {
 *   // 用户至少拥有其中一个权限
 * }
 *
 * if (has('user:edit:all')) {
 *   // 用户拥有指定权限
 * }
 */
export function usePermissions(codes: string[]) {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const userRoles = useAuthStore((state) => state.user?.roles || []);

  return useMemo(() => {
    const accessContext = {
      permissions,
      roles: userRoles,
      identity: {
        username: user?.username,
        email: user?.email,
        fullName: user?.full_name,
        roles: userRoles,
      },
    };

    const hasAll = hasAllPermissionCodes(accessContext, codes);
    const hasAny = hasAnyPermissionCode(accessContext, codes);

    const has = (code: string) => hasPermissionCode(accessContext, code);

    return { hasAll, hasAny, has, codes, permissions };
  }, [permissions, codes, user?.email, user?.full_name, user?.username, userRoles]);
}

/**
 * 权限守卫 - 检查是否有权限，没有则返回 null
 *
 * @param permissionCode - 权限代码
 * @param children - 有权限时渲染的内容
 * @returns 如果有权限则返回 children，否则返回 null
 *
 * @example
 * <PermissionGuard permission="user:edit:all">
 *   <EditButton />
 * </PermissionGuard>
 */
export function PermissionGuard({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const hasPermission = usePermission(permission);

  if (!hasPermission) {
    return null;
  }

  return React.createElement(React.Fragment, null, children);
}

/**
 * 权限条件渲染组件
 *
 * @example
 * <PermissionCheck permission={['user:edit:all', 'user:delete:all']} mode="any">
 *   <div>User can edit or delete</div>
 * </PermissionCheck>
 */
export function PermissionCheck({
  permission,
  mode = 'all',
  children,
  fallback = null,
}: {
  permission: string | readonly string[];
  mode?: PermissionMode;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}): React.ReactElement | null {
  const hasPermission = usePermission(permission, mode);

  return hasPermission
    ? React.createElement(React.Fragment, null, children)
    : fallback ? React.createElement(React.Fragment, null, fallback) : null;
}

/**
 * 角色检查（基于权限）
 *
 * 根据权限推断用户角色：
 * - admin: 拥有 user:delete:all 权限
 * - editor: 拥有 user:edit:all 权限
 * - viewer: 只拥有查看权限
 *
 * @returns { role, isAdmin, isEditor, isViewer }
 */
export function useRole() {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const userRoles = useAuthStore((state) => state.user?.roles || []);

  return useMemo(() => {
    return inferPermissionRole({
      permissions,
      roles: userRoles,
      identity: {
        username: user?.username,
        email: user?.email,
        fullName: user?.full_name,
        roles: userRoles,
      },
    });
  }, [permissions, user?.email, user?.full_name, user?.username, userRoles]);
}
