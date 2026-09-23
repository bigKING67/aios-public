/**
 * 认证全局状态管理
 *
 * 使用 Zustand 管理：
 * - 用户信息 (id, username, email, full_name)
 * - JWT Tokens (access_token, refresh_token)
 * - 用户权限列表
 * - 认证状态和加载状态
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../lib/auth-user';

/**
 * 用户信息类型
 */
export type User = AuthUser;

/**
 * 认证状态类型
 */
export interface AuthState {
  // 认证数据
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  permissions: string[];

  // 状态标志
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  hasSessionChecked: boolean;
  error: string | null;

  // 操作方法
  setUser: (user: User | null) => void;
  setTokens: (token: string | null, refreshToken?: string | null) => void;
  setPermissions: (permissions: string[]) => void;
  setLoading: (loading: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  setSessionChecked: (checked: boolean) => void;
  setError: (error: string | null) => void;
  login: (user: User, permissions: string[], token?: string | null) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

/**
 * 创建认证 Store
 *
 * 会话策略：
 * - token / refreshToken 仅驻留内存，不落盘到 localStorage（HttpOnly Cookie 托管）
 * - 仅持久化用户态与权限，避免刷新后 UI 状态抖动
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // 初始状态
      user: null,
      token: null,
      refreshToken: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      hasSessionChecked: false,
      error: null,

      // 设置用户信息
      setUser: (user) => {
        set({
          user,
          isAuthenticated: !!user,
          hasSessionChecked: true,
        });
      },

      // 设置 Tokens
      setTokens: (token, refreshToken = null) => {
        set({
          token: token || null,
          refreshToken: refreshToken || null,
        });
      },

      // 设置权限列表
      setPermissions: (permissions) => {
        set({ permissions });
      },

      // 设置加载状态
      setLoading: (isLoading) => {
        set({ isLoading });
      },

      // 设置 hydration 状态
      setHydrated: (hasHydrated) => {
        set({ hasHydrated });
      },

      // 设置会话检查状态
      setSessionChecked: (hasSessionChecked) => {
        set({ hasSessionChecked });
      },

      // 设置错误信息
      setError: (error) => {
        set({ error });
      },

      // 登录
      login: (user, permissions, token = null) => {
        set({
          user,
          token: token || null,
          refreshToken: null,
          permissions,
          isAuthenticated: true,
          hasSessionChecked: true,
          error: null,
        });
      },

      // 登出
      logout: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          permissions: [],
          isAuthenticated: false,
          hasSessionChecked: true,
          error: null,
        });
      },

      // 更新用户信息
      updateUser: (user) => {
        set({ user });
      },
    }),
    {
      name: 'auth-store',
      version: 2,
      partialize: (state) => ({
        user: state.user,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
      }),
      migrate: (persistedState) => {
        const state = (persistedState || {}) as Partial<AuthState>;
        const nextState: Partial<AuthState> = {
          ...state,
          token: null,
          refreshToken: null,
          isAuthenticated: Boolean(state.user && state.isAuthenticated),
          hasHydrated: false,
          hasSessionChecked: false,
        };

        return nextState as AuthState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        state.setHydrated(true);
      },
    }
  )
);

/**
 * 获取当前用户是否已认证
 */
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;

/**
 * 获取当前用户
 */
export const selectUser = (state: AuthState) => state.user;

/**
 * 获取当前用户权限
 */
export const selectPermissions = (state: AuthState) => state.permissions;

/**
 * 获取加载状态
 */
export const selectIsLoading = (state: AuthState) => state.isLoading;

/**
 * 获取持久化 hydration 状态
 */
export const selectHasHydrated = (state: AuthState) => state.hasHydrated;

/**
 * 获取会话检查状态
 */
export const selectHasSessionChecked = (state: AuthState) => state.hasSessionChecked;

/**
 * 获取错误信息
 */
export const selectError = (state: AuthState) => state.error;
