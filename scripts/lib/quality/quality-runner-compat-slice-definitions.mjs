import {
  QUALITY_RUNNER_AFFECTED_EXPLAIN_INPUTS,
  QUALITY_RUNNER_AFFECTED_FILES_INPUTS,
  QUALITY_RUNNER_AFFECTED_MAPPING_INPUTS,
  QUALITY_RUNNER_AFFECTED_MODE_INPUTS,
  QUALITY_RUNNER_AFFECTED_RUNTIME_ENV_INPUTS,
  QUALITY_RUNNER_AFFECTED_RUNTIME_STATUS_INPUTS,
  QUALITY_RUNNER_CACHE_ARTIFACT_INPUTS,
  QUALITY_RUNNER_CACHE_KEY_DIGEST_INPUTS,
  QUALITY_RUNNER_CACHE_KEY_ENV_INPUTS,
  QUALITY_RUNNER_CACHE_KEY_TOOL_VERSION_INPUTS,
  QUALITY_RUNNER_CACHE_LOCAL_INPUTS,
  QUALITY_RUNNER_CACHE_REMOTE_ARTIFACT_INPUTS,
  QUALITY_RUNNER_CACHE_REMOTE_CONFIG_INPUTS,
  QUALITY_RUNNER_CACHE_REMOTE_REPAIR_INPUTS,
  QUALITY_RUNNER_CACHE_REMOTE_RESULT_INPUTS,
  QUALITY_RUNNER_CACHE_REMOTE_STATS_INPUTS,
  QUALITY_RUNNER_CACHE_STATS_INPUTS,
  QUALITY_RUNNER_PREFLIGHT_CACHE_KEY_INPUTS,
  QUALITY_RUNNER_PREFLIGHT_CACHE_WRAPPER_INPUTS,
  QUALITY_RUNNER_PREPUSH_INPUTS,
  QUALITY_RUNNER_SCHEDULER_CACHE_BYPASS_INPUTS,
  QUALITY_RUNNER_SCHEDULER_CONCURRENCY_INPUTS,
  QUALITY_RUNNER_SCHEDULER_ENV_INPUTS,
  QUALITY_RUNNER_SCHEDULER_LOCAL_BIN_INPUTS,
  QUALITY_RUNNER_SCHEDULER_SHELL_INPUTS,
} from './quality-runner-slice-inputs.mjs';

function unique(values) {
  return [...new Set(values)];
}

function defineSlice(definition) {
  return Object.freeze({
    ...definition,
    inputs: Object.freeze(definition.inputs ?? []),
  });
}

