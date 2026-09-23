const QUALITY_RUNNER_CACHE_REMOTE_INPUT_CONTRACT_SOURCE = 'scripts/lib/quality/quality-runner-cache-remote-slice-inputs.mjs';

const QUALITY_RUNNER_CACHE_REMOTE_FIXTURE_INPUTS = Object.freeze([
  QUALITY_RUNNER_CACHE_REMOTE_INPUT_CONTRACT_SOURCE,
  'scripts/checks/quality-runner/cache-remote-fixtures.mjs',
]);

export const QUALITY_RUNNER_CACHE_REMOTE_CONFIG_INPUTS = Object.freeze([
  '.github/workflows/quality-gate.yml',
  'scripts/quality-runner.mjs',
  'scripts/checks/quality-runner/cache-remote-config.mjs',
  QUALITY_RUNNER_CACHE_REMOTE_INPUT_CONTRACT_SOURCE,
  'scripts/lib/ci/quality-workflow-contract-core.mjs',
  'scripts/lib/quality/quality-cache.mjs',
  'scripts/lib/quality/quality-cache-paths.mjs',
  'scripts/lib/quality/quality-cache-remote.mjs',
  'scripts/lib/quality/quality-runner-actions.mjs',
  'scripts/lib/quality/quality-runner-args.mjs',
  'scripts/lib/quality/quality-runner-remote-cache-health.mjs',
  'scripts/lib/quality/quality-runner-remote-cache.mjs',
  'scripts/lib/quality/quality-runner-remote-cache-setup.mjs',
]);

export const QUALITY_RUNNER_CACHE_REMOTE_RESULT_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-remote-result.mjs',
  ...QUALITY_RUNNER_CACHE_REMOTE_FIXTURE_INPUTS,
  'scripts/lib/quality/quality-cache.mjs',
  'scripts/lib/quality/quality-cache-digests.mjs',
  'scripts/lib/quality/quality-cache-key.mjs',
  'scripts/lib/quality/quality-cache-artifact-files.mjs',
  'scripts/lib/quality/quality-cache-artifact-outputs.mjs',
  'scripts/lib/quality/quality-cache-artifacts.mjs',
  'scripts/lib/quality/quality-cache-paths.mjs',
  'scripts/lib/quality/quality-cache-remote.mjs',
  'scripts/lib/quality/quality-runner-remote-cache-health.mjs',
  'scripts/lib/quality/quality-runner-remote-cache.mjs',
  'scripts/lib/quality/quality-runner-remote-cache-setup.mjs',
  'scripts/lib/quality/quality-runner-remote-cache-smoke.mjs',
  'scripts/lib/quality/quality-scheduler.mjs',
]);

export const QUALITY_RUNNER_CACHE_REMOTE_STATS_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-remote-stats.mjs',
  ...QUALITY_RUNNER_CACHE_REMOTE_FIXTURE_INPUTS,
  'scripts/quality-runner.mjs',
  'scripts/lib/quality/quality-cache-remote.mjs',
  'scripts/lib/quality/quality-event-log.mjs',
  'scripts/lib/quality/quality-event-summary.mjs',
  'scripts/lib/quality/quality-events.mjs',
  'scripts/lib/quality/quality-gate-command-targets.mjs',
  'scripts/lib/quality/quality-runner-actions.mjs',
  'scripts/lib/quality/quality-runner-remote-cache.mjs',
  'scripts/lib/quality/quality-runner-remote-cache-health.mjs',
  'scripts/lib/quality/quality-stats-categories.mjs',
  'scripts/lib/quality/quality-stats-insights.mjs',
  'scripts/lib/quality/quality-stats-target-signals.mjs',
]);

export const QUALITY_RUNNER_CACHE_REMOTE_REPAIR_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-remote-repair.mjs',
  ...QUALITY_RUNNER_CACHE_REMOTE_FIXTURE_INPUTS,
  'scripts/lib/quality/quality-cache.mjs',
  'scripts/lib/quality/quality-cache-digests.mjs',
  'scripts/lib/quality/quality-cache-key.mjs',
  'scripts/lib/quality/quality-cache-artifact-files.mjs',
  'scripts/lib/quality/quality-cache-artifact-outputs.mjs',
  'scripts/lib/quality/quality-cache-artifacts.mjs',
  'scripts/lib/quality/quality-cache-paths.mjs',
  'scripts/lib/quality/quality-cache-remote.mjs',
  'scripts/lib/quality/quality-scheduler.mjs',
]);

export const QUALITY_RUNNER_CACHE_REMOTE_ARTIFACT_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-remote-artifact.mjs',
  ...QUALITY_RUNNER_CACHE_REMOTE_FIXTURE_INPUTS,
  'scripts/lib/quality/quality-cache.mjs',
  'scripts/lib/quality/quality-cache-digests.mjs',
  'scripts/lib/quality/quality-cache-key.mjs',
  'scripts/lib/quality/quality-cache-artifact-files.mjs',
  'scripts/lib/quality/quality-cache-artifact-outputs.mjs',
  'scripts/lib/quality/quality-cache-artifacts.mjs',
  'scripts/lib/quality/quality-cache-paths.mjs',
  'scripts/lib/quality/quality-cache-remote.mjs',
  'scripts/lib/quality/quality-scheduler.mjs',
]);
