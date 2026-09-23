const CHEAP_BACKEND_JS_GATES = new Set([
  'verify:backend:dashboard-typed-row-boundary',
  'verify:backend:dashboard-typed-row-boundary-behavior',
  'verify:backend:size',
]);

const FRONTEND_DASHBOARD_BEHAVIOR_GATES = new Set([
  'verify:dashboard:date-range-bounds-behavior',
  'verify:dashboard:creator-short-video-behavior',
]);

const BACKEND_DASHBOARD_BEHAVIOR_GATES = new Set([
  'verify:dashboard:performance-completion-audit-behavior',
]);

const EXCLUSIVE_FRONTEND_TEST_GATES = new Set([
  'test:frontend:unit',
  'verify:frontend:coverage-ratchet',
]);

export function groupForGateName(name, {
  isQualityRunnerSliceGate,
  qualityRunnerAggregateGateName,
}) {
  if (name === 'lint' || name.startsWith('lint:') || name === 'build' || name === 'type-check') {
    return 'core';
  }
  if (name.startsWith('verify:ci:') || name === qualityRunnerAggregateGateName || isQualityRunnerSliceGate(name)) {
    return 'ci-meta';
  }
  if (name.startsWith('verify:repo:')) {
    return 'repo';
  }
  if (name.startsWith('verify:deploy:')) {
    return 'deploy';
  }
  if (name.startsWith('verify:design:')) {
    return 'design';
  }
  if (name.startsWith('verify:app:')) {
    return 'app';
  }
  if (name.startsWith('verify:components:')) {
    return 'components';
  }
  if (name.startsWith('verify:css-modules:')) {
    return 'css-modules';
  }
  if (name.startsWith('verify:frontend:')) {
    return 'frontend';
  }
  if (FRONTEND_DASHBOARD_BEHAVIOR_GATES.has(name)) {
    return 'frontend';
  }
  if (BACKEND_DASHBOARD_BEHAVIOR_GATES.has(name)) {
    return 'backend';
  }
  if (name.startsWith('verify:weekly:')) {
    return 'weekly';
  }
  if (name.startsWith('verify:reports:')) {
    return 'reports';
  }
  if (name.startsWith('verify:api-contract') || name.startsWith('verify:migrations:')) {
    return 'contracts';
  }
  if (name.startsWith('verify:backend') || name.startsWith('verify:dataops')) {
    return 'backend';
  }
  if (name.startsWith('verify:shell')) {
    return 'shell';
  }
  if (name.startsWith('test:')) {
    return 'runtime';
  }
  return 'other';
}

export function inferCost(name, command) {
  if (CHEAP_BACKEND_JS_GATES.has(name)) {
    return 'cheap';
  }
  if (name === 'build' || name === 'type-check' || name.startsWith('verify:backend') || name.startsWith('audit:dependencies:') || command.includes('cargo ')) {
    return 'expensive';
  }
  if (name.endsWith('-behavior') || name.includes(':smoke') || command.includes('vite ')) {
    return 'medium';
  }
  return 'cheap';
}

export function inferCacheable(name, command) {
  if (name.startsWith('audit:dependencies:')) {
    return false;
  }
  if (name === 'verify:repo:agent-workflow') {
    return false;
  }
  if (name === 'verify:reports:special-browser-smoke') {
    return false;
  }
  if (
    name === 'verify:frontend:bundle-budget'
    || name === 'verify:frontend:prod-css-integrity'
    || name === 'verify:frontend:preview-contract'
  ) {
    return false;
  }
  if (name.startsWith('test:') || name === 'verify:release' || name === 'verify:runtime') {
    return false;
  }
  if (name === 'verify:ci' || command.includes('quality-runner.mjs run ') || command.includes('vite preview')) {
    return false;
  }
  if (command.includes('cargo test') || command.includes('cargo clippy') || command.includes('cargo check')) {
    return false;
  }
  return true;
}

export function inferParallel(name, command) {
  if (EXCLUSIVE_FRONTEND_TEST_GATES.has(name)) {
    return false;
  }
  if (name === 'audit:dependencies:rust') {
    return false;
  }
  if (name === 'verify:reports:special-browser-smoke') {
    return false;
  }
  if (CHEAP_BACKEND_JS_GATES.has(name)) {
    return true;
  }
  if (name.startsWith('verify:backend') || command.includes('cargo ')) {
    return false;
  }
  if (
    name === 'build'
    || name === 'verify:frontend:bundle-budget'
    || name === 'verify:frontend:prod-css-integrity'
    || name === 'verify:frontend:preview-contract'
  ) {
    return false;
  }
  return true;
}

export function inferOutputs(name) {
  if (name === 'build') {
    return ['apps/web-vite/dist/**'];
  }
  return [];
}

