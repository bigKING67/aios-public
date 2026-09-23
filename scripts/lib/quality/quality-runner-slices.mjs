import {
  QUALITY_RUNNER_SLICE_DEFINITIONS,
} from './quality-runner-slice-definitions.mjs';
import {
  QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS,
} from './quality-runner-compat-slice-definitions.mjs';

export {
  QUALITY_RUNNER_SLICE_DEFINITIONS,
} from './quality-runner-slice-definitions.mjs';
export {
  QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS,
} from './quality-runner-compat-slice-definitions.mjs';

export const QUALITY_RUNNER_AGGREGATE_GATE_NAME = 'verify:quality-runner';
export const QUALITY_RUNNER_BEHAVIOR_COMMAND = 'node scripts/checks/quality-runner/behavior.mjs';

function unique(values) {
  return [...new Set(values)];
}

export const QUALITY_RUNNER_SLICE_GATES = Object.freeze(
  QUALITY_RUNNER_SLICE_DEFINITIONS.map((definition) => definition.name),
);

export const QUALITY_RUNNER_SLICE_BY_NAME = Object.freeze(
  Object.fromEntries(QUALITY_RUNNER_SLICE_DEFINITIONS.map((definition) => [definition.name, definition])),
);

export const QUALITY_RUNNER_SLICE_BY_SLICE = Object.freeze(
  Object.fromEntries(QUALITY_RUNNER_SLICE_DEFINITIONS.map((definition) => [definition.slice, definition])),
);

function gateNamesForSlices(sliceNames) {
  return Object.freeze(sliceNames.map((slice) => {
    const definition = QUALITY_RUNNER_SLICE_BY_SLICE[slice];
    if (!definition) {
      throw new Error(`unknown quality-runner slice: ${slice}`);
    }
    return definition.name;
  }));
}

function checkFileGateMap(definitions) {
  const entries = new Map();
  for (const definition of definitions) {
    for (const input of definition.inputs) {
      if (!input.startsWith('scripts/checks/quality-runner/') || input.includes('*')) {
        continue;
      }
      entries.set(input, unique([...(entries.get(input) ?? []), definition.name]));
    }
  }
  return Object.freeze(
    Object.fromEntries([...entries].map(([file, gates]) => [file, Object.freeze(gates)])),
  );
}

export const QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS = Object.freeze(
  Object.fromEntries(
    [
      ...QUALITY_RUNNER_SLICE_DEFINITIONS,
      ...QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS,
    ].map((definition) => [definition.name, definition.command]),
  ),
);

export const QUALITY_RUNNER_ACTION_DEFINITION_BY_NAME = Object.freeze(
  Object.fromEntries(
    [
      ...QUALITY_RUNNER_SLICE_DEFINITIONS,
      ...QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS,
    ].map((definition) => [definition.name, definition]),
  ),
);

export const QUALITY_RUNNER_AGGREGATE_INPUTS = Object.freeze(unique([
  'scripts/checks/quality-runner/behavior.mjs',
  'scripts/checks/quality-runner/behavior-dispatch.mjs',
  'scripts/checks/quality-runner/behavior-dispatch-table.mjs',
  ...Object.values(QUALITY_RUNNER_ACTION_DEFINITION_BY_NAME).flatMap((definition) => definition.inputs),
]));

export const QUALITY_RUNNER_REGISTRY_SLICE_GATES = gateNamesForSlices([
  'registry',
]);

export const QUALITY_RUNNER_AFFECTED_SLICE_GATES = gateNamesForSlices([
  'affected-mapping',
  'affected-mode',
  'affected-explain',
  'affected-runtime-status',
  'affected-runtime-env',
  'affected-files',
  'prepush',
]);

export const QUALITY_RUNNER_AFFECTED_RUNTIME_SLICE_GATES = gateNamesForSlices([
  'affected-runtime-status',
  'affected-runtime-env',
]);

