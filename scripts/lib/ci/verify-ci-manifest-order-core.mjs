import {
  VERIFY_CI_POST_SHELL_GATES,
  VERIFY_CI_RUN_GATES,
} from './verify-ci-gates.mjs';
import {
  VERIFY_CI_META_GATES,
} from './verify-ci-meta-gates.mjs';
import {
  QUALITY_RUNNER_SLICE_GATES,
} from '../quality/quality-runner-slices.mjs';

export const VERIFY_CI_MANIFEST_ORDER_GUARD_NAME = 'verify-ci-manifest-order';

export const VERIFY_CI_POST_SHELL_GATE_NAMES = Object.freeze([
  'verify:frontend:preflight',
]);

export const VERIFY_CI_TERMINAL_RUN_GATE_NAMES = Object.freeze([
  'build',
  'verify:frontend:bundle-budget',
  'verify:frontend:prod-css-integrity',
  'verify:frontend:preview-contract',
  'type-check',
  'verify:backend',
  'verify:shell:syntax',
]);

export const VERIFY_CI_ADAPTER_GATE_NAMES = Object.freeze([
  'verify:design:antd-theme-token-sync',
  'verify:design:antd-theme-token-sync-behavior',
  'verify:design:echarts-theme-token-sync',
  'verify:design:echarts-theme-token-sync-behavior',
  'verify:design:echarts-css-token-sync',
  'verify:design:echarts-css-token-sync-behavior',
]);

export const VERIFY_CI_PAIR_INVARIANTS = Object.freeze([
  ['verify:repo:naming-behavior', 'verify:repo:naming'],
  ['verify:repo:trellis-spec-compact-behavior', 'verify:repo:trellis-spec-compact'],
  ['verify:repo:workspace-doctor-behavior', 'verify:repo:workspace-doctor'],
  ['verify:design:tailwind-behavior', 'verify:design:tailwind'],
  ['verify:design:tailwind-non-color-aliases-behavior', 'verify:design:tailwind-non-color-aliases'],
  ['verify:design:tailwind-utilities-behavior', 'verify:design:tailwind-utilities'],
  ['verify:design:docs-behavior', 'verify:design:docs'],
  ['verify:design:token-values-sync', 'verify:design:token-values-sync-behavior'],
  ['verify:design:antd-table-selectors', 'verify:design:antd-table-selectors-behavior'],
  ['verify:design:antd-theme-token-sync', 'verify:design:antd-theme-token-sync-behavior'],
  ['verify:design:echarts-theme-token-sync', 'verify:design:echarts-theme-token-sync-behavior'],
  ['verify:design:echarts-css-token-sync', 'verify:design:echarts-css-token-sync-behavior'],
  ['verify:design:runtime-tokens-behavior', 'verify:design:runtime-tokens'],
  ['verify:design:token-generator-behavior', 'verify:design:token-generator'],
  ['verify:frontend:quality-docs-drift-behavior', 'verify:frontend:quality-docs-drift'],
  ['verify:frontend:design-evolution-behavior', 'verify:frontend:design-evolution'],
]);

function namesFor(gates) {
  return gates.map((gate) => gate.name);
}

function indexOfGate(names, gateName, findings) {
  const index = names.indexOf(gateName);
  if (index === -1) {
    findings.push(`${gateName} is missing from verify:ci manifest`);
  }
  return index;
}

function assertNoDuplicates(names, sourceName, findings) {
  const seen = new Set();
  for (const name of names) {
    if (seen.has(name)) {
      findings.push(`${name} appears more than once in ${sourceName}`);
    }
    seen.add(name);
  }
}

function assertExactNames(actualNames, expectedNames, sourceName, findings) {
  if (actualNames.join('\n') !== expectedNames.join('\n')) {
    findings.push(
      `${sourceName} must be exactly ${expectedNames.join(', ')}; got ${actualNames.join(', ')}`,
    );
  }
}

function assertStartsWithGate(names, expectedName, sourceName, findings) {
  const actualName = names.at(0);
  if (actualName !== expectedName) {
    findings.push(`${sourceName} must start with ${expectedName}; got ${actualName ?? '<empty>'}`);
  }
}

function assertBlockAfterGate(names, anchorName, expectedBlockNames, sourceName, findings) {
  const anchorIndex = names.indexOf(anchorName);
  if (anchorIndex === -1) {
    findings.push(`${anchorName} is missing from ${sourceName}`);
    return;
  }

  const actualBlock = names.slice(anchorIndex + 1, anchorIndex + 1 + expectedBlockNames.length);
  if (actualBlock.join('\n') !== expectedBlockNames.join('\n')) {
    findings.push(
      `${sourceName} must have ${expectedBlockNames.join(', ')} immediately after ${anchorName}; got ${actualBlock.join(', ')}`,
    );
  }
}

function assertEndsWithGates(names, expectedTailNames, sourceName, findings) {
  const tailStart = Math.max(names.length - expectedTailNames.length, 0);
  const actualTail = names.slice(tailStart);
  if (actualTail.join('\n') !== expectedTailNames.join('\n')) {
    findings.push(
      `${sourceName} must end with ${expectedTailNames.join(', ')}; got ${actualTail.join(', ')}`,
    );
  }
}

