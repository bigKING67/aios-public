import {
  Film,
  House,
  Image,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  Scissors,
  SquarePlay,
  Tags,
  UsersRound,
} from 'lucide-react';
import { matchPath } from 'react-router-dom';
import { readAnnotationSource } from '../_lib/segment-routes';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';

export interface AiStudioNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Only match the exact path; the studio home must not stay active on child routes. */
  end?: boolean;
  /**
   * Pages without their own entry that keep this item active and extend its breadcrumb
   * (AI 切段 is reached from 原片, so it reads 原片 / AI 切段).
   */
  subpages?: { path: string; label: string }[];
  /** Shown only to accounts whose route policy opens `path` (团队产出 needs its own permission). */
  restricted?: boolean;
}

export interface AiStudioNavGroup {
  key: string;
  /** The shared entry group (首页 / 原片 / 成片) has no heading. */
  title?: string;
  items: AiStudioNavItem[];
}

// AI generation gets its own group once a real capability ships.
export const AI_STUDIO_NAV_GROUPS: AiStudioNavGroup[] = [
  {
    key: 'shared',
    items: [
      { path: ROUTE_PATHS.contentAiStudio, label: '首页', icon: House, end: true },
      {
        path: ROUTE_PATHS.contentAiStudioAssets,
        label: '原片',
        icon: Image,
        subpages: [{ path: ROUTE_PATHS.contentAiStudioAnalysis, label: 'AI 切段' }],
      },
      { path: ROUTE_PATHS.contentAiStudioOutputs, label: '成片', icon: SquarePlay },
    ],
  },
  {
    key: 'editing',
    title: 'AI 剪辑',
    items: [
      { path: ROUTE_PATHS.contentAiStudioSegments, label: '框架片段', icon: LayoutGrid },
      { path: ROUTE_PATHS.contentAiStudioSellingPoints, label: '卖点片段', icon: Tags },
      { path: ROUTE_PATHS.contentAiStudioEditing, label: 'AI 合成', icon: Scissors },
    ],
  },
  {
    key: 'competitor',
    title: '竞品爆款',
    items: [
      { path: ROUTE_PATHS.contentAiStudioCompetitor, label: '爆款分析', icon: LayoutDashboard },
      { path: ROUTE_PATHS.contentAiStudioTrends, label: '爆款视频', icon: Film },
    ],
  },
  {
    key: 'team',
    title: '团队',
    items: [{ path: ROUTE_PATHS.contentAiStudioTeamOutput, label: '团队产出', icon: UsersRound, restricted: true }],
  },
];

/** The item's subpage the pathname is on, if any. */
export function activeAiStudioSubpage(item: AiStudioNavItem, pathname: string): { path: string; label: string } | null {
  return (item.subpages ?? []).find((page) => matchPath({ path: page.path, end: false }, pathname) !== null) ?? null;
}

/** Same rule as NavLink (prefix match unless `end`), widened to the item's `subpages`. */
export function isAiStudioNavItemActive(item: AiStudioNavItem, pathname: string): boolean {
  if (matchPath({ path: item.path, end: item.end ?? false }, pathname)) return true;
  return activeAiStudioSubpage(item, pathname) !== null;
}

/** The nav item a page belongs to, so pages without an entry still light up their parent. */
export function activeAiStudioNavItem(pathname: string): AiStudioNavItem | null {
  for (const group of AI_STUDIO_NAV_GROUPS) {
    const item = group.items.find((candidate) => isAiStudioNavItemActive(candidate, pathname));
    if (item) return item;
  }
  return null;
}

export interface StudioCrumb {
  label: string;
  href?: string;
  /** The group name: dropped on narrow screens, where the page title repeats it. */
  optional?: boolean;
}

/**
 * Where the reader is: the nav item to light and the breadcrumb trail. An annotation of one original
 * (`?assetId=` on a segment library) reads from where it was opened — 原片 / 标注片段 or
 * 原片 / AI 切段 / 标注片段 lighting 原片, else 框架片段 / 标注片段 under its library.
 */
export function studioLocation(pathname: string, search: string): { item: AiStudioNavItem | null; crumbs: StudioCrumb[] } {
  const params = new URLSearchParams(search);
  const library = pathname === ROUTE_PATHS.contentAiStudioSegments || pathname === ROUTE_PATHS.contentAiStudioSellingPoints;
  const from = library && params.has('assetId') ? readAnnotationSource(params) : null;
  const assets = AI_STUDIO_NAV_GROUPS.flatMap((group) => group.items).find((entry) => entry.path === ROUTE_PATHS.contentAiStudioAssets) ?? null;
  if (from && assets) {
    const crumbs: StudioCrumb[] = [{ label: assets.label, href: assets.path }];
    if (from === 'analysis') crumbs.push({ label: 'AI 切段', href: ROUTE_PATHS.contentAiStudioAnalysis });
    return { item: assets, crumbs: [...crumbs, { label: '标注片段' }] };
  }
  const item = activeAiStudioNavItem(pathname);
  if (!item) return { item: null, crumbs: [] };
  const group = AI_STUDIO_NAV_GROUPS.find((candidate) => candidate.items.includes(item));
  const head: StudioCrumb[] = group?.title ? [{ label: group.title, optional: true }] : [];
  if (library && params.has('assetId')) return { item, crumbs: [...head, { label: item.label, href: item.path }, { label: '标注片段' }] };
  const subpage = activeAiStudioSubpage(item, pathname);
  return {
    item,
    crumbs: subpage ? [...head, { label: item.label, href: item.path }, { label: subpage.label }] : [...head, { label: item.label }],
  };
}
