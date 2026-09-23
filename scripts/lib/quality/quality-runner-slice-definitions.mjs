import {
  QUALITY_RUNNER_BENCHMARK_INPUTS,
  QUALITY_RUNNER_MANIFEST_INPUTS,
  QUALITY_RUNNER_ENTRYPOINT_INPUTS,
  QUALITY_RUNNER_PREFLIGHT_CACHE_KEY_INPUTS,
  QUALITY_RUNNER_PREFLIGHT_CACHE_WRAPPER_INPUTS,
  QUALITY_RUNNER_REGISTRY_INPUTS,
  QUALITY_RUNNER_SCHEDULER_CACHE_BYPASS_INPUTS,
  QUALITY_RUNNER_SCHEDULER_CONCURRENCY_INPUTS,
  QUALITY_RUNNER_SCHEDULER_ENV_INPUTS,
  QUALITY_RUNNER_SCHEDULER_LOCAL_BIN_INPUTS,
  QUALITY_RUNNER_SCHEDULER_SHELL_INPUTS,
} from './quality-runner-slice-inputs.mjs';
import {
  defineSlice,
} from './quality-runner-slice-definition-utils.mjs';
import {
  QUALITY_RUNNER_AFFECTED_SLICE_DEFINITIONS,
} from './quality-runner-affected-slice-definitions.mjs';
import {
  QUALITY_RUNNER_CACHE_SLICE_DEFINITIONS,
} from './quality-runner-cache-slice-definitions.mjs';

export const QUALITY_RUNNER_SLICE_DEFINITIONS = Object.freeze([
  defineSlice({
    slice: 'registry',
    name: 'verify:quality-runner:registry',
    command: 'node scripts/checks/quality-runner/registry.mjs',
    label: '[quality] quality runner registry self-check',
    inputs: QUALITY_RUNNER_REGISTRY_INPUTS,
  }),
  ...QUALITY_RUNNER_AFFECTED_SLICE_DEFINITIONS,
  ...QUALITY_RUNNER_CACHE_SLICE_DEFINITIONS,
  defineSlice({
    slice: 'entrypoint',
    name: 'verify:quality-runner:entrypoint',
    command: 'node scripts/checks/quality-runner/entrypoint.mjs',
    label: '[quality] quality runner entrypoint boundary self-check',
    inputs: QUALITY_RUNNER_ENTRYPOINT_INPUTS,
  }),
  defineSlice({
    slice: 'benchmark',
    name: 'verify:quality-runner:benchmark',
    command: 'node scripts/checks/quality-runner/benchmark.mjs',
    label: '[quality] quality runner benchmark diagnostic self-check',
    inputs: QUALITY_RUNNER_BENCHMARK_INPUTS,
  }),
  defineSlice({
    slice: 'manifest',
    name: 'verify:quality-runner:manifest',
    command: 'node scripts/checks/quality-runner/manifest.mjs',
    label: '[quality] quality runner manifest self-check',
    inputs: QUALITY_RUNNER_MANIFEST_INPUTS,
  }),
  defineSlice({
    slice: 'scheduler-env',
    name: 'verify:quality-runner:scheduler-env',
    command: 'node scripts/checks/quality-runner/scheduler-env.mjs',
    label: '[quality] quality runner scheduler env self-check',
    inputs: QUALITY_RUNNER_SCHEDULER_ENV_INPUTS,
  }),
  defineSlice({
    slice: 'scheduler-shell',
    name: 'verify:quality-runner:scheduler-shell',
    command: 'node scripts/checks/quality-runner/scheduler-shell.mjs',
    label: '[quality] quality runner scheduler shell fast-path self-check',
    inputs: QUALITY_RUNNER_SCHEDULER_SHELL_INPUTS,
  }),
  defineSlice({
    slice: 'scheduler-local-bin',
    name: 'verify:quality-runner:scheduler-local-bin',
    command: 'node scripts/checks/quality-runner/scheduler-local-bin.mjs',
    label: '[quality] quality runner scheduler local-bin self-check',
    inputs: QUALITY_RUNNER_SCHEDULER_LOCAL_BIN_INPUTS,
  }),
  defineSlice({
    slice: 'scheduler-concurrency',
    name: 'verify:quality-runner:scheduler-concurrency',
    command: 'node scripts/checks/quality-runner/scheduler-concurrency.mjs',
    label: '[quality] quality runner scheduler concurrency self-check',
    inputs: QUALITY_RUNNER_SCHEDULER_CONCURRENCY_INPUTS,
  }),
  defineSlice({
    slice: 'scheduler-cache-bypass',
    name: 'verify:quality-runner:scheduler-cache-bypass',
    command: 'node scripts/checks/quality-runner/scheduler-cache-bypass.mjs',
    label: '[quality] quality runner scheduler cache-bypass self-check',
    inputs: QUALITY_RUNNER_SCHEDULER_CACHE_BYPASS_INPUTS,
  }),
  defineSlice({
    slice: 'hook',
    name: 'verify:quality-runner:hook',
    command: 'node scripts/checks/quality-runner/hook.mjs',
    label: '[quality] quality runner pre-push hook self-check',
    inputs: Object.freeze([
      '.githooks/pre-push',
      'scripts/checks/quality-runner/hook.mjs',
    ]),
  }),
  defineSlice({
    slice: 'preflight-cache-key',
    name: 'verify:quality-runner:preflight-cache-key',
    command: 'node scripts/checks/quality-runner/preflight-cache-key.mjs',
    label: '[quality] quality runner preflight cache key self-check',
    inputs: QUALITY_RUNNER_PREFLIGHT_CACHE_KEY_INPUTS,
  }),
  defineSlice({
    slice: 'preflight-cache-wrapper',
    name: 'verify:quality-runner:preflight-cache-wrapper',
    command: 'node scripts/checks/quality-runner/preflight-cache-wrapper.mjs',
    label: '[quality] quality runner preflight cache wrapper self-check',
    inputs: QUALITY_RUNNER_PREFLIGHT_CACHE_WRAPPER_INPUTS,
  }),
]);

export {
  QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS,
} from './quality-runner-compat-slice-definitions.mjs';
