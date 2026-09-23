import {
  QUALITY_RUNNER_AFFECTED_RUNTIME_SLICE_GATES,
  QUALITY_RUNNER_AFFECTED_SLICE_GATES,
  QUALITY_RUNNER_BENCHMARK_SLICE_GATES,
  QUALITY_RUNNER_CACHE_EXECUTION_SLICE_GATES,
  QUALITY_RUNNER_CACHE_KEY_SLICE_GATES,
  QUALITY_RUNNER_CACHE_REMOTE_SLICE_GATES,
  QUALITY_RUNNER_CACHE_SLICE_GATES,
  QUALITY_RUNNER_CACHE_STATS_SLICE_GATES,
  QUALITY_RUNNER_CORE_SLICE_GATES,
  QUALITY_RUNNER_ENTRYPOINT_SLICE_GATES,
  QUALITY_RUNNER_HOOK_SLICE_GATES,
  QUALITY_RUNNER_MANIFEST_SLICE_GATES,
  QUALITY_RUNNER_PREFLIGHT_CACHE_SLICE_GATES,
  QUALITY_RUNNER_PREPUSH_SLICE_GATES,
  QUALITY_RUNNER_REGISTRY_SLICE_GATES,
  QUALITY_RUNNER_SCHEDULER_SLICE_GATES,
} from './quality-runner-slices.mjs';
import {
  REPO_GOVERNANCE_GATE_NAMES,
  REPO_NAMING_GATE_NAMES,
} from '../repo/repo-governance-gates.mjs';

export {
  ALLOWLIST_CONFIG_GATE_GROUPS,
  ALLOWLIST_CONFIG_INPUT_GATE_GROUPS,
} from './quality-allowlist-affected-gates.mjs';
export {
  QUALITY_RUNNER_LIB_GATE_GROUPS,
} from './quality-runner-lib-gate-groups.mjs';

export {
  APP_SOURCE_GATES,
  AUTH_POLICY_SOURCE_GATES,
  COMPONENT_SOURCE_GATES,
  CREATOR_LIBRARY_CSV_CONTRACT_GATES,
  CREATOR_LIBRARY_FOLLOW_LOG_CONTRACT_GATES,
  CREATOR_SHORT_VIDEO_DASHBOARD_GATES,
  CSS_MODULE_SOURCE_GATES,
  DASHBOARD_DATE_RANGE_GATES,
  DESIGN_AUTHORITY_TOKEN_GATES,
  DESIGN_CHECK_GATE_BY_FILE,
  DESIGN_TOKEN_CONFIG_GATES,
  FRONTEND_BUILD_CONFIG_GATES,
  FRONTEND_BUILD_ENV_FILE_GATES,
  FRONTEND_BUNDLE_BUDGET_CONFIG_GATES,
  FRONTEND_COVERAGE_RATCHET_CONFIG_GATES,
  FRONTEND_CHECK_GATE_BY_FILE,
  FRONTEND_CHECK_GATES_BY_HELPER_FILE,
  FRONTEND_CORE_SOURCE_GATES,
  FRONTEND_EXECUTION_COVERAGE_GATES,
  FRONTEND_HYGIENE_GATES,
  FRONTEND_PUBLIC_ASSET_GATES,
  FRONTEND_REGISTRY_GATES,
  FRONTEND_SMOKE_CONFIG_GATES,
  FRONTEND_SMOKE_SCRIPT_GATES,
  FRONTEND_TYPED_BUILD_CONFIG_GATES,
  REPORT_API_SOURCE_GATES,
  ROUTE_POLICY_SOURCE_GATES,
  SPECIAL_REPORT_SMOKE_GATES,
  STYLE_SOURCE_GATES,
  TAILWIND_CONFIG_GATES,
  THEME_TOKEN_SOURCE_GATES,
} from './quality-frontend-affected-gates.mjs';

export {
  packageScriptChangeCanUseFastPath,
} from './quality-package-script-fast-path.mjs';

export const QUICK_BASELINE_GATES = Object.freeze([
  'lint:scripts',
  'type-check',
  'verify:ci:wiring',
  'verify:ci:release-version-bump',
  'verify:ci:generated',
  'verify:ci:manifest-order',
  'verify:ci:profiles',
  'verify:repo:naming',
  'verify:frontend:structure-gate-registry',
  'verify:frontend:delivery-gate-registry',
  'verify:frontend:preflight',
  'verify:shell:syntax',
]);

