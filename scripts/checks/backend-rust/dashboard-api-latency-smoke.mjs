#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';
const DEFAULT_THRESHOLD_MS = 500;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_WARMUPS = 1;
const DEFAULT_DATE_WINDOW = {
  startDate: '2026-05-13',
  endDate: '2026-05-19',
  prevStartDate: '2026-05-06',
  prevEndDate: '2026-05-12',
};

const ENDPOINTS = [
  {
    name: 'traffic',
    path: '/v1/dashboard/traffic',
    rowCount: (payload) => (Array.isArray(payload.tree) ? payload.tree.length : 0),
  },
  {
    name: 'traffic_goods',
    path: '/v1/dashboard/traffic/goods',
    rowCount: (payload) => (Array.isArray(payload.tree) ? payload.tree.length : 0),
  },
  {
    name: 'goods',
    path: '/v1/dashboard/goods',
    extraParams: { top_n: '100' },
    rowCount: (payload) => (Array.isArray(payload.table) ? payload.table.length : 0),
  },
];

function printUsage() {
  console.log(`Usage: node scripts/checks/backend-rust/dashboard-api-latency-smoke.mjs [options]

Options:
  --base-url <url>        API base URL. Defaults to DASHBOARD_API_BASE_URL or ${DEFAULT_BASE_URL}
  --threshold-ms <ms>     Per-endpoint latency budget. Default: ${DEFAULT_THRESHOLD_MS}
  --timeout-ms <ms>       Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --warmups <count>       Warmup requests per endpoint before measurement. Default: ${DEFAULT_WARMUPS}
  --concurrency <count>   Measurement requests per endpoint to run concurrently. Default: 1
  --require-server-timing-phase <name>
                          Require a Server-Timing phase on measured requests. Repeatable.
  --max-server-timing-phase <name:ms>
                          Require a Server-Timing phase duration to stay under ms. Repeatable.
  --max-payload-kb <endpoint:kb>
                          Require measured response payload size to stay under kb. Repeatable.
  --output-json <path>    Write the full JSON report to a file.
  --history-jsonl <path>  Append a compact trend record to a JSONL history file.
  --start-date <date>     Current window start date. Default: ${DEFAULT_DATE_WINDOW.startDate}
  --end-date <date>       Current window end date. Default: ${DEFAULT_DATE_WINDOW.endDate}
  --prev-start-date <d>   Previous window start date. Default: ${DEFAULT_DATE_WINDOW.prevStartDate}
  --prev-end-date <d>     Previous window end date. Default: ${DEFAULT_DATE_WINDOW.prevEndDate}
  --endpoint <name>       Restrict to one endpoint: traffic, traffic_goods, goods
  --json                  Print machine-readable JSON report
  --help                  Show this help

Optional env:
  DASHBOARD_API_BASE_URL
  DASHBOARD_API_BEARER_TOKEN  Adds Authorization: Bearer <token> without printing it
`);
}

function readValueArg(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

export function parseArgs(args, env = process.env) {
  const options = {
    baseUrl: env.DASHBOARD_API_BASE_URL || DEFAULT_BASE_URL,
    thresholdMs: DEFAULT_THRESHOLD_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    warmups: DEFAULT_WARMUPS,
    concurrency: 1,
    requiredServerTimingPhases: [],
    maxServerTimingPhases: [],
    maxPayloadKb: [],
    outputJson: null,
    historyJsonl: null,
    startDate: DEFAULT_DATE_WINDOW.startDate,
    endDate: DEFAULT_DATE_WINDOW.endDate,
    prevStartDate: DEFAULT_DATE_WINDOW.prevStartDate,
    prevEndDate: DEFAULT_DATE_WINDOW.prevEndDate,
    endpoint: null,
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--base-url':
        options.baseUrl = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--threshold-ms':
        options.thresholdMs = Number(readValueArg(args, index, arg));
        index += 1;
        break;
      case '--timeout-ms':
        options.timeoutMs = Number(readValueArg(args, index, arg));
        index += 1;
        break;
      case '--warmups':
        options.warmups = Number(readValueArg(args, index, arg));
        index += 1;
        break;
      case '--concurrency':
        options.concurrency = Number(readValueArg(args, index, arg));
        index += 1;
        break;
      case '--require-server-timing-phase':
        options.requiredServerTimingPhases.push(readServerTimingPhaseArg(args, index, arg));
        index += 1;
        break;
      case '--max-server-timing-phase':
        options.maxServerTimingPhases.push(readServerTimingPhaseBudgetArg(args, index, arg));
        index += 1;
        break;
      case '--max-payload-kb':
        options.maxPayloadKb.push(readEndpointBudgetArg(args, index, arg));
        index += 1;
        break;
      case '--output-json':
        options.outputJson = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--history-jsonl':
        options.historyJsonl = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--start-date':
        options.startDate = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--end-date':
        options.endDate = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--prev-start-date':
        options.prevStartDate = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--prev-end-date':
        options.prevEndDate = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--endpoint':
        options.endpoint = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.thresholdMs) || options.thresholdMs <= 0) {
    throw new Error('--threshold-ms must be a positive number');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number');
  }
  if (!Number.isInteger(options.warmups) || options.warmups < 0) {
    throw new Error('--warmups must be a non-negative integer');
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency <= 0) {
    throw new Error('--concurrency must be a positive integer');
  }
  if (options.endpoint && !ENDPOINTS.some((endpoint) => endpoint.name === options.endpoint)) {
    throw new Error(`Unknown endpoint: ${options.endpoint}`);
  }

  return options;
}

