export type AuthSessionBridge = {
  getAccessToken: () => string | null;
  setAccessToken: (accessToken: string | null) => void;
  clearSession: () => void;
};

let authSessionBridge: AuthSessionBridge = {
  getAccessToken: () => null,
  setAccessToken: () => {},
  clearSession: () => {},
};

export function configureAuthSessionBridge(nextBridge: AuthSessionBridge): void {
  authSessionBridge = nextBridge;
}

export function readSessionAccessToken(): string | null {
  return authSessionBridge.getAccessToken();
}

export function writeSessionAccessToken(accessToken: string | null): void {
  authSessionBridge.setAccessToken(accessToken);
}

export function clearAuthSession(): void {
  authSessionBridge.clearSession();
}