export function inferEnvKeys(name, command) {
  if (name === 'verify:reports:special-browser-smoke') {
    return [
      'FRONTEND_SMOKE_BASE_URL',
      'FRONTEND_SMOKE_CHROME_PATH',
      'FRONTEND_SMOKE_COOKIE_HEADER',
      'FRONTEND_SMOKE_REPORT_MD',
      'SPECIAL_REPORT_BROWSER_SMOKE_REQUIRE_AUTH',
      'SPECIAL_REPORT_BROWSER_SMOKE_REPORT_MD',
      'SPECIAL_REPORT_BROWSER_SMOKE_SETTLE_TIMEOUT_MS',
      'SPECIAL_REPORT_BROWSER_SMOKE_TIMEOUT_MS',
    ];
  }
  if (
    name === 'build'
    || name === 'verify:frontend:bundle-budget'
    || name === 'verify:frontend:prod-css-integrity'
    || name === 'verify:frontend:preview-contract'
  ) {
    return [
      'API_GATEWAY_PREFIX',
      'AIOS_ACCESS_COOKIE_NAME',
      'AIOS_REFRESH_COOKIE_NAME',
      'NODE_ENV',
      'VITE_API_DEBUG_LOGS',
      'VITE_API_GATEWAY_PREFIX',
      'VITE_API_GATEWAY_TARGET',
      'VITE_API_URL',
      'VITE_DASHBOARD_MAX_QUERY_DAYS',
      'VITE_FORCE_FRESH_DATA',
      'VITE_REPORT_API',
      'VITE_SUPER_ADMIN_ACCOUNTS',
    ];
  }
  if (name === 'verify:frontend:design-evolution') {
    return [
      'FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES',
      'FRONTEND_DESIGN_EVOLUTION_REQUIRED',
      'FRONTEND_STYLE_AUTHORITY_MODE',
    ];
  }
  if (name === 'verify:shell:syntax') {
    return [
      'AIOS_SHELL_SYNTAX_CHANGED_FILES',
      'AIOS_SHELL_SYNTAX_CHANGED_SCOPE',
    ];
  }
  if (name === 'verify:frontend:preflight' || command.includes('scripts/verify-frontend-preflight.sh')) {
    return [
      'AIOS_FRONTEND_PREFLIGHT_CACHE',
      'FRONTEND_PREFLIGHT_PYTHON',
      'FRONTEND_PREFLIGHT_SPEC_SYNC_SKIP_PROMPTS',
    ];
  }
  if (name === 'verify:ci:release-version-bump') {
    return [
      'AIOS_QUALITY_BASE',
      'AIOS_QUALITY_CHANGED_FILES',
      'AIOS_QUALITY_HEAD',
    ];
  }
  return [];
}

export function inferModes(name, ciGateNames, {
  backendGateNames,
  isQualityRunnerSliceGate,
}) {
  const modes = new Set();
  if (ciGateNames.has(name)) {
    modes.add('ci');
    modes.add('prepush');
  }
  if (backendGateNames.includes(name)) {
    modes.add('backend');
  }
  if (name.startsWith('test:frontend:smoke')) {
    modes.add('runtime');
  }
  if (name === 'verify:reports:special-browser-smoke') {
    modes.add('runtime');
  }
  if (
    name === 'lint'
    || name.startsWith('lint:')
    || name === 'build'
    || name === 'type-check'
    || name.startsWith('verify:design:')
    || name.startsWith('verify:repo:')
    || name.startsWith('verify:app:')
    || name.startsWith('verify:components:')
    || name.startsWith('verify:css-modules:')
    || name.startsWith('verify:frontend:')
    || FRONTEND_DASHBOARD_BEHAVIOR_GATES.has(name)
    || name.startsWith('verify:weekly:')
    || name.startsWith('verify:reports:')
  ) {
    modes.add('frontend');
  }
  if (
    name.startsWith('lint:')
    || name === 'type-check'
    || name.startsWith('verify:ci:')
    || name.startsWith('verify:deploy:')
    || name.startsWith('verify:repo:')
    || isQualityRunnerSliceGate(name)
    || name === 'verify:frontend:structure-gate-registry'
    || name === 'verify:frontend:delivery-gate-registry'
    || name === 'verify:frontend:preflight'
    || name === 'verify:shell:syntax'
    || name.startsWith('verify:api-contract')
    || name.startsWith('verify:migrations:')
  ) {
    modes.add('quick');
  }
  if (isQualityRunnerSliceGate(name)) {
    modes.add('ci');
    modes.add('prepush');
  }
  if (name === 'verify:ci' || name === 'test:frontend:smoke:preview') {
    modes.add('release');
  }
  return [...modes];
}
