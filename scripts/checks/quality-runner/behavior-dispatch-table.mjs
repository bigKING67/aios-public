export const QUALITY_RUNNER_COMPAT_SLICE_CHILDREN = Object.freeze({
  affected: Object.freeze(['affected-mapping', 'affected-mode', 'affected-explain', 'affected-runtime-status', 'affected-runtime-env', 'affected-files', 'prepush']),
  'affected-runtime': Object.freeze(['affected-runtime-status', 'affected-runtime-env']),
  cache: Object.freeze(['cache-stats', 'cache-key-digest', 'cache-key-env', 'cache-key-tool-version', 'cache-local', 'cache-artifact', 'cache-remote-config', 'cache-remote-result', 'cache-remote-stats', 'cache-remote-repair', 'cache-remote-artifact']),
  'cache-remote': Object.freeze(['cache-remote-config', 'cache-remote-result', 'cache-remote-stats', 'cache-remote-repair', 'cache-remote-artifact']),
  'cache-key': Object.freeze(['cache-key-digest', 'cache-key-env', 'cache-key-tool-version']),
  'preflight-cache': Object.freeze(['preflight-cache-key', 'preflight-cache-wrapper']),
  scheduler: Object.freeze(['scheduler-env', 'scheduler-shell', 'scheduler-local-bin', 'scheduler-concurrency', 'scheduler-cache-bypass']),
});

const SLICE_DISPATCHERS = Object.freeze({
  entrypoint: async () => {
    const { runQualityRunnerEntrypointBehaviorCheck } = await import('./entrypoint.mjs');
    runQualityRunnerEntrypointBehaviorCheck();
  },
  benchmark: async () => {
    const { runQualityRunnerBenchmarkBehaviorCheck } = await import('./benchmark.mjs');
    await runQualityRunnerBenchmarkBehaviorCheck();
  },
  registry: async () => {
    const { runQualityRunnerRegistryBehaviorCheck } = await import('./registry.mjs');
    runQualityRunnerRegistryBehaviorCheck();
  },
  'preflight-cache': async () => {
    const { runQualityRunnerPreflightCacheCompatibilityCheck } = await import('./preflight-cache.mjs');
    runQualityRunnerPreflightCacheCompatibilityCheck();
  },
  'preflight-cache-key': async () => {
    const { runQualityRunnerPreflightCacheKeyBehaviorCheck } = await import('./preflight-cache-key.mjs');
    runQualityRunnerPreflightCacheKeyBehaviorCheck();
  },
  'preflight-cache-wrapper': async () => {
    const { runQualityRunnerPreflightCacheWrapperBehaviorCheck } = await import('./preflight-cache-wrapper.mjs');
    runQualityRunnerPreflightCacheWrapperBehaviorCheck();
  },
  affected: async () => {
    const { runQualityRunnerAffectedCompatibilityCheck } = await import('./affected.mjs');
    await runQualityRunnerAffectedCompatibilityCheck();
  },
  'affected-mapping': async () => {
    const { runQualityRunnerAffectedMappingBehaviorCheck } = await import('./affected-mapping.mjs');
    runQualityRunnerAffectedMappingBehaviorCheck();
  },
  'affected-mode': async () => {
    const { runQualityRunnerAffectedModeBehaviorCheck } = await import('./affected-mode.mjs');
    await runQualityRunnerAffectedModeBehaviorCheck();
  },
  'affected-explain': async () => {
    const { runQualityRunnerAffectedExplainBehaviorCheck } = await import('./affected-explain.mjs');
    runQualityRunnerAffectedExplainBehaviorCheck();
  },
  'affected-runtime': async () => {
    const { runQualityRunnerAffectedRuntimeCompatibilityCheck } = await import('./affected-runtime.mjs');
    await runQualityRunnerAffectedRuntimeCompatibilityCheck();
  },
  'affected-runtime-status': async () => {
    const { runQualityRunnerAffectedRuntimeStatusBehaviorCheck } = await import('./affected-runtime-status.mjs');
    runQualityRunnerAffectedRuntimeStatusBehaviorCheck();
  },
  'affected-runtime-env': async () => {
    const { runQualityRunnerAffectedRuntimeEnvBehaviorCheck } = await import('./affected-runtime-env.mjs');
    await runQualityRunnerAffectedRuntimeEnvBehaviorCheck();
  },
  'affected-files': async () => {
    const { runQualityRunnerAffectedFilesBehaviorCheck } = await import('./affected-files.mjs');
    await runQualityRunnerAffectedFilesBehaviorCheck();
  },
  prepush: async () => {
    const { runQualityRunnerPrepushBehaviorCheck } = await import('./prepush.mjs');
    runQualityRunnerPrepushBehaviorCheck();
  },
  cache: async () => {
    const { runQualityRunnerCacheCompatibilityCheck } = await import('./cache.mjs');
    await runQualityRunnerCacheCompatibilityCheck();
  },
  'cache-stats': async () => {
    const { runQualityRunnerCacheStatsBehaviorCheck } = await import('./cache-stats.mjs');
    await runQualityRunnerCacheStatsBehaviorCheck();
  },
  'cache-key': async () => {
    const { runQualityRunnerCacheKeyCompatibilityCheck } = await import('./cache-key.mjs');
    runQualityRunnerCacheKeyCompatibilityCheck();
  },
  'cache-key-digest': async () => {
    const { runQualityRunnerCacheKeyDigestBehaviorCheck } = await import('./cache-key-digest.mjs');
    runQualityRunnerCacheKeyDigestBehaviorCheck();
  },
  'cache-key-env': async () => {
    const { runQualityRunnerCacheKeyEnvBehaviorCheck } = await import('./cache-key-env.mjs');
    runQualityRunnerCacheKeyEnvBehaviorCheck();
  },
  'cache-key-tool-version': async () => {
    const { runQualityRunnerCacheKeyToolVersionBehaviorCheck } = await import('./cache-key-tool-version.mjs');
    runQualityRunnerCacheKeyToolVersionBehaviorCheck();
  },
  'cache-local': async () => {
    const { runQualityRunnerCacheLocalBehaviorCheck } = await import('./cache-local.mjs');
    await runQualityRunnerCacheLocalBehaviorCheck();
  },
  'cache-artifact': async () => {
    const { runQualityRunnerCacheArtifactBehaviorCheck } = await import('./cache-artifact.mjs');
    await runQualityRunnerCacheArtifactBehaviorCheck();
  },
  'cache-remote': async () => {
    const { runQualityRunnerCacheRemoteCompatibilityCheck } = await import('./cache-remote.mjs');
    await runQualityRunnerCacheRemoteCompatibilityCheck();
  },
  'cache-remote-config': async () => {
    const { runQualityRunnerCacheRemoteConfigBehaviorCheck } = await import('./cache-remote-config.mjs');
    runQualityRunnerCacheRemoteConfigBehaviorCheck();
  },
  'cache-remote-result': async () => {
    const { runQualityRunnerCacheRemoteResultBehaviorCheck } = await import('./cache-remote-result.mjs');
    await runQualityRunnerCacheRemoteResultBehaviorCheck();
  },
  'cache-remote-stats': async () => {
    const { runQualityRunnerCacheRemoteStatsBehaviorCheck } = await import('./cache-remote-stats.mjs');
    runQualityRunnerCacheRemoteStatsBehaviorCheck();
  },
  'cache-remote-repair': async () => {
    const { runQualityRunnerCacheRemoteRepairBehaviorCheck } = await import('./cache-remote-repair.mjs');
    await runQualityRunnerCacheRemoteRepairBehaviorCheck();
  },
  'cache-remote-artifact': async () => {
    const { runQualityRunnerCacheRemoteArtifactBehaviorCheck } = await import('./cache-remote-artifact.mjs');
    await runQualityRunnerCacheRemoteArtifactBehaviorCheck();
  },
  manifest: async () => {
    const { runQualityRunnerManifestBehaviorCheck } = await import('./manifest.mjs');
    await runQualityRunnerManifestBehaviorCheck();
  },
  hook: async () => {
    const { runQualityRunnerHookBehaviorCheck } = await import('./hook.mjs');
    runQualityRunnerHookBehaviorCheck();
  },
  scheduler: async () => {
    const { runQualityRunnerSchedulerCompatibilityCheck } = await import('./scheduler.mjs');
    await runQualityRunnerSchedulerCompatibilityCheck();
  },
  'scheduler-env': async () => {
    const { runQualityRunnerSchedulerEnvBehaviorCheck } = await import('./scheduler-env.mjs');
    await runQualityRunnerSchedulerEnvBehaviorCheck();
  },
  'scheduler-shell': async () => {
    const { runQualityRunnerSchedulerShellBehaviorCheck } = await import('./scheduler-shell.mjs');
    runQualityRunnerSchedulerShellBehaviorCheck();
  },
  'scheduler-local-bin': async () => {
    const { runQualityRunnerSchedulerLocalBinBehaviorCheck } = await import('./scheduler-local-bin.mjs');
    await runQualityRunnerSchedulerLocalBinBehaviorCheck();
  },
  'scheduler-concurrency': async () => {
    const { runQualityRunnerSchedulerConcurrencyBehaviorCheck } = await import('./scheduler-concurrency.mjs');
    await runQualityRunnerSchedulerConcurrencyBehaviorCheck();
  },
  'scheduler-cache-bypass': async () => {
    const { runQualityRunnerSchedulerCacheBypassBehaviorCheck } = await import('./scheduler-cache-bypass.mjs');
    await runQualityRunnerSchedulerCacheBypassBehaviorCheck();
  },
});

