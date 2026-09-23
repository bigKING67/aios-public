#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parseRollupArgs,
  renderMarkdownRollup,
  runDashboardApiLatencyHistoryRollup,
} from './dashboard-api-latency-history-rollup.mjs';

function makeRecord({
  timestamp,
  status = 'pass',
  trafficDurationP95,
  trafficCacheHitP95,
  trafficPayloadBytes = 4096,
  goodsDurationP95,
  goodsCacheHitP95,
  goodsPayloadBytes = 2048,
}) {
  return {
    timestamp,
    status,
    baseUrl: 'http://example.test',
    measuredSummary: {
      traffic: {
        durationMs: { p95: trafficDurationP95 },
        payloadBytes: { max: trafficPayloadBytes },
        serverTimingPhases: {
          cache_hit: { p95: trafficCacheHitP95 },
        },
      },
      goods: {
        durationMs: { p95: goodsDurationP95 },
        payloadBytes: { max: goodsPayloadBytes },
        serverTimingPhases: {
          cache_hit: { p95: goodsCacheHitP95 },
        },
      },
    },
  };
}

function writeHistory(records) {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'dashboard-api-latency-history-rollup-'));
  const historyJsonl = path.join(tmpDir, 'history.jsonl');
  writeFileSync(historyJsonl, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  return { tmpDir, historyJsonl };
}

function testParseRollupArgs() {
  const options = parseRollupArgs([
    '--history-jsonl',
    '/tmp/history.jsonl',
    '--period',
    'week',
    '--last-periods',
    '8',
    '--output-md',
    '/tmp/weekly.md',
    '--title',
    'Weekly VPS Latency',
    '--fail-on-p95',
    'traffic:500',
    '--fail-on-cache-hit-p95',
    'traffic:50',
    '--fail-on-payload-kb',
    'traffic:5',
    '--allow-failed-records',
  ]);

  assert.equal(options.historyJsonl, '/tmp/history.jsonl');
  assert.equal(options.period, 'week');
  assert.equal(options.lastPeriods, 8);
  assert.equal(options.outputMd, '/tmp/weekly.md');
  assert.equal(options.title, 'Weekly VPS Latency');
  assert.deepEqual(options.failOnP95, [{ endpoint: 'traffic', maxMs: 500 }]);
  assert.deepEqual(options.failOnCacheHitP95, [{ endpoint: 'traffic', maxMs: 50 }]);
  assert.deepEqual(options.failOnPayloadKb, [{ endpoint: 'traffic', maxMs: 5 }]);
  assert.equal(options.allowFailedRecords, true);
}

