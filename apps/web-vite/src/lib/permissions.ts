/**
 * 权限常量（前后端统一）
 *
 * 格式：{module}:{action}:{scope}
 *
 * 说明：
 * - module: 功能模块（user, role, permission, report, dashboard, audit）
 * - action: 操作类型（list, view, create, edit, delete, assign）
 * - scope: 范围（all, own, department, shared）
 */

export const PERMISSIONS = {
  // 用户管理
  USER: {
    LIST: 'user:list:all',
    VIEW: 'user:view:all',
    CREATE: 'user:create:all',
    EDIT: 'user:edit:all',
    DELETE: 'user:delete:all',
    ASSIGN_ROLE: 'user:assign_role:all',
  },

  // 角色管理
  ROLE: {
    LIST: 'role:list:all',
    VIEW: 'role:view:all',
    CREATE: 'role:create:all',
    EDIT: 'role:edit:all',
    DELETE: 'role:delete:all',
    ASSIGN_PERMISSION: 'role:assign_permission:all',
  },

  // 权限管理
  PERMISSION: {
    LIST: 'permission:list:all',
  },

  // 审计日志
  AUDIT: {
    LIST: 'audit:list:all',
    VIEW: 'audit:view:all',
  },
} as const;

export const ADMIN_READ_PERMISSIONS: string[] = [
  PERMISSIONS.USER.LIST,
  PERMISSIONS.ROLE.LIST,
  PERMISSIONS.ROLE.VIEW,
  PERMISSIONS.PERMISSION.LIST,
  PERMISSIONS.AUDIT.LIST,
  PERMISSIONS.AUDIT.VIEW,
];

export type PermissionType =
  | typeof PERMISSIONS.USER[keyof typeof PERMISSIONS.USER]
  | typeof PERMISSIONS.ROLE[keyof typeof PERMISSIONS.ROLE]
  | typeof PERMISSIONS.PERMISSION[keyof typeof PERMISSIONS.PERMISSION]
  | typeof PERMISSIONS.AUDIT[keyof typeof PERMISSIONS.AUDIT];

/**
 * 权限模块分组
 */
export const PERMISSION_MODULES = [
  {
    module: 'user',
    label: '用户管理',
    permissions: Object.values(PERMISSIONS.USER),
  },
  {
    module: 'role',
    label: '角色管理',
    permissions: Object.values(PERMISSIONS.ROLE),
  },
  {
    module: 'permission',
    label: '权限管理',
    permissions: Object.values(PERMISSIONS.PERMISSION),
  },
  {
    module: 'audit',
    label: '审计日志',
    permissions: Object.values(PERMISSIONS.AUDIT),
  },
] as const;
