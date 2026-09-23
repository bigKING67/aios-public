/**
 * 受保护路由组件
 *
 * 提供路由级别的权限保护：
 * - 检查用户是否已认证
 * - 检查用户是否有指定权限
 * - 未认证用户重定向到登录页
 * - 无权限用户显示 403 页面
 */

'use client';

import { ReactNode, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '@/hooks/use-auth';
import { usePermission } from '@/hooks/use-permission';
import { canAccessPath, resolveSafeEntryPath } from '@/lib/auth-navigation';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import styles from './protected-route.module.css';

export interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string | readonly string[];
  permissionMode?: 'all' | 'any';
  fallback?: ReactNode;
}

/**
 * 受保护路由组件
 *
 * @param children - 受保护的内容
 * @param requiredPermission - 所需的权限代码（可选）
 * @param permissionMode - 权限检查模式：'all' (默认) 或 'any'
 * @param fallback - 无权限时显示的内容（可选）
 *
 * @example
 * <ProtectedRoute requiredPermission="user:edit:all">
 *   <UserManagementPage />
 * </ProtectedRoute>
 *
 * <ProtectedRoute requiredPermission={['user:edit:all', 'user:delete:all']} permissionMode="any">
 *   <AdminPanel />
 * </ProtectedRoute>
 */
export function ProtectedRoute({
  children,
  requiredPermission,
  permissionMode = 'all',
  fallback,
}: ProtectedRouteProps) {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const { isAuthenticated, isLoading, hasHydrated, hasSessionChecked, permissions, user } = useAuth();
  const hasPermission = usePermission(
    requiredPermission || '',
    permissionMode
  );
  const userRoles = useMemo(() => user?.roles || [], [user?.roles]);
  const routeAccessIdentity = useMemo(
    () => ({
      username: user?.username,
      email: user?.email,
      fullName: user?.full_name,
    }),
    [user?.email, user?.full_name, user?.username]
  );
  const hasRouteAccess = useMemo(
    () =>
      canAccessPath(pathname || ROUTE_PATHS.home, permissions, userRoles, routeAccessIdentity, isAuthenticated),
    [isAuthenticated, pathname, permissions, routeAccessIdentity, userRoles]
  );
  const loginPath = useMemo(() => {
    const currentPath = pathname || ROUTE_PATHS.home;
    return `${ROUTE_PATHS.login}?redirect=${encodeURIComponent(currentPath)}`;
  }, [pathname]);
  const safeFallbackPath = useMemo(
    () =>
      resolveSafeEntryPath(undefined, permissions, userRoles, routeAccessIdentity, isAuthenticated),
    [isAuthenticated, permissions, routeAccessIdentity, userRoles]
  );
  const lacksPermission = Boolean(requiredPermission && !hasPermission);
  const isForbidden = !hasRouteAccess || lacksPermission;
  const shouldRedirectForForbidden = Boolean(
    isForbidden && pathname !== safeFallbackPath
  );

  useEffect(() => {
    if (!hasHydrated || !hasSessionChecked || isLoading) {
      return;
    }

    // 如果未认证，重定向到登录页
    if (!isAuthenticated) {
      navigate(loginPath, { replace: true });
      return;
    }

    // 已认证但无权限，兜底跳转到可访问首屏
    if (shouldRedirectForForbidden) {
      navigate(safeFallbackPath, { replace: true });
      return;
    }
  }, [
    hasHydrated,
    hasSessionChecked,
    isAuthenticated,
    isLoading,
    loginPath,
    navigate,
    safeFallbackPath,
    shouldRedirectForForbidden,
  ]);

  // 加载中
  if (isLoading || !hasHydrated || !hasSessionChecked) {
    return (
      <div className={styles.centerState}>
        <Spin size="large" description="加载中..." />
      </div>
    );
  }

  // 未认证
  if (!isAuthenticated) {
    return (
      <div className={styles.centerState}>
        <Spin size="large" description="重定向到登录页..." />
      </div>
    );
  }

  // 检查权限
  if (isForbidden) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (pathname !== safeFallbackPath) {
      return (
        <div className={styles.centerState}>
          <Spin size="large" description="权限不足，正在跳转到可访问页面..." />
        </div>
      );
    }

    return (
      <div className={`${styles.centerState} ${styles.forbiddenState}`}>
        <div className={styles.forbiddenContent}>
          <h1>403</h1>
          <p>您没有访问此页面的权限</p>
          <p className={styles.forbiddenHint}>
            如果您认为这是一个错误，请联系管理员
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default ProtectedRoute;
