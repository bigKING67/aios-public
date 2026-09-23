const QUALITY_RUNNER_SCHEDULER_INPUT_CONTRACT_SOURCE = 'scripts/lib/quality/quality-runner-scheduler-slice-inputs.mjs';

const QUALITY_RUNNER_SCHEDULER_FIXTURE_INPUTS = Object.freeze([
  QUALITY_RUNNER_SCHEDULER_INPUT_CONTRACT_SOURCE,
  'scripts/checks/quality-runner/scheduler-fixtures.mjs',
]);

const QUALITY_RUNNER_SCHEDULER_RUNTIME_INPUTS = Object.freeze([
  'scripts/lib/quality/quality-scheduler.mjs',
  'scripts/lib/quality/quality-scheduler-cache.mjs',
  'scripts/lib/quality/quality-scheduler-command.mjs',
  'scripts/lib/quality/quality-scheduler-graph.mjs',
  'scripts/lib/quality/quality-scheduler-results.mjs',
]);

export const QUALITY_RUNNER_SCHEDULER_ENV_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/scheduler-env.mjs',
  ...QUALITY_RUNNER_SCHEDULER_FIXTURE_INPUTS,
  'scripts/lib/quality/quality-affected.mjs',
  ...QUALITY_RUNNER_SCHEDULER_RUNTIME_INPUTS,
]);

export const QUALITY_RUNNER_SCHEDULER_SHELL_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/scheduler-shell.mjs',
  ...QUALITY_RUNNER_SCHEDULER_FIXTURE_INPUTS,
  'scripts/checks/shell/syntax.mjs',
  'scripts/lib/ci/shell-syntax-core.mjs',
]);

export const QUALITY_RUNNER_SCHEDULER_LOCAL_BIN_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/scheduler-local-bin.mjs',
  ...QUALITY_RUNNER_SCHEDULER_FIXTURE_INPUTS,
  ...QUALITY_RUNNER_SCHEDULER_RUNTIME_INPUTS,
]);

export const QUALITY_RUNNER_SCHEDULER_CONCURRENCY_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/scheduler-concurrency.mjs',
  ...QUALITY_RUNNER_SCHEDULER_FIXTURE_INPUTS,
  ...QUALITY_RUNNER_SCHEDULER_RUNTIME_INPUTS,
]);

export const QUALITY_RUNNER_SCHEDULER_CACHE_BYPASS_INPUTS = Object.freeze([
  'scripts/checks/quality-runner/scheduler-cache-bypass.mjs',
  ...QUALITY_RUNNER_SCHEDULER_FIXTURE_INPUTS,
  'scripts/lib/quality/quality-cache.mjs',
  'scripts/lib/quality/quality-cache-digests.mjs',
  'scripts/lib/quality/quality-cache-key.mjs',
  'scripts/lib/quality/quality-cache-artifact-files.mjs',
  'scripts/lib/quality/quality-cache-artifact-outputs.mjs',
  'scripts/lib/quality/quality-cache-artifacts.mjs',
  'scripts/lib/quality/quality-cache-paths.mjs',
  'scripts/lib/quality/quality-event-log.mjs',
  'scripts/lib/quality/quality-events.mjs',
  ...QUALITY_RUNNER_SCHEDULER_RUNTIME_INPUTS,
]);
