/**
 * 数据运维模块权限常量
 *
 * 查看权限与操作权限都仅接受 DataOps 专属权限。
 */

const DATAOPS_CORE_OPERATE_PERMISSIONS = [
  'dataops:operate',
  'dataops:manage',
  'dataops:write',
  'dataops:admin',
  'dataops:*',
];

export const DATAOPS_READ_PERMISSIONS: string[] = Array.from(
  new Set([
    'dataops:view',
    'dataops:read',
    ...DATAOPS_CORE_OPERATE_PERMISSIONS,
  ])
);

export const DATAOPS_OPERATE_PERMISSIONS: string[] = Array.from(
  new Set(DATAOPS_CORE_OPERATE_PERMISSIONS)
);
