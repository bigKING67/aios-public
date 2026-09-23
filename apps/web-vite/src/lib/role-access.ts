import { isSuperAdminAccount } from './super-admin';

export type DashboardTabKey =
  | 'overview'
  | 'tmall'
  | 'douyin'
  | 'xiaohongshu'
  | 'jd'
  | 'miniProgram';

type AccessIdentity = {
  username?: string | null;
  email?: string | null;
  fullName?: string | null;
};

const DASHBOARD_TAB_ORDER: DashboardTabKey[] = [
  'overview',
  'tmall',
  'douyin',
  'xiaohongshu',
  'jd',
  'miniProgram',
];

const SUPER_ADMIN_ROLE_CODES = ['super_admin', 'super-admin', 'superadmin'];
const ADMIN_ROLE_CODES = ['admin'];
const BD_ROLE_CODES = ['bd'];
const BD_MANAGER_ROLE_CODES = ['bd_manager', 'bd-manager', 'bdmanager'];
const OPERATOR_ROLE_CODES = ['operator', 'ops'];
const DASHBOARD_VIEW_ROLE_CODES = ['dashboard_view', 'dashboard-view', 'dashboardview'];
const VIEWER_ROLE_CODES = ['viewer'];
const GUEST_ROLE_CODES = ['guest'];

const PLATFORM_ROLE_TAB_MAP: Record<string, DashboardTabKey> = {
  tmall: 'tmall',
  taobao: 'tmall',
  douyin: 'douyin',
  xhs: 'xiaohongshu',
  xiaohongshu: 'xiaohongshu',
  jd: 'jd',
  jingdong: 'jd',
  wx: 'miniProgram',
  wechat: 'miniProgram',
  weixin: 'miniProgram',
  mini_program: 'miniProgram',
  'mini-program': 'miniProgram',
  miniprogram: 'miniProgram',
};

const PLATFORM_ROLE_CODES = Object.keys(PLATFORM_ROLE_TAB_MAP);

