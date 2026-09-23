import {
  CI_META_GATES,
  FRONTEND_CHECK_GATES_BY_HELPER_FILE,
  QUALITY_RUNNER_CORE_GATES,
} from './quality-affected-gates.mjs';
import {
  commandTargetFiles,
} from './quality-gate-command-targets.mjs';
import {
  checkScriptAffectedRule,
} from './quality-affected-check-script-rules.mjs';
import {
  addNames,
  addRuleEntries,
} from './quality-affected-selection-utils.mjs';
import {
  CI_BEHAVIOR_FIXTURE_GATES_BY_FILE,
} from './quality-affected-ci-rules.mjs';
import {
  QUALITY_INFRASTRUCTURE_SCRIPT_GATES,
  QUALITY_RUNNER_SCRIPT_AFFECTED_RULES,
  qualityRunnerLibRuleForFile,
} from './quality-runner-affected-script-rules.mjs';
import {
  REPO_SCRIPT_AFFECTED_RULES,
} from './quality-affected-repo-rules.mjs';
import {
  reportScriptAffectedRuleForFile,
} from './quality-affected-report-rules.mjs';
import {
  SHARED_GUARD_AFFECTED_RULES,
  SUPPORT_SCRIPT_AFFECTED_RULES,
} from './quality-affected-support-rules.mjs';
import {
  DESIGN_BEHAVIOR_AFFECTED_RULES,
  DESIGN_TOKEN_PLATFORM_AFFECTED_RULES,
} from './quality-affected-design-rules.mjs';
import {
  FRONTEND_DESIGN_HELPER_AFFECTED_RULES,
  FRONTEND_MODULE_GOVERNANCE_AFFECTED_RULES,
  FRONTEND_PREFLIGHT_CACHE_AFFECTED_RULES,
  FRONTEND_ROUTE_POLICY_AFFECTED_RULES,
  FRONTEND_RUNTIME_AFFECTED_RULES,
  FRONTEND_SIZE_BOUNDARY_AFFECTED_RULES,
  FRONTEND_STRUCTURE_HELPER_AFFECTED_RULES,
  frontendScriptRuleForFile,
} from './quality-affected-frontend-rules.mjs';
import {
  WEEKLY_GATE_METADATA_AFFECTED_RULES,
  WEEKLY_TABS_BOUNDARY_AFFECTED_RULES,
  weeklyScriptRuleForFile,
} from './quality-affected-weekly-rules.mjs';

const RUST_DEPENDENCY_AUDIT_FILES = new Set([
  'scripts/checks/security/evaluate-rust-dependency-audit.mjs',
  'scripts/checks/security/list-rust-audit-exceptions.mjs',
  'scripts/security/audit-rust-dependencies.sh',
]);

function pairedCheckGateName(file) {
  const base = file.split('/').at(-1);
  if (!base?.startsWith('check-')) {
    return null;
  }
  const scriptName = base.replace(/\.mjs$/, '');
  const suffix = scriptName.replace(/^check-/, '').replace(/-behavior$/, '');
  return [
    `verify:${suffix}`,
    `verify:frontend:${suffix}`,
    `verify:design:${suffix}`,
    `verify:weekly:${suffix}`,
    `verify:app:${suffix}`,
    `verify:components:${suffix}`,
    `verify:css-modules:${suffix}`,
    `verify:ci:${suffix}`,
  ];
}

function gateNamesByCommandTarget(registry, file) {
  return registry.gates
    .filter((gate) => commandTargetFiles(gate.command).includes(file))
    .map((gate) => gate.name);
}

function addDirectGateTargets(selected, registry, file) {
  addNames(selected, gateNamesByCommandTarget(registry, file), `${file}: direct gate command target`);
}

function addQualityRunnerLibNames(selected, file) {
  const rule = qualityRunnerLibRuleForFile(file);
  if (!rule) {
    return false;
  }
  addRuleEntries(selected, rule);
  return true;
}

function applyScriptRuleTable(selected, file, rules) {
  for (const rule of rules) {
    if (!rule.files.has(file)) {
      continue;
    }
    addNames(selected, rule.gates, `${file}: ${rule.reason}`);
    return true;
  }
  return false;
}

