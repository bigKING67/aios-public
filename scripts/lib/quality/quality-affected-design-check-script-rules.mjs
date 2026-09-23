import {
  CI_META_GATES,
  DESIGN_CHECK_GATE_BY_FILE,
  QUALITY_RUNNER_CHECK_COMMAND_GATES,
  QUICK_BASELINE_GATES,
} from './quality-affected-gates.mjs';
import {
  compoundRule,
  directGateTargetRule,
  rule,
} from './quality-affected-check-script-rule-utils.mjs';

export function designCheckScriptRuleForFile(file, registry) {
  if (!file.startsWith('scripts/checks/design/')) {
    return null;
  }

  const pairedGate = DESIGN_CHECK_GATE_BY_FILE[file];
  return compoundRule([
    rule(
      [...CI_META_GATES, ...QUALITY_RUNNER_CHECK_COMMAND_GATES, 'verify:design:behavior-gate-registry', ...QUICK_BASELINE_GATES],
      `${file}: design check command change`,
    ),
    directGateTargetRule(registry, file),
    pairedGate ? rule([pairedGate], `${file}: paired design gate`) : null,
  ]);
}