export function normalizeRole(value?: string | null): string {
  return (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function collectNormalizedRoleSet(roles?: string[] | null): Set<string> {
  if (!Array.isArray(roles) || roles.length === 0) {
    return new Set();
  }

  return new Set(roles.map((role) => normalizeRole(role)).filter(Boolean));
}

function hasAnyRole(roleSet: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => roleSet.has(normalizeRole(candidate)));
}

export function isSuperAdminByRoleOrIdentity(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  const roleSet = collectNormalizedRoleSet(roles);
  if (hasAnyRole(roleSet, SUPER_ADMIN_ROLE_CODES)) {
    return true;
  }

  if (!identity) {
    return false;
  }

  return isSuperAdminAccount({
    username: identity.username,
    email: identity.email,
    fullName: identity.fullName,
    roles: roles || [],
  });
}

export function canAccessAdminByRole(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  if (isSuperAdminByRoleOrIdentity(roles, identity)) {
    return true;
  }

  const roleSet = collectNormalizedRoleSet(roles);
  return hasAnyRole(roleSet, ADMIN_ROLE_CODES);
}

export function canAccessDataOpsByRole(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  return isSuperAdminByRoleOrIdentity(roles, identity);
}

export function canAccessReportsByRole(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  if (isSuperAdminByRoleOrIdentity(roles, identity)) {
    return true;
  }

  const roleSet = collectNormalizedRoleSet(roles);
  return hasAnyRole(roleSet, [...ADMIN_ROLE_CODES, ...OPERATOR_ROLE_CODES]);
}

export function canAccessCreatorDashboardByRole(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  if (isSuperAdminByRoleOrIdentity(roles, identity)) {
    return true;
  }

  const roleSet = collectNormalizedRoleSet(roles);
  return hasAnyRole(roleSet, [
    ...ADMIN_ROLE_CODES,
    ...OPERATOR_ROLE_CODES,
    ...DASHBOARD_VIEW_ROLE_CODES,
    ...BD_ROLE_CODES,
    ...BD_MANAGER_ROLE_CODES,
  ]);
}

export function canWriteDashboardNotesByRole(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  if (isSuperAdminByRoleOrIdentity(roles, identity)) {
    return true;
  }

  const roleSet = collectNormalizedRoleSet(roles);
  return hasAnyRole(roleSet, [...ADMIN_ROLE_CODES, ...OPERATOR_ROLE_CODES]);
}

export function canAccessWeeklyReportsByRole(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  if (isSuperAdminByRoleOrIdentity(roles, identity)) {
    return true;
  }

  const roleSet = collectNormalizedRoleSet(roles);
  return hasAnyRole(roleSet, [
    ...ADMIN_ROLE_CODES,
    ...OPERATOR_ROLE_CODES,
    ...VIEWER_ROLE_CODES,
    ...PLATFORM_ROLE_CODES,
  ]);
}

export function canAccessExportsByRole(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  return canAccessReportsByRole(roles, identity);
}

export function canAccessCreatorLibraryByRole(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  if (isSuperAdminByRoleOrIdentity(roles, identity)) {
    return true;
  }

  const roleSet = collectNormalizedRoleSet(roles);
  return hasAnyRole(roleSet, [
    ...ADMIN_ROLE_CODES,
    ...BD_ROLE_CODES,
    ...BD_MANAGER_ROLE_CODES,
  ]);
}

export function canAccessContentAssetsByRole(
  roles?: string[] | null,
  identity?: AccessIdentity | null
): boolean {
  return canAccessCreatorLibraryByRole(roles, identity) || canAccessReportsByRole(roles, identity);
}

export function isReservedElevatedRoleCode(value?: string | null): boolean {
  const normalized = normalizeRole(value);
  if (!normalized) {
    return false;
  }

  return hasAnyRole(new Set([normalized]), [...ADMIN_ROLE_CODES, ...SUPER_ADMIN_ROLE_CODES]);
}

export function resolveAllowedDashboardTabs(options: {
  roles?: string[] | null;
  isAuthenticated: boolean;
  identity?: AccessIdentity | null;
}): DashboardTabKey[] {
  if (!options.isAuthenticated) {
    return ['overview'];
  }

  const roleSet = collectNormalizedRoleSet(options.roles);
  if (isSuperAdminByRoleOrIdentity(options.roles, options.identity)) {
    return [...DASHBOARD_TAB_ORDER];
  }

  if (
    hasAnyRole(roleSet, ADMIN_ROLE_CODES) ||
    hasAnyRole(roleSet, OPERATOR_ROLE_CODES) ||
    hasAnyRole(roleSet, DASHBOARD_VIEW_ROLE_CODES)
  ) {
    return [...DASHBOARD_TAB_ORDER];
  }

  if (hasAnyRole(roleSet, VIEWER_ROLE_CODES)) {
    return ['overview'];
  }

  if (hasAnyRole(roleSet, GUEST_ROLE_CODES)) {
    return ['overview'];
  }

  const platformTabs = new Set<DashboardTabKey>(['overview']);
  for (const role of roleSet) {
    const mappedTab = PLATFORM_ROLE_TAB_MAP[role];
    if (mappedTab) {
      platformTabs.add(mappedTab);
    }
  }

  if (platformTabs.size > 1) {
    return DASHBOARD_TAB_ORDER.filter((tab) => platformTabs.has(tab));
  }

  // 已登录账号默认按 viewer 口径开放完整看板（除非命中 guest 或平台受限角色）。
  return [...DASHBOARD_TAB_ORDER];
}

export function resolveDashboardTabKey(value?: string | null): DashboardTabKey | undefined {
  const normalized = normalizeRole(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'overview') {
    return 'overview';
  }

  return PLATFORM_ROLE_TAB_MAP[normalized];
}