export function applyScriptAffectedRule(selected, registry, file, options = {}) {
  const {
    weekly = [],
  } = options;

  if (file === 'scripts/quality-runner.mjs') {
    addNames(selected, [...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, ...QUALITY_RUNNER_CORE_GATES], `${file}: quality runner core change`);
    return true;
  }

  if (addQualityRunnerLibNames(selected, file)) {
    return true;
  }

  if (RUST_DEPENDENCY_AUDIT_FILES.has(file)) {
    addNames(
      selected,
      [
        ...CI_META_GATES,
        'verify:ci:dependency-audit-behavior',
        'verify:quality-runner:registry',
        'audit:dependencies:rust',
        ...(file.endsWith('.sh') ? ['verify:shell:syntax'] : []),
      ],
      `${file}: Rust dependency audit implementation change`,
    );
    return true;
  }

  if (applyScriptRuleTable(selected, file, REPO_SCRIPT_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, QUALITY_RUNNER_SCRIPT_AFFECTED_RULES)) {
    return true;
  }

  const reportRule = reportScriptAffectedRuleForFile(file);
  if (reportRule) {
    addRuleEntries(selected, reportRule);
    return true;
  }

  const ciBehaviorFixtureRule = CI_BEHAVIOR_FIXTURE_GATES_BY_FILE.get(file);
  if (ciBehaviorFixtureRule) {
    addNames(
      selected,
      [
        ...QUALITY_INFRASTRUCTURE_SCRIPT_GATES,
        ...ciBehaviorFixtureRule.gates,
      ],
      `${file}: ${ciBehaviorFixtureRule.reason}`,
    );
    return true;
  }

  if (applyScriptRuleTable(selected, file, FRONTEND_PREFLIGHT_CACHE_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, SUPPORT_SCRIPT_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, FRONTEND_DESIGN_HELPER_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, FRONTEND_STRUCTURE_HELPER_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, FRONTEND_ROUTE_POLICY_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, DESIGN_TOKEN_PLATFORM_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, DESIGN_BEHAVIOR_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, FRONTEND_SIZE_BOUNDARY_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, FRONTEND_MODULE_GOVERNANCE_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, FRONTEND_RUNTIME_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, SHARED_GUARD_AFFECTED_RULES)) {
    return true;
  }

  if (file.startsWith('scripts/lib/quality/')) {
    addNames(selected, [...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, ...QUALITY_RUNNER_CORE_GATES], `${file}: quality runner core change`);
    return true;
  }

  if (file.startsWith('scripts/lib/security/')) {
    const productionAuditGate = file.includes('/rust-')
      ? 'audit:dependencies:rust'
      : 'audit:dependencies:npm';
    addNames(
      selected,
      [
        ...CI_META_GATES,
        'verify:ci:dependency-audit-behavior',
        productionAuditGate,
      ],
      `${file}: security audit core change`,
    );
    return true;
  }

  const frontendRule = frontendScriptRuleForFile(file);
  if (frontendRule) {
    addRuleEntries(selected, frontendRule);
    return true;
  }

  const checkRule = checkScriptAffectedRule(file, registry);
  if (checkRule) {
    addRuleEntries(selected, checkRule);
    return true;
  }

  if (applyScriptRuleTable(selected, file, WEEKLY_GATE_METADATA_AFFECTED_RULES)) {
    return true;
  }

  if (applyScriptRuleTable(selected, file, WEEKLY_TABS_BOUNDARY_AFFECTED_RULES)) {
    return true;
  }

  const weeklyRule = weeklyScriptRuleForFile(file, weekly);
  if (weeklyRule) {
    addRuleEntries(selected, weeklyRule);
    return true;
  }

  if (file.startsWith('scripts/check-') || file.startsWith('scripts/lib/') || file.startsWith('scripts/verify-')) {
    addNames(selected, CI_META_GATES, `${file}: quality/check script change`);
    addDirectGateTargets(selected, registry, file);
    const helperPairedGates = FRONTEND_CHECK_GATES_BY_HELPER_FILE[file] ?? [];
    addNames(selected, helperPairedGates, `${file}: paired frontend helper gates`);
    const candidates = pairedCheckGateName(file) ?? [];
    addNames(
      selected,
      candidates.filter((candidate) => registry.byName.has(candidate)),
      `${file}: paired gate candidates`,
    );
    if (file.includes('frontend') || file.includes('route') || file.includes('component')) {
      addNames(selected, ['lint:scripts', 'type-check', 'verify:frontend:structure-gate-registry', 'verify:frontend:delivery-gate-registry'], `${file}: frontend check script impact`);
    }
    return true;
  }

  return false;
}
