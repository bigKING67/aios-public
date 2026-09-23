#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  writeReportArtifacts,
  parseServerTimingHeader,
  parseArgs,
  runDashboardApiLatencySmoke,
} from './dashboard-api-latency-smoke.mjs';

function makeResponse(status, payload, headers = {}) {
  return {
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    status,
    ok: status >= 200 && status < 300,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

async function testRunsAllDashboardEndpoints() {
  const calls = [];
  const options = parseArgs(['--base-url', 'http://example.test', '--threshold-ms', '1000']);
  const report = await runDashboardApiLatencySmoke(options, {
    env: {},
    fetchImpl: async (url) => {
      calls.push(url.toString());
      if (url.pathname.endsWith('/goods') && !url.pathname.endsWith('/traffic/goods')) {
        return makeResponse(200, { table: [{ productId: 'p1' }] });
      }
      return makeResponse(200, { tree: [{ name: 'root' }] }, { 'server-timing': 'total;dur=12.34' });
    },
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.warmups, 1);
  assert.equal(report.warmupResults.length, 3);
  assert.equal(report.results.length, 3);
  assert.deepEqual(
    calls.map((url) => new URL(url).pathname).slice(0, 3),
    ['/v1/dashboard/traffic', '/v1/dashboard/traffic/goods', '/v1/dashboard/goods'],
  );
  assert.deepEqual(
    calls.map((url) => new URL(url).pathname).slice(3),
    ['/v1/dashboard/traffic', '/v1/dashboard/traffic/goods', '/v1/dashboard/goods'],
  );
  assert.ok(calls.every((url) => new URL(url).searchParams.get('platform') === 'taobao'));
  assert.equal(new URL(calls[2]).searchParams.get('top_n'), '100');
  assert.equal(new URL(calls[5]).searchParams.get('top_n'), '100');
  assert.equal(report.results[0].serverTiming, 'total;dur=12.34');
  assert.equal(report.results[0].serverTimingPhases.total, 12.34);
}

async function testParsesServerTimingHeader() {
  assert.deepEqual(
    parseServerTimingHeader('validate;dur=0.04, cache_hit;dur=1.67, total;dur=1.71'),
    {
      validate: 0.04,
      cache_hit: 1.67,
      total: 1.71,
    },
  );
}

async function testFailsWhenEndpointExceedsBudget() {
  const options = parseArgs([
    '--base-url',
    'http://example.test',
    '--threshold-ms',
    '0.01',
    '--warmups',
    '0',
  ]);
  const report = await runDashboardApiLatencySmoke(options, {
    env: {},
    fetchImpl: async () => makeResponse(200, { tree: [] }),
  });

  assert.equal(report.status, 'fail');
  assert.ok(report.results.some((result) => !result.passed));
}

async function testServerTimingAssertionsPassAndFail() {
  const passingOptions = parseArgs([
    '--base-url',
    'http://example.test',
    '--threshold-ms',
    '1000',
    '--endpoint',
    'traffic',
    '--warmups',
    '0',
    '--require-server-timing-phase',
    'cache_hit',
    '--max-server-timing-phase',
    'cache_hit:5',
  ]);
  const passingReport = await runDashboardApiLatencySmoke(passingOptions, {
    env: {},
    fetchImpl: async () => makeResponse(
      200,
      { tree: [{ name: 'root' }] },
      { 'server-timing': 'validate;dur=0.04, cache_hit;dur=4.25, total;dur=4.30' },
    ),
  });

  assert.equal(passingReport.status, 'pass');
  assert.equal(passingReport.results[0].serverTimingPhases.cache_hit, 4.25);

  const failingOptions = parseArgs([
    '--base-url',
    'http://example.test',
    '--threshold-ms',
    '1000',
    '--endpoint',
    'traffic',
    '--warmups',
    '0',
    '--require-server-timing-phase',
    'cache_hit',
    '--max-server-timing-phase',
    'cache_hit:1',
  ]);
  const failingReport = await runDashboardApiLatencySmoke(failingOptions, {
    env: {},
    fetchImpl: async () => makeResponse(
      200,
      { tree: [{ name: 'root' }] },
      { 'server-timing': 'validate;dur=0.04, cache_hit;dur=4.25, total;dur=4.30' },
    ),
  });

  assert.equal(failingReport.status, 'fail');
  assert.equal(failingReport.results[0].passed, false);
  assert.match(failingReport.results[0].error, /cache_hit=4.25ms exceeds 1ms/);
}

async function testPayloadBudgetAssertionsPassAndFail() {
  const passingOptions = parseArgs([
    '--base-url',
    'http://example.test',
    '--threshold-ms',
    '1000',
    '--endpoint',
    'traffic',
    '--warmups',
    '0',
    '--max-payload-kb',
    'traffic:1',
  ]);
  const passingReport = await runDashboardApiLatencySmoke(passingOptions, {
    env: {},
    fetchImpl: async () => makeResponse(200, { tree: [{ name: 'root' }] }),
  });

  assert.equal(passingReport.status, 'pass');
  assert.equal(passingReport.maxPayloadKb[0].endpoint, 'traffic');
  assert.equal(passingReport.measuredSummary.traffic.payloadBytes.count, 1);

  const failingOptions = parseArgs([
    '--base-url',
    'http://example.test',
    '--threshold-ms',
    '1000',
    '--endpoint',
    'traffic',
    '--warmups',
    '0',
    '--max-payload-kb',
    'traffic:0.01',
  ]);
  const failingReport = await runDashboardApiLatencySmoke(failingOptions, {
    env: {},
    fetchImpl: async () => makeResponse(200, { tree: [{ name: 'root' }, { name: 'oversized' }] }),
  });

  assert.equal(failingReport.status, 'fail');
  assert.equal(failingReport.results[0].passed, false);
  assert.match(failingReport.results[0].error, /payload size .*kB exceeds 0\.01kB/);
}

async function testConcurrencyRunsMultipleMeasurements() {
  const calls = [];
  const options = parseArgs([
    '--base-url',
    'http://example.test',
    '--threshold-ms',
    '1000',
    '--endpoint',
    'goods',
    '--warmups',
    '1',
    '--concurrency',
    '3',
  ]);
  const report = await runDashboardApiLatencySmoke(options, {
    env: {},
    fetchImpl: async (url) => {
      calls.push(url.toString());
      return makeResponse(200, { table: [{ productId: 'p1' }] });
    },
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.concurrency, 3);
  assert.equal(report.warmupResults.length, 1);
  assert.equal(report.results.length, 3);
  assert.deepEqual(report.results.map((result) => result.iteration), [1, 2, 3]);
  assert.equal(report.measuredSummary.goods.count, 3);
  assert.equal(report.measuredSummary.goods.durationMs.count, 3);
  assert.equal(calls.length, 4);
}

async function testWritesReportArtifacts() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'dashboard-api-latency-smoke-'));
  try {
    const outputJson = path.join(tmpDir, 'reports', 'latest.json');
    const historyJsonl = path.join(tmpDir, 'history', 'latency.jsonl');
    const options = parseArgs([
      '--base-url',
      'http://example.test',
      '--threshold-ms',
      '1000',
      '--endpoint',
      'traffic',
      '--warmups',
      '0',
    ]);
    const report = await runDashboardApiLatencySmoke(options, {
      env: {},
      fetchImpl: async () => makeResponse(
        200,
        { tree: [{ name: 'root' }] },
        { 'server-timing': 'cache_hit;dur=1.25, total;dur=1.30' },
      ),
    });

    writeReportArtifacts(report, { outputJson, historyJsonl });

    const writtenReport = JSON.parse(readFileSync(outputJson, 'utf8'));
    const historyLines = readFileSync(historyJsonl, 'utf8').trim().split('\n');
    const historyRecord = JSON.parse(historyLines[0]);

    assert.equal(writtenReport.status, 'pass');
    assert.equal(writtenReport.measuredSummary.traffic.serverTimingPhases.cache_hit.p95, 1.25);
    assert.equal(historyLines.length, 1);
    assert.equal(historyRecord.status, 'pass');
    assert.equal(historyRecord.measuredSummary.traffic.durationMs.count, 1);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function testEndpointFilter() {
  const calls = [];
  const options = parseArgs([
    '--base-url',
    'http://example.test',
    '--threshold-ms',
    '1000',
    '--endpoint',
    'goods',
    '--warmups',
    '2',
  ]);
  const report = await runDashboardApiLatencySmoke(options, {
    env: {},
    fetchImpl: async (url) => {
      calls.push(url.toString());
      return makeResponse(200, { table: [{ productId: 'p1' }, { productId: 'p2' }] });
    },
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.warmups, 2);
  assert.equal(report.warmupResults.length, 2);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].name, 'goods');
  assert.equal(report.results[0].rowCount, 2);
  assert.equal(calls.length, 3);
}

async function testWarmupFailureFailsReportWithoutLatencyBudget() {
  let calls = 0;
  const options = parseArgs([
    '--base-url',
    'http://example.test',
    '--threshold-ms',
    '1000',
    '--endpoint',
    'traffic',
    '--warmups',
    '1',
  ]);
  const report = await runDashboardApiLatencySmoke(options, {
    env: {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return makeResponse(503, { error: 'warming' });
      }
      return makeResponse(200, { tree: [{ name: 'root' }] });
    },
  });

  assert.equal(report.status, 'fail');
  assert.equal(report.warmupResults.length, 1);
  assert.equal(report.warmupResults[0].passed, false);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].passed, true);
}

await testRunsAllDashboardEndpoints();
await testParsesServerTimingHeader();
await testFailsWhenEndpointExceedsBudget();
await testServerTimingAssertionsPassAndFail();
await testPayloadBudgetAssertionsPassAndFail();
await testConcurrencyRunsMultipleMeasurements();
await testWritesReportArtifacts();
await testEndpointFilter();
await testWarmupFailureFailsReportWithoutLatencyBudget();

console.log('[dashboard-api-latency-smoke-behavior] OK');
