#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parseArgs,
  runDashboardApiLatencyHistory,
  summarizeHistoryRecords,
} from './dashboard-api-latency-history.mjs';

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
    thresholdMs: 500,
    timeoutMs: 5000,
    warmups: 1,
    concurrency: 3,
    window: {
      startDate: '2026-05-13',
      endDate: '2026-05-19',
      prevStartDate: '2026-05-06',
      prevEndDate: '2026-05-12',
    },
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
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'dashboard-api-latency-history-'));
  const historyJsonl = path.join(tmpDir, 'history.jsonl');
  writeFileSync(historyJsonl, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  return { tmpDir, historyJsonl };
}

function testSummarizesHistoryRecords() {
  const summary = summarizeHistoryRecords([
    makeRecord({
      timestamp: '2026-05-21T00:00:00.000Z',
      trafficDurationP95: 10,
      trafficCacheHitP95: 1,
      goodsDurationP95: 20,
      goodsCacheHitP95: 2,
    }),
    makeRecord({
      timestamp: '2026-05-21T00:01:00.000Z',
      trafficDurationP95: 15,
      trafficCacheHitP95: 3,
      goodsDurationP95: 25,
      goodsCacheHitP95: 4,
    }),
  ]);

  assert.equal(summary.recordCount, 2);
  assert.equal(summary.endpoints.traffic.durationP95Ms.max, 15);
  assert.equal(summary.endpoints.traffic.cacheHitP95Ms.latest, 3);
  assert.equal(summary.endpoints.traffic.payloadBytes.max, 4096);
  assert.equal(summary.endpoints.goods.records, 2);
}

function testPassesWithinBudgets() {
  const { tmpDir, historyJsonl } = writeHistory([
    makeRecord({
      timestamp: '2026-05-21T00:00:00.000Z',
      trafficDurationP95: 100,
      trafficCacheHitP95: 10,
      goodsDurationP95: 80,
      goodsCacheHitP95: 5,
    }),
    makeRecord({
      timestamp: '2026-05-21T00:01:00.000Z',
      trafficDurationP95: 120,
      trafficCacheHitP95: 12,
      goodsDurationP95: 90,
      goodsCacheHitP95: 8,
    }),
  ]);
  try {
    const report = runDashboardApiLatencyHistory(parseArgs([
      '--history-jsonl',
      historyJsonl,
      '--last',
      '2',
      '--fail-on-p95',
      'traffic:130',
      '--fail-on-cache-hit-p95',
      'traffic:15',
      '--fail-on-payload-kb',
      'traffic:5',
    ]));

    assert.equal(report.status, 'pass');
    assert.equal(report.analyzedRecords, 2);
    assert.equal(report.summary.endpoints.traffic.durationP95Ms.max, 120);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testFailsWhenPayloadBudgetExceeded() {
  const { tmpDir, historyJsonl } = writeHistory([
    makeRecord({
      timestamp: '2026-05-21T00:00:00.000Z',
      trafficDurationP95: 100,
      trafficCacheHitP95: 10,
      trafficPayloadBytes: 12 * 1024,
      goodsDurationP95: 80,
      goodsCacheHitP95: 5,
    }),
  ]);
  try {
    const report = runDashboardApiLatencyHistory(parseArgs([
      '--history-jsonl',
      historyJsonl,
      '--fail-on-payload-kb',
      'traffic:10',
    ]));

    assert.equal(report.status, 'fail');
    assert.match(report.findings[0], /traffic payload size max 12kB exceeds 10kB/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testFailsWhenBudgetExceeded() {
  const { tmpDir, historyJsonl } = writeHistory([
    makeRecord({
      timestamp: '2026-05-21T00:00:00.000Z',
      trafficDurationP95: 140,
      trafficCacheHitP95: 10,
      goodsDurationP95: 80,
      goodsCacheHitP95: 5,
    }),
  ]);
  try {
    const report = runDashboardApiLatencyHistory(parseArgs([
      '--history-jsonl',
      historyJsonl,
      '--fail-on-p95',
      'traffic:130',
    ]));

    assert.equal(report.status, 'fail');
    assert.match(report.findings[0], /traffic duration p95 max 140ms exceeds 130ms/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testFailsOnFailedRecordUnlessAllowed() {
  const { tmpDir, historyJsonl } = writeHistory([
    makeRecord({
      timestamp: '2026-05-21T00:00:00.000Z',
      status: 'fail',
      trafficDurationP95: 100,
      trafficCacheHitP95: 10,
      goodsDurationP95: 80,
      goodsCacheHitP95: 5,
    }),
  ]);
  try {
    const failingReport = runDashboardApiLatencyHistory(parseArgs([
      '--history-jsonl',
      historyJsonl,
    ]));
    const passingReport = runDashboardApiLatencyHistory(parseArgs([
      '--history-jsonl',
      historyJsonl,
      '--allow-failed-records',
    ]));

    assert.equal(failingReport.status, 'fail');
    assert.match(failingReport.findings[0], /status=fail/);
    assert.equal(passingReport.status, 'pass');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

testSummarizesHistoryRecords();
testPassesWithinBudgets();
testFailsWhenBudgetExceeded();
testFailsWhenPayloadBudgetExceeded();
testFailsOnFailedRecordUnlessAllowed();

console.log('[dashboard-api-latency-history-behavior] OK');
