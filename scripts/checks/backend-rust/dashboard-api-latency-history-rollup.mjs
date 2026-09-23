#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  readHistoryRecords,
  summarizeHistoryRecords,
} from './dashboard-api-latency-history.mjs';

const DEFAULT_HISTORY_JSONL = '.artifacts/dashboard-api-latency/history.jsonl';
const DEFAULT_LAST_PERIODS = 7;
const DEFAULT_TITLE = 'Dashboard API Latency Rollup';
const VALID_PERIODS = new Set(['day', 'week']);

function printUsage() {
  console.log(`Usage: node scripts/checks/backend-rust/dashboard-api-latency-history-rollup.mjs [options]

Options:
  --history-jsonl <path>              History JSONL file. Default: ${DEFAULT_HISTORY_JSONL}
  --period <day|week>                 Rollup period. Default: day
  --last-periods <count>              Analyze the last N periods. Default: ${DEFAULT_LAST_PERIODS}
  --output-md <path>                  Write markdown rollup to a file. Defaults to stdout.
  --title <text>                      Markdown title. Default: ${DEFAULT_TITLE}
  --fail-on-p95 <endpoint:ms>         Mark report failed when duration p95 period max exceeds ms. Repeatable.
  --fail-on-cache-hit-p95 <endpoint:ms>
                                      Mark report failed when cache_hit p95 period max exceeds ms. Repeatable.
  --fail-on-payload-kb <endpoint:kb>  Mark report failed when payload size period max exceeds kb. Repeatable.
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

export function parseRollupArgs(args) {
  const options = {
    historyJsonl: DEFAULT_HISTORY_JSONL,
    period: 'day',
    lastPeriods: DEFAULT_LAST_PERIODS,
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
      case '--period':
        options.period = readValueArg(args, index, arg);
        index += 1;
        break;
      case '--last-periods':
        options.lastPeriods = Number(readValueArg(args, index, arg));
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

  if (!VALID_PERIODS.has(options.period)) {
    throw new Error('--period must be day or week');
  }
  if (!Number.isInteger(options.lastPeriods) || options.lastPeriods <= 0) {
    throw new Error('--last-periods must be a positive integer');
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

function toUtcDayStart(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toUtcWeekStart(date) {
  const dayStart = toUtcDayStart(date);
  const day = new Date(dayStart).getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  return dayStart - (mondayOffset * 24 * 60 * 60 * 1000);
}

function formatUtcDate(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function periodBoundsForTimestamp(timestamp, period) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const startMs = period === 'week' ? toUtcWeekStart(date) : toUtcDayStart(date);
  const durationDays = period === 'week' ? 7 : 1;
  const endMs = startMs + (durationDays * 24 * 60 * 60 * 1000) - 1;
  const label = period === 'week'
    ? `${formatUtcDate(startMs)}..${formatUtcDate(endMs)}`
    : formatUtcDate(startMs);

  return {
    key: String(startMs),
    label,
    startMs,
    endMs,
  };
}

function groupRecordsByPeriod(records, period) {
  const groups = new Map();
  const invalidTimestampFindings = [];

  records.forEach((record, index) => {
    const bounds = periodBoundsForTimestamp(record.timestamp, period);
    if (!bounds) {
      invalidTimestampFindings.push(`history record #${index + 1} has invalid timestamp ${record.timestamp ?? '<missing>'}`);
      return;
    }

    const existing = groups.get(bounds.key) ?? {
      ...bounds,
      records: [],
    };
    existing.records.push(record);
    groups.set(bounds.key, existing);
  });

  return {
    groups: Array.from(groups.values()).sort((left, right) => left.startMs - right.startMs),
    invalidTimestampFindings,
  };
}

