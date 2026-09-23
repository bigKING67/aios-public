#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runQualityGates } from '../../lib/quality/quality-scheduler.mjs';
import {
  createSchedulerTempWorkspace,
  removeSchedulerTempWorkspace,
} from './scheduler-fixtures.mjs';

const {
  assertEqual,
  assertFalse,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-scheduler-cache-bypass-behavior');

export async function runQualityRunnerSchedulerCacheBypassBehaviorCheck() {
  const repoRoot = createSchedulerTempWorkspace();
  try {
    const cachedExclusiveGate = {
      name: 'zzz-cached-exclusive',
      command: 'fixture zzz-cached-exclusive',
      cacheable: true,
      cost: 'expensive',
      deps: [],
      group: 'fixture',
      inputs: [],
      parallel: false,
    };
    const warmRunner = async (command, runnerOptions = {}) => {
      const name = runnerOptions.gate?.name ?? command;
      return {
        durationMs: 1,
        exitCode: 0,
        stdout: `${name} ok\n`,
        stderr: '',
      };
    };
    const warmCache = await runQualityGates([cachedExclusiveGate], {
      cache: true,
      commandRunner: warmRunner,
      parallel: 1,
      repoRoot,
    });
    assertEqual(warmCache.status, 'pass', 'scheduler should warm cache for exclusive fixture gate');

    const cacheBypassEvents = [];
    let cacheBypassTick = 0;
    const cacheBypassDelays = new Map([
      ['aaa-running', 40],
      ['dependent-on-cached-exclusive', 1],
      ['zzz-cached-exclusive', 1],
    ]);
    const cacheBypassRunner = async (command, runnerOptions = {}) => {
      const name = runnerOptions.gate?.name ?? command;
      cacheBypassEvents.push({ name, phase: 'start', tick: cacheBypassTick++ });
      await new Promise((resolve) => setTimeout(resolve, cacheBypassDelays.get(name) ?? 1));
      cacheBypassEvents.push({ name, phase: 'end', tick: cacheBypassTick++ });
      return {
        durationMs: cacheBypassDelays.get(name) ?? 1,
        exitCode: 0,
        stdout: `${name} ok\n`,
        stderr: '',
      };
    };
    const cacheBypassResult = await runQualityGates([
      {
        name: 'aaa-running',
        command: 'fixture aaa-running',
        cacheable: false,
        cost: 'cheap',
        deps: [],
        inputs: [],
        parallel: true,
      },
      cachedExclusiveGate,
      {
        name: 'dependent-on-cached-exclusive',
        command: 'fixture dependent-on-cached-exclusive',
        cacheable: false,
        cost: 'cheap',
        deps: ['zzz-cached-exclusive'],
        inputs: [],
        parallel: true,
      },
    ], {
      cache: true,
      commandRunner: cacheBypassRunner,
      parallel: 2,
      repoRoot,
    });
    assertEqual(cacheBypassResult.status, 'pass', 'scheduler should pass cache-bypass fixture');
    assertTrue(
      cacheBypassResult.results.some((result) => result.gate.name === 'zzz-cached-exclusive' && result.cacheHit),
      'cached exclusive gate should be reported as a cache hit',
    );
    assertFalse(
      cacheBypassEvents.some((event) => event.name === 'zzz-cached-exclusive'),
      'cached exclusive gate should not execute command runner',
    );
    const cacheBypassStart = (name) => cacheBypassEvents.find((event) => event.name === name && event.phase === 'start')?.tick;
    const cacheBypassEnd = (name) => cacheBypassEvents.find((event) => event.name === name && event.phase === 'end')?.tick;
    assertTrue(
      cacheBypassStart('dependent-on-cached-exclusive') < cacheBypassEnd('aaa-running'),
      'cached exclusive gate should not occupy a scheduler slot or wait for unrelated running gates',
    );
  } finally {
    removeSchedulerTempWorkspace(repoRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerSchedulerCacheBypassBehaviorCheck();
  reportOk('cached-slot bypass passed.');
}
