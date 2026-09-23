'use client';

import { useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { recoverAuthSession } from '@/lib/auth-session-recovery';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 应用启动时恢复会话：
 * 1. 等待持久化状态 hydration 完成
 * 2. 统一通过 HttpOnly cookie 拉取 /auth/session/me 校验当前会话
 * 3. 会话有效后立即放行页面，access token 在后台刷新
 * 4. 无论持久化里是否残留登录态，都在远端校验完成后才标记会话检查完成
 */
export function AuthSessionBootstrap() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const hasSessionChecked = useAuthStore((state) => state.hasSessionChecked);

  useEffect(() => {
    if (!hasHydrated || hasSessionChecked) {
      return;
    }

    let cancelled = false;
    const { login, logout, setLoading, setSessionChecked, setTokens } = useAuthStore.getState();

    void recoverAuthSession({
      apiClient,
      auth: {
        login,
        logout,
        setLoading,
        setSessionChecked,
        setTokens,
      },
      isCancelled: () => cancelled,
    });

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, hasSessionChecked]);

  return null;
}

export default AuthSessionBootstrap;
