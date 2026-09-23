export function assertRegistryFrontendPermissionInputs({
  assertFalse,
  assertIncludes,
  assertTrue,
  registry,
}) {
  assertFalse(
    registry.byName.get('verify:frontend:auth-navigation-policy')?.inputs.includes('apps/web-vite/src/**'),
    'auth navigation policy behavior fixture should hash exact policy sources instead of every frontend source file',
  );
  assertFalse(
    registry.byName.get('verify:frontend:auth-navigation-policy')?.inputs.includes('scripts/lib/**'),
    'auth navigation policy behavior fixture should hash its split fixture helper instead of every script helper',
  );
  for (const input of [
    'apps/web-vite/src/lib/auth-navigation.ts',
    'apps/web-vite/src/lib/dataops-permissions.ts',
    'apps/web-vite/src/lib/permission-access.ts',
    'apps/web-vite/src/lib/permissions.ts',
    'apps/web-vite/src/lib/report-permissions.ts',
    'apps/web-vite/src/lib/role-access.ts',
    'apps/web-vite/src/lib/route-policy-registry.ts',
    'scripts/checks/frontend-structure/auth-navigation-policy.behavior.mjs',
    'scripts/lib/frontend/auth-navigation-policy-behavior-fixtures.mjs',
  ]) {
    assertIncludes(
      registry.byName.get('verify:frontend:auth-navigation-policy')?.inputs ?? [],
      input,
      `auth navigation policy cache key should include ${input}`,
    );
  }
  assertFalse(
    registry.byName.get('verify:frontend:permission-policy')?.inputs.includes('apps/web-vite/src/**'),
    'permission policy behavior fixture should hash exact policy sources instead of every frontend source file',
  );
  assertFalse(
    registry.byName.get('verify:frontend:permission-policy')?.inputs.includes('scripts/lib/**'),
    'permission policy behavior fixture should hash its split fixture helper instead of every script helper',
  );
  for (const input of [
    'apps/web-vite/src/hooks/use-auth.ts',
    'apps/web-vite/src/hooks/use-permission.ts',
    'apps/web-vite/src/lib/auth-navigation.ts',
    'apps/web-vite/src/lib/permission-access.ts',
    'apps/web-vite/src/lib/permissions.ts',
    'apps/web-vite/src/app/admin/roles/_components/role-permission-helpers.ts',
    'scripts/checks/frontend-structure/permission-policy.behavior.mjs',
    'scripts/lib/frontend/frontend-permission-policy-behavior-fixtures.mjs',
  ]) {
    assertIncludes(
      registry.byName.get('verify:frontend:permission-policy')?.inputs ?? [],
      input,
      `permission policy cache key should include ${input}`,
    );
  }
  assertTrue(
    registry.byName.get('verify:frontend:protected-navigation')?.inputs.includes('scripts/lib/frontend/protected-navigation-consistency-core.mjs'),
    'protected navigation cache key should include split consistency helper',
  );
  assertTrue(
    registry.byName.get('verify:frontend:protected-navigation')?.inputs.includes('scripts/lib/frontend/protected-navigation-consistency-check.mjs'),
    'protected navigation cache key should include split consistency check helper',
  );
}
