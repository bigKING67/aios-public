#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_HISTORY_JSONL = '.artifacts/dashboard-api-latency/history.jsonl';
const DEFAULT_LAST_COUNT = 20;

function printUsage() {
  console.log(`Usage: node scripts/checks/backend-rust/dashboard-api-latency-history.mjs [options]

Options:
  --history-jsonl <path>              History JSONL file. Default: ${DEFAULT_HISTORY_JSONL}
  --last <count>                      Analyze the last N records. Default: ${DEFAULT_LAST_COUNT}
  --fail-on-p95 <endpoint:ms>         Fail when duration p95 max exceeds ms. Repeatable.
  --fail-on-cache-hit-p95 <endpoint:ms>
                                      Fail when cache_hit p95 max exceeds ms. Repeatable.
  --fail-on-payload-kb <endpoint:kb>  Fail when payload size max exceeds kb. Repeatable.
  --allow-failed-records              Do not fail only because a selected record status is fail.
  --json                              Print machine-readable JSON report.
  --help                             Show this help
`);
}

function readValueArg(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parseBudgetArg(source, flagName, valueLabel = 'ms') {
  const [endpoint, maxMsSource, extra] = source.split(':');
  if (!endpoint || !/^[A-Za-z0-9_-]+$/.test(endpoint)) {
    throw new Error(`${flagName} endpoint must match /^[A-Za-z0-9_-]+$/`);
  }
  if (!maxMsSource || extra !== undefined) {
    throw new Error(`${flagName} must use <endpoint:ms>`);
  }
  const maxMs = Number(maxMsSource);
  if (!Number.isFinite(maxMs) || maxMs < 0) {
    throw new Error(`${flagName} ${valueLabel} budget must be a non-negative number`);
  }
  return { endpoint, maxMs };
}

export function parseArgs(args) {
  const options = {
    historyJsonl: DEFAULT_HISTORY_JSONL,
    last: DEFAULT_LAST_COUNT,
    failOnP95: [],
    failOnCacheHitP95: [],
    failOnPayloadKb: [],
    allowFailedRecords: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--history-jsonl':
        options.historyJsonl = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--last':
        options.last = Number(readValueArg(args, index, arg));
        index += 1;
        break;
      case '--fail-on-p95':
        options.failOnP95.push(parseBudgetArg(readValueArg(args, index, arg), arg));
        index += 1;
        break;
      case '--fail-on-cache-hit-p95':
        options.failOnCacheHitP95.push(parseBudgetArg(readValueArg(args, index, arg), arg));
        index += 1;
        break;
      case '--fail-on-payload-kb':
        options.failOnPayloadKb.push(parseBudgetArg(readValueArg(args, index, arg), arg, 'kb'));
        index += 1;
        break;
      case '--allow-failed-records':
        options.allowFailedRecords = true;
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

  if (!Number.isInteger(options.last) || options.last <= 0) {
    throw new Error('--last must be a positive integer');
  }

  return options;
}

export function readHistoryRecords(historyJsonl) {
  const source = readFileSync(historyJsonl, 'utf8');
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSON at ${historyJsonl}:${index + 1}: ${error.message}`);
      }
    });
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function summarizeSeries(values) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      latest: null,
    };
  }
  return {
    count: finiteValues.length,
    min: Number(Math.min(...finiteValues).toFixed(2)),
    max: Number(Math.max(...finiteValues).toFixed(2)),
    latest: Number(finiteValues[finiteValues.length - 1].toFixed(2)),
  };
}

export function summarizeHistoryRecords(records) {
  const endpoints = {};

  for (const record of records) {
    for (const [endpointName, endpointSummary] of Object.entries(record.measuredSummary ?? {})) {
      endpoints[endpointName] ??= {
        records: 0,
        durationP95Values: [],
        cacheHitP95Values: [],
        payloadBytesValues: [],
        latest: null,
      };
      const endpoint = endpoints[endpointName];
      const durationP95 = finiteNumber(endpointSummary.durationMs?.p95);
      const cacheHitP95 = finiteNumber(endpointSummary.serverTimingPhases?.cache_hit?.p95);
      const payloadBytesMax = finiteNumber(endpointSummary.payloadBytes?.max);

      endpoint.records += 1;
      endpoint.durationP95Values.push(durationP95);
      endpoint.cacheHitP95Values.push(cacheHitP95);
      endpoint.payloadBytesValues.push(payloadBytesMax);
      endpoint.latest = {
        timestamp: record.timestamp ?? null,
        status: record.status ?? null,
        durationP95Ms: durationP95,
        cacheHitP95Ms: cacheHitP95,
        payloadBytes: payloadBytesMax,
      };
    }
  }

  return {
    recordCount: records.length,
    endpoints: Object.fromEntries(Object.entries(endpoints).map(([name, values]) => [name, {
      records: values.records,
      latest: values.latest,
      durationP95Ms: summarizeSeries(values.durationP95Values),
      cacheHitP95Ms: summarizeSeries(values.cacheHitP95Values),
      payloadBytes: summarizeSeries(values.payloadBytesValues),
    }])),
  };
}

function evaluateHistory(summary, records, options) {
  const findings = [];

  if (!options.allowFailedRecords) {
    for (const record of records) {
      if (record.status !== 'pass') {
        findings.push(`history record ${record.timestamp ?? '<unknown timestamp>'} status=${record.status ?? '<missing>'}`);
      }
    }
  }

  for (const { endpoint, maxMs } of options.failOnP95) {
    const value = summary.endpoints[endpoint]?.durationP95Ms?.max;
    if (!Number.isFinite(value)) {
      findings.push(`endpoint ${endpoint} has no numeric duration p95 samples`);
    } else if (value > maxMs) {
      findings.push(`endpoint ${endpoint} duration p95 max ${value}ms exceeds ${maxMs}ms`);
    }
  }

  for (const { endpoint, maxMs } of options.failOnCacheHitP95) {
    const value = summary.endpoints[endpoint]?.cacheHitP95Ms?.max;
    if (!Number.isFinite(value)) {
      findings.push(`endpoint ${endpoint} has no numeric cache_hit p95 samples`);
    } else if (value > maxMs) {
      findings.push(`endpoint ${endpoint} cache_hit p95 max ${value}ms exceeds ${maxMs}ms`);
    }
  }

  for (const { endpoint, maxMs: maxKb } of options.failOnPayloadKb) {
    const value = summary.endpoints[endpoint]?.payloadBytes?.max;
    if (!Number.isFinite(value)) {
      findings.push(`endpoint ${endpoint} has no numeric payload size samples`);
    } else if ((value / 1024) > maxKb) {
      findings.push(`endpoint ${endpoint} payload size max ${Number((value / 1024).toFixed(2))}kB exceeds ${maxKb}kB`);
    }
  }

  return findings;
}

export function runDashboardApiLatencyHistory(options) {
  const records = readHistoryRecords(options.historyJsonl);
  const selectedRecords = records.slice(-options.last);
  const summary = summarizeHistoryRecords(selectedRecords);
  const findings = selectedRecords.length === 0
    ? ['history has no records']
    : evaluateHistory(summary, selectedRecords, options);

  return {
    status: findings.length === 0 ? 'pass' : 'fail',
    historyJsonl: options.historyJsonl,
    totalRecords: records.length,
    analyzedRecords: selectedRecords.length,
    last: options.last,
    checks: {
      failOnP95: options.failOnP95,
      failOnCacheHitP95: options.failOnCacheHitP95,
      failOnPayloadKb: options.failOnPayloadKb,
      allowFailedRecords: options.allowFailedRecords,
    },
    findings,
    summary,
  };
}

function printHumanReport(report) {
  for (const [endpoint, summary] of Object.entries(report.summary.endpoints)) {
    console.log(
      `[dashboard-api-latency-history] ${endpoint} records=${summary.records} durationP95Max=${summary.durationP95Ms.max}ms cacheHitP95Max=${summary.cacheHitP95Ms.max}ms payloadMax=${summary.payloadBytes.max}B latest=${JSON.stringify(summary.latest)}`,
    );
  }
  for (const finding of report.findings) {
    console.log(`[dashboard-api-latency-history] finding=${finding}`);
  }
  console.log(`[dashboard-api-latency-history] ${report.status}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const report = runDashboardApiLatencyHistory(options);
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
  try {
    main();
  } catch (error) {
    console.error(`[dashboard-api-latency-history] ${error.message}`);
    process.exitCode = 1;
  }
}
