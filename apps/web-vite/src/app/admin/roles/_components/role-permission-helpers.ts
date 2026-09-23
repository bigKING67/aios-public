import { asRecord } from '@/lib/unknown-data';
import { normalizeRole } from '@/lib/role-access';
import type { PermissionItem } from './roles-types';

const REPORT_READ_PERMISSION_CODES = [
  'reports:read',
  'report:view:all',
  'report:view:shared',
  'report:view:own',
];

const REPORT_EXPORT_PERMISSION_CODES = [
  'exports:create',
  'report:export',
  'report:export:all',
];

const DASHBOARD_READ_PERMISSION_CODES = [
  'dashboard:view:all',
  'dashboard:view',
  'dashboard:view:shared',
  'dashboard:view:own',
];

const CREATOR_LIBRARY_READ_PERMISSION_CODES = [
  'marketing:creator_library:read',
];

const CREATOR_LIBRARY_WRITE_PERMISSION_CODES = [
  'marketing:creator_library:write',
];

const CREATOR_LIBRARY_MANAGE_PERMISSION_CODES = [
  'marketing:creator_library:manage',
];

const CONTENT_ASSET_READ_PERMISSION_CODES = [
  'marketing:content_assets:read',
];

const CONTENT_ASSET_WRITE_PERMISSION_CODES = [
  'marketing:content_assets:write',
];

const CONTENT_ASSET_MANAGE_PERMISSION_CODES = [
  'marketing:content_assets:manage',
];

const MANAGEMENT_PERMISSION_PREFIXES = [
  'user:',
  'role:',
  'permission:',
  'audit:',
  'admin:',
  'dataops:',
];

const MANAGEMENT_PERMISSION_MODULES = new Set([
  'user',
  'role',
  'permission',
  'audit',
  'admin',
  'dataops',
]);

function normalizePermissionId(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function parsePermissionListPayload(payload: unknown): PermissionItem[] {
  const collect = (candidate: unknown): PermissionItem[] => {
    if (!Array.isArray(candidate)) {
      return [];
    }

    const items: PermissionItem[] = [];
    for (const item of candidate) {
      const record = asRecord(item);
      if (!record) {
        continue;
      }
      const code = typeof record.code === 'string' ? record.code.trim() : '';
      if (!code) {
        continue;
      }

      items.push({
        id: normalizePermissionId(record.id),
        code,
        module: typeof record.module === 'string' ? record.module : undefined,
        action: typeof record.action === 'string' ? record.action : undefined,
      });
    }

    return items;
  };

  if (Array.isArray(payload)) {
    return collect(payload);
  }

  const obj = asRecord(payload);
  if (!obj) {
    return [];
  }

  const directList = collect(obj.items ?? obj.data ?? obj.results);
  if (directList.length > 0) {
    return directList;
  }

  const grouped = Object.values(obj).flatMap((value) => collect(value));
  return grouped;
}

function uniqueNumberList(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))];
}

function pickPermissionIdsByCode(permissions: PermissionItem[], codes: string[]): number[] {
  const codeSet = new Set(codes.map((code) => normalizeRole(code)));
  return uniqueNumberList(
    permissions
      .filter((permission) => codeSet.has(normalizeRole(permission.code)))
      .map((permission) => permission.id)
  );
}

function isManagementPermission(permission: PermissionItem): boolean {
  const normalizedCode = normalizeRole(permission.code);
  if (MANAGEMENT_PERMISSION_PREFIXES.some((prefix) => normalizedCode.startsWith(prefix))) {
    return true;
  }

  const normalizedModule = normalizeRole(permission.module);
  return Boolean(normalizedModule) && MANAGEMENT_PERMISSION_MODULES.has(normalizedModule);
}

export function resolveTargetPermissionIds(roleCode: string, permissions: PermissionItem[]): number[] {
  const normalizedRoleCode = normalizeRole(roleCode);
  const readPermissionIds = pickPermissionIdsByCode(permissions, REPORT_READ_PERMISSION_CODES);
  const exportPermissionIds = pickPermissionIdsByCode(permissions, REPORT_EXPORT_PERMISSION_CODES);
  const dashboardReadPermissionIds = pickPermissionIdsByCode(
    permissions,
    DASHBOARD_READ_PERMISSION_CODES
  );
  const creatorLibraryReadPermissionIds = pickPermissionIdsByCode(
    permissions,
    CREATOR_LIBRARY_READ_PERMISSION_CODES
  );
  const creatorLibraryWritePermissionIds = pickPermissionIdsByCode(
    permissions,
    CREATOR_LIBRARY_WRITE_PERMISSION_CODES
  );
  const creatorLibraryManagePermissionIds = pickPermissionIdsByCode(
    permissions,
    CREATOR_LIBRARY_MANAGE_PERMISSION_CODES
  );
  const contentAssetReadPermissionIds = pickPermissionIdsByCode(
    permissions,
    CONTENT_ASSET_READ_PERMISSION_CODES
  );
  const contentAssetWritePermissionIds = pickPermissionIdsByCode(
    permissions,
    CONTENT_ASSET_WRITE_PERMISSION_CODES
  );
  const contentAssetManagePermissionIds = pickPermissionIdsByCode(
    permissions,
    CONTENT_ASSET_MANAGE_PERMISSION_CODES
  );

  if (normalizedRoleCode === 'bd') {
    return uniqueNumberList([
      ...dashboardReadPermissionIds,
      ...creatorLibraryReadPermissionIds,
      ...creatorLibraryWritePermissionIds,
      ...contentAssetReadPermissionIds,
    ]);
  }

  if (normalizedRoleCode === 'bd_manager' || normalizedRoleCode === 'bd-manager') {
    return uniqueNumberList([
      ...dashboardReadPermissionIds,
      ...creatorLibraryReadPermissionIds,
      ...creatorLibraryWritePermissionIds,
      ...creatorLibraryManagePermissionIds,
      ...contentAssetReadPermissionIds,
    ]);
  }

  if (normalizedRoleCode === 'content_ops' || normalizedRoleCode === 'content-ops') {
    return uniqueNumberList([
      ...contentAssetReadPermissionIds,
      ...contentAssetWritePermissionIds,
    ]);
  }

  if (
    normalizedRoleCode === 'content_ops_manager' ||
    normalizedRoleCode === 'content-ops-manager'
  ) {
    return uniqueNumberList([
      ...contentAssetReadPermissionIds,
      ...contentAssetWritePermissionIds,
      ...contentAssetManagePermissionIds,
    ]);
  }

  if (normalizedRoleCode === 'operator') {
    const businessPermissionIds = uniqueNumberList(
      permissions
        .filter(
          (permission) =>
            !isManagementPermission(permission) &&
            !CONTENT_ASSET_WRITE_PERMISSION_CODES.includes(permission.code) &&
            !CONTENT_ASSET_MANAGE_PERMISSION_CODES.includes(permission.code)
        )
        .map((permission) => permission.id)
    );

    if (businessPermissionIds.length > 0) {
      return businessPermissionIds;
    }

    return uniqueNumberList([...readPermissionIds, ...exportPermissionIds]);
  }

  if (normalizedRoleCode === 'dashboard_view') {
    return uniqueNumberList([...dashboardReadPermissionIds, ...contentAssetReadPermissionIds]);
  }

  return uniqueNumberList([...readPermissionIds, ...contentAssetReadPermissionIds]);
}
