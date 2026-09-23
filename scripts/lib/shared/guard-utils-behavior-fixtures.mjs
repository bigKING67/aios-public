import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  assertGateRunOrder,
  getRepoRoot,
  requireExactLineNumber,
  requireVerifyCiRunWithAdjacentLabel,
} from './guard-utils.mjs';

function captureExactLineLookup(text, expectedLine) {
  const findings = [];
  const lineNumber = requireExactLineNumber(
    text,
    expectedLine,
    findings,
    (count) => `expected exactly one ${JSON.stringify(expectedLine)} line; found ${count}`,
  );
  return { findings, lineNumber };
}

function captureVerifyCiGate(gate, lines) {
  const findings = [];
  const runLineNumber = requireVerifyCiRunWithAdjacentLabel(
    gate,
    lines.join('\n'),
    lines,
    findings,
  );
  return { findings, runLineNumber };
}

function buildGuardUtilsRuntimeFixture() {
  const exactOnce = captureExactLineLookup(
    [
      'echo "before"',
      '  npm run verify:example  ',
      'npm run verify:example -- --watch',
    ].join('\n'),
    'npm run verify:example',
  );

  const missing = captureExactLineLookup(
    [
      'npm run verify:example -- --watch',
      'npm run verify:example:suffix',
    ].join('\n'),
    'npm run verify:example',
  );

  const duplicate = captureExactLineLookup(
    [
      'npm run verify:example',
      'echo "between"',
      '  npm run verify:example',
    ].join('\n'),
    'npm run verify:example',
  );

  const orderedFindings = [];
  assertGateRunOrder(
    [{ name: 'verify:first' }, { name: 'verify:second' }],
    new Map([['verify:first', 2], ['verify:second', 4]]),
    orderedFindings,
  );

  const missingLineFindings = [];
  assertGateRunOrder(
    [{ name: 'verify:first' }, { name: 'verify:missing' }, { name: 'verify:second' }],
    new Map([['verify:first', 2], ['verify:second', 4]]),
    missingLineFindings,
  );

  const outOfOrderFindings = [];
  assertGateRunOrder(
    [{ name: 'verify:first' }, { name: 'verify:second' }],
    new Map([['verify:first', 4], ['verify:second', 2]]),
    outOfOrderFindings,
  );

  const markerRoot = mkdtempSync(path.join(tmpdir(), 'aios-guard-utils-root-'));
  const nestedCwd = path.join(markerRoot, 'nested', 'child');
  mkdirSync(path.join(markerRoot, '.git'), { recursive: true });
  mkdirSync(nestedCwd, { recursive: true });
  writeFileSync(path.join(markerRoot, 'package.json'), '{}\n', 'utf8');
  let discoveredMarkerRoot;
  try {
    discoveredMarkerRoot = getRepoRoot(nestedCwd);
  } finally {
    rmSync(markerRoot, { force: true, recursive: true });
  }

  const adjacentLabel = captureVerifyCiGate(
    { name: 'verify:example', label: '[verify:ci] example gate' },
    [
      'echo "[verify:ci] example gate"',
      'npm run verify:example',
    ],
  );

  const missingAdjacentLabel = captureVerifyCiGate(
    { name: 'verify:example', label: '[verify:ci] example gate' },
    [
      'echo "[verify:ci] wrong gate"',
      'npm run verify:example',
    ],
  );

  const missingRun = captureVerifyCiGate(
    { name: 'verify:example', label: '[verify:ci] example gate' },
    [
      'echo "[verify:ci] example gate"',
      'npm run verify:example:suffix',
    ],
  );

  const qualityRunnerWrapper = captureVerifyCiGate(
    { name: 'verify:example', label: '[verify:ci] example gate' },
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'node "${PROJECT_ROOT}/scripts/quality-runner.mjs" run ci "$@"',
    ],
  );

  return {
    duplicate,
    exactOnce,
    repoRoot: {
      discoveredMarkerRoot,
      markerRoot,
    },
    verifyCiGate: {
      adjacentLabel,
      missingAdjacentLabel,
      missingRun,
      qualityRunnerWrapper,
    },
    missing,
    gateRunOrder: {
      missingLineFindings,
      orderedFindings,
      outOfOrderFindings,
    },
  };
}

export function runGuardUtilsBehaviorFixtures(assertions) {
  const {
    assertDeepEqual,
    assertEqual,
    assertIncludes,
  } = assertions;

  const actual = buildGuardUtilsRuntimeFixture();
  assertIncludes(JSON.stringify(actual), '"exactOnce"', 'runtime fixture should produce JSON-serializable results');
  assertEqual(
    actual.exactOnce.lineNumber,
    2,
    'requireExactLineNumber should return the trimmed exact-line match',
  );
  assertEqual(
    actual.repoRoot.discoveredMarkerRoot,
    actual.repoRoot.markerRoot,
    'getRepoRoot should use package.json/.git markers before spawning git',
  );
  assertDeepEqual(actual.exactOnce.findings, [], 'exactly one match should not push findings');
  assertEqual(actual.missing.lineNumber, null, 'missing exact line should return null');
  assertDeepEqual(
    actual.missing.findings,
    ['expected exactly one "npm run verify:example" line; found 0'],
    'missing exact line should report a zero-count finding',
  );
  assertEqual(actual.duplicate.lineNumber, null, 'duplicate exact lines should return null');
  assertDeepEqual(
    actual.duplicate.findings,
    ['expected exactly one "npm run verify:example" line; found 2'],
    'duplicate exact lines should report a duplicate-count finding',
  );
  assertDeepEqual(actual.gateRunOrder.orderedFindings, [], 'ordered gate run lines should not push findings');
  assertDeepEqual(
    actual.gateRunOrder.missingLineFindings,
    [],
    'missing gate run lines should be skipped so exact-line findings stay canonical',
  );
  assertDeepEqual(
    actual.gateRunOrder.outOfOrderFindings,
    ['verify:second is out of order in scripts/verify-ci.sh'],
    'out-of-order gate run lines should report the drifted gate',
  );
  assertEqual(
    actual.verifyCiGate.adjacentLabel.runLineNumber,
    2,
    'verify:ci helper should return the npm run line when label is adjacent',
  );
  assertDeepEqual(
    actual.verifyCiGate.adjacentLabel.findings,
    [],
    'verify:ci helper should not report when label is adjacent',
  );
  assertDeepEqual(
    actual.verifyCiGate.missingAdjacentLabel.findings,
    ['verify:example must have adjacent verify:ci label "[verify:ci] example gate"'],
    'verify:ci helper should report label drift next to the run line',
  );
  assertEqual(
    actual.verifyCiGate.missingRun.runLineNumber,
    null,
    'verify:ci helper should return null when the npm run line is missing',
  );
  assertDeepEqual(
    actual.verifyCiGate.missingRun.findings,
    ['verify:example must appear in scripts/verify-ci.sh exactly once; found 0'],
    'verify:ci helper should keep exact-line failure wording canonical',
  );
  assertEqual(
    actual.verifyCiGate.qualityRunnerWrapper.runLineNumber,
    1000,
    'verify:ci helper should treat the quality-runner wrapper as registry-backed wiring',
  );
  assertDeepEqual(
    actual.verifyCiGate.qualityRunnerWrapper.findings,
    [],
    'verify:ci helper should not require per-gate shell labels for the quality-runner wrapper',
  );
}
