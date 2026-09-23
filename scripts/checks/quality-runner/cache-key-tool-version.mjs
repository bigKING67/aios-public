#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { withFixtureWorkspace } from '../../lib/shared/gate-fixture-utils.mjs';
import {
  computeGateCacheKey,
  createQualityCacheContext,
  resetProcessToolVersionCacheForTests,
} from '../../lib/quality/quality-cache.mjs';

const {
  assertEqual,
  reportOk,
} = createCheckGuard('quality-runner-cache-key-tool-version-behavior');

export function runQualityRunnerCacheKeyToolVersionBehaviorCheck() {
  withFixtureWorkspace({
    git: false,
    packageJson: null,
    prefix: 'aios-quality-runner-cache-key-tool-version-',
  }, (fixture) => {
    const { repoRoot } = fixture;
    const nodeGate = {
      name: 'cache-probe',
      command: 'node scripts/cache-probe.mjs',
      cacheable: true,
      cost: 'cheap',
      deps: [],
      group: 'fixture',
      inputs: [],
      parallel: true,
    };
    let npmProbeCount = 0;
    const createFixtureCacheContext = () => createQualityCacheContext(repoRoot, {
      toolVersionProbe(command, args, probeRepoRoot) {
        assertEqual(probeRepoRoot, repoRoot, 'tool-version probe should execute against the gate repo root');
        assertEqual(command, 'npm', 'fixture should only need npm version probes');
        assertEqual(args.join(' '), '--version', 'fixture should only request npm --version');
        npmProbeCount += 1;
        return '9.9.9';
      },
    });

    resetProcessToolVersionCacheForTests();
    try {
      computeGateCacheKey(repoRoot, nodeGate, createFixtureCacheContext());
      assertEqual(npmProbeCount, 0, 'node-only gates should not start npm --version for cache identity');

      const npmGate = {
        ...nodeGate,
        command: 'npm run cache-probe',
      };
      computeGateCacheKey(repoRoot, npmGate, createFixtureCacheContext());
      computeGateCacheKey(repoRoot, {
        ...npmGate,
        name: 'cache-probe-two',
      }, createFixtureCacheContext());
      assertEqual(
        npmProbeCount,
        1,
        'process-level tool version cache should avoid repeated npm --version subprocesses across gate cache contexts',
      );
    } finally {
      resetProcessToolVersionCacheForTests();
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerCacheKeyToolVersionBehaviorCheck();
  reportOk('process tool-version memoization passed.');
}
