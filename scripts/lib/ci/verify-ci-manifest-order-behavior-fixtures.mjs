import {
  VERIFY_CI_POST_SHELL_GATES,
  VERIFY_CI_RUN_GATES,
} from './verify-ci-gates.mjs';
import {
  gateNames,
  moveGateAfter,
  swapGatesByName,
} from '../shared/gate-fixture-utils.mjs';
import {
  QUALITY_RUNNER_SLICE_GATES,
} from '../quality/quality-runner-slices.mjs';
import { verifyCiManifestOrder } from './verify-ci-manifest-order-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('verify-ci manifest order behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const RUN_GATES = VERIFY_CI_RUN_GATES;
const POST_SHELL_GATES = VERIFY_CI_POST_SHELL_GATES;
const SOURCE_BY_NAME = new Map(
  [...RUN_GATES, ...POST_SHELL_GATES].map((gate) => [gate.name, gate]),
);

function mapGates(names) {
  return names.map((name) => {
    const gate = SOURCE_BY_NAME.get(name);
    if (!gate) {
      throw new Error(`test fixture references unknown gate: ${name}`);
    }
    return gate;
  });
}

function runWithNames(runNames, postShellNames = gateNames(POST_SHELL_GATES)) {
  return verifyCiManifestOrder({
    postShellGates: mapGates(postShellNames),
    runGates: mapGates(runNames),
  });
}

function assertPass(findings, message) {
  assertEqual(findings.length, 0, `${message}; findings: ${findings.join('; ')}`);
}

function assertFailsWith(findings, expectedSnippet, message) {
  assertIncludes(findings.join('\n'), expectedSnippet, message);
}

export function runVerifyCiManifestOrderBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const baselineRunNames = gateNames(RUN_GATES);

  assertPass(runWithNames(baselineRunNames), 'baseline manifest should pass');

  assertFailsWith(
    runWithNames(gateNames(moveGateAfter(
      RUN_GATES,
      'lint',
      'verify:ci:wiring',
    ))),
    'VERIFY_CI_RUN_GATES must start with lint',
    'moving lint away from the first gate should fail the start invariant',
  );

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:ci:generated-behavior',
    'verify:design:raw-colors',
  ))),
  'immediately after lint',
  'moving a verify:ci meta gate out of the post-lint block should fail the meta block invariant',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    QUALITY_RUNNER_SLICE_GATES[0],
    'verify:design:raw-colors',
  ))),
  'VERIFY_CI_RUN_GATES must have verify:quality-runner:registry',
  'moving a quality-runner slice out of the post-meta block should fail slice block invariant',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:repo:naming-behavior',
    'verify:repo:naming',
  ))),
  'verify:repo:naming-behavior must be immediately followed by verify:repo:naming',
  'swapping repo naming behavior/main gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:repo:workspace-doctor-behavior',
    'verify:repo:workspace-doctor',
  ))),
  'verify:repo:workspace-doctor-behavior must be immediately followed by verify:repo:workspace-doctor',
  'swapping workspace doctor behavior/main gates should fail adjacency',
);