function evaluatePeriod(periodRollup, options) {
  const findings = [];

  if (!options.allowFailedRecords) {
    for (const record of periodRollup.records) {
      if (record.status !== 'pass') {
        findings.push(`${periodRollup.label} history record ${record.timestamp ?? '<unknown timestamp>'} status=${record.status ?? '<missing>'}`);
      }
    }
  }

  for (const { endpoint, maxMs } of options.failOnP95) {
    const value = periodRollup.summary.endpoints[endpoint]?.durationP95Ms?.max;
    if (!Number.isFinite(value)) {
      findings.push(`${periodRollup.label} endpoint ${endpoint} has no numeric duration p95 samples`);
    } else if (value > maxMs) {
      findings.push(`${periodRollup.label} endpoint ${endpoint} duration p95 max ${value}ms exceeds ${maxMs}ms`);
    }
  }

  for (const { endpoint, maxMs } of options.failOnCacheHitP95) {
    const value = periodRollup.summary.endpoints[endpoint]?.cacheHitP95Ms?.max;
    if (!Number.isFinite(value)) {
      findings.push(`${periodRollup.label} endpoint ${endpoint} has no numeric cache_hit p95 samples`);
    } else if (value > maxMs) {
      findings.push(`${periodRollup.label} endpoint ${endpoint} cache_hit p95 max ${value}ms exceeds ${maxMs}ms`);
    }
  }

  for (const { endpoint, maxMs: maxKb } of options.failOnPayloadKb) {
    const value = periodRollup.summary.endpoints[endpoint]?.payloadBytes?.max;
    if (!Number.isFinite(value)) {
      findings.push(`${periodRollup.label} endpoint ${endpoint} has no numeric payload size samples`);
    } else if ((value / 1024) > maxKb) {
      findings.push(`${periodRollup.label} endpoint ${endpoint} payload size max ${Number((value / 1024).toFixed(2))}kB exceeds ${maxKb}kB`);
    }
  }

  return findings;
}

function formatSignedMs(value) {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }
  const rounded = Number(value.toFixed(2));
  return `${rounded >= 0 ? '+' : ''}${rounded}ms`;
}

function compareLatestToPreviousPeriod(periods) {
  if (periods.length < 2) {
    return [];
  }

  const previous = periods[periods.length - 2];
  const latest = periods[periods.length - 1];
  const endpointNames = Object.keys(latest.summary.endpoints).sort((left, right) => left.localeCompare(right));
  const notes = [];

  for (const endpoint of endpointNames) {
    const latestMax = latest.summary.endpoints[endpoint]?.durationP95Ms?.max;
    const previousMax = previous.summary.endpoints[endpoint]?.durationP95Ms?.max;
    if (!Number.isFinite(latestMax) || !Number.isFinite(previousMax)) {
      continue;
    }

    const delta = latestMax - previousMax;
    const ratio = previousMax === 0 ? null : (delta / previousMax);
    if (Math.abs(delta) < 1) {
      continue;
    }

    const direction = delta > 0 ? 'increased' : 'decreased';
    const ratioText = Number.isFinite(ratio) ? ` (${(ratio * 100).toFixed(1)}%)` : '';
    notes.push(`${endpoint} duration p95 max ${direction} ${formatSignedMs(delta)}${ratioText} vs previous ${previous.label}`);
  }

  return notes;
}

function buildPeriodRollups(records, options) {
  const { groups, invalidTimestampFindings } = groupRecordsByPeriod(records, options.period);
  const selectedGroups = groups.slice(-options.lastPeriods);
  const periods = selectedGroups.map((group) => {
    const summary = summarizeHistoryRecords(group.records);
    return {
      label: group.label,
      startMs: group.startMs,
      endMs: group.endMs,
      records: group.records,
      failedRecords: group.records.filter((record) => record.status !== 'pass').length,
      latestRecord: group.records[group.records.length - 1] ?? null,
      summary,
    };
  });

  const periodFindings = periods.flatMap((periodRollup) => evaluatePeriod(periodRollup, options));
  const findings = [
    ...invalidTimestampFindings,
    ...(records.length === 0 ? ['history has no records'] : []),
    ...(selectedGroups.length === 0 && records.length > 0 ? [`history has no valid ${options.period} periods`] : []),
    ...periodFindings,
  ];

  return {
    periods,
    findings,
    trendNotes: compareLatestToPreviousPeriod(periods),
  };
}

