import {
  CI_META_GATES,
  QUALITY_RUNNER_AFFECTED_GATES,
  QUALITY_RUNNER_AFFECTED_RUNTIME_GATES,
  QUALITY_RUNNER_CACHE_EXECUTION_GATES,
  QUALITY_RUNNER_CACHE_KEY_GATES,
  QUALITY_RUNNER_CACHE_REMOTE_GATES,
  QUALITY_RUNNER_CACHE_STATS_GATES,
  QUALITY_RUNNER_LIB_GATE_GROUPS,
  QUALITY_RUNNER_PREFLIGHT_CACHE_GATES,
  QUALITY_RUNNER_SCHEDULER_GATES,
} from './quality-affected-gates.mjs';
import {
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
  QUALITY_RUNNER_PRIMARY_SLICE_GATES_BY_CHECK_FILE,
  QUALITY_RUNNER_SLICE_GATES,
} from './quality-runner-slices.mjs';

export const QUALITY_INFRASTRUCTURE_SCRIPT_GATES = Object.freeze([
  'lint:scripts',
  ...CI_META_GATES,
  'verify:ci:release-version-bump',
]);

export const QUALITY_RUNNER_SELF_CHECK_SCRIPT_GATES = Object.freeze([
  'lint:scripts',
  'verify:ci:release-version-bump',
]);

const QUALITY_RUNNER_COMPATIBILITY_CHECKS = Object.freeze([
  {
    file: 'scripts/checks/quality-runner/affected.mjs',
    gates: Object.freeze([...QUALITY_RUNNER_AFFECTED_GATES]),
    reason: 'quality runner affected compatibility aggregate change',
  },
  {
    file: 'scripts/checks/quality-runner/affected-runtime.mjs',
    gates: Object.freeze([...QUALITY_RUNNER_AFFECTED_RUNTIME_GATES]),
    reason: 'quality runner affected runtime compatibility aggregate change',
  },
  {
    file: 'scripts/checks/quality-runner/cache.mjs',
    gates: Object.freeze([...QUALITY_RUNNER_CACHE_STATS_GATES, ...QUALITY_RUNNER_CACHE_EXECUTION_GATES]),
    reason: 'quality runner cache compatibility aggregate change',
  },
  {
    file: 'scripts/checks/quality-runner/cache-key.mjs',
    gates: Object.freeze([...QUALITY_RUNNER_CACHE_KEY_GATES]),
    reason: 'quality runner cache key compatibility aggregate change',
  },
  {
    file: 'scripts/checks/quality-runner/cache-remote.mjs',
    gates: Object.freeze([...QUALITY_RUNNER_CACHE_REMOTE_GATES]),
    reason: 'quality runner remote cache compatibility aggregate change',
  },
  {
    file: 'scripts/checks/quality-runner/preflight-cache.mjs',
    gates: Object.freeze([...QUALITY_RUNNER_PREFLIGHT_CACHE_GATES, 'verify:frontend:preflight']),
    reason: 'quality runner preflight cache compatibility aggregate change',
  },
  {
    file: 'scripts/checks/quality-runner/scheduler.mjs',
    gates: Object.freeze([...QUALITY_RUNNER_SCHEDULER_GATES]),
    reason: 'quality runner scheduler compatibility aggregate change',
  },
  {
    file: 'scripts/checks/quality-runner/behavior.mjs',
    gates: Object.freeze([QUALITY_RUNNER_AGGREGATE_GATE_NAME, ...QUALITY_RUNNER_SLICE_GATES]),
    reason: 'quality runner aggregate behavior shim change',
  },
  {
    file: 'scripts/checks/quality-runner/behavior-dispatch.mjs',
    gates: Object.freeze(QUALITY_RUNNER_SLICE_GATES),
    reason: 'quality runner behavior dispatch metadata change',
  },
  {
    file: 'scripts/checks/quality-runner/behavior-dispatch-table.mjs',
    gates: Object.freeze(QUALITY_RUNNER_SLICE_GATES),
    reason: 'quality runner behavior dispatch table change',
  },
]);

export const QUALITY_RUNNER_SCRIPT_AFFECTED_RULES = Object.freeze([
  {
    files: new Set(['scripts/lib/quality/quality-release-version-bump-core.mjs']),
    gates: Object.freeze([...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, 'verify:ci:release-version-bump-behavior']),
    reason: 'release version bump core helper change',
  },
  {
    files: new Set(['scripts/lib/quality/quality-release-version-bump-behavior-fixtures.mjs']),
    gates: Object.freeze([...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, 'verify:ci:release-version-bump-behavior']),
    reason: 'release version bump behavior fixture change',
  },
  {
    files: new Set(['scripts/lib/quality/quality-runner-cache-artifact-fixtures.mjs']),
    gates: Object.freeze([...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, 'verify:quality-runner:cache-artifact']),
    reason: 'quality runner artifact cache fixture change',
  },
  {
    files: new Set(['scripts/lib/quality/quality-runner-cache-stats-fixtures.mjs']),
    gates: Object.freeze([...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, 'verify:quality-runner:cache-stats']),
    reason: 'quality runner cache stats fixture change',
  },
]);

function rule(gates, reason) {
  return Object.freeze({
    gates: Object.freeze(gates),
    reason,
  });
}

export function qualityRunnerLibRuleForFile(file) {
  const match = QUALITY_RUNNER_LIB_GATE_GROUPS.find((group) => group.files.includes(file));
  if (!match) {
    return null;
  }
  return rule(
    [...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, ...match.gates],
    `${file}: ${match.reason}`,
  );
}

export function qualityRunnerCheckRuleForFile(file) {
  const special = QUALITY_RUNNER_COMPATIBILITY_CHECKS.find((check) => check.file === file);
  if (special) {
    return rule(
      [...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, ...special.gates],
      `${file}: ${special.reason}`,
    );
  }

  const metadataGates = QUALITY_RUNNER_PRIMARY_SLICE_GATES_BY_CHECK_FILE[file] ?? [];
  if (metadataGates.length === 0) {
    return null;
  }
  return rule(
    [...QUALITY_RUNNER_SELF_CHECK_SCRIPT_GATES, ...metadataGates],
    `${file}: quality runner metadata-derived self-check input change`,
  );
}
