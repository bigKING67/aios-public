import path from 'node:path';

import {
  printStatsWithCwd,
  writeText,
} from './cache-stats-fixtures.mjs';

function statsSection(output, heading) {
  const startIndex = output.indexOf(heading);
  if (startIndex === -1) {
    return '';
  }
  const section = output.slice(startIndex);
  const nextIndex = section.indexOf('\n[quality] ', heading.length);
  return nextIndex === -1 ? section : section.slice(0, nextIndex);
}

function containsInOrder(output, first, second) {
  const firstIndex = output.indexOf(first);
  const secondIndex = output.indexOf(second);
  return firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex;
}

export function assertCacheStatsCompatibilityOrdering({
  assertIncludes,
  assertNotIncludes,
  assertTrue,
  repoRoot,
}) {
  writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), `${JSON.stringify({
    mode: 'affected',
    status: 'pass',
    durationMs: 9001,
    gates: [
      {
        cacheHit: false,
        durationMs: 9001,
        name: 'verify:quality-runner:cache',
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
  })}\n`);
  const compatibilityStats = printStatsWithCwd(repoRoot, { json: true, limit: 200, slowLimit: 1 });
  assertIncludes(
    compatibilityStats,
    '"category": "compatibility-slice"',
    'stats should classify retired compatibility aggregate slices separately',
  );
  assertIncludes(
    compatibilityStats,
    'compatibility aggregate entrypoint is kept for manual debugging',
    'compatibility slice stats should point to primary slices instead of cold-path optimization',
  );
  assertNotIncludes(
    compatibilityStats,
    '"budgetWarnings": [\n    {',
    'compatibility aggregate slice should not create budget-warning noise',
  );

  writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), `${JSON.stringify({
    mode: 'affected',
    status: 'pass',
    durationMs: 9001,
    gates: [
      {
        cacheHit: false,
        durationMs: 9001,
        name: 'verify:quality-runner',
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
  })}\n`);
  const aggregateStats = printStatsWithCwd(repoRoot, { json: true, limit: 200, slowLimit: 1 });
  assertIncludes(
    aggregateStats,
    '"category": "compatibility-slice"',
    'stats should classify the quality-runner aggregate self-check separately from primary behavior fixtures',
  );
  assertNotIncludes(
    aggregateStats,
    '"gate": "verify:quality-runner"',
    'quality-runner aggregate self-check should not become a primary next action',
  );
  assertNotIncludes(
    aggregateStats,
    '"budgetWarnings": [\n    {',
    'quality-runner aggregate self-check should not create budget-warning noise',
  );

  writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), `${JSON.stringify({
    mode: 'affected',
    status: 'pass',
    durationMs: 10001,
    gates: [
      {
        cacheHit: false,
        durationMs: 9001,
        name: 'verify:quality-runner',
        status: 'pass',
      },
      {
        cacheHit: false,
        durationMs: 1000,
        name: 'verify:frontend:preflight',
        status: 'pass',
      },
    ],
    summary: {
      passed: 2,
      failed: 0,
      cached: 0,
      total: 2,
    },
    timestamp: '2026-05-10T00:00:00.000Z',
  })}\n`);
  const primaryFirstStats = printStatsWithCwd(repoRoot, { limit: 200, slowLimit: 2 });
  assertIncludes(
    primaryFirstStats,
    '[quality] slowest (current cold first, primary first)',
    'text stats should make current-cold and primary-first ordering explicit',
  );
  assertTrue(
    containsInOrder(primaryFirstStats, '- verify:frontend:preflight:', '- verify:quality-runner:'),
    'text stats should list actionable primary gates before retired compatibility aggregate slices',
  );
  const latestColdSection = statsSection(primaryFirstStats, '[quality] latest cold (current signal)');
  assertTrue(
    containsInOrder(latestColdSection, '- verify:frontend:preflight:', '- verify:quality-runner:'),
    'latest cold text stats should keep compatibility aggregate slices behind primary gates',
  );
  const slowFactorsSection = statsSection(primaryFirstStats, '[quality] slow factors');
  assertTrue(
    containsInOrder(slowFactorsSection, '- node-check:', '- compatibility-slice:'),
    'slow factor text stats should keep compatibility slice factors behind actionable primary categories',
  );
  const primaryFirstJson = JSON.parse(printStatsWithCwd(repoRoot, { json: true, limit: 200, slowLimit: 2 }));
  const primaryLatestIndex = primaryFirstJson.latestCold.findIndex((item) => item.name === 'verify:frontend:preflight');
  const compatibilityLatestIndex = primaryFirstJson.latestCold.findIndex((item) => item.name === 'verify:quality-runner');
  assertTrue(
    primaryLatestIndex !== -1 && compatibilityLatestIndex !== -1 && primaryLatestIndex < compatibilityLatestIndex,
    'latest cold JSON stats should match text ordering and keep primary gates first',
  );
  const nodeFactorIndex = primaryFirstJson.slowFactors.findIndex((item) => item.category === 'node-check');
  const compatibilityFactorIndex = primaryFirstJson.slowFactors.findIndex((item) => item.category === 'compatibility-slice');
  assertTrue(
    nodeFactorIndex !== -1 && compatibilityFactorIndex !== -1 && nodeFactorIndex < compatibilityFactorIndex,
    'slow factor JSON stats should match text ordering and keep compatibility slices last',
  );
  assertTrue(
    primaryFirstJson.latestCold.some((item) => (
      item.name === 'verify:quality-runner'
      && item.category === 'compatibility-slice'
    )),
    'latest cold JSON stats should expose compatibility-slice category metadata',
  );

  writeText(path.join(repoRoot, '.cache/aios-quality/events.jsonl'), [
    JSON.stringify({
      mode: 'affected',
      status: 'pass',
      durationMs: 9100,
      gates: [
        {
          cacheHit: false,
          durationMs: 9000,
          name: 'historical-slower-gate',
          status: 'pass',
        },
        {
          cacheHit: false,
          durationMs: 100,
          name: 'current-hot-gate',
          status: 'pass',
        },
      ],
      summary: { passed: 2, failed: 0, cached: 0, total: 2 },
      timestamp: '2026-05-10T00:00:00.000Z',
    }),
    JSON.stringify({
      mode: 'affected',
      status: 'pass',
      durationMs: 1200,
      gates: [
        {
          cacheHit: false,
          durationMs: 100,
          name: 'historical-slower-gate',
          status: 'pass',
        },
        {
          cacheHit: false,
          durationMs: 1100,
          name: 'current-hot-gate',
          status: 'pass',
        },
      ],
      summary: { passed: 2, failed: 0, cached: 0, total: 2 },
      timestamp: '2026-05-10T00:01:00.000Z',
    }),
    '',
  ].join('\n'));
  const currentColdFirstStats = printStatsWithCwd(repoRoot, { limit: 200, slowLimit: 2 });
  assertTrue(
    currentColdFirstStats.indexOf('- current-hot-gate:') < currentColdFirstStats.indexOf('- historical-slower-gate:'),
    'text stats slowest should order same-priority gates by latest cold sample before historical max',
  );
  assertIncludes(
    currentColdFirstStats,
    'historical-slower-gate: max=9000ms',
    'current-cold-first text stats should retain historical max visibility',
  );
  assertIncludes(
    currentColdFirstStats,
    'currentColdMax=1100ms max=9000ms',
    'slow factor summaries should expose current cold max separately from historical max',
  );
}
