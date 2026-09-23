import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  commitFixtureFiles,
  createFixtureWorkspace,
  fixtureGitStdout,
  gateByName,
  gateNames,
  insertBeforeGate,
  moveGateAfter,
  runFixtureCommand,
  swapGatesByName,
  withFixtureWorkspace,
  writeFixtureFiles,
} from './gate-fixture-utils.mjs';

const REPOSITORY_GIT_ENV_KEYS = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_WORK_TREE',
]);

const firstGate = Object.freeze({ name: 'verify:first', command: 'first' });
const secondGate = Object.freeze({ name: 'verify:second', command: 'second' });
const thirdGate = Object.freeze({ name: 'verify:third', command: 'third' });
const insertedGate = Object.freeze({ name: 'verify:inserted', command: 'inserted' });
const gates = Object.freeze([firstGate, secondGate, thirdGate]);

function captureError(callback) {
  try {
    callback();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function runGateFixtureUtilsBehaviorFixtures({
  assertDeepEqual,
  assertEqual,
  assertFalse,
  assertIncludes,
  assertSame,
  assertTrue,
}) {
  assertSame(gateByName(gates, 'verify:second'), secondGate, 'gateByName should return the original gate object');
  assertEqual(
    captureError(() => gateByName(gates, 'verify:missing')),
    'Missing fixture gate: verify:missing',
    'gateByName should fail explicitly for unknown gates',
  );

  assertDeepEqual(
    gateNames(gates),
    ['verify:first', 'verify:second', 'verify:third'],
    'gateNames should preserve gate order',
  );

  const insertedBeforeSecond = insertBeforeGate(gates, 'verify:second', insertedGate);
  assertDeepEqual(
    gateNames(insertedBeforeSecond),
    ['verify:first', 'verify:inserted', 'verify:second', 'verify:third'],
    'insertBeforeGate should insert before the anchor gate',
  );
  assertSame(insertedBeforeSecond[0], firstGate, 'insertBeforeGate should keep existing gate object identity');
  assertSame(insertedBeforeSecond[1], insertedGate, 'insertBeforeGate should insert the provided gate object');
  assertFalse(insertedBeforeSecond === gates, 'insertBeforeGate should return a new array');
  assertDeepEqual(
    gateNames(gates),
    ['verify:first', 'verify:second', 'verify:third'],
    'insertBeforeGate should not mutate the original array',
  );
  assertEqual(
    captureError(() => insertBeforeGate(gates, 'verify:missing', insertedGate)),
    'Missing fixture gate: verify:missing',
    'insertBeforeGate should fail explicitly when the anchor is missing',
  );

  const movedFirstAfterThird = moveGateAfter(gates, 'verify:first', 'verify:third');
  assertDeepEqual(
    gateNames(movedFirstAfterThird),
    ['verify:second', 'verify:third', 'verify:first'],
    'moveGateAfter should move the selected gate after the anchor',
  );
  assertSame(movedFirstAfterThird[2], firstGate, 'moveGateAfter should move the original gate object');
  assertDeepEqual(
    gateNames(gates),
    ['verify:first', 'verify:second', 'verify:third'],
    'moveGateAfter should not mutate the original array',
  );
  assertEqual(
    captureError(() => moveGateAfter(gates, 'verify:missing', 'verify:third')),
    'Missing fixture gate: verify:missing',
    'moveGateAfter should fail explicitly when the moving gate is missing',
  );
  assertEqual(
    captureError(() => moveGateAfter(gates, 'verify:first', 'verify:missing')),
    'Missing fixture gate: verify:missing',
    'moveGateAfter should fail explicitly when the anchor gate is missing after removing the moving gate',
  );
  assertEqual(
    captureError(() => moveGateAfter(gates, 'verify:first', 'verify:first')),
    'Missing fixture gate: verify:first',
    'moveGateAfter should reject using the moving gate as its own anchor',
  );

  const swappedFirstAndThird = swapGatesByName(gates, 'verify:first', 'verify:third');
  assertDeepEqual(
    gateNames(swappedFirstAndThird),
    ['verify:third', 'verify:second', 'verify:first'],
    'swapGatesByName should swap only the named gates',
  );
  assertSame(swappedFirstAndThird[0], thirdGate, 'swapGatesByName should preserve swapped gate identity');
  assertSame(swappedFirstAndThird[2], firstGate, 'swapGatesByName should preserve swapped gate identity');
  assertDeepEqual(
    gateNames(gates),
    ['verify:first', 'verify:second', 'verify:third'],
    'swapGatesByName should not mutate the original array',
  );
  assertEqual(
    captureError(() => swapGatesByName(gates, 'verify:first', 'verify:missing')),
    'Missing fixture gate: verify:missing',
    'swapGatesByName should fail explicitly when either gate is missing',
  );

  const originalGitEnv = Object.fromEntries(REPOSITORY_GIT_ENV_KEYS.map((key) => [key, process.env[key]]));
  let pollutedFixture;
  try {
    process.env.GIT_DIR = path.join(process.cwd(), '.git');
    process.env.GIT_WORK_TREE = process.cwd();
    pollutedFixture = createFixtureWorkspace({
      prefix: 'aios-gate-fixture-polluted-git-env-',
    });
    assertTrue(
      existsSync(path.join(pollutedFixture.repoRoot, '.git')),
      'createFixtureWorkspace should isolate fixture git commands from inherited hook Git env',
    );
  } finally {
    pollutedFixture?.cleanup();
    for (const key of REPOSITORY_GIT_ENV_KEYS) {
      if (originalGitEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalGitEnv[key];
      }
    }
  }

  const fixture = createFixtureWorkspace({
    files: {
      'apps/web-vite/src/check.txt': 'fixture source\n',
    },
    packageJson: { name: 'gate-fixture-utils-behavior-fixture', private: true },
    prefix: 'aios-gate-fixture-utils-',
  });
  try {
    assertTrue(existsSync(path.join(fixture.repoRoot, '.git')), 'createFixtureWorkspace should initialize git by default');
    assertEqual(
      readFileSync(path.join(fixture.repoRoot, 'package.json'), 'utf8'),
      '{"name":"gate-fixture-utils-behavior-fixture","private":true}\n',
      'createFixtureWorkspace should write a compact fixture package.json',
    );
    assertEqual(
      readFileSync(path.join(fixture.repoRoot, 'apps/web-vite/src/check.txt'), 'utf8'),
      'fixture source\n',
      'createFixtureWorkspace should write initial files',
    );

    fixture.write({ 'nested/output.txt': 'written later\n' });
    assertEqual(
      readFileSync(path.join(fixture.repoRoot, 'nested/output.txt'), 'utf8'),
      'written later\n',
      'fixture.write should support later file writes',
    );

    const uncheckedFixtureRun = fixture.run('sh', ['-c', 'pwd; exit 7'], { check: false });
    assertEqual(uncheckedFixtureRun.status, 7, 'fixture.run should return unchecked failures when check=false');
    assertIncludes(uncheckedFixtureRun.stdout, fixture.repoRoot, 'fixture.run should execute commands in the fixture workspace');

    commitFixtureFiles(fixture, ['package.json', 'apps/web-vite/src/check.txt', 'nested/output.txt'], 'fixture commit');
    const commitMetadata = fixtureGitStdout(fixture, ['log', '-1', '--pretty=%s%n%ae']);
    assertIncludes(
      commitMetadata,
      'fixture commit',
      'commitFixtureFiles should create a checked git commit with fixture identity',
    );
    assertIncludes(
      commitMetadata,
      'aios-fixture@example.invalid',
      'commitFixtureFiles should use the fixed fixture author email',
    );
    assertIncludes(
      captureError(() => runFixtureCommand(fixture, 'sh', ['-c', 'exit 7'])),
      'failed',
      'runFixtureCommand should throw on checked command failures',
    );
  } finally {
    fixture.cleanup();
  }
  assertFalse(existsSync(fixture.repoRoot), 'fixture.cleanup should remove the temp workspace');

  writeFixtureFiles(process.cwd(), {});

  let callbackRepoRoot = '';
  withFixtureWorkspace({ git: false, packageJson: null }, (workspace) => {
    callbackRepoRoot = workspace.repoRoot;
    assertFalse(existsSync(path.join(workspace.repoRoot, '.git')), 'withFixtureWorkspace should pass git=false through');
    assertFalse(existsSync(path.join(workspace.repoRoot, 'package.json')), 'withFixtureWorkspace should support packageJson=null');
  });
  assertFalse(existsSync(callbackRepoRoot), 'withFixtureWorkspace should cleanup after callback');

  return 'lookup, fixture workspace, checked commands, git helpers, identity, and missing-gate cases passed.';
}