export const QUALITY_RUNNER_CACHE_STATS_SLICE_GATES = gateNamesForSlices([
  'cache-stats',
]);

export const QUALITY_RUNNER_CACHE_KEY_SLICE_GATES = gateNamesForSlices([
  'cache-key-digest',
  'cache-key-env',
  'cache-key-tool-version',
]);

export const QUALITY_RUNNER_CACHE_REMOTE_SLICE_GATES = gateNamesForSlices([
  'cache-remote-config',
  'cache-remote-result',
  'cache-remote-stats',
  'cache-remote-repair',
  'cache-remote-artifact',
]);

const QUALITY_RUNNER_CACHE_LOCAL_EXECUTION_SLICE_GATES = gateNamesForSlices([
  'cache-key-digest',
  'cache-key-env',
  'cache-key-tool-version',
  'cache-local',
  'cache-artifact',
]);

export const QUALITY_RUNNER_CACHE_EXECUTION_SLICE_GATES = Object.freeze(unique([
  ...QUALITY_RUNNER_CACHE_LOCAL_EXECUTION_SLICE_GATES,
  ...QUALITY_RUNNER_CACHE_REMOTE_SLICE_GATES,
]));

export const QUALITY_RUNNER_CACHE_SLICE_GATES = Object.freeze(unique([
  ...QUALITY_RUNNER_CACHE_STATS_SLICE_GATES,
  ...QUALITY_RUNNER_CACHE_EXECUTION_SLICE_GATES,
]));

export const QUALITY_RUNNER_MANIFEST_SLICE_GATES = gateNamesForSlices([
  'manifest',
]);

export const QUALITY_RUNNER_ENTRYPOINT_SLICE_GATES = gateNamesForSlices([
  'entrypoint',
]);

export const QUALITY_RUNNER_BENCHMARK_SLICE_GATES = gateNamesForSlices([
  'benchmark',
]);

export const QUALITY_RUNNER_SCHEDULER_SLICE_GATES = gateNamesForSlices([
  'scheduler-env',
  'scheduler-shell',
  'scheduler-local-bin',
  'scheduler-concurrency',
  'scheduler-cache-bypass',
]);

export const QUALITY_RUNNER_HOOK_SLICE_GATES = gateNamesForSlices([
  'hook',
]);

export const QUALITY_RUNNER_PREPUSH_SLICE_GATES = gateNamesForSlices([
  'prepush',
]);

export const QUALITY_RUNNER_PREFLIGHT_CACHE_SLICE_GATES = gateNamesForSlices([
  'preflight-cache-key',
  'preflight-cache-wrapper',
]);

export const QUALITY_RUNNER_CORE_SLICE_GATES = Object.freeze(unique([
  ...QUALITY_RUNNER_REGISTRY_SLICE_GATES,
  ...QUALITY_RUNNER_AFFECTED_SLICE_GATES,
  ...QUALITY_RUNNER_CACHE_SLICE_GATES,
  ...QUALITY_RUNNER_BENCHMARK_SLICE_GATES,
  ...QUALITY_RUNNER_ENTRYPOINT_SLICE_GATES,
  ...QUALITY_RUNNER_MANIFEST_SLICE_GATES,
  ...QUALITY_RUNNER_SCHEDULER_SLICE_GATES,
]));

export const QUALITY_RUNNER_PRIMARY_SLICE_GATES_BY_CHECK_FILE = checkFileGateMap(
  QUALITY_RUNNER_SLICE_DEFINITIONS,
);

export function isQualityRunnerCompatSliceGate(name) {
  return QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS.some((definition) => definition.name === name);
}

export function isQualityRunnerSliceGate(name) {
  return Object.hasOwn(QUALITY_RUNNER_SLICE_BY_NAME, name);
}

export function qualityRunnerSliceInputPatterns(name) {
  return QUALITY_RUNNER_ACTION_DEFINITION_BY_NAME[name]?.inputs ?? [];
}
