import {
  pairedBehaviorTargetFiles,
} from '../quality-gate-command-targets.mjs';

function componentsApiInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    ...(name.endsWith('-behavior') ? [] : ['apps/web-vite/src/components/**']),
    'scripts/checks/components/api-exports.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/components/api-exports.behavior.mjs',
        'scripts/lib/frontend/component-api-exports-behavior-fixtures.mjs',
        'scripts/lib/shared/gate-fixture-utils.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function structureGateRegistryInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/verify-ci.sh',
    'scripts/lib/frontend/frontend-gate-registry-audit.mjs',
    'scripts/lib/frontend/frontend-structure-gates.mjs',
    'scripts/lib/frontend/frontend-behavior-quality-gates.mjs',
    'scripts/checks/frontend-structure/gate-registry.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/frontend-structure/gate-registry.behavior.mjs',
        'scripts/lib/frontend/frontend-structure-gate-registry-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function behaviorGuardQualityInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    '@packageRuntime',
    'scripts/checks/frontend/behavior-guard-quality.mjs',
    'scripts/lib/frontend/frontend-behavior-guard-quality-core.mjs',
    'scripts/lib/frontend/frontend-behavior-quality-gates.mjs',
    'scripts/lib/shared/behavior-guard-quality.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/frontend/behavior-guard-quality.behavior.mjs',
        'scripts/lib/frontend/frontend-behavior-guard-quality-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function reportApiContractInputs(_name, { scriptInputs, shared }) {
  return [
    'apps/web-vite/src/lib/api.ts',
    'apps/web-vite/src/lib/report-api/**',
    'scripts/lib/frontend/frontend-report-api-contract-core.mjs',
    ...scriptInputs,
    ...shared,
  ];
}

function reportApiContractBehaviorInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/frontend-structure/report-api-contract.behavior.mjs',
    'scripts/checks/frontend-structure/report-api-contract.mjs',
    'scripts/lib/frontend/frontend-report-api-contract-core.mjs',
    'scripts/lib/frontend/frontend-report-api-contract-behavior-fixtures.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function moduleNamesInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    ...(name.endsWith('-behavior') ? [] : ['apps/web-vite/src/**/*', 'apps/web-vite/**/*']),
    'scripts/checks/frontend-structure/module-names.mjs',
    'scripts/lib/frontend/frontend-module-names-core.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/frontend-structure/module-names.behavior.mjs',
        'scripts/lib/frontend/frontend-module-names-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function sameDirAliasImportsInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    ...(name.endsWith('-behavior') ? [] : ['apps/web-vite/src/**/*', 'apps/web-vite/**/*']),
    'scripts/checks/frontend-structure/same-dir-alias-imports.mjs',
    'scripts/lib/frontend/frontend-same-dir-alias-imports-core.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/frontend-structure/same-dir-alias-imports.behavior.mjs',
        'scripts/lib/frontend/frontend-same-dir-alias-imports-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function barrelImportsInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    ...(name.endsWith('-behavior') ? [] : ['apps/web-vite/src/**/*', 'apps/web-vite/**/*']),
    'scripts/checks/frontend-structure/barrel-imports.mjs',
    'scripts/lib/frontend/frontend-barrel-imports-core.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/frontend-structure/barrel-imports.behavior.mjs',
        'scripts/lib/frontend/frontend-barrel-imports-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function authNavigationPolicyInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    'apps/web-vite/src/lib/auth-navigation.ts',
    'apps/web-vite/src/lib/dataops-permissions.ts',
    'apps/web-vite/src/lib/permission-access.ts',
    'apps/web-vite/src/lib/permissions.ts',
    'apps/web-vite/src/lib/report-permissions.ts',
    'apps/web-vite/src/lib/role-access.ts',
    'apps/web-vite/src/lib/route-policy-registry.ts',
    'scripts/checks/frontend-structure/auth-navigation-policy.behavior.mjs',
    'scripts/lib/frontend/auth-navigation-policy-behavior-fixtures.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function authSessionRecoveryInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    'apps/web-vite/src/components/auth-session-bootstrap.tsx',
    'apps/web-vite/src/lib/auth-user.ts',
    'apps/web-vite/src/lib/auth-refresh-failure.ts',
    'apps/web-vite/src/lib/auth-session-recovery.ts',
    'apps/web-vite/src/lib/client-error.ts',
    'apps/web-vite/src/lib/request.ts',
    'apps/web-vite/src/lib/request-retry-policy.ts',
    'apps/web-vite/src/stores/auth.store.ts',
    'scripts/checks/frontend-structure/auth-session-recovery.behavior.mjs',
    'scripts/lib/frontend/auth-session-recovery-behavior-fixtures.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function permissionPolicyInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    'apps/web-vite/src/hooks/use-auth.ts',
    'apps/web-vite/src/hooks/use-permission.ts',
    'apps/web-vite/src/lib/auth-navigation.ts',
    'apps/web-vite/src/lib/permission-access.ts',
    'apps/web-vite/src/lib/permissions.ts',
    'apps/web-vite/src/app/admin/users/_components/users-page-client.tsx',
    'apps/web-vite/src/app/admin/roles/_components/roles-page-client.tsx',
    'apps/web-vite/src/app/admin/roles/_components/role-permission-helpers.ts',
    'apps/web-vite/src/app/admin/permissions/_components/permissions-page-client.tsx',
    'apps/web-vite/src/app/admin/audit-logs/_components/audit-logs-page-client.tsx',
    'scripts/checks/frontend-structure/permission-policy.behavior.mjs',
    'scripts/lib/frontend/frontend-permission-policy-behavior-fixtures.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function protectedNavigationInputs(_name, { scriptInputs, shared }) {
  return [
    '@frontendSource',
    'scripts/lib/frontend/protected-navigation-consistency-core.mjs',
    'scripts/lib/frontend/protected-navigation-consistency-check.mjs',
    ...scriptInputs,
    ...shared,
  ];
}

function navigationRoutesInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    ...(name.endsWith('-behavior') ? [] : ['@frontendSource']),
    'scripts/lib/frontend/frontend-navigation-routes-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/frontend/frontend-navigation-routes-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function routeAccessInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    ...(name.endsWith('-behavior') ? [] : ['@frontendSource']),
    'scripts/lib/frontend/route-access-coverage-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/frontend/route-access-coverage-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function layerBoundariesInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    ...(name.endsWith('-behavior') ? [] : ['@frontendSource']),
    'scripts/checks/frontend-structure/layer-boundaries.mjs',
    'scripts/lib/frontend/frontend-layer-boundaries-core.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/frontend-structure/layer-boundaries.behavior.mjs',
        'scripts/lib/frontend/frontend-layer-boundaries-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function viteRoutePathsBehaviorInputs(_name, { checkGuardHelperInputs, shared }) {
  return [
    'scripts/checks/frontend-structure/vite-route-paths.behavior.mjs',
    'scripts/lib/frontend/vite-route-paths.mjs',
    'scripts/lib/frontend/vite-route-paths-behavior-fixtures.mjs',
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function viteRoutesInputs(name, { scriptInputs, shared, targetFiles }) {
  return [
    ...(name.endsWith('-behavior')
      ? []
      : [
        'apps/web-vite/src/routes.tsx',
        'apps/web-vite/src/app/**',
        'apps/web-vite/src/lib/route-policy-registry.ts',
      ]),
    'scripts/lib/frontend/app-route-paths.mjs',
    'scripts/lib/frontend/vite-route-paths.mjs',
    'scripts/lib/frontend/vite-route-registry-core.mjs',
    ...(name.endsWith('-behavior') ? ['scripts/lib/frontend/vite-route-registry-behavior-fixtures.mjs'] : []),
    ...scriptInputs,
    ...(name.endsWith('-behavior') ? pairedBehaviorTargetFiles(targetFiles) : []),
    ...shared,
  ];
}

function routePolicyRegistryStructureInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    ...(name.endsWith('-behavior')
      ? []
      : [
        'apps/web-vite/src/routes.tsx',
        'apps/web-vite/src/app/**',
        'apps/web-vite/src/lib/route-policy-registry.ts',
      ]),
    'scripts/lib/frontend/app-route-paths.mjs',
    'scripts/lib/frontend/vite-route-paths.mjs',
    'scripts/lib/frontend/route-policy-registry-structure-core.mjs',
    'scripts/checks/frontend-structure/route-policy-registry-structure.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/frontend-structure/route-policy-registry-structure.behavior.mjs',
        'scripts/lib/frontend/route-policy-registry-structure-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function appPageSizeInputs(name, { allowlistConfigInputs, checkGuardHelperInputs, shared }) {
  return [
    ...allowlistConfigInputs,
    ...(name.endsWith('-behavior') ? [] : ['apps/web-vite/src/app/**']),
    'scripts/lib/frontend/app-route-paths.mjs',
    'scripts/checks/app/page-size.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/app/page-size.behavior.mjs',
        'scripts/lib/frontend/app-page-size-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function componentSizeInputs(name, { allowlistConfigInputs, checkGuardHelperInputs, shared }) {
  return [
    ...allowlistConfigInputs,
    ...(name.endsWith('-behavior')
      ? []
      : [
        'apps/web-vite/src/app/**/*.tsx',
        'apps/web-vite/src/app/**/*.jsx',
        'apps/web-vite/src/components/**/*.tsx',
        'apps/web-vite/src/components/**/*.jsx',
      ]),
    'scripts/checks/components/size.mjs',
    'scripts/lib/frontend/frontend-component-size-core.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/components/size.behavior.mjs',
        'scripts/lib/frontend/frontend-component-size-behavior-fixtures.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

function componentBoundariesInputs(name, { checkGuardHelperInputs, shared }) {
  return [
    ...(name.endsWith('-behavior')
      ? []
      : [
        'apps/web-vite/src/components/**/*.ts',
        'apps/web-vite/src/components/**/*.tsx',
        'apps/web-vite/src/components/**/*.js',
        'apps/web-vite/src/components/**/*.jsx',
      ]),
    'scripts/checks/components/boundaries.mjs',
    'scripts/lib/frontend/component-boundaries-core.mjs',
    ...(name.endsWith('-behavior')
      ? [
        'scripts/checks/components/boundaries.behavior.mjs',
        'scripts/lib/frontend/component-boundaries-behavior-fixtures.mjs',
        'scripts/lib/shared/gate-fixture-utils.mjs',
      ]
      : []),
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

const FRONTEND_STRUCTURE_INPUT_BUILDERS = Object.freeze({
  'verify:components:api': componentsApiInputs,
  'verify:components:api-behavior': componentsApiInputs,
  'verify:frontend:structure-gate-registry': structureGateRegistryInputs,
  'verify:frontend:structure-gate-registry-behavior': structureGateRegistryInputs,
  'verify:frontend:behavior-guard-quality': behaviorGuardQualityInputs,
  'verify:frontend:behavior-guard-quality-behavior': behaviorGuardQualityInputs,
  'verify:frontend:report-api-contract': reportApiContractInputs,
  'verify:frontend:report-api-contract-behavior': reportApiContractBehaviorInputs,
  'verify:frontend:module-names': moduleNamesInputs,
  'verify:frontend:module-names-behavior': moduleNamesInputs,
  'verify:frontend:same-dir-alias-imports': sameDirAliasImportsInputs,
  'verify:frontend:same-dir-alias-imports-behavior': sameDirAliasImportsInputs,
  'verify:frontend:barrel-imports': barrelImportsInputs,
  'verify:frontend:barrel-imports-behavior': barrelImportsInputs,
  'verify:frontend:auth-navigation-policy': authNavigationPolicyInputs,
  'verify:frontend:auth-session-recovery-behavior': authSessionRecoveryInputs,
  'verify:frontend:permission-policy': permissionPolicyInputs,
  'verify:frontend:protected-navigation': protectedNavigationInputs,
  'verify:frontend:navigation-routes': navigationRoutesInputs,
  'verify:frontend:navigation-routes-behavior': navigationRoutesInputs,
  'verify:frontend:route-access': routeAccessInputs,
  'verify:frontend:route-access-behavior': routeAccessInputs,
  'verify:frontend:layer-boundaries': layerBoundariesInputs,
  'verify:frontend:layer-boundaries-behavior': layerBoundariesInputs,
  'verify:frontend:vite-route-paths-behavior': viteRoutePathsBehaviorInputs,
  'verify:frontend:vite-routes': viteRoutesInputs,
  'verify:frontend:vite-routes-behavior': viteRoutesInputs,
  'verify:frontend:route-policy-registry-structure': routePolicyRegistryStructureInputs,
  'verify:frontend:route-policy-registry-structure-behavior': routePolicyRegistryStructureInputs,
  'verify:app:page-size': appPageSizeInputs,
  'verify:app:page-size-behavior': appPageSizeInputs,
  'verify:components:size': componentSizeInputs,
  'verify:components:size-behavior': componentSizeInputs,
  'verify:components:boundaries': componentBoundariesInputs,
  'verify:components:boundaries-behavior': componentBoundariesInputs,
});

export function frontendStructureGateInputPatterns(name, context) {
  const builder = FRONTEND_STRUCTURE_INPUT_BUILDERS[name];
  return builder ? builder(name, context) : null;
}
