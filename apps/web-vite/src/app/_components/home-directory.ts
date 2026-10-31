import type { LucideIcon } from 'lucide-react';
import type { LayoutMenuItems, LayoutNavLink } from '@/components/organisms/layout-navigation-model';
import type { ModuleDataStatus } from '@/lib/module-profile';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';

export interface HomeModule {
  key: string;
  href: string;
  label: string;
  summary: string;
  icon?: LucideIcon;
  status: ModuleDataStatus;
}

export interface HomeDomain {
  key: string;
  label: string;
  modules: HomeModule[];
}

/** Business domains AIOS will add; named on the home without links until they exist. */
export const UPCOMING_DOMAINS = ['产品', '人力', '财务'] as const;

// System settings live under 更多 in the top bar, not in the business directory.
const EXCLUDED_GROUPS = new Set(['admin']);
const MORE_DOMAIN = { key: 'more', label: '更多' };

/**
 * The home's module directory from the same permission-filtered navigation as the top bar: one
 * domain per menu group, standalone links under 更多, and only links that carry a `summary`.
 * Business domains with an open module come first, the menu order holding otherwise; 更多 and
 * then 文档 (reference, not a business domain) close the list.
 */
export function buildHomeDirectory(items: LayoutMenuItems, statusOf: (path: string) => ModuleDataStatus): HomeDomain[] {
  const toModule = (link: LayoutNavLink): HomeModule[] =>
    link.summary
      ? [{ key: link.key, href: link.href, label: link.label, summary: link.summary, icon: link.icon, status: statusOf(link.key) }]
      : [];
  const domains: HomeDomain[] = [];
  const more: HomeModule[] = [];
  for (const item of items) {
    if (item.kind === 'link') {
      if (item.key !== ROUTE_PATHS.home) more.push(...toModule(item));
    } else if (!EXCLUDED_GROUPS.has(item.key)) {
      domains.push({ key: item.key, label: item.label, modules: item.links.flatMap(toModule) });
    }
  }
  const docs = domains.filter((domain) => domain.key === ROUTE_PATHS.docs);
  const business = domains.filter((domain) => domain.key !== ROUTE_PATHS.docs && domain.modules.length > 0);
  const live = (domain: HomeDomain) => domain.modules.some((module) => module.status === 'open');
  return [
    ...business.filter(live),
    ...business.filter((domain) => !live(domain)),
    { ...MORE_DOMAIN, modules: more },
    ...docs,
  ].filter((domain) => domain.modules.length > 0);
}
