#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runQualityGates } from '../../lib/quality/quality-scheduler.mjs';
import {
  createSchedulerTempWorkspace,
  removeSchedulerTempWorkspace,
} from './scheduler-fixtures.mjs';

const {
  assertEqual,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-scheduler-concurrency-behavior');

export async function runQualityRunnerSchedulerConcurrencyBehaviorCheck() {
  const repoRoot = createSchedulerTempWorkspace();
  try {
    const events = [];
    let tick = 0;
    const delays = new Map([
      ['parallel-a', 40],
      ['parallel-b', 40],
      ['exclusive', 1],
    ]);
    const commandRunner = async (command, runnerOptions = {}) => {
      const name = runnerOptions.gate?.name ?? command;
      events.push({ name, phase: 'start', tick: tick++ });
      await new Promise((resolve) => setTimeout(resolve, delays.get(name) ?? 1));
      events.push({ name, phase: 'end', tick: tick++ });
      return {
        durationMs: delays.get(name) ?? 1,
        exitCode: 0,
        stdout: `${name} ok\n`,
        stderr: '',
      };
    };
    const gates = [
      {
        name: 'parallel-a',
        command: 'fixture parallel-a',
        cacheable: false,
        cost: 'cheap',
        deps: [],
        inputs: [],
        parallel: true,
      },
      {
        name: 'exclusive',
        command: 'fixture exclusive',
        cacheable: false,
        cost: 'expensive',
        deps: [],
        inputs: [],
        parallel: false,
      },
      {
        name: 'parallel-b',
        command: 'fixture parallel-b',
        cacheable: false,
        cost: 'cheap',
        deps: [],
        inputs: [],
        parallel: true,
      },
    ];
    const schedulerResult = await runQualityGates(gates, {
      cache: false,
      commandRunner,
      parallel: 3,
      repoRoot,
    });
    assertEqual(schedulerResult.status, 'pass', 'scheduler fixture should pass');
    const start = (name) => events.find((event) => event.name === name && event.phase === 'start')?.tick;
    const end = (name) => events.find((event) => event.name === name && event.phase === 'end')?.tick;
    assertTrue(
      start('exclusive') >= end('parallel-a') && start('exclusive') >= end('parallel-b'),
      'exclusive gate should wait for currently running parallel gates',
    );
  } finally {
    removeSchedulerTempWorkspace(repoRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerSchedulerConcurrencyBehaviorCheck();
  reportOk('exclusive scheduling passed.');
}
