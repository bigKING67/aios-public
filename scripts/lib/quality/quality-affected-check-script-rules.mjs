import {
  QUALITY_RUNNER_SLICE_GATES,
} from './quality-runner-slices.mjs';
import {
  QUALITY_INFRASTRUCTURE_SCRIPT_GATES,
  qualityRunnerCheckRuleForFile,
} from './quality-runner-affected-script-rules.mjs';
import {
  frontendCheckScriptRuleForFile,
} from './quality-affected-frontend-check-script-rules.mjs';
import {
  designCheckScriptRuleForFile,
} from './quality-affected-design-check-script-rules.mjs';
import {
  platformCheckScriptRuleForFile,
} from './quality-affected-platform-check-script-rules.mjs';
import {
  rule,
} from './quality-affected-check-script-rule-utils.mjs';

export function checkScriptAffectedRule(file, registry) {
  const platformRule = platformCheckScriptRuleForFile(file, registry);
  if (platformRule) {
    return platformRule;
  }

  if (file.startsWith('scripts/checks/quality-runner/')) {
    const qualityRule = qualityRunnerCheckRuleForFile(file);
    return qualityRule ?? rule(
      [...QUALITY_INFRASTRUCTURE_SCRIPT_GATES, ...QUALITY_RUNNER_SLICE_GATES],
      `${file}: quality runner self-check change`,
    );
  }

  const frontendRule = frontendCheckScriptRuleForFile(file, registry);
  if (frontendRule) {
    return frontendRule;
  }

  const designRule = designCheckScriptRuleForFile(file, registry);
  if (designRule) {
    return designRule;
  }

  return null;
}
