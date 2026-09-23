import { resolveClientErrorStatus } from './client-error';
import type { AuthUser } from './auth-user';
import {
  authUserFromSession,
  AIOS_API_PATHS,
  type SessionMeResponse,
  type SessionRefreshResponse,
} from './generated-api-contract';

export interface AuthSessionRecoveryResponse<T> {
  data?: T;
}

export interface AuthSessionRecoveryClient {
  get<T>(url: string): Promise<AuthSessionRecoveryResponse<T>>;
  post<T>(url: string): Promise<AuthSessionRecoveryResponse<T>>;
}

export interface AuthSessionRecoveryActions {
  login: (user: AuthUser, permissions: string[], token?: string | null) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setSessionChecked: (checked: boolean) => void;
  setTokens: (token: string | null, refreshToken?: string | null) => void;
}

export interface RecoverAuthSessionOptions {
  apiClient: AuthSessionRecoveryClient;
  auth: AuthSessionRecoveryActions;
  isCancelled?: () => boolean;
}

export interface RefreshSessionAccessTokenOptions {
  apiClient: AuthSessionRecoveryClient;
  setTokens: AuthSessionRecoveryActions['setTokens'];
  isCancelled?: () => boolean;
}

function neverCancelled(): boolean {
  return false;
}

export function isAuthFailureStatus(status?: number): boolean {
  return status === 401 || status === 403;
}

export function normalizeSessionPermissions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function readSessionAccessToken(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const token = (raw as SessionRefreshResponse).access_token;
  if (typeof token !== 'string') {
    return null;
  }

  const trimmed = token.trim();
  return trimmed ? trimmed : null;
}

export async function refreshSessionAccessToken({
  apiClient,
  isCancelled = neverCancelled,
  setTokens,
}: RefreshSessionAccessTokenOptions): Promise<string | null> {
  try {
    const refreshResponse = await apiClient.post<SessionRefreshResponse>(AIOS_API_PATHS.sessionRefresh);
    if (isCancelled()) {
      return null;
    }

    const accessToken = readSessionAccessToken(refreshResponse.data);
    setTokens(accessToken, null);
    return accessToken;
  } catch {
    if (!isCancelled()) {
      setTokens(null, null);
    }
    return null;
  }
}

export function refreshSessionAccessTokenInBackground(
  options: RefreshSessionAccessTokenOptions
): void {
  void refreshSessionAccessToken(options);
}

function recoverUserSession(
  auth: AuthSessionRecoveryActions,
  response: AuthSessionRecoveryResponse<SessionMeResponse>,
  accessToken: string | null
): boolean {
  const sessionUser = response.data?.user;
  if (!sessionUser) {
    return false;
  }

  auth.login(authUserFromSession(sessionUser), normalizeSessionPermissions(response.data?.permissions), accessToken);
  return true;
}

export async function recoverAuthSession({
  apiClient,
  auth,
  isCancelled = neverCancelled,
}: RecoverAuthSessionOptions): Promise<void> {
  auth.setLoading(true);

  try {
    const meResponse = await apiClient.get<SessionMeResponse>(AIOS_API_PATHS.sessionMe);
    if (isCancelled()) {
      return;
    }

    if (recoverUserSession(auth, meResponse, null)) {
      refreshSessionAccessTokenInBackground({
        apiClient,
        isCancelled,
        setTokens: auth.setTokens,
      });
      return;
    }

    auth.logout();
    return;
  } catch (meError: unknown) {
    const meStatus = resolveClientErrorStatus(meError);
    if (!isAuthFailureStatus(meStatus)) {
      return;
    }

    try {
      const refreshResponse = await apiClient.post<SessionRefreshResponse>(AIOS_API_PATHS.sessionRefresh);
      if (isCancelled()) {
        return;
      }

      const refreshedAccessToken = readSessionAccessToken(refreshResponse.data);
      const retryMeResponse = await apiClient.get<SessionMeResponse>(AIOS_API_PATHS.sessionMe);
      if (isCancelled()) {
        return;
      }

      if (!recoverUserSession(auth, retryMeResponse, refreshedAccessToken)) {
        auth.logout();
      }
    } catch {
      if (!isCancelled()) {
        auth.logout();
      }
    }
  } finally {
    if (!isCancelled()) {
      auth.setLoading(false);
      auth.setSessionChecked(true);
    }
  }
}
