import {
  DESIGN_BEHAVIOR_EXPECTED_GATES,
  DESIGN_BEHAVIOR_GATES,
  DESIGN_BEHAVIOR_REGISTRY_META_GATE,
} from './design-behavior-gates.mjs';
import {
  insertBeforeGate,
  moveGateAfter,
} from '../shared/gate-fixture-utils.mjs';
import {
  auditDesignBehaviorGateRegistry,
  listDesignBehaviorFiles,
} from '../../checks/design/behavior-gate-registry.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('design behavior gate registry fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const BEHAVIOR_GATES = DESIGN_BEHAVIOR_GATES;
const META_GATE = DESIGN_BEHAVIOR_REGISTRY_META_GATE;
const EXPECTED_GATES = DESIGN_BEHAVIOR_EXPECTED_GATES;
const REGISTRY_PREFIX_PROBE_GATE = Object.freeze({
  name: 'verify:design:behavior-gate-registry-probe',
  command: 'node scripts/checks/design/behavior-gate-registry-probe.mjs',
  file: 'scripts/checks/design/behavior-gate-registry-probe.mjs',
  label: '[verify:ci] design behavior gate registry probe',
});

function packageJson(gates) {
  const scripts = Object.fromEntries(gates.map((gate) => [gate.name, gate.command]));
  return JSON.stringify({ name: 'design-behavior-registry-fixture', private: true, scripts }, null, 2);
}

function verifyCi(gates) {
  return [
    '#!/usr/bin/env bash',
    '',
    'set -euo pipefail',
    '',
    ...gates.flatMap((gate) => [
      `echo "${gate.label}"`,
      `npm run ${gate.name}`,
      '',
    ]),
  ].join('\n');
}

function fixtureFiles(options = {}) {
  const {
    extraFiles = {},
    gates = EXPECTED_GATES,
    includeFiles = true,
  } = options;
  const files = {
    'package.json': `${packageJson(gates)}\n`,
    'scripts/verify-ci.sh': verifyCi(gates),
    ...extraFiles,
  };

  if (includeFiles) {
    for (const gate of gates) {
      files[gate.file] = '#!/usr/bin/env node\n';
    }
  }

  return files;
}