assertFailsWith(
  runWithNames(
    [...baselineRunNames, 'verify:frontend:preflight'],
    [],
  ),
  'VERIFY_CI_POST_SHELL_GATES must be exactly verify:frontend:preflight',
  'moving preflight into run gates should fail the post-shell invariant',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:design:token-values-sync-behavior',
    'verify:design:antd-theme-token-sync',
  ))),
  'verify:design:token-values-sync-behavior must run before verify:design:antd-theme-token-sync',
  'moving token helper behavior after adapter sync should fail dependency ordering',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:token-values-sync',
    'verify:design:token-values-sync-behavior',
  ))),
  'verify:design:token-values-sync must be immediately followed by verify:design:token-values-sync-behavior',
  'swapping design token value helper main/behavior gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:tailwind-behavior',
    'verify:design:tailwind',
  ))),
  'verify:design:tailwind-behavior must be immediately followed by verify:design:tailwind',
  'swapping Tailwind color alias behavior/main gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:tailwind-non-color-aliases-behavior',
    'verify:design:tailwind-non-color-aliases',
  ))),
  'verify:design:tailwind-non-color-aliases-behavior must be immediately followed by verify:design:tailwind-non-color-aliases',
  'swapping Tailwind non-color alias behavior/main gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:tailwind-utilities-behavior',
    'verify:design:tailwind-utilities',
  ))),
  'verify:design:tailwind-utilities-behavior must be immediately followed by verify:design:tailwind-utilities',
  'swapping Tailwind utility behavior/main gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:docs-behavior',
    'verify:design:docs',
  ))),
  'verify:design:docs-behavior must be immediately followed by verify:design:docs',
  'swapping design docs behavior/main gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:antd-table-selectors',
    'verify:design:antd-table-selectors-behavior',
  ))),
  'verify:design:antd-table-selectors must be immediately followed by verify:design:antd-table-selectors-behavior',
  'swapping AntD table selector main/behavior gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:antd-theme-token-sync',
    'verify:design:antd-theme-token-sync-behavior',
  ))),
  'verify:design:antd-theme-token-sync must be immediately followed by verify:design:antd-theme-token-sync-behavior',
  'swapping AntD theme sync main/behavior gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:echarts-theme-token-sync',
    'verify:design:echarts-theme-token-sync-behavior',
  ))),
  'verify:design:echarts-theme-token-sync must be immediately followed by verify:design:echarts-theme-token-sync-behavior',
  'swapping ECharts theme sync main/behavior gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:echarts-css-token-sync',
    'verify:design:echarts-css-token-sync-behavior',
  ))),
  'verify:design:echarts-css-token-sync must be immediately followed by verify:design:echarts-css-token-sync-behavior',
  'swapping ECharts CSS sync main/behavior gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:token-generator-behavior',
    'verify:design:token-generator',
  ))),
  'verify:design:token-generator-behavior must be immediately followed by verify:design:token-generator',
  'swapping token generator behavior/main gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:design:runtime-tokens-behavior',
    'verify:design:runtime-tokens',
  ))),
  'verify:design:runtime-tokens-behavior must be immediately followed by verify:design:runtime-tokens',
  'swapping behavior/main token runtime gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:frontend:quality-docs-drift-behavior',
    'verify:frontend:quality-docs-drift',
  ))),
  'verify:frontend:quality-docs-drift-behavior must be immediately followed by verify:frontend:quality-docs-drift',
  'swapping frontend quality docs behavior/main gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(swapGatesByName(
    RUN_GATES,
    'verify:frontend:design-evolution-behavior',
    'verify:frontend:design-evolution',
  ))),
  'verify:frontend:design-evolution-behavior must be immediately followed by verify:frontend:design-evolution',
  'swapping frontend design evolution behavior/main gates should fail adjacency',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:structure-gate-registry',
    'verify:frontend:delivery-gate-registry-behavior',
  ))),
  'verify:frontend:structure-gate-registry must run before verify:frontend:delivery-gate-registry-behavior',
  'moving frontend structure registry behind delivery registry should fail group ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:build-fingerprint-behavior',
    'verify:frontend:bundle-budget-behavior',
  ))),
  'verify:frontend:build-fingerprint-behavior must run before verify:frontend:bundle-budget-behavior',
  'moving build fingerprint behavior after bundle budget behavior should fail pre-budget fixture ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:bundle-budget-behavior',
    'build',
  ))),
  'verify:frontend:bundle-budget-behavior must run before build',
  'moving bundle budget behavior after build should fail pre-build fixture ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:smoke-behavior',
    'verify:frontend:delivery-gate-registry-behavior',
  ))),
  'verify:frontend:smoke-behavior must run before verify:frontend:delivery-gate-registry-behavior',
  'moving smoke behavior behind delivery registry should fail delivery behavior ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:prod-css-integrity-behavior',
    'verify:frontend:delivery-gate-registry-behavior',
  ))),
  'verify:frontend:prod-css-integrity-behavior must run before verify:frontend:delivery-gate-registry-behavior',
  'moving production CSS integrity behavior behind delivery registry should fail delivery behavior ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:preview-contract-behavior',
    'verify:frontend:delivery-gate-registry-behavior',
  ))),
  'verify:frontend:preview-contract-behavior must run before verify:frontend:delivery-gate-registry-behavior',
  'moving preview contract behavior behind delivery registry should fail delivery behavior ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:quality-docs-drift',
    'verify:frontend:delivery-gate-registry-behavior',
  ))),
  'verify:frontend:quality-docs-drift must run before verify:frontend:delivery-gate-registry-behavior',
  'moving quality docs drift behind delivery registry should fail delivery documentation ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:design-evolution',
    'verify:frontend:delivery-gate-registry-behavior',
  ))),
  'verify:frontend:design-evolution must run before verify:frontend:delivery-gate-registry-behavior',
  'moving design evolution behind delivery registry should fail delivery authority ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'build',
    'verify:frontend:bundle-budget',
  ))),
  'build must run before verify:frontend:bundle-budget',
  'moving build after bundle budget should fail post-build output ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:prod-css-integrity',
    'build',
  ))),
  'verify:frontend:bundle-budget must be immediately followed by verify:frontend:prod-css-integrity',
  'moving production CSS integrity before bundle budget should fail terminal delivery ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:preview-contract',
    'build',
  ))),
  'verify:frontend:prod-css-integrity must be immediately followed by verify:frontend:preview-contract',
  'moving preview contract before production CSS integrity should fail terminal delivery ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:smoke-behavior',
    'build',
  ))),
  'verify:frontend:smoke-behavior must run before verify:frontend:delivery-gate-registry-behavior',
  'moving smoke behavior into the terminal block should fail semantic ordering',
);

assertFailsWith(
  runWithNames(gateNames(moveGateAfter(
    RUN_GATES,
    'verify:frontend:bundle-budget',
    'type-check',
  ))),
  'VERIFY_CI_RUN_GATES must end with build, verify:frontend:bundle-budget, verify:frontend:prod-css-integrity, verify:frontend:preview-contract, type-check, verify:backend, verify:shell:syntax',
  'moving bundle budget out of the terminal suffix should fail terminal ordering',
);

  return 'pass, start drift, meta block drift, quality-runner slice block drift, post-shell drift, token-helper drift, pair drift, frontend group drift, smoke behavior drift, preview contract drift, quality docs drift, design evolution drift, and terminal drift checks passed.';
}
