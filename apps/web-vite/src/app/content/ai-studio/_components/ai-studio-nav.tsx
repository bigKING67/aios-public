import { ConsoleNav, type ConsoleNavProps } from '@lobehub/ui/dashboard';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { canAccessPath } from '@/lib/auth-navigation';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { isTeamOutputOnlyByRole } from '@/lib/role-access';
import { selectUserRoles, useAuthStore } from '@/stores/auth.store';
import { AI_STUDIO_NAV_GROUPS, type AiStudioNavItem, studioLocation } from './ai-studio-nav-config';

type ConsoleNavLinkProps = Parameters<NonNullable<ConsoleNavProps['renderLink']>>[0];

/** Router links for lobe-ui's console navigation; external links keep a plain anchor. */
function renderConsoleLink({ href, children, external, ...rest }: ConsoleNavLinkProps) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} {...rest}>
      {children}
    </Link>
  );
}

function toConsoleItem(item: AiStudioNavItem) {
  return { href: item.path, label: item.label, icon: item.icon, end: item.end };
}

/**
 * Route-driven studio navigation (lobe-ui ConsoleNav). The untitled group becomes the leading
 * items; titled groups stay groups. A page without its own entry (AI 切段) reports its parent's
 * path so the parent stays active.
 */
export function AiStudioNav() {
  const { pathname, search } = useLocation();
  const activePath = studioLocation(pathname, search).item?.path ?? pathname;
  const permissions = useAuthStore((state) => state.permissions);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore(selectUserRoles);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { items, groups } = useMemo(() => {
    // Restricted entries (团队产出) follow their route policy; a group left empty disappears. An account
    // limited to 团队产出 (HR) sees that entry alone.
    const identity = { username: user?.username, email: user?.email, fullName: user?.full_name };
    const teamOutputOnly = isTeamOutputOnlyByRole(roles, identity);
    const visible = (item: AiStudioNavItem) =>
      teamOutputOnly
        ? item.path === ROUTE_PATHS.contentAiStudioTeamOutput
        : !item.restricted || canAccessPath(item.path, permissions, roles, identity, isAuthenticated);
    const [shared, ...titled] = AI_STUDIO_NAV_GROUPS;
    return {
      items: shared.items.filter(visible).map(toConsoleItem),
      groups: titled
        .map((group) => ({
          key: group.key,
          label: group.title ?? group.key,
          items: group.items.filter(visible).map(toConsoleItem),
        }))
        .filter((group) => group.items.length > 0),
    };
  }, [permissions, roles, user, isAuthenticated]);
  return (
    <ConsoleNav
      label="AI 创作中心导航"
      pathname={activePath}
      items={items}
      groups={groups}
      renderLink={renderConsoleLink}
    />
  );
}
