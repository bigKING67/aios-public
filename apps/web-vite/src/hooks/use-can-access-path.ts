import { useMemo } from 'react';
import { canAccessPath } from '@/lib/auth-navigation';
import { selectUserRoles, useAuthStore } from '@/stores/auth.store';

/**
 * Whether the signed-in account may open a route, by the same route policy ProtectedRoute and the
 * global navigation use. For links into another module, so a page never offers a door it cannot open.
 */
export function useCanAccessPath(path: string): boolean {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const roles = useAuthStore(selectUserRoles);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useMemo(
    () =>
      canAccessPath(
        path,
        permissions,
        roles,
        user ? { username: user.username, email: user.email, fullName: user.full_name } : null,
        isAuthenticated,
      ),
    [isAuthenticated, path, permissions, roles, user],
  );
}
