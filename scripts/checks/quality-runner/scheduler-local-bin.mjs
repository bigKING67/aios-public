#!/usr/bin/env node

import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runQualityGates } from '../../lib/quality/quality-scheduler.mjs';
import {
  createSchedulerTempWorkspace,
  linkExecutable,
  removeSchedulerTempWorkspace,
} from './scheduler-fixtures.mjs';

const {
  assertEqual,
  assertIncludes,
  reportOk,
} = createCheckGuard('quality-runner-scheduler-local-bin-behavior');

export async function runQualityRunnerSchedulerLocalBinBehaviorCheck() {
  const repoRoot = createSchedulerTempWorkspace();
  try {
    const binPath = path.join(repoRoot, 'node_modules/.bin/fixture-bin');
    linkExecutable(binPath, '/bin/echo');
    const result = await runQualityGates([
      {
        name: 'local-bin',
        command: 'fixture-bin fixture local bin ok',
        cacheable: false,
        cost: 'cheap',
        deps: [],
        inputs: [],
        parallel: true,
      },
      {
        name: 'shell-fallback',
        command: "node -e \"process.stdout.write('fixture shell fallback ok')\"",
        cacheable: false,
        cost: 'cheap',
        deps: [],
        inputs: [],
        parallel: true,
      },
    ], {
      cache: false,
      parallel: 2,
      repoRoot,
    });
    const resultsByName = new Map(result.results.map((gateResult) => [gateResult.gate.name, gateResult]));
    assertEqual(result.status, 'pass', 'scheduler should resolve local bins and keep shell fallback in one fixture run');
    assertIncludes(
      resultsByName.get('local-bin')?.stdout ?? '',
      'fixture local bin ok',
      'repo-local bin stdout should be captured',
    );
    assertIncludes(
      resultsByName.get('shell-fallback')?.stdout ?? '',
      'fixture shell fallback ok',
      'shell fallback stdout should be captured',
    );
  } finally {
    removeSchedulerTempWorkspace(repoRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerSchedulerLocalBinBehaviorCheck();
  reportOk('repo-local bin resolution passed.');
}
