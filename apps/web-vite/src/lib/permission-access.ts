import { hasAdminRole, isSuperAdminAccount } from './super-admin';

export type PermissionAccessMode = 'all' | 'any';

export type PermissionAccessIdentity = {
  username?: string | null;
  email?: string | null;
  fullName?: string | null;
  roles?: readonly string[] | null;
};

export type PermissionAccessContext = {
  permissions?: readonly string[] | null;
  roles?: readonly string[] | null;
  identity?: PermissionAccessIdentity | null;
};

function normalizeStringArray(values?: readonly string[] | null): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  return values.filter((value): value is string => typeof value === 'string');
}

function normalizeRoleCode(role: string): string {
  return role.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function collectCreatorLibraryRoleFlags(roles?: readonly string[] | null): {
  hasBd: boolean;
  hasBdManager: boolean;
} {
  const roleSet = new Set(normalizeStringArray(roles).map(normalizeRoleCode));
  return {
    hasBd: roleSet.has('bd'),
    hasBdManager:
      roleSet.has('bd_manager') || roleSet.has('bd-manager') || roleSet.has('bdmanager'),
  };
}

function collectContentAssetRoleFlags(roles?: readonly string[] | null): {
  hasContentOps: boolean;
  hasContentOpsManager: boolean;
} {
  const roleSet = new Set(normalizeStringArray(roles).map(normalizeRoleCode));
  return {
    hasContentOps: roleSet.has('content_ops') || roleSet.has('content-ops'),
    hasContentOpsManager:
      roleSet.has('content_ops_manager') ||
      roleSet.has('content-ops-manager') ||
      roleSet.has('contentopsmanager'),
  };
}

function isCreatorLibraryPermission(code: string): boolean {
  return code.startsWith('marketing:creator_library:');
}

function isContentAssetPermission(code: string): boolean {
  return code.startsWith('marketing:content_assets:');
}

function hasCreatorLibraryRolePermission(
  roles: readonly string[] | null | undefined,
  requiredCode: string
): boolean {
  if (!isCreatorLibraryPermission(requiredCode)) {
    return false;
  }
  const { hasBd, hasBdManager } = collectCreatorLibraryRoleFlags(roles);
  if (hasBdManager) {
    return true;
  }
  return (
    hasBd &&
    (requiredCode === 'marketing:creator_library:read' ||
      requiredCode === 'marketing:creator_library:write')
  );
}

function hasContentAssetRolePermission(
  roles: readonly string[] | null | undefined,
  requiredCode: string
): boolean {
  if (!isContentAssetPermission(requiredCode)) {
    return false;
  }
  const { hasContentOps, hasContentOpsManager } = collectContentAssetRoleFlags(roles);
  if (hasContentOpsManager) {
    return true;
  }
  return (
    hasContentOps &&
    (requiredCode === 'marketing:content_assets:read' ||
      requiredCode === 'marketing:content_assets:write')
  );
}

function hasMarketingRolePermission(
  roles: readonly string[] | null | undefined,
  requiredCode: string
): boolean {
  if (isCreatorLibraryPermission(requiredCode)) {
    return hasCreatorLibraryRolePermission(roles, requiredCode);
  }
  if (isContentAssetPermission(requiredCode)) {
    return hasContentAssetRolePermission(roles, requiredCode);
  }
  return false;
}

function normalizeRequiredCodes(codes: readonly string[]): string[] {
  return codes.filter((code): code is string => typeof code === 'string');
}

function hasInvalidRequiredCode(codes: readonly string[]): boolean {
  return codes.some((code) => typeof code !== 'string' || code.length === 0);
}

function collectContextRoles(context: PermissionAccessContext): string[] {
  return [
    ...normalizeStringArray(context.roles),
    ...normalizeStringArray(context.identity?.roles),
  ];
}

export function hasElevatedPermissionAccess(context: PermissionAccessContext): boolean {
  const contextRoles = normalizeStringArray(context.roles);
  const identityRoles = normalizeStringArray(context.identity?.roles);
  const roles = Array.from(new Set([...contextRoles, ...identityRoles]));

  if (hasAdminRole(roles)) {
    return true;
  }

  const identity = context.identity;
  if (!identity) {
    return false;
  }

  return isSuperAdminAccount({
    username: identity.username,
    email: identity.email,
    fullName: identity.fullName,
    roles: normalizeStringArray(identity.roles ?? roles),
  });
}

export function hasPermissionCode(
  context: PermissionAccessContext,
  requiredCode: string,
): boolean {
  if (typeof requiredCode !== 'string' || requiredCode.length === 0) {
    return false;
  }

  if (hasElevatedPermissionAccess(context)) {
    return true;
  }

  if (hasMarketingRolePermission(collectContextRoles(context), requiredCode)) {
    return true;
  }

  return normalizeStringArray(context.permissions).includes(requiredCode);
}

export function hasAnyPermissionCode(
  context: PermissionAccessContext,
  requiredCodes: readonly string[],
): boolean {
  const codes = normalizeRequiredCodes(requiredCodes);
  if (codes.length === 0 || hasInvalidRequiredCode(requiredCodes)) {
    return false;
  }

  if (hasElevatedPermissionAccess(context)) {
    return true;
  }

  if (codes.some((code) => hasMarketingRolePermission(collectContextRoles(context), code))) {
    return true;
  }

  const permissions = normalizeStringArray(context.permissions);
  return codes.some((code) => permissions.includes(code));
}

export function hasAllPermissionCodes(
  context: PermissionAccessContext,
  requiredCodes: readonly string[],
): boolean {
  const codes = normalizeRequiredCodes(requiredCodes);
  if (hasInvalidRequiredCode(requiredCodes)) {
    return false;
  }

  if (hasElevatedPermissionAccess(context)) {
    return true;
  }

  if (
    codes.length > 0 &&
    codes.every((code) => hasMarketingRolePermission(collectContextRoles(context), code))
  ) {
    return true;
  }

  const permissions = normalizeStringArray(context.permissions);
  return codes.every((code) => permissions.includes(code));
}

export function hasEffectivePermission(
  context: PermissionAccessContext & {
    permissionCode: string | readonly string[];
    mode?: PermissionAccessMode;
  },
): boolean {
  if (typeof context.permissionCode === 'string') {
    return hasPermissionCode(context, context.permissionCode);
  }

  if (context.mode === 'any') {
    return hasAnyPermissionCode(context, context.permissionCode);
  }

  return hasAllPermissionCodes(context, context.permissionCode);
}

export function inferPermissionRole(context: PermissionAccessContext): {
  role: 'guest' | 'viewer' | 'editor' | 'admin';
  isAdmin: boolean;
  isEditor: boolean;
  isViewer: boolean;
  isGuest: boolean;
} {
  let role: 'guest' | 'viewer' | 'editor' | 'admin' = 'guest';

  if (hasPermissionCode(context, 'user:delete:all')) {
    role = 'admin';
  } else if (hasPermissionCode(context, 'user:edit:all')) {
    role = 'editor';
  } else if (
    normalizeStringArray(context.permissions).some((permission) =>
      ['view', 'list'].some((action) => permission.includes(action))
    )
  ) {
    role = 'viewer';
  }

  return {
    role,
    isAdmin: role === 'admin',
    isEditor: role === 'editor',
    isViewer: role === 'viewer',
    isGuest: role === 'guest',
  };
}
