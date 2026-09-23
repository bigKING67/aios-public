import path from 'node:path';

import {
  buildQualityGateRegistry,
} from '../../lib/quality/quality-gate-registry.mjs';
import {
  enrichQualityStats,
  qualityStatsTargetFileSignalCacheSizeForTests,
  resetQualityStatsTargetFileSignalCacheForTests,
} from '../../lib/quality/quality-stats-insights.mjs';
import {
  writeText,
} from './cache-stats-fixtures.mjs';

export function assertCacheStatsTargetFileSignalMemoization({
  assertEqual,
  assertTrue,
  repoRoot,
}) {
  resetQualityStatsTargetFileSignalCacheForTests();
  writeText(path.join(repoRoot, 'scripts/reused-signal-target.mjs'), [
    'import { spawnSync } from "node:child_process";',
    'spawnSync("node", ["--version"]);',
    'createFixtureWorkspace({ git: false });',
    'withFixtureWorkspace({ git: false }, () => {});',
    'runFixtureCommand(fixture, "pwd");',
    'runFixtureGit(fixture, ["status", "--short"]);',
    '',
  ].join('\n'));
  const signalRegistry = buildQualityGateRegistry({
    packageJson: {
      scripts: {
        'verify:app:page-size': 'node scripts/reused-signal-target.mjs one',
        'verify:components:size': 'node scripts/reused-signal-target.mjs two',
      },
    },
    repoRoot,
  });
  const enrichedSignals = enrichQualityStats({
    slowest: [
      {
        cacheHitRate: 0,
        cachedCount: 0,
        coldAvgMs: 100,
        coldCount: 1,
        coldMaxMs: 100,
        count: 1,
        maxMs: 100,
        name: 'verify:app:page-size',
      },
      {
        cacheHitRate: 0,
        cachedCount: 0,
        coldAvgMs: 100,
        coldCount: 1,
        coldMaxMs: 100,
        count: 1,
        maxMs: 100,
        name: 'verify:components:size',
      },
    ],
  }, signalRegistry, { repoRoot });
  assertEqual(
    qualityStatsTargetFileSignalCacheSizeForTests(),
    1,
    'stats target-file analysis should memoize repeated command targets in one process',
  );
  assertEqual(
    enrichedSignals.slowest[0].signals.spawnSyncCount,
    enrichedSignals.slowest[1].signals.spawnSyncCount,
    'memoized stats target-file analysis should preserve equivalent signal counts',
  );
  assertEqual(
    enrichedSignals.slowest[0].signals.createFixtureWorkspaceCount,
    1,
    'stats target-file analysis should count shared fixture workspace factories',
  );
  assertEqual(
    enrichedSignals.slowest[0].signals.withFixtureWorkspaceCount,
    1,
    'stats target-file analysis should count shared fixture workspace wrappers',
  );
  assertEqual(
    enrichedSignals.slowest[0].signals.fixtureFactoryCount,
    2,
    'stats target-file analysis should roll shared fixture helpers into fixture factory signals',
  );
  assertEqual(
    enrichedSignals.slowest[0].signals.runFixtureCommandCount,
    1,
    'stats target-file analysis should count shared checked command helper calls',
  );
  assertEqual(
    enrichedSignals.slowest[0].signals.runFixtureGitCount,
    1,
    'stats target-file analysis should count shared checked git helper calls',
  );

  writeText(path.join(repoRoot, 'scripts/input-signal-entry.mjs'), [
    'console.log("entry");',
    '',
  ].join('\n'));
  writeText(path.join(repoRoot, 'scripts/input-signal-helper.mjs'), [
    'withFixtureWorkspace({ git: false }, () => {});',
    'spawnSync("node", ["--version"]);',
    '',
  ].join('\n'));
  const explicitInputRegistry = {
    byName: new Map([
      ['verify:input-signal', {
        cacheable: true,
        command: 'node scripts/input-signal-entry.mjs',
        cost: 'low',
        group: 'test',
        inputs: [
          'scripts/input-signal-helper.mjs',
          'scripts/**',
        ],
        name: 'verify:input-signal',
        outputs: [],
        parallel: true,
      }],
    ]),
  };
  const enrichedInputSignals = enrichQualityStats({
    slowest: [
      {
        cacheHitRate: 0,
        cachedCount: 0,
        coldAvgMs: 100,
        coldCount: 1,
        coldMaxMs: 100,
        count: 1,
        maxMs: 100,
        name: 'verify:input-signal',
      },
    ],
  }, explicitInputRegistry, { repoRoot });
  assertEqual(
    enrichedInputSignals.slowest[0].signals.withFixtureWorkspaceCount,
    1,
    'stats signal analysis should include explicit helper inputs, not only the command entrypoint',
  );
  assertEqual(
    enrichedInputSignals.slowest[0].signals.spawnSyncCount,
    1,
    'stats signal analysis should count subprocess calls from explicit helper inputs',
  );
  assertTrue(
    enrichedInputSignals.slowest[0].signals.signalFiles.includes('scripts/input-signal-helper.mjs'),
    'stats signal analysis should expose explicit helper files used for signal extraction',
  );
  assertTrue(
    !enrichedInputSignals.slowest[0].signals.signalFiles.includes('scripts/**'),
    'stats signal analysis should not expand broad glob inputs during signal extraction',
  );

  resetQualityStatsTargetFileSignalCacheForTests();
  writeText(path.join(repoRoot, 'scripts/function-declaration-signal-target.mjs'), [
    'export function createTempRepo() {}',
    'export function runFixtureCommand() {}',
    'export function runFixtureGit() {}',
    'export function* withFixtureWorkspace() {}',
    'export function withTempRepo() {}',
    'export function createFixtureWorkspace() {}',
    'runFixtureCommand(fixture, "pwd");',
    'runFixtureGit(fixture, ["status"]);',
    'createFixtureWorkspace({ git: false });',
    '',
  ].join('\n'));
  const declarationRegistry = {
    byName: new Map([
      ['verify:declaration-signal', {
        cacheable: true,
        command: 'node scripts/function-declaration-signal-target.mjs',
        cost: 'low',
        group: 'test',
        inputs: [],
        name: 'verify:declaration-signal',
        outputs: [],
        parallel: true,
      }],
    ]),
  };
  const enrichedDeclarationSignals = enrichQualityStats({
    slowest: [
      {
        cacheHitRate: 0,
        cachedCount: 0,
        coldAvgMs: 100,
        coldCount: 1,
        coldMaxMs: 100,
        count: 1,
        maxMs: 100,
        name: 'verify:declaration-signal',
      },
    ],
  }, declarationRegistry, { repoRoot });
  const declarationSignals = enrichedDeclarationSignals.slowest[0].signals;
  assertEqual(
    declarationSignals.runFixtureCommandCount,
    1,
    'stats target-file analysis should not count runFixtureCommand declarations as calls',
  );
  assertEqual(
    declarationSignals.runFixtureGitCount,
    1,
    'stats target-file analysis should not count runFixtureGit declarations as calls',
  );
  assertEqual(
    declarationSignals.createFixtureWorkspaceCount,
    1,
    'stats target-file analysis should not count createFixtureWorkspace declarations as calls',
  );
  assertEqual(
    declarationSignals.createTempRepoCount,
    0,
    'stats target-file analysis should not count createTempRepo declarations as calls',
  );
  assertEqual(
    declarationSignals.withFixtureWorkspaceCount,
    0,
    'stats target-file analysis should not count generator fixture wrapper declarations as calls',
  );
  assertEqual(
    declarationSignals.withTempRepoCount,
    0,
    'stats target-file analysis should not count fixture wrapper declarations as calls',
  );
  assertEqual(
    declarationSignals.fixtureFactoryCount,
    1,
    'stats target-file analysis should not roll fixture factory declarations into factory signals',
  );
}