function assertBefore(names, beforeName, afterName, findings) {
  const beforeIndex = indexOfGate(names, beforeName, findings);
  const afterIndex = indexOfGate(names, afterName, findings);
  if (beforeIndex === -1 || afterIndex === -1) {
    return;
  }
  if (beforeIndex >= afterIndex) {
    findings.push(`${beforeName} must run before ${afterName}`);
  }
}

function assertAdjacent(names, firstName, secondName, findings) {
  const firstIndex = indexOfGate(names, firstName, findings);
  const secondIndex = indexOfGate(names, secondName, findings);
  if (firstIndex === -1 || secondIndex === -1) {
    return;
  }
  if (secondIndex !== firstIndex + 1) {
    findings.push(`${firstName} must be immediately followed by ${secondName}`);
  }
}

export function verifyCiManifestOrder(options = {}) {
  const {
    postShellGates = VERIFY_CI_POST_SHELL_GATES,
    runGates = VERIFY_CI_RUN_GATES,
  } = options;
  const runNames = namesFor(runGates);
  const postShellNames = namesFor(postShellGates);
  const allNames = [...runNames, ...postShellNames];
  const findings = [];

  assertNoDuplicates(allNames, 'verify:ci manifest', findings);
  assertExactNames(postShellNames, VERIFY_CI_POST_SHELL_GATE_NAMES, 'VERIFY_CI_POST_SHELL_GATES', findings);
  assertStartsWithGate(runNames, 'lint', 'VERIFY_CI_RUN_GATES', findings);
  assertBlockAfterGate(
    runNames,
    'lint:scripts',
    namesFor(VERIFY_CI_META_GATES),
    'VERIFY_CI_RUN_GATES',
    findings,
  );
  assertAdjacent(runNames, 'lint', 'lint:scripts', findings);
  assertBlockAfterGate(
    runNames,
    'verify:ci:profiles',
    QUALITY_RUNNER_SLICE_GATES,
    'VERIFY_CI_RUN_GATES',
    findings,
  );
  assertEndsWithGates(runNames, VERIFY_CI_TERMINAL_RUN_GATE_NAMES, 'VERIFY_CI_RUN_GATES', findings);

  for (const adapterGateName of VERIFY_CI_ADAPTER_GATE_NAMES) {
    assertBefore(runNames, 'verify:design:token-values-sync-behavior', adapterGateName, findings);
  }

  for (const [firstName, secondName] of VERIFY_CI_PAIR_INVARIANTS) {
    assertAdjacent(runNames, firstName, secondName, findings);
  }

  assertBefore(runNames, 'verify:design:behavior-gate-registry-behavior', 'verify:design:behavior-gate-registry', findings);
  assertBefore(runNames, 'verify:frontend:structure-gate-registry-behavior', 'verify:frontend:structure-gate-registry', findings);
  assertBefore(runNames, 'verify:frontend:delivery-gate-registry-behavior', 'verify:frontend:delivery-gate-registry', findings);
  assertBefore(runNames, 'verify:frontend:structure-gate-registry', 'verify:frontend:delivery-gate-registry-behavior', findings);
  assertBefore(runNames, 'verify:frontend:delivery-gate-registry', 'build', findings);
  assertBefore(runNames, 'verify:frontend:build-fingerprint-behavior', 'verify:frontend:bundle-budget-behavior', findings);
  assertBefore(runNames, 'verify:frontend:bundle-budget-behavior', 'build', findings);
  assertBefore(runNames, 'verify:frontend:smoke-behavior', 'verify:frontend:delivery-gate-registry-behavior', findings);
  assertBefore(runNames, 'verify:frontend:prod-css-integrity-behavior', 'verify:frontend:delivery-gate-registry-behavior', findings);
  assertBefore(runNames, 'verify:frontend:preview-contract-behavior', 'verify:frontend:delivery-gate-registry-behavior', findings);
  assertBefore(runNames, 'verify:frontend:quality-docs-drift-behavior', 'verify:frontend:delivery-gate-registry-behavior', findings);
  assertBefore(runNames, 'verify:frontend:quality-docs-drift', 'verify:frontend:delivery-gate-registry-behavior', findings);
  assertBefore(runNames, 'verify:frontend:design-evolution-behavior', 'verify:frontend:delivery-gate-registry-behavior', findings);
  assertBefore(runNames, 'verify:frontend:design-evolution', 'verify:frontend:delivery-gate-registry-behavior', findings);
  assertBefore(runNames, 'build', 'verify:frontend:bundle-budget', findings);
  assertAdjacent(runNames, 'build', 'verify:frontend:bundle-budget', findings);
  assertAdjacent(runNames, 'verify:frontend:bundle-budget', 'verify:frontend:prod-css-integrity', findings);
  assertAdjacent(runNames, 'verify:frontend:prod-css-integrity', 'verify:frontend:preview-contract', findings);
  assertBefore(runNames, 'verify:frontend:bundle-budget', 'verify:frontend:prod-css-integrity', findings);
  assertBefore(runNames, 'verify:frontend:prod-css-integrity', 'verify:frontend:preview-contract', findings);
  assertBefore(runNames, 'verify:frontend:prod-css-integrity', 'type-check', findings);
  assertBefore(runNames, 'verify:frontend:preview-contract', 'type-check', findings);
  assertBefore(runNames, 'verify:frontend:bundle-budget', 'type-check', findings);
  assertBefore(allNames, 'verify:shell:syntax', 'verify:frontend:preflight', findings);

  return findings;
}
