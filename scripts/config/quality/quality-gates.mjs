import {
  VERIFY_CI_POST_SHELL_GATES,
  VERIFY_CI_RUN_GATES,
} from '../../lib/ci/verify-ci-gates.mjs';
import {
  isQualityRunnerCompatSliceGate,
  QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS,
} from '../../lib/quality/quality-runner-slices.mjs';

export const QUALITY_RUNNER_COMMANDS = Object.freeze({
  affected: 'node scripts/quality-runner.mjs run affected',
  backend: 'node scripts/quality-runner.mjs run backend',
  ci: 'node scripts/quality-runner.mjs run ci',
  frontend: 'node scripts/quality-runner.mjs run frontend',
  prepush: 'node scripts/quality-runner.mjs run prepush',
  quick: 'node scripts/quality-runner.mjs run quick',
  release: 'node scripts/quality-runner.mjs run release',
  runtime: 'node scripts/quality-runner.mjs run runtime',
  stats: 'node scripts/quality-runner.mjs stats',
  statsPolicy: 'QUALITY_STATS_LIVE_BUDGET=1 QUALITY_STATS_BUDGET_PROFILE=ci node scripts/checks/quality-runner/cache-stats.mjs',
  statsPolicyRequired: 'QUALITY_STATS_LIVE_BUDGET=1 QUALITY_STATS_BUDGET_PROFILE=ci-required node scripts/checks/quality-runner/cache-stats.mjs',
});

export const QUALITY_ENTRYPOINT_SCRIPTS = Object.freeze({
  'verify:affected': QUALITY_RUNNER_COMMANDS.affected,
  'verify:quick': QUALITY_RUNNER_COMMANDS.quick,
  'verify:prepush': QUALITY_RUNNER_COMMANDS.prepush,
  'verify:ci': QUALITY_RUNNER_COMMANDS.ci,
  'verify:frontend': QUALITY_RUNNER_COMMANDS.frontend,
  'verify:backend': QUALITY_RUNNER_COMMANDS.backend,
  'verify:runtime': QUALITY_RUNNER_COMMANDS.runtime,
  'verify:release': QUALITY_RUNNER_COMMANDS.release,
  'verify:quality:stats': QUALITY_RUNNER_COMMANDS.stats,
  'verify:quality:stats-policy': QUALITY_RUNNER_COMMANDS.statsPolicy,
  'verify:quality:stats-policy:required': QUALITY_RUNNER_COMMANDS.statsPolicyRequired,
});

export const VIRTUAL_QUALITY_PACKAGE_SCRIPTS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS)
      .filter(([scriptName]) => (
        isQualityRunnerCompatSliceGate(scriptName)
        || scriptName === 'verify:quality-runner:manifest'
      )),
  ),
});

export const BACKEND_GATE_NAMES = Object.freeze([
  'verify:backend:fmt',
  'verify:dataops-config:sync',
  'verify:dataops:content-assets-size',
  'verify:backend:check',
  'verify:backend:test',
  'verify:backend:clippy',
  'verify:backend:size',
  'verify:backend:dashboard-typed-row-boundary-behavior',
  'verify:backend:dashboard-typed-row-boundary',
  'verify:backend:dashboard-api-latency-smoke-behavior',
  'verify:backend:dashboard-api-latency-history-behavior',
  'verify:backend:dashboard-api-latency-history-report-behavior',
  'verify:backend:dashboard-api-latency-history-rollup-behavior',
  'verify:backend:dashboard-api-latency-observation-behavior',
  'verify:dashboard:performance-completion-audit-behavior',
]);

export const FRONTEND_DASHBOARD_GATE_NAMES = Object.freeze([
  'verify:dashboard:date-range-bounds-behavior',
  'verify:dashboard:creator-short-video-behavior',
]);

export const DEFAULT_CI_GATE_NAMES = Object.freeze([
  ...VERIFY_CI_RUN_GATES.flatMap((gate) => (
    gate.name === 'verify:backend' ? BACKEND_GATE_NAMES : [gate.name]
  )),
  ...FRONTEND_DASHBOARD_GATE_NAMES,
  ...VERIFY_CI_POST_SHELL_GATES.map((gate) => gate.name),
]);

export const QUALITY_RUNNER_REGISTRY_BASE_GATES = Object.freeze([
  ...VERIFY_CI_RUN_GATES,
  ...VERIFY_CI_POST_SHELL_GATES,
]);

const BACKEND_DEPS = Object.freeze({
  'verify:dataops-config:sync': ['verify:backend:fmt'],
  'verify:dataops:content-assets-size': ['verify:dataops-config:sync'],
  'verify:backend:check': ['verify:dataops-config:sync'],
  'verify:backend:test': ['verify:backend:check'],
  'verify:backend:clippy': ['verify:backend:test'],
  'verify:backend:size': ['verify:backend:clippy'],
  'verify:backend:dashboard-typed-row-boundary': ['verify:backend:dashboard-typed-row-boundary-behavior'],
});

export const EXPLICIT_DEPS = Object.freeze({
  ...BACKEND_DEPS,
  'verify:backend:size': ['verify:backend:check'],
  'verify:frontend:bundle-budget': ['build'],
  'verify:frontend:prod-css-integrity': ['build'],
  'verify:frontend:preview-contract': ['build'],
  'verify:frontend:coverage-ratchet': ['verify:frontend:coverage-ratchet-behavior'],
  'verify:frontend:delivery-gate-registry-behavior': ['verify:frontend:structure-gate-registry'],
  'verify:frontend:delivery-gate-registry': ['verify:frontend:delivery-gate-registry-behavior'],
});