function readEndpointBudgetArg(args, index, name) {
  const source = readValueArg(args, index, name);
  const [endpoint, maxKbSource, extra] = source.split(':');
  if (!endpoint || !ENDPOINTS.some((candidate) => candidate.name === endpoint)) {
    throw new Error(`${name} endpoint must be one of: ${ENDPOINTS.map((candidate) => candidate.name).join(', ')}`);
  }
  if (!maxKbSource || extra !== undefined) {
    throw new Error(`${name} must use <endpoint:kb>`);
  }
  const maxKb = Number(maxKbSource);
  if (!Number.isFinite(maxKb) || maxKb < 0) {
    throw new Error(`${name} kb budget must be a non-negative number`);
  }
  return { endpoint, maxKb };
}

function readServerTimingPhaseArg(args, index, name) {
  const phase = readValueArg(args, index, name);
  validateServerTimingPhaseName(phase, name);
  return phase;
}

function readServerTimingPhaseBudgetArg(args, index, name) {
  const source = readValueArg(args, index, name);
  const [phase, maxMsSource, extra] = source.split(':');
  validateServerTimingPhaseName(phase || '', name);
  if (!maxMsSource || extra !== undefined) {
    throw new Error(`${name} must use <phase:ms>`);
  }
  const maxMs = Number(maxMsSource);
  if (!Number.isFinite(maxMs) || maxMs < 0) {
    throw new Error(`${name} ms budget must be a non-negative number`);
  }
  return { phase, maxMs };
}

function validateServerTimingPhaseName(phase, name) {
  if (!/^[A-Za-z0-9_-]+$/.test(phase)) {
    throw new Error(`${name} phase must match /^[A-Za-z0-9_-]+$/`);
  }
}

export function parseServerTimingHeader(header) {
  if (!header) {
    return {};
  }

  const phases = {};
  for (const rawEntry of header.split(',')) {
    const [rawName, ...rawParams] = rawEntry.split(';').map((part) => part.trim());
    if (!rawName) {
      continue;
    }

    let durationMs = null;
    for (const rawParam of rawParams) {
      const [rawKey, rawValue] = rawParam.split('=');
      if (rawKey?.trim().toLowerCase() !== 'dur') {
        continue;
      }
      const parsedDuration = Number(rawValue?.trim());
      if (Number.isFinite(parsedDuration)) {
        durationMs = Number(parsedDuration.toFixed(2));
      }
    }
    phases[rawName] = durationMs;
  }
  return phases;
}

function evaluateServerTimingAssertions(phases, options) {
  const failures = [];

  for (const phase of options.requiredServerTimingPhases) {
    if (!Object.hasOwn(phases, phase)) {
      failures.push(`missing server-timing phase: ${phase}`);
    }
  }

  for (const { phase, maxMs } of options.maxServerTimingPhases) {
    const durationMs = phases[phase];
    if (!Number.isFinite(durationMs)) {
      failures.push(`missing numeric server-timing phase duration: ${phase}`);
    } else if (durationMs > maxMs) {
      failures.push(`server-timing phase ${phase}=${durationMs}ms exceeds ${maxMs}ms`);
    }
  }

  return failures;
}

