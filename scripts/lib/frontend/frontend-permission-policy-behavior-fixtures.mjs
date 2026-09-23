import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

let activeAssertions;

const FRONTEND_SOURCE_ROOT = path.resolve('apps/web-vite/src');

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('frontend permission policy behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertFalse(...args) {
  currentAssertions().assertFalse(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

function assertTrue(...args) {
  currentAssertions().assertTrue(...args);
}

async function bundleEntry(entryPoint, name) {
  const result = await build({
    absWorkingDir: process.cwd(),
    alias: {
      '@': FRONTEND_SOURCE_ROOT,
    },
    bundle: true,
    entryPoints: [entryPoint],
    external: [],
    format: 'esm',
    logLevel: 'silent',
    platform: 'node',
    target: 'node20',
    tsconfig: 'apps/web-vite/tsconfig.json',
    write: false,
  });
  const bundledSource = result.outputFiles[0]?.text;
  if (!bundledSource) {
    throw new Error(`${name} bundle output is empty`);
  }

  return {
    moduleUrl: `data:text/javascript;base64,${Buffer.from(bundledSource).toString('base64')}`,
  };
}

function assertUsesSharedPermissionPolicy() {
  const useAuthSource = readFileSync('apps/web-vite/src/hooks/use-auth.ts', 'utf8');
  const usePermissionSource = readFileSync('apps/web-vite/src/hooks/use-permission.ts', 'utf8');
  const authNavigationSource = readFileSync('apps/web-vite/src/lib/auth-navigation.ts', 'utf8');
  const adminPageSources = [
    'apps/web-vite/src/app/admin/users/_components/users-page-client.tsx',
    'apps/web-vite/src/app/admin/roles/_components/roles-page-client.tsx',
    'apps/web-vite/src/app/admin/permissions/_components/permissions-page-client.tsx',
    'apps/web-vite/src/app/admin/audit-logs/_components/audit-logs-page-client.tsx',
  ].map((filePath) => [filePath, readFileSync(filePath, 'utf8')]);

  assertIncludes(
    useAuthSource,
    "from '@/lib/permission-access'",
    'useAuth must use the shared effective permission policy',
  );
  assertIncludes(
    usePermissionSource,
    "from '@/lib/permission-access'",
    'usePermission hooks must use the shared effective permission policy',
  );
  assertIncludes(
    authNavigationSource,
    "from './permission-access'",
    'auth-navigation must use the shared effective permission policy',
  );
  assertIncludes(
    authNavigationSource,
    "from './permissions'",
    'auth-navigation admin access must use shared admin permission constants',
  );

  for (const [filePath, source] of adminPageSources) {
    assertIncludes(
      source,
      'ADMIN_READ_PERMISSIONS',
      `${filePath} must use shared admin read permissions`,
    );
  }
}

function regularContext(overrides = {}) {
  return {
    identity: {
      email: 'regular@example.com',
      fullName: 'Regular User',
      roles: [],
      username: 'regular-user',
    },
    permissions: [],
    roles: [],
    ...overrides,
  };
}

export async function runFrontendPermissionPolicyBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const permissionBundle = await bundleEntry('apps/web-vite/src/lib/permission-access.ts', 'permission-access');
  const permissionsBundle = await bundleEntry('apps/web-vite/src/lib/permissions.ts', 'permissions');
  const authNavigationBundle = await bundleEntry('apps/web-vite/src/lib/auth-navigation.ts', 'auth-navigation');
  const rolePermissionHelpersBundle = await bundleEntry(
    'apps/web-vite/src/app/admin/roles/_components/role-permission-helpers.ts',
    'role-permission-helpers',
  );

  assertUsesSharedPermissionPolicy();

  const permissionModule = await import(permissionBundle.moduleUrl);
  const authNavigationModule = await import(authNavigationBundle.moduleUrl);
  const {
    ADMIN_READ_PERMISSIONS,
  } = await import(permissionsBundle.moduleUrl);
  const { resolveTargetPermissionIds } = await import(rolePermissionHelpersBundle.moduleUrl);
  const {
    hasAllPermissionCodes,
    hasAnyPermissionCode,
    hasEffectivePermission,
    hasElevatedPermissionAccess,
    hasPermissionCode,
    inferPermissionRole,
  } = permissionModule;
  const { canAccessPath } = authNavigationModule;

  assertTrue(
    ADMIN_READ_PERMISSIONS.includes('user:list:all') &&
      ADMIN_READ_PERMISSIONS.includes('role:list:all') &&
      ADMIN_READ_PERMISSIONS.includes('role:view:all') &&
      ADMIN_READ_PERMISSIONS.includes('permission:list:all') &&
      ADMIN_READ_PERMISSIONS.includes('audit:list:all') &&
      ADMIN_READ_PERMISSIONS.includes('audit:view:all'),
    'shared admin read permissions should cover user, role, permission, and audit read access',
  );

  assertTrue(
    hasPermissionCode(regularContext({ permissions: ['reports:read'] }), 'reports:read'),
    'direct permission code should grant access',
  );
  assertFalse(
    hasPermissionCode(regularContext({ permissions: ['reports:read'] }), 'reports:export'),
    'missing direct permission code should deny access',
  );
  assertTrue(
    hasAnyPermissionCode(regularContext({ permissions: ['reports:read'] }), [
      'reports:export',
      'reports:read',
    ]),
    'any-mode permission should pass when one permission matches',
  );
  assertFalse(
    hasAnyPermissionCode(regularContext({ permissions: ['reports:read'] }), [
      'reports:export',
      'dataops:view',
    ]),
    'any-mode permission should fail when no permissions match',
  );
  assertTrue(
    hasAllPermissionCodes(regularContext({ permissions: ['reports:read', 'reports:export'] }), [
      'reports:read',
      'reports:export',
    ]),
    'all-mode permission should pass when all permissions match',
  );
  assertFalse(
    hasAllPermissionCodes(regularContext({ permissions: ['reports:read'] }), [
      'reports:read',
      'reports:export',
    ]),
    'all-mode permission should fail when any permission is missing',
  );
  assertFalse(
    hasPermissionCode(regularContext({ permissions: ['reports:read'] }), ''),
    'empty permission code should not grant access',
  );

  assertTrue(
    hasPermissionCode(regularContext({ roles: ['admin'], permissions: [] }), 'anything:read'),
    'admin role should receive effective permission access',
  );
  assertTrue(
    hasAnyPermissionCode(regularContext({ roles: ['super-admin'], permissions: [] }), [
      'dataops:view',
    ]),
    'super-admin role should receive any-mode effective permission access',
  );
  assertTrue(
    hasAllPermissionCodes(regularContext({ roles: ['super_admin'], permissions: [] }), [
      'reports:read',
      'reports:export',
    ]),
    'super_admin role should receive all-mode effective permission access',
  );
  assertTrue(
    hasElevatedPermissionAccess(regularContext({
      identity: {
        email: null,
        fullName: null,
        roles: [],
        username: 'sixseven',
      },
    })),
    'configured super-admin identity should receive elevated permission access',
  );
  assertTrue(
    hasEffectivePermission({
      ...regularContext({ permissions: ['reports:read'] }),
      mode: 'any',
      permissionCode: ['reports:export', 'reports:read'],
    }),
    'effective permission helper should honor any-mode arrays',
  );
  assertTrue(
    inferPermissionRole(regularContext({ roles: ['admin'], permissions: [] })).isAdmin,
    'role inference should use effective admin permissions instead of raw includes only',
  );
  assertFalse(
    inferPermissionRole(regularContext({ permissions: ['user:edit:all'] })).isAdmin,
    'editor permission should not infer admin role',
  );

  assertTrue(
    hasAnyPermissionCode(regularContext({ roles: ['bd'], permissions: [] }), [
      'marketing:creator_library:write',
      'marketing:creator_library:manage',
    ]),
    'BD role should receive creator library write access for create/import toolbar actions',
  );
  assertFalse(
    hasPermissionCode(regularContext({ roles: ['bd'], permissions: [] }), 'marketing:creator_library:manage'),
    'BD role should not receive creator library manage access',
  );
  assertTrue(
    hasAnyPermissionCode(regularContext({ roles: ['bd_manager'], permissions: [] }), [
      'marketing:creator_library:write',
      'marketing:creator_library:manage',
    ]),
    'BD manager role should receive creator library manage/write access',
  );
  assertFalse(
    hasPermissionCode(regularContext({ roles: ['bd'], permissions: [] }), 'marketing:content_assets:write'),
    'BD role should not receive content assets write access',
  );
  assertFalse(
    hasPermissionCode(regularContext({ roles: ['bd'], permissions: [] }), 'marketing:content_assets:manage'),
    'BD role should not receive content assets manage access',
  );
  assertTrue(
    hasPermissionCode(regularContext({ roles: ['content_ops'], permissions: [] }), 'marketing:content_assets:write'),
    'content_ops role should receive content assets write access',
  );
  assertFalse(
    hasPermissionCode(regularContext({ roles: ['content_ops'], permissions: [] }), 'marketing:content_assets:manage'),
    'content_ops role should not receive content assets manage access',
  );
  assertTrue(
    hasPermissionCode(regularContext({ roles: ['content_ops_manager'], permissions: [] }), 'marketing:content_assets:manage'),
    'content_ops_manager role should receive content assets manage access',
  );

  const rolePermissionCatalog = [
    { id: 1, code: 'reports:read', module: 'reports' },
    { id: 2, code: 'dashboard:view', module: 'dashboard' },
    { id: 3, code: 'marketing:creator_library:read', module: 'marketing' },
    { id: 4, code: 'marketing:creator_library:write', module: 'marketing' },
    { id: 5, code: 'marketing:creator_library:manage', module: 'marketing' },
    { id: 6, code: 'marketing:industry_news:read', module: 'marketing' },
    { id: 7, code: 'user:list:all', module: 'user' },
    { id: 8, code: 'marketing:content_assets:read', module: 'marketing' },
    { id: 9, code: 'marketing:content_assets:write', module: 'marketing' },
    { id: 10, code: 'marketing:content_assets:manage', module: 'marketing' },
  ];
  assertTrue(
    [2, 3, 4, 8].every((id) => resolveTargetPermissionIds('bd', rolePermissionCatalog).includes(id)),
    'default BD role bootstrap should grant creator dashboard read, creator library read/write, and content assets read only',
  );
  assertFalse(
    resolveTargetPermissionIds('bd', rolePermissionCatalog).includes(5),
    'default BD role bootstrap should not grant creator library manage',
  );
  assertFalse(
    resolveTargetPermissionIds('bd', rolePermissionCatalog).includes(6),
    'default BD role bootstrap should not grant industry news because industry news only requires login',
  );
  assertFalse(
    resolveTargetPermissionIds('bd', rolePermissionCatalog).includes(9),
    'default BD role bootstrap should not grant content assets write',
  );
  assertTrue(
    [2, 3, 4, 5, 8].every((id) =>
      resolveTargetPermissionIds('bd_manager', rolePermissionCatalog).includes(id)
    ),
    'default BD manager role bootstrap should grant dashboard read, creator library, and content assets read only',
  );
  assertFalse(
    resolveTargetPermissionIds('bd_manager', rolePermissionCatalog).includes(7),
    'default BD manager role bootstrap should not inherit system user management permissions',
  );
  assertFalse(
    resolveTargetPermissionIds('bd_manager', rolePermissionCatalog).includes(6),
    'default BD manager role bootstrap should not grant industry news because industry news only requires login',
  );
  assertFalse(
    resolveTargetPermissionIds('bd_manager', rolePermissionCatalog).includes(9) ||
      resolveTargetPermissionIds('bd_manager', rolePermissionCatalog).includes(10),
    'default BD manager role bootstrap should not grant content assets write/manage',
  );
  assertTrue(
    [8, 9].every((id) => resolveTargetPermissionIds('content_ops', rolePermissionCatalog).includes(id)),
    'default content_ops role bootstrap should grant content assets read/write',
  );
  assertFalse(
    resolveTargetPermissionIds('content_ops', rolePermissionCatalog).includes(10),
    'default content_ops role bootstrap should not grant content assets manage',
  );
  assertTrue(
    [8, 9, 10].every((id) => resolveTargetPermissionIds('content_ops_manager', rolePermissionCatalog).includes(id)),
    'default content_ops_manager role bootstrap should grant content assets read/write/manage',
  );

  assertTrue(
    canAccessPath('/reports/weekly', [], ['admin'], {
      email: 'admin@example.com',
      fullName: 'Admin',
      username: 'admin-user',
    }, true),
    'admin role should keep report navigation visible through shared policy',
  );
  assertTrue(
    canAccessPath('/reports/weekly', [], [], {
      email: null,
      fullName: null,
      username: 'sixseven',
    }, true),
    'super-admin identity should keep report navigation visible through shared policy',
  );
  assertTrue(
    canAccessPath('/dashboard/creator', [], ['admin'], {
      email: 'admin@example.com',
      fullName: 'Admin',
      username: 'admin-user',
    }, true),
    'admin role should receive creator dashboard access through shared elevated policy',
  );
  assertTrue(
    canAccessPath('/dashboard/industry-material-inspiration', [], ['content_ops'], {
      email: 'content@example.com',
      fullName: 'Content Ops',
      username: 'content-ops-user',
    }, true),
    'content_ops role should receive industry material inspiration dashboard access',
  );
  assertFalse(
    canAccessPath('/dashboard/industry-material-inspiration', [], ['dashboard_view'], {
      email: 'viewer@example.com',
      fullName: 'Dashboard Viewer',
      username: 'dashboard-viewer',
    }, true),
    'dashboard_view role alone should not receive industry material inspiration dashboard access',
  );
  assertTrue(
    canAccessPath('/reports/weekly', ['reports:read'], [], {
      email: 'regular@example.com',
      fullName: 'Regular User',
      username: 'regular-user',
    }, true),
    'regular report permission should keep report navigation visible through shared policy',
  );
  assertFalse(
    canAccessPath('/reports/weekly', [], [], {
      email: 'regular@example.com',
      fullName: 'Regular User',
      username: 'regular-user',
    }, true),
    'regular user without role or permission should not see report navigation',
  );
  assertFalse(
    canAccessPath('/ops/dataops', ['dataops:view'], [], {
      email: 'regular@example.com',
      fullName: 'Regular User',
      username: 'regular-user',
    }, false),
    'permission policy must not bypass authentication requirements',
  );
  assertFalse(
    canAccessPath('/admin/users', ['user:list:all'], [], {
      email: 'regular@example.com',
      fullName: 'Regular User',
      username: 'regular-user',
    }, false),
    'admin navigation must not bypass authentication requirements',
  );

  return 'effective permission helpers, hook wiring, and navigation policy cases passed.';
}
