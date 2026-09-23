import { auditFrontendGateRegistry } from './frontend-gate-registry-audit.mjs';
import {
  FRONTEND_DELIVERY_BEHAVIOR_META_GATE,
  FRONTEND_DELIVERY_BUILD_FINGERPRINT_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_COVERAGE_RATCHET_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_DESIGN_EVOLUTION_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_DESIGN_EVOLUTION_GATE,
  FRONTEND_DELIVERY_EXPECTED_GATES,
  FRONTEND_DELIVERY_GATES,
  FRONTEND_DELIVERY_PREVIEW_CONTRACT_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_PREVIEW_CONTRACT_GATE,
  FRONTEND_DELIVERY_PROD_CSS_INTEGRITY_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_PROD_CSS_INTEGRITY_GATE,
  FRONTEND_DELIVERY_QUALITY_DOCS_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_REGISTRY_META_GATE,
  FRONTEND_DELIVERY_RUNTIME_TOKEN_BEHAVIOR_GATE,
  FRONTEND_DELIVERY_SMOKE_BEHAVIOR_GATE,
} from './frontend-delivery-gates.mjs';
import {
  gateByName,
  insertBeforeGate,
  moveGateAfter,
} from '../shared/gate-fixture-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('frontend delivery registry behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const EXPECTED_GATES = FRONTEND_DELIVERY_EXPECTED_GATES;
const DELIVERY_GATES = FRONTEND_DELIVERY_GATES;
const BEHAVIOR_META_GATE = FRONTEND_DELIVERY_BEHAVIOR_META_GATE;
const BUILD_FINGERPRINT_BEHAVIOR_GATE = FRONTEND_DELIVERY_BUILD_FINGERPRINT_BEHAVIOR_GATE;
const COVERAGE_RATCHET_BEHAVIOR_GATE = FRONTEND_DELIVERY_COVERAGE_RATCHET_BEHAVIOR_GATE;
const DESIGN_EVOLUTION_BEHAVIOR_GATE = FRONTEND_DELIVERY_DESIGN_EVOLUTION_BEHAVIOR_GATE;
const DESIGN_EVOLUTION_GATE = FRONTEND_DELIVERY_DESIGN_EVOLUTION_GATE;
const REGISTRY_META_GATE = FRONTEND_DELIVERY_REGISTRY_META_GATE;
const RUNTIME_TOKEN_BEHAVIOR_GATE = FRONTEND_DELIVERY_RUNTIME_TOKEN_BEHAVIOR_GATE;
const SMOKE_BEHAVIOR_GATE = FRONTEND_DELIVERY_SMOKE_BEHAVIOR_GATE;
const PROD_CSS_INTEGRITY_BEHAVIOR_GATE = FRONTEND_DELIVERY_PROD_CSS_INTEGRITY_BEHAVIOR_GATE;
const PROD_CSS_INTEGRITY_GATE = FRONTEND_DELIVERY_PROD_CSS_INTEGRITY_GATE;
const PREVIEW_CONTRACT_BEHAVIOR_GATE = FRONTEND_DELIVERY_PREVIEW_CONTRACT_BEHAVIOR_GATE;
const PREVIEW_CONTRACT_GATE = FRONTEND_DELIVERY_PREVIEW_CONTRACT_GATE;
const QUALITY_DOCS_BEHAVIOR_GATE = FRONTEND_DELIVERY_QUALITY_DOCS_BEHAVIOR_GATE;
const DESIGN_MIRROR_DELIVERY_GATE = gateByName(DELIVERY_GATES, 'verify:design:mirror');
const QUALITY_DOCS_DELIVERY_GATE = gateByName(DELIVERY_GATES, 'verify:frontend:quality-docs-drift');
const COVERAGE_RATCHET_DELIVERY_GATE = gateByName(DELIVERY_GATES, 'verify:frontend:coverage-ratchet');
const PREFLIGHT_GATE = gateByName(EXPECTED_GATES, 'verify:frontend:preflight');
const PREFIX_PROBE_GATE = Object.freeze({
  name: 'verify:frontend:delivery-gate-registry-probe',
  command: 'node scripts/checks/frontend/delivery-registry-probe.mjs',
  file: 'scripts/checks/frontend/delivery-registry-probe.mjs',
  label: '[verify:ci] frontend delivery gate registry probe',
});

function packageJson(gates) {
  const scripts = Object.fromEntries(gates.map((gate) => [gate.name, gate.command]));
  return { name: 'frontend-delivery-registry-fixture', private: true, scripts };
}