function buildUrl(baseUrl, endpoint, options) {
  const url = new URL(endpoint.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('start_date', options.startDate);
  url.searchParams.set('end_date', options.endDate);
  url.searchParams.set('prev_start_date', options.prevStartDate);
  url.searchParams.set('prev_end_date', options.prevEndDate);
  url.searchParams.set('platform', 'taobao');
  for (const [key, value] of Object.entries(endpoint.extraParams || {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function fetchWithTimeout(fetchImpl, url, options, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const headers = { Accept: 'application/json' };
  if (env.DASHBOARD_API_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${env.DASHBOARD_API_BEARER_TOKEN}`;
  }

  try {
    return await fetchImpl(url, {
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function evaluatePayloadBudget(endpointName, payloadBytes, options) {
  const failures = [];
  const budgets = options.maxPayloadKb.filter((budget) => budget.endpoint === endpointName);
  for (const { maxKb } of budgets) {
    const actualKb = Number((payloadBytes / 1024).toFixed(2));
    if (actualKb > maxKb) {
      failures.push(`payload size ${actualKb}kB exceeds ${maxKb}kB`);
    }
  }
  return failures;
}

async function measureEndpoint(endpoint, options, deps, config = {}) {
  const {
    enforceLatency = true,
    enforcePayloadBudget = true,
    enforceServerTiming = true,
    phase = 'measure',
    iteration = 0,
  } = config;
  const url = buildUrl(options.baseUrl, endpoint, options);
  const startedAt = performance.now();
  let response = null;
  let body = '';
  let requestError = null;
  try {
    response = await fetchWithTimeout(deps.fetchImpl, url, options, deps.env);
    body = await response.text();
  } catch (error) {
    requestError = error.message;
  }
  const durationMs = performance.now() - startedAt;
  const payloadBytes = Buffer.byteLength(body);
  const serverTiming = typeof response?.headers?.get === 'function'
    ? response.headers.get('server-timing')
    : null;
  const serverTimingPhases = parseServerTimingHeader(serverTiming);

  let payload = null;
  let parseError = null;
  if (!requestError) {
    try {
      payload = JSON.parse(body);
    } catch (error) {
      parseError = error.message;
    }
  }

  const rowCount = payload ? endpoint.rowCount(payload) : 0;
  const serverTimingFailures = enforceServerTiming
    ? evaluateServerTimingAssertions(serverTimingPhases, options)
    : [];
  const payloadBudgetFailures = enforcePayloadBudget
    ? evaluatePayloadBudget(endpoint.name, payloadBytes, options)
    : [];
  const assertionFailures = [
    ...serverTimingFailures,
    ...payloadBudgetFailures,
  ];
  const error = requestError
    || parseError
    || (assertionFailures.length > 0 ? assertionFailures.join('; ') : null);
  const passed =
    Boolean(response?.ok)
    && !requestError
    && !parseError
    && serverTimingFailures.length === 0
    && payloadBudgetFailures.length === 0
    && (!enforceLatency || durationMs <= options.thresholdMs)
    && Number.isFinite(rowCount);

  return {
    phase,
    iteration,
    name: endpoint.name,
    url: url.toString(),
    status: response?.status ?? null,
    ok: response?.ok ?? false,
    durationMs: Number(durationMs.toFixed(2)),
    thresholdMs: options.thresholdMs,
    payloadBytes,
    rowCount,
    serverTiming,
    serverTimingPhases,
    passed,
    error,
  };
}

function measureEndpointConcurrently(endpoint, options, deps) {
  return Promise.all(Array.from({ length: options.concurrency }, (_, index) => (
    measureEndpoint(endpoint, options, deps, {
      iteration: options.concurrency === 1 ? 0 : index + 1,
    })
  )));
}

function percentile(values, percentileRank) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;
  return Number(sorted[Math.min(Math.max(index, 0), sorted.length - 1)].toFixed(2));
}

function summarizeNumberSeries(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) {
    return {
      count: 0,
      min: null,
      p50: null,
      p95: null,
      max: null,
    };
  }

  return {
    count: finiteValues.length,
    min: Number(Math.min(...finiteValues).toFixed(2)),
    p50: percentile(finiteValues, 50),
    p95: percentile(finiteValues, 95),
    max: Number(Math.max(...finiteValues).toFixed(2)),
  };
}

export function summarizeMeasuredResults(results) {
  const byEndpoint = {};
  for (const result of results) {
    byEndpoint[result.name] ??= {
      count: 0,
      passed: 0,
      failed: 0,
      durationValues: [],
      payloadBytesValues: [],
      serverTimingPhaseValues: {},
    };
    const endpoint = byEndpoint[result.name];
    endpoint.count += 1;
    endpoint[result.passed ? 'passed' : 'failed'] += 1;
    endpoint.durationValues.push(result.durationMs);
    endpoint.payloadBytesValues.push(result.payloadBytes);

    for (const [phase, durationMs] of Object.entries(result.serverTimingPhases ?? {})) {
      endpoint.serverTimingPhaseValues[phase] ??= [];
      endpoint.serverTimingPhaseValues[phase].push(durationMs);
    }
  }

  return Object.fromEntries(Object.entries(byEndpoint).map(([name, values]) => {
    const serverTimingPhases = Object.fromEntries(
      Object.entries(values.serverTimingPhaseValues)
        .map(([phase, phaseValues]) => [phase, summarizeNumberSeries(phaseValues)]),
    );
    return [name, {
      count: values.count,
      passed: values.passed,
      failed: values.failed,
      durationMs: summarizeNumberSeries(values.durationValues),
      payloadBytes: summarizeNumberSeries(values.payloadBytesValues),
      serverTimingPhases,
    }];
  }));
}

export function buildHistoryRecord(report) {
  return {
    timestamp: report.timestamp,
    status: report.status,
    baseUrl: report.baseUrl,
    thresholdMs: report.thresholdMs,
    timeoutMs: report.timeoutMs,
    warmups: report.warmups,
    concurrency: report.concurrency,
    maxPayloadKb: report.maxPayloadKb,
    window: report.window,
    measuredSummary: report.measuredSummary,
  };
}

function ensureParentDirectory(filePath) {
  const directory = path.dirname(filePath);
  if (directory && directory !== '.') {
    mkdirSync(directory, { recursive: true });
  }
}

export function writeReportArtifacts(report, options) {
  if (options.outputJson) {
    ensureParentDirectory(options.outputJson);
    writeFileSync(options.outputJson, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.historyJsonl) {
    ensureParentDirectory(options.historyJsonl);
    appendFileSync(options.historyJsonl, `${JSON.stringify(buildHistoryRecord(report))}\n`);
  }
}

export async function runDashboardApiLatencySmoke(options, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch is unavailable; use Node.js 18+');
  }

  const env = deps.env || process.env;
  const endpoints = options.endpoint
    ? ENDPOINTS.filter((endpoint) => endpoint.name === options.endpoint)
    : ENDPOINTS;
  const warmupResults = [];
  const results = [];

  for (let iteration = 1; iteration <= options.warmups; iteration += 1) {
    for (const endpoint of endpoints) {
      warmupResults.push(await measureEndpoint(endpoint, options, { fetchImpl, env }, {
        enforceLatency: false,
        enforcePayloadBudget: false,
        enforceServerTiming: false,
        phase: 'warmup',
        iteration,
      }));
    }
  }

  for (const endpoint of endpoints) {
    const endpointResults = await measureEndpointConcurrently(endpoint, options, { fetchImpl, env });
    results.push(...endpointResults);
  }

  const warmupsPassed = warmupResults.every((result) => result.passed);
  const measurementsPassed = results.every((result) => result.passed);
  const timestamp = new Date().toISOString();

  return {
    timestamp,
    status: warmupsPassed && measurementsPassed ? 'pass' : 'fail',
    baseUrl: options.baseUrl,
    thresholdMs: options.thresholdMs,
    timeoutMs: options.timeoutMs,
    warmups: options.warmups,
    concurrency: options.concurrency,
    requiredServerTimingPhases: options.requiredServerTimingPhases,
    maxServerTimingPhases: options.maxServerTimingPhases,
    maxPayloadKb: options.maxPayloadKb,
    window: {
      startDate: options.startDate,
      endDate: options.endDate,
      prevStartDate: options.prevStartDate,
      prevEndDate: options.prevEndDate,
    },
    warmupResults,
    results,
    measuredSummary: summarizeMeasuredResults(results),
  };
}

function printHumanReport(report) {
  for (const result of report.warmupResults) {
    const status = result.passed ? 'pass' : 'fail';
    const suffix = result.error ? ` error=${result.error}` : '';
    const timing = result.serverTiming ? ` serverTiming=${JSON.stringify(result.serverTiming)}` : '';
    console.log(
      `[dashboard-api-latency-smoke] ${status} warmup#${result.iteration} ${result.name} status=${result.status} duration=${result.durationMs}ms rows=${result.rowCount} bytes=${result.payloadBytes}${timing}${suffix}`,
    );
  }
  for (const result of report.results) {
    const status = result.passed ? 'pass' : 'fail';
    const suffix = result.error ? ` error=${result.error}` : '';
    const timing = result.serverTiming ? ` serverTiming=${JSON.stringify(result.serverTiming)}` : '';
    const iteration = result.iteration > 0 ? `#${result.iteration}` : '';
    console.log(
      `[dashboard-api-latency-smoke] ${status} measure${iteration} ${result.name} status=${result.status} duration=${result.durationMs}ms threshold=${result.thresholdMs}ms rows=${result.rowCount} bytes=${result.payloadBytes}${timing}${suffix}`,
    );
  }
  console.log(`[dashboard-api-latency-smoke] ${report.status}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const report = await runDashboardApiLatencySmoke(options);
  writeReportArtifacts(report, options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[dashboard-api-latency-smoke] ${error.message}`);
    process.exitCode = 1;
  });
}
