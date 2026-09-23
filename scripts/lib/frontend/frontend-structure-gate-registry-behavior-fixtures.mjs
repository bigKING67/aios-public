import { auditFrontendGateRegistry } from './frontend-gate-registry-audit.mjs';
import {
  FRONTEND_STRUCTURE_BEHAVIOR_META_GATE,
  FRONTEND_STRUCTURE_EXPECTED_GATES,
  FRONTEND_STRUCTURE_REGISTRY_META_GATE,
} from './frontend-structure-gates.mjs';
import {
  FRONTEND_BEHAVIOR_QUALITY_BEHAVIOR_META_GATE,
  FRONTEND_BEHAVIOR_QUALITY_META_GATE,
} from './frontend-behavior-quality-gates.mjs';
import {
  insertBeforeGate,
  moveGateAfter,
} from '../shared/gate-fixture-utils.mjs';

const BEHAVIOR_QUALITY_BEHAVIOR_GATE = FRONTEND_BEHAVIOR_QUALITY_BEHAVIOR_META_GATE;
const BEHAVIOR_QUALITY_GATE = FRONTEND_BEHAVIOR_QUALITY_META_GATE;
const BEHAVIOR_META_GATE = FRONTEND_STRUCTURE_BEHAVIOR_META_GATE;
const REGISTRY_META_GATE = FRONTEND_STRUCTURE_REGISTRY_META_GATE;
const EXPECTED_GATES = FRONTEND_STRUCTURE_EXPECTED_GATES;
const REGISTRY_PREFIX_PROBE_GATE = Object.freeze({
  name: 'verify:frontend:structure-gate-registry-probe',
  command: 'node scripts/checks/frontend-structure/gate-registry-probe.mjs',
  file: 'scripts/checks/frontend-structure/gate-registry-probe.mjs',
  label: '[verify:ci] frontend structure gate registry probe',
});

function packageJson(gates) {
  const scripts = Object.fromEntries(gates.map((gate) => [gate.name, gate.command]));
  return { name: 'frontend-structure-registry-fixture', private: true, scripts };
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
      ? `[frontend-structure-gate-registry] Frontend structure gate registry drift was detected:\n- ${findings.join('\n- ')}\n\nKeep frontend structure gates, package.json scripts, and scripts/verify-ci.sh entries synchronized.\n`
      : '',
    stdout: findings.length > 0
      ? ''
      : `[frontend-structure-gate-registry] OK: ${EXPECTED_GATES.length} frontend structure gates are registered and wired into verify:ci.\n`,
  };
}

export function runFrontendStructureRegistryBehaviorFixtures(assertions) {
  const {
    assertEqual,
    assertIncludes,
  } = assertions;

  {
  const result = runRegistry();
  assertEqual(result.status, 0, 'matching frontend structure registry should pass');
  assertIncludes(
    result.stdout,
    `${EXPECTED_GATES.length} frontend structure gates are registered and wired into verify:ci`,
    'passing output should include structure gate count',
  );
  }

{
  const result = runRegistry({
    fileGates: [...EXPECTED_GATES, REGISTRY_PREFIX_PROBE_GATE],
    packageGates: [...EXPECTED_GATES, REGISTRY_PREFIX_PROBE_GATE],
    verifyCiGates: insertBeforeGate(EXPECTED_GATES, REGISTRY_META_GATE.name, REGISTRY_PREFIX_PROBE_GATE),
  });
  assertEqual(result.status, 0, 'suffix-like frontend structure registry script names should not count as duplicates');
  assertIncludes(
    result.stdout,
    `${EXPECTED_GATES.length} frontend structure gates are registered and wired into verify:ci`,
    'suffix-like probe output should still report the canonical structure gate count',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.map((gate) => (
      gate.name === 'verify:components:size'
        ? { ...gate, command: 'node scripts/checks/components/legacy-size-drift.mjs' }
        : gate
    )),
  });
  assertEqual(result.status, 1, 'drifted package script command should fail');
  assertIncludes(
    result.stderr,
    'verify:components:size package script drifted',
    'package drift should be reported',
  );
}

{
  const result = runRegistry({
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== 'verify:components:inline-styles'),
  });
  assertEqual(result.status, 1, 'missing verify:ci run line should fail');
  assertIncludes(
    result.stderr,
    'verify:components:inline-styles must appear in scripts/verify-ci.sh exactly once; found 0',
    'missing verify:ci run should be reported',
  );
}

{
  const result = runRegistry({
    labelOverrides: {
      'verify:components:api': '[verify:ci] component API contract',
    },
  });
  assertEqual(result.status, 1, 'wrong adjacent verify:ci label should fail');
  assertIncludes(
    result.stderr,
    'verify:components:api must have adjacent verify:ci label',
    'label drift should be reported',
  );
}

{
  const result = runRegistry({
    skipFiles: new Set(['scripts/checks/components/boundaries.mjs']),
  });
  assertEqual(result.status, 1, 'missing target file should fail');
  assertIncludes(
    result.stderr,
    'verify:components:boundaries target file is missing: scripts/checks/components/boundaries.mjs',
    'missing target file should be reported',
  );
}

{
  const result = runRegistry({
    verifyCiGates: moveGateAfter(
      EXPECTED_GATES,
      'verify:app:inline-styles',
      'verify:app:boundaries',
    ),
  });
  assertEqual(result.status, 1, 'out-of-order verify:ci entries should fail');
  assertIncludes(
    result.stderr,
    'verify:app:inline-styles is out of order in scripts/verify-ci.sh',
    'order drift should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_META_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_META_GATE.name),
  });
  assertEqual(result.status, 1, 'missing registry behavior meta gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:structure-gate-registry-behavior package script drifted',
    'missing behavior meta gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_QUALITY_BEHAVIOR_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_QUALITY_BEHAVIOR_GATE.name),
  });
  assertEqual(result.status, 1, 'missing behavior quality behavior gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:behavior-guard-quality-behavior package script drifted',
    'missing behavior quality behavior gate should be reported',
  );
}

{
  const result = runRegistry({
    packageGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_QUALITY_GATE.name),
    verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_QUALITY_GATE.name),
  });
  assertEqual(result.status, 1, 'missing behavior quality gate should fail');
  assertIncludes(
    result.stderr,
    'verify:frontend:behavior-guard-quality package script drifted',
    'missing behavior quality gate should be reported',
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
    'verify:frontend:structure-gate-registry package script drifted',
    'missing registry meta gate should be reported',
  );
}

  return 'pass, suffix-like exact-line probe, package drift, missing verify:ci run, label drift, missing file, order drift, quality gates, and meta-gate drift checks passed.';
}
