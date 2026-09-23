import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { MenuProps } from 'antd';
import {
  BranchesOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  DownloadOutlined,
  FileImageOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HomeOutlined,
  InboxOutlined,
  PlaySquareOutlined,
  QuestionCircleOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { canAccessPath } from '@/lib/auth-navigation';
import { findRoutePolicyEntry, normalizeRoutePolicyPath, ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { User } from '@/stores/auth.store';

export type LayoutMenuItems = NonNullable<MenuProps['items']>;
type LayoutMenuItem = NonNullable<LayoutMenuItems[number]>;

export interface BuildLayoutMenuItemsParams {
  pathname: string;
  permissions: string[];
  roles: string[];
  user: User | null;
  isAuthenticated: boolean;
}

export function collectRouteKeys(items: LayoutMenuItems): string[] {
  const keys: string[] = [];

  for (const item of items) {
    if (!item) {
      continue;
    }

    if ('key' in item) {
      const key = String(item.key);
      if (key.startsWith('/')) {
        keys.push(key);
      }
    }

    if ('children' in item && Array.isArray(item.children)) {
      keys.push(...collectRouteKeys(item.children as LayoutMenuItems));
    }
  }

  return keys;
}

export function buildLoginRedirectHref(targetPath: string): string {
  return `${ROUTE_PATHS.login}?redirect=${encodeURIComponent(targetPath)}`;
}

export function buildLayoutMenuItems({
  isAuthenticated,
  pathname,
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
  const currentRoutePolicyEntry = findRoutePolicyEntry(pathname);
  const currentLayoutMenuPath =
    currentRoutePolicyEntry && 'layoutMenuPath' in currentRoutePolicyEntry && currentRoutePolicyEntry.layoutMenuPath
      ? currentRoutePolicyEntry.layoutMenuPath
      : (currentRoutePolicyEntry?.path ?? pathname);
  const normalizedCurrentMenuPath = normalizeRoutePolicyPath(currentLayoutMenuPath);
  const isCurrentRoute = (path: string) => normalizeRoutePolicyPath(path) === normalizedCurrentMenuPath;
  const submenuLinkClassName = 'header-nav-submenu-link';
  const submenuItemClassName = (path: string) =>
    isCurrentRoute(path) ? 'header-nav-submenu-item is-current' : 'header-nav-submenu-item';
  const renderCurrentBadge = (path: string) =>
    isCurrentRoute(path) ? <span className="header-nav-submenu-current-badge">当前</span> : null;
  const createSubmenuLinkItem = (
    path: string,
    text: string,
    icon?: ReactNode,
    options?: { openInNewTab?: boolean },
  ): LayoutMenuItem => ({
    key: path,
    className: submenuItemClassName(path),
    ...(icon ? { icon } : {}),
    label: (
      <Link
        className={submenuLinkClassName}
        to={path}
        {...(options?.openInNewTab
          ? {
              rel: 'noopener noreferrer',
              target: '_blank',
              title: `在新标签页打开${text}`,
            }
          : {})}
      >
        <span className="header-nav-submenu-link-text">{text}</span>
        {renderCurrentBadge(path)}
      </Link>
    ),
  });
  const createTopLevelLinkItem = (path: string, text: string, icon: ReactNode): LayoutMenuItem => ({
    key: path,
    icon,
    label: <Link to={path}>{text}</Link>,
  });
  const items: LayoutMenuItems = [createTopLevelLinkItem(ROUTE_PATHS.home, '首页', <HomeOutlined />)];
  const dashboardChildren: LayoutMenuItems = [];
  if (canAccess(ROUTE_PATHS.dashboard)) {
    dashboardChildren.push(createSubmenuLinkItem(ROUTE_PATHS.dashboard, '经营看板'));
  }
  if (canAccess(ROUTE_PATHS.dashboardCreator)) {
    dashboardChildren.push(createSubmenuLinkItem(ROUTE_PATHS.dashboardCreator, '带货达人看板'));
  }
  if (canAccess(ROUTE_PATHS.dashboardIndustryMaterialInspiration)) {
    dashboardChildren.push(createSubmenuLinkItem(ROUTE_PATHS.dashboardIndustryMaterialInspiration, '行业素材灵感'));
  }

  const reportChildren: LayoutMenuItems = [];

  if (dashboardChildren.length > 0) {
    items.push({
      key: 'dashboard',
      icon: <DesktopOutlined />,
      label: '看板',
      children: dashboardChildren,
    });
  }

  const canAccessWeeklyReport = canAccess(ROUTE_PATHS.reportsWeekly);
  const canAccessMonthlyReport = canAccess(ROUTE_PATHS.reportsMonthly);

  if (canAccessWeeklyReport) {
    reportChildren.push(createSubmenuLinkItem(ROUTE_PATHS.reportsWeekly, '周报'));
  }
  if (canAccessMonthlyReport) {
    reportChildren.push(createSubmenuLinkItem(ROUTE_PATHS.reportsMonthly, '月报'));
  }

  if (reportChildren.length > 0) {
    items.push({
      key: 'reports',
      icon: <FileTextOutlined />,
      label: '报告',
      children: reportChildren,
    });
  } else if (!isAuthenticated) {
    items.push({
      key: ROUTE_PATHS.reportsWeekly,
      icon: <FileTextOutlined />,
      label: <Link to={buildLoginRedirectHref(ROUTE_PATHS.reportsWeekly)}>报告</Link>,
    });
  }

  if (canAccess(ROUTE_PATHS.opsDataops)) {
    items.push({
      key: ROUTE_PATHS.opsDataops,
      icon: <DatabaseOutlined />,
      label: <Link to={ROUTE_PATHS.opsDataops}>数据运维</Link>,
    });
  }

  const contentChildren: LayoutMenuItems = [];
  const canAccessContentAssets = canAccess(ROUTE_PATHS.marketingContentAssets);
  const canAccessLiveCenter = canAccess(ROUTE_PATHS.contentLiveCenter);

  if (canAccessContentAssets) {
    contentChildren.push(
      createSubmenuLinkItem(
        ROUTE_PATHS.marketingContentAssets,
        '素材库',
        <FileImageOutlined className="header-nav-submenu-icon" />,
        { openInNewTab: true },
      ),
    );
  }
  if (canAccessLiveCenter) {
    contentChildren.push(
      createSubmenuLinkItem(
        ROUTE_PATHS.contentLiveCenter,
        '直播中台',
        <VideoCameraOutlined className="header-nav-submenu-icon" />,
        { openInNewTab: true },
      ),
    );
  }

  if (contentChildren.length > 0) {
    items.push({
      key: 'content',
      icon: <PlaySquareOutlined className="header-nav-context-icon" />,
      label: '内容中台',
      children: contentChildren,
    });
  }

  const marketingChildren: LayoutMenuItems = [];

  if (canAccess(ROUTE_PATHS.marketingCreatorLibrary)) {
    marketingChildren.push(createSubmenuLinkItem(ROUTE_PATHS.marketingCreatorLibrary, '达人库'));
  }
  if (canAccess(ROUTE_PATHS.marketingIndustryNews)) {
    marketingChildren.push(createSubmenuLinkItem(ROUTE_PATHS.marketingIndustryNews, '行业资讯'));
  }

  if (marketingChildren.length > 0) {
    const marketingLandingPath = canAccess(ROUTE_PATHS.marketing) ? ROUTE_PATHS.marketing : undefined;
    items.push({
      key: marketingLandingPath ?? 'marketing',
      icon: <BranchesOutlined />,
      label: marketingLandingPath ? <Link to={marketingLandingPath}>营销</Link> : '营销',
      children: marketingChildren,
    });
  }

  if (canAccess(ROUTE_PATHS.sampleInventory)) {
    items.push({
      key: ROUTE_PATHS.sampleInventory,
      icon: <InboxOutlined />,
      label: <Link to={ROUTE_PATHS.sampleInventory}>样品库存</Link>,
    });
  }

  const docsChildren: LayoutMenuItems = [];

  if (canAccess(ROUTE_PATHS.docsGuide)) {
    docsChildren.push(createSubmenuLinkItem(ROUTE_PATHS.docsGuide, '使用指南'));
  }
  if (canAccess(ROUTE_PATHS.docsAnalysisFrameworks)) {
    docsChildren.push(createSubmenuLinkItem(ROUTE_PATHS.docsAnalysisFrameworks, '分析框架'));
  }
  if (canAccess(ROUTE_PATHS.docsAnalysisPlans)) {
    docsChildren.push(createSubmenuLinkItem(ROUTE_PATHS.docsAnalysisPlans, '分析方案'));
  }
  if (canAccess(ROUTE_PATHS.docsReferences)) {
    docsChildren.push(createSubmenuLinkItem(ROUTE_PATHS.docsReferences, '参考资料'));
  }

  if (docsChildren.length > 0) {
    items.push({
      key: ROUTE_PATHS.docs,
      icon: <QuestionCircleOutlined />,
      label: <Link to={ROUTE_PATHS.docs}>文档</Link>,
      children: docsChildren,
    });
  }

  if (canAccess(ROUTE_PATHS.exports)) {
    items.push({
      key: ROUTE_PATHS.exports,
      icon: <DownloadOutlined />,
      label: <Link to={ROUTE_PATHS.exports}>导出</Link>,
    });
  }

  const adminChildren: LayoutMenuItems = [];
  if (canAccess(ROUTE_PATHS.adminUsers)) {
    adminChildren.push(createSubmenuLinkItem(ROUTE_PATHS.adminUsers, '用户管理', <TeamOutlined />));
  }
  if (canAccess(ROUTE_PATHS.adminRoles)) {
    adminChildren.push(createSubmenuLinkItem(ROUTE_PATHS.adminRoles, '角色管理', <SafetyOutlined />));
  }
  if (canAccess(ROUTE_PATHS.adminPermissions)) {
    adminChildren.push(createSubmenuLinkItem(ROUTE_PATHS.adminPermissions, '权限管理', <SafetyOutlined />));
  }
  if (canAccess(ROUTE_PATHS.adminAuditLogs)) {
    adminChildren.push(createSubmenuLinkItem(ROUTE_PATHS.adminAuditLogs, '审计日志', <FileSearchOutlined />));
  }

  if (adminChildren.length > 0) {
    items.push({
      key: 'admin',
      icon: <SettingOutlined />,
      label: '管理',
      children: adminChildren,
    });
  }

  return items;
}
