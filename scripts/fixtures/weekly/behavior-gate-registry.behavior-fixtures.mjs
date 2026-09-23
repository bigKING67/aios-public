import { insertBeforeGate } from '../../lib/shared/gate-fixture-utils.mjs';
import {
  WEEKLY_BEHAVIOR_FILE_PATTERN,
  WEEKLY_BEHAVIOR_GUARD_QUALITY_META_GATE,
  WEEKLY_BEHAVIOR_MANIFEST_GATES,
  WEEKLY_BEHAVIOR_REGISTRY_META_GATE,
} from '../../lib/weekly/weekly-behavior-gates.mjs';
import {
  auditWeeklyBehaviorGateRegistry,
  formatWeeklyBehaviorGateRegistryFailure,
} from '../../checks/weekly/behavior-gate-registry.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('weekly behavior gate registry fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const REGISTRY_PREFIX_PROBE_GATE = Object.freeze({
  name: 'verify:weekly:behavior-gate-registry-probe',
  command: 'node scripts/checks/weekly/behavior-gate-registry-probe.mjs',
  file: 'scripts/checks/weekly/behavior-gate-registry-probe.mjs',
  label: '[verify:ci] weekly behavior gate registry probe',
});

const BEHAVIOR_GATES = Object.freeze([
  {
    name: 'verify:weekly:alpha',
    command: 'node scripts/checks/weekly/alpha.behavior.mjs',
    file: 'scripts/checks/weekly/alpha.behavior.mjs',
    label: '[verify:ci] weekly alpha behavior',
  },
  {
    name: 'verify:weekly:beta',
    command: 'node scripts/checks/weekly/beta.behavior.mjs',
    file: 'scripts/checks/weekly/beta.behavior.mjs',
    label: '[verify:ci] weekly beta behavior',
  },
  {
    name: 'verify:weekly:gamma',
    command: 'node scripts/checks/weekly-overview/gamma.behavior.mjs',
    file: 'scripts/checks/weekly-overview/gamma.behavior.mjs',
    label: '[verify:ci] weekly gamma behavior',
  },
]);

const EXPECTED_GATES = Object.freeze([
  ...BEHAVIOR_GATES,
  ...WEEKLY_BEHAVIOR_MANIFEST_GATES,
]);
const EXPECTED_BEHAVIOR_GATES = Object.freeze(
  EXPECTED_GATES.filter((gate) => WEEKLY_BEHAVIOR_FILE_PATTERN.test(gate.file)),
);

function packageJson(gates) {
  return {
    name: 'weekly-behavior-registry-fixture',
    private: true,
    scripts: Object.fromEntries(gates.map((gate) => [gate.name, gate.command])),
  };
}

function verifyCi(gates, options = {}) {
  const { labelOverrides = {}, skipLabels = new Set() } = options;
  return [
    '#!/usr/bin/env bash',
    '',
    'set -euo pipefail',
    '',
    ...gates.flatMap((gate) => [
      ...(skipLabels.has(gate.name) ? [] : [`echo "${labelOverrides[gate.name] ?? gate.label}"`]),
      `npm run ${gate.name}`,
      '',
    ]),
  ].join('\n');
}

function fixtureFiles(options = {}) {
  const {
    extraFiles = {},
    fileGates = EXPECTED_GATES,
    labelOverrides = {},
    packageGates = EXPECTED_GATES,
    skipLabels = new Set(),
    verifyCiGates = EXPECTED_GATES,
  } = options;
  const files = {
    'package.json': `${JSON.stringify(packageJson(packageGates), null, 2)}\n`,
    'scripts/verify-ci.sh': verifyCi(verifyCiGates, { labelOverrides, skipLabels }),
    ...extraFiles,
  };

  for (const gate of fileGates) {
    files[gate.file] = '#!/usr/bin/env node\n';
  }

  return files;
}

function runRegistry(options = {}) {
  const {
    packageGates = EXPECTED_GATES,
  } = options;
  const files = fixtureFiles(options);
  const packageFixture = packageJson(packageGates);
  const behaviorFiles = Object.keys(files)
    .filter((file) => WEEKLY_BEHAVIOR_FILE_PATTERN.test(file))
    .sort();
  const findings = auditWeeklyBehaviorGateRegistry({
    behaviorFiles,
    fileExists: (file) => Object.hasOwn(files, file),
    scripts: packageFixture.scripts,
    verifyCiSource: files['scripts/verify-ci.sh'],
  });

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[weekly-behavior-gate-registry] OK: ${EXPECTED_BEHAVIOR_GATES.length} weekly behavior gates are registered and wired into verify:ci.\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatWeeklyBehaviorGateRegistryFailure(findings)}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runRegistry(options));
}

export function runWeeklyBehaviorGateRegistryBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture(
    {},
    (result) => {
      assertEqual(result.status, 0, 'matching weekly behavior registry should pass');
      assertIncludes(
        result.stdout,
        `${EXPECTED_BEHAVIOR_GATES.length} weekly behavior gates are registered and wired into verify:ci`,
        'passing output should include dynamic behavior gate count',
      );
    },
  );

  withFixture(
    {
      fileGates: [...EXPECTED_GATES, REGISTRY_PREFIX_PROBE_GATE],
      packageGates: [...EXPECTED_GATES, REGISTRY_PREFIX_PROBE_GATE],
      verifyCiGates: insertBeforeGate(EXPECTED_GATES, WEEKLY_BEHAVIOR_REGISTRY_META_GATE.name, REGISTRY_PREFIX_PROBE_GATE),
    },
    (result) => {
      assertEqual(result.status, 0, 'suffix-like weekly behavior registry script names should not count as duplicates');
      assertIncludes(
        result.stdout,
        `${EXPECTED_BEHAVIOR_GATES.length} weekly behavior gates are registered and wired into verify:ci`,
        'suffix-like probe output should still report the dynamic behavior gate count',
      );
    },
  );

  withFixture(
    {
      extraFiles: {
        'scripts/checks/weekly/delta.behavior.mjs': '#!/usr/bin/env node\n',
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'unregistered weekly behavior file should fail');
      assertIncludes(
        result.stderr,
        'scripts/checks/weekly/delta.behavior.mjs must be referenced by exactly one package script; found 0',
        'unregistered behavior file should be reported',
      );
    },
  );

  withFixture(
    {
      packageGates: EXPECTED_GATES.map((gate) => (
        gate.name === 'verify:weekly:alpha'
          ? { ...gate, command: 'node scripts/checks/weekly/renamed-alpha.behavior.mjs' }
          : gate
      )),
    },
    (result) => {
      assertEqual(result.status, 1, 'drifted package script target should fail');
      assertIncludes(
        result.stderr,
        'scripts/checks/weekly/alpha.behavior.mjs must be referenced by exactly one package script; found 0',
        'package drift should leave original behavior file unregistered',
      );
      assertIncludes(
        result.stderr,
        'verify:weekly:alpha points at an untracked or missing weekly behavior file: scripts/checks/weekly/renamed-alpha.behavior.mjs',
        'package drift should report untracked behavior target',
      );
    },
  );

  withFixture(
    {
      verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== 'verify:weekly:beta'),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing verify:ci run line should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:beta must appear in scripts/verify-ci.sh exactly once; found 0',
        'missing verify:ci run should be reported',
      );
    },
  );

  withFixture(
    {
      skipLabels: new Set(['verify:weekly:beta']),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing adjacent verify:ci label should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:beta must have an adjacent verify:ci echo label before its npm run line',
        'missing adjacent label should be reported',
      );
    },
  );

  withFixture(
    {
      labelOverrides: {
        [WEEKLY_BEHAVIOR_GUARD_QUALITY_META_GATE.name]: '[verify:ci] weekly behavior quality',
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'wrong meta gate verify:ci label should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:behavior-guard-quality must have adjacent verify:ci label "[verify:ci] weekly behavior guard quality"',
        'meta gate exact label drift should be reported',
      );
    },
  );

  withFixture(
    {
      packageGates: EXPECTED_GATES.filter((gate) => gate.name !== 'verify:weekly:behavior-gate-registry'),
      verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== 'verify:weekly:behavior-gate-registry'),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing behavior registry meta gate should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:behavior-gate-registry package script drifted',
        'missing behavior registry meta gate should be reported',
      );
    },
  );

  withFixture(
    {
      packageGates: EXPECTED_GATES.filter((gate) => gate.name !== 'verify:weekly:behavior-guard-quality'),
      verifyCiGates: EXPECTED_GATES.filter((gate) => gate.name !== 'verify:weekly:behavior-guard-quality'),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing behavior guard quality meta gate should fail');
      assertIncludes(
        result.stderr,
        'verify:weekly:behavior-guard-quality package script drifted',
        'missing behavior guard quality meta gate should be reported',
      );
    },
  );

  return 'pass, suffix-like exact-line probe, unregistered file, package drift, missing verify:ci run, label drift, and meta-gate drift checks passed.';
}
