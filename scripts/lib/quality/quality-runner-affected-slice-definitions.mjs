import {
  QUALITY_RUNNER_AFFECTED_EXPLAIN_INPUTS,
  QUALITY_RUNNER_AFFECTED_FILES_INPUTS,
  QUALITY_RUNNER_AFFECTED_MAPPING_INPUTS,
  QUALITY_RUNNER_AFFECTED_MODE_INPUTS,
  QUALITY_RUNNER_AFFECTED_RUNTIME_ENV_INPUTS,
  QUALITY_RUNNER_AFFECTED_RUNTIME_STATUS_INPUTS,
  QUALITY_RUNNER_PREPUSH_INPUTS,
} from './quality-runner-slice-inputs.mjs';
import {
  defineSlice,
} from './quality-runner-slice-definition-utils.mjs';

export const QUALITY_RUNNER_AFFECTED_SLICE_DEFINITIONS = Object.freeze([
  defineSlice({
    slice: 'affected-mapping',
    name: 'verify:quality-runner:affected-mapping',
    command: 'node scripts/checks/quality-runner/affected-mapping.mjs',
    label: '[quality] quality runner affected mapping self-check',
    inputs: QUALITY_RUNNER_AFFECTED_MAPPING_INPUTS,
  }),
  defineSlice({
    slice: 'affected-mode',
    name: 'verify:quality-runner:affected-mode',
    command: 'node scripts/checks/quality-runner/affected-mode.mjs',
    label: '[quality] quality runner affected list/mode self-check',
    inputs: QUALITY_RUNNER_AFFECTED_MODE_INPUTS,
  }),
  defineSlice({
    slice: 'affected-explain',
    name: 'verify:quality-runner:affected-explain',
    command: 'node scripts/checks/quality-runner/affected-explain.mjs',
    label: '[quality] quality runner affected explain self-check',
    inputs: QUALITY_RUNNER_AFFECTED_EXPLAIN_INPUTS,
  }),
  defineSlice({
    slice: 'affected-runtime-status',
    name: 'verify:quality-runner:affected-runtime-status',
    command: 'node scripts/checks/quality-runner/affected-runtime-status.mjs',
    label: '[quality] quality runner affected runtime status self-check',
    inputs: QUALITY_RUNNER_AFFECTED_RUNTIME_STATUS_INPUTS,
  }),
  defineSlice({
    slice: 'affected-runtime-env',
    name: 'verify:quality-runner:affected-runtime-env',
    command: 'node scripts/checks/quality-runner/affected-runtime-env.mjs',
    label: '[quality] quality runner affected runtime env self-check',
    inputs: QUALITY_RUNNER_AFFECTED_RUNTIME_ENV_INPUTS,
  }),
  defineSlice({
    slice: 'affected-files',
    name: 'verify:quality-runner:affected-files',
    command: 'node scripts/checks/quality-runner/affected-files.mjs',
    label: '[quality] quality runner affected files helper self-check',
    inputs: QUALITY_RUNNER_AFFECTED_FILES_INPUTS,
  }),
  defineSlice({
    slice: 'prepush',
    name: 'verify:quality-runner:prepush',
    command: 'node scripts/checks/quality-runner/prepush.mjs',
    label: '[quality] quality runner prepush mode self-check',
    inputs: QUALITY_RUNNER_PREPUSH_INPUTS,
  }),
]);