function verifyCi(gates, options = {}) {
  const { labelOverrides = {} } = options;
  return [
    '#!/usr/bin/env bash',
    '',
    'set -euo pipefail',
    '',
    ...gates.flatMap((gate) => [
      `echo "${labelOverrides[gate.name] ?? gate.label}"`,
      `npm run ${gate.name}`,
      '',
    ]),
  ].join('\n');
}

function runRegistry(options = {}) {
  const {
    fileGates = EXPECTED_GATES,
    labelOverrides = {},
    packageGates = EXPECTED_GATES,
    skipFiles = new Set(),
    verifyCiGates = EXPECTED_GATES,
  } = options;
  const existingFiles = new Set(
    fileGates
      .map((gate) => gate.file)
      .filter((file) => !skipFiles.has(file)),
  );
  const findings = auditFrontendGateRegistry({
    expectedGates: EXPECTED_GATES,
    fileExists: (file) => existingFiles.has(file),
    packageScripts: packageJson(packageGates).scripts,
    verifyCiSource: verifyCi(verifyCiGates, { labelOverrides }),
  });
  return {
    status: findings.length > 0 ? 1 : 0,
    stderr: findings.length > 0
      ? `[frontend-delivery-gate-registry] Frontend delivery gate registry drift was detected:\n- ${findings.join('\n- ')}\n\nKeep frontend delivery gates, package.json scripts, and scripts/verify-ci.sh entries synchronized.\n`
      : '',
    stdout: findings.length > 0
      ? ''
      : `[frontend-delivery-gate-registry] OK: ${EXPECTED_GATES.length} frontend delivery gates are registered and wired into verify:ci.\n`,
  };
}

export function runFrontendDeliveryRegistryBehaviorFixtures(assertions) {
  useAssertions(assertions);

  {
  const result = runRegistry();
  assertEqual(result.status, 0, 'matching frontend delivery registry should pass');
  assertIncludes(
    result.stdout,
    `${EXPECTED_GATES.length} frontend delivery gates are registered and wired into verify:ci`,
    'passing output should include delivery gate count',
  );
  }

{
  const result = runRegistry({
    fileGates: [...EXPECTED_GATES, PREFIX_PROBE_GATE],
    packageGates: [...EXPECTED_GATES, PREFIX_PROBE_GATE],
    verifyCiGates: insertBeforeGate(EXPECTED_GATES, PREFLIGHT_GATE.name, PREFIX_PROBE_GATE),
  });
  assertEqual(result.status, 0, 'suffix-like frontend delivery registry script names should not count as duplicates');
  assertIncludes(
    result.stdout,
    `${EXPECTED_GATES.length} frontend delivery gates are registered and wired into verify:ci`,
    'suffix-like probe output should still report the canonical delivery gate count',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.map((gate) => (
      gate.name === 'verify:design:tokens'
        ? { ...gate, command: 'node scripts/checks/frontend/design-token-sync-drift.mjs' }
        : gate
    )),
  });
  assertEqual(result.status, 1, 'drifted package script command should fail');
  assertIncludes(result.stderr, 'verify:design:tokens package script drifted', 'package drift should be reported');
}

{
  const result = runRegistry({
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== 'verify:frontend:preflight'),
  });
  assertEqual(result.status, 1, 'missing verify:ci run line should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:preflight must appear in scripts/verify-ci.sh exactly once; found 0',
    'missing verify:ci run should be reported',
  );
}

{
  const result = runRegistry({
    labelOverrides: {
      'verify:design:mirror': '[verify:ci] design mirror',
    },
  });
  assertEqual(result.status, 1, 'wrong adjacent verify:ci label should fail');
  assertIncludes(result.stderr, 'verify:design:mirror must have adjacent verify:ci label', 'label drift should be reported');
}

{
  const result = runRegistry({
    skipFiles: new Set(['scripts/verify-frontend-preflight.sh']),
  });
  assertEqual(result.status, 1, 'missing target file should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:preflight target file is missing: scripts/verify-frontend-preflight.sh',
    'missing target file should be reported',
  );
}

