/**
 * useAuth Hook
 *
 * 提供认证相关的功能：
 * - 登录 (username + password)
 * - 登出
 * - 获取当前用户
 * - 检查认证状态
 */

'use client';

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { apiClient } from '@/lib/api-client';
import { resolveClientErrorMessage } from '@/lib/client-error';
import {
  authUserFromSession,
  AIOS_API_PATHS,
  type CreateUserRequest,
  type SessionLoginRequest,
  type SessionLoginResponse,
  type SessionLogoutResponse,
  type SessionRefreshResponse,
  type UserAdminResponse,
} from '@/lib/generated-api-contract';
import {
  hasAllPermissionCodes,
  hasAnyPermissionCode,
  hasPermissionCode,
} from '@/lib/permission-access';

/**
 * useAuth Hook
 */
export function useAuth() {
  const navigate = useNavigate();

  // 从 Store 获取状态和方法
  const {
    user,
    token,
    permissions,
    isAuthenticated,
    isLoading,
    hasHydrated,
    hasSessionChecked,
    error,
    setLoading,
    setError,
    login,
    setTokens,
    logout: logoutAction,
  } = useAuthStore();

  /**
   * 登录方法
   */
  const signIn = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        const request: SessionLoginRequest = {
          username,
          password,
        };
        const response = await apiClient.post<SessionLoginResponse>(AIOS_API_PATHS.sessionLogin, request);

        const {
          user: sessionUser,
          permissions: verifiedPermissions,
          access_token,
        } = response.data;
        const verifiedUser = authUserFromSession(sessionUser);

        setTokens(access_token || null);

        // 会话校验成功后再提交登录态
        login(verifiedUser, verifiedPermissions || [], access_token || null);

        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('auth_token');
        }

        return verifiedUser;
      } catch (err: unknown) {
        // 登录链路任意步骤失败都清理本地会话，避免半登录态
        logoutAction();
        const errorMessage = resolveClientErrorMessage(err, '登录失败，请重试');
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [login, logoutAction, setError, setLoading, setTokens]
  );

  /**
   * 登出方法
   */
  const signOut = useCallback(async () => {
    setLoading(true);

    try {
      // 调用会话登出接口（服务端清理 HttpOnly Cookie）
      await apiClient.post<SessionLogoutResponse>(AIOS_API_PATHS.sessionLogout);
    } catch (err) {
      // 即使登出请求失败，也清空本地状态
      console.error('Logout request failed:', err);
    } finally {
      // 清空本地认证信息
      logoutAction();
      setTokens(null, null);
      setLoading(false);

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('auth_token');
      }

      // 重定向到登录页
      navigate('/login');
    }
  }, [logoutAction, navigate, setLoading, setTokens]);

  /**
   * 注册方法
   */
  const signUp = useCallback(
    async (
      username: string,
      email: string,
      password: string,
      fullName?: string
    ) => {
      setLoading(true);
      setError(null);

      try {
        const request: CreateUserRequest = {
          username,
          email,
          password,
          ...(fullName ? { full_name: fullName } : {}),
        };
        const response = await apiClient.post<UserAdminResponse>(
          AIOS_API_PATHS.authRegister,
          request,
        );

        return response.data;
      } catch (err: unknown) {
        const errorMessage = resolveClientErrorMessage(err, 'Registration failed');
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError]
  );

  /**
   * 刷新 Token
   */
  const refreshAccessToken = useCallback(async () => {
    try {
      const response = await apiClient.post<SessionRefreshResponse>(
        AIOS_API_PATHS.sessionRefresh,
      );

      const nextAccessToken =
        typeof response.data?.access_token === 'string'
          ? response.data.access_token
          : null;

      useAuthStore.getState().setTokens(nextAccessToken, null);

      return true;
    } catch {
      logoutAction();
      return false;
    }
  }, [logoutAction]);

  /**
   * 检查是否有特定权限
   */
  const hasPermission = useCallback(
    (permissionCode: string) => {
      return hasPermissionCode(
        {
          permissions,
          roles: user?.roles || [],
          identity: {
            username: user?.username,
            email: user?.email,
            fullName: user?.full_name,
            roles: user?.roles || [],
          },
        },
        permissionCode,
      );
    },
    [permissions, user?.email, user?.full_name, user?.roles, user?.username]
  );

  /**
   * 检查是否有任意一个权限
   */
  const hasAnyPermission = useCallback(
    (permissionCodes: string[]) => {
      return hasAnyPermissionCode(
        {
          permissions,
          roles: user?.roles || [],
          identity: {
            username: user?.username,
            email: user?.email,
            fullName: user?.full_name,
            roles: user?.roles || [],
          },
        },
        permissionCodes,
      );
    },
    [permissions, user?.email, user?.full_name, user?.roles, user?.username]
  );

  /**
   * 检查是否有全部权限
   */
  const hasAllPermissions = useCallback(
    (permissionCodes: string[]) => {
      return hasAllPermissionCodes(
        {
          permissions,
          roles: user?.roles || [],
          identity: {
            username: user?.username,
            email: user?.email,
            fullName: user?.full_name,
            roles: user?.roles || [],
          },
        },
        permissionCodes,
      );
    },
    [permissions, user?.email, user?.full_name, user?.roles, user?.username]
  );

  return {
    // 状态
    user,
    token,
    permissions,
    isAuthenticated,
    isLoading,
    hasHydrated,
    hasSessionChecked,
    error,

    // 方法
    signIn,
    signOut,
    signUp,
    refreshAccessToken,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
