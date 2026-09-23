import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export const CACHE_REMOTE_SLICE_GATES = Object.freeze([
  'verify:quality-runner:cache-remote-config',
  'verify:quality-runner:cache-remote-result',
  'verify:quality-runner:cache-remote-stats',
  'verify:quality-runner:cache-remote-repair',
  'verify:quality-runner:cache-remote-artifact',
]);

export function assertCacheAffectedMapping({
  assertExcludesAll,
  assertFalse,
  assertIncludesAll,
  assertTrue,
  registry,
}) {
  const qualityCore = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache.mjs']);
  assertTrue(qualityCore.names.includes('lint:scripts'), 'quality scripts should select scripts lint surface');
  assertFalse(qualityCore.names.includes('lint'), 'quality scripts should not select full lint in affected mode');
  assertTrue(qualityCore.names.includes('verify:quality-runner:cache-key-digest'), 'quality cache source should select cache key digest slice');
  assertTrue(qualityCore.names.includes('verify:quality-runner:cache-key-env'), 'quality cache source should select cache key env slice');
  assertTrue(qualityCore.names.includes('verify:quality-runner:cache-key-tool-version'), 'quality cache source should select cache key tool-version slice');
  assertTrue(qualityCore.names.includes('verify:quality-runner:cache-local'), 'quality cache source should select local cache self-check slice');
  assertTrue(qualityCore.names.includes('verify:quality-runner:cache-artifact'), 'quality cache source should select artifact cache self-check slice');
  assertIncludesAll(qualityCore.names, CACHE_REMOTE_SLICE_GATES, 'quality cache source should select remote cache self-check slices');
  assertFalse(qualityCore.names.includes('verify:frontend:preflight'), 'quality cache source should not select frontend preflight unless the preflight cache surface changed');
  assertFalse(qualityCore.names.includes('verify:quality-runner:hook'), 'quality cache source should not select unrelated hook slice');

  const qualityCacheKey = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache-key.mjs']);
  assertTrue(qualityCacheKey.names.includes('verify:quality-runner:cache-key-digest'), 'quality cache key helper should select cache key digest slice');
  assertTrue(qualityCacheKey.names.includes('verify:quality-runner:cache-key-env'), 'quality cache key helper should select cache key env slice');
  assertTrue(qualityCacheKey.names.includes('verify:quality-runner:cache-key-tool-version'), 'quality cache key helper should select cache key tool-version slice');
  assertTrue(qualityCacheKey.names.includes('verify:quality-runner:cache-local'), 'quality cache key helper should select local cache self-check slice');
  assertIncludesAll(qualityCacheKey.names, CACHE_REMOTE_SLICE_GATES, 'quality cache key helper should select remote cache self-check slices');

  const qualityCacheDigests = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache-digests.mjs']);
  assertTrue(qualityCacheDigests.names.includes('verify:quality-runner:cache-key-digest'), 'quality cache digest helper should select cache key digest slice');
  assertTrue(qualityCacheDigests.names.includes('verify:quality-runner:cache-key-env'), 'quality cache digest helper should select cache key env slice');
  assertTrue(qualityCacheDigests.names.includes('verify:quality-runner:cache-key-tool-version'), 'quality cache digest helper should select cache key tool-version slice');
  assertTrue(qualityCacheDigests.names.includes('verify:quality-runner:cache-local'), 'quality cache digest helper should select local cache self-check slice');
  assertIncludesAll(qualityCacheDigests.names, CACHE_REMOTE_SLICE_GATES, 'quality cache digest helper should select remote cache self-check slices');

  const qualityArtifactCore = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache-artifacts.mjs']);
  assertTrue(qualityArtifactCore.names.includes('verify:quality-runner:cache-key-digest'), 'quality artifact cache helper should select cache key digest slice');
  assertTrue(qualityArtifactCore.names.includes('verify:quality-runner:cache-key-env'), 'quality artifact cache helper should select cache key env slice');
  assertTrue(qualityArtifactCore.names.includes('verify:quality-runner:cache-key-tool-version'), 'quality artifact cache helper should select cache key tool-version slice');
  assertTrue(qualityArtifactCore.names.includes('verify:quality-runner:cache-local'), 'quality artifact cache helper should select local cache self-check slice');
  assertTrue(qualityArtifactCore.names.includes('verify:quality-runner:cache-artifact'), 'quality artifact cache helper should select artifact cache self-check slice');
  assertIncludesAll(qualityArtifactCore.names, CACHE_REMOTE_SLICE_GATES, 'quality artifact cache helper should select remote cache self-check slices');

  const qualityArtifactFiles = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache-artifact-files.mjs']);
  assertTrue(qualityArtifactFiles.names.includes('verify:quality-runner:cache-key-digest'), 'quality artifact file helper should select cache key digest slice');
  assertTrue(qualityArtifactFiles.names.includes('verify:quality-runner:cache-key-env'), 'quality artifact file helper should select cache key env slice');
  assertTrue(qualityArtifactFiles.names.includes('verify:quality-runner:cache-key-tool-version'), 'quality artifact file helper should select cache key tool-version slice');
  assertTrue(qualityArtifactFiles.names.includes('verify:quality-runner:cache-local'), 'quality artifact file helper should select local cache self-check slice');
  assertTrue(qualityArtifactFiles.names.includes('verify:quality-runner:cache-artifact'), 'quality artifact file helper should select artifact cache self-check slice');
  assertIncludesAll(qualityArtifactFiles.names, CACHE_REMOTE_SLICE_GATES, 'quality artifact file helper should select remote cache self-check slices');

  const qualityArtifactOutputs = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache-artifact-outputs.mjs']);
  assertTrue(qualityArtifactOutputs.names.includes('verify:quality-runner:cache-key-digest'), 'quality artifact outputs helper should select cache key digest slice');
  assertTrue(qualityArtifactOutputs.names.includes('verify:quality-runner:cache-key-env'), 'quality artifact outputs helper should select cache key env slice');
  assertTrue(qualityArtifactOutputs.names.includes('verify:quality-runner:cache-key-tool-version'), 'quality artifact outputs helper should select cache key tool-version slice');
  assertTrue(qualityArtifactOutputs.names.includes('verify:quality-runner:cache-local'), 'quality artifact outputs helper should select local cache self-check slice');
  assertTrue(qualityArtifactOutputs.names.includes('verify:quality-runner:cache-artifact'), 'quality artifact outputs helper should select artifact cache self-check slice');
  assertIncludesAll(qualityArtifactOutputs.names, CACHE_REMOTE_SLICE_GATES, 'quality artifact outputs helper should select remote cache self-check slices');

  const qualityCachePaths = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache-paths.mjs']);
  assertTrue(qualityCachePaths.names.includes('verify:quality-runner:cache-key-digest'), 'quality cache path helper should select cache key digest slice');
  assertTrue(qualityCachePaths.names.includes('verify:quality-runner:cache-key-env'), 'quality cache path helper should select cache key env slice');
  assertTrue(qualityCachePaths.names.includes('verify:quality-runner:cache-key-tool-version'), 'quality cache path helper should select cache key tool-version slice');
  assertTrue(qualityCachePaths.names.includes('verify:quality-runner:cache-artifact'), 'quality cache path helper should select artifact cache self-check slice');

  const qualityCacheRemote = selectAffectedGates(registry, ['scripts/lib/quality/quality-cache-remote.mjs']);
  assertIncludesAll(qualityCacheRemote.names, CACHE_REMOTE_SLICE_GATES, 'quality remote cache helper should select remote cache slices');
  assertFalse(qualityCacheRemote.names.includes('verify:quality-runner:cache-local'), 'quality remote cache helper should not select local cache slice');
  assertFalse(qualityCacheRemote.names.includes('verify:quality-runner:cache-stats'), 'quality remote cache helper should not select cache stats slice');

  const qualityEvents = selectAffectedGates(registry, ['scripts/lib/quality/quality-events.mjs']);
  assertTrue(qualityEvents.names.includes('verify:quality-runner:cache-stats'), 'quality events helper should select cache stats self-check slice');
  assertTrue(qualityEvents.names.includes('verify:quality-runner:cache-remote-stats'), 'quality events helper should select remote cache stats self-check slice');
  assertFalse(qualityEvents.names.includes('verify:quality-runner:cache-local'), 'quality events helper should not select local result cache slice');

  const qualityEventLog = selectAffectedGates(registry, ['scripts/lib/quality/quality-event-log.mjs']);
  assertTrue(qualityEventLog.names.includes('verify:quality-runner:cache-stats'), 'quality event log helper should select cache stats self-check slice');
  assertTrue(qualityEventLog.names.includes('verify:quality-runner:cache-remote-stats'), 'quality event log helper should select remote cache stats self-check slice');
  assertFalse(qualityEventLog.names.includes('verify:quality-runner:cache-local'), 'quality event log helper should not select local result cache slice');

  const qualityEventSummary = selectAffectedGates(registry, ['scripts/lib/quality/quality-event-summary.mjs']);
  assertTrue(qualityEventSummary.names.includes('verify:quality-runner:cache-stats'), 'quality event summary helper should select cache stats self-check slice');
  assertTrue(qualityEventSummary.names.includes('verify:quality-runner:cache-remote-stats'), 'quality event summary helper should select remote cache stats self-check slice');
  assertFalse(qualityEventSummary.names.includes('verify:quality-runner:cache-local'), 'quality event summary helper should not select local result cache slice');

  const qualityStatsInsights = selectAffectedGates(registry, ['scripts/lib/quality/quality-stats-insights.mjs']);
  assertTrue(qualityStatsInsights.names.includes('verify:quality-runner:cache-stats'), 'quality stats insights helper should select cache stats self-check slice');
  assertTrue(qualityStatsInsights.names.includes('verify:quality-runner:cache-remote-stats'), 'quality stats insights helper should select remote cache stats self-check slice');
  assertFalse(qualityStatsInsights.names.includes('verify:quality-runner:cache-local'), 'quality stats insights helper should not select local cache slice');

  const qualityStatsBudgetCore = selectAffectedGates(registry, ['scripts/lib/quality/quality-stats-budget-core.mjs']);
  assertTrue(qualityStatsBudgetCore.names.includes('verify:quality-runner:cache-stats'), 'quality stats budget helper should select cache stats self-check slice');
  assertTrue(qualityStatsBudgetCore.names.includes('verify:quality-runner:cache-remote-stats'), 'quality stats budget helper should select remote cache stats self-check slice');
  assertFalse(qualityStatsBudgetCore.names.includes('verify:quality-runner:cache-local'), 'quality stats budget helper should not select local cache slice');

  const qualityStatsCategories = selectAffectedGates(registry, ['scripts/lib/quality/quality-stats-categories.mjs']);
  assertTrue(qualityStatsCategories.names.includes('verify:quality-runner:cache-stats'), 'quality stats category helper should select cache stats self-check slice');
  assertTrue(qualityStatsCategories.names.includes('verify:quality-runner:cache-remote-stats'), 'quality stats category helper should select remote cache stats self-check slice');
  assertFalse(qualityStatsCategories.names.includes('verify:quality-runner:cache-local'), 'quality stats category helper should not select local cache slice');

  const qualityStatsTargetSignals = selectAffectedGates(registry, ['scripts/lib/quality/quality-stats-target-signals.mjs']);
  assertTrue(qualityStatsTargetSignals.names.includes('verify:quality-runner:cache-stats'), 'quality stats target-signal helper should select cache stats self-check slice');
  assertTrue(qualityStatsTargetSignals.names.includes('verify:quality-runner:cache-remote-stats'), 'quality stats target-signal helper should select remote cache stats self-check slice');
  assertFalse(qualityStatsTargetSignals.names.includes('verify:quality-runner:cache-local'), 'quality stats target-signal helper should not select local cache slice');

  const qualityGateCommandTargets = selectAffectedGates(registry, ['scripts/lib/quality/quality-gate-command-targets.mjs']);
  assertTrue(qualityGateCommandTargets.names.includes('verify:quality-runner:cache-stats'), 'quality gate command target helper should select cache stats self-check slice');
  assertTrue(qualityGateCommandTargets.names.includes('verify:quality-runner:cache-remote-stats'), 'quality gate command target helper should select remote cache stats self-check slice');
  assertFalse(qualityGateCommandTargets.names.includes('verify:quality-runner:cache-local'), 'quality gate command target helper should not select local cache slice');

  const cacheCompatCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache.mjs']);
  assertTrue(cacheCompatCheck.names.includes('verify:quality-runner:cache-stats'), 'cache compatibility aggregate should select cache stats slice');
  assertTrue(cacheCompatCheck.names.includes('verify:quality-runner:cache-key-digest'), 'cache compatibility aggregate should select cache key digest slice');
  assertTrue(cacheCompatCheck.names.includes('verify:quality-runner:cache-key-env'), 'cache compatibility aggregate should select cache key env slice');
  assertTrue(cacheCompatCheck.names.includes('verify:quality-runner:cache-key-tool-version'), 'cache compatibility aggregate should select cache key tool-version slice');
  assertTrue(cacheCompatCheck.names.includes('verify:quality-runner:cache-local'), 'cache compatibility aggregate should select local cache slice');
  assertTrue(cacheCompatCheck.names.includes('verify:quality-runner:cache-artifact'), 'cache compatibility aggregate should select artifact cache slice');
  assertIncludesAll(cacheCompatCheck.names, CACHE_REMOTE_SLICE_GATES, 'cache compatibility aggregate should select remote cache slices');
  assertFalse(cacheCompatCheck.names.includes('verify:quality-runner:hook'), 'cache compatibility aggregate should not fan out to hook slice');

  const cacheKeySliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-key.mjs']);
  assertTrue(cacheKeySliceCheck.names.includes('verify:quality-runner:cache-key-digest'), 'cache-key compatibility source should select cache key digest slice');
  assertTrue(cacheKeySliceCheck.names.includes('verify:quality-runner:cache-key-env'), 'cache-key compatibility source should select cache key env slice');
  assertTrue(cacheKeySliceCheck.names.includes('verify:quality-runner:cache-key-tool-version'), 'cache-key compatibility source should select cache key tool-version slice');
  assertFalse(cacheKeySliceCheck.names.includes('verify:quality-runner:cache-local'), 'cache-key self-check source should not fan out to local cache slice');
  assertExcludesAll(cacheKeySliceCheck.names, CACHE_REMOTE_SLICE_GATES, 'cache-key self-check source should not fan out to remote cache slice');

  const cacheKeyDigestSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-key-digest.mjs']);
  assertTrue(cacheKeyDigestSliceCheck.names.includes('verify:quality-runner:cache-key-digest'), 'cache-key-digest self-check source should select digest slice');
  assertFalse(cacheKeyDigestSliceCheck.names.includes('verify:quality-runner:cache-key-env'), 'cache-key-digest self-check source should not fan out to env slice');
  assertFalse(cacheKeyDigestSliceCheck.names.includes('verify:quality-runner:cache-key-tool-version'), 'cache-key-digest self-check source should not fan out to tool-version slice');

  const cacheKeyEnvSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-key-env.mjs']);
  assertTrue(cacheKeyEnvSliceCheck.names.includes('verify:quality-runner:cache-key-env'), 'cache-key-env self-check source should select env slice');
  assertFalse(cacheKeyEnvSliceCheck.names.includes('verify:quality-runner:cache-key-digest'), 'cache-key-env self-check source should not fan out to digest slice');
  assertFalse(cacheKeyEnvSliceCheck.names.includes('verify:quality-runner:cache-key-tool-version'), 'cache-key-env self-check source should not fan out to tool-version slice');

  const cacheKeyToolVersionSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-key-tool-version.mjs']);
  assertTrue(cacheKeyToolVersionSliceCheck.names.includes('verify:quality-runner:cache-key-tool-version'), 'cache-key-tool-version self-check source should select tool-version slice');
  assertFalse(cacheKeyToolVersionSliceCheck.names.includes('verify:quality-runner:cache-key-digest'), 'cache-key-tool-version self-check source should not fan out to digest slice');
  assertFalse(cacheKeyToolVersionSliceCheck.names.includes('verify:quality-runner:cache-key-env'), 'cache-key-tool-version self-check source should not fan out to env slice');

  const cacheLocalSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-local.mjs']);
  assertTrue(cacheLocalSliceCheck.names.includes('verify:quality-runner:cache-local'), 'local cache self-check source should select local cache slice');
  assertExcludesAll(cacheLocalSliceCheck.names, CACHE_REMOTE_SLICE_GATES, 'local cache self-check source should not fan out to remote cache slice');
  assertFalse(cacheLocalSliceCheck.names.includes('verify:quality-runner:hook'), 'local cache self-check source should not fan out to hook slice');

  const cacheArtifactSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-artifact.mjs']);
  assertTrue(cacheArtifactSliceCheck.names.includes('verify:quality-runner:cache-artifact'), 'artifact cache self-check source should select artifact cache slice');
  assertFalse(cacheArtifactSliceCheck.names.includes('verify:quality-runner:cache-local'), 'artifact cache self-check source should not fan out to local cache slice');
  assertExcludesAll(cacheArtifactSliceCheck.names, CACHE_REMOTE_SLICE_GATES, 'artifact cache self-check source should not fan out to remote cache slice');

  const cacheArtifactFixture = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-cache-artifact-fixtures.mjs']);
  assertTrue(cacheArtifactFixture.names.includes('lint:scripts'), 'artifact cache fixture helper should keep script lint coverage');
  assertTrue(cacheArtifactFixture.names.includes('verify:quality-runner:cache-artifact'), 'artifact cache fixture helper should select artifact cache slice');
  assertFalse(cacheArtifactFixture.names.includes('verify:quality-runner:cache-local'), 'artifact cache fixture helper should not fan out to local cache slice');
  assertExcludesAll(cacheArtifactFixture.names, CACHE_REMOTE_SLICE_GATES, 'artifact cache fixture helper should not fan out to remote cache slice');

  const cacheStatsSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-stats.mjs']);
  assertTrue(cacheStatsSliceCheck.names.includes('verify:quality-runner:cache-stats'), 'cache stats self-check source should select cache stats slice');
  assertFalse(cacheStatsSliceCheck.names.includes('verify:quality-runner:cache-local'), 'cache stats self-check source should not fan out to local cache slice');
  assertFalse(cacheStatsSliceCheck.names.includes('verify:quality-runner:cache-remote-config'), 'cache stats self-check source should not fan out to remote config slice');
  assertFalse(cacheStatsSliceCheck.names.includes('verify:quality-runner:cache-remote-result'), 'cache stats self-check source should not fan out to remote result slice');

  const cacheStatsSplitFixtureCheck = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-cache-stats-fixtures.mjs']);
  assertTrue(cacheStatsSplitFixtureCheck.names.includes('lint:scripts'), 'cache stats split fixture helper should keep script lint coverage');
  assertTrue(cacheStatsSplitFixtureCheck.names.includes('verify:quality-runner:cache-stats'), 'cache stats split fixture helper should select cache stats slice');
  assertFalse(cacheStatsSplitFixtureCheck.names.includes('verify:quality-runner:cache-local'), 'cache stats split fixture helper should not fan out to local cache slice');
  assertFalse(cacheStatsSplitFixtureCheck.names.includes('verify:quality-runner:cache-remote-config'), 'cache stats split fixture helper should not fan out to remote config slice');

  const cacheStatsFixtureCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-stats-fixtures.mjs']);
  assertTrue(cacheStatsFixtureCheck.names.includes('verify:quality-runner:cache-stats'), 'cache stats fixture helper should select cache stats slice');
  assertFalse(cacheStatsFixtureCheck.names.includes('verify:quality-runner:cache-local'), 'cache stats fixture helper should not fan out to local cache slice');
  assertFalse(cacheStatsFixtureCheck.names.includes('verify:quality-runner:cache-remote-config'), 'cache stats fixture helper should not fan out to remote config slice');

  const cacheStatsCompatibilityFixtureCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-stats-compatibility-fixtures.mjs']);
  assertTrue(cacheStatsCompatibilityFixtureCheck.names.includes('verify:quality-runner:cache-stats'), 'cache stats compatibility fixture helper should select cache stats slice');
  assertFalse(cacheStatsCompatibilityFixtureCheck.names.includes('verify:quality-runner:cache-local'), 'cache stats compatibility fixture helper should not fan out to local cache slice');
  assertFalse(cacheStatsCompatibilityFixtureCheck.names.includes('verify:quality-runner:cache-remote-config'), 'cache stats compatibility fixture helper should not fan out to remote config slice');

  const cacheStatsRollingFixtureCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-stats-rolling-fixtures.mjs']);
  assertTrue(cacheStatsRollingFixtureCheck.names.includes('verify:quality-runner:cache-stats'), 'cache stats rolling fixture helper should select cache stats slice');
  assertFalse(cacheStatsRollingFixtureCheck.names.includes('verify:quality-runner:cache-local'), 'cache stats rolling fixture helper should not fan out to local cache slice');
  assertFalse(cacheStatsRollingFixtureCheck.names.includes('verify:quality-runner:cache-remote-config'), 'cache stats rolling fixture helper should not fan out to remote config slice');

  const cacheStatsSampleHealthFixtureCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-stats-sample-health-fixtures.mjs']);
  assertTrue(cacheStatsSampleHealthFixtureCheck.names.includes('verify:quality-runner:cache-stats'), 'cache stats sample-health fixture helper should select cache stats slice');
  assertFalse(cacheStatsSampleHealthFixtureCheck.names.includes('verify:quality-runner:cache-local'), 'cache stats sample-health fixture helper should not fan out to local cache slice');
  assertFalse(cacheStatsSampleHealthFixtureCheck.names.includes('verify:quality-runner:cache-remote-config'), 'cache stats sample-health fixture helper should not fan out to remote config slice');

  const cacheStatsSignalFixtureCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-stats-signal-fixtures.mjs']);
  assertTrue(cacheStatsSignalFixtureCheck.names.includes('verify:quality-runner:cache-stats'), 'cache stats signal fixture helper should select cache stats slice');
  assertFalse(cacheStatsSignalFixtureCheck.names.includes('verify:quality-runner:cache-local'), 'cache stats signal fixture helper should not fan out to local cache slice');
  assertFalse(cacheStatsSignalFixtureCheck.names.includes('verify:quality-runner:cache-remote-config'), 'cache stats signal fixture helper should not fan out to remote config slice');

  const cacheRemoteSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-remote.mjs']);
  assertIncludesAll(cacheRemoteSliceCheck.names, CACHE_REMOTE_SLICE_GATES, 'remote cache compatibility source should select remote cache slices');
  assertFalse(cacheRemoteSliceCheck.names.includes('verify:quality-runner:cache-local'), 'remote cache self-check source should not fan out to local cache slice');
  assertFalse(cacheRemoteSliceCheck.names.includes('verify:quality-runner:hook'), 'remote cache self-check source should not fan out to hook slice');

  const cacheRemoteResultSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-remote-result.mjs']);
  assertTrue(cacheRemoteResultSliceCheck.names.includes('verify:quality-runner:cache-remote-result'), 'remote cache result self-check source should select result slice');
  assertFalse(cacheRemoteResultSliceCheck.names.includes('verify:quality-runner:cache-remote-artifact'), 'remote cache result self-check source should not fan out to artifact slice');

  const cacheRemoteFixtureCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/cache-remote-fixtures.mjs']);
  assertIncludesAll(cacheRemoteFixtureCheck.names, [
    'verify:quality-runner:cache-remote-result',
    'verify:quality-runner:cache-remote-stats',
    'verify:quality-runner:cache-remote-repair',
    'verify:quality-runner:cache-remote-artifact',
  ], 'remote cache fixture helper source should select remote cache fixture-backed slices');
  assertFalse(cacheRemoteFixtureCheck.names.includes('verify:quality-runner:cache-remote-config'), 'remote cache fixture helper source should not select config-only slice');
}
