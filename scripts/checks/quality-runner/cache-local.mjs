#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  createFixtureWorkspace,
} from '../../lib/shared/gate-fixture-utils.mjs';
import { runQualityGates } from '../../lib/quality/quality-scheduler.mjs';

const {
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-cache-local-behavior');

function createFixtureCommandRunner(executions) {
  return async (command, options = {}) => {
    executions.push({
      command,
      cwd: options.cwd,
      gate: options.gate?.name,
    });
    return {
      durationMs: 1,
      exitCode: 0,
      stderr: '',
      stdout: `cache probe ran ${executions.length}\n`,
    };
  };
}

function localCacheOnlyEnv() {
  return {
    ...process.env,
    AIOS_QUALITY_REMOTE_CACHE_MODE: '',
    AIOS_QUALITY_REMOTE_CACHE_URL: '',
  };
}

export async function runQualityRunnerCacheLocalBehaviorCheck() {
  const fixture = createFixtureWorkspace({
    files: {
      'scripts/cache-probe.mjs': 'console.log("cache probe ran");\n',
    },
    git: false,
    packageJson: null,
    prefix: 'aios-quality-runner-cache-local-',
  });
  try {
    const { repoRoot } = fixture;
    const executions = [];
    const commandRunner = createFixtureCommandRunner(executions);
    const env = localCacheOnlyEnv();
    const cacheableGate = {
      name: 'cache-probe',
      command: 'node scripts/cache-probe.mjs',
      cacheable: true,
      cost: 'cheap',
      deps: [],
      group: 'fixture',
      inputs: ['scripts/cache-probe.mjs'],
      parallel: true,
    };
    const first = await runQualityGates([cacheableGate], {
      cache: true,
      commandRunner,
      env,
      parallel: 1,
      repoRoot,
    });
    assertEqual(first.status, 'pass', 'first cache fixture scheduler run should pass');
    assertFalse(first.results[0]?.cacheHit ?? false, 'first cache fixture scheduler run should be cold');
    assertIncludes(first.results[0]?.stdout ?? '', 'cache probe ran 1', 'first cache fixture should execute probe');
    assertEqual(executions.length, 1, 'first cache fixture should execute the command runner once');

    const second = await runQualityGates([cacheableGate], {
      cache: true,
      commandRunner,
      env,
      parallel: 1,
      repoRoot,
    });
    assertEqual(second.status, 'pass', 'second cache fixture scheduler run should pass');
    assertTrue(second.results[0]?.cacheHit ?? false, 'second scheduler run should hit cache for unchanged cacheable fixture gate');
    assertEqual(second.results[0]?.stdout ?? '', '', 'cache hit should skip fixture command execution');
    assertEqual(executions.length, 1, 'cache hit should not execute the fixture command runner again');

    fixture.write({
      'scripts/cache-probe.mjs': 'console.log("cache probe changed");\n',
    });
    const third = await runQualityGates([cacheableGate], {
      cache: true,
      commandRunner,
      env,
      parallel: 1,
      repoRoot,
    });
    assertEqual(third.status, 'pass', 'changed cache fixture scheduler run should pass');
    assertFalse(third.results[0]?.cacheHit ?? false, 'changed input should invalidate pass-only gate result cache');
    assertIncludes(third.results[0]?.stdout ?? '', 'cache probe ran 2', 'changed input should execute probe after invalidation');
    assertEqual(executions.length, 2, 'changed input should execute the fixture command runner exactly once more');
  } finally {
    fixture.cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerCacheLocalBehaviorCheck();
  reportOk('pass-only result cache and input invalidation passed.');
}
