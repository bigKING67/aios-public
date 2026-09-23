'use client';

import { useEffect } from 'react';
import { configureAuthSessionBridge } from '@/lib/auth-session-bridge';
import { useAuthStore } from '@/stores/auth.store';

export function AuthSessionBridgeInstaller() {
  useEffect(() => {
    configureAuthSessionBridge({
      getAccessToken: () => useAuthStore.getState().token,
      setAccessToken: (accessToken) => {
        useAuthStore.getState().setTokens(accessToken, null);
      },
      clearSession: () => {
        useAuthStore.getState().logout();
      },
    });
  }, []);

  return null;
}

export default AuthSessionBridgeInstaller;
