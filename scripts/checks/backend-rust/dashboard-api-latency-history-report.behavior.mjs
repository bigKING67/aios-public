#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parseReportArgs,
  renderMarkdownReport,
  runDashboardApiLatencyHistoryReport,
} from './dashboard-api-latency-history-report.mjs';
import {
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
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'dashboard-api-latency-history-report-'));
  const historyJsonl = path.join(tmpDir, 'history.jsonl');
  writeFileSync(historyJsonl, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  return { tmpDir, historyJsonl };
}

function testParseReportArgs() {
  const options = parseReportArgs([
    '--history-jsonl',
    '/tmp/history.jsonl',
    '--last',
    '7',
    '--output-md',
    '/tmp/report.md',
    '--title',
    'VPS Latency',
    '--fail-on-p95',
    'traffic:500',
    '--fail-on-cache-hit-p95',
    'traffic:50',
    '--fail-on-payload-kb',
    'traffic:5',
    '--allow-failed-records',
  ]);

  assert.equal(options.historyJsonl, '/tmp/history.jsonl');
  assert.equal(options.last, 7);
  assert.equal(options.outputMd, '/tmp/report.md');
  assert.equal(options.title, 'VPS Latency');
  assert.deepEqual(options.failOnP95, [{ endpoint: 'traffic', maxMs: 500 }]);
  assert.deepEqual(options.failOnCacheHitP95, [{ endpoint: 'traffic', maxMs: 50 }]);
  assert.deepEqual(options.failOnPayloadKb, [{ endpoint: 'traffic', maxMs: 5 }]);
  assert.equal(options.allowFailedRecords, true);
}

function testRenderMarkdownReport() {
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
      trafficDurationP95: 12,
      trafficCacheHitP95: 3,
      goodsDurationP95: 30,
      goodsCacheHitP95: 5,
    }),
  ]);

  const markdown = renderMarkdownReport({
    status: 'pass',
    historyJsonl: '.artifacts/dashboard-api-latency/history.jsonl',
    totalRecords: 2,
    analyzedRecords: 2,
    last: 20,
    checks: {
      failOnP95: [{ endpoint: 'traffic', maxMs: 500 }],
      failOnCacheHitP95: [{ endpoint: 'traffic', maxMs: 50 }],
      failOnPayloadKb: [{ endpoint: 'traffic', maxMs: 5 }],
      allowFailedRecords: false,
    },
    findings: [],
    summary,
  }, {
    title: 'Dashboard API Latency Report',
    generatedAt: '2026-05-21T00:02:00.000Z',
  });

  assert.match(markdown, /^# Dashboard API Latency Report/m);
  assert.match(markdown, /- Status: `pass`/);
  assert.match(markdown, /- Duration p95 budgets: traffic <= 500ms/);
  assert.match(markdown, /- Payload size budgets: traffic <= 5kB/);
  assert.match(markdown, /\| traffic \| 2 \| pass \| 2026-05-21T00:01:00.000Z \| 12ms \| 12ms \| 3ms \| 3ms \| 4kB \| 4kB \|/);
  assert.match(markdown, /- None\./);
}

function testWritesMarkdownReport() {
  const { tmpDir, historyJsonl } = writeHistory([
    makeRecord({
      timestamp: '2026-05-21T00:00:00.000Z',
      trafficDurationP95: 100,
      trafficCacheHitP95: 10,
      goodsDurationP95: 80,
      goodsCacheHitP95: 5,
    }),
  ]);
  try {
    const outputMd = path.join(tmpDir, 'reports', 'latency.md');
    const { report } = runDashboardApiLatencyHistoryReport(parseReportArgs([
      '--history-jsonl',
      historyJsonl,
      '--output-md',
      outputMd,
      '--fail-on-p95',
      'traffic:120',
    ]), {
      now: () => new Date('2026-05-21T00:01:00.000Z'),
    });

    assert.equal(report.status, 'pass');
    assert.equal(existsSync(outputMd), true);
    assert.match(readFileSync(outputMd, 'utf8'), /Generated at: `2026-05-21T00:01:00.000Z`/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testWritesFailedMarkdownReport() {
  const { tmpDir, historyJsonl } = writeHistory([
    makeRecord({
      timestamp: '2026-05-21T00:00:00.000Z',
      trafficDurationP95: 150,
      trafficCacheHitP95: 10,
      goodsDurationP95: 80,
      goodsCacheHitP95: 5,
    }),
  ]);
  try {
    const outputMd = path.join(tmpDir, 'latency.md');
    const { report } = runDashboardApiLatencyHistoryReport(parseReportArgs([
      '--history-jsonl',
      historyJsonl,
      '--output-md',
      outputMd,
      '--fail-on-p95',
      'traffic:100',
    ]), {
      now: () => new Date('2026-05-21T00:01:00.000Z'),
    });

    const markdown = readFileSync(outputMd, 'utf8');
    assert.equal(report.status, 'fail');
    assert.match(markdown, /traffic duration p95 max 150ms exceeds 100ms/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

testParseReportArgs();
testRenderMarkdownReport();
testWritesMarkdownReport();
testWritesFailedMarkdownReport();

console.log('[dashboard-api-latency-history-report-behavior] OK');
