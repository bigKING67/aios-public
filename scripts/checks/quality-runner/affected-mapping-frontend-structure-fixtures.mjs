import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export function assertFrontendStructureAndDesignAffectedMapping({
  assertFalse,
  assertTrue,
  registry,
}) {
  const frontendStructureCheck = selectAffectedGates(registry, ['scripts/checks/frontend-structure/app-route-paths.behavior.mjs']);
  assertTrue(
    frontendStructureCheck.names.includes('verify:frontend:app-route-paths-behavior'),
    'frontend structure check command should select its direct package gate',
  );
  assertTrue(
    frontendStructureCheck.names.includes('verify:frontend:structure-gate-registry'),
    'frontend structure check command should select structure registry guard',
  );

  const structureRegistryBehaviorFixture = selectAffectedGates(
    registry,
    ['scripts/lib/frontend/frontend-structure-gate-registry-behavior-fixtures.mjs'],
  );
  assertTrue(
    structureRegistryBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'frontend structure registry behavior fixture should select structure registry guard',
  );
  assertTrue(
    structureRegistryBehaviorFixture.names.includes('verify:frontend:structure-gate-registry-behavior'),
    'frontend structure registry behavior fixture should select structure registry behavior gate',
  );
  assertTrue(
    structureRegistryBehaviorFixture.names.includes('lint:scripts'),
    'frontend structure registry behavior fixture should keep script lint coverage',
  );
  assertFalse(
    structureRegistryBehaviorFixture.names.includes('verify:backend:size'),
    'frontend structure registry behavior fixture should not fall back to backend size gate',
  );

  const frontendHygieneCheck = selectAffectedGates(registry, ['scripts/checks/frontend-hygiene/stale-phase-comments.mjs']);
  assertTrue(
    frontendHygieneCheck.names.includes('verify:frontend:stale-phase-comments'),
    'frontend hygiene check command should select its direct package gate',
  );
  assertTrue(
    frontendHygieneCheck.names.includes('verify:frontend:structure-gate-registry'),
    'frontend hygiene check command should select structure registry guard',
  );

  const routeAccessHelper = selectAffectedGates(registry, ['scripts/lib/frontend/route-access-coverage-core.mjs']);
  assertTrue(
    routeAccessHelper.names.includes('verify:frontend:route-access'),
    'route access coverage helper should select production route access gate',
  );
  assertTrue(
    routeAccessHelper.names.includes('verify:frontend:route-access-behavior'),
    'route access coverage helper should select behavior route access gate',
  );
  assertTrue(
    routeAccessHelper.names.includes('verify:frontend:structure-gate-registry'),
    'route access coverage helper should select frontend structure registry guard',
  );

  const routeAccessBehaviorHelper = selectAffectedGates(registry, ['scripts/lib/frontend/route-access-coverage-behavior-fixtures.mjs']);
  assertTrue(
    routeAccessBehaviorHelper.names.includes('verify:frontend:route-access-behavior'),
    'route access behavior helper should select route access behavior gate',
  );
  assertTrue(
    routeAccessBehaviorHelper.names.includes('verify:frontend:structure-gate-registry'),
    'route access behavior helper should select frontend structure registry guard',
  );

  const reportApiContractHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-report-api-contract-core.mjs']);
  assertTrue(
    reportApiContractHelper.names.includes('verify:frontend:report-api-contract'),
    'report API contract helper should select production report API contract gate',
  );
  assertTrue(
    reportApiContractHelper.names.includes('verify:frontend:report-api-contract-behavior'),
    'report API contract helper should select report API contract behavior gate',
  );
  assertTrue(
    reportApiContractHelper.names.includes('verify:frontend:structure-gate-registry'),
    'report API contract helper should select frontend structure registry guard',
  );
  assertFalse(reportApiContractHelper.names.includes('verify:backend:size'), 'report API contract helper should not fall back to backend size gate');

  const reportApiContractBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-report-api-contract-behavior-fixtures.mjs']);
  assertTrue(
    reportApiContractBehaviorFixture.names.includes('lint:scripts'),
    'report API contract behavior fixture should keep script lint coverage',
  );
  assertTrue(
    reportApiContractBehaviorFixture.names.includes('verify:frontend:report-api-contract-behavior'),
    'report API contract behavior fixture should select behavior report API contract gate',
  );
  assertTrue(
    reportApiContractBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'report API contract behavior fixture should select frontend structure registry guard',
  );
  assertFalse(
    reportApiContractBehaviorFixture.names.includes('verify:frontend:report-api-contract'),
    'report API contract behavior fixture should not select production report API contract gate',
  );
  assertFalse(
    reportApiContractBehaviorFixture.names.includes('verify:backend:size'),
    'report API contract behavior fixture should not fall back to backend size gate',
  );

  const moduleNamesHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-module-names-core.mjs']);
  assertTrue(moduleNamesHelper.names.includes('lint:scripts'), 'frontend module names helper should keep script lint coverage');
  assertTrue(
    moduleNamesHelper.names.includes('verify:frontend:module-names'),
    'frontend module names helper should select production module names gate',
  );
  assertTrue(
    moduleNamesHelper.names.includes('verify:frontend:module-names-behavior'),
    'frontend module names helper should select module names behavior gate',
  );
  assertTrue(
    moduleNamesHelper.names.includes('verify:frontend:structure-gate-registry'),
    'frontend module names helper should select frontend structure registry guard',
  );
  assertFalse(
    moduleNamesHelper.names.includes('verify:backend:size'),
    'frontend module names helper should not fall back to backend size gate',
  );

  const moduleNamesBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-module-names-behavior-fixtures.mjs']);
  assertTrue(
    moduleNamesBehaviorFixture.names.includes('lint:scripts'),
    'frontend module names behavior fixture should keep script lint coverage',
  );
  assertTrue(
    moduleNamesBehaviorFixture.names.includes('verify:frontend:module-names-behavior'),
    'frontend module names behavior fixture should select module names behavior gate',
  );
  assertTrue(
    moduleNamesBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'frontend module names behavior fixture should select frontend structure registry guard',
  );
  assertFalse(
    moduleNamesBehaviorFixture.names.includes('verify:frontend:module-names'),
    'frontend module names behavior fixture should not select production module names gate',
  );
  assertFalse(
    moduleNamesBehaviorFixture.names.includes('verify:backend:size'),
    'frontend module names behavior fixture should not fall back to backend size gate',
  );

  const sameDirAliasImportsHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-same-dir-alias-imports-core.mjs']);
  assertTrue(sameDirAliasImportsHelper.names.includes('lint:scripts'), 'same-directory alias imports helper should keep script lint coverage');
  assertTrue(
    sameDirAliasImportsHelper.names.includes('verify:frontend:same-dir-alias-imports'),
    'same-directory alias imports helper should select production same-dir alias gate',
  );
  assertTrue(
    sameDirAliasImportsHelper.names.includes('verify:frontend:same-dir-alias-imports-behavior'),
    'same-directory alias imports helper should select same-dir alias behavior gate',
  );
  assertTrue(
    sameDirAliasImportsHelper.names.includes('verify:frontend:structure-gate-registry'),
    'same-directory alias imports helper should select frontend structure registry guard',
  );
  assertFalse(
    sameDirAliasImportsHelper.names.includes('verify:backend:size'),
    'same-directory alias imports helper should not fall back to backend size gate',
  );

  const sameDirAliasImportsBehaviorFixture = selectAffectedGates(
    registry,
    ['scripts/lib/frontend/frontend-same-dir-alias-imports-behavior-fixtures.mjs'],
  );
  assertTrue(
    sameDirAliasImportsBehaviorFixture.names.includes('lint:scripts'),
    'same-directory alias imports behavior fixture should keep script lint coverage',
  );
  assertTrue(
    sameDirAliasImportsBehaviorFixture.names.includes('verify:frontend:same-dir-alias-imports-behavior'),
    'same-directory alias imports behavior fixture should select same-dir alias behavior gate',
  );
  assertTrue(
    sameDirAliasImportsBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'same-directory alias imports behavior fixture should select frontend structure registry guard',
  );
  assertFalse(
    sameDirAliasImportsBehaviorFixture.names.includes('verify:frontend:same-dir-alias-imports'),
    'same-directory alias imports behavior fixture should not select production same-dir alias gate',
  );
  assertFalse(
    sameDirAliasImportsBehaviorFixture.names.includes('verify:backend:size'),
    'same-directory alias imports behavior fixture should not fall back to backend size gate',
  );

  const barrelImportsHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-barrel-imports-core.mjs']);
  assertTrue(barrelImportsHelper.names.includes('lint:scripts'), 'frontend barrel imports helper should keep script lint coverage');
  assertTrue(
    barrelImportsHelper.names.includes('verify:frontend:barrel-imports'),
    'frontend barrel imports helper should select production barrel import gate',
  );
  assertTrue(
    barrelImportsHelper.names.includes('verify:frontend:barrel-imports-behavior'),
    'frontend barrel imports helper should select barrel import behavior gate',
  );
  assertTrue(
    barrelImportsHelper.names.includes('verify:frontend:structure-gate-registry'),
    'frontend barrel imports helper should select frontend structure registry guard',
  );
  assertFalse(
    barrelImportsHelper.names.includes('verify:backend:size'),
    'frontend barrel imports helper should not fall back to backend size gate',
  );

  const barrelImportsBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-barrel-imports-behavior-fixtures.mjs']);
  assertTrue(
    barrelImportsBehaviorFixture.names.includes('lint:scripts'),
    'frontend barrel imports behavior fixture should keep script lint coverage',
  );
  assertTrue(
    barrelImportsBehaviorFixture.names.includes('verify:frontend:barrel-imports-behavior'),
    'frontend barrel imports behavior fixture should select barrel import behavior gate',
  );
  assertTrue(
    barrelImportsBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'frontend barrel imports behavior fixture should select frontend structure registry guard',
  );
  assertFalse(
    barrelImportsBehaviorFixture.names.includes('verify:frontend:barrel-imports'),
    'frontend barrel imports behavior fixture should not select production barrel import gate',
  );
  assertFalse(
    barrelImportsBehaviorFixture.names.includes('verify:backend:size'),
    'frontend barrel imports behavior fixture should not fall back to backend size gate',
  );

  const layerBoundariesHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-layer-boundaries-core.mjs']);
  assertTrue(
    layerBoundariesHelper.names.includes('verify:frontend:layer-boundaries'),
    'frontend layer boundary helper should select production layer boundary gate',
  );
  assertTrue(
    layerBoundariesHelper.names.includes('verify:frontend:layer-boundaries-behavior'),
    'frontend layer boundary helper should select layer boundary behavior gate',
  );
  assertTrue(
    layerBoundariesHelper.names.includes('verify:frontend:structure-gate-registry'),
    'frontend layer boundary helper should select frontend structure registry guard',
  );
  assertFalse(layerBoundariesHelper.names.includes('verify:backend:size'), 'frontend layer boundary helper should not fall back to backend size gate');

  const layerBoundariesBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-layer-boundaries-behavior-fixtures.mjs']);
  assertTrue(
    layerBoundariesBehaviorFixture.names.includes('lint:scripts'),
    'frontend layer boundary behavior fixture should keep script lint coverage',
  );
  assertTrue(
    layerBoundariesBehaviorFixture.names.includes('verify:frontend:layer-boundaries-behavior'),
    'frontend layer boundary behavior fixture should select behavior layer boundary gate',
  );
  assertTrue(
    layerBoundariesBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'frontend layer boundary behavior fixture should select frontend structure registry guard',
  );
  assertFalse(
    layerBoundariesBehaviorFixture.names.includes('verify:frontend:layer-boundaries'),
    'frontend layer boundary behavior fixture should not select production layer boundary gate',
  );
  assertFalse(
    layerBoundariesBehaviorFixture.names.includes('verify:backend:size'),
    'frontend layer boundary behavior fixture should not fall back to backend size gate',
  );

  const viteRouteRegistryHelper = selectAffectedGates(registry, ['scripts/lib/frontend/vite-route-registry-core.mjs']);
  assertTrue(
    viteRouteRegistryHelper.names.includes('verify:frontend:vite-routes'),
    'Vite route registry helper should select production route registry gate',
  );
  assertTrue(
    viteRouteRegistryHelper.names.includes('verify:frontend:vite-routes-behavior'),
    'Vite route registry helper should select behavior route registry gate',
  );
  assertTrue(
    viteRouteRegistryHelper.names.includes('verify:frontend:structure-gate-registry'),
    'Vite route registry helper should select frontend structure registry guard',
  );
  assertTrue(viteRouteRegistryHelper.names.includes('lint:scripts'), 'Vite route registry helper should keep script lint coverage');
  assertFalse(viteRouteRegistryHelper.names.includes('verify:backend:size'), 'Vite route registry helper should not fall back to backend size gate');

  const viteRouteRegistryBehaviorFixture = selectAffectedGates(
    registry,
    ['scripts/lib/frontend/vite-route-registry-behavior-fixtures.mjs'],
  );
  assertTrue(
    viteRouteRegistryBehaviorFixture.names.includes('verify:frontend:vite-routes-behavior'),
    'Vite route registry behavior fixture should select behavior route registry gate',
  );
  assertTrue(
    viteRouteRegistryBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'Vite route registry behavior fixture should select frontend structure registry guard',
  );
  assertTrue(
    viteRouteRegistryBehaviorFixture.names.includes('lint:scripts'),
    'Vite route registry behavior fixture should keep script lint coverage',
  );
  assertFalse(
    viteRouteRegistryBehaviorFixture.names.includes('verify:backend:size'),
    'Vite route registry behavior fixture should not fall back to backend size gate',
  );

  const viteRoutePathsHelper = selectAffectedGates(registry, ['scripts/lib/frontend/vite-route-paths.mjs']);
  assertTrue(viteRoutePathsHelper.names.includes('lint:scripts'), 'Vite route path helper should keep script lint coverage');
  for (const gateName of [
    'verify:frontend:vite-route-paths-behavior',
    'verify:frontend:vite-routes',
    'verify:frontend:vite-routes-behavior',
    'verify:frontend:route-policy-registry-structure',
    'verify:frontend:route-policy-registry-structure-behavior',
    'verify:frontend:route-access',
    'verify:frontend:route-access-behavior',
    'verify:frontend:navigation-routes',
    'verify:frontend:navigation-routes-behavior',
    'verify:frontend:protected-navigation',
    'verify:frontend:structure-gate-registry',
  ]) {
    assertTrue(
      viteRoutePathsHelper.names.includes(gateName),
      `Vite route path helper should select ${gateName}`,
    );
  }
  assertFalse(viteRoutePathsHelper.names.includes('verify:backend:size'), 'Vite route path helper should not fall back to backend size gate');

  const viteRoutePathsBehaviorFixture = selectAffectedGates(
    registry,
    ['scripts/lib/frontend/vite-route-paths-behavior-fixtures.mjs'],
  );
  assertTrue(
    viteRoutePathsBehaviorFixture.names.includes('verify:frontend:vite-route-paths-behavior'),
    'Vite route path behavior fixture should select route path behavior gate',
  );
  assertTrue(
    viteRoutePathsBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'Vite route path behavior fixture should select frontend structure registry guard',
  );
  assertTrue(
    viteRoutePathsBehaviorFixture.names.includes('lint:scripts'),
    'Vite route path behavior fixture should keep script lint coverage',
  );
  assertFalse(viteRoutePathsBehaviorFixture.names.includes('verify:backend:size'), 'Vite route path behavior fixture should not fall back to backend size gate');

  const frontendBehaviorGuardQualityHelper = selectAffectedGates(
    registry,
    ['scripts/lib/frontend/frontend-behavior-guard-quality-core.mjs'],
  );
  assertTrue(
    frontendBehaviorGuardQualityHelper.names.includes('verify:frontend:behavior-guard-quality'),
    'frontend behavior guard quality helper should select production behavior quality gate',
  );
  assertTrue(
    frontendBehaviorGuardQualityHelper.names.includes('verify:frontend:behavior-guard-quality-behavior'),
    'frontend behavior guard quality helper should select behavior fixture gate',
  );
  assertTrue(
    frontendBehaviorGuardQualityHelper.names.includes('verify:frontend:structure-gate-registry'),
    'frontend behavior guard quality helper should select frontend structure registry guard',
  );
  assertTrue(
    frontendBehaviorGuardQualityHelper.names.includes('lint:scripts'),
    'frontend behavior guard quality helper should keep script lint coverage',
  );
  assertFalse(
    frontendBehaviorGuardQualityHelper.names.includes('verify:backend:size'),
    'frontend behavior guard quality helper should not fall back to backend size gate',
  );

  const frontendBehaviorGuardQualityBehaviorFixture = selectAffectedGates(
    registry,
    ['scripts/lib/frontend/frontend-behavior-guard-quality-behavior-fixtures.mjs'],
  );
  assertTrue(
    frontendBehaviorGuardQualityBehaviorFixture.names.includes('verify:frontend:behavior-guard-quality-behavior'),
    'frontend behavior guard quality behavior fixture should select behavior fixture gate',
  );
  assertTrue(
    frontendBehaviorGuardQualityBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'frontend behavior guard quality behavior fixture should select frontend structure registry guard',
  );
  assertTrue(
    frontendBehaviorGuardQualityBehaviorFixture.names.includes('lint:scripts'),
    'frontend behavior guard quality behavior fixture should keep script lint coverage',
  );
  assertFalse(
    frontendBehaviorGuardQualityBehaviorFixture.names.includes('verify:backend:size'),
    'frontend behavior guard quality behavior fixture should not fall back to backend size gate',
  );

  const protectedNavigationHelper = selectAffectedGates(registry, ['scripts/lib/frontend/protected-navigation-consistency-core.mjs']);
  assertTrue(
    protectedNavigationHelper.names.includes('verify:frontend:protected-navigation'),
    'protected navigation consistency helper should select protected navigation gate',
  );
  assertTrue(
    protectedNavigationHelper.names.includes('verify:frontend:structure-gate-registry'),
    'protected navigation consistency helper should select frontend structure registry guard',
  );

  const protectedNavigationCheckHelper = selectAffectedGates(registry, ['scripts/lib/frontend/protected-navigation-consistency-check.mjs']);
  assertTrue(
    protectedNavigationCheckHelper.names.includes('verify:frontend:protected-navigation'),
    'protected navigation check helper should select protected navigation gate',
  );
  assertTrue(
    protectedNavigationCheckHelper.names.includes('verify:frontend:structure-gate-registry'),
    'protected navigation check helper should select frontend structure registry guard',
  );

  const navigationRoutesHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-navigation-routes-core.mjs']);
  assertTrue(
    navigationRoutesHelper.names.includes('verify:frontend:navigation-routes'),
    'navigation routes helper should select navigation route registry gate',
  );
  assertTrue(
    navigationRoutesHelper.names.includes('verify:frontend:navigation-routes-behavior'),
    'navigation routes helper should select navigation route behavior gate',
  );
  assertTrue(
    navigationRoutesHelper.names.includes('verify:frontend:structure-gate-registry'),
    'navigation routes helper should select frontend structure registry guard',
  );
  assertTrue(navigationRoutesHelper.names.includes('lint:scripts'), 'navigation routes helper should keep script lint coverage');
  assertFalse(navigationRoutesHelper.names.includes('verify:backend:size'), 'navigation routes helper should not fall back to backend size gate');

  const navigationRoutesBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-navigation-routes-behavior-fixtures.mjs']);
  assertTrue(
    navigationRoutesBehaviorFixture.names.includes('verify:frontend:navigation-routes-behavior'),
    'navigation routes behavior fixture should select navigation route behavior gate',
  );
  assertTrue(
    navigationRoutesBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'),
    'navigation routes behavior fixture should select frontend structure registry guard',
  );
  assertTrue(navigationRoutesBehaviorFixture.names.includes('lint:scripts'), 'navigation routes behavior fixture should keep script lint coverage');
  assertFalse(navigationRoutesBehaviorFixture.names.includes('verify:backend:size'), 'navigation routes behavior fixture should not fall back to backend size gate');

  const routePolicyStructureBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/route-policy-registry-structure-behavior-fixtures.mjs']);
  assertTrue(routePolicyStructureBehaviorFixture.names.includes('lint:scripts'), 'route policy structure behavior fixture should keep script lint coverage');
  assertTrue(routePolicyStructureBehaviorFixture.names.includes('verify:frontend:route-policy-registry-structure'), 'route policy structure behavior fixture should keep production structure coverage');
  assertTrue(routePolicyStructureBehaviorFixture.names.includes('verify:frontend:route-policy-registry-structure-behavior'), 'route policy structure behavior fixture should select behavior gate');
  assertTrue(routePolicyStructureBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'), 'route policy structure behavior fixture should select structure registry guard');
  assertFalse(routePolicyStructureBehaviorFixture.names.includes('verify:backend:size'), 'route policy structure behavior fixture should not fall back to backend size gate');

  const routePolicyStructureHelper = selectAffectedGates(registry, ['scripts/lib/frontend/route-policy-registry-structure-core.mjs']);
  assertTrue(routePolicyStructureHelper.names.includes('lint:scripts'), 'route policy structure helper should keep script lint coverage');
  assertTrue(routePolicyStructureHelper.names.includes('verify:frontend:route-policy-registry-structure'), 'route policy structure helper should select production structure coverage');
  assertTrue(routePolicyStructureHelper.names.includes('verify:frontend:route-policy-registry-structure-behavior'), 'route policy structure helper should select behavior gate');
  assertTrue(routePolicyStructureHelper.names.includes('verify:frontend:structure-gate-registry'), 'route policy structure helper should select structure registry guard');
  assertFalse(routePolicyStructureHelper.names.includes('verify:backend:size'), 'route policy structure helper should not fall back to backend size gate');

  const authNavigationPolicyBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/auth-navigation-policy-behavior-fixtures.mjs']);
  assertTrue(authNavigationPolicyBehaviorFixture.names.includes('lint:scripts'), 'auth navigation policy behavior fixture should keep script lint coverage');
  assertTrue(authNavigationPolicyBehaviorFixture.names.includes('verify:frontend:auth-navigation-policy'), 'auth navigation policy behavior fixture should select auth navigation policy gate');
  assertTrue(authNavigationPolicyBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'), 'auth navigation policy behavior fixture should select frontend structure registry guard');
  assertFalse(authNavigationPolicyBehaviorFixture.names.includes('verify:backend:size'), 'auth navigation policy behavior fixture should not fall back to backend size gate');

  const permissionPolicyBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-permission-policy-behavior-fixtures.mjs']);
  assertTrue(permissionPolicyBehaviorFixture.names.includes('lint:scripts'), 'permission policy behavior fixture should keep script lint coverage');
  assertTrue(permissionPolicyBehaviorFixture.names.includes('verify:frontend:permission-policy'), 'permission policy behavior fixture should select permission policy gate');
  assertTrue(permissionPolicyBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'), 'permission policy behavior fixture should select frontend structure registry guard');
  assertFalse(permissionPolicyBehaviorFixture.names.includes('verify:backend:size'), 'permission policy behavior fixture should not fall back to backend size gate');

  const appCheck = selectAffectedGates(registry, ['scripts/checks/app/page-size.mjs']);
  assertTrue(appCheck.names.includes('verify:app:page-size'), 'app check command should select its direct package gate');
  assertTrue(appCheck.names.includes('verify:frontend:structure-gate-registry'), 'app check command should select structure registry guard');

  const appPageSizeBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/app-page-size-behavior-fixtures.mjs']);
  assertTrue(appPageSizeBehaviorFixture.names.includes('lint:scripts'), 'app page size behavior fixture should keep script lint coverage');
  assertTrue(appPageSizeBehaviorFixture.names.includes('verify:app:page-size'), 'app page size behavior fixture should keep production page size coverage');
  assertTrue(appPageSizeBehaviorFixture.names.includes('verify:app:page-size-behavior'), 'app page size behavior fixture should select behavior gate');
  assertTrue(appPageSizeBehaviorFixture.names.includes('verify:frontend:structure-gate-registry'), 'app page size behavior fixture should select structure registry guard');
  assertFalse(appPageSizeBehaviorFixture.names.includes('verify:backend:size'), 'app page size behavior fixture should not fall back to backend size gate');

  const componentCheck = selectAffectedGates(registry, ['scripts/checks/components/api-exports.mjs']);
  assertTrue(componentCheck.names.includes('verify:components:api'), 'component check command should select its direct package gate');
  assertTrue(componentCheck.names.includes('verify:frontend:structure-gate-registry'), 'component check command should select structure registry guard');

  const componentApiExportsBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/component-api-exports-behavior-fixtures.mjs']);
  assertTrue(componentApiExportsBehaviorFixture.names.includes('lint:scripts'), 'component API exports behavior fixture should keep script lint coverage');
  assertTrue(
    componentApiExportsBehaviorFixture.names.includes('verify:components:api-behavior'),
    'component API exports behavior fixture should select behavior gate',
  );
  assertTrue(
    componentApiExportsBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'),
    'component API exports behavior fixture should select delivery registry guard',
  );
  assertFalse(
    componentApiExportsBehaviorFixture.names.includes('verify:components:api'),
    'component API exports behavior fixture should not select production component API gate',
  );
  assertFalse(
    componentApiExportsBehaviorFixture.names.includes('verify:backend:size'),
    'component API exports behavior fixture should not fall back to backend size gate',
  );

  const componentSizeHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-component-size-core.mjs']);
  assertTrue(componentSizeHelper.names.includes('lint:scripts'), 'component size helper should keep script lint coverage');
  assertTrue(componentSizeHelper.names.includes('verify:components:size'), 'component size helper should select production size gate');
  assertTrue(componentSizeHelper.names.includes('verify:components:size-behavior'), 'component size helper should select size behavior gate');
  assertTrue(componentSizeHelper.names.includes('verify:frontend:delivery-gate-registry'), 'component size helper should select delivery registry guard');
  assertFalse(componentSizeHelper.names.includes('verify:backend:size'), 'component size helper should not fall back to backend size gate');

  const componentSizeBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-component-size-behavior-fixtures.mjs']);
  assertTrue(componentSizeBehaviorFixture.names.includes('lint:scripts'), 'component size behavior fixture should keep script lint coverage');
  assertTrue(componentSizeBehaviorFixture.names.includes('verify:components:size'), 'component size behavior fixture should keep production size coverage');
  assertTrue(componentSizeBehaviorFixture.names.includes('verify:components:size-behavior'), 'component size behavior fixture should select size behavior gate');
  assertTrue(componentSizeBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'), 'component size behavior fixture should select delivery registry guard');
  assertFalse(componentSizeBehaviorFixture.names.includes('verify:backend:size'), 'component size behavior fixture should not fall back to backend size gate');

  const componentBoundariesHelper = selectAffectedGates(registry, ['scripts/lib/frontend/component-boundaries-core.mjs']);
  assertTrue(componentBoundariesHelper.names.includes('lint:scripts'), 'component boundary helper should keep script lint coverage');
  assertTrue(componentBoundariesHelper.names.includes('verify:components:boundaries'), 'component boundary helper should select production boundary gate');
  assertTrue(componentBoundariesHelper.names.includes('verify:components:boundaries-behavior'), 'component boundary helper should select boundary behavior gate');
  assertTrue(componentBoundariesHelper.names.includes('verify:frontend:delivery-gate-registry'), 'component boundary helper should select delivery registry guard');
  assertFalse(componentBoundariesHelper.names.includes('verify:backend:size'), 'component boundary helper should not fall back to backend size gate');

  const componentBoundariesBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/component-boundaries-behavior-fixtures.mjs']);
  assertTrue(componentBoundariesBehaviorFixture.names.includes('lint:scripts'), 'component boundary behavior fixture should keep script lint coverage');
  assertTrue(componentBoundariesBehaviorFixture.names.includes('verify:components:boundaries'), 'component boundary behavior fixture should keep production boundary coverage');
  assertTrue(componentBoundariesBehaviorFixture.names.includes('verify:components:boundaries-behavior'), 'component boundary behavior fixture should select boundary behavior gate');
  assertTrue(componentBoundariesBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'), 'component boundary behavior fixture should select delivery registry guard');
  assertFalse(componentBoundariesBehaviorFixture.names.includes('verify:backend:size'), 'component boundary behavior fixture should not fall back to backend size gate');

  const cssModuleCheck = selectAffectedGates(registry, ['scripts/checks/css-modules/size.mjs']);
  assertTrue(cssModuleCheck.names.includes('verify:css-modules:size'), 'CSS Module check command should select its direct package gate');
  assertTrue(cssModuleCheck.names.includes('verify:frontend:structure-gate-registry'), 'CSS Module check command should select structure registry guard');

  const cssModuleBehaviorHelper = selectAffectedGates(registry, ['scripts/lib/frontend/css-module-size-behavior-fixtures.mjs']);
  assertTrue(cssModuleBehaviorHelper.names.includes('lint:scripts'), 'CSS Module size behavior helper should keep script lint coverage');
  assertTrue(cssModuleBehaviorHelper.names.includes('verify:css-modules:size'), 'CSS Module size behavior helper should keep production gate coverage');
  assertTrue(cssModuleBehaviorHelper.names.includes('verify:css-modules:size-behavior'), 'CSS Module size behavior helper should select its behavior gate');
  assertTrue(cssModuleBehaviorHelper.names.includes('verify:frontend:structure-gate-registry'), 'CSS Module size behavior helper should select structure registry guard');
  assertFalse(cssModuleBehaviorHelper.names.includes('verify:backend:size'), 'CSS Module size behavior helper should not fall back to backend size gate');

  const designCheck = selectAffectedGates(registry, ['scripts/checks/design/token-values-sync.mjs']);
  assertTrue(designCheck.names.includes('verify:design:token-values-sync'), 'design check command should select its paired gate');
  assertTrue(designCheck.names.includes('verify:design:behavior-gate-registry'), 'design check command should select design registry guard');

  const designTokenValuesHelper = selectAffectedGates(registry, ['scripts/lib/design/design-token-values-sync-core.mjs']);
  assertTrue(designTokenValuesHelper.names.includes('lint:scripts'), 'design token values helper should keep script lint coverage');
  assertTrue(designTokenValuesHelper.names.includes('verify:design:token-values-sync'), 'design token values helper should select production gate');
  assertTrue(designTokenValuesHelper.names.includes('verify:design:token-values-sync-behavior'), 'design token values helper should select behavior coverage');
  assertTrue(designTokenValuesHelper.names.includes('verify:design:behavior-gate-registry'), 'design token values helper should select design registry guard');
  assertFalse(designTokenValuesHelper.names.includes('verify:backend:size'), 'design token values helper should not fall back to backend size gate');

  const designTokenValuesBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/design/design-token-values-sync-behavior-fixtures.mjs']);
  assertTrue(designTokenValuesBehaviorFixture.names.includes('lint:scripts'), 'design token values behavior fixture should keep script lint coverage');
  assertTrue(designTokenValuesBehaviorFixture.names.includes('verify:design:token-values-sync-behavior'), 'design token values behavior fixture should select behavior coverage');
  assertTrue(designTokenValuesBehaviorFixture.names.includes('verify:design:behavior-gate-registry'), 'design token values behavior fixture should select design registry guard');
  assertFalse(designTokenValuesBehaviorFixture.names.includes('verify:backend:size'), 'design token values behavior fixture should not fall back to backend size gate');

  const designTokenMirrorHelper = selectAffectedGates(registry, ['scripts/lib/design/design-token-mirror-sync-core.mjs']);
  assertTrue(designTokenMirrorHelper.names.includes('lint:scripts'), 'design token mirror helper should keep script lint coverage');
  assertTrue(designTokenMirrorHelper.names.includes('verify:design:mirror'), 'design token mirror helper should select production gate');
  assertTrue(designTokenMirrorHelper.names.includes('verify:frontend:delivery-gate-registry'), 'design token mirror helper should select frontend delivery registry guard');
  assertFalse(designTokenMirrorHelper.names.includes('verify:backend:size'), 'design token mirror helper should not fall back to backend size gate');

  const designRuntimeTokenHelper = selectAffectedGates(registry, ['scripts/lib/design/design-runtime-token-sync-core.mjs']);
  assertTrue(designRuntimeTokenHelper.names.includes('lint:scripts'), 'design runtime token helper should keep script lint coverage');
  assertTrue(designRuntimeTokenHelper.names.includes('verify:design:runtime-tokens'), 'design runtime token helper should select production gate');
  assertTrue(designRuntimeTokenHelper.names.includes('verify:design:runtime-tokens-behavior'), 'design runtime token helper should select behavior coverage');
  assertTrue(designRuntimeTokenHelper.names.includes('verify:frontend:delivery-gate-registry'), 'design runtime token helper should select frontend delivery registry guard');
  assertFalse(designRuntimeTokenHelper.names.includes('verify:backend:size'), 'design runtime token helper should not fall back to backend size gate');

  const designRuntimeTokenBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/design/design-runtime-token-sync-behavior-fixtures.mjs']);
  assertTrue(designRuntimeTokenBehaviorFixture.names.includes('lint:scripts'), 'design runtime token behavior fixture should keep script lint coverage');
  assertTrue(designRuntimeTokenBehaviorFixture.names.includes('verify:design:runtime-tokens-behavior'), 'design runtime token behavior fixture should select behavior coverage');
  assertTrue(designRuntimeTokenBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'), 'design runtime token behavior fixture should select frontend delivery registry guard');
  assertFalse(designRuntimeTokenBehaviorFixture.names.includes('verify:backend:size'), 'design runtime token behavior fixture should not fall back to backend size gate');

  const designBehaviorRegistryFixture = selectAffectedGates(registry, ['scripts/lib/design/design-behavior-gate-registry-behavior-fixtures.mjs']);
  assertTrue(designBehaviorRegistryFixture.names.includes('lint:scripts'), 'design behavior registry fixture should keep script lint coverage');
  assertTrue(designBehaviorRegistryFixture.names.includes('verify:design:behavior-gate-registry-behavior'), 'design behavior registry fixture should select behavior gate');
  assertTrue(designBehaviorRegistryFixture.names.includes('verify:design:behavior-gate-registry'), 'design behavior registry fixture should select production registry gate');
  assertFalse(designBehaviorRegistryFixture.names.includes('verify:backend:size'), 'design behavior registry fixture should not fall back to backend size gate');

  const rawColorsNonModuleHelper = selectAffectedGates(registry, ['scripts/lib/design/raw-colors-non-modules-core.mjs']);
  assertTrue(rawColorsNonModuleHelper.names.includes('lint:scripts'), 'non-module raw color helper should keep script lint coverage');
  assertTrue(rawColorsNonModuleHelper.names.includes('verify:design:raw-colors'), 'non-module raw color helper should select raw color production gate');
  assertTrue(rawColorsNonModuleHelper.names.includes('verify:design:raw-colors-behavior'), 'non-module raw color helper should select raw color behavior gate');
  assertTrue(rawColorsNonModuleHelper.names.includes('verify:design:behavior-gate-registry'), 'non-module raw color helper should select design registry guard');
  assertFalse(rawColorsNonModuleHelper.names.includes('verify:backend:size'), 'non-module raw color helper should not fall back to backend size gate');

  const rawColorsCssModuleHelper = selectAffectedGates(registry, ['scripts/lib/design/raw-colors-css-modules-core.mjs']);
  assertTrue(rawColorsCssModuleHelper.names.includes('lint:scripts'), 'CSS Module raw color helper should keep script lint coverage');
  assertTrue(rawColorsCssModuleHelper.names.includes('verify:design:raw-colors'), 'CSS Module raw color helper should select raw color production gate');
  assertTrue(rawColorsCssModuleHelper.names.includes('verify:design:raw-colors-behavior'), 'CSS Module raw color helper should select raw color behavior gate');
  assertTrue(rawColorsCssModuleHelper.names.includes('verify:design:behavior-gate-registry'), 'CSS Module raw color helper should select design registry guard');
  assertFalse(rawColorsCssModuleHelper.names.includes('verify:backend:size'), 'CSS Module raw color helper should not fall back to backend size gate');

  const rawColorsBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/design/raw-colors-behavior-fixtures.mjs']);
  assertTrue(rawColorsBehaviorFixture.names.includes('lint:scripts'), 'raw color behavior fixture should keep script lint coverage');
  assertTrue(rawColorsBehaviorFixture.names.includes('verify:design:raw-colors'), 'raw color behavior fixture should keep production raw color coverage');
  assertTrue(rawColorsBehaviorFixture.names.includes('verify:design:raw-colors-behavior'), 'raw color behavior fixture should select raw color behavior gate');
  assertTrue(rawColorsBehaviorFixture.names.includes('verify:design:behavior-gate-registry'), 'raw color behavior fixture should select design registry guard');
  assertFalse(rawColorsBehaviorFixture.names.includes('verify:backend:size'), 'raw color behavior fixture should not fall back to backend size gate');

  const rawColorSourceAllowlistBehaviorFixture = selectAffectedGates(registry, [
    'scripts/lib/design/raw-color-source-allowlist-behavior-fixtures.mjs',
  ]);
  assertTrue(rawColorSourceAllowlistBehaviorFixture.names.includes('lint:scripts'), 'raw color source allowlist behavior fixture should keep script lint coverage');
  assertTrue(
    rawColorSourceAllowlistBehaviorFixture.names.includes('verify:design:raw-color-source-allowlist-behavior'),
    'raw color source allowlist behavior fixture should select source allowlist behavior gate',
  );
  assertTrue(
    rawColorSourceAllowlistBehaviorFixture.names.includes('verify:design:behavior-gate-registry'),
    'raw color source allowlist behavior fixture should select design registry guard',
  );
  assertFalse(
    rawColorSourceAllowlistBehaviorFixture.names.includes('verify:backend:size'),
    'raw color source allowlist behavior fixture should not fall back to backend size gate',
  );

  const designDocsCheck = selectAffectedGates(registry, ['scripts/checks/design/docs-drift.mjs']);
  assertTrue(designDocsCheck.names.includes('verify:design:docs'), 'design docs check command should select its direct package gate');
  assertTrue(designDocsCheck.names.includes('verify:design:behavior-gate-registry'), 'design docs check command should select design registry guard');

  const designDocsDriftHelper = selectAffectedGates(registry, ['scripts/lib/design/design-docs-drift-core.mjs']);
  assertTrue(designDocsDriftHelper.names.includes('lint:scripts'), 'design docs drift helper should keep script lint coverage');
  assertTrue(designDocsDriftHelper.names.includes('verify:design:docs'), 'design docs drift helper should select docs drift gate');
  assertTrue(designDocsDriftHelper.names.includes('verify:design:docs-behavior'), 'design docs drift helper should select docs drift behavior gate');
  assertTrue(designDocsDriftHelper.names.includes('verify:design:behavior-gate-registry'), 'design docs drift helper should select design registry guard');
  assertFalse(designDocsDriftHelper.names.includes('verify:backend:size'), 'design docs drift helper should not fall back to backend size gate');

  const designDocsDriftBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/design/design-docs-drift-behavior-fixtures.mjs']);
  assertTrue(designDocsDriftBehaviorFixture.names.includes('lint:scripts'), 'design docs drift behavior fixture should keep script lint coverage');
  assertTrue(designDocsDriftBehaviorFixture.names.includes('verify:design:docs-behavior'), 'design docs drift behavior fixture should select docs drift behavior gate');
  assertTrue(designDocsDriftBehaviorFixture.names.includes('verify:design:behavior-gate-registry'), 'design docs drift behavior fixture should select design registry guard');
  assertFalse(designDocsDriftBehaviorFixture.names.includes('verify:backend:size'), 'design docs drift behavior fixture should not fall back to backend size gate');

  const designTypographyCheck = selectAffectedGates(registry, ['scripts/checks/design/css-module-typography-values.mjs']);
  assertTrue(designTypographyCheck.names.includes('verify:design:typography'), 'design typography check command should select its aggregate package gate');
  assertTrue(designTypographyCheck.names.includes('verify:design:behavior-gate-registry'), 'design typography check command should select design registry guard');

  const designTypographyHelper = selectAffectedGates(registry, ['scripts/lib/design/css-module-typography-values-core.mjs']);
  assertTrue(designTypographyHelper.names.includes('lint:scripts'), 'design typography helper should keep script lint coverage');
  assertTrue(designTypographyHelper.names.includes('verify:design:typography'), 'design typography helper should select typography gate');
  assertTrue(designTypographyHelper.names.includes('verify:design:behavior-gate-registry'), 'design typography helper should select design registry guard');
  assertFalse(designTypographyHelper.names.includes('verify:backend:size'), 'design typography helper should not fall back to backend size gate');

  const tailwindUtilityColorHelper = selectAffectedGates(registry, ['scripts/lib/design/tailwind-utility-color-core.mjs']);
  assertTrue(
    tailwindUtilityColorHelper.names.includes('verify:design:tailwind-utilities'),
    'Tailwind utility color helper should select production Tailwind utility gate',
  );
  assertTrue(
    tailwindUtilityColorHelper.names.includes('verify:design:tailwind-utilities-behavior'),
    'Tailwind utility color helper should select behavior Tailwind utility gate',
  );
  assertTrue(
    tailwindUtilityColorHelper.names.includes('verify:design:behavior-gate-registry'),
    'Tailwind utility color helper should select design registry guard',
  );

  const tailwindUtilityColorCheckHelper = selectAffectedGates(registry, ['scripts/lib/design/tailwind-utility-color-check.mjs']);
  assertTrue(tailwindUtilityColorCheckHelper.names.includes('lint:scripts'), 'Tailwind utility color check helper should keep script lint coverage');
  assertTrue(
    tailwindUtilityColorCheckHelper.names.includes('verify:design:tailwind-utilities'),
    'Tailwind utility color check helper should select production Tailwind utility gate',
  );
  assertTrue(
    tailwindUtilityColorCheckHelper.names.includes('verify:design:tailwind-utilities-behavior'),
    'Tailwind utility color check helper should select behavior Tailwind utility gate',
  );
  assertTrue(
    tailwindUtilityColorCheckHelper.names.includes('verify:design:behavior-gate-registry'),
    'Tailwind utility color check helper should select design registry guard',
  );
  assertFalse(
    tailwindUtilityColorCheckHelper.names.includes('verify:backend:size'),
    'Tailwind utility color check helper should not fall back to backend size gate',
  );

  const tailwindUtilityColorBehaviorFixture = selectAffectedGates(registry, [
    'scripts/lib/design/tailwind-utility-colors-behavior-fixtures.mjs',
  ]);
  assertTrue(tailwindUtilityColorBehaviorFixture.names.includes('lint:scripts'), 'Tailwind utility color behavior fixture should keep script lint coverage');
  assertTrue(
    tailwindUtilityColorBehaviorFixture.names.includes('verify:design:tailwind-utilities-behavior'),
    'Tailwind utility color behavior fixture should select behavior Tailwind utility gate',
  );
  assertTrue(
    tailwindUtilityColorBehaviorFixture.names.includes('verify:design:behavior-gate-registry'),
    'Tailwind utility color behavior fixture should select design registry guard',
  );
  assertFalse(
    tailwindUtilityColorBehaviorFixture.names.includes('verify:backend:size'),
    'Tailwind utility color behavior fixture should not fall back to backend size gate',
  );

  const tailwindTokenAliasHelper = selectAffectedGates(registry, ['scripts/lib/design/tailwind-token-aliases-core.mjs']);
  assertTrue(
    tailwindTokenAliasHelper.names.includes('verify:design:tailwind'),
    'Tailwind token alias helper should select production Tailwind token gate',
  );
  assertTrue(
    tailwindTokenAliasHelper.names.includes('verify:design:tailwind-behavior'),
    'Tailwind token alias helper should select behavior Tailwind token gate',
  );
  assertTrue(
    tailwindTokenAliasHelper.names.includes('verify:design:behavior-gate-registry'),
    'Tailwind token alias helper should select design registry guard',
  );

  const tailwindTokenAliasBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/design/tailwind-token-aliases-behavior-fixtures.mjs']);
  assertTrue(
    tailwindTokenAliasBehaviorFixture.names.includes('lint:scripts'),
    'Tailwind token alias behavior fixture should keep script lint coverage',
  );
  assertTrue(
    tailwindTokenAliasBehaviorFixture.names.includes('verify:design:tailwind-behavior'),
    'Tailwind token alias behavior fixture should select behavior gate',
  );
  assertTrue(
    tailwindTokenAliasBehaviorFixture.names.includes('verify:design:behavior-gate-registry'),
    'Tailwind token alias behavior fixture should select design registry guard',
  );
  assertFalse(
    tailwindTokenAliasBehaviorFixture.names.includes('verify:design:tailwind'),
    'Tailwind token alias behavior fixture should not select production gate',
  );
  assertFalse(
    tailwindTokenAliasBehaviorFixture.names.includes('verify:backend:size'),
    'Tailwind token alias behavior fixture should not fall back to backend size gate',
  );

  const tailwindNonColorAliasHelper = selectAffectedGates(registry, ['scripts/lib/design/tailwind-non-color-token-aliases-core.mjs']);
  assertTrue(
    tailwindNonColorAliasHelper.names.includes('verify:design:tailwind-non-color-aliases'),
    'Tailwind non-color alias helper should select production Tailwind non-color alias gate',
  );
  assertTrue(
    tailwindNonColorAliasHelper.names.includes('verify:design:tailwind-non-color-aliases-behavior'),
    'Tailwind non-color alias helper should select behavior Tailwind non-color alias gate',
  );
  assertTrue(
    tailwindNonColorAliasHelper.names.includes('verify:design:behavior-gate-registry'),
    'Tailwind non-color alias helper should select design registry guard',
  );

  const tailwindNonColorAliasBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/design/tailwind-non-color-token-aliases-behavior-fixtures.mjs']);
  assertTrue(
    tailwindNonColorAliasBehaviorFixture.names.includes('verify:design:tailwind-non-color-aliases-behavior'),
    'Tailwind non-color alias behavior fixture should select behavior gate',
  );
  assertTrue(
    tailwindNonColorAliasBehaviorFixture.names.includes('verify:design:behavior-gate-registry'),
    'Tailwind non-color alias behavior fixture should select design registry guard',
  );
  assertFalse(
    tailwindNonColorAliasBehaviorFixture.names.includes('verify:design:tailwind-non-color-aliases'),
    'Tailwind non-color alias behavior fixture should not select production gate',
  );

  const antdThemeTokenSyncHelper = selectAffectedGates(registry, ['scripts/lib/design/antd-theme-token-sync-core.mjs']);
  assertTrue(
    antdThemeTokenSyncHelper.names.includes('verify:design:antd-theme-token-sync'),
    'Ant Design theme token sync helper should select production AntD theme gate',
  );
  assertTrue(
    antdThemeTokenSyncHelper.names.includes('verify:design:antd-theme-token-sync-behavior'),
    'Ant Design theme token sync helper should select behavior AntD theme gate',
  );
  assertTrue(
    antdThemeTokenSyncHelper.names.includes('verify:design:behavior-gate-registry'),
    'Ant Design theme token sync helper should select design registry guard',
  );

  const antdTableSelectorHelper = selectAffectedGates(registry, ['scripts/lib/design/antd-table-selectors-core.mjs']);
  assertTrue(
    antdTableSelectorHelper.names.includes('verify:design:antd-table-selectors'),
    'Ant Design table selector helper should select production AntD table selector gate',
  );
  assertTrue(
    antdTableSelectorHelper.names.includes('verify:design:antd-table-selectors-behavior'),
    'Ant Design table selector helper should select behavior AntD table selector gate',
  );
  assertTrue(
    antdTableSelectorHelper.names.includes('verify:design:behavior-gate-registry'),
    'Ant Design table selector helper should select design registry guard',
  );

  const antdTableSelectorBehaviorFixture = selectAffectedGates(registry, ['scripts/fixtures/design/antd-table-selectors.behavior-fixtures.mjs']);
  assertTrue(
    antdTableSelectorBehaviorFixture.names.includes('verify:design:antd-table-selectors-behavior'),
    'Ant Design table selector behavior fixture should select behavior AntD table selector gate',
  );
  assertTrue(
    antdTableSelectorBehaviorFixture.names.includes('verify:design:behavior-gate-registry'),
    'Ant Design table selector behavior fixture should select design registry guard',
  );
  assertTrue(
    antdTableSelectorBehaviorFixture.names.includes('lint:scripts'),
    'Ant Design table selector behavior fixture should keep script lint coverage',
  );

  const antdThemeTokenSyncBehaviorFixture = selectAffectedGates(registry, ['scripts/fixtures/design/antd-theme-token-sync.behavior-fixtures.mjs']);
  assertTrue(
    antdThemeTokenSyncBehaviorFixture.names.includes('verify:design:antd-theme-token-sync-behavior'),
    'Ant Design theme token sync behavior fixture should select behavior AntD theme gate',
  );
  assertTrue(
    antdThemeTokenSyncBehaviorFixture.names.includes('verify:design:behavior-gate-registry'),
    'Ant Design theme token sync behavior fixture should select design registry guard',
  );

  const echartsCssTokenSyncHelper = selectAffectedGates(registry, ['scripts/lib/design/echarts-css-token-sync-core.mjs']);
  assertTrue(
    echartsCssTokenSyncHelper.names.includes('verify:design:echarts-css-token-sync'),
    'ECharts CSS token sync helper should select production ECharts CSS token gate',
  );
  assertTrue(
    echartsCssTokenSyncHelper.names.includes('verify:design:echarts-css-token-sync-behavior'),
    'ECharts CSS token sync helper should select behavior ECharts CSS token gate',
  );
  assertTrue(
    echartsCssTokenSyncHelper.names.includes('verify:design:behavior-gate-registry'),
    'ECharts CSS token sync helper should select design registry guard',
  );

  const echartsCssTokenSyncBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/design/echarts-css-token-sync-behavior-fixtures.mjs']);
  assertTrue(
    echartsCssTokenSyncBehaviorFixture.names.includes('verify:design:echarts-css-token-sync-behavior'),
    'ECharts CSS token sync behavior fixture should select behavior ECharts CSS token gate',
  );
  assertTrue(
    echartsCssTokenSyncBehaviorFixture.names.includes('verify:design:behavior-gate-registry'),
    'ECharts CSS token sync behavior fixture should select design registry guard',
  );
  assertFalse(
    echartsCssTokenSyncBehaviorFixture.names.includes('verify:design:echarts-css-token-sync'),
    'ECharts CSS token sync behavior fixture should not select production gate',
  );

  const echartsThemeTokenSyncHelper = selectAffectedGates(registry, ['scripts/lib/design/echarts-theme-token-sync-core.mjs']);
  assertTrue(
    echartsThemeTokenSyncHelper.names.includes('verify:design:echarts-theme-token-sync'),
    'ECharts theme token sync helper should select production ECharts theme token gate',
  );
  assertTrue(
    echartsThemeTokenSyncHelper.names.includes('verify:design:echarts-theme-token-sync-behavior'),
    'ECharts theme token sync helper should select behavior ECharts theme token gate',
  );
  assertTrue(
    echartsThemeTokenSyncHelper.names.includes('verify:design:behavior-gate-registry'),
    'ECharts theme token sync helper should select design registry guard',
  );

  const echartsThemeTokenSyncBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/design/echarts-theme-token-sync-behavior-fixtures.mjs']);
  assertTrue(
    echartsThemeTokenSyncBehaviorFixture.names.includes('verify:design:echarts-theme-token-sync-behavior'),
    'ECharts theme token sync behavior fixture should select behavior ECharts theme token gate',
  );
  assertTrue(
    echartsThemeTokenSyncBehaviorFixture.names.includes('verify:design:behavior-gate-registry'),
    'ECharts theme token sync behavior fixture should select design registry guard',
  );
  assertFalse(
    echartsThemeTokenSyncBehaviorFixture.names.includes('verify:design:echarts-theme-token-sync'),
    'ECharts theme token sync behavior fixture should not select production gate',
  );

  const designBehaviorGuardQualityHelper = selectAffectedGates(registry, ['scripts/lib/design/design-behavior-guard-quality-core.mjs']);
  assertTrue(designBehaviorGuardQualityHelper.names.includes('lint:scripts'), 'design behavior guard quality helper should keep script lint coverage');
  assertTrue(
    designBehaviorGuardQualityHelper.names.includes('verify:design:behavior-guard-quality'),
    'design behavior guard quality helper should select production quality gate',
  );
  assertTrue(
    designBehaviorGuardQualityHelper.names.includes('verify:design:behavior-guard-quality-behavior'),
    'design behavior guard quality helper should select behavior fixture gate',
  );
  assertTrue(
    designBehaviorGuardQualityHelper.names.includes('verify:design:behavior-gate-registry'),
    'design behavior guard quality helper should select design registry guard',
  );
  assertFalse(
    designBehaviorGuardQualityHelper.names.includes('verify:backend:size'),
    'design behavior guard quality helper should not fall back to backend size gate',
  );

  const designBehaviorGuardQualityFixture = selectAffectedGates(
    registry,
    ['scripts/lib/design/design-behavior-guard-quality-behavior-fixtures.mjs'],
  );
  assertTrue(designBehaviorGuardQualityFixture.names.includes('lint:scripts'), 'design behavior guard quality fixture should keep script lint coverage');
  assertTrue(
    designBehaviorGuardQualityFixture.names.includes('verify:design:behavior-guard-quality-behavior'),
    'design behavior guard quality fixture should select behavior fixture gate',
  );
  assertTrue(
    designBehaviorGuardQualityFixture.names.includes('verify:design:behavior-gate-registry'),
    'design behavior guard quality fixture should select design registry guard',
  );
  assertFalse(
    designBehaviorGuardQualityFixture.names.includes('verify:backend:size'),
    'design behavior guard quality fixture should not fall back to backend size gate',
  );

  const rootDesignCheck = selectAffectedGates(registry, ['scripts/checks/design/behavior-guard-quality.mjs']);
  assertTrue(
    rootDesignCheck.names.includes('verify:design:behavior-guard-quality'),
    'design meta check command should select its exact package gate',
  );

  const rootDesignBehaviorCheck = selectAffectedGates(registry, ['scripts/checks/design/behavior-guard-quality.behavior.mjs']);
  assertTrue(
    rootDesignBehaviorCheck.names.includes('verify:design:behavior-guard-quality-behavior'),
    'design meta behavior check command should select its exact package gate',
  );

  for (const file of [
    'scripts/lib/shared/behavior-guard-quality.mjs',
    'scripts/lib/shared/behavior-guard-classifiers.mjs',
    'scripts/lib/shared/behavior-guard-source-scan.mjs',
  ]) {
    const behaviorQualityHelper = selectAffectedGates(registry, [file]);
    assertTrue(
      behaviorQualityHelper.names.includes('verify:design:behavior-guard-quality'),
      `${file} should select design behavior guard quality`,
    );
    assertTrue(
      behaviorQualityHelper.names.includes('verify:frontend:behavior-guard-quality'),
      `${file} should select frontend behavior guard quality`,
    );
    assertTrue(
      behaviorQualityHelper.names.includes('verify:weekly:behavior-guard-quality'),
      `${file} should select weekly behavior guard quality`,
    );
  }
}
