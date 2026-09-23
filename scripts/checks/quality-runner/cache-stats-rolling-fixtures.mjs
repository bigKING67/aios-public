import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  readRecentQualityEventLines,
  summarizeQualityEvents,
} from '../../lib/quality/quality-events.mjs';
import {
  resolveStatsSince,
} from '../../quality-runner.mjs';
import {
  printStatsWithCwd,
  writeText,
} from './cache-stats-fixtures.mjs';

export function assertCacheStatsRollingWindow({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  repoRoot,
}) {
  writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), [
    JSON.stringify({
      mode: 'affected',
      status: 'pass',
      durationMs: 5000,
      gates: [
        {
          cacheHit: false,
          durationMs: 5000,
          name: 'old-gate',
          status: 'pass',
        },
      ],
      summary: {
        passed: 1,
        failed: 0,
        cached: 0,
        total: 1,
      },
      timestamp: '2026-05-09T00:00:00.000Z',
    }),
    JSON.stringify({
      mode: 'prepush',
      status: 'pass',
      durationMs: 17,
      gates: [
        {
          cacheHit: false,
          durationMs: 17,
          name: 'fresh-gate',
          status: 'pass',
        },
      ],
      summary: {
        passed: 1,
        failed: 0,
        cached: 0,
        total: 1,
      },
      timestamp: '2026-05-10T00:00:00.000Z',
    }),
    '',
  ].join('\n'));
  const rollingLimitStats = printStatsWithCwd(repoRoot, {
    json: true,
    limit: 1,
    slowLimit: 10,
  });
  assertIncludes(rollingLimitStats, '"totalRuns": 1', 'stats limit should only parse the recent rolling window');
  assertIncludes(rollingLimitStats, '"fresh-gate"', 'stats limit should include recent events');
  assertNotIncludes(rollingLimitStats, '"old-gate"', 'stats limit should exclude events outside the recent rolling window');

  const sinceStats = printStatsWithCwd(repoRoot, {
    json: true,
    limit: 200,
    since: '2026-05-10T00:00:00.000Z',
    slowLimit: 10,
  });
  assertIncludes(sinceStats, '"since": "2026-05-10T00:00:00.000Z"', 'stats JSON should expose the active fresh-window timestamp');
  assertIncludes(sinceStats, '"totalRuns": 1', 'stats --since should only include fresh-window events');
  assertIncludes(sinceStats, '"fresh-gate"', 'stats --since should include fresh events');
  assertNotIncludes(sinceStats, '"old-gate"', 'stats --since should exclude older events');

  const eventsPath = path.join(repoRoot, '.cache/aios-quality/events.jsonl');
  writeText(eventsPath, [
    '{not-json-but-outside-limit}',
    JSON.stringify({
      mode: 'affected',
      status: 'pass',
      durationMs: 1,
      gates: [{ cacheHit: false, durationMs: 1, name: 'tail-one', status: 'pass' }],
      summary: { passed: 1, failed: 0, cached: 0, total: 1 },
      timestamp: '2026-05-10T00:00:01.000Z',
    }),
    JSON.stringify({
      mode: 'affected',
      status: 'pass',
      durationMs: 2,
      gates: [{ cacheHit: false, durationMs: 2, name: 'tail-two', status: 'pass' }],
      summary: { passed: 1, failed: 0, cached: 0, total: 1 },
      timestamp: '2026-05-10T00:00:02.000Z',
    }),
    '',
  ].join('\n'));
  assertEqual(
    readRecentQualityEventLines(eventsPath, 1).join('\n'),
    JSON.stringify({
      mode: 'affected',
      status: 'pass',
      durationMs: 2,
      gates: [{ cacheHit: false, durationMs: 2, name: 'tail-two', status: 'pass' }],
      summary: { passed: 1, failed: 0, cached: 0, total: 1 },
      timestamp: '2026-05-10T00:00:02.000Z',
    }),
    'rolling stats should read only the requested recent event lines from the file tail',
  );
  const tailStats = summarizeQualityEvents(repoRoot, { limit: 1, slowLimit: 10 });
  assertEqual(tailStats.totalRuns, 1, 'rolling stats should parse only the recent tail window');
  assertIncludes(JSON.stringify(tailStats), 'tail-two', 'rolling stats should include the latest tail event');
  assertNotIncludes(JSON.stringify(tailStats), 'tail-one', 'rolling stats should exclude older tail events when limit=1');
}

export function assertCacheStatsSinceCommit({
  assertEqual,
  repoRoot,
}) {
  spawnSync('git', ['-c', 'core.fsync=none', 'init', '--quiet', '--template='], { cwd: repoRoot });
  spawnSync('git', [
    '-c',
    'core.fsync=none',
    '-c',
    'user.name=AIOS Fixture',
    '-c',
    'user.email=aios-fixture@example.invalid',
    'commit',
    '--allow-empty',
    '--quiet',
    '--no-gpg-sign',
    '--no-verify',
    '--date=2026-05-10T00:00:00.000Z',
    '-m',
    'stats fixture',
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-05-10T00:00:00.000Z',
      GIT_COMMITTER_DATE: '2026-05-10T00:00:00.000Z',
    },
  });
  assertEqual(
    resolveStatsSince(repoRoot, { sinceCommit: 'HEAD' }),
    '2026-05-10T00:00:00.000Z',
    'stats --since-commit should resolve the commit timestamp as an ISO fresh-window boundary',
  );
}