{
  const result = runRegistry({
    verifyCiGates: moveGateAfter(
      EXPECTED_GATES,
      REGISTRY_META_GATE.name,
      'verify:design:runtime-tokens',
    ),
  });
  assertEqual(result.status, 1, 'out-of-order verify:ci entries should fail');
  assertIncludes(result.stderr, 'verify:frontend:delivery-gate-registry is out of order', 'order drift should be reported');
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_META_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_META_GATE.name),
  });
  assertEqual(result.status, 1, 'missing registry behavior meta gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:delivery-gate-registry-behavior package script drifted',
    'missing behavior meta gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== RUNTIME_TOKEN_BEHAVIOR_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== RUNTIME_TOKEN_BEHAVIOR_GATE.name),
  });
  assertEqual(result.status, 1, 'missing runtime token sync behavior gate should fail');
  assertIncludes(
    result.stderr,
    'verify:design:runtime-tokens-behavior package script drifted',
    'missing runtime token sync behavior gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== BUILD_FINGERPRINT_BEHAVIOR_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== BUILD_FINGERPRINT_BEHAVIOR_GATE.name),
  });
  assertEqual(result.status, 1, 'missing frontend build fingerprint behavior gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:build-fingerprint-behavior package script drifted',
    'missing build fingerprint behavior gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== SMOKE_BEHAVIOR_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== SMOKE_BEHAVIOR_GATE.name),
  });
  assertEqual(result.status, 1, 'missing frontend smoke behavior gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:smoke-behavior package script drifted',
    'missing smoke behavior gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== COVERAGE_RATCHET_BEHAVIOR_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== COVERAGE_RATCHET_BEHAVIOR_GATE.name),
  });
  assertEqual(result.status, 1, 'missing frontend coverage ratchet behavior gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:coverage-ratchet-behavior package script drifted',
    'missing coverage ratchet behavior gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== COVERAGE_RATCHET_DELIVERY_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== COVERAGE_RATCHET_DELIVERY_GATE.name),
  });
  assertEqual(result.status, 1, 'missing frontend coverage ratchet gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:coverage-ratchet package script drifted',
    'missing coverage ratchet gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== PROD_CSS_INTEGRITY_BEHAVIOR_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== PROD_CSS_INTEGRITY_BEHAVIOR_GATE.name),
  });
  assertEqual(result.status, 1, 'missing production CSS integrity behavior gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:prod-css-integrity-behavior package script drifted',
    'missing production CSS integrity behavior gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== PROD_CSS_INTEGRITY_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== PROD_CSS_INTEGRITY_GATE.name),
  });
  assertEqual(result.status, 1, 'missing production CSS integrity gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:prod-css-integrity package script drifted',
    'missing production CSS integrity gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== PREVIEW_CONTRACT_BEHAVIOR_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== PREVIEW_CONTRACT_BEHAVIOR_GATE.name),
  });
  assertEqual(result.status, 1, 'missing preview contract behavior gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:preview-contract-behavior package script drifted',
    'missing preview contract behavior gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== PREVIEW_CONTRACT_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== PREVIEW_CONTRACT_GATE.name),
  });
  assertEqual(result.status, 1, 'missing preview contract gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:preview-contract package script drifted',
    'missing preview contract gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== QUALITY_DOCS_BEHAVIOR_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== QUALITY_DOCS_BEHAVIOR_GATE.name),
  });
  assertEqual(result.status, 1, 'missing frontend quality docs behavior gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:quality-docs-drift-behavior package script drifted',
    'missing quality docs behavior gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== QUALITY_DOCS_DELIVERY_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== QUALITY_DOCS_DELIVERY_GATE.name),
  });
  assertEqual(result.status, 1, 'missing frontend quality docs drift gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:quality-docs-drift package script drifted',
    'missing quality docs drift gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== DESIGN_EVOLUTION_BEHAVIOR_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== DESIGN_EVOLUTION_BEHAVIOR_GATE.name),
  });
  assertEqual(result.status, 1, 'missing frontend design evolution behavior gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:design-evolution-behavior package script drifted',
    'missing design evolution behavior gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== DESIGN_EVOLUTION_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== DESIGN_EVOLUTION_GATE.name),
  });
  assertEqual(result.status, 1, 'missing frontend design evolution gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:design-evolution package script drifted',
    'missing design evolution gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== REGISTRY_META_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== REGISTRY_META_GATE.name),
  });
  assertEqual(result.status, 1, 'missing registry meta gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:delivery-gate-registry package script drifted',
    'missing registry meta gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== DESIGN_MIRROR_DELIVERY_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== DESIGN_MIRROR_DELIVERY_GATE.name),
  });
  assertEqual(result.status, 1, 'missing design mirror delivery gate should fail');
  assertIncludes(
    result.stderr,
    'verify:design:mirror package script drifted',
    'missing design mirror gate should be reported',
  );
}

  return 'pass, suffix-like exact-line probe, package drift, missing verify:ci run, label drift, missing file, order drift, delivery gates, build fingerprint behavior, smoke behavior, coverage ratchet, preview contract, quality docs drift, design evolution, and meta-gate drift checks passed.';
}
