import { useMemo } from 'react';
import { canWriteDashboardNotesByRole, resolveAllowedDashboardTabs } from '@/lib/role-access';
import type { User } from '@/stores/auth.store';
import type { PlatformTabKey } from './dashboard-config';

type DashboardAccessStateArgs = {
  user: User | null;
  isAuthenticated: boolean;
};

export function useDashboardAccessState({
  user,
  isAuthenticated,
}: DashboardAccessStateArgs) {
  return useMemo(() => {
    const roles = user?.roles || [];
    const identity = {
      username: user?.username,
      email: user?.email,
      fullName: user?.full_name,
    };

    return {
      allowedTabs: resolveAllowedDashboardTabs({
        roles,
        isAuthenticated,
        identity,
      }) as PlatformTabKey[],
      canWriteDailyNoteByRole: canWriteDashboardNotesByRole(roles, identity),
    };
  }, [isAuthenticated, user?.email, user?.full_name, user?.roles, user?.username]);
}