function testRenderMarkdownRollup() {
  const markdown = renderMarkdownRollup({
    status: 'pass',
    historyJsonl: '.artifacts/dashboard-api-latency/history.jsonl',
    totalRecords: 2,
    analyzedRecords: 2,
    period: 'day',
    lastPeriods: 7,
    periodCount: 1,
    checks: {
      failOnP95: [{ endpoint: 'traffic', maxMs: 500 }],
      failOnCacheHitP95: [{ endpoint: 'traffic', maxMs: 50 }],
      failOnPayloadKb: [{ endpoint: 'traffic', maxMs: 5 }],
      allowFailedRecords: false,
    },
    findings: [],
    trendNotes: [],
    periods: [
      {
        label: '2026-05-21',
        records: [
          makeRecord({
            timestamp: '2026-05-21T00:00:00.000Z',
            trafficDurationP95: 100,
            trafficCacheHitP95: 10,
            goodsDurationP95: 90,
            goodsCacheHitP95: 9,
          }),
          makeRecord({
            timestamp: '2026-05-21T01:00:00.000Z',
            trafficDurationP95: 120,
            trafficCacheHitP95: 11,
            goodsDurationP95: 95,
            goodsCacheHitP95: 8,
          }),
        ],
        failedRecords: 0,
        latestRecord: null,
        summary: {
          endpoints: {
            traffic: {
              records: 2,
              latest: {
                timestamp: '2026-05-21T01:00:00.000Z',
                status: 'pass',
              },
              durationP95Ms: { latest: 120, max: 120 },
              cacheHitP95Ms: { latest: 11, max: 11 },
              payloadBytes: { latest: 4096, max: 4096 },
            },
          },
        },
      },
    ],
  }, {
    title: 'Dashboard API Latency Daily Rollup',
    generatedAt: '2026-05-21T02:00:00.000Z',
  });

  assert.match(markdown, /^# Dashboard API Latency Daily Rollup/m);
  assert.match(markdown, /- Period: `day`/);
  assert.match(markdown, /- Period count: `1` \/ last `7` periods/);
  assert.match(markdown, /- Payload size budgets: traffic <= 5kB/);
  assert.match(markdown, /\| 2026-05-21 \| 2 \| 0 \| traffic \| 120ms \| 120ms \| 11ms \| 11ms \| 4kB \| 4kB \| 2026-05-21T01:00:00.000Z \| pass \|/);
  assert.match(markdown, /## Trend Notes/);
}

function testWritesDailyRollupAndFindsTrend() {
  const { tmpDir, historyJsonl } = writeHistory([
    makeRecord({
      timestamp: '2026-05-20T00:00:00.000Z',
      trafficDurationP95: 100,
      trafficCacheHitP95: 10,
      goodsDurationP95: 80,
      goodsCacheHitP95: 8,
    }),
    makeRecord({
      timestamp: '2026-05-21T00:00:00.000Z',
      trafficDurationP95: 130,
      trafficCacheHitP95: 12,
      goodsDurationP95: 85,
      goodsCacheHitP95: 9,
    }),
  ]);

  try {
    const outputMd = path.join(tmpDir, 'daily.md');
    const { report } = runDashboardApiLatencyHistoryRollup(parseRollupArgs([
      '--history-jsonl',
      historyJsonl,
      '--period',
      'day',
      '--last-periods',
      '2',
      '--output-md',
      outputMd,
      '--fail-on-p95',
      'traffic:200',
    ]), {
      now: () => new Date('2026-05-21T02:00:00.000Z'),
    });

    const markdown = readFileSync(outputMd, 'utf8');
    assert.equal(report.status, 'pass');
    assert.equal(report.periodCount, 2);
    assert.equal(report.analyzedRecords, 2);
    assert.match(markdown, /traffic duration p95 max increased \+30ms \(30\.0%\) vs previous 2026-05-20/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testWritesWeeklyFailedRollup() {
  const { tmpDir, historyJsonl } = writeHistory([
    makeRecord({
      timestamp: '2026-05-18T00:00:00.000Z',
      status: 'fail',
      trafficDurationP95: 650,
      trafficCacheHitP95: 70,
      goodsDurationP95: 90,
      goodsCacheHitP95: 9,
    }),
  ]);

  try {
    const outputMd = path.join(tmpDir, 'weekly.md');
    const { report } = runDashboardApiLatencyHistoryRollup(parseRollupArgs([
      '--history-jsonl',
      historyJsonl,
      '--period',
      'week',
      '--last-periods',
      '8',
      '--output-md',
      outputMd,
      '--fail-on-p95',
      'traffic:500',
      '--fail-on-cache-hit-p95',
      'traffic:50',
      '--fail-on-payload-kb',
      'traffic:1',
    ]), {
      now: () => new Date('2026-05-21T02:00:00.000Z'),
    });

    const markdown = readFileSync(outputMd, 'utf8');
    assert.equal(report.status, 'fail');
    assert.equal(existsSync(outputMd), true);
    assert.match(markdown, /2026-05-18\.\.2026-05-24 history record 2026-05-18T00:00:00.000Z status=fail/);
    assert.match(markdown, /2026-05-18\.\.2026-05-24 endpoint traffic duration p95 max 650ms exceeds 500ms/);
    assert.match(markdown, /2026-05-18\.\.2026-05-24 endpoint traffic cache_hit p95 max 70ms exceeds 50ms/);
    assert.match(markdown, /2026-05-18\.\.2026-05-24 endpoint traffic payload size max 4kB exceeds 1kB/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

testParseRollupArgs();
testRenderMarkdownRollup();
testWritesDailyRollupAndFindsTrend();
testWritesWeeklyFailedRollup();

console.log('[dashboard-api-latency-history-rollup-behavior] OK');