export const PREPUSH_BASELINE_GATES = Object.freeze([
  'verify:ci:release-version-bump',
  'verify:frontend:preflight',
]);

export const BACKEND_FAST_GATES = Object.freeze([
  'verify:backend:fmt',
  'verify:backend:check',
  'verify:backend:size',
]);

export const QUALITY_RUNNER_REGISTRY_GATES = QUALITY_RUNNER_REGISTRY_SLICE_GATES;
export const QUALITY_RUNNER_AFFECTED_GATES = QUALITY_RUNNER_AFFECTED_SLICE_GATES;
export const QUALITY_RUNNER_AFFECTED_RUNTIME_GATES = QUALITY_RUNNER_AFFECTED_RUNTIME_SLICE_GATES;
export const QUALITY_RUNNER_BENCHMARK_GATES = QUALITY_RUNNER_BENCHMARK_SLICE_GATES;
export const QUALITY_RUNNER_CACHE_GATES = QUALITY_RUNNER_CACHE_SLICE_GATES;
export const QUALITY_RUNNER_CACHE_STATS_GATES = QUALITY_RUNNER_CACHE_STATS_SLICE_GATES;
export const QUALITY_RUNNER_CACHE_KEY_GATES = QUALITY_RUNNER_CACHE_KEY_SLICE_GATES;
export const QUALITY_RUNNER_CACHE_REMOTE_GATES = QUALITY_RUNNER_CACHE_REMOTE_SLICE_GATES;
export const QUALITY_RUNNER_CACHE_EXECUTION_GATES = QUALITY_RUNNER_CACHE_EXECUTION_SLICE_GATES;
export const QUALITY_RUNNER_ENTRYPOINT_GATES = QUALITY_RUNNER_ENTRYPOINT_SLICE_GATES;
export const QUALITY_RUNNER_MANIFEST_GATES = QUALITY_RUNNER_MANIFEST_SLICE_GATES;
export const QUALITY_RUNNER_SCHEDULER_GATES = QUALITY_RUNNER_SCHEDULER_SLICE_GATES;
export const QUALITY_RUNNER_HOOK_GATES = QUALITY_RUNNER_HOOK_SLICE_GATES;
export const QUALITY_RUNNER_PREPUSH_GATES = QUALITY_RUNNER_PREPUSH_SLICE_GATES;
export const QUALITY_RUNNER_PREFLIGHT_CACHE_GATES = QUALITY_RUNNER_PREFLIGHT_CACHE_SLICE_GATES;
export const QUALITY_RUNNER_CORE_GATES = QUALITY_RUNNER_CORE_SLICE_GATES;

export const QUALITY_RUNNER_CHECK_COMMAND_GATES = QUALITY_RUNNER_REGISTRY_GATES;

export const REPO_GOVERNANCE_GATES = REPO_GOVERNANCE_GATE_NAMES;
export const REPO_NAMING_GATES = REPO_NAMING_GATE_NAMES;

export const SAFE_FALLBACK_GATES = Object.freeze([
  ...QUICK_BASELINE_GATES,
  ...BACKEND_FAST_GATES,
]);

export const BACKEND_GATES = Object.freeze([
  'verify:backend:fmt',
  'verify:dataops-config:sync',
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
]);

export const BACKEND_TOOLCHAIN_CONFIG_GATES = Object.freeze([
  'verify:backend:fmt',
  'verify:backend:check',
  'verify:backend:test',
  'verify:backend:clippy',
]);

export const DEPLOY_CONFIG_GATES = Object.freeze([
  'verify:deploy:dashboard-latency-systemd-behavior',
  'verify:deploy:config-behavior',
  'verify:deploy:config',
  'verify:deploy:vps-git-state:smoke',
]);

export const DEPLOY_SCRIPT_CONFIG_GATES = Object.freeze([
  ...DEPLOY_CONFIG_GATES,
  'verify:shell:syntax',
]);

export const CI_META_GATES = Object.freeze([
  'verify:ci:wiring-behavior',
  'verify:ci:wiring',
  'verify:ci:guard-utils-behavior',
  'verify:ci:gate-fixture-utils-behavior',
  'verify:ci:generated-behavior',
  'verify:ci:generated',
  'verify:ci:manifest-order-behavior',
  'verify:ci:manifest-order',
  'verify:ci:profiles-behavior',
  'verify:ci:profiles',
]);

export const IGNORED_AFFECTED_FILE_PATTERNS = Object.freeze([
  /^\.tmp-.*\.pid$/,
  /^\.cache\//,
  /^apps\/web-vite\/dist\//,
]);
