import {
  CI_META_GATES,
  FRONTEND_CHECK_GATE_BY_FILE,
  QUALITY_RUNNER_CHECK_COMMAND_GATES,
  QUICK_BASELINE_GATES,
} from './quality-affected-gates.mjs';
import {
  compoundRule,
  directGateTargetRule,
  rule,
  withDirectGateTargets,
} from './quality-affected-check-script-rule-utils.mjs';

function frontendCheckRule(file, registry) {
  const pairedGate = FRONTEND_CHECK_GATE_BY_FILE[file];
  return compoundRule([
    rule(
      [...CI_META_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES, 'verify:frontend:delivery-gate-registry', ...QUICK_BASELINE_GATES],
      `${file}: frontend check command change`,
    ),
    directGateTargetRule(registry, file),
    pairedGate ? rule([pairedGate], `${file}: paired frontend delivery gate`) : null,
  ]);
}

function frontendStructureRule(file, registry, reasonLabel) {
  return withDirectGateTargets(
    rule(
      [...CI_META_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES, 'verify:frontend:structure-gate-registry', ...QUICK_BASELINE_GATES],
      `${file}: ${reasonLabel}`,
    ),
    registry,
    file,
  );
}

export function frontendCheckScriptRuleForFile(file, registry) {
  if (file.startsWith('scripts/checks/frontend/')) {
    return frontendCheckRule(file, registry);
  }

  if (file.startsWith('scripts/checks/frontend-structure/')) {
    return frontendStructureRule(file, registry, 'frontend structure check command change');
  }

  if (file.startsWith('scripts/checks/frontend-hygiene/')) {
    return frontendStructureRule(file, registry, 'frontend hygiene check command change');
  }

  if (file.startsWith('scripts/checks/app/')) {
    return frontendStructureRule(file, registry, 'app check command change');
  }

  if (file.startsWith('scripts/checks/components/')) {
    return frontendStructureRule(file, registry, 'component check command change');
  }

  if (file.startsWith('scripts/checks/css-modules/')) {
    return frontendStructureRule(file, registry, 'CSS Module check command change');
  }

  return null;
}
