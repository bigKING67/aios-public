/**
 * 报告模块权限常量
 *
 * 同时兼容：
 * - 新权限体系（reports:read / exports:create）
 * - 旧权限体系（report:view:* / report:export）
 */

export const REPORT_READ_PERMISSIONS: string[] = [
  'reports:read',
  'report:view:all',
  'report:view:shared',
  'report:view:own',
];

export const REPORT_EXPORT_PERMISSIONS: string[] = [
  'exports:create',
  'report:export',
  'report:export:all',
];

export const CREATOR_LIBRARY_READ_PERMISSIONS: string[] = [
  'marketing:creator_library:read',
  'marketing:creator_library:write',
  'marketing:creator_library:manage',
];

export const CREATOR_LIBRARY_WRITE_PERMISSIONS: string[] = [
  'marketing:creator_library:write',
  'marketing:creator_library:manage',
];

export const CONTENT_ASSET_READ_PERMISSIONS: string[] = [
  'marketing:content_assets:read',
  'marketing:content_assets:write',
  'marketing:content_assets:manage',
];

export const CONTENT_ASSET_WRITE_PERMISSIONS: string[] = [
  'marketing:content_assets:write',
  'marketing:content_assets:manage',
];

export const CONTENT_ASSET_MANAGE_PERMISSIONS: string[] = [
  'marketing:content_assets:manage',
];

export const MARKETING_WORKSPACE_READ_PERMISSIONS: string[] = [
  ...CREATOR_LIBRARY_READ_PERMISSIONS,
  ...CONTENT_ASSET_READ_PERMISSIONS,
  ...REPORT_EXPORT_PERMISSIONS,
];

/**
 * 周报总结模块权限
 *
 * 约定：
 * - generate: 触发 AI 生成
 * - edit: 手工编辑总结
 * - configure: 修改 AI 配置
 */
export const REPORT_SUMMARY_GENERATE_PERMISSIONS: string[] = [
  'reports:summary:generate',
  'report:summary:generate',
  'report:summary:manage',
];

export const REPORT_SUMMARY_EDIT_PERMISSIONS: string[] = [
  'reports:summary:edit',
  'report:summary:edit',
  'report:summary:manage',
];

export const REPORT_SUMMARY_CONFIG_PERMISSIONS: string[] = [
  'reports:summary:config',
  'report:summary:config',
  'report:summary:manage',
];
