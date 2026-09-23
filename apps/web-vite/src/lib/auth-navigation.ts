/**
 * 认证跳转策略：
 * 1. 校验目标页面是否可访问
 * 2. 若不可访问，则按优先级回退到首屏可访问页
 */

import {
  DATAOPS_READ_PERMISSIONS,
} from './dataops-permissions';
import {
  CONTENT_ASSET_WRITE_PERMISSIONS,
  CREATOR_LIBRARY_READ_PERMISSIONS,
  MARKETING_WORKSPACE_READ_PERMISSIONS,
  REPORT_EXPORT_PERMISSIONS,
  REPORT_READ_PERMISSIONS,
} from './report-permissions';
import {
  hasAnyPermissionCode,
  hasElevatedPermissionAccess,
  type PermissionAccessContext,
} from './permission-access';
import {
  ADMIN_READ_PERMISSIONS,
} from './permissions';
import {
  canAccessAdminByRole,
  canAccessCreatorLibraryByRole,
  canAccessCreatorDashboardByRole,
  canAccessDataOpsByRole,
  canAccessExportsByRole,
  canAccessWeeklyReportsByRole,
} from './role-access';
import {
  AUTH_NAVIGATION_POLICY_PATHS,
  ROUTE_PATHS,
  findRoutePolicyEntry,
  normalizeRoutePolicyPath,
  type RoutePolicyEntry,
} from './route-policy-registry';
import { frontendEnv } from './frontend-env';

type RouteAccessIdentity = {
  username?: string | null;
  email?: string | null;
  fullName?: string | null;
};

export const AUTH_NAVIGATION_FALLBACK_PATHS = [
  ROUTE_PATHS.marketingCreatorLibrary,
  ROUTE_PATHS.dashboard,
  ROUTE_PATHS.reportsWeekly,
  ROUTE_PATHS.home,
] as const;

function normalizePathWithQuery(path?: string): string {
  if (!path) {
    return ROUTE_PATHS.home;
  }

  const normalized = path.trim();
  if (!normalized) {
    return ROUTE_PATHS.home;
  }

  const lower = normalized.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('//') ||
    lower.startsWith('javascript:')
  ) {
    return ROUTE_PATHS.home;
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function createPermissionAccessContext(
  permissions: string[],
  roles: string[],
  identity?: RouteAccessIdentity | null,
): PermissionAccessContext {
  return {
    permissions,
    roles,
    identity: {
      username: identity?.username,
      email: identity?.email,
      fullName: identity?.fullName,
      roles,
    },
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled route policy kind: ${String(value)}`);
}

function canAccessPolicyEntry(
  policyEntry: RoutePolicyEntry | undefined,
  options: {
    isAuthenticated: boolean;
    permissionContext: PermissionAccessContext;
    roles: string[];
    identity?: RouteAccessIdentity | null;
  }
): boolean {
  if (!policyEntry) {
    return false;
  }

  switch (policyEntry.kind) {
    case 'public':
      return true;
    case 'authenticated':
      return options.isAuthenticated;
    case 'creator_dashboard':
      return options.isAuthenticated && (
        canAccessCreatorDashboardByRole(options.roles, options.identity) ||
        hasElevatedPermissionAccess(options.permissionContext)
      );
    case 'admin':
      return options.isAuthenticated && (
        canAccessAdminByRole(options.roles, options.identity) ||
        hasAnyPermissionCode(options.permissionContext, ADMIN_READ_PERMISSIONS)
      );
    case 'dataops':
      return options.isAuthenticated && (
        canAccessDataOpsByRole(options.roles, options.identity) ||
        hasAnyPermissionCode(options.permissionContext, DATAOPS_READ_PERMISSIONS)
      );
    case 'report_read':
      return options.isAuthenticated && (
        canAccessWeeklyReportsByRole(options.roles, options.identity) ||
        hasAnyPermissionCode(options.permissionContext, REPORT_READ_PERMISSIONS)
      );
    case 'report_export':
      return options.isAuthenticated && (
        canAccessExportsByRole(options.roles, options.identity) ||
        hasAnyPermissionCode(options.permissionContext, REPORT_EXPORT_PERMISSIONS)
      );
    case 'sample_inventory':
      return frontendEnv.sampleInventoryAccessMode === 'public' || options.isAuthenticated;
    case 'marketing_workspace':
      return options.isAuthenticated && (
        canAccessCreatorLibraryByRole(options.roles, options.identity) ||
        canAccessExportsByRole(options.roles, options.identity) ||
        hasAnyPermissionCode(options.permissionContext, MARKETING_WORKSPACE_READ_PERMISSIONS)
      );
    case 'creator_library':
      return options.isAuthenticated && (
        canAccessCreatorLibraryByRole(options.roles, options.identity) ||
        hasAnyPermissionCode(options.permissionContext, CREATOR_LIBRARY_READ_PERMISSIONS)
      );
    case 'content_assets':
      return options.isAuthenticated;
    case 'content_assets_write':
      return options.isAuthenticated && hasAnyPermissionCode(
        options.permissionContext,
        CONTENT_ASSET_WRITE_PERMISSIONS
      );
    default:
      return assertNever(policyEntry);
  }
}

export function canAccessPath(
  path: string,
  permissions: string[],
  roles: string[] = [],
  identity?: RouteAccessIdentity | null,
  isAuthenticated = false
): boolean {
  const pathname = normalizeRoutePolicyPath(path);
  const permissionContext = createPermissionAccessContext(permissions, roles, identity);
  return canAccessPolicyEntry(findRoutePolicyEntry(pathname), {
    identity,
    isAuthenticated,
    permissionContext,
    roles,
  });
}

export const AUTH_NAVIGATION_ACCESS_POLICY_PATHS = AUTH_NAVIGATION_POLICY_PATHS;

export function resolveSafeEntryPath(
  preferredPath: string | undefined,
  permissions: string[],
  roles: string[] = [],
  identity?: RouteAccessIdentity | null,
  isAuthenticated = false
): string {
  if (preferredPath) {
    const preferredWithQuery = normalizePathWithQuery(preferredPath);
    const preferredPathname = normalizeRoutePolicyPath(preferredWithQuery);
    if (canAccessPath(preferredPathname, permissions, roles, identity, isAuthenticated)) {
      return preferredWithQuery;
    }
  }

  for (const fallbackPath of AUTH_NAVIGATION_FALLBACK_PATHS) {
    if (canAccessPath(fallbackPath, permissions, roles, identity, isAuthenticated)) {
      return fallbackPath;
    }
  }

  return ROUTE_PATHS.home;
}
