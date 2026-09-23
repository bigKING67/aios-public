import {
  CI_META_GATES,
  DEPLOY_CONFIG_GATES,
  QUALITY_RUNNER_CHECK_COMMAND_GATES,
  QUICK_BASELINE_GATES,
  REPO_GOVERNANCE_GATES,
} from './quality-affected-gates.mjs';
import {
  QUALITY_INFRASTRUCTURE_SCRIPT_GATES,
} from './quality-runner-affected-script-rules.mjs';
import {
  rule,
  withDirectGateTargets,
} from './quality-affected-check-script-rule-utils.mjs';

const BACKEND_CHECK_SCRIPT_BEHAVIOR_GATES_BY_FILE = Object.freeze({
  'scripts/checks/backend-rust/dashboard-typed-row-boundary.mjs': [
    'verify:backend:dashboard-typed-row-boundary-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-typed-row-boundary.behavior.mjs': [
    'verify:backend:dashboard-typed-row-boundary-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-api-latency-smoke.mjs': [
    'verify:backend:dashboard-api-latency-smoke-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-api-latency-smoke.behavior.mjs': [
    'verify:backend:dashboard-api-latency-smoke-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-api-latency-history.mjs': [
    'verify:backend:dashboard-api-latency-history-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-api-latency-history.behavior.mjs': [
    'verify:backend:dashboard-api-latency-history-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-api-latency-history-report.mjs': [
    'verify:backend:dashboard-api-latency-history-report-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-api-latency-history-report.behavior.mjs': [
    'verify:backend:dashboard-api-latency-history-report-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-api-latency-history-rollup.mjs': [
    'verify:backend:dashboard-api-latency-history-rollup-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-api-latency-history-rollup.behavior.mjs': [
    'verify:backend:dashboard-api-latency-history-rollup-behavior',
  ],
  'scripts/checks/backend-rust/run-dashboard-api-latency-observation.sh': [
    'verify:backend:dashboard-api-latency-observation-behavior',
  ],
  'scripts/checks/backend-rust/dashboard-api-latency-observation.behavior.mjs': [
    'verify:backend:dashboard-api-latency-observation-behavior',
  ],
});

const DASHBOARD_BEHAVIOR_GATES_BY_FILE = Object.freeze({
  'scripts/checks/dashboard/date-range-bounds.behavior.mjs': [
    'verify:dashboard:date-range-bounds-behavior',
  ],
  'scripts/checks/dashboard/creator-short-video.behavior.mjs': [
    'verify:dashboard:creator-short-video-behavior',
  ],
  'scripts/lib/frontend/creator-short-video-data-source-behavior-fixtures.mjs': [
    'verify:dashboard:creator-short-video-behavior',
  ],
  'scripts/lib/frontend/creator-short-video-rendering-behavior-fixtures.mjs': [
    'verify:dashboard:creator-short-video-behavior',
  ],
  'scripts/lib/frontend/creator-short-video-upload-link-behavior-fixtures.mjs': [
    'verify:dashboard:creator-short-video-behavior',
  ],
  'scripts/checks/dashboard/performance-completion-audit.mjs': [
    'verify:dashboard:performance-completion-audit-behavior',
  ],
  'scripts/checks/dashboard/performance-completion-audit.behavior.mjs': [
    'verify:dashboard:performance-completion-audit-behavior',
  ],
});

export function platformCheckScriptRuleForFile(file, registry) {
  if (DASHBOARD_BEHAVIOR_GATES_BY_FILE[file]) {
    return withDirectGateTargets(
      rule(
        [
          ...CI_META_GATES,
          ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
          ...DASHBOARD_BEHAVIOR_GATES_BY_FILE[file],
        ],
        `${file}: dashboard behavior guard change`,
      ),
      registry,
      file,
    );
  }

  if (file.startsWith('scripts/checks/dataops/')) {
    return withDirectGateTargets(
      rule([...CI_META_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES], `${file}: dataops check command change`),
      registry,
      file,
    );
  }

  if (file.startsWith('scripts/checks/marketing/')) {
    return withDirectGateTargets(
      rule([...CI_META_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES], `${file}: marketing check command change`),
      registry,
      file,
    );
  }

  if (file.startsWith('scripts/checks/ci/') || file.startsWith('scripts/checks/shared/')) {
    return withDirectGateTargets(
      rule([...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES], `${file}: quality/ci check command change`),
      registry,
      file,
    );
  }

  if (file.startsWith('scripts/checks/security/')) {
    return withDirectGateTargets(
      rule([...CI_META_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES], `${file}: security check command change`),
      registry,
      file,
    );
  }

  if (file.startsWith('scripts/checks/repo/')) {
    return withDirectGateTargets(
      rule([...CI_META_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES, ...REPO_GOVERNANCE_GATES, ...QUICK_BASELINE_GATES], `${file}: repository governance check command change`),
      registry,
      file,
    );
  }

  if (file.startsWith('scripts/checks/deploy/')) {
    return withDirectGateTargets(
      rule([...CI_META_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES, ...DEPLOY_CONFIG_GATES], `${file}: deploy check command change`),
      registry,
      file,
    );
  }

  if (file.startsWith('scripts/checks/shell/')) {
    return withDirectGateTargets(
      rule([...CI_META_GATES, 'verify:shell:syntax', ...QUICK_BASELINE_GATES], `${file}: shell syntax check command change`),
      registry,
      file,
    );
  }

  if (file.startsWith('scripts/checks/backend-rust/')) {
    const backendCheckBehaviorGates = BACKEND_CHECK_SCRIPT_BEHAVIOR_GATES_BY_FILE[file] ?? [];
    const backendShellGates = file.endsWith('.sh') ? ['verify:shell:syntax'] : [];
    return withDirectGateTargets(
      rule(
        [
          ...CI_META_GATES,
          ...QUALITY_RUNNER_CHECK_COMMAND_GATES,
          ...backendCheckBehaviorGates,
          ...backendShellGates,
        ],
        `${file}: backend check command change`,
      ),
      registry,
      file,
    );
  }

  if (file.startsWith('scripts/checks/weekly')) {
    return withDirectGateTargets(
      rule([...CI_META_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES, 'verify:weekly:behavior-gate-registry', 'verify:weekly:boundary-gate-registry'], `${file}: weekly check command change`),
      registry,
      file,
    );
  }

  return null;
}
