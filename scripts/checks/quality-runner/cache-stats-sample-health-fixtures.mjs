import path from 'node:path';

import {
  printStatsWithCwd,
  writeText,
} from './cache-stats-fixtures.mjs';

export function assertCacheStatsSampleHealth({
  assertIncludes,
  assertNotIncludes,
  repoRoot,
}) {
  writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), [
    JSON.stringify({
      cache: false,
      mode: 'affected',
      status: 'pass',
      durationMs: 9001,
      gates: [
        {
          cacheHit: false,
          durationMs: 9001,
          name: 'verify:frontend:preflight',
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
    JSON.stringify({
      cache: true,
      mode: 'affected',
      status: 'pass',
      durationMs: 100,
      gates: [
        {
          cacheHit: false,
          durationMs: 100,
          name: 'verify:frontend:preflight',
          status: 'pass',
        },
      ],
      summary: {
        passed: 1,
        failed: 0,
        cached: 0,
        total: 1,
      },
      timestamp: '2026-05-10T00:05:00.000Z',
    }),
    '',
  ].join('\n'));
  const staleStats = printStatsWithCwd(repoRoot, { json: true, limit: 200, slowLimit: 1 });
  assertIncludes(staleStats, '"name": "verify:frontend:preflight"', 'stale stats should retain the slowest gate history');
  assertIncludes(staleStats, '"coldMaxMs": 9001', 'stale stats should keep the historical cold max in slowest JSON');
  assertIncludes(staleStats, '"lastColdDurationMs": 100', 'stale stats should expose the latest cold sample');
  assertIncludes(staleStats, '"sampleHealth"', 'stale stats should expose sample health diagnostics');
  assertIncludes(staleStats, '"status": "stale-max"', 'stale stats should mark recovered old maxima as stale');
  assertIncludes(staleStats, '"staleBudgetWarnings"', 'stale stats should keep historical warning visibility');
  assertNotIncludes(
    staleStats,
    '"gate": "verify:frontend:preflight"',
    'stale max samples should not become primary next actions',
  );
  const staleTextStats = printStatsWithCwd(repoRoot, { limit: 200, slowLimit: 1 });
  assertIncludes(
    staleTextStats,
    '[quality] cache modes',
    'text stats should surface cache mode distribution for diagnostics',
  );
  assertIncludes(
    staleTextStats,
    '- off: 1',
    'text stats should count forced no-cache diagnostic runs separately',
  );
  assertIncludes(
    staleTextStats,
    '- on: 1',
    'text stats should count cache-enabled runs separately',
  );
  assertIncludes(
    staleTextStats,
    'sample=stale-max',
    'text stats should surface stale rolling max samples inline',
  );
  assertIncludes(
    staleTextStats,
    'lastCold=100ms oldColdMax=9001ms',
    'text stats should expose the latest cold sample next to the stale historical max',
  );
  assertIncludes(
    staleTextStats,
    'coldMode=on',
    'text stats should expose whether the latest cold sample came from cache-on or diagnostic no-cache mode',
  );
  assertIncludes(
    staleTextStats,
    'coldModes=on:1/off:1/unknown:0',
    'text stats should summarize cold samples by cache mode',
  );
  assertNotIncludes(
    staleTextStats,
    '[quality] next actions',
    'text stats should omit next actions when all warnings are stale samples',
  );
  assertIncludes(
    staleTextStats,
    '[quality] no current next actions (staleWarnings=1)',
    'text stats should explicitly distinguish stale historical warnings from actionable next actions',
  );
  assertIncludes(
    staleTextStats,
    '[quality] hint: use --since <ISO> or --since-commit <ref> to isolate current samples before optimizing historical peaks',
    'text stats should point stale-warning follow-up at scoped current-sample windows',
  );

  writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), [
    JSON.stringify({
      cache: false,
      mode: 'affected',
      status: 'pass',
      durationMs: 9001,
      gates: [
        {
          cacheHit: false,
          durationMs: 9001,
          name: 'verify:frontend:preflight',
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
    JSON.stringify({
      cache: true,
      mode: 'affected',
      status: 'pass',
      durationMs: 0,
      gates: [
        {
          cacheHit: true,
          cacheSource: 'local',
          durationMs: 0,
          name: 'verify:frontend:preflight',
          status: 'pass',
        },
      ],
      summary: {
        passed: 1,
        failed: 0,
        cached: 1,
        total: 1,
      },
      timestamp: '2026-05-10T00:05:00.000Z',
    }),
    '',
  ].join('\n'));
  const cacheRecoveredStats = printStatsWithCwd(repoRoot, { json: true, limit: 200, slowLimit: 1 });
  assertIncludes(
    cacheRecoveredStats,
    '"status": "cache-recovered"',
    'stats should mark old cold max samples as recovered when the latest observation is a cache hit',
  );
  assertIncludes(
    cacheRecoveredStats,
    '"lastDurationMs": 0',
    'cache-recovered sample health should expose the latest cache-hit duration',
  );
  assertIncludes(
    cacheRecoveredStats,
    '"staleBudgetWarnings"',
    'cache-recovered samples should remain visible as historical warning context',
  );
  assertNotIncludes(
    cacheRecoveredStats,
    '"gate": "verify:frontend:preflight"',
    'cache-recovered samples should not become primary next actions',
  );
  const cacheRecoveredTextStats = printStatsWithCwd(repoRoot, { limit: 200, slowLimit: 1 });
  assertIncludes(
    cacheRecoveredTextStats,
    'sample=cache-recovered',
    'text stats should surface cache-recovered samples inline',
  );
  assertIncludes(
    cacheRecoveredTextStats,
    'last=0ms lastCold=9001ms oldColdMax=9001ms',
    'text stats should show latest cache-hit timing next to retained cold max history',
  );
  assertNotIncludes(
    cacheRecoveredTextStats,
    '[quality] next actions',
    'text stats should omit next actions when the only warning has recovered through cache',
  );
  assertIncludes(
    cacheRecoveredTextStats,
    '[quality] no current next actions (staleWarnings=1)',
    'text stats should count cache-recovered historical warnings with other stale warnings',
  );
  assertIncludes(
    cacheRecoveredTextStats,
    '[quality] hint: use --since <ISO> or --since-commit <ref> to isolate current samples before optimizing historical peaks',
    'text stats should point cache-recovered stale warnings at scoped current-sample windows',
  );
}
