#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  runDashboardApiLatencyHistory,
} from './dashboard-api-latency-history.mjs';

const DEFAULT_HISTORY_JSONL = '.artifacts/dashboard-api-latency/history.jsonl';
const DEFAULT_LAST_COUNT = 20;
const DEFAULT_TITLE = 'Dashboard API Latency Report';

function printUsage() {
  console.log(`Usage: node scripts/checks/backend-rust/dashboard-api-latency-history-report.mjs [options]

Options:
  --history-jsonl <path>              History JSONL file. Default: ${DEFAULT_HISTORY_JSONL}
  --last <count>                      Report over the last N records. Default: ${DEFAULT_LAST_COUNT}
  --output-md <path>                  Write markdown report to a file. Defaults to stdout.
  --title <text>                      Markdown title. Default: ${DEFAULT_TITLE}
  --fail-on-p95 <endpoint:ms>         Mark report failed when duration p95 max exceeds ms. Repeatable.
  --fail-on-cache-hit-p95 <endpoint:ms>
                                      Mark report failed when cache_hit p95 max exceeds ms. Repeatable.
  --fail-on-payload-kb <endpoint:kb>  Mark report failed when payload size max exceeds kb. Repeatable.
  --allow-failed-records              Do not fail only because a selected record status is fail.
  --help                              Show this help
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

export function parseReportArgs(args) {
  const options = {
    historyJsonl: DEFAULT_HISTORY_JSONL,
    last: DEFAULT_LAST_COUNT,
    outputMd: null,
    title: DEFAULT_TITLE,
    failOnP95: [],
    failOnCacheHitP95: [],
    failOnPayloadKb: [],
    allowFailedRecords: false,
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
      case '--output-md':
        options.outputMd = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--title':
        options.title = readValueArg(args, index, arg);
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
  if (!options.title.trim()) {
    throw new Error('--title must not be empty');
  }

  return options;
}

function formatCell(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value}ms` : 'N/A';
}

function formatKbFromBytes(value) {
  return Number.isFinite(value) ? `${Number((value / 1024).toFixed(2))}kB` : 'N/A';
}

function formatBudgetList(budgets, unit = 'ms') {
  if (budgets.length === 0) {
    return 'None';
  }
  return budgets.map(({ endpoint, maxMs }) => `${endpoint} <= ${maxMs}${unit}`).join(', ');
}

function renderEndpointTable(endpoints) {
  const entries = Object.entries(endpoints).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return ['_No endpoint samples found._'];
  }

  const lines = [
    '| Endpoint | Records | Latest status | Latest timestamp | Duration p95 latest | Duration p95 max | Cache hit p95 latest | Cache hit p95 max | Payload latest | Payload max |',
    '| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const [endpoint, summary] of entries) {
    lines.push([
      formatCell(endpoint),
      summary.records,
      formatCell(summary.latest?.status),
      formatCell(summary.latest?.timestamp),
      formatMs(summary.durationP95Ms?.latest),
      formatMs(summary.durationP95Ms?.max),
      formatMs(summary.cacheHitP95Ms?.latest),
      formatMs(summary.cacheHitP95Ms?.max),
      formatKbFromBytes(summary.payloadBytes?.latest),
      formatKbFromBytes(summary.payloadBytes?.max),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  return lines;
}

export function renderMarkdownReport(report, {
  title = DEFAULT_TITLE,
  generatedAt = new Date().toISOString(),
} = {}) {
  const findings = report.findings.length === 0
    ? ['- None.']
    : report.findings.map((finding) => `- ${finding}`);

  const lines = [
    `# ${title}`,
    '',
    `- Status: \`${report.status}\``,
    `- Generated at: \`${generatedAt}\``,
    `- History file: \`${report.historyJsonl}\``,
    `- Analyzed records: \`${report.analyzedRecords}\` / \`${report.totalRecords}\``,
    `- Window: last \`${report.last}\` records`,
    '',
    '## Checks',
    '',
    `- Duration p95 budgets: ${formatBudgetList(report.checks.failOnP95 ?? [])}`,
    `- Cache hit p95 budgets: ${formatBudgetList(report.checks.failOnCacheHitP95 ?? [])}`,
    `- Payload size budgets: ${formatBudgetList(report.checks.failOnPayloadKb ?? [], 'kB')}`,
    `- Failed records allowed: ${report.checks.allowFailedRecords ? 'yes' : 'no'}`,
    '',
    '## Findings',
    '',
    ...findings,
    '',
    '## Endpoint Summary',
    '',
    ...renderEndpointTable(report.summary.endpoints),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function writeMarkdownReport(outputMd, markdown) {
  mkdirSync(path.dirname(outputMd), { recursive: true });
  writeFileSync(outputMd, markdown);
}

export function runDashboardApiLatencyHistoryReport(options, {
  now = () => new Date(),
} = {}) {
  const report = runDashboardApiLatencyHistory({
    historyJsonl: options.historyJsonl,
    last: options.last,
    failOnP95: options.failOnP95,
    failOnCacheHitP95: options.failOnCacheHitP95,
    failOnPayloadKb: options.failOnPayloadKb,
    allowFailedRecords: options.allowFailedRecords,
    json: false,
    help: false,
  });
  const markdown = renderMarkdownReport(report, {
    title: options.title,
    generatedAt: now().toISOString(),
  });

  if (options.outputMd) {
    writeMarkdownReport(options.outputMd, markdown);
  }

  return { report, markdown };
}

function main() {
  const options = parseReportArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const { report, markdown } = runDashboardApiLatencyHistoryReport(options);
  if (options.outputMd) {
    console.log(`[dashboard-api-latency-history-report] wrote ${options.outputMd}`);
  } else {
    process.stdout.write(markdown);
  }
  if (report.status !== 'pass') {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[dashboard-api-latency-history-report] ${error.message}`);
    process.exitCode = 1;
  }
}
