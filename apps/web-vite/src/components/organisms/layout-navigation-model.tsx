import type { LucideIcon } from 'lucide-react';
import {
  BookMarked,
  BookOpen,
  CalendarDays,
  CalendarRange,
  CircleHelp,
  ClipboardList,
  Contact,
  Database,
  Download,
  FileSearch,
  FileText,
  GitBranch,
  House,
  ImageIcon,
  Inbox,
  Layers,
  LayoutDashboard,
  Library,
  Megaphone,
  Monitor,
  Newspaper,
  Presentation,
  Settings,
  ShieldCheck,
  Sparkles,
  SquarePlay,
  UserCheck,
  UserRound,
  Users,
  VideoIcon,
} from 'lucide-react';
import { canAccessPath } from '@/lib/auth-navigation';
import { moduleProfileServesHomePage } from '@/lib/module-profile';
import { findRoutePolicyEntry, normalizeRoutePolicyPath, ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { User } from '@/stores/auth.store';
import { resolveSelectedMenuKey } from './layout-route-selection';

/** One destination in the console sidebar. `key` is the route it stands for; `href` is where it goes. */
export interface LayoutNavLink {
  kind: 'link';
  key: string;
  href: string;
  label: string;
  icon?: LucideIcon;
  openInNewTab?: boolean;
  /** One line for the AIOS home's module directory; a link without one stays off the home. */
  summary?: string;
}

/** A titled sidebar group; `key` is its landing route when it has one. */
export interface LayoutNavGroup {
  kind: 'group';
  key: string;
  label: string;
  icon?: LucideIcon;
  links: LayoutNavLink[];
}

export type LayoutNavEntry = LayoutNavLink | LayoutNavGroup;
export type LayoutMenuItems = LayoutNavEntry[];

export interface BuildLayoutMenuItemsParams {
  pathname: string;
  permissions: string[];
  roles: string[];
  user: User | null;
  isAuthenticated: boolean;
}

/** Route keys of every link, for resolving the active entry. */
export function collectRouteKeys(items: LayoutMenuItems): string[] {
  return items.flatMap((item) => (item.kind === 'link' ? [item.key] : item.links.map((link) => link.key)))
    .filter((key) => key.startsWith('/'));
}

/** The menu path the current page belongs to (`layoutMenuPath` maps detail routes to their entry). */
export function resolveLayoutMenuPath(pathname: string): string {
  const entry = findRoutePolicyEntry(pathname);
  const menuPath = entry && 'layoutMenuPath' in entry && entry.layoutMenuPath ? entry.layoutMenuPath : (entry?.path ?? pathname);
  return normalizeRoutePolicyPath(menuPath);
}

/** Global destinations belong in the header. A sidebar contains only the
 * current module's permitted destinations; standalone pages need no sidebar. */
export function resolveModuleNavigation(items: LayoutMenuItems, pathname: string): LayoutNavGroup | undefined {
  const activePath = resolveSelectedMenuKey(resolveLayoutMenuPath(pathname), collectRouteKeys(items));
  return items.find((item): item is LayoutNavGroup =>
    item.kind === 'group' && item.links.some((link) => link.key === activePath));
}

export function buildLoginRedirectHref(targetPath: string): string {
  return `${ROUTE_PATHS.login}?redirect=${encodeURIComponent(targetPath)}`;
}

export function buildLayoutMenuItems({
  isAuthenticated,
  permissions,
  roles,
  user,
}: BuildLayoutMenuItemsParams): LayoutMenuItems {
  const routeAccessIdentity = user
    ? {
        username: user.username,
        email: user.email,
        fullName: user.full_name,
      }
    : undefined;
  const canAccess = (path: string) => canAccessPath(path, permissions, roles, routeAccessIdentity, isAuthenticated);
  const link = (path: string, label: string, icon?: LucideIcon, options?: { openInNewTab?: boolean; summary?: string }): LayoutNavLink => ({
    kind: 'link',
    key: path,
    href: path,
    label,
    ...(icon ? { icon } : {}),
    ...(options?.openInNewTab ? { openInNewTab: true } : {}),
    ...(options?.summary ? { summary: options.summary } : {}),
  });
  const group = (key: string, label: string, icon: LucideIcon, links: LayoutNavLink[]): LayoutNavGroup => ({
    kind: 'group',
    key,
    label,
    icon,
    links,
  });

  const items: LayoutMenuItems = moduleProfileServesHomePage() ? [link(ROUTE_PATHS.home, '首页', House)] : [];

  const dashboardChildren: LayoutNavLink[] = [];
  if (canAccess(ROUTE_PATHS.dashboard)) dashboardChildren.push(link(ROUTE_PATHS.dashboard, '经营看板', LayoutDashboard, { summary: '店铺与平台的经营指标总览' }));
  if (canAccess(ROUTE_PATHS.dashboardCreator)) dashboardChildren.push(link(ROUTE_PATHS.dashboardCreator, '带货达人看板', UserRound, { summary: '达人直播与短视频的带货表现' }));
  if (dashboardChildren.length > 0) items.push(group('dashboard', '看板', Monitor, dashboardChildren));

  const reportChildren: LayoutNavLink[] = [];
  if (canAccess(ROUTE_PATHS.reportsWeekly)) reportChildren.push(link(ROUTE_PATHS.reportsWeekly, '周报', CalendarDays, { summary: '每周经营复盘' }));
  if (canAccess(ROUTE_PATHS.reportsMonthly)) reportChildren.push(link(ROUTE_PATHS.reportsMonthly, '月报', CalendarRange, { summary: '每月经营复盘' }));
  if (canAccess(ROUTE_PATHS.reportsSpecial)) reportChildren.push(link(ROUTE_PATHS.reportsSpecial, '专题报告', Presentation, { summary: '专项分析与经营诊断' }));
  if (reportChildren.length > 0) {
    items.push(group('reports', '报告', FileText, reportChildren));
  } else if (!isAuthenticated) {
    items.push({ ...link(ROUTE_PATHS.reportsWeekly, '报告', FileText), href: buildLoginRedirectHref(ROUTE_PATHS.reportsWeekly) });
  }

  if (canAccess(ROUTE_PATHS.opsDataops)) items.push(link(ROUTE_PATHS.opsDataops, '数据运维', Database, { summary: '数据管道运行与告警' }));

  // Content workbenches open in their own tab, like the hub always did.
  const contentChildren: LayoutNavLink[] = [];
  if (canAccess(ROUTE_PATHS.marketingContentAssets)) {
    contentChildren.push(link(ROUTE_PATHS.marketingContentAssets, '素材库', ImageIcon, { openInNewTab: true, summary: '素材的统一存放、检索与分析' }));
  }
  if (canAccess(ROUTE_PATHS.contentAiStudio)) {
    contentChildren.push(link(ROUTE_PATHS.contentAiStudio, 'AI 创作中心', Sparkles, { openInNewTab: true, summary: '原片拆解、AI 剪辑与成片审核' }));
  }
  if (canAccess(ROUTE_PATHS.contentLiveCenter)) {
    contentChildren.push(link(ROUTE_PATHS.contentLiveCenter, '直播中台', VideoIcon, { openInNewTab: true, summary: '直播录屏、切片与复盘' }));
  }
  if (contentChildren.length > 0) items.push(group('content', '内容中台', SquarePlay, contentChildren));

  const marketingChildren: LayoutNavLink[] = [];
  if (canAccess(ROUTE_PATHS.marketingCreatorLibrary)) marketingChildren.push(link(ROUTE_PATHS.marketingCreatorLibrary, '达人库', Contact, { summary: '达人资料与合作跟进' }));
  if (canAccess(ROUTE_PATHS.marketingIndustryNews)) marketingChildren.push(link(ROUTE_PATHS.marketingIndustryNews, '行业资讯', Newspaper, { summary: '行业与竞品动态' }));
  if (marketingChildren.length > 0) {
    const landing = canAccess(ROUTE_PATHS.marketing);
    items.push(group(
      landing ? ROUTE_PATHS.marketing : 'marketing',
      '营销',
      GitBranch,
      landing ? [link(ROUTE_PATHS.marketing, '营销总览', Megaphone), ...marketingChildren] : marketingChildren,
    ));
  }

  if (canAccess(ROUTE_PATHS.sampleInventory)) items.push(link(ROUTE_PATHS.sampleInventory, '样品库存', Inbox, { summary: '样品出入库与库存' }));

  const docsChildren: LayoutNavLink[] = [];
  if (canAccess(ROUTE_PATHS.docsGuide)) docsChildren.push(link(ROUTE_PATHS.docsGuide, '使用指南', BookMarked));
  if (canAccess(ROUTE_PATHS.docsAnalysisFrameworks)) docsChildren.push(link(ROUTE_PATHS.docsAnalysisFrameworks, '分析框架', Layers));
  if (canAccess(ROUTE_PATHS.docsAnalysisPlans)) docsChildren.push(link(ROUTE_PATHS.docsAnalysisPlans, '分析方案', ClipboardList));
  if (canAccess(ROUTE_PATHS.docsReferences)) docsChildren.push(link(ROUTE_PATHS.docsReferences, '参考资料', Library));
  if (docsChildren.length > 0) {
    items.push(group(ROUTE_PATHS.docs, '文档', CircleHelp, [link(ROUTE_PATHS.docs, '文档首页', BookOpen, { summary: '使用指南、分析框架与参考资料' }), ...docsChildren]));
  }

  if (canAccess(ROUTE_PATHS.exports)) items.push(link(ROUTE_PATHS.exports, '导出', Download));

  const adminChildren: LayoutNavLink[] = [];
  if (canAccess(ROUTE_PATHS.adminUsers)) adminChildren.push(link(ROUTE_PATHS.adminUsers, '用户管理', Users));
  if (canAccess(ROUTE_PATHS.adminRoles)) adminChildren.push(link(ROUTE_PATHS.adminRoles, '角色管理', ShieldCheck));
  if (canAccess(ROUTE_PATHS.adminPermissions)) adminChildren.push(link(ROUTE_PATHS.adminPermissions, '权限管理', ShieldCheck));
  if (canAccess(ROUTE_PATHS.adminAuditLogs)) adminChildren.push(link(ROUTE_PATHS.adminAuditLogs, '审计日志', FileSearch));
  if (canAccess(ROUTE_PATHS.adminRecruiting)) adminChildren.push(link(ROUTE_PATHS.adminRecruiting, '招聘测评', UserCheck));
  if (adminChildren.length > 0) items.push(group('admin', '管理', Settings, adminChildren));

  return items;
}
