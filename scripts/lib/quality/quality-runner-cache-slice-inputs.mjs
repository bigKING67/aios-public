const QUALITY_RUNNER_CACHE_INPUT_CONTRACT_SOURCE = 'scripts/lib/quality/quality-runner-cache-slice-inputs.mjs';

export const QUALITY_RUNNER_CACHE_STATS_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-stats.mjs',
  'scripts/lib/quality/quality-runner-cache-stats-fixtures.mjs',
  'scripts/checks/quality-runner/cache-stats-compatibility-fixtures.mjs',
  'scripts/checks/quality-runner/cache-stats-fixtures.mjs',
  'scripts/checks/quality-runner/cache-stats-rolling-fixtures.mjs',
  'scripts/checks/quality-runner/cache-stats-sample-health-fixtures.mjs',
  'scripts/checks/quality-runner/cache-stats-signal-fixtures.mjs',
  'scripts/quality-runner.mjs',
  QUALITY_RUNNER_CACHE_INPUT_CONTRACT_SOURCE,
  'scripts/lib/quality/quality-event-log.mjs',
  'scripts/lib/quality/quality-event-summary.mjs',
  'scripts/lib/quality/quality-events.mjs',
  'scripts/lib/quality/quality-gate-command-targets.mjs',
  'scripts/lib/quality/quality-runner-remote-cache.mjs',
  'scripts/lib/quality/quality-runner-remote-cache-health.mjs',
  'scripts/lib/quality/quality-stats-categories.mjs',
  'scripts/lib/quality/quality-stats-insights.mjs',
  'scripts/lib/quality/quality-stats-budget-core.mjs',
  'scripts/lib/quality/quality-stats-target-signals.mjs',
]);

export {
  QUALITY_RUNNER_CACHE_KEY_DIGEST_INPUTS,
  QUALITY_RUNNER_CACHE_KEY_ENV_INPUTS,
  QUALITY_RUNNER_CACHE_KEY_TOOL_VERSION_INPUTS,
} from './quality-runner-cache-key-slice-inputs.mjs';

export const QUALITY_RUNNER_CACHE_LOCAL_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-local.mjs',
  'scripts/quality-runner.mjs',
  QUALITY_RUNNER_CACHE_INPUT_CONTRACT_SOURCE,
  'scripts/lib/quality/quality-cache.mjs',
  'scripts/lib/quality/quality-cache-digests.mjs',
  'scripts/lib/quality/quality-cache-key.mjs',
  'scripts/lib/quality/quality-cache-artifact-files.mjs',
  'scripts/lib/quality/quality-cache-artifact-outputs.mjs',
  'scripts/lib/quality/quality-cache-artifacts.mjs',
  'scripts/lib/quality/quality-cache-paths.mjs',
  'scripts/lib/quality/quality-scheduler.mjs',
]);

export const QUALITY_RUNNER_CACHE_ARTIFACT_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/cache-artifact.mjs',
  'scripts/quality-runner.mjs',
  QUALITY_RUNNER_CACHE_INPUT_CONTRACT_SOURCE,
  'scripts/lib/quality/quality-runner-cache-artifact-fixtures.mjs',
  'scripts/lib/quality/quality-cache.mjs',
  'scripts/lib/quality/quality-cache-digests.mjs',
  'scripts/lib/quality/quality-cache-key.mjs',
  'scripts/lib/quality/quality-cache-artifact-files.mjs',
  'scripts/lib/quality/quality-cache-artifact-outputs.mjs',
  'scripts/lib/quality/quality-cache-artifacts.mjs',
  'scripts/lib/quality/quality-cache-paths.mjs',
  'scripts/lib/quality/quality-scheduler.mjs',
]);

export {
  QUALITY_RUNNER_CACHE_REMOTE_ARTIFACT_INPUTS,
  QUALITY_RUNNER_CACHE_REMOTE_CONFIG_INPUTS,
  QUALITY_RUNNER_CACHE_REMOTE_REPAIR_INPUTS,
  QUALITY_RUNNER_CACHE_REMOTE_RESULT_INPUTS,
  QUALITY_RUNNER_CACHE_REMOTE_STATS_INPUTS,
} from './quality-runner-cache-remote-slice-inputs.mjs';
