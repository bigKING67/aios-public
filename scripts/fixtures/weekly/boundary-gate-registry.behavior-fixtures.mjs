import {
  WEEKLY_BOUNDARY_EXPECTED_GATES,
  WEEKLY_BOUNDARY_REGISTRY_BEHAVIOR_META_GATE,
  WEEKLY_BOUNDARY_REGISTRY_META_GATE,
} from '../../lib/weekly/weekly-boundary-gates.mjs';
import {
  insertBeforeGate,
  moveGateAfter,
} from '../../lib/shared/gate-fixture-utils.mjs';
import {
  auditWeeklyBoundaryGateRegistry,
  formatWeeklyBoundaryGateRegistryFailure,
} from '../../checks/weekly-tabs/boundary-gate-registry.mjs';

const BEHAVIOR_META_GATE = WEEKLY_BOUNDARY_REGISTRY_BEHAVIOR_META_GATE;
const REGISTRY_META_GATE = WEEKLY_BOUNDARY_REGISTRY_META_GATE;
const EXPECTED_GATES = WEEKLY_BOUNDARY_EXPECTED_GATES;
const REGISTRY_PREFIX_PROBE_GATE = Object.freeze({
  name: 'verify:weekly:boundary-gate-registry-probe',
  command: 'node scripts/checks/weekly-tabs/boundary-gate-registry-probe.mjs',
  file: 'scripts/checks/weekly-tabs/boundary-gate-registry-probe.mjs',
  label: '[verify:ci] weekly tabs boundary gate registry probe',
});

function packageJson(gates) {
  return {
    name: 'weekly-boundary-registry-fixture',
    private: true,
    scripts: Object.fromEntries(gates.map((gate) => [gate.name, gate.command])),
  };
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

function fixtureFiles(options = {}) {
  const {
    fileGates = EXPECTED_GATES,
    labelOverrides = {},
    packageGates = EXPECTED_GATES,
    skipFiles = new Set(),
    verifyCiGates = EXPECTED_GATES,
  } = options;
  const files = {
    'package.json': `${JSON.stringify(packageJson(packageGates), null, 2)}\n`,
    'scripts/verify-ci.sh': verifyCi(verifyCiGates, { labelOverrides }),
  };

  for (const gate of fileGates) {
    if (!skipFiles.has(gate.file)) {
      files[gate.file] = '#!/usr/bin/env node\n';
    }
  }

  return files;
}

function runRegistry(options = {}) {
  const {
    packageGates = EXPECTED_GATES,
  } = options;
  const files = fixtureFiles(options);
  const packageFixture = packageJson(packageGates);
  const findings = auditWeeklyBoundaryGateRegistry({
    fileExists: (file) => Object.hasOwn(files, file),
    scripts: packageFixture.scripts,
    verifyCiSource: files['scripts/verify-ci.sh'],
  });

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[weekly-tabs-boundary-gate-registry] OK: ${EXPECTED_GATES.length} weekly boundary gates are registered and wired into verify:ci.\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatWeeklyBoundaryGateRegistryFailure(findings)}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runRegistry(options));
}

export function runWeeklyBoundaryGateRegistryBehaviorFixtures(assertions) {
  const { assertEqual, assertIncludes } = assertions;

  withFixture(
    {},
    (result) => {
      assertEqual(result.status, 0, 'matching weekly boundary registry should pass');
      assertIncludes(
        result.stdout,
        `${EXPECTED_GATES.length} weekly boundary gates are registered and wired into verify:ci`,
        'passing output should include boundary gate count',
      );
    },
  );

  withFixture(
    {
      fileGates: [...EXPECTED_GATES, REGISTRY_PREFIX_PROBE_GATE],
      packageGates: [...EXPECTED_GATES, REGISTRY_PREFIX_PROBE_GATE],
      verifyCiGates: insertBeforeGate(EXPECTED_GATES, REGISTRY_META_GATE.name, REGISTRY_PREFIX_PROBE_GATE),
    },
    (result) => {
      assertEqual(result.status, 0, 'suffix-like weekly boundary registry script names should not count as duplicates');
      assertIncludes(
        result.stdout,
        `${EXPECTED_GATES.length} weekly boundary gates are registered and wired into verify:ci`,
        'suffix-like probe output should still report the canonical boundary gate count',
      );
    },
  );

  withFixture(
    {
      packageGates: EXPECTED_GATES.map((gate) => (
        gate.name === 'verify:weekly:contract-layers'
          ? { ...gate, command: 'node scripts/checks/weekly-tabs/layer-boundaries-drift.mjs' }
          : gate
      )),
    },
    (result) => {
      assertEqual(result.status, 1, 'drifted package script command should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:contract-layers package script drifted',
        'package drift should be reported',
      );
    },
  );

  withFixture(
    {
      verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== 'verify:weekly:adapter-layers'),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing verify:ci run line should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:adapter-layers must appear in scripts/verify-ci.sh exactly once; found 0',
        'missing verify:ci run should be reported',
      );
    },
  );

  withFixture(
    {
      labelOverrides: {
        'verify:weekly:render-boundaries': '[verify:ci] weekly tabs render boundary',
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'wrong verify:ci label should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:render-boundaries must have adjacent verify:ci label "[verify:ci] weekly tabs render boundaries"',
        'label drift should be reported',
      );
    },
  );

  withFixture(
    {
      skipFiles: new Set(['scripts/checks/weekly-tabs/contract-boundaries.mjs']),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing target file should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:contract-boundaries target file is missing: scripts/checks/weekly-tabs/contract-boundaries.mjs',
        'missing target file should be reported',
      );
    },
  );

  withFixture(
    {
      verifyCiGates: moveGateAfter(
        EXPECTED_GATES,
        'verify:weekly:exported-props-boundaries',
        'verify:weekly:contract-layers',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'out-of-order verify:ci entries should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:exported-props-boundaries is out of order in scripts/verify-ci.sh',
        'order drift should be reported',
      );
    },
  );

  withFixture(
    {
      packageGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_META_GATE.name),
      verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== BEHAVIOR_META_GATE.name),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing registry behavior meta gate should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:boundary-gate-registry-behavior package script drifted',
        'missing behavior meta gate should be reported',
      );
    },
  );

  withFixture(
    {
      packageGates: EXPECTED_GATES.filter((gate) => gate.name !== REGISTRY_META_GATE.name),
      verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== REGISTRY_META_GATE.name),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing registry meta gate should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:boundary-gate-registry package script drifted',
        'missing registry meta gate should be reported',
      );
    },
  );

  return 'pass, suffix-like exact-line probe, package drift, missing verify:ci run, label drift, missing file, order drift, and meta-gate drift checks passed.';
}
