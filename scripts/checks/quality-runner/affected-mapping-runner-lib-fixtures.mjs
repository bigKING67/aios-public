import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';
import {
  CI_META_GATES,
} from '../../lib/quality/quality-affected-gates.mjs';
import {
  CHECK_GUARD_HELPER_INPUTS,
} from '../../lib/quality/quality-gate-inputs.mjs';
import {
  SCHEDULER_SLICE_GATES,
} from './affected-mapping-scheduler-fixtures.mjs';

export function assertQualityRunnerLibAffectedMapping({
  assertExcludesAll,
  assertFalse,
  assertIncludesAll,
  assertTrue,
  registry,
}) {
  const qualityAffectedGates = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-gates.mjs']);
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:registry'), 'quality affected gate group metadata should select registry slice');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:affected-mapping'), 'quality affected gate group metadata should select affected mapping slice');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:affected-explain'), 'quality affected gate group metadata should select affected explain slice');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:affected-runtime-status'), 'quality affected gate group metadata should select affected runtime status slice');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected gate group metadata should select affected runtime env slice');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:cache-key-digest'), 'quality affected gate group metadata should select cache key digest slice');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:cache-key-env'), 'quality affected gate group metadata should select cache key env slice');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:cache-key-tool-version'), 'quality affected gate group metadata should select cache key tool-version slice');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:cache-local'), 'quality affected gate group metadata should select cache execution slices');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:cache-stats'), 'quality affected gate group metadata should select cache stats slice');
  assertTrue(qualityAffectedGates.names.includes('verify:quality-runner:manifest'), 'quality affected gate group metadata should select manifest slice');
  assertIncludesAll(qualityAffectedGates.names, SCHEDULER_SLICE_GATES, 'quality affected gate group metadata should select scheduler slices');
  assertFalse(qualityAffectedGates.names.includes('verify:quality-runner:hook'), 'quality affected gate group metadata should not select hook slice');

  const qualityRunnerLibGateGroups = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-lib-gate-groups.mjs']);
  assertTrue(qualityRunnerLibGateGroups.names.includes('verify:quality-runner:registry'), 'quality runner lib gate group helper should select registry slice');
  assertTrue(qualityRunnerLibGateGroups.names.includes('verify:quality-runner:affected-mapping'), 'quality runner lib gate group helper should select affected mapping slice');
  assertTrue(qualityRunnerLibGateGroups.names.includes('verify:quality-runner:cache-key-digest'), 'quality runner lib gate group helper should select cache key digest slice');
  assertTrue(qualityRunnerLibGateGroups.names.includes('verify:quality-runner:manifest'), 'quality runner lib gate group helper should select manifest slice');
  assertIncludesAll(qualityRunnerLibGateGroups.names, SCHEDULER_SLICE_GATES, 'quality runner lib gate group helper should select scheduler slices');
  assertFalse(qualityRunnerLibGateGroups.names.includes('verify:quality-runner:hook'), 'quality runner lib gate group helper should not select hook slice');

  const qualityAllowlistAffectedGates = selectAffectedGates(registry, ['scripts/lib/quality/quality-allowlist-affected-gates.mjs']);
  assertTrue(qualityAllowlistAffectedGates.names.includes('verify:quality-runner:registry'), 'quality allowlist affected helper should select registry self-check slice');
  assertTrue(qualityAllowlistAffectedGates.names.includes('verify:quality-runner:affected-mapping'), 'quality allowlist affected helper should select affected mapping slice');
  assertTrue(qualityAllowlistAffectedGates.names.includes('verify:quality-runner:affected-mode'), 'quality allowlist affected helper should select affected mode slice');
  assertExcludesAll(qualityAllowlistAffectedGates.names, SCHEDULER_SLICE_GATES, 'quality allowlist affected helper should not select scheduler self-check slice');
  assertFalse(qualityAllowlistAffectedGates.names.includes('verify:quality-runner:cache-local'), 'quality allowlist affected helper should not fan out to cache slice');

  const qualityGateInputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-inputs.mjs']);
  assertTrue(qualityGateInputs.names.includes('verify:quality-runner:registry'), 'quality gate input helper should select registry self-check slice');
  assertExcludesAll(qualityGateInputs.names, SCHEDULER_SLICE_GATES, 'quality gate input helper should not select scheduler self-check slice');

  for (const file of CHECK_GUARD_HELPER_INPUTS) {
    const guardHelper = selectAffectedGates(registry, [file]);
    assertTrue(
      guardHelper.names.includes('verify:ci:guard-utils-behavior'),
      `${file} should select shared guard utility behavior`,
    );
  }

  const guardUtilsBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/shared/guard-utils-behavior-fixtures.mjs']);
  assertTrue(
    guardUtilsBehaviorFixture.names.includes('lint:scripts'),
    'guard utils behavior fixture should keep script lint coverage',
  );
  assertTrue(
    guardUtilsBehaviorFixture.names.includes('verify:ci:guard-utils-behavior'),
    'guard utils behavior fixture should select guard utils behavior gate',
  );

  const gateFixtureUtilsHelper = selectAffectedGates(registry, ['scripts/lib/shared/gate-fixture-utils.mjs']);
  assertTrue(
    gateFixtureUtilsHelper.names.includes('lint:scripts'),
    'gate fixture utils helper should keep script lint coverage',
  );
  assertTrue(
    gateFixtureUtilsHelper.names.includes('verify:ci:gate-fixture-utils-behavior'),
    'gate fixture utils helper should select gate fixture behavior',
  );
  assertFalse(gateFixtureUtilsHelper.names.includes('verify:backend:check'), 'gate fixture utils helper should not use backend safe fallback');

  const gateFixtureUtilsBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/shared/gate-fixture-utils-behavior-fixtures.mjs']);
  assertTrue(
    gateFixtureUtilsBehaviorFixture.names.includes('lint:scripts'),
    'gate fixture utils behavior fixture should keep script lint coverage',
  );
  assertTrue(
    gateFixtureUtilsBehaviorFixture.names.includes('verify:ci:gate-fixture-utils-behavior'),
    'gate fixture utils behavior fixture should select gate fixture behavior',
  );
  assertExcludesAll(
    gateFixtureUtilsBehaviorFixture.names,
    CI_META_GATES.filter((name) => name !== 'verify:ci:gate-fixture-utils-behavior'),
    'gate fixture utils behavior fixture should not fan out to unrelated CI meta gates',
  );
  assertFalse(gateFixtureUtilsBehaviorFixture.names.includes('verify:backend:check'), 'gate fixture utils behavior fixture should not use backend safe fallback');

  const qualityGateInputExpansion = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-input-expansion.mjs']);
  assertTrue(qualityGateInputExpansion.names.includes('verify:quality-runner:registry'), 'quality gate input expansion helper should select registry self-check slice');
  assertExcludesAll(qualityGateInputExpansion.names, SCHEDULER_SLICE_GATES, 'quality gate input expansion helper should not select scheduler self-check slice');

  const qualityGateCommandTargets = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-command-targets.mjs']);
  assertTrue(qualityGateCommandTargets.names.includes('verify:quality-runner:registry'), 'quality gate command target helper should select registry self-check slice');
  assertTrue(qualityGateCommandTargets.names.includes('verify:quality-runner:affected-mapping'), 'quality gate command target helper should select affected mapping slice');
  assertTrue(qualityGateCommandTargets.names.includes('verify:quality-runner:affected-explain'), 'quality gate command target helper should select affected explain slice');
  assertExcludesAll(qualityGateCommandTargets.names, SCHEDULER_SLICE_GATES, 'quality gate command target helper should not select scheduler self-check slice');

  const qualityGateNamedInputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-named-inputs.mjs']);
  assertTrue(qualityGateNamedInputs.names.includes('verify:quality-runner:registry'), 'quality gate named input helper should select registry self-check slice');
  assertExcludesAll(qualityGateNamedInputs.names, SCHEDULER_SLICE_GATES, 'quality gate named input helper should not select scheduler self-check slice');

  const qualityFrontendAffectedGates = selectAffectedGates(registry, ['scripts/lib/quality/quality-frontend-affected-gates.mjs']);
  assertTrue(qualityFrontendAffectedGates.names.includes('verify:quality-runner:affected-mapping'), 'quality frontend affected gate constants should select affected mapping slice');
  assertTrue(qualityFrontendAffectedGates.names.includes('verify:quality-runner:affected-mode'), 'quality frontend affected gate constants should select affected mode slice');
  assertFalse(qualityFrontendAffectedGates.names.includes('verify:quality-runner:cache-local'), 'quality frontend affected gate constants should not fan out to cache slice');

  const qualityGateRegistryBaseGates = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-registry-base-gates.mjs']);
  assertTrue(qualityGateRegistryBaseGates.names.includes('verify:quality-runner:registry'), 'quality gate registry base-gate helper should select registry self-check slice');
  assertExcludesAll(qualityGateRegistryBaseGates.names, SCHEDULER_SLICE_GATES, 'quality gate registry base-gate helper should not select scheduler self-check slice');

  const qualityGateRegistryGates = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-registry-gates.mjs']);
  assertTrue(qualityGateRegistryGates.names.includes('verify:quality-runner:registry'), 'quality gate registry gate materialization helper should select registry self-check slice');
  assertExcludesAll(qualityGateRegistryGates.names, SCHEDULER_SLICE_GATES, 'quality gate registry gate materialization helper should not select scheduler self-check slice');

  const qualityGateRegistryInference = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-registry-inference.mjs']);
  assertTrue(qualityGateRegistryInference.names.includes('verify:quality-runner:registry'), 'quality gate registry inference helper should select registry self-check slice');
  assertExcludesAll(qualityGateRegistryInference.names, SCHEDULER_SLICE_GATES, 'quality gate registry inference helper should not select scheduler self-check slice');

  const qualityGateRegistryMetadata = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-registry-metadata.mjs']);
  assertTrue(qualityGateRegistryMetadata.names.includes('verify:quality-runner:registry'), 'quality gate registry metadata helper should select registry self-check slice');
  assertExcludesAll(qualityGateRegistryMetadata.names, SCHEDULER_SLICE_GATES, 'quality gate registry metadata helper should not select scheduler self-check slice');

  const qualityGateRegistryScripts = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-registry-scripts.mjs']);
  assertTrue(qualityGateRegistryScripts.names.includes('verify:quality-runner:registry'), 'quality gate registry script helper should select registry self-check slice');
  assertExcludesAll(qualityGateRegistryScripts.names, SCHEDULER_SLICE_GATES, 'quality gate registry script helper should not select scheduler self-check slice');

  const qualityGateRegistryValidation = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-registry-validation.mjs']);
  assertTrue(qualityGateRegistryValidation.names.includes('verify:quality-runner:registry'), 'quality gate registry validation helper should select registry self-check slice');
  assertExcludesAll(qualityGateRegistryValidation.names, SCHEDULER_SLICE_GATES, 'quality gate registry validation helper should not select scheduler self-check slice');

  const qualityPackageScriptFastPath = selectAffectedGates(registry, ['scripts/lib/quality/quality-package-script-fast-path.mjs']);
  assertTrue(qualityPackageScriptFastPath.names.includes('verify:quality-runner:affected-mapping'), 'quality package script fast-path helper should select affected mapping slice');
  assertTrue(qualityPackageScriptFastPath.names.includes('verify:quality-runner:affected-mode'), 'quality package script fast-path helper should select affected mode slice');
  assertTrue(qualityPackageScriptFastPath.names.includes('verify:quality-runner:affected-explain'), 'quality package script fast-path helper should select affected explain slice');
  assertFalse(qualityPackageScriptFastPath.names.includes('verify:quality-runner:cache-local'), 'quality package script fast-path helper should not fan out to cache slice');

  const qualityRunnerSlices = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-slices.mjs']);
  assertTrue(qualityRunnerSlices.names.includes('verify:quality-runner:registry'), 'quality runner slice metadata should select registry self-check slice');
  assertExcludesAll(qualityRunnerSlices.names, SCHEDULER_SLICE_GATES, 'quality runner slice metadata should not select scheduler self-check slice');

  const qualityRunnerSliceDefinitions = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-slice-definitions.mjs']);
  assertTrue(qualityRunnerSliceDefinitions.names.includes('verify:quality-runner:registry'), 'quality runner slice definitions should select registry self-check slice');
  assertExcludesAll(qualityRunnerSliceDefinitions.names, SCHEDULER_SLICE_GATES, 'quality runner slice definitions should not select scheduler self-check slice');

  const qualityRunnerSliceDefinitionUtils = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-slice-definition-utils.mjs']);
  assertTrue(qualityRunnerSliceDefinitionUtils.names.includes('verify:quality-runner:registry'), 'quality runner slice definition helper should select registry self-check slice');
  assertExcludesAll(qualityRunnerSliceDefinitionUtils.names, SCHEDULER_SLICE_GATES, 'quality runner slice definition helper should not select scheduler self-check slice');

  const qualityRunnerAffectedSliceDefinitions = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-affected-slice-definitions.mjs']);
  assertTrue(qualityRunnerAffectedSliceDefinitions.names.includes('verify:quality-runner:registry'), 'quality runner affected slice definitions should select registry self-check slice');
  assertExcludesAll(qualityRunnerAffectedSliceDefinitions.names, SCHEDULER_SLICE_GATES, 'quality runner affected slice definitions should not select scheduler self-check slice');

  const qualityRunnerCacheSliceDefinitions = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-cache-slice-definitions.mjs']);
  assertTrue(qualityRunnerCacheSliceDefinitions.names.includes('verify:quality-runner:registry'), 'quality runner cache slice definitions should select registry self-check slice');
  assertExcludesAll(qualityRunnerCacheSliceDefinitions.names, SCHEDULER_SLICE_GATES, 'quality runner cache slice definitions should not select scheduler self-check slice');

  const qualityRunnerCompatSliceDefinitions = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-compat-slice-definitions.mjs']);
  assertTrue(qualityRunnerCompatSliceDefinitions.names.includes('verify:quality-runner:registry'), 'quality runner compat slice definitions should select registry self-check slice');
  assertExcludesAll(qualityRunnerCompatSliceDefinitions.names, SCHEDULER_SLICE_GATES, 'quality runner compat slice definitions should not select scheduler self-check slice');

  const qualityRunnerSliceInputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-slice-inputs.mjs']);
  assertTrue(qualityRunnerSliceInputs.names.includes('verify:quality-runner:registry'), 'quality runner slice input contracts should select registry self-check slice');
  assertExcludesAll(qualityRunnerSliceInputs.names, SCHEDULER_SLICE_GATES, 'quality runner slice input contracts should not select scheduler self-check slice');

  const qualityRunnerAffectedSliceInputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-affected-slice-inputs.mjs']);
  assertTrue(qualityRunnerAffectedSliceInputs.names.includes('verify:quality-runner:registry'), 'quality runner affected slice input contracts should select registry self-check slice');
  assertExcludesAll(qualityRunnerAffectedSliceInputs.names, SCHEDULER_SLICE_GATES, 'quality runner affected slice input contracts should not select scheduler self-check slice');

  const qualityRunnerCacheSliceInputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-cache-slice-inputs.mjs']);
  assertTrue(qualityRunnerCacheSliceInputs.names.includes('verify:quality-runner:registry'), 'quality runner cache slice input contracts should select registry self-check slice');
  assertExcludesAll(qualityRunnerCacheSliceInputs.names, SCHEDULER_SLICE_GATES, 'quality runner cache slice input contracts should not select scheduler self-check slice');

  const qualityRunnerCacheKeySliceInputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-cache-key-slice-inputs.mjs']);
  assertTrue(qualityRunnerCacheKeySliceInputs.names.includes('verify:quality-runner:registry'), 'quality runner cache key slice input contracts should select registry self-check slice');
  assertExcludesAll(qualityRunnerCacheKeySliceInputs.names, SCHEDULER_SLICE_GATES, 'quality runner cache key slice input contracts should not select scheduler self-check slice');

  const qualityRunnerCacheRemoteSliceInputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-cache-remote-slice-inputs.mjs']);
  assertTrue(qualityRunnerCacheRemoteSliceInputs.names.includes('verify:quality-runner:registry'), 'quality runner remote cache slice input contracts should select registry self-check slice');
  assertExcludesAll(qualityRunnerCacheRemoteSliceInputs.names, SCHEDULER_SLICE_GATES, 'quality runner remote cache slice input contracts should not select scheduler self-check slice');

  const qualityRunnerSchedulerSliceInputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-scheduler-slice-inputs.mjs']);
  assertTrue(qualityRunnerSchedulerSliceInputs.names.includes('verify:quality-runner:registry'), 'quality runner scheduler slice input contracts should select registry self-check slice');
  assertExcludesAll(qualityRunnerSchedulerSliceInputs.names, SCHEDULER_SLICE_GATES, 'quality runner scheduler slice input contracts should not select scheduler self-check slice');

  const qualityRunnerPreflightSliceInputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-preflight-slice-inputs.mjs']);
  assertTrue(qualityRunnerPreflightSliceInputs.names.includes('verify:quality-runner:registry'), 'quality runner preflight slice input contracts should select registry self-check slice');
  assertExcludesAll(qualityRunnerPreflightSliceInputs.names, SCHEDULER_SLICE_GATES, 'quality runner preflight slice input contracts should not select scheduler self-check slice');

  const verifyCiRunGateUtils = selectAffectedGates(registry, ['scripts/lib/ci/verify-ci-run-gate-utils.mjs']);
  assertTrue(verifyCiRunGateUtils.names.includes('verify:quality-runner:registry'), 'verify-ci run gate helper should select registry self-check slice');
  assertExcludesAll(verifyCiRunGateUtils.names, SCHEDULER_SLICE_GATES, 'verify-ci run gate helper should not select scheduler self-check slice');

  const packageWiringCore = selectAffectedGates(registry, ['scripts/lib/ci/package-wiring-core.mjs']);
  assertTrue(packageWiringCore.names.includes('lint:scripts'), 'package wiring core should keep script lint coverage');
  assertTrue(packageWiringCore.names.includes('verify:ci:wiring-behavior'), 'package wiring core should select behavior gate');
  assertTrue(packageWiringCore.names.includes('verify:ci:wiring'), 'package wiring core should select production gate');
  assertFalse(packageWiringCore.names.includes('verify:frontend:preflight'), 'package wiring core should not select frontend preflight by generic quick baseline');

  const packageWiringBehaviorFixtures = selectAffectedGates(registry, ['scripts/lib/ci/package-wiring-behavior-fixtures.mjs']);
  assertTrue(packageWiringBehaviorFixtures.names.includes('lint:scripts'), 'package wiring behavior fixtures should keep script lint coverage');
  assertTrue(packageWiringBehaviorFixtures.names.includes('verify:ci:wiring-behavior'), 'package wiring behavior fixtures should select behavior gate');
  assertTrue(packageWiringBehaviorFixtures.names.includes('verify:ci:wiring'), 'package wiring behavior fixtures should keep production gate coverage');
  assertFalse(packageWiringBehaviorFixtures.names.includes('verify:frontend:preflight'), 'package wiring behavior fixtures should not select frontend preflight by generic quick baseline');

  const qualityWorkflowContractCore = selectAffectedGates(registry, ['scripts/lib/ci/quality-workflow-contract-core.mjs']);
  assertTrue(qualityWorkflowContractCore.names.includes('lint:scripts'), 'quality workflow contract core should keep script lint coverage');
  assertTrue(qualityWorkflowContractCore.names.includes('verify:ci:wiring-behavior'), 'quality workflow contract core should select package wiring behavior gate');
  assertTrue(qualityWorkflowContractCore.names.includes('verify:ci:wiring'), 'quality workflow contract core should select package wiring production gate');
  assertTrue(
    qualityWorkflowContractCore.names.includes('verify:quality-runner:cache-remote-config'),
    'quality workflow contract core should select remote cache config consumer gate',
  );
  assertFalse(qualityWorkflowContractCore.names.includes('verify:frontend:preflight'), 'quality workflow contract core should not select frontend preflight by generic quick baseline');

  const verifyCiManifestOrderCore = selectAffectedGates(registry, ['scripts/lib/ci/verify-ci-manifest-order-core.mjs']);
  assertTrue(verifyCiManifestOrderCore.names.includes('lint:scripts'), 'verify-ci manifest order core should keep script lint coverage');
  assertTrue(verifyCiManifestOrderCore.names.includes('verify:ci:manifest-order-behavior'), 'verify-ci manifest order core should select its behavior gate');
  assertTrue(verifyCiManifestOrderCore.names.includes('verify:ci:manifest-order'), 'verify-ci manifest order core should keep production gate coverage');
  assertFalse(verifyCiManifestOrderCore.names.includes('verify:frontend:preflight'), 'verify-ci manifest order core should not select frontend preflight by generic quick baseline');

  const verifyCiManifestOrderBehaviorFixtures = selectAffectedGates(registry, ['scripts/lib/ci/verify-ci-manifest-order-behavior-fixtures.mjs']);
  assertTrue(verifyCiManifestOrderBehaviorFixtures.names.includes('lint:scripts'), 'verify-ci manifest order behavior fixture should keep script lint coverage');
  assertTrue(verifyCiManifestOrderBehaviorFixtures.names.includes('verify:ci:manifest-order-behavior'), 'verify-ci manifest order behavior fixture should select its behavior gate');
  assertTrue(verifyCiManifestOrderBehaviorFixtures.names.includes('verify:ci:manifest-order'), 'verify-ci manifest order behavior fixture should keep production gate coverage');
  assertFalse(verifyCiManifestOrderBehaviorFixtures.names.includes('verify:frontend:preflight'), 'verify-ci manifest order behavior fixture should not select frontend preflight by generic quick baseline');

  const verifyCiDesignRunGates = selectAffectedGates(registry, ['scripts/lib/ci/verify-ci-design-run-gates.mjs']);
  assertTrue(verifyCiDesignRunGates.names.includes('verify:quality-runner:registry'), 'verify-ci design run gates should select registry self-check slice');
  assertTrue(verifyCiDesignRunGates.names.includes('verify:ci:manifest-order'), 'verify-ci design run gates should select ci manifest order check');
  assertFalse(verifyCiDesignRunGates.names.includes('verify:quality-runner:cache-local'), 'verify-ci design run gates should not fan out to cache slice');
  assertExcludesAll(verifyCiDesignRunGates.names, SCHEDULER_SLICE_GATES, 'verify-ci design run gates should not select scheduler self-check slice');

  const verifyCiFrontendRunGates = selectAffectedGates(registry, ['scripts/lib/ci/verify-ci-frontend-run-gates.mjs']);
  assertTrue(verifyCiFrontendRunGates.names.includes('verify:quality-runner:registry'), 'verify-ci frontend run gates should select registry self-check slice');
  assertTrue(verifyCiFrontendRunGates.names.includes('verify:ci:manifest-order'), 'verify-ci frontend run gates should select ci manifest order check');
  assertFalse(verifyCiFrontendRunGates.names.includes('verify:quality-runner:cache-local'), 'verify-ci frontend run gates should not fan out to cache slice');
  assertExcludesAll(verifyCiFrontendRunGates.names, SCHEDULER_SLICE_GATES, 'verify-ci frontend run gates should not select scheduler self-check slice');
}