export const QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS = Object.freeze([
  defineSlice({
    slice: 'affected',
    name: 'verify:quality-runner:affected',
    command: 'node scripts/checks/quality-runner/affected.mjs',
    label: '[quality] quality runner affected compatibility self-check',
    inputs: unique([
      'scripts/checks/quality-runner/affected.mjs',
      ...QUALITY_RUNNER_AFFECTED_MAPPING_INPUTS,
      ...QUALITY_RUNNER_AFFECTED_MODE_INPUTS,
      ...QUALITY_RUNNER_AFFECTED_EXPLAIN_INPUTS,
      ...QUALITY_RUNNER_AFFECTED_RUNTIME_STATUS_INPUTS,
      ...QUALITY_RUNNER_AFFECTED_RUNTIME_ENV_INPUTS,
      ...QUALITY_RUNNER_AFFECTED_FILES_INPUTS,
      ...QUALITY_RUNNER_PREPUSH_INPUTS,
    ]),
  }),
  defineSlice({
    slice: 'affected-runtime',
    name: 'verify:quality-runner:affected-runtime',
    command: 'node scripts/checks/quality-runner/affected-runtime.mjs',
    label: '[quality] quality runner affected runtime compatibility self-check',
    inputs: unique([
      'scripts/checks/quality-runner/affected-runtime.mjs',
      ...QUALITY_RUNNER_AFFECTED_RUNTIME_STATUS_INPUTS,
      ...QUALITY_RUNNER_AFFECTED_RUNTIME_ENV_INPUTS,
    ]),
  }),
  defineSlice({
    slice: 'cache',
    name: 'verify:quality-runner:cache',
    command: 'node scripts/checks/quality-runner/cache.mjs',
    label: '[quality] quality runner cache compatibility self-check',
    inputs: unique([
      'scripts/checks/quality-runner/cache.mjs',
      ...QUALITY_RUNNER_CACHE_STATS_INPUTS,
      ...QUALITY_RUNNER_CACHE_KEY_DIGEST_INPUTS,
      ...QUALITY_RUNNER_CACHE_KEY_ENV_INPUTS,
      ...QUALITY_RUNNER_CACHE_KEY_TOOL_VERSION_INPUTS,
      ...QUALITY_RUNNER_CACHE_LOCAL_INPUTS,
      ...QUALITY_RUNNER_CACHE_ARTIFACT_INPUTS,
      ...QUALITY_RUNNER_CACHE_REMOTE_CONFIG_INPUTS,
      ...QUALITY_RUNNER_CACHE_REMOTE_RESULT_INPUTS,
      ...QUALITY_RUNNER_CACHE_REMOTE_STATS_INPUTS,
      ...QUALITY_RUNNER_CACHE_REMOTE_REPAIR_INPUTS,
      ...QUALITY_RUNNER_CACHE_REMOTE_ARTIFACT_INPUTS,
    ]),
  }),
  defineSlice({
    slice: 'cache-key',
    name: 'verify:quality-runner:cache-key',
    command: 'node scripts/checks/quality-runner/cache-key.mjs',
    label: '[quality] quality runner cache key compatibility self-check',
    inputs: unique([
      'scripts/checks/quality-runner/cache-key.mjs',
      ...QUALITY_RUNNER_CACHE_KEY_DIGEST_INPUTS,
      ...QUALITY_RUNNER_CACHE_KEY_ENV_INPUTS,
      ...QUALITY_RUNNER_CACHE_KEY_TOOL_VERSION_INPUTS,
    ]),
  }),
  defineSlice({
    slice: 'cache-remote',
    name: 'verify:quality-runner:cache-remote',
    command: 'node scripts/checks/quality-runner/cache-remote.mjs',
    label: '[quality] quality runner remote cache compatibility self-check',
    inputs: unique([
      'scripts/checks/quality-runner/cache-remote.mjs',
      ...QUALITY_RUNNER_CACHE_REMOTE_CONFIG_INPUTS,
      ...QUALITY_RUNNER_CACHE_REMOTE_RESULT_INPUTS,
      ...QUALITY_RUNNER_CACHE_REMOTE_STATS_INPUTS,
      ...QUALITY_RUNNER_CACHE_REMOTE_REPAIR_INPUTS,
      ...QUALITY_RUNNER_CACHE_REMOTE_ARTIFACT_INPUTS,
    ]),
  }),
  defineSlice({
    slice: 'preflight-cache',
    name: 'verify:quality-runner:preflight-cache',
    command: 'node scripts/checks/quality-runner/preflight-cache.mjs',
    label: '[quality] quality runner preflight cache compatibility self-check',
    inputs: unique([
      'scripts/checks/quality-runner/preflight-cache.mjs',
      ...QUALITY_RUNNER_PREFLIGHT_CACHE_KEY_INPUTS,
      ...QUALITY_RUNNER_PREFLIGHT_CACHE_WRAPPER_INPUTS,
    ]),
  }),
  defineSlice({
    slice: 'scheduler',
    name: 'verify:quality-runner:scheduler',
    command: 'node scripts/checks/quality-runner/scheduler.mjs',
    label: '[quality] quality runner scheduler compatibility self-check',
    inputs: unique([
      'scripts/checks/quality-runner/scheduler.mjs',
      ...QUALITY_RUNNER_SCHEDULER_ENV_INPUTS,
      ...QUALITY_RUNNER_SCHEDULER_SHELL_INPUTS,
      ...QUALITY_RUNNER_SCHEDULER_LOCAL_BIN_INPUTS,
      ...QUALITY_RUNNER_SCHEDULER_CONCURRENCY_INPUTS,
      ...QUALITY_RUNNER_SCHEDULER_CACHE_BYPASS_INPUTS,
    ]),
  }),
]);