export const QUALITY_RUNNER_BEHAVIOR_DISPATCHER_SLICES = Object.freeze(
  Object.keys(SLICE_DISPATCHERS).sort(),
);

export const QUALITY_RUNNER_BEHAVIOR_DISPATCH_ORDER = Object.freeze([
  'entrypoint',
  'benchmark',
  'registry',
  'preflight-cache',
  'preflight-cache-key',
  'preflight-cache-wrapper',
  'affected',
  'affected-mapping',
  'affected-mode',
  'affected-explain',
  'affected-runtime',
  'affected-runtime-status',
  'affected-runtime-env',
  'affected-files',
  'prepush',
  'cache',
  'cache-stats',
  'cache-key',
  'cache-key-digest',
  'cache-key-env',
  'cache-key-tool-version',
  'cache-local',
  'cache-artifact',
  'cache-remote',
  'cache-remote-config',
  'cache-remote-result',
  'cache-remote-stats',
  'cache-remote-repair',
  'cache-remote-artifact',
  'manifest',
  'hook',
  'scheduler',
  'scheduler-env',
  'scheduler-shell',
  'scheduler-local-bin',
  'scheduler-concurrency',
  'scheduler-cache-bypass',
]);

export const QUALITY_RUNNER_BEHAVIOR_DEFAULT_ORDER = Object.freeze([
  'entrypoint',
  'benchmark',
  'registry',
  'preflight-cache',
  'affected',
  'cache',
  'manifest',
  'hook',
  'scheduler',
]);

export async function runQualityRunnerBehaviorDispatcher(slice) {
  const dispatcher = SLICE_DISPATCHERS[slice];
  if (!dispatcher) {
    throw new Error(`missing quality-runner behavior dispatcher for slice: ${slice}`);
  }
  await dispatcher();
}
