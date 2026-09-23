import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export const SCHEDULER_SLICE_GATES = Object.freeze([
  'verify:quality-runner:scheduler-env',
  'verify:quality-runner:scheduler-shell',
  'verify:quality-runner:scheduler-local-bin',
  'verify:quality-runner:scheduler-concurrency',
  'verify:quality-runner:scheduler-cache-bypass',
]);

export function assertSchedulerAndPreflightAffectedMapping({
  assertFalse,
  assertIncludesAll,
  assertTrue,
  registry,
}) {
  const qualityScheduler = selectAffectedGates(registry, ['scripts/lib/quality/quality-scheduler.mjs']);
  assertIncludesAll(qualityScheduler.names, SCHEDULER_SLICE_GATES, 'quality scheduler source should select scheduler self-check slices');

  const qualitySchedulerCache = selectAffectedGates(registry, ['scripts/lib/quality/quality-scheduler-cache.mjs']);
  assertIncludesAll(qualitySchedulerCache.names, SCHEDULER_SLICE_GATES, 'quality scheduler cache helper should select scheduler self-check slices');

  const qualitySchedulerCommand = selectAffectedGates(registry, ['scripts/lib/quality/quality-scheduler-command.mjs']);
  assertIncludesAll(qualitySchedulerCommand.names, SCHEDULER_SLICE_GATES, 'quality scheduler command helper should select scheduler self-check slices');

  const qualitySchedulerGraph = selectAffectedGates(registry, ['scripts/lib/quality/quality-scheduler-graph.mjs']);
  assertIncludesAll(qualitySchedulerGraph.names, SCHEDULER_SLICE_GATES, 'quality scheduler graph helper should select scheduler self-check slices');

  const qualitySchedulerResults = selectAffectedGates(registry, ['scripts/lib/quality/quality-scheduler-results.mjs']);
  assertIncludesAll(qualitySchedulerResults.names, SCHEDULER_SLICE_GATES, 'quality scheduler result helper should select scheduler self-check slices');

  const qualityCacheDigests = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache-digests.mjs']);
  assertTrue(qualityCacheDigests.names.includes('verify:quality-runner:scheduler-cache-bypass'), 'quality cache digest helper should select scheduler cache-bypass slice');

  const qualityCacheArtifactFiles = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache-artifact-files.mjs']);
  assertTrue(qualityCacheArtifactFiles.names.includes('verify:quality-runner:scheduler-cache-bypass'), 'quality cache artifact file helper should select scheduler cache-bypass slice');

  const schedulerSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/scheduler.mjs']);
  assertIncludesAll(schedulerSliceCheck.names, SCHEDULER_SLICE_GATES, 'scheduler compatibility source should select scheduler slices');
  assertFalse(schedulerSliceCheck.names.includes('verify:quality-runner:cache-local'), 'scheduler self-check source should not fan out to unrelated cache slices');
  assertFalse(schedulerSliceCheck.names.includes('verify:quality-runner:hook'), 'scheduler self-check source should not fan out to unrelated hook slice');

  const schedulerEnvSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/scheduler-env.mjs']);
  assertTrue(schedulerEnvSliceCheck.names.includes('verify:quality-runner:scheduler-env'), 'scheduler-env self-check source should select scheduler env slice');
  assertFalse(schedulerEnvSliceCheck.names.includes('verify:quality-runner:scheduler-shell'), 'scheduler-env self-check source should not fan out to scheduler shell slice');
  assertFalse(schedulerEnvSliceCheck.names.includes('verify:quality-runner:cache-local'), 'scheduler-env self-check source should not fan out to cache slice');

  const shellSyntaxCore = selectAffectedGates(registry, ['scripts/lib/ci/shell-syntax-core.mjs']);
  assertTrue(shellSyntaxCore.names.includes('verify:shell:syntax'), 'shell syntax core should select production shell syntax gate');
  assertTrue(shellSyntaxCore.names.includes('verify:quality-runner:scheduler-shell'), 'shell syntax core should select scheduler shell self-check');
  assertTrue(shellSyntaxCore.names.includes('lint:scripts'), 'shell syntax core should keep script lint coverage');
  assertFalse(shellSyntaxCore.names.includes('verify:backend:size'), 'shell syntax core should not fall back to backend size gate');

  const schedulerFixtureCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/scheduler-fixtures.mjs']);
  assertIncludesAll(schedulerFixtureCheck.names, SCHEDULER_SLICE_GATES, 'scheduler fixture helper source should select all scheduler slices');
  assertFalse(schedulerFixtureCheck.names.includes('verify:quality-runner:hook'), 'scheduler fixture helper source should not fan out to hook slice');

  const preflightWrapper = selectAffectedGates(registry, ['scripts/verify-frontend-preflight.sh']);
  assertTrue(preflightWrapper.names.includes('verify:quality-runner:preflight-cache-key'), 'preflight wrapper source should select preflight cache key slice');
  assertTrue(preflightWrapper.names.includes('verify:quality-runner:preflight-cache-wrapper'), 'preflight wrapper source should select preflight cache wrapper slice');
  assertTrue(preflightWrapper.names.includes('verify:frontend:preflight'), 'preflight wrapper source should select production preflight gate');

  for (const helperFile of [
    'scripts/lib/frontend/frontend-preflight-cache-command.mjs',
    'scripts/lib/frontend/frontend-preflight-cache-manifest.mjs',
    'scripts/lib/frontend/frontend-preflight-cache-store.mjs',
  ]) {
    const preflightCacheHelper = selectAffectedGates(registry, [helperFile]);
    assertTrue(preflightCacheHelper.names.includes('verify:quality-runner:preflight-cache-key'), `${helperFile} should select preflight cache key slice`);
    assertTrue(preflightCacheHelper.names.includes('verify:quality-runner:preflight-cache-wrapper'), `${helperFile} should select preflight cache wrapper slice`);
    assertTrue(preflightCacheHelper.names.includes('verify:frontend:preflight'), `${helperFile} should select production preflight gate`);
  }

  const preflightCacheSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/preflight-cache.mjs']);
  assertTrue(preflightCacheSliceCheck.names.includes('verify:quality-runner:preflight-cache-key'), 'preflight-cache compatibility source should select preflight cache key slice');
  assertTrue(preflightCacheSliceCheck.names.includes('verify:quality-runner:preflight-cache-wrapper'), 'preflight-cache compatibility source should select preflight cache wrapper slice');
  assertTrue(preflightCacheSliceCheck.names.includes('verify:frontend:preflight'), 'preflight-cache self-check source should select production preflight gate');
  assertFalse(preflightCacheSliceCheck.names.includes('verify:quality-runner:cache-local'), 'preflight-cache self-check source should not fan out to local cache slice');
  assertFalse(preflightCacheSliceCheck.names.includes('verify:quality-runner:hook'), 'preflight-cache self-check source should not fan out to hook slice');

  const preflightCacheKeySliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/preflight-cache-key.mjs']);
  assertTrue(preflightCacheKeySliceCheck.names.includes('verify:quality-runner:preflight-cache-key'), 'preflight-cache-key self-check source should select key slice');
  assertFalse(preflightCacheKeySliceCheck.names.includes('verify:frontend:preflight'), 'preflight-cache-key self-check source should not select production preflight gate');
  assertFalse(preflightCacheKeySliceCheck.names.includes('verify:quality-runner:preflight-cache-wrapper'), 'preflight-cache-key self-check source should not fan out to wrapper slice');

  const preflightCacheWrapperSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/preflight-cache-wrapper.mjs']);
  assertTrue(preflightCacheWrapperSliceCheck.names.includes('verify:quality-runner:preflight-cache-wrapper'), 'preflight-cache-wrapper self-check source should select wrapper slice');
  assertFalse(preflightCacheWrapperSliceCheck.names.includes('verify:frontend:preflight'), 'preflight-cache-wrapper self-check source should not select production preflight gate');
  assertFalse(preflightCacheWrapperSliceCheck.names.includes('verify:quality-runner:preflight-cache-key'), 'preflight-cache-wrapper self-check source should not fan out to key slice');

  const qualityWorkflow = selectAffectedGates(registry, ['.github/workflows/quality-gate.yml']);
  assertTrue(qualityWorkflow.names.includes('verify:quality-runner:cache-local'), 'quality workflow cache changes should select cache execution self-check');
  assertTrue(
    qualityWorkflow.names.includes('verify:quality-runner:cache-remote-config'),
    'quality workflow cache changes should select remote cache workflow contract self-check',
  );
  assertIncludesAll(qualityWorkflow.names, SCHEDULER_SLICE_GATES, 'quality workflow cache changes should select scheduler self-checks');
  assertFalse(qualityWorkflow.names.includes('verify:quality-runner:hook'), 'quality workflow cache changes should not select unrelated hook self-check');
}
