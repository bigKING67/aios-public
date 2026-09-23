import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const FIXTURE_GIT_CONFIG = Object.freeze([
  '-c',
  'core.fsync=none',
]);

export const FIXTURE_GIT_IDENTITY = Object.freeze([
  '-c',
  'user.name=AIOS Fixture',
  '-c',
  'user.email=aios-fixture@example.invalid',
]);

const GIT_REPOSITORY_ENV_KEYS = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_WORK_TREE',
]);

function fixtureCommandEnv(sourceEnv = process.env) {
  const env = { ...sourceEnv };
  // Git hooks export repository-bound GIT_* values; fixture repos must be isolated.
  for (const key of GIT_REPOSITORY_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

export function gateByName(gates, name) {
  const gate = gates.find((candidate) => candidate.name === name);
  if (!gate) {
    throw new Error(`Missing fixture gate: ${name}`);
  }
  return gate;
}

export function gateNames(gates) {
  return gates.map((gate) => gate.name);
}

export function insertBeforeGate(gates, anchorName, insertedGate) {
  const anchorGate = gateByName(gates, anchorName);
  return gates.flatMap((gate) => (
    gate.name === anchorGate.name ? [insertedGate, gate] : [gate]
  ));
}

export function moveGateAfter(gates, movingName, anchorName) {
  const movingGate = gateByName(gates, movingName);
  const remainingGates = gates.filter((gate) => gate.name !== movingGate.name);
  const anchorGate = gateByName(remainingGates, anchorName);

  return remainingGates.flatMap((gate) => (
    gate.name === anchorGate.name ? [gate, movingGate] : [gate]
  ));
}

export function swapGatesByName(gates, firstName, secondName) {
  const firstGate = gateByName(gates, firstName);
  const secondGate = gateByName(gates, secondName);

  return gates.map((gate) => {
    if (gate.name === firstGate.name) {
      return secondGate;
    }
    if (gate.name === secondGate.name) {
      return firstGate;
    }
    return gate;
  });
}

export function writeFixtureFiles(repoRoot, files) {
  for (const [filePath, source] of Object.entries(files ?? {})) {
    const fullPath = path.join(repoRoot, filePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, source, 'utf8');
  }
}

export function createFixtureWorkspace(options = {}) {
  const {
    files = {},
    git = true,
    packageJson = { name: 'aios-fixture', private: true },
    prefix = 'aios-fixture-',
  } = options;
  const repoRoot = mkdtempSync(path.join(tmpdir(), prefix));

  const fixture = {
    cleanup() {
      rmSync(repoRoot, { force: true, recursive: true });
    },
    repoRoot,
    run(command, args = [], runOptions = {}) {
      return runFixtureCommand(this, command, args, runOptions);
    },
    write(filesToWrite) {
      writeFixtureFiles(repoRoot, filesToWrite);
    },
  };

  if (git) {
    runFixtureGit(fixture, ['init', '--quiet', '--template=']);
    // Disposable repositories must not leave detached maintenance writing during cleanup.
    runFixtureGit(fixture, ['config', 'gc.auto', '0']);
    runFixtureGit(fixture, ['config', 'maintenance.auto', 'false']);
  }
  if (packageJson !== null) {
    writeFixtureFiles(repoRoot, {
      'package.json': `${JSON.stringify(packageJson)}\n`,
    });
  }
  writeFixtureFiles(repoRoot, files);

  return fixture;
}

export function withFixtureWorkspace(options, callback) {
  const fixture = createFixtureWorkspace(options);
  try {
    return callback(fixture);
  } finally {
    fixture.cleanup();
  }
}

export function runFixtureCommand(fixture, command, args = [], options = {}) {
  const { check = true, env, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: fixture.repoRoot,
    encoding: 'utf8',
    ...spawnOptions,
    env: fixtureCommandEnv(env),
  });
  if (!check || result.status === 0) {
    return result;
  }
  throw new Error(`${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

export function runFixtureGit(fixture, args = [], options = {}) {
  return runFixtureCommand(fixture, 'git', [...FIXTURE_GIT_CONFIG, ...args], options);
}

export function fixtureGitStdout(fixture, args = [], options = {}) {
  return runFixtureGit(fixture, args, options).stdout.trim();
}

function commitFixtureIndex(fixture, commitArgs = [], message = 'fixture baseline') {
  runFixtureGit(fixture, [
    ...FIXTURE_GIT_IDENTITY,
    'commit',
    ...commitArgs,
    '--quiet',
    '--no-gpg-sign',
    '--no-verify',
    '-m',
    message,
  ]);
}

export function commitFixtureFiles(fixture, files = ['.'], message = 'fixture baseline') {
  const fileArgs = Array.isArray(files) ? files : [files];
  runFixtureGit(fixture, ['add', ...fileArgs]);
  commitFixtureIndex(fixture, [], message);
}

export function commitTrackedFixtureFiles(fixture, message = 'fixture baseline') {
  commitFixtureIndex(fixture, ['--all'], message);
}