function renderPeriodTable(periods) {
  if (periods.length === 0) {
    return ['_No period samples found._'];
  }

  const lines = [
    '| Period | Records | Failed records | Endpoint | Duration p95 latest | Duration p95 max | Cache hit p95 latest | Cache hit p95 max | Payload latest | Payload max | Latest timestamp | Latest status |',
    '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];

  for (const period of periods) {
    const endpointEntries = Object.entries(period.summary.endpoints)
      .sort(([left], [right]) => left.localeCompare(right));

    if (endpointEntries.length === 0) {
      lines.push([
        formatCell(period.label),
        period.records.length,
        period.failedRecords,
        'N/A',
        'N/A',
        'N/A',
        'N/A',
        'N/A',
        'N/A',
        'N/A',
        formatCell(period.latestRecord?.timestamp),
        formatCell(period.latestRecord?.status),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
      continue;
    }

    for (const [endpoint, summary] of endpointEntries) {
      lines.push([
        formatCell(period.label),
        period.records.length,
        period.failedRecords,
        formatCell(endpoint),
        formatMs(summary.durationP95Ms?.latest),
        formatMs(summary.durationP95Ms?.max),
        formatMs(summary.cacheHitP95Ms?.latest),
        formatMs(summary.cacheHitP95Ms?.max),
        formatKbFromBytes(summary.payloadBytes?.latest),
        formatKbFromBytes(summary.payloadBytes?.max),
        formatCell(summary.latest?.timestamp),
        formatCell(summary.latest?.status),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
  }

  return lines;
}

export function renderMarkdownRollup(report, {
  title = DEFAULT_TITLE,
  generatedAt = new Date().toISOString(),
} = {}) {
  const findings = report.findings.length === 0
    ? ['- None.']
    : report.findings.map((finding) => `- ${finding}`);
  const trendNotes = report.trendNotes.length === 0
    ? ['- None.']
    : report.trendNotes.map((note) => `- ${note}`);

  const lines = [
    `# ${title}`,
    '',
    `- Status: \`${report.status}\``,
    `- Generated at: \`${generatedAt}\``,
    `- History file: \`${report.historyJsonl}\``,
    `- Period: \`${report.period}\``,
    `- Period count: \`${report.periodCount}\` / last \`${report.lastPeriods}\` periods`,
    `- Analyzed records: \`${report.analyzedRecords}\` / \`${report.totalRecords}\``,
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
    '## Trend Notes',
    '',
    ...trendNotes,
    '',
    '## Period Summary',
    '',
    ...renderPeriodTable(report.periods),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function writeMarkdownReport(outputMd, markdown) {
  mkdirSync(path.dirname(outputMd), { recursive: true });
  writeFileSync(outputMd, markdown);
}

export function runDashboardApiLatencyHistoryRollup(options, {
  now = () => new Date(),
} = {}) {
  const records = readHistoryRecords(options.historyJsonl);
  const { periods, findings, trendNotes } = buildPeriodRollups(records, options);
  const analyzedRecords = periods.reduce((total, period) => total + period.records.length, 0);
  const report = {
    status: findings.length === 0 ? 'pass' : 'fail',
    historyJsonl: options.historyJsonl,
    totalRecords: records.length,
    analyzedRecords,
    period: options.period,
    lastPeriods: options.lastPeriods,
    periodCount: periods.length,
    checks: {
      failOnP95: options.failOnP95,
      failOnCacheHitP95: options.failOnCacheHitP95,
      failOnPayloadKb: options.failOnPayloadKb,
      allowFailedRecords: options.allowFailedRecords,
    },
    findings,
    trendNotes,
    periods,
  };
  const markdown = renderMarkdownRollup(report, {
    title: options.title,
    generatedAt: now().toISOString(),
  });

  if (options.outputMd) {
    writeMarkdownReport(options.outputMd, markdown);
  }

  return { report, markdown };
}

function main() {
  const options = parseRollupArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const { report, markdown } = runDashboardApiLatencyHistoryRollup(options);
  if (options.outputMd) {
    console.log(`[dashboard-api-latency-history-rollup] wrote ${options.outputMd}`);
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
    console.error(`[dashboard-api-latency-history-rollup] ${error.message}`);
    process.exitCode = 1;
  }
}