function runRegistry(options = {}) {
  const {
    gates = EXPECTED_GATES,
  } = options;
  const files = fixtureFiles(options);
  const findings = auditDesignBehaviorGateRegistry({
    designBehaviorFiles: Object.keys(files)
      .filter((file) => /^scripts\/checks\/design\/.+\.behavior\.mjs$/.test(file))
      .sort(),
    repoRoot: '',
    scripts: Object.fromEntries(gates.map((gate) => [gate.name, gate.command])),
    verifyCiSource: files['scripts/verify-ci.sh'],
    fileExists: (file) => Object.hasOwn(files, file),
  });

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[design-behavior-gate-registry] OK: ${BEHAVIOR_GATES.length} design behavior gates are registered and wired into verify:ci.\n`,
      stderr: '',
    };
  }

  const lines = ['[design-behavior-gate-registry] Design behavior gate registry drift was detected:'];
  for (const finding of findings) {
    lines.push(`- ${finding}`);
  }
  lines.push('', 'Keep design behavior guards, package.json scripts, and scripts/verify-ci.sh entries synchronized.');
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runRegistry(options));
}

export function runDesignBehaviorGateRegistryBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture(
    {},
    (result) => {
      assertEqual(result.status, 0, 'matching design behavior registry should pass');
      assertIncludes(
        result.stdout,
        `${BEHAVIOR_GATES.length} design behavior gates are registered and wired into verify:ci`,
        'passing output should include behavior gate count',
      );
    },
  );

  withFixture(
    {
      gates: insertBeforeGate(EXPECTED_GATES, META_GATE.name, REGISTRY_PREFIX_PROBE_GATE),
    },
    (result) => {
      assertEqual(result.status, 0, 'suffix-like design behavior registry script names should not count as duplicates');
      assertIncludes(
        result.stdout,
        `${BEHAVIOR_GATES.length} design behavior gates are registered and wired into verify:ci`,
        'suffix-like probe output should still report the canonical design behavior gate count',
      );
    },
  );

  withFixture(
    {
      extraFiles: {
        'scripts/checks/design/shadow-audit.behavior.mjs': '#!/usr/bin/env node\n',
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'unregistered design behavior file should fail');
      assertIncludes(
        result.stderr,
        'scripts/checks/design/shadow-audit.behavior.mjs is a design behavior guard but is not registered',
        'unregistered behavior file should be reported',
      );
    },
  );

  withFixture(
    {
      extraFiles: {
        'scripts/checks/design/aaa-extra.behavior.mjs': '#!/usr/bin/env node\n',
        'scripts/checks/design/ignore.txt': 'skip\n',
        'scripts/checks/design/nested/not-scanned.behavior.mjs': '#!/usr/bin/env node\n',
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'unregistered direct design behavior files should fail');
      assertIncludes(
        result.stderr,
        'scripts/checks/design/aaa-extra.behavior.mjs is a design behavior guard but is not registered',
        'direct behavior file should be reported',
      );
    },
  );

  withFixture(
    {
      gates: EXPECTED_GATES.map((gate) => (
        gate.name === 'verify:design:raw-colors-behavior'
          ? { ...gate, command: 'node scripts/checks/design/raw-colors-css-modules.mjs' }
          : gate
      )),
    },
    (result) => {
      assertEqual(result.status, 1, 'drifted package script command should fail');
      assertIncludes(
        result.stderr,
        'verify:design:raw-colors-behavior package script drifted',
        'package drift should be reported',
      );
    },
  );

  withFixture(
    {
      gates: moveGateAfter(
        EXPECTED_GATES,
        'verify:design:raw-colors-behavior',
        'verify:design:raw-color-source-allowlist-behavior',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'out-of-order verify:ci entries should fail');
      assertIncludes(
        result.stderr,
        'verify:design:raw-color-source-allowlist-behavior is out of order in scripts/verify-ci.sh',
        'order drift should be reported',
      );
    },
  );

  withFixture(
    {
      gates: BEHAVIOR_GATES,
    },
    (result) => {
      assertEqual(result.status, 1, 'missing registry meta gate should fail');
      assertIncludes(
        result.stderr,
        'verify:design:behavior-gate-registry package script drifted',
        'missing meta gate should be reported',
      );
    },
  );

  const files = fixtureFiles({
    extraFiles: {
      'scripts/checks/design/aaa-extra.behavior.mjs': '#!/usr/bin/env node\n',
      'scripts/checks/design/ignore.txt': 'skip\n',
      'scripts/checks/design/nested/not-scanned.behavior.mjs': '#!/usr/bin/env node\n',
    },
  });
  const repoRoot = '';
  const listed = listDesignBehaviorFiles(repoRoot, {
    listDirEntries(relativeDir) {
      return Object.keys(files)
        .filter((file) => file.startsWith(`${relativeDir}/`))
        .map((file) => file.slice(relativeDir.length + 1))
        .filter((name) => !name.includes('/'))
        .map((name) => ({
          isDirectory: () => false,
          isFile: () => true,
          name,
        }));
    },
    statDir() {
      return { isDirectory: () => true };
    },
  });
  assertEqual(
    listed.at(0),
    'scripts/checks/design/aaa-extra.behavior.mjs',
    'listDesignBehaviorFiles should include direct behavior files from the design checks directory',
  );
  assertEqual(
    listed.includes('scripts/checks/design/ignore.txt'),
    false,
    'listDesignBehaviorFiles should skip non-behavior files',
  );
  assertEqual(
    listed.includes('scripts/checks/design/nested/not-scanned.behavior.mjs'),
    false,
    'listDesignBehaviorFiles should not invent nested files when injected entries do not expose directories',
  );

  return 'pass, suffix-like exact-line probe, unregistered file, direct-file listing, package drift, order drift, and meta-gate drift checks passed.';
}
