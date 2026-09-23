export interface AuthRefreshFailureLike {
  code: string;
  statusCode: number;
}

export function shouldForceLogoutAfterRefreshFailure(error: AuthRefreshFailureLike): boolean {
  return (
    error.statusCode === 401 ||
    error.statusCode === 403 ||
    error.code === 'UNAUTHORIZED' ||
    error.code.startsWith('AUTH_REFRESH_')
  );
}
